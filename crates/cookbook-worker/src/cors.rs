/// Splits the comma-separated `ALLOWED_ORIGINS` value. Trailing slashes are ignored.
pub fn parse_origins(value: &str) -> Vec<String> {
    value
        .split(',')
        .map(|o| o.trim().trim_end_matches('/'))
        .filter(|o| !o.is_empty())
        .map(str::to_owned)
        .collect()
}

pub fn is_allowed(allowed: &[String], origin: &str) -> bool {
    let origin = origin.trim_end_matches('/');
    allowed.iter().any(|a| a == origin)
}

/// The headers that go on every response to an allowed origin.
pub fn response_headers(origin: &str) -> Vec<(&'static str, String)> {
    vec![
        ("Access-Control-Allow-Origin", origin.to_owned()),
        ("Vary", "Origin".to_owned()),
    ]
}

/// The extra headers for a preflight response.
pub fn preflight_headers(origin: &str) -> Vec<(&'static str, String)> {
    let mut headers = response_headers(origin);
    headers.extend([
        ("Access-Control-Allow-Methods", "POST, OPTIONS".to_owned()),
        (
            "Access-Control-Allow-Headers",
            "Content-Type, X-Admin-Proof, X-Turnstile-Token".to_owned(),
        ),
        ("Access-Control-Max-Age", "86400".to_owned()),
    ]);
    headers
}

#[cfg(test)]
mod tests {
    use super::*;

    fn allowed() -> Vec<String> {
        parse_origins("https://expo39.github.io, http://localhost:5173/ ,")
    }

    #[test]
    fn origins_are_split_and_tidied() {
        assert_eq!(
            allowed(),
            ["https://expo39.github.io", "http://localhost:5173"]
        );
        assert!(parse_origins("").is_empty());
    }

    #[test]
    fn only_listed_origins_match_exactly() {
        let list = allowed();
        assert!(is_allowed(&list, "https://expo39.github.io"));
        assert!(is_allowed(&list, "http://localhost:5173"));
        assert!(!is_allowed(&list, "https://expo39.github.io.evil.example"));
        assert!(!is_allowed(&list, "http://expo39.github.io"));
        assert!(!is_allowed(&[], "https://expo39.github.io"));
    }

    #[test]
    fn the_origin_is_echoed_and_cached_per_origin() {
        let headers = response_headers("https://expo39.github.io");
        assert!(headers.contains(&(
            "Access-Control-Allow-Origin",
            "https://expo39.github.io".to_owned()
        )));
        assert!(headers.iter().any(|(k, v)| *k == "Vary" && v == "Origin"));
    }

    #[test]
    fn preflights_allow_the_proof_header() {
        let headers = preflight_headers("https://expo39.github.io");
        let allow = headers
            .iter()
            .find(|(k, _)| *k == "Access-Control-Allow-Headers")
            .unwrap();
        assert!(allow.1.contains("X-Admin-Proof") && allow.1.contains("Content-Type"));
    }
}
