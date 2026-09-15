use crate::catalog::Result;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    time::{Duration, Instant},
};

#[derive(Serialize, Deserialize)]
pub struct Credentials {
    pub client_id: String,
    pub client_secret: String,
}
impl Credentials {
    pub fn new(client_id: String, client_secret: String) -> Result<Self> {
        let value = Self {
            client_id: client_id.trim().into(),
            client_secret: client_secret.trim().into(),
        };
        if value.client_id.is_empty()
            || value.client_secret.is_empty()
            || value.client_id.len() > 512
            || value.client_secret.len() > 1024
            || value.client_id.chars().any(char::is_control)
            || value.client_secret.chars().any(char::is_control)
        {
            return Err("Enter a non-empty Client ID and Client Secret.".into());
        }
        Ok(value)
    }
}
fn entry(service: &str) -> Result<keyring_core::Entry> {
    keyring_core::Entry::new_with_modifiers(
        service,
        "igdb",
        &HashMap::from([("persistence", "Local")]),
    )
    .map_err(|_| "Windows credential storage is unavailable.".into())
}
pub fn read(service: &str) -> Result<Option<Credentials>> {
    match entry(service)?.get_password() {
        Ok(value) => serde_json::from_str(&value)
            .map(Some)
            .map_err(|_| "Stored IGDB credentials are invalid; update them in Settings.".into()),
        Err(keyring_core::Error::NoEntry) => Ok(None),
        Err(_) => Err("Windows could not read IGDB credentials.".into()),
    }
}
pub fn write(service: &str, credentials: &Credentials) -> Result<()> {
    entry(service)?
        .set_password(
            &serde_json::to_string(credentials).map_err(|_| "Could not encode credentials.")?,
        )
        .map_err(|_| "Windows could not save IGDB credentials.".into())
}
pub fn clear(service: &str) -> Result<()> {
    match entry(service)?.delete_credential() {
        Ok(()) | Err(keyring_core::Error::NoEntry) => Ok(()),
        Err(_) => Err("Windows could not clear IGDB credentials.".into()),
    }
}
#[derive(Deserialize)]
pub struct TokenResponse {
    pub access_token: String,
    pub expires_in: u64,
    pub token_type: String,
}
pub struct Token {
    pub value: String,
    pub expires: Instant,
}
impl Token {
    pub fn parse(bytes: &[u8], now: Instant) -> Result<Self> {
        let response: TokenResponse = serde_json::from_slice(bytes)
            .map_err(|_| "Unexpected Twitch authentication response.")?;
        if response.access_token.is_empty()
            || response.expires_in == 0
            || !response.token_type.eq_ignore_ascii_case("bearer")
        {
            return Err("Unexpected Twitch authentication response.".into());
        }
        let expires = now
            .checked_add(Duration::from_secs(response.expires_in))
            .ok_or("Unexpected token expiry.")?;
        Ok(Self {
            value: response.access_token,
            expires,
        })
    }
    pub fn valid(&self, now: Instant) -> bool {
        self.expires.saturating_duration_since(now) > Duration::from_secs(60)
    }
}
