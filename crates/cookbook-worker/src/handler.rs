use std::time::Duration;

use cookbook_ai::{
    ATTEMPTS_PER_MODEL, AiError, ApiError, GeminiConfig, Recipe, Relay, Request as GeminiRequest,
    Response as GeminiResponse, backoff_ms, chat_request, endpoint, import_request, parse_chat,
    parse_import, parse_import_response, parse_site_recipe, site_recipe_url, stream_endpoint,
    unknown_recipe,
};
use futures_util::{StreamExt, stream};
use serde_json::json;
use worker::{
    ByteStream, Date, Delay, Env, Fetch, Headers, Method, Request, RequestInit, Response, Result,
    console_error, js_sys,
};

use crate::{
    auth::{self, AuthError},
    cors,
    limits::{self, Limits, Route},
    turnstile,
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

    if kind == Route::Chat {
        human(req, env).await?;
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
            // A recipe kept on the cook's device is not on the site, so its copy in the request is
            // used; a published recipe always comes from the site.
            let recipe = match site_recipe(env, &input.recipe_id).await {
                Err(error) if error.status == 404 => input.own_recipe()?,
                found => found?,
            };
            let request = chat_request(&config, &recipe, &input.history, &input.question);
            let upstream = gemini(env, &config, &request, true).await?;
            return relay(upstream).map_err(|_| unavailable());
        }
        Route::Import => {
            let text = parse_import(declared, &body)?;
            let request = import_request(&config, &text);
            let mut upstream = gemini(env, &config, &request, false).await?;
            let answer = upstream
                .text()
                .await
                .map_err(|_| from_ai(&AiError::Unavailable))?;
            let reply = GeminiResponse::from_json(&answer)
                .and_then(|response| response.reply())
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

/// The recipe comes from the deployed site's public data, never from the request body.
async fn site_recipe(env: &Env, recipe_id: &str) -> std::result::Result<Recipe, ApiError> {
    let site = text_var(env, "SITE_URL").ok_or_else(unavailable)?;
    let outgoing =
        Request::new(&site_recipe_url(&site, recipe_id), Method::Get).map_err(|_| unavailable())?;
    let mut response = Fetch::Request(outgoing)
        .send()
        .await
        .map_err(|_| from_ai(&AiError::Unavailable))?;
    match response.status_code() {
        200 => parse_site_recipe(&response.text().await.map_err(|_| unavailable())?),
        404 => Err(unknown_recipe()),
        _ => Err(from_ai(&AiError::Unavailable)),
    }
}

/// Checks the Turnstile token when `TURNSTILE_SECRET` is set; without the secret anyone may ask.
async fn human(req: &Request, env: &Env) -> std::result::Result<(), ApiError> {
    let Some(secret) = env.secret("TURNSTILE_SECRET").ok().map(|s| s.to_string()) else {
        return Ok(());
    };
    let refused = || {
        ApiError::new(
            403,
            "turnstile",
            "The sous-chef could not check that you are a person. Reload the page and ask again.",
        )
    };
    let header = req.headers().get(turnstile::HEADER).ok().flatten();
    let token = turnstile::usable(header.as_deref()).ok_or_else(refused)?;
    let ip = req.headers().get("CF-Connecting-IP").ok().flatten();
    let headers = Headers::new();
    headers
        .set("Content-Type", "application/x-www-form-urlencoded")
        .map_err(|_| unavailable())?;
    let mut init = RequestInit::new();
    init.with_method(Method::Post)
        .with_headers(headers)
        .with_body(Some(
            turnstile::form_body(&secret, token, ip.as_deref()).into(),
        ));
    let outgoing =
        Request::new_with_init(turnstile::VERIFY_URL, &init).map_err(|_| unavailable())?;
    let answer = match Fetch::Request(outgoing).send().await {
        Ok(mut response) => response.text().await.unwrap_or_default(),
        Err(error) => {
            console_error!("turnstile: siteverify could not be reached: {error}");
            return Err(from_ai(&AiError::Unavailable));
        }
    };
    if turnstile::passed(&answer) {
        Ok(())
    } else {
        Err(refused())
    }
}

/// Relays Gemini's streamed answer to the browser as `delta` events and a closing `done`, or an
/// `error` event when the answer breaks off.
fn relay(mut upstream: Response) -> Result<Response> {
    let chunks = upstream.stream()?;
    let events = stream::unfold(
        Some((chunks, Relay::new())),
        |state: Option<(ByteStream, Relay)>| async move {
            let (mut chunks, mut relay) = state?;
            let (out, more) = match chunks.next().await {
                Some(Ok(bytes)) => (relay.push(&bytes), true),
                Some(Err(error)) => {
                    console_error!("gemini: the stream broke off: {error}");
                    (relay.fail(&AiError::Unavailable), false)
                }
                None => (relay.end(), false),
            };
            let next = more.then_some((chunks, relay));
            Some((Ok::<Vec<u8>, worker::Error>(out.into_bytes()), next))
        },
    );
    let mut response = Response::from_stream(events)?;
    let headers = response.headers_mut();
    headers.set("Content-Type", "text/event-stream; charset=utf-8")?;
    headers.set("Cache-Control", "no-store")?;
    Ok(response)
}

enum Refusal {
    /// The model does not take the thinking level that was asked for.
    Thinking,
    Ai(AiError),
}

/// Calls Gemini and returns its successful response unread. A busy model is asked again after a
/// short, jittered wait, then the fallback model is tried, so several cooks asking at once are
/// served in turn instead of being told the sous-chef is unavailable.
async fn gemini(
    env: &Env,
    config: &GeminiConfig,
    request: &GeminiRequest,
    streamed: bool,
) -> std::result::Result<Response, ApiError> {
    let key = env
        .secret("GEMINI_API_KEY")
        .map_err(|_| unavailable())?
        .to_string();
    let mut request = request.clone();
    let mut last = AiError::Unavailable;
    for model in config.models() {
        let url = if streamed {
            stream_endpoint(model)
        } else {
            endpoint(model)
        };
        let mut attempt = 0;
        while attempt < ATTEMPTS_PER_MODEL {
            match send(&key, &url, &request).await {
                Ok(response) => return Ok(response),
                Err(Refusal::Thinking) => match request.without_thinking() {
                    Some(plain) => {
                        console_error!(
                            "gemini: {model} refused the thinking level; asking without it"
                        );
                        request = plain;
                    }
                    None => return Err(from_ai(&AiError::Unavailable)),
                },
                Err(Refusal::Ai(error)) => {
                    console_error!("gemini: {model} attempt {} failed: {error:?}", attempt + 1);
                    if !error.is_retryable() {
                        return Err(from_ai(&error));
                    }
                    last = error;
                    attempt += 1;
                    if attempt < ATTEMPTS_PER_MODEL {
                        let wait = backoff_ms(attempt - 1, js_sys::Math::random());
                        Delay::from(Duration::from_millis(wait)).await;
                    }
                }
            }
        }
    }
    Err(from_ai(&last))
}

async fn send(
    key: &str,
    url: &str,
    request: &GeminiRequest,
) -> std::result::Result<Response, Refusal> {
    let failed = |_| Refusal::Ai(AiError::Unavailable);
    let headers = Headers::new();
    headers
        .set("Content-Type", "application/json")
        .map_err(failed)?;
    headers.set("x-goog-api-key", key).map_err(failed)?;
    let payload = serde_json::to_string(request).map_err(|_| Refusal::Ai(AiError::Unavailable))?;
    let mut init = RequestInit::new();
    init.with_method(Method::Post)
        .with_headers(headers)
        .with_body(Some(payload.into()));
    let outgoing = Request::new_with_init(url, &init).map_err(failed)?;
    let mut response = Fetch::Request(outgoing).send().await.map_err(failed)?;
    let status = response.status_code();
    if (200..300).contains(&status) {
        return Ok(response);
    }
    let text = response.text().await.unwrap_or_default();
    console_error!(
        "gemini: {status}: {}",
        text.chars().take(500).collect::<String>()
    );
    if AiError::refuses_thinking(status, &text) {
        return Err(Refusal::Thinking);
    }
    Err(Refusal::Ai(AiError::from_response(status, &text)))
}
