//! The admin proof: `<unix milliseconds>.<hex HMAC-SHA256 of that timestamp>`, keyed with `ADMIN_IMPORT_SECRET`.

use hmac::{Hmac, KeyInit, Mac};
use sha2::Sha256;

/// How long a proof stays valid.
pub const VALIDITY_MS: u64 = 5 * 60 * 1000;
/// How far ahead of the worker's clock a proof may be stamped.
const SKEW_MS: u64 = 30 * 1000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AuthError {
    Missing,
    Malformed,
    Expired,
    Invalid,
}

fn mac(secret: &str, timestamp: &str) -> Hmac<Sha256> {
    let mut mac =
        Hmac::<Sha256>::new_from_slice(secret.as_bytes()).expect("HMAC accepts keys of any length");
    mac.update(timestamp.as_bytes());
    mac
}

pub fn hex_encode(bytes: &[u8]) -> String {
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

/// Builds the header value. The admin UI does the same with Web Crypto.
pub fn sign(secret: &str, timestamp_ms: u64) -> String {
    let timestamp = timestamp_ms.to_string();
    let tag = mac(secret, &timestamp).finalize().into_bytes();
    format!("{timestamp}.{}", hex_encode(&tag))
}

pub fn verify(secret: &str, header: Option<&str>, now_ms: u64) -> Result<(), AuthError> {
    let header = header
        .map(str::trim)
        .filter(|h| !h.is_empty())
        .ok_or(AuthError::Missing)?;
    let (timestamp, tag) = header.split_once('.').ok_or(AuthError::Malformed)?;
    let stamped: u64 = timestamp.parse().map_err(|_| AuthError::Malformed)?;
    let tag = hex_decode(tag).ok_or(AuthError::Malformed)?;
    // The tag is checked first, in constant time, so timing reveals nothing about the window.
    mac(secret, timestamp)
        .verify_slice(&tag)
        .map_err(|_| AuthError::Invalid)?;
    if stamped > now_ms + SKEW_MS || now_ms.saturating_sub(stamped) > VALIDITY_MS {
        return Err(AuthError::Expired);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOW: u64 = 1_800_000_000_000;

    #[test]
    fn the_hmac_matches_a_known_vector() {
        // HMAC-SHA256("key", "The quick brown fox jumps over the lazy dog")
        let tag = mac("key", "The quick brown fox jumps over the lazy dog")
            .finalize()
            .into_bytes();
        assert_eq!(
            hex_encode(&tag),
            "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8"
        );
    }

    #[test]
    fn a_fresh_proof_is_accepted() {
        assert_eq!(
            verify("s3cret", Some(&sign("s3cret", NOW)), NOW + 1_000),
            Ok(())
        );
    }

    #[test]
    fn the_window_is_five_minutes() {
        let proof = sign("s3cret", NOW);
        assert_eq!(verify("s3cret", Some(&proof), NOW + VALIDITY_MS), Ok(()));
        assert_eq!(
            verify("s3cret", Some(&proof), NOW + VALIDITY_MS + 1),
            Err(AuthError::Expired)
        );
    }

    #[test]
    fn proofs_from_the_future_are_refused_beyond_a_small_skew() {
        assert_eq!(
            verify("s3cret", Some(&sign("s3cret", NOW + 10_000)), NOW),
            Ok(())
        );
        assert_eq!(
            verify("s3cret", Some(&sign("s3cret", NOW + 120_000)), NOW),
            Err(AuthError::Expired)
        );
    }

    #[test]
    fn the_wrong_secret_or_a_changed_timestamp_fails() {
        let proof = sign("s3cret", NOW);
        assert_eq!(verify("other", Some(&proof), NOW), Err(AuthError::Invalid));
        let (_, tag) = proof.split_once('.').unwrap();
        let forged = format!("{}.{tag}", NOW + 1);
        assert_eq!(
            verify("s3cret", Some(&forged), NOW + 1),
            Err(AuthError::Invalid)
        );
    }

    #[test]
    fn bad_headers_are_classified() {
        assert_eq!(verify("s", None, NOW), Err(AuthError::Missing));
        assert_eq!(verify("s", Some("  "), NOW), Err(AuthError::Missing));
        assert_eq!(verify("s", Some("nodot"), NOW), Err(AuthError::Malformed));
        assert_eq!(verify("s", Some("abc.00"), NOW), Err(AuthError::Malformed));
        assert_eq!(verify("s", Some("1.zz"), NOW), Err(AuthError::Malformed));
        assert_eq!(verify("s", Some("1.abc"), NOW), Err(AuthError::Malformed));
    }

    #[test]
    fn hex_round_trips() {
        assert_eq!(
            hex_decode(&hex_encode(&[0, 15, 255])),
            Some(vec![0, 15, 255])
        );
    }
}
