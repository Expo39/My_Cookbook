use std::{
    fs,
    future::Future,
    path::{Path, PathBuf},
    pin::Pin,
    sync::Arc,
};

use argon2::{Algorithm, Argon2, Params, Version};
use axum::{
    Router,
    body::Body,
    http::{HeaderMap, Method, Request, StatusCode, header},
};
use cookbook_ai::{AiError, Request as GeminiRequest, Response as GeminiResponse};
use cookbook_server::{AppState, Gemini, auth, config::Config, router};
use http_body_util::BodyExt;
use serde_json::{Value, json};
use tempfile::TempDir;
use tower::ServiceExt;

const PASSWORD: &str = "correct horse battery";
const SECRET: &str = "0123456789abcdef0123456789abcdef";

struct Canned(Result<String, AiError>);

impl Gemini for Canned {
    fn generate<'a>(
        &'a self,
        _request: &'a GeminiRequest,
    ) -> Pin<Box<dyn Future<Output = Result<GeminiResponse, AiError>> + Send + 'a>> {
        Box::pin(async move {
            match &self.0 {
                Ok(text) => Ok(GeminiResponse::from_json(
                    &json!({"candidates":[{"content":{"parts":[{"text":text}]},"finishReason":"STOP"}]})
                        .to_string(),
                )?),
                Err(error) => Err(error.clone()),
            }
        })
    }
}

struct Reply {
    status: StatusCode,
    headers: HeaderMap,
    body: Vec<u8>,
}

impl Reply {
    fn json(&self) -> Value {
        serde_json::from_slice(&self.body).unwrap_or(Value::Null)
    }

    fn codes(&self) -> Vec<String> {
        self.json()["results"]
            .as_array()
            .map(|r| {
                r.iter()
                    .map(|c| c["id"].as_str().unwrap().to_owned())
                    .collect()
            })
            .unwrap_or_default()
    }
}

struct Kitchen {
    dir: TempDir,
    app: Router,
}

fn copy_tree(from: &Path, to: &Path) {
    fs::create_dir_all(to).unwrap();
    for entry in fs::read_dir(from).unwrap() {
        let entry = entry.unwrap();
        let target = to.join(entry.file_name());
        if entry.file_type().unwrap().is_dir() {
            copy_tree(&entry.path(), &target);
        } else {
            fs::copy(entry.path(), target).unwrap();
        }
    }
}

fn cheap_hash(password: &str) -> String {
    let params = Params::new(8, 1, 1, None).unwrap();
    auth::hash_with(
        &Argon2::new(Algorithm::Argon2id, Version::V0x13, params),
        password,
    )
    .unwrap()
}

fn kitchen_with(gemini: Option<Arc<dyn Gemini>>, web: Option<&Path>) -> Kitchen {
    let dir = TempDir::new().unwrap();
    let fixtures = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../cookbook-cli/tests/fixtures/valid/recipes");
    copy_tree(&fixtures, &dir.path().join("recipes"));
    let hash = cheap_hash(PASSWORD);
    let root = dir.path().to_string_lossy().into_owned();
    let web = web.map(|p| p.to_string_lossy().into_owned());
    let config = Config::from_lookup(|name| match name {
        "COOKBOOK_ROOT" => Some(root.clone()),
        "WEB_DIR" => web.clone(),
        "ADMIN_PASSWORD_HASH" => Some(hash.clone()),
        "SESSION_SECRET" => Some(SECRET.to_owned()),
        _ => None,
    })
    .unwrap();
    let state = AppState::new(config, gemini).unwrap();
    Kitchen {
        dir,
        app: router(state),
    }
}

fn kitchen() -> Kitchen {
    kitchen_with(None, None)
}

impl Kitchen {
    async fn send(&self, request: Request<Body>) -> Reply {
        let response = self.app.clone().oneshot(request).await.unwrap();
        let (parts, body) = response.into_parts();
        Reply {
            status: parts.status,
            headers: parts.headers,
            body: body.collect().await.unwrap().to_bytes().to_vec(),
        }
    }

