//! The sous-chef and the importer, with the same request and response shapes as the Cloudflare Worker.

use std::{
    sync::{Arc, Mutex},
    time::Instant,
};

use axum::{Json, body::Bytes, extract::State};
use cookbook_ai::{
    AiError, chat_request, import_request, parse_chat, parse_import, parse_import_response,
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
    let request = import_request(&state.config.gemini, &text);
    let reply = gemini
        .generate(&request)
        .await
        .and_then(|response| response.reply())
        .map_err(|e| Failure::from(&e))?;
    if reply.truncated {
        return Err(Failure::from(&AiError::Truncated));
    }
    let imported = parse_import_response(&reply.text).map_err(|e| Failure::from(&e))?;
    Ok(Json(
        json!({ "recipe": imported.recipe, "checks": imported.checks }),
    ))
}
