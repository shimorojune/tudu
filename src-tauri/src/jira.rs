use crate::config::{self, AppConfig};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JiraIssue {
    pub key: String,
    pub summary: String,
    pub status: String,
    pub created: String,
    pub updated: String,
    pub priority: String,
    #[serde(rename = "type")]
    pub issue_type: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct JiraChanges {
    pub new: Vec<String>,
    pub updated: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JiraFetchResult {
    pub total: u32,
    pub issues: Vec<JiraIssue>,
    pub jql: String,
    pub changes: JiraChanges,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct JiraSyncStatus {
    pub last_sync_at: Option<String>,
    pub last_error: Option<String>,
    pub pending_change_count: u32,
    pub issue_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct JiraState {
    #[serde(default)]
    seen: HashMap<String, String>,
    #[serde(default)]
    pending_changes: JiraChanges,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct JiraSearchResponse {
    total: u32,
    issues: Vec<JiraSearchIssue>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct JiraSearchIssue {
    key: String,
    fields: JiraIssueFields,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct JiraIssueFields {
    summary: String,
    status: Option<JiraStatus>,
    created: String,
    updated: String,
    priority: Option<JiraNamedField>,
    issuetype: Option<JiraNamedField>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct JiraStatus {
    name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct JiraNamedField {
    name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JiraTestResult {
    pub ok: bool,
    pub display_name: String,
    pub username: String,
}

fn build_client(cfg: &AppConfig) -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder().timeout(Duration::from_secs(30));
    if !cfg.tls_reject_unauthorized {
        builder = builder.danger_accept_invalid_certs(true);
    }
    builder.build().map_err(|e| e.to_string())
}

async fn request_authenticated(
    client: &reqwest::Client,
    method: &str,
    url: String,
    config: &AppConfig,
    body: Option<serde_json::Value>,
) -> Result<reqwest::Response, String> {
    let auth_methods = config::auth_variants(config);
    let mut last_response: Option<reqwest::Response> = None;

    for auth in auth_methods {
        let response = request_with_retry(client, method, url.clone(), auth, body.clone()).await?;
        let status = response.status();
        if status.as_u16() != 401 {
            return Ok(response);
        }
        last_response = Some(response);
    }

    Ok(last_response.expect("auth_variants must not be empty"))
}

async fn request_with_retry(
    client: &reqwest::Client,
    method: &str,
    url: String,
    auth: String,
    body: Option<serde_json::Value>,
) -> Result<reqwest::Response, String> {
    let mut attempt = 0;
    loop {
        attempt += 1;
        let mut req = client
            .request(
                method
                    .parse()
                    .map_err(|_| "Invalid HTTP method".to_string())?,
                &url,
            )
            .header("Authorization", &auth)
            .header("Accept", "application/json");

        if let Some(ref payload) = body {
            req = req.header("Content-Type", "application/json").json(payload);
        }

        match req.send().await {
            Ok(response) => {
                let status = response.status();
                if status.is_server_error() && attempt < 3 {
                    tokio::time::sleep(Duration::from_millis(500 * attempt)).await;
                    continue;
                }
                return Ok(response);
            }
            Err(err) => {
                if attempt < 3 {
                    tokio::time::sleep(Duration::from_millis(500 * attempt)).await;
                    continue;
                }
                return Err(err.to_string());
            }
        }
    }
}

fn load_state(app: &tauri::AppHandle) -> Result<JiraState, String> {
    let path = config::jira_state_path(app)?;
    if !path.exists() {
        return Ok(JiraState {
            seen: HashMap::new(),
            pending_changes: JiraChanges::default(),
        });
    }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

fn save_state(app: &tauri::AppHandle, state: &JiraState) -> Result<(), String> {
    let path = config::jira_state_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())
}

fn compute_changes(issues: &[JiraIssue], state: &mut JiraState) -> JiraChanges {
    let mut changes = JiraChanges::default();

    for issue in issues {
        match state.seen.get(&issue.key) {
            None => changes.new.push(issue.key.clone()),
            Some(prev) if prev != &issue.updated => changes.updated.push(issue.key.clone()),
            _ => {}
        }
        state.seen.insert(issue.key.clone(), issue.updated.clone());
    }

    changes
}

pub async fn test_connection(app: &tauri::AppHandle, cfg: Option<AppConfig>) -> Result<JiraTestResult, String> {
    let config = cfg.unwrap_or(config::load_config(app)?);
    if !config::is_configured(&config) {
        return Err("Jira is not configured".to_string());
    }

    let client = build_client(&config)?;
    let url = format!("{}/rest/api/2/myself", config.jira_base_url);
    let response =
        request_authenticated(&client, "GET", url, &config, None).await?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        if status.as_u16() == 401 {
            return Err("Authentication failed. Check username/email and password or API token.".to_string());
        }
        return Err(text.chars().take(300).collect());
    }

    let user: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    Ok(JiraTestResult {
        ok: true,
        display_name: user
            .get("displayName")
            .or_else(|| user.get("name"))
            .and_then(|v| v.as_str())
            .unwrap_or("User")
            .to_string(),
        username: user
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
    })
}

pub async fn fetch_issues(app: &tauri::AppHandle, track_changes: bool) -> Result<JiraFetchResult, String> {
    let config = config::load_config(app)?;
    if !config::is_configured(&config) {
        return Err("Configure Jira in Settings first.".to_string());
    }

    let jql = "assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC".to_string();
    let client = build_client(&config)?;
    let url = format!("{}/rest/api/2/search", config.jira_base_url);
    let payload = serde_json::json!({
        "jql": jql,
        "maxResults": 100,
        "fields": ["summary", "status", "created", "updated", "priority", "issuetype"]
    });

    let response =
        request_authenticated(&client, "POST", url, &config, Some(payload)).await?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        if status.as_u16() == 401 {
            return Err("Authentication failed. Update your credentials in Settings.".to_string());
        }
        return Err(text.chars().take(500).collect());
    }

    let data: JiraSearchResponse = response.json().await.map_err(|e| e.to_string())?;
    let issues: Vec<JiraIssue> = data
        .issues
        .into_iter()
        .map(|issue| {
            JiraIssue {
                key: issue.key.clone(),
                summary: issue.fields.summary,
                status: issue
                    .fields
                    .status
                    .map(|s| s.name)
                    .unwrap_or_else(|| "Unknown".to_string()),
                created: issue.fields.created,
                updated: issue.fields.updated,
                priority: issue
                    .fields
                    .priority
                    .map(|p| p.name)
                    .unwrap_or_else(|| "None".to_string()),
                issue_type: issue
                    .fields
                    .issuetype
                    .map(|t| t.name)
                    .unwrap_or_else(|| "Task".to_string()),
                url: format!("{}/browse/{}", config.jira_base_url, issue.key),
            }
        })
        .collect();

    let mut state = load_state(app)?;
    let changes = if track_changes {
        compute_changes(&issues, &mut state)
    } else {
        for issue in &issues {
            state.seen.insert(issue.key.clone(), issue.updated.clone());
        }
        JiraChanges::default()
    };

    if track_changes && (!changes.new.is_empty() || !changes.updated.is_empty()) {
        state.pending_changes = changes.clone();
    }

    save_state(app, &state)?;

    Ok(JiraFetchResult {
        total: data.total,
        issues,
        jql,
        changes,
    })
}

pub fn get_sync_status(app: &tauri::AppHandle) -> Result<JiraSyncStatus, String> {
    let state = load_state(app)?;
    let pending_change_count = (state.pending_changes.new.len() + state.pending_changes.updated.len()) as u32;
    Ok(JiraSyncStatus {
        last_sync_at: None,
        last_error: None,
        pending_change_count,
        issue_count: state.seen.len() as u32,
    })
}

pub fn clear_pending_changes(app: &tauri::AppHandle) -> Result<(), String> {
    let mut state = load_state(app)?;
    state.pending_changes = JiraChanges::default();
    save_state(app, &state)
}
