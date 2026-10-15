# cookbook-ai

The Gemini prompts, the request and response types, and the request validation shared by the AI Worker (`cookbook-worker`) and the self-hosted server (`cookbook-server`). Keeping them in one crate means the sous-chef and the importer behave the same on both.

The crate does no IO and carries no HTTP client, so it builds for native targets and `wasm32` alike. Each caller sends the request with its own HTTP stack.

## Public surface

| Item | Purpose |
|---|---|
| `GeminiConfig`, `DEFAULT_MODEL`, `endpoint`, `stream_endpoint` | the model, temperature, output limit, thinking level and fallback model, read from `GEMINI_MODEL`, `GEMINI_TEMPERATURE`, `GEMINI_MAX_OUTPUT_TOKENS`, `GEMINI_THINKING_LEVEL` and `GEMINI_FALLBACK_MODEL`, and the `generateContent` and `streamGenerateContent` URLs |
| `parse_chat`, `ChatInput`, `CHAT_MAX_BYTES` | validates a `/chat` body (`recipeId`, history, question, and the optional `recipe` that `ChatInput::own_recipe` checks) |
| `site_recipe_url`, `parse_site_recipe`, `unknown_recipe` | the published-site URL of the chat's recipe and its parser, so a published recipe is read from the site, never from the request |
| `Relay`, `SseDecoder`, `delta_event`, `done_event`, `error_event` | reads Gemini's streamed answer and writes the events the browser reads |
| `backoff_ms`, `ATTEMPTS_PER_MODEL`, `AiError::is_retryable` | when and how long to wait before asking a busy model again |
| `chat_request`, `HISTORY_TURNS`, `MESSAGE_CHARS`, `Turn`, `Role` | builds the sous-chef request, scoped to one recipe |
| `parse_import`, `IMPORT_MAX_BYTES` | validates an `/import` body |
| `import_request`, `import_schema`, `parse_import_response`, `Imported` | builds the importer request with a response schema, and turns the reply into a `Recipe` with its checklist results |
| `Request`, `Response`, `Reply` and the other Gemini types | the wire format |
| `AiError`, `ApiError` | errors with a message fit to show to a cook |

## Tests

Unit tests sit beside the code in each module.

```sh
cargo nextest run -p cookbook-ai
```

CI also builds the crate for `wasm32-unknown-unknown` together with the Worker.