    async fn call(
        &self,
        method: Method,
        uri: &str,
        cookie: Option<&str>,
        body: Option<Value>,
    ) -> Reply {
        let mut builder = Request::builder().method(method).uri(uri);
        if let Some(cookie) = cookie {
            builder = builder.header(header::COOKIE, cookie);
        }
        let body = match body {
            Some(value) => {
                builder = builder.header(header::CONTENT_TYPE, "application/json");
                Body::from(value.to_string())
            }
            None => Body::empty(),
        };
        self.send(builder.body(body).unwrap()).await
    }

    async fn get(&self, uri: &str) -> Reply {
        self.call(Method::GET, uri, None, None).await
    }

    async fn login(&self) -> String {
        let reply = self
            .call(
                Method::POST,
                "/api/session",
                None,
                Some(json!({ "password": PASSWORD })),
            )
            .await;
        assert_eq!(reply.status, StatusCode::OK);
        let cookie = reply.headers[header::SET_COOKIE].to_str().unwrap();
        cookie.split(';').next().unwrap().to_owned()
    }

    async fn upload(&self, uri: &str, cookie: &str, bytes: &[u8]) -> Reply {
        let mut body =
            b"--B\r\nContent-Disposition: form-data; name=\"file\"; filename=\"x\"\r\n\r\n"
                .to_vec();
        body.extend_from_slice(bytes);
        body.extend_from_slice(b"\r\n--B--\r\n");
        self.send(
            Request::builder()
                .method(Method::POST)
                .uri(uri)
                .header(header::COOKIE, cookie)
                .header(header::CONTENT_TYPE, "multipart/form-data; boundary=B")
                .body(Body::from(body))
                .unwrap(),
        )
        .await
    }

    fn path(&self, relative: &str) -> PathBuf {
        self.dir.path().join(relative)
    }
}

fn recipe(extra: Value) -> Value {
    let mut base = json!({
        "title": "Chickpea stew",
        "summary": "A quick stew from the store cupboard.",
        "servings": 4,
        "ingredientGroups": [{ "items": [
            { "key": "chickpeas", "amount": { "qty": 400, "unit": "g" }, "item": "chickpeas" }
        ]}],
        "steps": [{ "text": "Simmer {@chickpeas} for {timer:20}." }]
    });
    base.as_object_mut()
        .unwrap()
        .extend(extra.as_object().unwrap().clone());
    base
}

const PNG: &[u8] = b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR";

#[tokio::test]
async fn editing_needs_a_session() {
    let k = kitchen();
    let sections = json!({ "path": "starters", "title": "Starters" });
    for (method, uri, body) in [
        (
            Method::PUT,
            "/api/recipes/mains/new-stew",
            Some(recipe(json!({}))),
        ),
        (Method::DELETE, "/api/recipes/mains/lentil-soup", None),
        (Method::POST, "/api/sections", Some(sections)),
        (Method::POST, "/api/ai/import", Some(json!({ "text": "x" }))),
    ] {
        let reply = k.call(method.clone(), uri, None, body).await;
        assert_eq!(reply.status, StatusCode::UNAUTHORIZED, "{method} {uri}");
    }
    let upload = k
        .upload(
            "/api/images/mains/lentil-soup",
            "cookbook_session=forged.00",
            PNG,
        )
        .await;
    assert_eq!(upload.status, StatusCode::UNAUTHORIZED);
    assert!(!k.path("recipes/mains/new-stew.json").exists());
}

#[tokio::test]
async fn a_wrong_password_is_rejected_and_repeated_guesses_are_limited() {
    let k = kitchen();
    for _ in 0..5 {
        let reply = k
            .call(
                Method::POST,
                "/api/session",
                None,
                Some(json!({ "password": "nope" })),
            )
            .await;
        assert_eq!(reply.status, StatusCode::UNAUTHORIZED);
        assert!(reply.headers.get(header::SET_COOKIE).is_none());
    }
    let blocked = k
        .call(
            Method::POST,
            "/api/session",
            None,
            Some(json!({ "password": PASSWORD })),
        )
        .await;
    assert_eq!(blocked.status, StatusCode::TOO_MANY_REQUESTS);
    assert!(blocked.headers.contains_key(header::RETRY_AFTER));
    assert_eq!(blocked.json()["error"], "rate_limited");
}

