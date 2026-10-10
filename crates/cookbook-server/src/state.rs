use std::{
    future::Future,
    io,
    net::SocketAddr,
    path::Path,
    pin::Pin,
    sync::{Arc, Mutex, RwLock},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use axum::{
    Json,
    extract::{ConnectInfo, FromRequestParts},
    http::{HeaderMap, StatusCode, header, request::Parts},
    response::{IntoResponse, Response},
};
use cookbook_ai::{AiError, Request as GeminiRequest, Response as GeminiResponse, endpoint};
use cookbook_core::{CheckResult, Collection, Site, build_site};
use serde_json::{Value, json};

use crate::{
    auth::{self, Limiter},
    config::Config,
};

const LOGIN_ATTEMPTS: u32 = 5;
const LOGIN_WINDOW: Duration = Duration::from_secs(15 * 60);
const AI_REQUESTS: u32 = 30;
const IMPORT_REQUESTS: u32 = 5;
const AI_WINDOW: Duration = Duration::from_secs(60 * 60);

/// The Gemini call, behind a trait so that tests never touch the network.
pub trait Gemini: Send + Sync {
    fn generate<'a>(
        &'a self,
        request: &'a GeminiRequest,
    ) -> Pin<Box<dyn Future<Output = Result<GeminiResponse, AiError>> + Send + 'a>>;
}

pub struct HttpGemini {
    client: reqwest::Client,
    key: String,
    model: String,
}

impl HttpGemini {
    pub fn new(key: String, model: String) -> Result<Self, String> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(60))
            .build()
            .map_err(|e| e.to_string())?;
        Ok(Self { client, key, model })
    }
}

impl Gemini for HttpGemini {
    fn generate<'a>(
        &'a self,
        request: &'a GeminiRequest,
    ) -> Pin<Box<dyn Future<Output = Result<GeminiResponse, AiError>> + Send + 'a>> {
        Box::pin(async move {
            let response = self
                .client
                .post(endpoint(&self.model))
                .header("x-goog-api-key", &self.key)
                .json(request)
                .send()
                .await
                .map_err(|_| AiError::Unavailable)?;
            let status = response.status().as_u16();
            let body = response.text().await.map_err(|_| AiError::Unavailable)?;
            if !(200..300).contains(&status) {
                return Err(AiError::from_response(status, &body));
            }
            GeminiResponse::from_json(&body)
        })
    }
}

pub struct Snapshot {
    pub collection: Collection,
    pub site: Site,
}

pub fn load_snapshot(recipes_dir: &Path) -> io::Result<Snapshot> {
    let loaded = cookbook_tree::load(recipes_dir)?;
    let site = build_site(&loaded.collection);
    Ok(Snapshot {
        collection: loaded.collection,
        site,
    })
}

pub struct AppState {
    pub config: Config,
    pub gemini: Option<Arc<dyn Gemini>>,
    snapshot: RwLock<Arc<Snapshot>>,
    /// Held while a change is checked, written and reloaded, so edits never interleave.
    pub write_lock: tokio::sync::Mutex<()>,
    pub logins: Mutex<Limiter>,
    pub chats: Mutex<Limiter>,
    pub imports: Mutex<Limiter>,
}

impl AppState {
    pub fn new(config: Config, gemini: Option<Arc<dyn Gemini>>) -> io::Result<Arc<Self>> {
        let snapshot = load_snapshot(&config.recipes_dir())?;
        Ok(Arc::new(Self {
            config,
            gemini,
            snapshot: RwLock::new(Arc::new(snapshot)),
            write_lock: tokio::sync::Mutex::new(()),
            logins: Mutex::new(Limiter::new(LOGIN_ATTEMPTS, LOGIN_WINDOW)),
            chats: Mutex::new(Limiter::new(AI_REQUESTS, AI_WINDOW)),
            imports: Mutex::new(Limiter::new(IMPORT_REQUESTS, AI_WINDOW)),
        }))
    }

    pub fn snapshot(&self) -> Arc<Snapshot> {
        self.snapshot
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone()
    }

    /// Rereads the tree from disc, which also picks up edits made outside the server.
    pub async fn reload(&self) -> Result<(), Failure> {
        let dir = self.config.recipes_dir();
        let snapshot = tokio::task::spawn_blocking(move || load_snapshot(&dir))
            .await
            .map_err(|_| Failure::internal())?
            .map_err(|_| Failure::internal())?;
        *self
            .snapshot
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = Arc::new(snapshot);
        Ok(())
    }

