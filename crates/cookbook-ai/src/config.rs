use serde::{Deserialize, Serialize};

/// The current free-tier Gemini Flash model, per <https://ai.google.dev/gemini-api/docs/pricing>.
pub const DEFAULT_MODEL: &str = "gemini-3.8-flash";

const API_BASE: &str = "https://generativelanguage.googleapis.com/v1beta";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeminiConfig {
    pub model: String,
    pub temperature: f32,
    pub max_output_tokens: u32,
}

impl Default for GeminiConfig {
    fn default() -> Self {
        Self {
            model: DEFAULT_MODEL.to_owned(),
            temperature: 0.4,
            max_output_tokens: 1024,
        }
    }
}

impl GeminiConfig {
    /// Reads `GEMINI_MODEL`, `GEMINI_TEMPERATURE` and `GEMINI_MAX_OUTPUT_TOKENS` through `lookup`,
    /// so each host can supply its own environment. Blank or unparsable values fall back to the defaults.
    pub fn from_lookup(lookup: impl Fn(&str) -> Option<String>) -> Self {
        let defaults = Self::default();
        let value = |name: &str| lookup(name).map(|v| v.trim().to_owned()).filter(|v| !v.is_empty());
        Self {
            model: value("GEMINI_MODEL").unwrap_or(defaults.model),
            temperature: value("GEMINI_TEMPERATURE")
                .and_then(|v| v.parse().ok())
                .filter(|t| (0.0..=2.0).contains(t))
                .unwrap_or(defaults.temperature),
            max_output_tokens: value("GEMINI_MAX_OUTPUT_TOKENS")
                .and_then(|v| v.parse().ok())
                .filter(|n| *n > 0)
                .unwrap_or(defaults.max_output_tokens),
        }
    }

    /// The same configuration with a larger output allowance, for the importer's JSON.
    pub fn for_import(&self) -> Self {
        Self {
            max_output_tokens: self.max_output_tokens.max(8192),
            temperature: self.temperature.min(0.2),
            ..self.clone()
        }
    }
}

/// The `generateContent` URL. Send the key in the `x-goog-api-key` header, never in the query string.
pub fn endpoint(model: &str) -> String {
    format!("{API_BASE}/models/{model}:generateContent")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_apply_without_an_environment() {
        let config = GeminiConfig::from_lookup(|_| None);
        assert_eq!(config, GeminiConfig::default());
        assert_eq!(config.model, DEFAULT_MODEL);
    }

    #[test]
    fn the_environment_overrides_valid_values_only() {
        let config = GeminiConfig::from_lookup(|name| {
            match name {
                "GEMINI_MODEL" => Some(" gemini-x "),
                "GEMINI_TEMPERATURE" => Some("9"),
                "GEMINI_MAX_OUTPUT_TOKENS" => Some("2048"),
                _ => None,
            }
            .map(str::to_owned)
        });
        assert_eq!(config.model, "gemini-x");
        assert_eq!(config.temperature, GeminiConfig::default().temperature);
        assert_eq!(config.max_output_tokens, 2048);
    }

    #[test]
    fn blank_models_are_ignored() {
        let config = GeminiConfig::from_lookup(|_| Some("  ".to_owned()));
        assert_eq!(config.model, DEFAULT_MODEL);
    }

    #[test]
    fn imports_get_room_and_a_low_temperature() {
        let config = GeminiConfig::default().for_import();
        assert!(config.max_output_tokens >= 8192);
        assert!(config.temperature <= 0.2);
    }

    #[test]
    fn the_endpoint_names_the_model() {
        assert_eq!(
            endpoint("m"),
            "https://generativelanguage.googleapis.com/v1beta/models/m:generateContent"
        );
    }
}
