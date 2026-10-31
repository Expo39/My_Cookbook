//! How often the AI routes may be used, counted by Cloudflare's rate limiter. It keeps its counts
//! itself, with no storage writes, so a flood of requests cannot use up the KV quota and switch the
//! sous-chef off for everyone.

/// The binding that limits one visitor, keyed by route and address.
pub const PER_VISITOR: &str = "PER_VISITOR";
/// The binding that limits everyone together, so many addresses at once cannot drain the AI quota.
pub const EVERYONE: &str = "EVERYONE";
/// The limiters' window, sent back as `Retry-After`.
pub const PERIOD_SECONDS: u64 = 60;

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

/// The per-visitor key: one count for each route and address.
pub fn visitor_key(route: Route, ip: &str) -> String {
    format!("{}:{ip}", route.name())
}

/// The shared key: one count for each route, whoever asks.
pub fn everyone_key(route: Route) -> String {
    route.name().to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn each_visitor_and_route_is_counted_apart() {
        assert_ne!(
            visitor_key(Route::Chat, "1.2.3.4"),
            visitor_key(Route::Chat, "5.6.7.8")
        );
        assert_ne!(
            visitor_key(Route::Chat, "1.2.3.4"),
            visitor_key(Route::Import, "1.2.3.4")
        );
        assert_ne!(everyone_key(Route::Chat), everyone_key(Route::Import));
    }
}
