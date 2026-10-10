//! Recipe, section, image and session endpoints. The read shapes are the ones the static build writes.

use std::{path::Path as FsPath, sync::Arc, time::Instant};

use axum::{
    Json,
    body::Bytes,
    extract::{FromRequestParts, Multipart, Path, Query, State},
    http::{HeaderMap, StatusCode, header, request::Parts},
    response::{IntoResponse, Response},
};
use cookbook_core::{
    CheckResult, Collection, Level, RecipeFile, Section, check_recipe, check_removal, has_errors,
    parse_recipe,
};
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

use crate::{
    auth,
    ids::{is_valid_file_path, is_valid_path, parent, slug},
    state::{AppState, Authed, Failure, client_key, now_seconds, session_valid},
};

type Shared = State<Arc<AppState>>;
type ApiResult<T = Response> = Result<T, Failure>;

/// The caller's address, for the limiters.
pub struct Client(pub String);

impl FromRequestParts<Arc<AppState>> for Client {
    type Rejection = Failure;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &Arc<AppState>,
    ) -> Result<Self, Self::Rejection> {
        Ok(Client(client_key(parts, state.config.trust_proxy)))
    }
}

fn schema_failure(id: &str, message: &str) -> Failure {
    let results = [CheckResult {
        id: "E-SCHEMA-PARSE",
        level: Level::Error,
        message: message.to_owned(),
        path: "$".to_owned(),
        recipe: id.to_owned(),
    }];
    Failure::checks(
        StatusCode::UNPROCESSABLE_ENTITY,
        "checklist",
        "The recipe is not in the right shape.",
        &results,
    )
}

async fn write_atomic(path: &FsPath, text: &str) -> ApiResult<()> {
    let temp = path.with_extension("json.tmp");
    tokio::fs::write(&temp, text)
        .await
        .map_err(|_| Failure::internal())?;
    tokio::fs::rename(&temp, path)
        .await
        .map_err(|_| Failure::internal())
}

fn relative(id: &str, suffix: &str) -> String {
    format!("recipes/{id}{suffix}")
}

/// The quoted hex SHA-256 of a file's bytes, which is the recipe's version.
fn etag_of(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    let hex: String = digest.iter().map(|b| format!("{b:02x}")).collect();
    format!("\"{hex}\"")
}

async fn current_etag(path: &FsPath) -> Option<String> {
    tokio::fs::read(path)
        .await
        .ok()
        .map(|bytes| etag_of(&bytes))
}

fn with_etag(etag: &str, response: Response) -> Response {
    let mut response = response;
    if let Ok(value) = etag.parse() {
        response.headers_mut().insert(header::ETAG, value);
    }
    response
}

fn conflict() -> Failure {
    Failure::new(
        StatusCode::PRECONDITION_FAILED,
        "conflict",
        "This recipe was changed after you opened it. Nothing was saved. Reload the page and make the change again.",
    )
}

fn header_text<'a>(headers: &'a HeaderMap, name: header::HeaderName) -> Option<&'a str> {
    headers.get(name).map(|v| v.to_str().unwrap_or_default())
}

/// Applies `If-Match` and `If-None-Match: *` to the file's current ETag, `None` when it does not exist.
fn check_preconditions(headers: &HeaderMap, current: Option<&str>) -> ApiResult<()> {
    if let Some(wanted) = header_text(headers, header::IF_MATCH) {
        let matches = current.is_some_and(|etag| {
            wanted.split(',').map(str::trim).any(|candidate| {
                candidate == "*" || candidate.strip_prefix("W/").unwrap_or(candidate) == etag
            })
        });
        if !matches {
            return Err(conflict());
        }
    }
    if let Some(unwanted) = header_text(headers, header::IF_NONE_MATCH)
        && current.is_some()
        && unwanted.split(',').any(|candidate| candidate.trim() == "*")
    {
        return Err(conflict());
    }
    Ok(())
}

pub async fn index(State(state): Shared) -> Response {
    Json(&state.snapshot().site.index).into_response()
}

pub async fn search_index(State(state): Shared) -> Response {
    Json(&state.snapshot().site.search).into_response()
}

