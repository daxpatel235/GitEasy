//! GitHub, through the official CLI.
//!
//! Everything here goes through `gh`, which owns the credentials. GitEasy never
//! sees, asks for or stores a password or a token: `gh auth login --web` opens
//! github.com in the user's browser, GitHub hands `gh` a token, and `gh` puts it
//! in the OS keychain. This app only ever asks `gh` questions.
//!
//! Every function fails softly. A user with no `gh`, no account or no network
//! still gets a complete local app — that is what the `Option`/empty-vec
//! returns are for.

pub mod auth;
pub mod issues;
pub mod pulls;
pub mod releases;
pub mod runs;

use crate::error::{AppError, AppResult};

/// Parse an ISO-8601 timestamp (what the GitHub API returns) into Unix ms.
///
/// Written by hand rather than pulling in `chrono`: the format is fixed
/// (`2026-08-26T14:03:11Z`), and a date library is a large dependency for one
/// shape of string.
pub fn iso_to_millis(text: &str) -> i64 {
    let text = text.trim();
    if text.is_empty() {
        return 0;
    }

    let bytes = text.as_bytes();
    if bytes.len() < 19 {
        return 0;
    }

    let num = |start: usize, end: usize| -> i64 {
        text.get(start..end)
            .and_then(|s| s.parse::<i64>().ok())
            .unwrap_or(0)
    };

    let year = num(0, 4);
    let month = num(5, 7);
    let day = num(8, 10);
    let hour = num(11, 13);
    let minute = num(14, 16);
    let second = num(17, 19);

    if year == 0 || month == 0 || day == 0 {
        return 0;
    }

    // Days since the Unix epoch, via the civil-from-days algorithm.
    let days = days_from_civil(year, month, day);
    ((days * 86_400) + hour * 3_600 + minute * 60 + second) * 1000
}

/// Howard Hinnant's `days_from_civil`: days since 1970-01-01.
fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let year = if month <= 2 { year - 1 } else { year };
    let era = if year >= 0 { year } else { year - 399 } / 400;
    let yoe = year - era * 400;
    let mp = (month + 9) % 12;
    let doy = (153 * mp + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

/// Read a `serde_json` string field, defaulting to empty.
pub fn text(value: &serde_json::Value, key: &str) -> String {
    value
        .get(key)
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string()
}

/// Read a nested login, e.g. `{"author": {"login": "you"}}`.
pub fn login(value: &serde_json::Value, key: &str) -> String {
    value
        .get(key)
        .and_then(|v| v.get("login"))
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string()
}

/// Read a numeric field.
pub fn number(value: &serde_json::Value, key: &str) -> u64 {
    value.get(key).and_then(|v| v.as_u64()).unwrap_or(0)
}

/// Parse `gh`'s JSON output, with a readable error if it is not JSON.
pub fn parse_json(raw: &str) -> AppResult<serde_json::Value> {
    if raw.trim().is_empty() {
        return Ok(serde_json::Value::Array(Vec::new()));
    }

    serde_json::from_str(raw)
        .map_err(|e| AppError::invalid("GitHub sent something GitEasy could not read.").with_detail(e.to_string()))
}

/// Labels from a `{"labels": [{"name": …, "color": …}]}` field.
pub fn labels(value: &serde_json::Value) -> Vec<crate::models::Label> {
    value
        .get("labels")
        .and_then(|v| v.as_array())
        .map(|items| {
            items
                .iter()
                .map(|label| crate::models::Label {
                    name: text(label, "name"),
                    color: text(label, "color"),
                })
                .collect()
        })
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_iso_timestamp() {
        // 2024-01-01T00:00:00Z is 1704067200 seconds.
        assert_eq!(iso_to_millis("2024-01-01T00:00:00Z"), 1_704_067_200_000);
    }

    #[test]
    fn parses_epoch() {
        assert_eq!(iso_to_millis("1970-01-01T00:00:00Z"), 0);
    }

    #[test]
    fn parses_timestamp_with_offset_suffix() {
        assert_eq!(iso_to_millis("2024-06-15T12:30:45Z"), 1_718_454_645_000);
    }

    #[test]
    fn empty_timestamp_is_zero() {
        assert_eq!(iso_to_millis(""), 0);
        assert_eq!(iso_to_millis("not a date"), 0);
    }

    #[test]
    fn reads_nested_login() {
        let value: serde_json::Value =
            serde_json::from_str(r#"{"author":{"login":"ada"}}"#).unwrap();
        assert_eq!(login(&value, "author"), "ada");
    }

    #[test]
    fn empty_json_is_empty_array() {
        assert!(parse_json("").unwrap().is_array());
    }
}
