//! Per-IP fixed-window limits, counted in Workers KV.

pub const WINDOW_SECONDS: u64 = 3600;
const DEFAULT_CHAT: u32 = 30;
const DEFAULT_IMPORT: u32 = 5;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Route {
    Chat,
    Import,
}

impl Route {
    fn name(self) -> &'static str {
        match self {
            Route::Chat => "chat",
            Route::Import => "import",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Limits {
    pub chat: u32,
    pub import: u32,
}

impl Limits {
    /// Reads `RATE_LIMIT_CHAT` and `RATE_LIMIT_IMPORT` (requests per hour).
    pub fn from_lookup(lookup: impl Fn(&str) -> Option<String>) -> Self {
        let read = |name: &str, default: u32| {
            lookup(name)
                .and_then(|v| v.trim().parse().ok())
                .unwrap_or(default)
        };
        Self {
            chat: read("RATE_LIMIT_CHAT", DEFAULT_CHAT),
            import: read("RATE_LIMIT_IMPORT", DEFAULT_IMPORT),
        }
    }

    pub fn for_route(&self, route: Route) -> u32 {
        match route {
            Route::Chat => self.chat,
            Route::Import => self.import,
        }
    }
}

/// The KV key for one caller, one route and one hour.
pub fn window_key(route: Route, ip: &str, now_seconds: u64) -> String {
    format!("rl:{}:{ip}:{}", route.name(), now_seconds / WINDOW_SECONDS)
}

/// Seconds until the current window closes.
pub fn retry_after(now_seconds: u64) -> u64 {
    WINDOW_SECONDS - now_seconds % WINDOW_SECONDS
}

/// Counts one request. `Ok` carries the new count; `Err` carries the seconds to wait.
pub fn admit(count_so_far: u32, limit: u32, now_seconds: u64) -> Result<u32, u64> {
    if count_so_far >= limit {
        Err(retry_after(now_seconds))
    } else {
        Ok(count_so_far + 1)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_are_thirty_chats_and_five_imports() {
        let limits = Limits::from_lookup(|_| None);
        assert_eq!((limits.chat, limits.import), (30, 5));
    }

    #[test]
    fn the_environment_can_change_them() {
        let limits = Limits::from_lookup(|name| (name == "RATE_LIMIT_CHAT").then(|| "7".to_owned()));
        assert_eq!((limits.chat, limits.import), (7, 5));
        assert_eq!(limits.for_route(Route::Chat), 7);
    }

    #[test]
    fn keys_separate_routes_callers_and_hours() {
        let a = window_key(Route::Chat, "1.2.3.4", 7_200);
        assert_ne!(a, window_key(Route::Import, "1.2.3.4", 7_200));
        assert_ne!(a, window_key(Route::Chat, "1.2.3.5", 7_200));
        assert_ne!(a, window_key(Route::Chat, "1.2.3.4", 7_200 + WINDOW_SECONDS));
        assert_eq!(a, window_key(Route::Chat, "1.2.3.4", 7_200 + 3_599));
    }

    #[test]
    fn requests_are_admitted_up_to_the_limit() {
        assert_eq!(admit(0, 5, 0), Ok(1));
        assert_eq!(admit(4, 5, 0), Ok(5));
        assert_eq!(admit(5, 5, 3_000), Err(600));
    }
}