    /// Commits the given paths (relative to the repository root) when `GIT_COMMIT` is on.
    pub async fn commit(&self, paths: &[String], message: &str) {
        if !self.config.git_commit {
            return;
        }
        let root = &self.config.root;
        let mut add = tokio::process::Command::new("git");
        add.arg("-C")
            .arg(root)
            .args(["add", "-A", "--"])
            .args(paths);
        let mut commit = tokio::process::Command::new("git");
        commit
            .arg("-C")
            .arg(root)
            .args(["commit", "-q", "-m", message, "--"])
            .args(paths);
        for mut command in [add, commit] {
            match command.output().await {
                Ok(output) if output.status.success() => {}
                Ok(output) => {
                    eprintln!(
                        "git failed: {}",
                        String::from_utf8_lossy(&output.stderr).trim()
                    );
                    return;
                }
                Err(error) => {
                    eprintln!("cannot run git: {error}");
                    return;
                }
            }
        }
    }
}

pub fn now_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_secs())
}

/// The caller's address: the proxy's header when it is trusted, otherwise the socket.
pub fn client_key(parts: &Parts, trust_proxy: bool) -> String {
    let forwarded = trust_proxy
        .then(|| parts.headers.get("x-forwarded-for"))
        .flatten()
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.rsplit(',').next())
        .map(|v| v.trim().to_owned())
        .filter(|v| !v.is_empty());
    forwarded
        .or_else(|| {
            parts
                .extensions
                .get::<ConnectInfo<SocketAddr>>()
                .map(|c| c.0.ip().to_string())
        })
        .unwrap_or_else(|| "unknown".to_owned())
}

/// An error response: a status and a JSON body of `{ error, message }`, plus `results` for checklist failures.
#[derive(Debug)]
pub struct Failure {
    pub status: StatusCode,
    pub body: Value,
    pub retry_after: Option<u64>,
}

impl Failure {
    pub fn new(status: StatusCode, error: &str, message: &str) -> Self {
        Self {
            status,
            body: json!({ "error": error, "message": message }),
            retry_after: None,
        }
    }

    pub fn checks(status: StatusCode, error: &str, message: &str, results: &[CheckResult]) -> Self {
        Self {
            status,
            body: json!({ "error": error, "message": message, "results": results }),
            retry_after: None,
        }
    }

    pub fn internal() -> Self {
        Self::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal",
            "Something went wrong on the server.",
        )
    }

    pub fn not_found() -> Self {
        Self::new(StatusCode::NOT_FOUND, "not_found", "There is nothing here.")
    }

    pub fn invalid_id() -> Self {
        Self::new(
            StatusCode::BAD_REQUEST,
            "invalid_id",
            "That path is not valid.",
        )
    }

    pub fn limited(wait: u64, message: &str) -> Self {
        Self {
            retry_after: Some(wait),
            ..Self::new(StatusCode::TOO_MANY_REQUESTS, "rate_limited", message)
        }
    }
}

impl IntoResponse for Failure {
    fn into_response(self) -> Response {
        let mut response = (self.status, Json(self.body)).into_response();
        if let Some(seconds) = self.retry_after
            && let Ok(value) = seconds.to_string().parse()
        {
            response.headers_mut().insert(header::RETRY_AFTER, value);
        }
        response
    }
}

impl From<cookbook_ai::ApiError> for Failure {
    fn from(error: cookbook_ai::ApiError) -> Self {
        Self::new(
            StatusCode::from_u16(error.status).unwrap_or(StatusCode::BAD_REQUEST),
            error.error,
            &error.message,
        )
    }
}

impl From<&AiError> for Failure {
    fn from(error: &AiError) -> Self {
        cookbook_ai::ApiError::from(error).into()
    }
}

pub fn session_valid(state: &AppState, headers: &HeaderMap) -> bool {
    headers
        .get(header::COOKIE)
        .and_then(|v| v.to_str().ok())
        .and_then(auth::token_from_cookies)
        .is_some_and(|token| auth::is_valid(&state.config.session_secret, token, now_seconds()))
}

/// Present on handlers that need a signed-in editor.
pub struct Authed;

impl FromRequestParts<Arc<AppState>> for Authed {
    type Rejection = Failure;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &Arc<AppState>,
    ) -> Result<Self, Self::Rejection> {
        if session_valid(state, &parts.headers) {
            Ok(Authed)
        } else {
            Err(Failure::new(
                StatusCode::UNAUTHORIZED,
                "unauthorised",
                "Unlock editing first.",
            ))
        }
    }
}
