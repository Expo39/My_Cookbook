//! Server-sent events: reading Gemini's `streamGenerateContent?alt=sse` answer as it arrives, and
//! writing the events the browser reads.
//!
//! The browser receives `delta` events with `{"text": ...}`, then one `done` event with
//! `{"truncated": bool}`, or an `error` event with `{"error": code, "message": text}` instead.

use serde_json::{Value, json};

use crate::{error::AiError, types::Response};

/// Collects bytes until whole events have arrived, and hands back the `data` of each.
#[derive(Debug, Default)]
pub struct SseDecoder {
    pending: Vec<u8>,
}

impl SseDecoder {
    pub fn new() -> Self {
        Self::default()
    }

    /// Adds `bytes` and returns the data of every event they complete. A chunk may end mid-line,
    /// or even mid-character, so nothing is decoded until its event's blank line has arrived.
    pub fn push(&mut self, bytes: &[u8]) -> Vec<String> {
        self.pending.extend_from_slice(bytes);
        let mut events = Vec::new();
        while let Some((end, gap)) = event_end(&self.pending) {
            let block: Vec<u8> = self.pending.drain(..end + gap).collect();
            if let Some(data) = data_of(&String::from_utf8_lossy(&block[..end])) {
                events.push(data);
            }
        }
        events
    }

    /// The data of a last event that was not followed by a blank line.
    pub fn finish(&mut self) -> Option<String> {
        let rest = std::mem::take(&mut self.pending);
        data_of(&String::from_utf8_lossy(&rest))
    }
}

/// Where the first event ends, and how long the blank line after it is.
fn event_end(bytes: &[u8]) -> Option<(usize, usize)> {
    (0..bytes.len()).find_map(|i| {
        if bytes[i..].starts_with(b"\r\n\r\n") {
            Some((i, 4))
        } else if bytes[i..].starts_with(b"\n\n") {
            Some((i, 2))
        } else {
            None
        }
    })
}

fn data_of(block: &str) -> Option<String> {
    let lines: Vec<&str> = block
        .lines()
        .filter_map(|line| line.strip_prefix("data:"))
        .map(|rest| rest.strip_prefix(' ').unwrap_or(rest))
        .collect();
    (!lines.is_empty()).then(|| lines.join("\n"))
}

/// One event in the stream sent to the browser.
pub fn sse_event(name: &str, data: &Value) -> String {
    format!("event: {name}\ndata: {data}\n\n")
}

pub fn delta_event(text: &str) -> String {
    sse_event("delta", &json!({ "text": text }))
}

pub fn done_event(truncated: bool) -> String {
    sse_event("done", &json!({ "truncated": truncated }))
}

pub fn error_event(error: &AiError) -> String {
    sse_event(
        "error",
        &json!({ "error": error.code(), "message": error.message() }),
    )
}

/// Follows a streamed answer chunk by chunk and turns it into the browser's events.
#[derive(Debug, Default)]
pub struct Relay {
    decoder: SseDecoder,
    wrote: bool,
    truncated: bool,
    finished: bool,
}

impl Relay {
    pub fn new() -> Self {
        Self::default()
    }

    /// The events for the bytes that just arrived. After an error nothing more is written.
    pub fn push(&mut self, bytes: &[u8]) -> String {
        let data = self.decoder.push(bytes);
        data.iter().map(|d| self.event(d)).collect()
    }

    /// The closing event once Gemini's stream has ended.
    pub fn end(&mut self) -> String {
        let mut out = self
            .decoder
            .finish()
            .map(|d| self.event(&d))
            .unwrap_or_default();
        if !self.finished {
            self.finished = true;
            out.push_str(&if self.wrote {
                done_event(self.truncated)
            } else if self.truncated {
                error_event(&AiError::Truncated)
            } else {
                error_event(&AiError::Empty)
            });
        }
        out
    }

    /// The event for a stream that broke off part way.
    pub fn fail(&mut self, error: &AiError) -> String {
        if self.finished {
            return String::new();
        }
        self.finished = true;
        error_event(error)
    }

