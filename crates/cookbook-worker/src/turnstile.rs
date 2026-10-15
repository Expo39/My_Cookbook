//! Cloudflare Turnstile, which keeps scripts from using the sous-chef. It is enforced only when the
//! `TURNSTILE_SECRET` secret is set, so a Worker without it behaves as before.

pub const VERIFY_URL: &str = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
/// The header the browser sends the widget's token in.
pub const HEADER: &str = "X-Turnstile-Token";
/// Tokens are at most 2048 characters long.
const TOKEN_MAX: usize = 2048;

/// Form-encodes one value: everything but the unreserved characters is percent-encoded.
fn encode(value: &str) -> String {
    value
        .bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                (b as char).to_string()
            }
            _ => format!("%{b:02X}"),
        })
        .collect()
}

/// A token worth sending to Cloudflare: present, not blank and not oversized.
pub fn usable(token: Option<&str>) -> Option<&str> {
    token
        .map(str::trim)
        .filter(|t| !t.is_empty() && t.len() <= TOKEN_MAX)
}

/// The `application/x-www-form-urlencoded` body for the siteverify call.
pub fn form_body(secret: &str, token: &str, ip: Option<&str>) -> String {
    let mut body = format!("secret={}&response={}", encode(secret), encode(token));
    if let Some(ip) = ip {
        body.push_str(&format!("&remoteip={}", encode(ip)));
    }
    body
}

/// Whether Cloudflare's answer says the token was good.
pub fn passed(answer: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(answer)
        .ok()
        .and_then(|v| v.get("success").and_then(serde_json::Value::as_bool))
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_form_body_is_encoded() {
        assert_eq!(
            form_body("0x4A+b", "a.b_c-d", Some("2001:db8::1")),
            "secret=0x4A%2Bb&response=a.b_c-d&remoteip=2001%3Adb8%3A%3A1"
        );
        assert_eq!(form_body("s", "t", None), "secret=s&response=t");
    }

    #[test]
    fn only_a_success_passes() {
        assert!(passed(r#"{"success":true,"hostname":"x"}"#));
        assert!(!passed(
            r#"{"success":false,"error-codes":["invalid-input-response"]}"#
        ));
        assert!(!passed("not json"));
        assert!(!passed("{}"));
    }

    #[test]
    fn blank_or_huge_tokens_are_not_sent() {
        assert_eq!(usable(Some(" t ")), Some("t"));
        assert_eq!(usable(Some("  ")), None);
        assert_eq!(usable(None), None);
        assert_eq!(usable(Some(&"x".repeat(TOKEN_MAX + 1))), None);
    }
}
