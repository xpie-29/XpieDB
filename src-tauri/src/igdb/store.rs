//! Platform credential store selection. Everything OS-specific about secret
//! storage lives here so `auth` and the rest of the app stay portable.
use std::collections::HashMap;

#[cfg(windows)]
pub const NAME: &str = "Windows Credential Manager";
#[cfg(target_os = "macos")]
pub const NAME: &str = "macOS Keychain";
#[cfg(not(any(windows, target_os = "macos")))]
pub const NAME: &str = "The system credential store";

/// Registers the native store as the keyring default.
pub fn init() -> Result<(), String> {
    #[cfg(windows)]
    {
        let store = windows_native_keyring_store::Store::new().map_err(|e| e.to_string())?;
        keyring_core::set_default_store(store);
        Ok(())
    }
    #[cfg(target_os = "macos")]
    {
        let store =
            apple_native_keyring_store::keychain::Store::new().map_err(|e| e.to_string())?;
        keyring_core::set_default_store(store);
        Ok(())
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    Err("no native credential store is supported on this platform".into())
}

/// Per-entry modifiers. Stores reject modifiers they do not define, so this is
/// deliberately platform-specific: Windows entries are machine-local, while the
/// macOS keychain store accepts only `keychain`, which defaults to the login keychain.
pub fn modifiers() -> HashMap<&'static str, &'static str> {
    #[cfg(windows)]
    return HashMap::from([("persistence", "Local")]);
    #[cfg(not(windows))]
    HashMap::new()
}
