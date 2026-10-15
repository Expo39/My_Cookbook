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

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct Part {
    #[serde(default)]
    pub text: String,
    /// A summary of the model's reasoning rather than part of the answer.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub thought: bool,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thinking_config: Option<ThinkingConfig>,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThinkingConfig {
    /// `minimal`, `low`, `medium` or `high`, as far as the model supports them.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thinking_level: Option<String>,
}

impl Request {
    /// The same request without a thinking level, for a model that refuses the one asked for.
    pub fn without_thinking(&self) -> Option<Self> {
        let config = self.generation_config.as_ref()?;
        config.thinking_config.as_ref()?;
        let mut request = self.clone();
        if let Some(config) = request.generation_config.as_mut() {
            config.thinking_config = None;
        }
        Some(request)
    }
}

impl Content {
    pub(crate) fn text(role: Option<&str>, text: impl Into<String>) -> Self {
        Self {
            role: role.map(str::to_owned),
            parts: vec![Part {
                text: text.into(),
                thought: false,
            }],
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

/// One event of a streamed answer: the next piece of text and, on the last one, why it stopped.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Piece {
    pub text: String,
    pub finish_reason: Option<String>,
}

impl Piece {
    pub fn is_truncated(&self) -> bool {
        self.finish_reason.as_deref() == Some("MAX_TOKENS")
    }
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

    fn blocked(&self) -> bool {
        self.prompt_feedback
            .as_ref()
            .and_then(|f| f.block_reason.as_ref())
            .is_some()
            || self
                .finish_reason()
                .is_some_and(|r| BLOCKED_FINISH.contains(&r))
    }

    /// The answer's text in the first candidate, leaving out any thought summaries.
    fn text(&self) -> String {
        self.candidates
            .first()
            .and_then(|c| c.content.as_ref())
            .map(|c| {
                c.parts
                    .iter()
                    .filter(|p| !p.thought)
                    .map(|p| p.text.as_str())
                    .collect()
            })
            .unwrap_or_default()
    }

    /// One chunk of a streamed answer, which may hold no text at all.
    pub fn piece(&self) -> Result<Piece, AiError> {
        if self.blocked() {
            return Err(AiError::Blocked);
        }
        Ok(Piece {
            text: self.text(),
            finish_reason: self.finish_reason().map(str::to_owned),
        })
    }

    /// The first candidate's text, or the reason there is none.
    pub fn reply(&self) -> Result<Reply, AiError> {
        if self.blocked() {
            return Err(AiError::Blocked);
        }
        let text = self.text();
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
    fn thought_summaries_are_left_out_of_the_answer() {
        let r = response(
            r#"{"candidates":[{"content":{"parts":[{"text":"Hmm.","thought":true},{"text":"Yes."}]}}]}"#,
        );
        assert_eq!(r.reply().unwrap().text, "Yes.");
        assert_eq!(r.piece().unwrap().text, "Yes.");
    }

    #[test]
    fn a_streamed_chunk_carries_its_text_and_finish_reason() {
        let middle = response(r#"{"candidates":[{"content":{"parts":[{"text":"Sim"}]}}]}"#);
        assert_eq!(
            middle.piece().unwrap(),
            Piece {
                text: "Sim".into(),
                finish_reason: None
            }
        );
        let last = response(r#"{"candidates":[{"finishReason":"MAX_TOKENS"}]}"#);
        assert!(last.piece().unwrap().is_truncated());
        let blocked = response(r#"{"candidates":[{"finishReason":"SAFETY"}]}"#);
        assert_eq!(blocked.piece().unwrap_err(), AiError::Blocked);
    }

    #[test]
    fn the_thinking_level_can_be_dropped() {
        let request = Request {
            contents: vec![],
            system_instruction: None,
            generation_config: Some(GenerationConfig {
                thinking_config: Some(ThinkingConfig {
                    thinking_level: Some("low".into()),
                }),
                ..GenerationConfig::default()
            }),
        };
        let value = serde_json::to_value(&request).unwrap();
        assert_eq!(
            value["generationConfig"]["thinkingConfig"]["thinkingLevel"],
            "low"
        );
        let plain = request.without_thinking().unwrap();
        assert!(plain.generation_config.unwrap().thinking_config.is_none());
        assert!(
            Request {
                generation_config: None,
                ..request
            }
            .without_thinking()
            .is_none()
        );
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
