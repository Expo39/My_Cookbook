use std::time::Duration;

use cookbook_ai::{
    ATTEMPTS_PER_MODEL, AiError, ApiError, GeminiConfig, Recipe, Relay, Request as GeminiRequest,
    Response as GeminiResponse, backoff_ms, chat_request, endpoint, error_event, import_request,
    parse_chat, parse_import, parse_import_response, parse_site_recipe, repair_request,
    review_import, settle_import, site_recipe_url, sse_event, stream_endpoint, unknown_recipe,
};
use futures_util::{
    StreamExt,
    future::{Either, select},
    stream,
};
use serde_json::json;
use worker::{
    ByteStream, Date, Delay, Env, Fetch, Headers, Method, Request, RequestInit, Response, Result,
    console_error, js_sys,
};

use crate::{
    auth::{self, AuthError},
    cors,
    limits::{self, Route},
    turnstile,
};

const KV_BINDING: &str = "RATE_LIMIT";
/// Set when every model stayed busy, so the site can warn a cook before they ask.
const BUSY_KEY: &str = "gemini:busy";
const BUSY_SECONDS: u64 = 120;
/// Holds the name of a model Gemini no longer knows, so the owner hears of it from the site.
const RETIRED_KEY: &str = "gemini:retired";
const RETIRED_SECONDS: u64 = 24 * 60 * 60;

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

    // Only the cookbook's own pages may use the AI routes. A script can forge the header, so this
    // stops drive-by use from other sites and casual scripts; the limits and Turnstile do the rest.
    let open = req.path().trim_end_matches('/') == "/status";
    let outcome = if permitted.is_none() && !open {
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
    if path.trim_end_matches('/') == "/status" {
        return status(env).await;
    }
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
            let key = gemini_key(env)?;
            return answer(env.clone(), &config, request, key).map_err(|_| unavailable());
        }
        Route::Import => {
            let text = parse_import(declared, &body)?;
            let answer = import_reply(env, &config, &import_request(&config, &text)).await?;
            let first = review_import(&answer, &text);
            // The checklist's errors, or an answer that would not parse, go back once for a repair.
            let imported = match (first.problems, first.draft) {
                (None, Some(draft)) => draft,
                (problems, draft) => {
                    let problems = problems.unwrap_or_default();
                    let repair = repair_request(&config, &text, &answer, &problems);
                    let repaired = match import_reply(env, &config, &repair).await {
                        Ok(again) => parse_import_response(&again, &text),
                        Err(_) => Err(AiError::Unavailable),
                    };
                    settle_import(draft, repaired, &text).map_err(|e| from_ai(&e))?
                }
            };
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
    let checks = [
        (limits::PER_VISITOR, limits::visitor_key(kind, &ip)),
        (limits::EVERYONE, limits::everyone_key(kind)),
    ];
    for (binding, key) in checks {
        let limiter = env.rate_limiter(binding).map_err(|_| unavailable())?;
        let outcome = limiter.limit(key).await.map_err(|_| unavailable())?;
        if !outcome.success {
            return Err(ApiError::new(
                429,
                "rate_limited",
                "Lots of questions just now. Try again in a minute.",
            )
            .retry_after(limits::PERIOD_SECONDS));
        }
    }
    Ok(())
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

enum Phase {
    /// Asking the model at this place in the list.
    Asking(usize, GeminiRequest),
    /// Relaying that model's streamed answer.
    Answering(ByteStream, Relay),
}

/// Answers a question as server-sent events, starting at once so the cook hears what is going on:
/// a `status` event `{ state: "fallback" }` when the main model cannot answer and a lighter one is
/// asked instead, a `model` event `{ model, fallback }` naming the one that answers, then `delta`
/// events and a closing `done`, or an `error` event.
fn answer(
    env: Env,
    config: &GeminiConfig,
    request: GeminiRequest,
    key: String,
) -> Result<Response> {
    let models: Vec<String> = config.models().into_iter().map(str::to_owned).collect();
    let events = stream::unfold(Some(Phase::Asking(0, request)), move |phase| {
        let (env, models, key) = (env.clone(), models.clone(), key.clone());
        async move {
            let (out, next) = match phase? {
                Phase::Asking(at, mut request) => {
                    match ask_model(&key, &models[at], &mut request, true).await {
                        Ok(mut upstream) => match upstream.stream() {
                            Ok(chunks) => (
                                sse_event(
                                    "model",
                                    &json!({ "model": models[at], "fallback": at > 0 }),
                                ),
                                Some(Phase::Answering(chunks, Relay::new())),
                            ),
                            Err(_) => (error_event(&AiError::Unavailable), None),
                        },
                        Err(error) => {
                            let next = after_failure(&env, &models[at], &error).await
                                && at + 1 < models.len();
                            if next {
                                (
                                    sse_event("status", &json!({ "state": "fallback" })),
                                    Some(Phase::Asking(at + 1, request)),
                                )
                            } else {
                                if error.is_retryable() {
                                    mark_busy(&env).await;
                                }
                                (error_event(&error), None)
                            }
                        }
                    }
                }
                Phase::Answering(mut chunks, mut relay) => match chunks.next().await {
                    Some(Ok(bytes)) => {
                        let out = relay.push(&bytes);
                        (out, Some(Phase::Answering(chunks, relay)))
                    }
                    Some(Err(error)) => {
                        console_error!("gemini: the stream broke off: {error}");
                        (relay.fail(&AiError::Unavailable), None)
                    }
                    None => (relay.end(), None),
                },
            };
            Some((Ok::<Vec<u8>, worker::Error>(out.into_bytes()), next))
        }
    });
    let mut response = Response::from_stream(events)?;
    let headers = response.headers_mut();
    headers.set("Content-Type", "text/event-stream; charset=utf-8")?;
    headers.set("Cache-Control", "no-store")?;
    Ok(response)
}

/// How long one call may wait for Gemini to start answering. A model that has not answered by
/// then is stuck, not slow, and a cook should not be left watching "Thinking..." for minutes.
const REPLY_WITHIN: Duration = Duration::from_secs(25);

/// A cheap check the site makes when the sous-chef opens: no Gemini call, only whether the last
/// questions found every model busy. Reaching it at all also tells the site the Worker is up.
async fn status(env: &Env) -> std::result::Result<Response, ApiError> {
    let (busy, retired) = match env.kv(KV_BINDING) {
        Ok(kv) => (
            kv.get(BUSY_KEY).text().await.ok().flatten().is_some(),
            kv.get(RETIRED_KEY).text().await.ok().flatten(),
        ),
        Err(_) => (false, None),
    };
    let body =
        json!({ "gemini": if busy { "busy" } else { "ok" }, "retired": retired }).to_string();
    json_response(200, &body).map_err(|_| unavailable())
}

/// Remembers for a day that Gemini no longer offers `model`. Best effort, like `mark_busy`.
async fn mark_retired(env: &Env, model: &str) {
    if let Ok(kv) = env.kv(KV_BINDING)
        && let Ok(put) = kv.put(RETIRED_KEY, model)
    {
        let _ = put.expiration_ttl(RETIRED_SECONDS).execute().await;
    }
}

/// What to do after `model` failed: note a retired model, then say whether the next is worth trying.
async fn after_failure(env: &Env, model: &str, error: &AiError) -> bool {
    if *error == AiError::UnknownModel {
        mark_retired(env, model).await;
    }
    try_next(error)
}

/// Remembers for a short while that Gemini is overloaded. Best effort: a failed write only means
/// the next cook is not warned in advance.
async fn mark_busy(env: &Env) {
    if let Ok(kv) = env.kv(KV_BINDING)
        && let Ok(put) = kv.put(BUSY_KEY, "1")
    {
        let _ = put.expiration_ttl(BUSY_SECONDS).execute().await;
    }
}

enum Refusal {
    /// The model does not take the thinking level that was asked for.
    Thinking,
    /// The model sent nothing back within `REPLY_WITHIN`.
    Silent,
    Ai(AiError),
}

fn gemini_key(env: &Env) -> std::result::Result<String, ApiError> {
    env.secret("GEMINI_API_KEY")
        .map(|key| key.to_string())
        .map_err(|_| unavailable())
}

/// Whether the next model is worth trying after `error`: a busy, stuck or unknown model, or one
/// whose daily quota is spent, says nothing about the others, which have quotas of their own.
fn try_next(error: &AiError) -> bool {
    error.is_retryable() || matches!(error, AiError::UnknownModel | AiError::Quota)
}

/// Asks one model, again after a short jittered wait while it is busy, and returns its successful
/// response unread.
async fn ask_model(
    key: &str,
    model: &str,
    request: &mut GeminiRequest,
    streamed: bool,
) -> std::result::Result<Response, AiError> {
    let url = if streamed {
        stream_endpoint(model)
    } else {
        endpoint(model)
    };
    let mut last = AiError::Unavailable;
    let mut attempt = 0;
    while attempt < ATTEMPTS_PER_MODEL {
        match send(key, &url, request).await {
            Ok(response) => return Ok(response),
            Err(Refusal::Thinking) => match request.without_thinking() {
                Some(plain) => {
                    console_error!("gemini: {model} refused the thinking level; asking without it");
                    *request = plain;
                }
                None => return Err(AiError::Unavailable),
            },
            // Asking a stuck model again only doubles the wait.
            Err(Refusal::Silent) => {
                console_error!("gemini: {model} sent nothing within {REPLY_WITHIN:?}");
                return Err(AiError::Unavailable);
            }
            Err(Refusal::Ai(error)) => {
                console_error!("gemini: {model} attempt {} failed: {error:?}", attempt + 1);
                if !error.is_retryable() {
                    return Err(error);
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
    Err(last)
}

/// One import answer from Gemini, as the text of its JSON.
async fn import_reply(
    env: &Env,
    config: &GeminiConfig,
    request: &GeminiRequest,
) -> std::result::Result<String, ApiError> {
    let mut upstream = gemini(env, config, request).await?;
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
    Ok(reply.text)
}

/// Calls Gemini for the importer: the main model, then the fallback when the main one is busy.
async fn gemini(
    env: &Env,
    config: &GeminiConfig,
    request: &GeminiRequest,
) -> std::result::Result<Response, ApiError> {
    let key = gemini_key(env)?;
    let mut request = request.clone();
    let mut last = AiError::Unavailable;
    for model in config.models() {
        match ask_model(&key, model, &mut request, false).await {
            Ok(response) => return Ok(response),
            Err(error) => {
                if !after_failure(env, model, &error).await {
                    return Err(from_ai(&error));
                }
                last = error;
            }
        }
    }
    if last.is_retryable() {
        mark_busy(env).await;
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
    let fetch = Fetch::Request(outgoing);
    let reply = Box::pin(fetch.send());
    let mut response = match select(reply, Box::pin(Delay::from(REPLY_WITHIN))).await {
        Either::Left((result, _)) => result.map_err(failed)?,
        Either::Right(_) => return Err(Refusal::Silent),
    };
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
