use cookbook_ai::{
    AiError, ApiError, GeminiConfig, Request as GeminiRequest, Response as GeminiResponse,
    chat_request, endpoint, import_request, parse_chat, parse_import, parse_import_response,
};
use serde_json::json;
use worker::{Date, Env, Fetch, Headers, Method, Request, RequestInit, Response, Result};

use crate::{
    auth::{self, AuthError},
    cors,
    limits::{self, Limits, Route},
};

const KV_BINDING: &str = "RATE_LIMIT";
const KV_TTL_SECONDS: u64 = 2 * limits::WINDOW_SECONDS;

fn text_var(env: &Env, name: &str) -> Option<String> {
    env.var(name).ok().map(|v| v.to_string())
}

fn from_ai(error: &AiError) -> ApiError {
    ApiError::from(error)
}

fn unavailable() -> ApiError {
    ApiError::new(
        503,
        "not_configured",
        "The sous-chef is not set up properly at the moment. Please tell Antonio.",
    )
}

fn json_response(status: u16, body: &str) -> Result<Response> {
    let mut response = Response::ok(body)?.with_status(status);
    response
        .headers_mut()
        .set("Content-Type", "application/json")?;
    response.headers_mut().set("Cache-Control", "no-store")?;
    Ok(response)
}

fn error_response(error: &ApiError) -> Result<Response> {
    json_response(error.status, &error.body())
}

fn now_ms() -> u64 {
    Date::now().as_millis()
}

pub async fn handle(mut req: Request, env: Env) -> Result<Response> {
    let allowed = cors::parse_origins(&text_var(&env, "ALLOWED_ORIGINS").unwrap_or_default());
    let origin = req.headers().get("Origin")?;
    let permitted = origin.as_deref().filter(|o| cors::is_allowed(&allowed, o));

    if req.method() == Method::Options {
        let Some(origin) = permitted else {
            return Response::empty().map(|r| r.with_status(403));
        };
        let mut response = Response::empty()?.with_status(204);
        for (name, value) in cors::preflight_headers(origin) {
            response.headers_mut().set(name, &value)?;
        }
        return Ok(response);
    }

    let outcome = if origin.is_some() && permitted.is_none() {
        Err(ApiError::new(
            403,
            "forbidden_origin",
            "This site is not allowed to use the sous-chef.",
        ))
    } else {
        route(&mut req, &env).await
    };

    let mut response = match outcome {
        Ok(response) => response,
        Err(error) => {
            let mut response = error_response(&error)?;
            if let Some(seconds) = error.retry_after {
                response
                    .headers_mut()
                    .set("Retry-After", &seconds.to_string())?;
            }
            response
        }
    };
    if let Some(origin) = permitted {
        for (name, value) in cors::response_headers(origin) {
            response.headers_mut().set(name, &value)?;
        }
    }
    Ok(response)
}

async fn route(req: &mut Request, env: &Env) -> std::result::Result<Response, ApiError> {
    let path = req.path();
    let kind = match path.trim_end_matches('/') {
        "/chat" => Route::Chat,
        "/import" => Route::Import,
        _ => return Err(ApiError::new(404, "not_found", "There is nothing here.")),
    };
    if req.method() != Method::Post {
        return Err(ApiError::new(405, "method_not_allowed", "Use POST."));
    }

    if kind == Route::Import {
        let secret = text_var(env, "ADMIN_IMPORT_SECRET").ok_or_else(unavailable)?;
        let proof = req.headers().get("X-Admin-Proof").ok().flatten();
        auth::verify(&secret, proof.as_deref(), now_ms()).map_err(|e| match e {
            AuthError::Expired => {
                ApiError::new(401, "proof_expired", "Unlock editing again and retry.")
            }
            _ => ApiError::new(401, "unauthorised", "Importing is for the editor only."),
        })?;
    }

    rate_limit(req, env, kind).await?;

    let declared = req
        .headers()
        .get("Content-Length")
        .ok()
        .flatten()
        .and_then(|v| v.parse().ok());
    let body = req
        .bytes()
        .await
        .map_err(|_| ApiError::new(400, "bad_request", "The request could not be read."))?;
    let config = GeminiConfig::from_lookup(|name| text_var(env, name));

    let body = match kind {
        Route::Chat => {
            let input = parse_chat(declared, &body)?;
            let request = chat_request(&config, &input.recipe, &input.history, &input.question);
            let reply = gemini(env, &config, &request)
                .await?
                .reply()
                .map_err(|e| from_ai(&e))?;
            json!({ "reply": reply.text, "truncated": reply.truncated })
        }
        Route::Import => {
            let text = parse_import(declared, &body)?;
            let request = import_request(&config, &text);
            let reply = gemini(env, &config, &request)
                .await?
                .reply()
                .map_err(|e| from_ai(&e))?;
            if reply.truncated {
                return Err(from_ai(&AiError::Truncated));
            }
            let imported = parse_import_response(&reply.text).map_err(|e| from_ai(&e))?;
            json!({ "recipe": imported.recipe, "checks": imported.checks })
        }
    };
    json_response(200, &body.to_string()).map_err(|_| unavailable())
}

async fn rate_limit(req: &Request, env: &Env, kind: Route) -> std::result::Result<(), ApiError> {
    let ip = req
        .headers()
        .get("CF-Connecting-IP")
        .ok()
        .flatten()
        .unwrap_or_else(|| "unknown".to_owned());
    let limit = Limits::from_lookup(|name| text_var(env, name)).for_route(kind);
    let now = now_ms() / 1000;
    let kv = env.kv(KV_BINDING).map_err(|_| unavailable())?;
    let key = limits::window_key(kind, &ip, now);
    let count = kv
        .get(&key)
        .text()
        .await
        .map_err(|_| unavailable())?
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);
    match limits::admit(count, limit, now) {
        Ok(next) => {
            kv.put(&key, next.to_string())
                .map_err(|_| unavailable())?
                .expiration_ttl(KV_TTL_SECONDS)
                .execute()
                .await
                .map_err(|_| unavailable())?;
            Ok(())
        }
        Err(wait) => Err(ApiError::new(
            429,
            "rate_limited",
            format!(
                "That is enough for now. Try again in {} minutes.",
                wait.div_ceil(60)
            ),
        )
        .retry_after(wait)),
    }
}

async fn gemini(
    env: &Env,
    config: &GeminiConfig,
    request: &GeminiRequest,
) -> std::result::Result<GeminiResponse, ApiError> {
    let key = env
        .secret("GEMINI_API_KEY")
        .map_err(|_| unavailable())?
        .to_string();
    let headers = Headers::new();
    headers
        .set("Content-Type", "application/json")
        .map_err(|_| unavailable())?;
    headers
        .set("x-goog-api-key", &key)
        .map_err(|_| unavailable())?;
    let payload = serde_json::to_string(request).map_err(|_| unavailable())?;
    let mut init = RequestInit::new();
    init.with_method(Method::Post)
        .with_headers(headers)
        .with_body(Some(payload.into()));
    let outgoing =
        Request::new_with_init(&endpoint(&config.model), &init).map_err(|_| unavailable())?;
    let mut response = Fetch::Request(outgoing)
        .send()
        .await
        .map_err(|_| from_ai(&AiError::Unavailable))?;
    let status = response.status_code();
    let text = response
        .text()
        .await
        .map_err(|_| from_ai(&AiError::Unavailable))?;
    if !(200..300).contains(&status) {
        return Err(from_ai(&AiError::from_response(status, &text)));
    }
    GeminiResponse::from_json(&text).map_err(|e| from_ai(&e))
}
