const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_FILENAME = 'config.json';
const DEFAULT_CHECKIN_INTERVAL_MINUTES = 15;
const MIN_CHECKIN_INTERVAL_MINUTES = 1;
const MAX_CHECKIN_INTERVAL_MINUTES = 240;

function getConfigDir() {
  return process.env.CONFIG_DIR || path.join(os.homedir(), '.daily-todo-app');
}

function getConfigPath() {
  return path.join(getConfigDir(), CONFIG_FILENAME);
}

function ensureConfigDir() {
  fs.mkdirSync(getConfigDir(), { recursive: true });
}

function readConfigFile() {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return {};
  }
}

function writeConfigFile(data) {
  ensureConfigDir();
  fs.writeFileSync(getConfigPath(), JSON.stringify(data, null, 2), { mode: 0o600 });
}

function normalizeCheckinIntervalMinutes(value) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_CHECKIN_INTERVAL_MINUTES;
  return Math.min(
    MAX_CHECKIN_INTERVAL_MINUTES,
    Math.max(MIN_CHECKIN_INTERVAL_MINUTES, parsed),
  );
}

function fromEnv() {
  const baseUrl = process.env.JIRA_BASE_URL;
  const username = process.env.JIRA_USERNAME || process.env.JIRA_EMAIL || process.env.JIRA_USER;
  const apiToken = process.env.JIRA_API_TOKEN;

  if (!baseUrl || !username || !apiToken) return null;

  return {
    jiraBaseUrl: baseUrl.replace(/\/+$/, ''),
    jiraUsername: username,
    jiraApiToken: apiToken,
    jiraType: process.env.JIRA_TYPE || 'server',
    tlsRejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '1',
    checkinIntervalMinutes: normalizeCheckinIntervalMinutes(
      process.env.CHECKIN_INTERVAL_MINUTES,
    ),
  };
}

function normalizeConfig(raw = {}) {
  return {
    jiraBaseUrl: String(raw.jiraBaseUrl || '').replace(/\/+$/, ''),
    jiraUsername: String(raw.jiraUsername || '').trim(),
    jiraApiToken: String(raw.jiraApiToken || ''),
    jiraType: raw.jiraType === 'cloud' ? 'cloud' : 'server',
    tlsRejectUnauthorized: raw.tlsRejectUnauthorized !== false,
    checkinIntervalMinutes: normalizeCheckinIntervalMinutes(raw.checkinIntervalMinutes),
  };
}

function loadConfig() {
  const file = readConfigFile();
  if (file.jiraBaseUrl && file.jiraUsername && file.jiraApiToken) {
    return normalizeConfig(file);
  }

  const env = fromEnv();
  if (env) return normalizeConfig({ ...file, ...env });

  if (Object.keys(file).length > 0) {
    return normalizeConfig(file);
  }

  return null;
}

function getAppPreferences() {
  const file = readConfigFile();
  const env = fromEnv();
  return {
    checkinIntervalMinutes: normalizeCheckinIntervalMinutes(
      file.checkinIntervalMinutes ?? env?.checkinIntervalMinutes,
    ),
  };
}

function getCheckinIntervalMs() {
  return getAppPreferences().checkinIntervalMinutes * 60 * 1000;
}

function savePreferences(prefs = {}) {
  const existing = readConfigFile();
  const merged = normalizeConfig({ ...existing, ...prefs });
  writeConfigFile({
    ...existing,
    checkinIntervalMinutes: merged.checkinIntervalMinutes,
  });
  return getPublicConfig();
}

function saveConfig(raw) {
  const existing = readConfigFile();
  const config = normalizeConfig({ ...existing, ...raw });
  ensureConfigDir();
  writeConfigFile({
    ...existing,
    jiraBaseUrl: config.jiraBaseUrl,
    jiraUsername: config.jiraUsername,
    jiraApiToken: config.jiraApiToken,
    jiraType: config.jiraType,
    tlsRejectUnauthorized: config.tlsRejectUnauthorized,
    checkinIntervalMinutes: config.checkinIntervalMinutes,
  });
  applyTlsSetting(config);
  return getPublicConfig();
}

function getPublicConfig(config = loadConfig()) {
  const prefs = getAppPreferences();

  if (!config || !config.jiraBaseUrl || !config.jiraUsername || !config.jiraApiToken) {
    return {
      configured: false,
      jiraBaseUrl: config?.jiraBaseUrl || '',
      jiraUsername: config?.jiraUsername || '',
      jiraType: config?.jiraType || 'server',
      tlsRejectUnauthorized: config?.tlsRejectUnauthorized !== false,
      hasToken: Boolean(config?.jiraApiToken),
      checkinIntervalMinutes: prefs.checkinIntervalMinutes,
    };
  }

  return {
    configured: true,
    jiraBaseUrl: config.jiraBaseUrl,
    jiraUsername: config.jiraUsername,
    jiraType: config.jiraType,
    tlsRejectUnauthorized: config.tlsRejectUnauthorized,
    hasToken: Boolean(config.jiraApiToken),
    checkinIntervalMinutes: config.checkinIntervalMinutes,
  };
}

function isConfigured() {
  const config = loadConfig();
  return Boolean(config?.jiraBaseUrl && config?.jiraUsername && config?.jiraApiToken);
}

function applyTlsSetting(config = loadConfig()) {
  if (config && config.tlsRejectUnauthorized === false) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  }
}

function getAuthHeader(config = loadConfig()) {
  if (!config) return null;
  const auth = Buffer.from(`${config.jiraUsername}:${config.jiraApiToken}`).toString('base64');
  return `Basic ${auth}`;
}

module.exports = {
  loadConfig,
  saveConfig,
  savePreferences,
  getPublicConfig,
  getAppPreferences,
  getCheckinIntervalMs,
  isConfigured,
  applyTlsSetting,
  getAuthHeader,
  getConfigDir,
  DEFAULT_CHECKIN_INTERVAL_MINUTES,
  MIN_CHECKIN_INTERVAL_MINUTES,
  MAX_CHECKIN_INTERVAL_MINUTES,
};