pub async fn recipe(State(state): Shared, Path(id): Path<String>) -> ApiResult {
    let snapshot = state.snapshot();
    let data = snapshot
        .site
        .recipes
        .get(&id)
        .ok_or_else(Failure::not_found)?;
    let bytes = tokio::fs::read(state.config.recipes_dir().join(format!("{id}.json")))
        .await
        .map_err(|_| Failure::not_found())?;
    Ok(with_etag(&etag_of(&bytes), Json(data).into_response()))
}

#[derive(Deserialize)]
pub struct SearchQuery {
    q: Option<String>,
    /// Comma-separated ingredients the cook has, ranked by how much of a recipe they cover.
    have: Option<String>,
}

pub async fn search(State(state): Shared, Query(query): Query<SearchQuery>) -> Response {
    let snapshot = state.snapshot();
    if let Some(have) = query.have {
        let have: Vec<&str> = have
            .split(',')
            .map(str::trim)
            .filter(|h| !h.is_empty())
            .collect();
        return Json(snapshot.site.search.ingredients_i_have(&have)).into_response();
    }
    Json(
        snapshot
            .site
            .search
            .search(query.q.as_deref().unwrap_or_default()),
    )
    .into_response()
}

pub async fn put_recipe(
    State(state): Shared,
    _auth: Authed,
    Path(id): Path<String>,
    headers: HeaderMap,
    body: Bytes,
) -> ApiResult {
    if !is_valid_path(&id) {
        return Err(Failure::invalid_id());
    }
    let text =
        std::str::from_utf8(&body).map_err(|_| schema_failure(&id, "the body is not UTF-8"))?;
    let recipe = parse_recipe(text).map_err(|e| schema_failure(&id, &e.to_string()))?;

    let _guard = state.write_lock.lock().await;
    let target = state.config.recipes_dir().join(format!("{id}.json"));
    check_preconditions(&headers, current_etag(&target).await.as_deref())?;
    let mut collection = state.snapshot().collection.clone();
    let file = RecipeFile {
        path: format!("{id}.json"),
        recipe,
    };
    collection.recipes.retain(|r| r.path != file.path);
    collection.recipes.push(file.clone());
    collection.files.insert(file.path.clone());
    let results = check_recipe(&file, &collection.context());
    if has_errors(&results) {
        return Err(Failure::checks(
            StatusCode::UNPROCESSABLE_ENTITY,
            "checklist",
            "The recipe has problems that need fixing first.",
            &results,
        ));
    }

    let rendered = cookbook_tree::render_json(&file.recipe).map_err(|_| Failure::internal())?;
    write_atomic(&target, &rendered).await?;
    state.reload().await?;
    state
        .commit(
            &[relative(&id, ".json")],
            &format!("content(recipes): save {id}"),
        )
        .await;
    Ok(with_etag(
        &etag_of(rendered.as_bytes()),
        Json(json!({ "id": id, "results": results })).into_response(),
    ))
}

/// The photo (relative to the recipes folder) that only the recipe being removed uses.
fn orphaned_photo(id: &str, collection: &Collection) -> Option<String> {
    let photo = |recipe_id: &str, src: &str| {
        let path = format!("{}/{src}", parent(recipe_id)?);
        (is_valid_file_path(&path) && content_type(&path).is_some()).then_some(path)
    };
    let own = collection.recipes.iter().find(|r| r.id() == id)?;
    let own = photo(id, &own.recipe.image.as_ref()?.src)?;
    let shared = collection.recipes.iter().any(|r| {
        r.id() != id
            && r.recipe
                .image
                .as_ref()
                .and_then(|image| photo(&r.id(), &image.src))
                .is_some_and(|other| other == own)
    });
    (!shared).then_some(own)
}

