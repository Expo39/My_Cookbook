//! The sous-chef and the importer, with the same request and response shapes as the Cloudflare Worker.

use std::{
    sync::{Arc, Mutex},
    time::Instant,
};

use axum::{Json, body::Bytes, extract::State};
use cookbook_ai::{
    AiError, Request as GeminiRequest, chat_request, import_request, parse_chat, parse_import,
    parse_import_response, repair_request, review_import, settle_import,
};
use serde_json::{Value, json};

use crate::{
    api::Client,
    auth::Limiter,
    state::{AppState, Authed, Failure, Gemini},
};

fn gemini(state: &AppState) -> Result<Arc<dyn Gemini>, Failure> {
    state.gemini.clone().ok_or_else(|| {
        Failure::new(
            axum::http::StatusCode::SERVICE_UNAVAILABLE,
            "ai_disabled",
            "The sous-chef is not switched on in this kitchen.",
        )
    })
}

fn throttle(limiter: &Mutex<Limiter>, ip: &str) -> Result<(), Failure> {
    let mut limiter = limiter
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    let now = Instant::now();
    if let Some(wait) = limiter.blocked_for(ip, now) {
        return Err(Failure::limited(
            wait,
            &format!(
                "That is enough for now. Try again in {} minutes.",
                wait.div_ceil(60)
            ),
        ));
    }
    limiter.record(ip, now);
    Ok(())
}

pub async fn chat(
    State(state): State<Arc<AppState>>,
    Client(ip): Client,
    body: Bytes,
) -> Result<Json<Value>, Failure> {
    let gemini = gemini(&state)?;
    throttle(&state.chats, &ip)?;
    let input = parse_chat(None, &body)?;
    let snapshot = state.snapshot();
    // A recipe kept on the cook's device is not on the site, so its copy in the request is used.
    let own;
    let recipe = match snapshot.site.recipes.get(&input.recipe_id) {
        Some(published) => &published.recipe,
        None => {
            own = input.own_recipe().map_err(Failure::from)?;
            &own
        }
    };
    let request = chat_request(
        &state.config.gemini,
        recipe,
        &input.history,
        &input.question,
    );
    let reply = gemini
        .generate(&request)
        .await
        .and_then(|response| response.reply())
        .map_err(|e| Failure::from(&e))?;
    Ok(Json(
        json!({ "reply": reply.text, "truncated": reply.truncated }),
    ))
}

pub async fn import(
    State(state): State<Arc<AppState>>,
    _auth: Authed,
    Client(ip): Client,
    body: Bytes,
) -> Result<Json<Value>, Failure> {
    let gemini = gemini(&state)?;
    throttle(&state.imports, &ip)?;
    let text = parse_import(None, &body)?;
    let config = &state.config.gemini;
    let ask = |request: GeminiRequest| {
        let gemini = gemini.clone();
        async move {
            let reply = gemini.generate(&request).await?.reply()?;
            if reply.truncated {
                return Err(AiError::Truncated);
            }
            Ok(reply.text)
        }
    };
    let answer = ask(import_request(config, &text))
        .await
        .map_err(|e| Failure::from(&e))?;
    let first = review_import(&answer, &text);
    // The checklist's errors, or an answer that would not parse, go back once for a repair.
    let imported = match (first.problems, first.draft) {
        (None, Some(draft)) => draft,
        (problems, draft) => {
            let problems = problems.unwrap_or_default();
            let repaired = ask(repair_request(config, &text, &answer, &problems))
                .await
                .and_then(|again| parse_import_response(&again, &text));
            settle_import(draft, repaired, &text).map_err(|e| Failure::from(&e))?
        }
    };
    Ok(Json(
        json!({ "recipe": imported.recipe, "checks": imported.checks }),
    ))
}
