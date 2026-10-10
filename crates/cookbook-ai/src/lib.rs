//! Gemini request and response types and the prompts for the sous-chef and the importer.
//! The crate does no IO and carries no HTTP client, so it builds for native and wasm32 alike.

mod config;
mod error;
mod prompts;
mod schema;
mod types;

pub use config::{DEFAULT_MODEL, GeminiConfig, endpoint};
pub use error::AiError;
pub use prompts::{
    HISTORY_TURNS, MESSAGE_CHARS, Imported, Role, Turn, chat_request, import_request,
    parse_import_response,
};
pub use schema::import_schema;
pub use types::{
    Candidate, Content, GenerationConfig, Part, PromptFeedback, Reply, Request, Response,
};