pub async fn delete_recipe(
    State(state): Shared,
    _auth: Authed,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> ApiResult {
    if !is_valid_path(&id) {
        return Err(Failure::invalid_id());
    }
    let _guard = state.write_lock.lock().await;
    let target = state.config.recipes_dir().join(format!("{id}.json"));
    let collection = state.snapshot().collection.clone();
    if headers.contains_key(header::IF_MATCH) || headers.contains_key(header::IF_NONE_MATCH) {
        check_preconditions(&headers, current_etag(&target).await.as_deref())?;
    }
    if !collection.recipes.iter().any(|r| r.id() == id) {
        return Err(Failure::not_found());
    }
    let linked = check_removal(&id, &collection);
    if !linked.is_empty() {
        return Err(Failure::checks(
            StatusCode::CONFLICT,
            "linked",
            "Other recipes still link to this one.",
            &linked,
        ));
    }
    let photo = orphaned_photo(&id, &collection);
    tokio::fs::remove_file(&target)
        .await
        .map_err(|_| Failure::internal())?;
    let mut paths = vec![relative(&id, ".json")];
    if let Some(photo) = photo {
        match tokio::fs::remove_file(state.config.recipes_dir().join(&photo)).await {
            Ok(()) => paths.push(format!("recipes/{photo}")),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => return Err(Failure::internal()),
        }
    }
    state.reload().await?;
    state
        .commit(&paths, &format!("content(recipes): remove {id}"))
        .await;
    Ok(Json(json!({ "id": id })).into_response())
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NewSection {
    path: String,
    title: String,
    order: Option<i32>,
    summary: Option<String>,
}

pub async fn post_section(
    State(state): Shared,
    _auth: Authed,
    Json(new): Json<NewSection>,
) -> ApiResult {
    if !is_valid_path(&new.path) {
        return Err(Failure::invalid_id());
    }
    let title = new.title.trim();
    if title.is_empty() || title.chars().count() > 120 {
        return Err(Failure::new(
            StatusCode::UNPROCESSABLE_ENTITY,
            "invalid_title",
            "A section needs a title of up to 120 characters.",
        ));
    }
    let _guard = state.write_lock.lock().await;
    let collection = state.snapshot().collection.clone();
    if let Some(parent) = parent(&new.path)
        && !collection.sections.iter().any(|s| s.folder == parent)
    {
        return Err(Failure::new(
            StatusCode::UNPROCESSABLE_ENTITY,
            "missing_parent",
            "The section above this one does not exist yet.",
        ));
    }
    if collection.folders.contains(&new.path) {
        return Err(Failure::new(
            StatusCode::CONFLICT,
            "exists",
            "That section already exists.",
        ));
    }
    let section = Section {
        title: title.to_owned(),
        order: new.order,
        summary: new
            .summary
            .map(|s| s.trim().to_owned())
            .filter(|s| !s.is_empty()),
    };
    let rendered = cookbook_tree::render_json(&section).map_err(|_| Failure::internal())?;
    let dir = state.config.recipes_dir().join(&new.path);
    tokio::fs::create_dir(&dir)
        .await
        .map_err(|_| Failure::internal())?;
    tokio::fs::write(dir.join("_section.json"), rendered)
        .await
        .map_err(|_| Failure::internal())?;
    state.reload().await?;
    state
        .commit(
            &[relative(&new.path, "")],
            &format!("content(recipes): add section {}", new.path),
        )
        .await;
    Ok((StatusCode::CREATED, Json(json!({ "path": new.path }))).into_response())
}

const IMAGE_BYTES: usize = 8 * 1024 * 1024;
pub const IMAGE_BODY_LIMIT: usize = IMAGE_BYTES + 16 * 1024;

/// The extension for the image types that are allowed, judged by their first bytes.
fn image_extension(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some("jpg")
    } else if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("png")
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Some("gif")
    } else if bytes.len() > 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some("webp")
    } else {
        None
    }
}

fn content_type(name: &str) -> Option<&'static str> {
    match name.rsplit_once('.')?.1 {
        "jpg" | "jpeg" => Some("image/jpeg"),
        "png" => Some("image/png"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        _ => None,
    }
}