#[tokio::test]
async fn parallel_guesses_count_against_the_limit_before_they_are_verified() {
    let k = kitchen();
    let mut guesses = Vec::new();
    for _ in 0..40 {
        let app = k.app.clone();
        let request = Request::builder()
            .method(Method::POST)
            .uri("/api/session")
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(json!({ "password": "nope" }).to_string()))
            .unwrap();
        guesses.push(tokio::spawn(async move {
            app.oneshot(request).await.unwrap().status()
        }));
    }
    let mut verified = 0;
    for guess in guesses {
        if guess.await.unwrap() == StatusCode::UNAUTHORIZED {
            verified += 1;
        }
    }
    assert_eq!(verified, 5);
}

#[tokio::test]
async fn the_right_password_sets_a_hardened_twelve_hour_cookie_that_logout_clears() {
    let k = kitchen();
    let reply = k
        .call(
            Method::POST,
            "/api/session",
            None,
            Some(json!({ "password": PASSWORD })),
        )
        .await;
    let cookie = reply.headers[header::SET_COOKIE]
        .to_str()
        .unwrap()
        .to_owned();
    for part in ["HttpOnly", "Secure", "SameSite=Strict", "Max-Age=43200"] {
        assert!(cookie.contains(part), "{cookie}");
    }
    let session = cookie.split(';').next().unwrap();
    let status = k
        .call(Method::GET, "/api/session", Some(session), None)
        .await;
    assert_eq!(status.json()["authenticated"], true);
    assert_eq!(k.get("/api/session").await.json()["authenticated"], false);

    let out = k
        .call(Method::DELETE, "/api/session", Some(session), None)
        .await;
    assert!(
        out.headers[header::SET_COOKIE]
            .to_str()
            .unwrap()
            .contains("Max-Age=0")
    );
}

#[tokio::test]
async fn a_valid_recipe_is_written_and_read_back() {
    let k = kitchen();
    let cookie = k.login().await;
    let id = "mains/chickpea-stew";
    let saved = k
        .call(
            Method::PUT,
            &format!("/api/recipes/{id}"),
            Some(&cookie),
            Some(recipe(json!({}))),
        )
        .await;
    assert_eq!(
        saved.status,
        StatusCode::OK,
        "{}",
        String::from_utf8_lossy(&saved.body)
    );

    let page = k.get(&format!("/api/recipes/{id}")).await;
    assert_eq!(page.status, StatusCode::OK);
    assert_eq!(page.json()["recipe"]["title"], "Chickpea stew");
    assert_eq!(page.json()["view"]["servings"], 4.0);

    let index = k.get("/api/index").await.json();
    let titles: Vec<&str> = index["sections"][0]["recipes"]
        .as_array()
        .unwrap()
        .iter()
        .map(|r| r["title"].as_str().unwrap())
        .collect();
    assert!(titles.contains(&"Chickpea stew"), "{titles:?}");

    let hits = k.get("/api/search?q=chickpea").await.json();
    assert_eq!(hits[0]["id"], id);

    let written = fs::read_to_string(k.path("recipes/mains/chickpea-stew.json")).unwrap();
    assert!(written.starts_with("{\n  \"title\""), "{written}");
    assert!(written.ends_with("}\n"));
    assert!(written.contains("\"qty\": 400,"));
}

