use serde::{Deserialize, Serialize};

use crate::error::AiError;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Request {
    pub contents: Vec<Content>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub system_instruction: Option<Content>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub generation_config: Option<GenerationConfig>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Content {
    /// `user` or `model`; omitted for the system instruction.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
    #[serde(default)]
    pub parts: Vec<Part>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Part {
    #[serde(default)]
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerationConfig {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_output_tokens: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub response_mime_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub response_schema: Option<serde_json::Value>,
}

impl Content {
    pub(crate) fn text(role: Option<&str>, text: impl Into<String>) -> Self {
        Self {
            role: role.map(str::to_owned),
            parts: vec![Part { text: text.into() }],
        }
    }
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Response {
    #[serde(default)]
    pub candidates: Vec<Candidate>,
    #[serde(default)]
    pub prompt_feedback: Option<PromptFeedback>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Candidate {
    #[serde(default)]
    pub content: Option<Content>,
    #[serde(default)]
    pub finish_reason: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptFeedback {
    #[serde(default)]
    pub block_reason: Option<String>,
}

/// What a successful call produced.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Reply {
    pub text: String,
    /// The model ran out of output tokens, so the text may stop mid-sentence.
    pub truncated: bool,
}

const BLOCKED_FINISH: &[&str] = &[
    "SAFETY",
    "PROHIBITED_CONTENT",
    "BLOCKLIST",
    "SPII",
    "RECITATION",
    "IMAGE_SAFETY",
];

impl Response {
    pub fn from_json(body: &str) -> Result<Self, AiError> {
        serde_json::from_str(body).map_err(|e| AiError::BadOutput(e.to_string()))
    }

    fn finish_reason(&self) -> Option<&str> {
        self.candidates
            .first()
            .and_then(|c| c.finish_reason.as_deref())
    }

    /// True when the first candidate stopped because it ran out of output tokens.
    pub fn is_truncated(&self) -> bool {
        self.finish_reason() == Some("MAX_TOKENS")
    }

    /// The first candidate's text, or the reason there is none.
    pub fn reply(&self) -> Result<Reply, AiError> {
        if self
            .prompt_feedback
            .as_ref()
            .and_then(|f| f.block_reason.as_ref())
            .is_some()
        {
            return Err(AiError::Blocked);
        }
        if self.finish_reason().is_some_and(|r| BLOCKED_FINISH.contains(&r)) {
            return Err(AiError::Blocked);
        }
        let text: String = self
            .candidates
            .first()
            .and_then(|c| c.content.as_ref())
            .map(|c| c.parts.iter().map(|p| p.text.as_str()).collect())
            .unwrap_or_default();
        if text.trim().is_empty() {
            return Err(if self.is_truncated() {
                AiError::Truncated
            } else {
                AiError::Empty
            });
        }
        Ok(Reply {
            text,
            truncated: self.is_truncated(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn response(json: &str) -> Response {
        Response::from_json(json).expect("the fixture parses")
    }

    #[test]
    fn text_parts_are_joined() {
        let reply = response(
            r#"{"candidates":[{"content":{"role":"model","parts":[{"text":"Hello, "},{"text":"cook."}]},"finishReason":"STOP"}]}"#,
        )
        .reply()
        .unwrap();
        assert_eq!(reply.text, "Hello, cook.");
        assert!(!reply.truncated);
    }

    #[test]
    fn max_tokens_is_flagged() {
        let r = response(
            r#"{"candidates":[{"content":{"parts":[{"text":"Half a sen"}]},"finishReason":"MAX_TOKENS"}]}"#,
        );
        assert!(r.is_truncated());
        assert!(r.reply().unwrap().truncated);
    }

    #[test]
    fn max_tokens_with_nothing_written_is_an_error() {
        let r = response(r#"{"candidates":[{"finishReason":"MAX_TOKENS"}]}"#);
        assert_eq!(r.reply().unwrap_err(), AiError::Truncated);
    }

    #[test]
    fn a_blocked_prompt_is_reported() {
        let r = response(r#"{"promptFeedback":{"blockReason":"SAFETY"}}"#);
        assert_eq!(r.reply().unwrap_err(), AiError::Blocked);
    }

    #[test]
    fn a_blocked_candidate_is_reported() {
        let r = response(r#"{"candidates":[{"finishReason":"SAFETY"}]}"#);
        assert_eq!(r.reply().unwrap_err(), AiError::Blocked);
    }

    #[test]
    fn no_candidates_is_empty() {
        assert_eq!(response("{}").reply().unwrap_err(), AiError::Empty);
    }

    #[test]
    fn unknown_fields_are_ignored() {
        let r = response(r#"{"candidates":[],"usageMetadata":{"totalTokenCount":3}}"#);
        assert!(r.candidates.is_empty());
    }

    #[test]
    fn requests_serialise_in_camel_case_without_empty_options() {
        let request = Request {
            contents: vec![Content::text(Some("user"), "Hi")],
            system_instruction: None,
            generation_config: Some(GenerationConfig {
                max_output_tokens: Some(5),
                ..GenerationConfig::default()
            }),
        };
        let value = serde_json::to_value(&request).unwrap();
        assert_eq!(value["generationConfig"]["maxOutputTokens"], 5);
        assert!(value.get("systemInstruction").is_none());
        assert!(value["generationConfig"].get("temperature").is_none());
    }
}
