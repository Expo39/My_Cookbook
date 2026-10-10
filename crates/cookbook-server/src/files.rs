//! Serves the built site, with a fallback to the app shell for client-side routes.

use std::{path::Path, sync::Arc};

use axum::{
    body::Body,
    extract::State,
    http::{HeaderValue, Request, StatusCode, Uri, header},
    response::{IntoResponse, Response},
};
use tower::ServiceExt;
use tower_http::services::{ServeDir, ServeFile};

use crate::state::{AppState, Failure};

const IMMUTABLE: &str = "public, max-age=31536000, immutable";
const REVALIDATE: &str = "no-cache";
const SHORT: &str = "public, max-age=3600";

fn shell(dir: &Path) -> std::path::PathBuf {
    let spa = dir.join("200.html");
    if spa.is_file() {
        spa
    } else {
        dir.join("index.html")
    }
}

/// Picks the file for a clean URL: the path itself, `<path>.html` or `<path>/index.html`.
fn target(dir: &Path, path: &str) -> Option<String> {
    let rel = path.trim_matches('/');
    let unsafe_path = rel.contains('%') || rel.contains('\\') || rel.split('/').any(|s| s == "..");
    if unsafe_path {
        return None;
    }
    if rel.is_empty() {
        return Some("/index.html".to_owned());
    }
    [
        rel.to_owned(),
        format!("{rel}.html"),
        format!("{rel}/index.html"),
    ]
    .into_iter()
    .find(|candidate| dir.join(candidate).is_file())
    .map(|candidate| format!("/{candidate}"))
}

fn cache_control(path: &str) -> &'static str {
    if path.starts_with("/_app/immutable/") {
        IMMUTABLE
    } else if path.ends_with(".html") || !path.rsplit('/').next().unwrap_or("").contains('.') {
        REVALIDATE
    } else {
        SHORT
    }
}

pub async fn serve(State(state): State<Arc<AppState>>, request: Request<Body>) -> Response {
    let path = request.uri().path().to_owned();
    if path == "/api" || path.starts_with("/api/") {
        return Failure::not_found().into_response();
    }
    let Some(dir) = state.config.web_dir.clone() else {
        return Failure::not_found().into_response();
    };

    let (mut parts, body) = request.into_parts();
    if let Some(chosen) = target(&dir, &path)
        && let Ok(uri) = chosen.parse::<Uri>()
    {
        parts.uri = uri;
    }
    let served_path = parts.uri.path().to_owned();
    let service = ServeDir::new(&dir).fallback(ServeFile::new(shell(&dir)));
    let Ok(mut response) = service.oneshot(Request::from_parts(parts, body)).await;
    if response.status() == StatusCode::OK {
        let value = cache_control(&served_path);
        response
            .headers_mut()
            .insert(header::CACHE_CONTROL, HeaderValue::from_static(value));
    }
    response.map(Body::new)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hashed_assets_are_cached_for_ever_and_pages_are_revalidated() {
        assert_eq!(cache_control("/_app/immutable/chunks/a.js"), IMMUTABLE);
        assert_eq!(cache_control("/index.html"), REVALIDATE);
        assert_eq!(cache_control("/recipe/soup"), REVALIDATE);
        assert_eq!(cache_control("/favicon.svg"), SHORT);
    }

    #[test]
    fn clean_urls_find_their_html_file() {
        let dir = std::env::temp_dir().join(format!("cookbook-files-{}", std::process::id()));
        std::fs::create_dir_all(dir.join("about")).unwrap();
        std::fs::write(dir.join("about.html"), "x").unwrap();
        std::fs::write(dir.join("about/index.html"), "x").unwrap();
        std::fs::write(dir.join("a.js"), "x").unwrap();
        assert_eq!(target(&dir, "/"), Some("/index.html".to_owned()));
        assert_eq!(target(&dir, "/a.js"), Some("/a.js".to_owned()));
        assert_eq!(target(&dir, "/about"), Some("/about.html".to_owned()));
        assert_eq!(target(&dir, "/missing"), None);
        assert_eq!(target(&dir, "/../etc/passwd"), None);
        assert_eq!(target(&dir, "/%2e%2e/etc"), None);
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
