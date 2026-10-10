use serde::Deserialize;
use thiserror::Error;

/// Everything that can go wrong with a Gemini call. The `Display` text is safe to show to a cook.
#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum AiError {
    #[error("The sous-chef has reached today's limit. Try again tomorrow.")]
    Quota,
    #[error("The sous-chef is not set up properly at the moment. Please tell Antonio.")]
    InvalidKey,
    #[error("The sous-chef would rather not answer that one. Try rephrasing the question.")]
    Blocked,
    #[error("The answer ran out of room before it was finished. Try a shorter question.")]
    Truncated,
    #[error("The sous-chef had nothing to say. Please try again.")]
    Empty,
    #[error("The sous-chef is busy at the moment. Try again in a few minutes.")]
    Unavailable,
    #[error("The sous-chef could not make sense of that. Please try again.")]
    BadOutput(String),
}

#[derive(Deserialize)]
struct Body {
    error: Option<Detail>,
}

#[derive(Deserialize)]
struct Detail {
    #[serde(default)]
    message: String,
    #[serde(default)]
    status: String,
    #[serde(default)]
    details: Vec<serde_json::Value>,
}

impl AiError {
    /// Maps a non-success Gemini response onto an error.
    pub fn from_response(status: u16, body: &str) -> Self {
        let detail = serde_json::from_str::<Body>(body)
            .ok()
            .and_then(|b| b.error);
        let (reported, message, has_key_reason) = detail.map_or_else(
            || (String::new(), String::new(), false),
            |d| {
                let reason = d
                    .details
                    .iter()
                    .any(|v| v.get("reason").and_then(|r| r.as_str()) == Some("API_KEY_INVALID"));
                (d.status, d.message.to_lowercase(), reason)
            },
        );
        if status == 429 || reported == "RESOURCE_EXHAUSTED" {
            return Self::Quota;
        }
        if has_key_reason
            || matches!(status, 401 | 403)
            || matches!(reported.as_str(), "UNAUTHENTICATED" | "PERMISSION_DENIED")
            || message.contains("api key")
        {
            return Self::InvalidKey;
        }
        Self::Unavailable
    }

    /// A short stable code for JSON error bodies.
    pub fn code(&self) -> &'static str {
        match self {
            Self::Quota => "quota",
            Self::InvalidKey => "invalid_key",
            Self::Blocked => "blocked",
            Self::Truncated => "truncated",
            Self::Empty => "empty",
            Self::Unavailable => "unavailable",
            Self::BadOutput(_) => "bad_output",
        }
    }

    /// The status this error should be relayed with.
    pub fn http_status(&self) -> u16 {
        match self {
            Self::Quota => 429,
            Self::Blocked | Self::Truncated | Self::Empty => 422,
            Self::InvalidKey | Self::Unavailable | Self::BadOutput(_) => 502,
        }
    }

    pub fn message(&self) -> String {
        self.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_429_is_the_daily_limit() {
        let e = AiError::from_response(
            429,
            r#"{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}"#,
        );
        assert_eq!(e, AiError::Quota);
        assert_eq!(
            e.message(),
            "The sous-chef has reached today's limit. Try again tomorrow."
        );
        assert_eq!(e.http_status(), 429);
    }

    #[test]
    fn exhausted_quota_is_recognised_without_the_status_code() {
        let e = AiError::from_response(200, r#"{"error":{"status":"RESOURCE_EXHAUSTED"}}"#);
        assert_eq!(e, AiError::Quota);
    }

    #[test]
    fn a_bad_key_is_recognised_by_reason_message_or_status() {
        let by_reason = r#"{"error":{"code":400,"message":"x","status":"INVALID_ARGUMENT","details":[{"reason":"API_KEY_INVALID"}]}}"#;
        assert_eq!(AiError::from_response(400, by_reason), AiError::InvalidKey);
        let by_message =
            r#"{"error":{"message":"API key not valid. Please pass a valid API key."}}"#;
        assert_eq!(AiError::from_response(400, by_message), AiError::InvalidKey);
        assert_eq!(AiError::from_response(403, "{}"), AiError::InvalidKey);
    }

    #[test]
    fn the_key_problem_is_not_blamed_on_the_cook() {
        assert_eq!(AiError::InvalidKey.http_status(), 502);
        assert!(!AiError::InvalidKey.message().to_lowercase().contains("key"));
    }

    #[test]
    fn anything_else_is_a_busy_service() {
        assert_eq!(
            AiError::from_response(503, "not json"),
            AiError::Unavailable
        );
        assert_eq!(AiError::from_response(500, "{}"), AiError::Unavailable);
    }

    #[test]
    fn codes_are_distinct() {
        let all = [
            AiError::Quota,
            AiError::InvalidKey,
            AiError::Blocked,
            AiError::Truncated,
            AiError::Empty,
            AiError::Unavailable,
            AiError::BadOutput(String::new()),
        ];
        let mut codes: Vec<_> = all.iter().map(AiError::code).collect();
        codes.sort_unstable();
        codes.dedup();
        assert_eq!(codes.len(), all.len());
    }

    #[test]
    fn user_messages_are_in_british_english_and_do_not_leak_detail() {
        let e = AiError::BadOutput("expected value at line 1".to_owned());
        assert!(!e.message().contains("line 1"));
    }
}