pub async fn post_image(
    State(state): Shared,
    _auth: Authed,
    Path(id): Path<String>,
    mut multipart: Multipart,
) -> ApiResult {
    if !is_valid_path(&id) {
        return Err(Failure::invalid_id());
    }
    let folder = parent(&id).ok_or_else(Failure::invalid_id)?;
    let field = multipart
        .next_field()
        .await
        .map_err(|e| multipart_failure(&e))?
        .ok_or_else(|| {
            Failure::new(
                StatusCode::BAD_REQUEST,
                "no_file",
                "Choose an image to upload.",
            )
        })?;
    let bytes = field.bytes().await.map_err(|e| multipart_failure(&e))?;
    if bytes.len() > IMAGE_BYTES {
        return Err(too_large());
    }
    let ext = image_extension(&bytes).ok_or_else(|| {
        Failure::new(
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            "unsupported_type",
            "Only JPEG, PNG, WebP and GIF images can be uploaded.",
        )
    })?;

    let _guard = state.write_lock.lock().await;
    if !state
        .snapshot()
        .collection
        .sections
        .iter()
        .any(|s| s.folder == folder)
    {
        return Err(Failure::new(
            StatusCode::UNPROCESSABLE_ENTITY,
            "missing_section",
            "The recipe's section does not exist.",
        ));
    }
    let name = format!("{}.{ext}", slug(&id));
    tokio::fs::write(state.config.recipes_dir().join(folder).join(&name), &bytes)
        .await
        .map_err(|_| Failure::internal())?;
    state.reload().await?;
    state
        .commit(
            &[format!("recipes/{folder}/{name}")],
            &format!("content(recipes): add image for {id}"),
        )
        .await;
    Ok((
        StatusCode::CREATED,
        Json(json!({ "src": name, "path": format!("{folder}/{name}") })),
    )
        .into_response())
}

fn too_large() -> Failure {
    Failure::new(
        StatusCode::PAYLOAD_TOO_LARGE,
        "too_large",
        "That image is too large. The limit is 8 MB.",
    )
}

fn multipart_failure(error: &axum::extract::multipart::MultipartError) -> Failure {
    if error.status() == StatusCode::PAYLOAD_TOO_LARGE {
        too_large()
    } else {
        Failure::new(
            StatusCode::BAD_REQUEST,
            "bad_upload",
            "The upload could not be read.",
        )
    }
}

pub async fn get_image(State(state): Shared, Path(path): Path<String>) -> ApiResult {
    let content_type = content_type(&path)
        .filter(|_| is_valid_file_path(&path))
        .ok_or_else(Failure::not_found)?;
    let bytes = tokio::fs::read(state.config.recipes_dir().join(&path))
        .await
        .map_err(|_| Failure::not_found())?;
    Ok((
        [
            (header::CONTENT_TYPE, content_type),
            (header::CACHE_CONTROL, "public, max-age=3600"),
        ],
        bytes,
    )
        .into_response())
}

#[derive(Deserialize)]
pub struct Login {
    password: String,
}

pub async fn session_status(State(state): Shared, headers: HeaderMap) -> Json<Value> {
    Json(json!({ "authenticated": session_valid(&state, &headers) }))
}

pub async fn login(
    State(state): Shared,
    Client(ip): Client,
    Json(login): Json<Login>,
) -> ApiResult {
    let now = Instant::now();
    {
        // Counting the attempt before the slow hash keeps parallel guesses inside the limit.
        let mut logins = state
            .logins
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if let Some(wait) = logins.blocked_for(&ip, now) {
            return Err(Failure::limited(
                wait,
                &format!(
                    "Too many attempts. Try again in {} minutes.",
                    wait.div_ceil(60)
                ),
            ));
        }
        logins.record(&ip, now);
    }
    let hash = state.config.password_hash.clone();
    let password = login.password.chars().take(256).collect::<String>();
    let correct = tokio::task::spawn_blocking(move || auth::check_password(&hash, &password))
        .await
        .map_err(|_| Failure::internal())?;
    if !correct {
        return Err(Failure::new(
            StatusCode::UNAUTHORIZED,
            "unauthorised",
            "That password is not right.",
        ));
    }
    state
        .logins
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .clear(&ip);
    let token = auth::issue(&state.config.session_secret, now_seconds());
    Ok((
        [(
            header::SET_COOKIE,
            auth::set_cookie(&token, state.config.secure_cookie),
        )],
        Json(json!({ "authenticated": true, "expiresIn": auth::SESSION_SECONDS })),
    )
        .into_response())
}

pub async fn logout(State(state): Shared) -> Response {
    (
        [(
            header::SET_COOKIE,
            auth::clear_cookie(state.config.secure_cookie),
        )],
        Json(json!({ "authenticated": false })),
    )
        .into_response()
}
