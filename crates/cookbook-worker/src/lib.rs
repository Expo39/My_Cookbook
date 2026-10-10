//! The Cloudflare Worker that keeps the Gemini key out of the browser.
//! The request rules are pure functions in the modules below; `handler` is the thin Workers glue.

pub mod auth;
pub mod cors;
mod handler;
pub mod limits;
pub mod validate;

use worker::{Context, Env, Request, Response, Result, event};

#[event(fetch)]
async fn fetch(req: Request, env: Env, _ctx: Context) -> Result<Response> {
    handler::handle(req, env).await
}
