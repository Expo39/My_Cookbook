//! The admin password check, the signed session cookie and the attempt limiter.

use std::{
    collections::HashMap,
    time::{Duration, Instant},
};

use argon2::{
    Argon2,
    password_hash::{PasswordHasher, PasswordVerifier},
};
use hmac::{Hmac, KeyInit, Mac};
use sha2::Sha256;

pub const COOKIE_NAME: &str = "cookbook_session";
pub const SESSION_SECONDS: u64 = 12 * 60 * 60;

pub fn hash_password(password: &str) -> Result<String, String> {
    hash_with(&Argon2::default(), password)
}

pub fn hash_with(argon2: &Argon2<'_>, password: &str) -> Result<String, String> {
    argon2
        .hash_password(password.as_bytes())
        .map(|hash| hash.to_string())
        .map_err(|e| e.to_string())
}

/// The parameters come from the stored hash, so a hash made with cheaper settings still verifies.
pub fn check_password(hash: &str, password: &str) -> bool {
    Argon2::default()
        .verify_password(password.as_bytes(), hash)
        .is_ok()
}

fn mac(secret: &[u8], expiry: &str) -> Hmac<Sha256> {
    let mut mac = Hmac::<Sha256>::new_from_slice(secret).expect("HMAC accepts keys of any length");
    mac.update(b"session:");
    mac.update(expiry.as_bytes());
    mac
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn hex_decode(text: &str) -> Option<Vec<u8>> {
    if !text.len().is_multiple_of(2) || !text.is_ascii() {
        return None;
    }
    (0..text.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&text[i..i + 2], 16).ok())
        .collect()
}

/// A token is `<expiry as unix seconds>.<hex HMAC-SHA256>`.
pub fn issue(secret: &[u8], now: u64) -> String {
    let expiry = (now + SESSION_SECONDS).to_string();
    let tag = mac(secret, &expiry).finalize().into_bytes();
    format!("{expiry}.{}", hex_encode(&tag))
}

pub fn is_valid(secret: &[u8], token: &str, now: u64) -> bool {
    let Some((expiry, tag)) = token.split_once('.') else {
        return false;
    };
    let (Ok(expires), Some(tag)) = (expiry.parse::<u64>(), hex_decode(tag)) else {
        return false;
    };
    mac(secret, expiry).verify_slice(&tag).is_ok() && expires > now
}

pub fn set_cookie(token: &str, secure: bool) -> String {
    format!(
        "{COOKIE_NAME}={token}; Path=/; Max-Age={SESSION_SECONDS}; HttpOnly; SameSite=Strict{}",
        if secure { "; Secure" } else { "" }
    )
}

pub fn clear_cookie(secure: bool) -> String {
    format!(
        "{COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict{}",
        if secure { "; Secure" } else { "" }
    )
}

/// Finds the session token in a `Cookie` header value.
pub fn token_from_cookies(header: &str) -> Option<&str> {
    header.split(';').find_map(|pair| {
        let (name, value) = pair.trim().split_once('=')?;
        (name == COOKIE_NAME).then_some(value)
    })
}

/// A fixed-window counter per key, kept in memory.
pub struct Limiter {
    max: u32,
    window: Duration,
    entries: HashMap<String, (Instant, u32)>,
}

impl Limiter {
    pub fn new(max: u32, window: Duration) -> Self {
        Self {
            max,
            window,
            entries: HashMap::new(),
        }
    }

    /// Seconds to wait if the key is at its limit.
    pub fn blocked_for(&self, key: &str, now: Instant) -> Option<u64> {
        let (started, count) = self.entries.get(key)?;
        let elapsed = now.saturating_duration_since(*started);
        (*count >= self.max && elapsed < self.window)
            .then(|| (self.window - elapsed).as_secs().max(1))
    }

    pub fn record(&mut self, key: &str, now: Instant) {
        if self.entries.len() > 1024 {
            let window = self.window;
            self.entries
                .retain(|_, (started, _)| now.saturating_duration_since(*started) < window);
        }
        let entry = self.entries.entry(key.to_owned()).or_insert((now, 0));
        if now.saturating_duration_since(entry.0) >= self.window {
            *entry = (now, 0);
        }
        entry.1 += 1;
    }

    pub fn clear(&mut self, key: &str) {
        self.entries.remove(key);
    }
}

#[cfg(test)]
mod tests {
    use argon2::{Algorithm, Params, Version};

    use super::*;

    const SECRET: &[u8] = b"0123456789abcdef0123456789abcdef";

    pub fn cheap_hash(password: &str) -> String {
        let params = Params::new(8, 1, 1, None).unwrap();
        hash_with(
            &Argon2::new(Algorithm::Argon2id, Version::V0x13, params),
            password,
        )
        .unwrap()
    }

    #[test]
    fn passwords_verify_against_their_hash() {
        let hash = cheap_hash("correct horse");
        assert!(hash.starts_with("$argon2id$"));
        assert!(check_password(&hash, "correct horse"));
        assert!(!check_password(&hash, "wrong"));
        assert!(!check_password("not a hash", "correct horse"));
    }

    #[test]
    fn hashes_are_salted() {
        assert_ne!(cheap_hash("same"), cheap_hash("same"));
    }

    #[test]
    fn a_fresh_token_is_valid_for_twelve_hours() {
        let token = issue(SECRET, 1_000);
        assert!(is_valid(SECRET, &token, 1_000));
        assert!(is_valid(SECRET, &token, 1_000 + SESSION_SECONDS - 1));
        assert!(!is_valid(SECRET, &token, 1_000 + SESSION_SECONDS));
    }

    #[test]
    fn forged_or_damaged_tokens_fail() {
        let token = issue(SECRET, 1_000);
        assert!(!is_valid(
            b"another secret entirely, 32 chars!",
            &token,
            1_000
        ));
        let (expiry, tag) = token.split_once('.').unwrap();
        let later = format!("{}.{tag}", expiry.parse::<u64>().unwrap() + 1000);
        assert!(!is_valid(SECRET, &later, 1_000));
        for bad in ["", "x", "1.zz", "abc.00", "5."] {
            assert!(!is_valid(SECRET, bad, 1_000), "{bad:?}");
        }
    }

    #[test]
    fn the_cookie_is_hardened() {
        let cookie = set_cookie("t", true);
        for part in [
            "HttpOnly",
            "Secure",
            "SameSite=Strict",
            "Max-Age=43200",
            "Path=/",
        ] {
            assert!(cookie.contains(part), "{cookie}");
        }
        assert!(!set_cookie("t", false).contains("Secure"));
        assert!(clear_cookie(true).contains("Max-Age=0"));
    }

    #[test]
    fn the_token_is_found_among_other_cookies() {
        assert_eq!(
            token_from_cookies("theme=dark; cookbook_session=abc.def; x=1"),
            Some("abc.def")
        );
        assert_eq!(token_from_cookies("theme=dark"), None);
    }

    #[test]
    fn the_limiter_blocks_then_releases() {
        let mut limiter = Limiter::new(2, Duration::from_secs(60));
        let start = Instant::now();
        assert!(limiter.blocked_for("a", start).is_none());
        limiter.record("a", start);
        limiter.record("a", start);
        assert!(limiter.blocked_for("a", start).is_some());
        assert!(limiter.blocked_for("b", start).is_none());
        assert!(
            limiter
                .blocked_for("a", start + Duration::from_secs(61))
                .is_none()
        );
        limiter.clear("a");
        assert!(limiter.blocked_for("a", start).is_none());
    }
}
