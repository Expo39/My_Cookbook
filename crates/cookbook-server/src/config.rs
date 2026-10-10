use std::path::PathBuf;

use cookbook_ai::GeminiConfig;

const MIN_SECRET_CHARS: usize = 32;

#[derive(Debug, Clone)]
pub struct Config {
    /// The repository folder that contains `recipes/`.
    pub root: PathBuf,
    /// The built site; without it only the API is served.
    pub web_dir: Option<PathBuf>,
    pub password_hash: String,
    pub session_secret: Vec<u8>,
    pub gemini_key: Option<String>,
    pub gemini: GeminiConfig,
    pub bind: String,
    pub git_commit: bool,
    /// Set `COOKIE_SECURE=false` to log in over plain HTTP on localhost.
    pub secure_cookie: bool,
    /// Take the client address from `X-Forwarded-For`; only behind a proxy you control.
    pub trust_proxy: bool,
}

fn flag(value: Option<String>, default: bool) -> bool {
    value.map_or(default, |v| {
        matches!(
            v.trim().to_ascii_lowercase().as_str(),
            "1" | "true" | "yes" | "on"
        )
    })
}

impl Config {
    pub fn from_lookup(lookup: impl Fn(&str) -> Option<String>) -> Result<Self, String> {
        let get = |name: &str| {
            lookup(name)
                .map(|v| v.trim().to_owned())
                .filter(|v| !v.is_empty())
        };
        let password_hash = get("ADMIN_PASSWORD_HASH").ok_or(
            "ADMIN_PASSWORD_HASH is not set; create one with `cookbook-server --hash-password`",
        )?;
        if !password_hash.starts_with("$argon2id$") {
            return Err("ADMIN_PASSWORD_HASH must be an argon2id hash".to_owned());
        }
        let session_secret = get("SESSION_SECRET").ok_or("SESSION_SECRET is not set")?;
        if session_secret.chars().count() < MIN_SECRET_CHARS {
            return Err(format!(
                "SESSION_SECRET must be at least {MIN_SECRET_CHARS} characters long"
            ));
        }
        Ok(Self {
            root: PathBuf::from(get("COOKBOOK_ROOT").unwrap_or_else(|| ".".to_owned())),
            web_dir: get("WEB_DIR").map(PathBuf::from),
            password_hash,
            session_secret: session_secret.into_bytes(),
            gemini_key: get("GEMINI_API_KEY"),
            gemini: GeminiConfig::from_lookup(&lookup),
            bind: get("BIND").unwrap_or_else(|| "0.0.0.0:8080".to_owned()),
            git_commit: flag(get("GIT_COMMIT"), false),
            secure_cookie: flag(get("COOKIE_SECURE"), true),
            trust_proxy: flag(get("TRUST_PROXY"), false),
        })
    }

    pub fn recipes_dir(&self) -> PathBuf {
        self.root.join("recipes")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const HASH: &str = "$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHQ$aGFzaA";

    fn lookup(extra: &[(&'static str, &'static str)]) -> impl Fn(&str) -> Option<String> {
        let mut vars = vec![
            ("ADMIN_PASSWORD_HASH", HASH),
            ("SESSION_SECRET", "0123456789abcdef0123456789abcdef"),
        ];
        vars.extend_from_slice(extra);
        move |name| {
            vars.iter()
                .rev()
                .find(|(k, _)| *k == name)
                .map(|(_, v)| (*v).to_owned())
        }
    }

    #[test]
    fn defaults_are_safe() {
        let config = Config::from_lookup(lookup(&[])).unwrap();
        assert_eq!(config.bind, "0.0.0.0:8080");
        assert!(config.secure_cookie && !config.git_commit && !config.trust_proxy);
        assert!(config.gemini_key.is_none() && config.web_dir.is_none());
        assert_eq!(config.recipes_dir(), PathBuf::from("./recipes"));
    }

    #[test]
    fn the_hash_and_secret_are_required() {
        assert!(Config::from_lookup(|_| None).is_err());
        let weak = Config::from_lookup(lookup(&[("SESSION_SECRET", "short")]));
        assert!(weak.unwrap_err().contains("32"));
        let plain = Config::from_lookup(lookup(&[("ADMIN_PASSWORD_HASH", "hunter2")]));
        assert!(plain.unwrap_err().contains("argon2id"));
    }

    #[test]
    fn flags_and_optional_values_are_read() {
        let config = Config::from_lookup(lookup(&[
            ("GIT_COMMIT", "true"),
            ("COOKIE_SECURE", "false"),
            ("GEMINI_API_KEY", "k"),
            ("GEMINI_MODEL", "m"),
            ("WEB_DIR", "/srv/web"),
            ("BIND", "127.0.0.1:9"),
        ]))
        .unwrap();
        assert!(config.git_commit && !config.secure_cookie);
        assert_eq!(config.gemini_key.as_deref(), Some("k"));
        assert_eq!(config.gemini.model, "m");
        assert_eq!(config.web_dir, Some(PathBuf::from("/srv/web")));
        assert_eq!(config.bind, "127.0.0.1:9");
    }
}
