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
    #[error("Lots of cooks are asking at once. Try again in a minute.")]
    Busy,
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
    /// Maps a non-success Gemini response onto an error. A 429 is the day's quota only when Gemini
    /// names a per-day limit; a per-minute limit, or several cooks asking at once, clears in seconds.
    pub fn from_response(status: u16, body: &str) -> Self {
        let detail = serde_json::from_str::<Body>(body)
            .ok()
            .and_then(|b| b.error);
        let (reported, message, has_key_reason, daily) = detail.map_or_else(
            || (String::new(), String::new(), false, false),
            |d| {
                let reason = d
                    .details
                    .iter()
                    .any(|v| v.get("reason").and_then(|r| r.as_str()) == Some("API_KEY_INVALID"));
                let daily = d.details.iter().any(names_a_daily_limit)
                    || d.message.to_lowercase().contains("per day");
                (d.status, d.message.to_lowercase(), reason, daily)
            },
        );
        if status == 429 || reported == "RESOURCE_EXHAUSTED" {
            return if daily { Self::Quota } else { Self::Busy };
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

    /// Whether the same call may well succeed if it is made again in a moment.
    pub fn is_retryable(&self) -> bool {
        matches!(self, Self::Busy | Self::Unavailable)
    }

    /// Whether Gemini refused the request's thinking level, which some models do not accept.
    pub fn refuses_thinking(status: u16, body: &str) -> bool {
        status == 400 && body.to_lowercase().contains("thinking")
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
            Self::Busy => "busy",
            Self::BadOutput(_) => "bad_output",
        }
    }

    /// The status this error should be relayed with.
    pub fn http_status(&self) -> u16 {
        match self {
            Self::Quota => 429,
            Self::Blocked | Self::Truncated | Self::Empty => 422,
            Self::InvalidKey | Self::BadOutput(_) => 502,
            Self::Unavailable | Self::Busy => 503,
        }
    }

    pub fn message(&self) -> String {
        self.to_string()
    }
}

/// True for a `QuotaFailure` detail whose violated quota is counted per day.
fn names_a_daily_limit(detail: &serde_json::Value) -> bool {
    detail
        .get("violations")
        .and_then(|v| v.as_array())
        .is_some_and(|violations| {
            violations.iter().any(|v| {
                v.get("quotaId")
                    .and_then(|id| id.as_str())
                    .is_some_and(|id| id.contains("PerDay"))
            })
        })
}

/// How long to wait before attempt `attempt + 1` (from 0): about 0.6 s, then 1.2 s, then 2.4 s,
/// capped at 4 s. `jitter` in `0.0..1.0` spreads cooks who were refused together.
pub fn backoff_ms(attempt: u32, jitter: f64) -> u64 {
    let base = (600_u64 << attempt.min(6)).min(4_000) as f64;
    (base * (0.5 + jitter.clamp(0.0, 1.0))) as u64
}

/// Attempts at one model before moving on to the fallback.
pub const ATTEMPTS_PER_MODEL: u32 = 3;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_429_that_names_a_daily_quota_is_the_daily_limit() {
        let e = AiError::from_response(
            429,
            r#"{"error":{"code":429,"status":"RESOURCE_EXHAUSTED","details":[{"@type":"type.googleapis.com/google.rpc.QuotaFailure","violations":[{"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]}]}}"#,
        );
        assert_eq!(e, AiError::Quota);
        assert!(!e.is_retryable());
        assert_eq!(
            e.message(),
            "The sous-chef has reached today's limit. Try again tomorrow."
        );
        assert_eq!(e.http_status(), 429);
    }

    #[test]
    fn a_per_minute_limit_is_a_rush_worth_retrying() {
        let e = AiError::from_response(
            429,
            r#"{"error":{"code":429,"status":"RESOURCE_EXHAUSTED","details":[{"violations":[{"quotaId":"GenerateRequestsPerMinutePerProjectPerModel-FreeTier"}]}]}}"#,
        );
        assert_eq!(e, AiError::Busy);
        assert!(e.is_retryable());
        assert_eq!(e.http_status(), 503);
        assert_eq!(AiError::from_response(429, ""), AiError::Busy);
    }

    #[test]
    fn exhausted_quota_is_recognised_without_the_status_code() {
        let e = AiError::from_response(
            200,
            r#"{"error":{"status":"RESOURCE_EXHAUSTED","message":"Quota exceeded: requests per day"}}"#,
        );
        assert_eq!(e, AiError::Quota);
    }

    #[test]
    fn a_refused_thinking_level_is_recognised() {
        let body = r#"{"error":{"code":400,"message":"Thinking level minimal is not supported for this model."}}"#;
        assert!(AiError::refuses_thinking(400, body));
        assert!(!AiError::refuses_thinking(
            400,
            r#"{"error":{"message":"bad"}}"#
        ));
        assert!(!AiError::refuses_thinking(503, body));
    }

    #[test]
    fn backoff_doubles_with_jitter_and_a_ceiling() {
        assert_eq!(backoff_ms(0, 0.5), 600);
        assert_eq!(backoff_ms(1, 0.5), 1_200);
        assert_eq!(backoff_ms(0, 0.0), 300);
        assert_eq!(backoff_ms(0, 1.0), 900);
        assert_eq!(backoff_ms(9, 0.5), 4_000);
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
        assert!(AiError::Unavailable.is_retryable());
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
            AiError::Busy,
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
