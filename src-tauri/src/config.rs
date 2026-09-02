use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

pub const DEFAULT_CHECKIN_INTERVAL_MINUTES: u32 = 15;
pub const DEFAULT_JIRA_POLL_INTERVAL_MINUTES: u32 = 15;
pub const MIN_CHECKIN_INTERVAL_MINUTES: u32 = 1;
pub const MAX_CHECKIN_INTERVAL_MINUTES: u32 = 240;
pub const MIN_JIRA_POLL_INTERVAL_MINUTES: u32 = 5;
pub const MAX_JIRA_POLL_INTERVAL_MINUTES: u32 = 120;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    #[serde(default)]
    pub jira_base_url: String,
    #[serde(default)]
    pub jira_username: String,
    #[serde(default)]
    pub jira_api_token: String,
    #[serde(default = "default_jira_type")]
    pub jira_type: String,
    #[serde(default = "default_true")]
    pub tls_reject_unauthorized: bool,
    #[serde(default = "default_checkin_interval")]
    pub checkin_interval_minutes: u32,
    #[serde(default = "default_jira_poll_interval")]
    pub jira_poll_interval_minutes: u32,
}

fn default_jira_type() -> String {
    "server".to_string()
}

fn default_true() -> bool {
    true
}

fn default_checkin_interval() -> u32 {
    DEFAULT_CHECKIN_INTERVAL_MINUTES
}

fn default_jira_poll_interval() -> u32 {
    DEFAULT_JIRA_POLL_INTERVAL_MINUTES
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            jira_base_url: String::new(),
            jira_username: String::new(),
            jira_api_token: String::new(),
            jira_type: default_jira_type(),
            tls_reject_unauthorized: true,
            checkin_interval_minutes: DEFAULT_CHECKIN_INTERVAL_MINUTES,
            jira_poll_interval_minutes: DEFAULT_JIRA_POLL_INTERVAL_MINUTES,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicConfig {
    pub configured: bool,
    pub jira_base_url: String,
    pub jira_username: String,
    pub jira_type: String,
    pub tls_reject_unauthorized: bool,
    pub has_token: bool,
    pub checkin_interval_minutes: u32,
    pub jira_poll_interval_minutes: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveConfigInput {
    pub jira_base_url: Option<String>,
    pub jira_username: Option<String>,
    pub jira_api_token: Option<String>,
    pub jira_type: Option<String>,
    pub tls_reject_unauthorized: Option<bool>,
    pub checkin_interval_minutes: Option<u32>,
    pub jira_poll_interval_minutes: Option<u32>,
}

pub fn config_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| e.to_string())
}

fn config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(config_dir(app)?.join("config.json"))
}

fn normalize_interval(value: u32, min: u32, max: u32, default: u32) -> u32 {
    if value < min || value > max {
        default
    } else {
        value
    }
}

fn normalize_config(mut config: AppConfig) -> AppConfig {
    config.jira_base_url = config.jira_base_url.trim_end_matches('/').to_string();
    config.jira_username = config.jira_username.trim().to_string();
    config.jira_type = if config.jira_type == "cloud" {
        "cloud".to_string()
    } else {
        "server".to_string()
    };
    config.checkin_interval_minutes = normalize_interval(
        config.checkin_interval_minutes,
        MIN_CHECKIN_INTERVAL_MINUTES,
        MAX_CHECKIN_INTERVAL_MINUTES,
        DEFAULT_CHECKIN_INTERVAL_MINUTES,
    );
    config.jira_poll_interval_minutes = normalize_interval(
        config.jira_poll_interval_minutes,
        MIN_JIRA_POLL_INTERVAL_MINUTES,
        MAX_JIRA_POLL_INTERVAL_MINUTES,
        DEFAULT_JIRA_POLL_INTERVAL_MINUTES,
    );
    config
}

fn legacy_config_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Some(home) = dirs_home() {
        paths.push(
            home.join("Library")
                .join("Application Support")
                .join("daily-todo-app")
                .join("config.json"),
        );
        paths.push(home.join(".daily-todo-app").join("config.json"));
    }
    paths
}

fn dirs_home() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

fn ensure_dir(path: &Path) -> Result<(), String> {
    fs::create_dir_all(path).map_err(|e| e.to_string())
}