#[tokio::test]
async fn an_invalid_recipe_gets_the_checklist_and_is_not_written() {
    let k = kitchen();
    let cookie = k.login().await;
    let broken = recipe(json!({ "steps": [{ "text": "Stir {@missing}." }] }));
    let reply = k
        .call(
            Method::PUT,
            "/api/recipes/mains/broken",
            Some(&cookie),
            Some(broken),
        )
        .await;
    assert_eq!(reply.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert!(
        reply.codes().contains(&"E-TOKEN-UNRESOLVED".to_owned()),
        "{:?}",
        reply.json()
    );
    assert!(!k.path("recipes/mains/broken.json").exists());
    assert_eq!(
        k.get("/api/recipes/mains/broken").await.status,
        StatusCode::NOT_FOUND
    );

    let outside = k
        .call(
            Method::PUT,
            "/api/recipes/nowhere/stew",
            Some(&cookie),
            Some(recipe(json!({}))),
        )
        .await;
    assert_eq!(outside.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert!(outside.codes().contains(&"E-SECTION-MISSING".to_owned()));

    let nonsense = k
        .call(
            Method::PUT,
            "/api/recipes/mains/odd",
            Some(&cookie),
            Some(json!({ "title": 3 })),
        )
        .await;
    assert_eq!(nonsense.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert!(nonsense.codes().contains(&"E-SCHEMA-PARSE".to_owned()));
}

#[tokio::test]
async fn deleting_a_linked_recipe_is_a_conflict_until_the_link_goes() {
    let k = kitchen();
    let cookie = k.login().await;
    let linking = recipe(json!({ "related": ["mains/lentil-soup"] }));
    let put = k
        .call(
            Method::PUT,
            "/api/recipes/mains/linking",
            Some(&cookie),
            Some(linking),
        )
        .await;
    assert_eq!(
        put.status,
        StatusCode::OK,
        "{}",
        String::from_utf8_lossy(&put.body)
    );

    let refused = k
        .call(
            Method::DELETE,
            "/api/recipes/mains/lentil-soup",
            Some(&cookie),
            None,
        )
        .await;
    assert_eq!(refused.status, StatusCode::CONFLICT);
    assert_eq!(refused.json()["results"][0]["recipe"], "mains/linking");
    assert!(k.path("recipes/mains/lentil-soup.json").exists());

    k.call(
        Method::PUT,
        "/api/recipes/mains/linking",
        Some(&cookie),
        Some(recipe(json!({}))),
    )
    .await;
    let removed = k
        .call(
            Method::DELETE,
            "/api/recipes/mains/lentil-soup",
            Some(&cookie),
            None,
        )
        .await;
    assert_eq!(removed.status, StatusCode::OK);
    assert!(!k.path("recipes/mains/lentil-soup.json").exists());
    assert_eq!(
        k.get("/api/recipes/mains/lentil-soup").await.status,
        StatusCode::NOT_FOUND
    );

    let again = k
        .call(
            Method::DELETE,
            "/api/recipes/mains/lentil-soup",
            Some(&cookie),
            None,
        )
        .await;
    assert_eq!(again.status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn paths_that_climb_out_are_refused_everywhere() {
    let k = kitchen();
    let cookie = k.login().await;
    for id in [
        "../evil",
        "mains/../../evil",
        "%2e%2e/evil",
        "mains/..%2f..%2fevil",
        "mains/Evil",
        "mains//evil",
    ] {
        let put = k
            .call(
                Method::PUT,
                &format!("/api/recipes/{id}"),
                Some(&cookie),
                Some(recipe(json!({}))),
            )
            .await;
        assert_eq!(put.status, StatusCode::BAD_REQUEST, "PUT {id}");
        let delete = k
            .call(
                Method::DELETE,
                &format!("/api/recipes/{id}"),
                Some(&cookie),
                None,
            )
            .await;
        assert_eq!(delete.status, StatusCode::BAD_REQUEST, "DELETE {id}");
        let image = k.upload(&format!("/api/images/{id}"), &cookie, PNG).await;
        assert_eq!(image.status, StatusCode::BAD_REQUEST, "image {id}");
        assert_eq!(
            k.get(&format!("/api/images/{id}.png")).await.status,
            StatusCode::NOT_FOUND
        );
    }
    let section = k
        .call(
            Method::POST,
            "/api/sections",
            Some(&cookie),
            Some(json!({ "path": "../evil", "title": "Evil" })),
        )
        .await;
    assert_eq!(section.status, StatusCode::BAD_REQUEST);
    assert!(
        !k.path("evil.json").exists()
            && !k.path("evil").exists()
            && !k.path("recipes/evil").exists()
    );
}

#[tokio::test]
async fn sections_can_be_added_once() {
    let k = kitchen();
    let cookie = k.login().await;
    let make = |path: &str| json!({ "path": path, "title": "Salads", "order": 3 });
    let created = k
        .call(
            Method::POST,
            "/api/sections",
            Some(&cookie),
            Some(make("salads")),
        )
        .await;
    assert_eq!(created.status, StatusCode::CREATED);
    let file = fs::read_to_string(k.path("recipes/salads/_section.json")).unwrap();
    assert!(file.contains("\"title\": \"Salads\"") && file.contains("\"order\": 3"));

    let nested = k
        .call(
            Method::POST,
            "/api/sections",
            Some(&cookie),
            Some(make("salads/green")),
        )
        .await;
    assert_eq!(nested.status, StatusCode::CREATED);
    let twice = k
        .call(
            Method::POST,
            "/api/sections",
            Some(&cookie),
            Some(make("salads")),
        )
        .await;
    assert_eq!(twice.status, StatusCode::CONFLICT);
    let orphan = k
        .call(
            Method::POST,
            "/api/sections",
            Some(&cookie),
            Some(make("soups/clear")),
        )
        .await;
    assert_eq!(orphan.status, StatusCode::UNPROCESSABLE_ENTITY);

    let index = k.get("/api/index").await.json();
    assert_eq!(index["sections"].as_array().unwrap().len(), 2);
    let saved = k
        .call(
            Method::PUT,
            "/api/recipes/salads/green/slaw",
            Some(&cookie),
            Some(recipe(json!({}))),
        )
        .await;
    assert_eq!(saved.status, StatusCode::OK);
}

#[tokio::test]
async fn deleting_a_recipe_removes_its_photo() {
    let k = kitchen();
    let cookie = k.login().await;
    k.upload("/api/images/mains/pictured", &cookie, PNG).await;
    let saved = k
        .call(
            Method::PUT,
            "/api/recipes/mains/pictured",
            Some(&cookie),
            Some(recipe(
                json!({ "image": { "src": "pictured.png", "alt": "A stew" } }),
            )),
        )
        .await;
    assert_eq!(saved.status, StatusCode::OK);
    assert!(k.path("recipes/mains/pictured.png").exists());

    let removed = k
        .call(
            Method::DELETE,
            "/api/recipes/mains/pictured",
            Some(&cookie),
            None,
        )
        .await;
    assert_eq!(removed.status, StatusCode::OK);
    assert!(!k.path("recipes/mains/pictured.json").exists());
    assert!(!k.path("recipes/mains/pictured.png").exists());
    assert_eq!(
        k.get("/api/images/mains/pictured.png").await.status,
        StatusCode::NOT_FOUND
    );
}

#[tokio::test]
async fn images_must_be_images_and_small() {
    let k = kitchen();
    let cookie = k.login().await;
    let ok = k
        .upload("/api/images/mains/lentil-soup", &cookie, PNG)
        .await;
    assert_eq!(ok.status, StatusCode::CREATED);
    assert_eq!(ok.json()["src"], "lentil-soup.png");
    assert_eq!(
        fs::read(k.path("recipes/mains/lentil-soup.png")).unwrap(),
        PNG
    );

    let served = k.get("/api/images/mains/lentil-soup.png").await;
    assert_eq!(served.headers[header::CONTENT_TYPE], "image/png");
    assert_eq!(served.body, PNG);

    let text = k
        .upload(
            "/api/images/mains/lentil-soup",
            &cookie,
            b"<script>alert(1)</script>",
        )
        .await;
    assert_eq!(text.status, StatusCode::UNSUPPORTED_MEDIA_TYPE);
    let mut big = PNG.to_vec();
    big.resize(9 * 1024 * 1024, 0);
    let huge = k
        .upload("/api/images/mains/lentil-soup", &cookie, &big)
        .await;
    assert_eq!(huge.status, StatusCode::PAYLOAD_TOO_LARGE);
    let nowhere = k.upload("/api/images/nowhere/stew", &cookie, PNG).await;
    assert_eq!(nowhere.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(
        k.get("/api/images/mains/_section.json").await.status,
        StatusCode::NOT_FOUND
    );
}

#[tokio::test]
async fn the_sous_chef_answers_and_the_importer_needs_a_session() {
    let draft = json!({
        "title": "Imported soup", "summary": "From text.", "servings": 2,
        "ingredientGroups": [{ "items": [{ "item": "water" }] }],
        "steps": [{ "text": "Boil." }]
    })
    .to_string();
    let k = kitchen_with(Some(Arc::new(Canned(Ok(draft)))), None);
    let chat = json!({ "recipeId": "mains/lentil-soup", "recipe": recipe(json!({})), "question": "Can I freeze it?" });
    let reply = k.call(Method::POST, "/api/ai/chat", None, Some(chat)).await;
    assert_eq!(
        reply.status,
        StatusCode::OK,
        "{}",
        String::from_utf8_lossy(&reply.body)
    );
    assert_eq!(reply.json()["truncated"], false);
    assert!(
        reply.json()["reply"]
            .as_str()
            .unwrap()
            .contains("Imported soup")
    );

    let bad = k
        .call(
            Method::POST,
            "/api/ai/chat",
            None,
            Some(json!({ "question": "hi" })),
        )
        .await;
    assert_eq!(bad.status, StatusCode::BAD_REQUEST);

    let anonymous = k
        .call(
            Method::POST,
            "/api/ai/import",
            None,
            Some(json!({ "text": "Soup" })),
        )
        .await;
    assert_eq!(anonymous.status, StatusCode::UNAUTHORIZED);
    let cookie = k.login().await;
    let imported = k
        .call(
            Method::POST,
            "/api/ai/import",
            Some(&cookie),
            Some(json!({ "text": "Soup: boil water." })),
        )
        .await;
    assert_eq!(imported.status, StatusCode::OK);
    assert_eq!(imported.json()["recipe"]["title"], "Imported soup");
    assert!(imported.json()["checks"].is_array());
}

#[tokio::test]
async fn ai_failures_are_relayed_calmly() {
    let k = kitchen_with(Some(Arc::new(Canned(Err(AiError::Quota)))), None);
    let chat =
        json!({ "recipeId": "mains/lentil-soup", "recipe": recipe(json!({})), "question": "Hi" });
    let reply = k
        .call(Method::POST, "/api/ai/chat", None, Some(chat.clone()))
        .await;
    assert_eq!(reply.status, StatusCode::TOO_MANY_REQUESTS);
    assert_eq!(
        reply.json()["message"],
        "The sous-chef has reached today's limit. Try again tomorrow."
    );

    let off = kitchen();
    let disabled = off
        .call(Method::POST, "/api/ai/chat", None, Some(chat))
        .await;
    assert_eq!(disabled.status, StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(disabled.json()["error"], "ai_disabled");
}

#[tokio::test]
async fn the_site_is_served_with_a_spa_fallback_and_cache_headers() {
    let web = TempDir::new().unwrap();
    fs::create_dir_all(web.path().join("_app/immutable")).unwrap();
    fs::write(
        web.path().join("index.html"),
        "<html>shell</html>".repeat(20),
    )
    .unwrap();
    fs::write(web.path().join("about.html"), "<html>about</html>").unwrap();
    fs::write(web.path().join("_app/immutable/app.js"), "console.log(1)").unwrap();
    let k = kitchen_with(None, Some(web.path()));

    let home = k.get("/").await;
    assert_eq!(home.status, StatusCode::OK);
    assert_eq!(home.headers[header::CACHE_CONTROL], "no-cache");
    assert_eq!(home.headers[header::X_CONTENT_TYPE_OPTIONS], "nosniff");

    let about = k.get("/about").await;
    assert!(String::from_utf8_lossy(&about.body).contains("about"));

    let route = k.get("/recipe/mains/lentil-soup").await;
    assert_eq!(route.status, StatusCode::OK);
    assert!(String::from_utf8_lossy(&route.body).contains("shell"));

    let asset = k.get("/_app/immutable/app.js").await;
    assert!(
        asset.headers[header::CACHE_CONTROL]
            .to_str()
            .unwrap()
            .contains("immutable")
    );

    let compressed = k
        .send(
            Request::builder()
                .uri("/")
                .header(header::ACCEPT_ENCODING, "gzip")
                .body(Body::empty())
                .unwrap(),
        )
        .await;
    assert_eq!(compressed.headers[header::CONTENT_ENCODING], "gzip");

    let missing_api = k.get("/api/nothing").await;
    assert_eq!(missing_api.status, StatusCode::NOT_FOUND);
    assert_eq!(missing_api.json()["error"], "not_found");

    let escape = k.get("/%2e%2e/%2e%2e/etc/passwd").await;
    assert!(!String::from_utf8_lossy(&escape.body).contains("root:"));
}
