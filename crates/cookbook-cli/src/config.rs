//! `cookbook.config.json`, read the same way as `web/vite.config.ts` does: a missing or unreadable file means defaults.

use std::path::Path;

use serde::Deserialize;

const DEFAULT_URL: &str = "https://expo39.github.io";

#[derive(Debug, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Config {
    site: Site,
    social: Social,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct Site {
    url: Option<String>,
    base_path: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct Social {
    instagram: Instagram,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct Instagram {
    enabled: bool,
    handle: Option<String>,
}

fn valid_handle(handle: &str) -> bool {
    (1..=30).contains(&handle.len())
        && handle
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_')
}

impl Config {
    pub fn load(path: &Path) -> Config {
        std::fs::read_to_string(path)
            .ok()
            .and_then(|text| serde_json::from_str(&text).ok())
            .unwrap_or_default()
    }

    /// The deployed address cards link to: `PUBLIC_SITE_URL` with `BASE_PATH`, or the `site` settings.
    pub fn site_root(&self) -> String {
        let (url, base) = match std::env::var("PUBLIC_SITE_URL") {
            Ok(url) if !url.is_empty() => (url, std::env::var("BASE_PATH").unwrap_or_default()),
            _ => (
                self.site
                    .url
                    .clone()
                    .unwrap_or_else(|| DEFAULT_URL.to_owned()),
                self.site.base_path.clone().unwrap_or_default(),
            ),
        };
        format!(
            "{}{}",
            url.trim_end_matches('/'),
            base.trim_end_matches('/')
        )
    }

    /// "@handle" when Instagram is switched on and the handle is valid.
    pub fn instagram(&self) -> Option<String> {
        let instagram = &self.social.instagram;
        let handle = instagram.handle.as_deref()?.trim_start_matches('@');
        (instagram.enabled && valid_handle(handle)).then(|| format!("@{handle}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(json: &str) -> Config {
        serde_json::from_str(json).unwrap()
    }

    #[test]
    fn a_missing_file_means_defaults_and_no_social() {
        let config = Config::load(Path::new("does-not-exist.json"));
        assert_eq!(config.instagram(), None);
        assert!(config.site_root().starts_with("https://"));
    }

    #[test]
    fn the_site_settings_give_the_root() {
        let config = parse(r#"{ "site": { "url": "https://a.example/", "basePath": "/cook" } }"#);
        if std::env::var("PUBLIC_SITE_URL").is_err() {
            assert_eq!(config.site_root(), "https://a.example/cook");
        }
    }

    #[test]
    fn instagram_needs_to_be_enabled_with_a_valid_handle() {
        let on = parse(
            r#"{ "social": { "instagram": { "enabled": true, "handle": "@tonys_foods" } } }"#,
        );
        assert_eq!(on.instagram().as_deref(), Some("@tonys_foods"));
        let off = parse(
            r#"{ "social": { "instagram": { "enabled": false, "handle": "tonys_foods" } } }"#,
        );
        assert_eq!(off.instagram(), None);
        let bad =
            parse(r#"{ "social": { "instagram": { "enabled": true, "handle": "no spaces" } } }"#);
        assert_eq!(bad.instagram(), None);
    }
}