#[cfg(unix)]
fn set_private_permissions(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    let mut perms = fs::metadata(path).map_err(|e| e.to_string())?.permissions();
    perms.set_mode(0o600);
    fs::set_permissions(path, perms).map_err(|e| e.to_string())
}

#[cfg(not(unix))]
fn set_private_permissions(_path: &Path) -> Result<(), String> {
    Ok(())
}

fn read_json_file<T: for<'de> Deserialize<'de>>(path: &Path) -> Option<T> {
    let content = fs::read_to_string(path).ok()?;
    serde_json::from_str(&content).ok()
}

fn write_json_file<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        ensure_dir(parent)?;
    }
    let content = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())?;
    set_private_permissions(path)?;
    Ok(())
}

fn migrate_legacy_config(app: &tauri::AppHandle) -> Result<(), String> {
    let target = config_path(app)?;
    if target.exists() {
        return Ok(());
    }

    for legacy in legacy_config_paths() {
        if let Some(mut legacy_config) = read_json_file::<AppConfig>(&legacy) {
            legacy_config = normalize_config(legacy_config);
            write_json_file(&target, &legacy_config)?;
            return Ok(());
        }
    }

    Ok(())
}

pub fn load_config(app: &tauri::AppHandle) -> Result<AppConfig, String> {
    migrate_legacy_config(app)?;
    let path = config_path(app)?;
    if !path.exists() {
        return Ok(AppConfig::default());
    }
    let config = read_json_file::<AppConfig>(&path).unwrap_or_default();
    Ok(normalize_config(config))
}

pub fn save_config(app: &tauri::AppHandle, input: SaveConfigInput) -> Result<PublicConfig, String> {
    let mut config = load_config(app)?;

    if let Some(url) = input.jira_base_url {
        config.jira_base_url = url;
    }
    if let Some(username) = input.jira_username {
        config.jira_username = username;
    }
    if let Some(token) = input.jira_api_token {
        if !token.is_empty() {
            config.jira_api_token = token;
        }
    }
    if let Some(jira_type) = input.jira_type {
        config.jira_type = jira_type;
    }
    if let Some(tls) = input.tls_reject_unauthorized {
        config.tls_reject_unauthorized = tls;
    }
    if let Some(checkin) = input.checkin_interval_minutes {
        config.checkin_interval_minutes = checkin;
    }
    if let Some(poll) = input.jira_poll_interval_minutes {
        config.jira_poll_interval_minutes = poll;
    }

    config = normalize_config(config);
    write_json_file(&config_path(app)?, &config)?;
    Ok(to_public_config(&config))
}

pub fn to_public_config(config: &AppConfig) -> PublicConfig {
    let configured = !config.jira_base_url.is_empty()
        && !config.jira_username.is_empty()
        && !config.jira_api_token.is_empty();

    PublicConfig {
        configured,
        jira_base_url: config.jira_base_url.clone(),
        jira_username: config.jira_username.clone(),
        jira_type: config.jira_type.clone(),
        tls_reject_unauthorized: config.tls_reject_unauthorized,
        has_token: !config.jira_api_token.is_empty(),
        checkin_interval_minutes: config.checkin_interval_minutes,
        jira_poll_interval_minutes: config.jira_poll_interval_minutes,
    }
}

pub fn is_configured(config: &AppConfig) -> bool {
    !config.jira_base_url.is_empty()
        && !config.jira_username.is_empty()
        && !config.jira_api_token.is_empty()
}

pub fn auth_variants(config: &AppConfig) -> Vec<String> {
    let token = config.jira_api_token.trim();
    if config.jira_type == "cloud" {
        return vec![basic_auth(config)];
    }

    // Jira Server / Data Center PATs authenticate with Bearer token.
    vec![
        format!("Bearer {token}"),
        basic_auth(config),
    ]
}

fn basic_auth(config: &AppConfig) -> String {
    let raw = format!("{}:{}", config.jira_username.trim(), config.jira_api_token.trim());
    format!(
        "Basic {}",
        base64::Engine::encode(&base64::engine::general_purpose::STANDARD, raw)
    )
}

pub fn jira_state_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(config_dir(app)?.join("jira-state.json"))
}
