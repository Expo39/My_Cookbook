//! Gemini request and response types and the prompts for the sous-chef and the importer.
//! The crate does no IO and carries no HTTP client, so it builds for native and wasm32 alike.

mod config;
mod error;
mod prompts;
mod request;
mod restore;
mod schema;
mod stream;
mod types;

pub use config::{DEFAULT_MODEL, DEFAULT_THINKING_LEVEL, GeminiConfig, endpoint, stream_endpoint};
pub use cookbook_core::Recipe;
pub use error::{ATTEMPTS_PER_MODEL, AiError, backoff_ms};
pub use prompts::{
    FirstImport, HISTORY_TURNS, IMPORT_EXAMPLE_INPUT, IMPORT_EXAMPLE_OUTPUT, Imported,
    MESSAGE_CHARS, RECIPE_STYLE, Role, Turn, chat_request, import_request, parse_import_response,
    repair_request, review_import, settle_import,
};
pub use request::{
    ApiError, CHAT_MAX_BYTES, ChatInput, IMPORT_MAX_BYTES, parse_chat, parse_import,
    parse_site_recipe, site_recipe_url, unknown_recipe,
};
pub use schema::import_schema;
pub use stream::{Relay, SseDecoder, delta_event, done_event, error_event, sse_event};
pub use types::{
    Candidate, Content, GenerationConfig, Part, Piece, PromptFeedback, Reply, Request, Response,
    ThinkingConfig,
};