    fn event(&mut self, data: &str) -> String {
        if self.finished {
            return String::new();
        }
        let piece = Response::from_json(data).and_then(|r| r.piece());
        match piece {
            Ok(piece) => {
                self.truncated |= piece.is_truncated();
                if piece.text.is_empty() {
                    return String::new();
                }
                self.wrote = true;
                delta_event(&piece.text)
            }
            Err(error) => self.fail(&error),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn chunk(text: &str, finish: Option<&str>) -> String {
        let finish = finish.map_or(String::new(), |f| format!(r#","finishReason":"{f}""#));
        format!(
            "data: {{\"candidates\":[{{\"content\":{{\"parts\":[{{\"text\":{}}}]}}{finish}}}]}}\r\n\r\n",
            serde_json::to_string(text).unwrap()
        )
    }

    fn events(out: &str) -> Vec<(String, Value)> {
        let mut decoder = SseDecoder::new();
        let mut names = out.split("\n\n").filter_map(|block| {
            block
                .lines()
                .next()?
                .strip_prefix("event: ")
                .map(str::to_owned)
        });
        decoder
            .push(out.as_bytes())
            .into_iter()
            .map(|data| (names.next().unwrap(), serde_json::from_str(&data).unwrap()))
            .collect()
    }

    #[test]
    fn events_are_found_however_the_bytes_are_split() {
        let stream = format!(
            "{}{}",
            chunk("Simmer ", None),
            chunk("gently.", Some("STOP"))
        );
        for size in [1, 3, 7, 64, stream.len()] {
            let mut decoder = SseDecoder::new();
            let found: Vec<String> = stream
                .as_bytes()
                .chunks(size)
                .flat_map(|bytes| decoder.push(bytes))
                .collect();
            assert_eq!(found.len(), 2, "split every {size} bytes");
            assert!(found[1].contains("gently."));
        }
    }

    #[test]
    fn multibyte_text_survives_a_split_mid_character() {
        let stream = chunk("Crème brûlée", None);
        let bytes = stream.as_bytes();
        let cut = stream.find('è').unwrap() + 1;
        let mut decoder = SseDecoder::new();
        assert!(decoder.push(&bytes[..cut]).is_empty());
        assert!(decoder.push(&bytes[cut..])[0].contains("Crème brûlée"));
    }

    #[test]
    fn a_last_event_without_a_blank_line_is_still_read() {
        let mut decoder = SseDecoder::new();
        assert!(decoder.push(b"data: {\"a\":1}").is_empty());
        assert_eq!(decoder.finish().as_deref(), Some("{\"a\":1}"));
    }

    #[test]
    fn a_stream_becomes_deltas_and_a_done() {
        let mut relay = Relay::new();
        let mut out = relay.push(chunk("Yes, ", None).as_bytes());
        out += &relay.push(chunk("it freezes well.", Some("STOP")).as_bytes());
        out += &relay.end();
        assert_eq!(
            events(&out),
            [
                ("delta".to_owned(), json!({ "text": "Yes, " })),
                ("delta".to_owned(), json!({ "text": "it freezes well." })),
                ("done".to_owned(), json!({ "truncated": false })),
            ]
        );
    }

    #[test]
    fn running_out_of_room_is_reported() {
        let mut relay = Relay::new();
        let mut out = relay.push(chunk("Half a sen", Some("MAX_TOKENS")).as_bytes());
        out += &relay.end();
        assert_eq!(events(&out).last().unwrap().1, json!({ "truncated": true }));

        let mut empty = Relay::new();
        let out = empty.push(chunk("", Some("MAX_TOKENS")).as_bytes()) + &empty.end();
        assert_eq!(events(&out)[0].1["error"], "truncated");
    }

    #[test]
    fn a_blocked_answer_stops_the_stream_with_one_error() {
        let mut relay = Relay::new();
        let mut out = relay.push(chunk("Well", None).as_bytes());
        out += &relay.push(
            br#"data: {"candidates":[{"finishReason":"SAFETY"}]}

"#,
        );
        out += &relay.push(chunk("more", None).as_bytes());
        out += &relay.end();
        let found = events(&out);
        assert_eq!(found.len(), 2);
        assert_eq!(found[1].0, "error");
        assert_eq!(found[1].1["error"], "blocked");
    }

    #[test]
    fn nothing_said_is_an_error() {
        let mut relay = Relay::new();
        assert_eq!(events(&relay.end())[0].1["error"], "empty");
    }
}
