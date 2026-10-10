//! A self-hosted alternative to GitHub Pages: it serves the same data shapes as the static build,
//! and adds editing, the sous-chef and the importer behind a password.

mod ai;
mod api;
pub mod auth;
pub mod config;
mod files;
mod ids;
mod state;

use std::sync::Arc;

use axum::{
    Router,
    extract::DefaultBodyLimit,
    http::{HeaderValue, header},
    routing::{get, post},
};
use tower_http::{compression::CompressionLayer, set_header::SetResponseHeaderLayer};

pub use state::{AppState, Gemini, HttpGemini};

const RECIPE_BODY_LIMIT: usize = 256 * 1024;
const SMALL_BODY_LIMIT: usize = 64 * 1024;

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/api/index", get(api::index))
        .route("/api/search-index", get(api::search_index))
        .route("/api/search", get(api::search))
        .route(
            "/api/recipes/{*id}",
            get(api::recipe)
                .put(api::put_recipe)
                .delete(api::delete_recipe)
                .post(api::post_recipe)
                .layer(DefaultBodyLimit::max(RECIPE_BODY_LIMIT)),
        )
        .route(
            "/api/sections",
            post(api::post_section).layer(DefaultBodyLimit::max(SMALL_BODY_LIMIT)),
        )
        .route(
            "/api/images/{*id}",
            get(api::get_image)
                .post(api::post_image)
                .layer(DefaultBodyLimit::max(api::IMAGE_BODY_LIMIT)),
        )
        .route(
            "/api/session",
            get(api::session_status)
                .post(api::login)
                .delete(api::logout)
                .layer(DefaultBodyLimit::max(SMALL_BODY_LIMIT)),
        )
        .route(
            "/api/ai/chat",
            post(ai::chat).layer(DefaultBodyLimit::max(SMALL_BODY_LIMIT)),
        )
        .route(
            "/api/ai/import",
            post(ai::import).layer(DefaultBodyLimit::max(SMALL_BODY_LIMIT)),
        )
        .fallback(files::serve)
        .layer(SetResponseHeaderLayer::if_not_present(
            header::X_CONTENT_TYPE_OPTIONS,
            HeaderValue::from_static("nosniff"),
        ))
        .layer(CompressionLayer::new())
        .with_state(state)
}
