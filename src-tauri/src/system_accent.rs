//! The operating system's accent colour, asked of the OS itself. The web view's own `AccentColor` keyword is not
//! used because both WebView2 (Windows) and WKWebView (macOS) answer with a fixed blue, not the owner's choice.

/// Windows keeps the accent as 0xAABBGGRR; this is "#rrggbb". (Only used on Windows, but tested everywhere.)
#[cfg_attr(not(windows), allow(dead_code))]
pub fn hex_from_abgr(value: u32) -> String {
    format!(
        "#{:02x}{:02x}{:02x}",
        value & 0xff,
        (value >> 8) & 0xff,
        (value >> 16) & 0xff
    )
}
/// "#rrggbb" from red, green and blue between 0.0 and 1.0. (Only used on macOS, but tested everywhere.)
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub fn hex_from_unit(r: f64, g: f64, b: f64) -> String {
    let byte = |v: f64| (v.clamp(0.0, 1.0) * 255.0).round() as u8;
    format!("#{:02x}{:02x}{:02x}", byte(r), byte(g), byte(b))
}

#[cfg(windows)]
pub fn read() -> Option<String> {
    use winreg::{RegKey, enums::HKEY_CURRENT_USER};
    let key = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(r"Software\Microsoft\Windows\DWM")
        .ok()?;
    let value: u32 = key.get_value("AccentColor").ok()?;
    Some(hex_from_abgr(value))
}

#[cfg(target_os = "macos")]
pub fn read() -> Option<String> {
    use objc2_app_kit::{NSColor, NSColorSpace};
    let accent = NSColor::controlAccentColor();
    let srgb = accent.colorUsingColorSpace(&NSColorSpace::sRGBColorSpace())?;
    Some(hex_from_unit(
        srgb.redComponent(),
        srgb.greenComponent(),
        srgb.blueComponent(),
    ))
}

#[cfg(not(any(windows, target_os = "macos")))]
pub fn read() -> Option<String> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn windows_accent_is_stored_blue_green_red() {
        // The grey the Windows test machine reported, and Windows' default blue (0xFFD47800 = #0078d4).
        assert_eq!(hex_from_abgr(0xFF76_7676), "#767676");
        assert_eq!(hex_from_abgr(0xFFD4_7800), "#0078d4");
        assert_eq!(hex_from_abgr(0xFF00_00FF), "#ff0000");
    }

    #[test]
    fn unit_colours_round_to_whole_bytes_and_stay_in_range() {
        assert_eq!(hex_from_unit(0.9686, 0.5098, 0.1059), "#f7821b");
        assert_eq!(hex_from_unit(-0.2, 1.7, 0.0), "#00ff00");
    }

    #[test]
    fn this_machine_gives_a_well_formed_colour_or_none() {
        if let Some(hex) = read() {
            assert_eq!(hex.len(), 7);
            assert!(hex.starts_with('#') && hex[1..].chars().all(|c| c.is_ascii_hexdigit()));
        }
    }
}
