//! Validation of ids and paths that reach the file system.

const MAX_CHARS: usize = 200;
const MAX_SEGMENTS: usize = 8;

fn is_slug(segment: &str) -> bool {
    !segment.is_empty()
        && segment.split('-').all(|part| {
            !part.is_empty()
                && part
                    .chars()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
        })
}

/// A recipe id or section folder: slash-separated lowercase slugs, with nothing that could climb out.
pub fn is_valid_path(path: &str) -> bool {
    path.chars().count() <= MAX_CHARS
        && path.split('/').count() <= MAX_SEGMENTS
        && path.split('/').all(is_slug)
}

/// A file inside `recipes/` that may be served: slug folders and a plain file name with an extension.
pub fn is_valid_file_path(path: &str) -> bool {
    let Some((folder, name)) = path.rsplit_once('/') else {
        return false;
    };
    is_valid_path(folder)
        && path.chars().count() <= MAX_CHARS
        && name
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '-' | '.'))
        && !name.is_empty()
        && !name.starts_with('.')
        && !name.contains("..")
}

pub fn parent(path: &str) -> Option<&str> {
    path.rsplit_once('/').map(|(parent, _)| parent)
}

pub fn slug(path: &str) -> &str {
    path.rsplit('/').next().unwrap_or(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clean_paths_are_accepted() {
        for ok in ["a", "mains/lentil-soup", "a/b/c1/d-2"] {
            assert!(is_valid_path(ok), "{ok}");
        }
    }

    #[test]
    fn anything_that_could_escape_is_refused() {
        for bad in [
            "", "..", "../x", "a/../b", "a/./b", "/a", "a/", "a//b", "A", "a b", "a\\b", "a\0b",
            "a-", "-a", "a--b", "%2e%2e", "é", "_section",
        ] {
            assert!(!is_valid_path(bad), "{bad:?}");
        }
        assert!(!is_valid_path(&"a/".repeat(9)));
        assert!(!is_valid_path(&"a".repeat(201)));
    }

    #[test]
    fn served_files_are_plain_names() {
        assert!(is_valid_file_path("mains/soup.jpg"));
        assert!(!is_valid_file_path("soup-2.webp"));
        assert!(!is_valid_file_path("soup"));
        for bad in [
            "../soup.jpg",
            "mains/../soup.jpg",
            "mains/.hidden.jpg",
            "mains/a..b.jpg",
            "mains/S.jpg",
        ] {
            assert!(!is_valid_file_path(bad), "{bad}");
        }
    }

    #[test]
    fn parent_and_slug_split_on_the_last_slash() {
        assert_eq!(parent("a/b/c"), Some("a/b"));
        assert_eq!(parent("c"), None);
        assert_eq!(slug("a/b/c"), "c");
    }
}
