const { loadConfig, getAuthHeader, applyTlsSetting } = require('./config');

function twoMonthsAgoDate() {
  const d = new Date();
  d.setMonth(d.getMonth() - 2);
  return d.toISOString().split('T')[0];
}

async function jiraRequest(path, options = {}, config = loadConfig()) {
  if (!config) {
    throw new Error('Jira is not configured');
  }

  applyTlsSetting(config);
  const auth = getAuthHeader(config);
  const baseUrl = config.jiraBaseUrl;

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: auth,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  return response;
}

async function testConnection(config) {
  const response = await jiraRequest('/rest/api/2/myself', {}, config);
  if (!response.ok) {
    const text = await response.text();
    const is401 = response.status === 401;
    throw new Error(
      is401
        ? 'Authentication failed. Check username/email and password or API token.'
        : text.slice(0, 300)
    );
  }
  const user = await response.json();
  return {
    ok: true,
    displayName: user.displayName || user.name,
    username: user.name,
  };
}

async function fetchIssues(config = loadConfig()) {
  if (!config) {
    return { error: 'not_configured', message: 'Configure Jira in Settings first.' };
  }

  const sinceDate = twoMonthsAgoDate();
  const jql = `assignee = currentUser() AND statusCategory != Done AND created >= "${sinceDate}" ORDER BY updated DESC`;

  const response = await jiraRequest(
    '/rest/api/2/search',
    {
      method: 'POST',
      body: JSON.stringify({
        jql,
        maxResults: 100,
        fields: ['summary', 'status', 'created', 'updated', 'priority', 'issuetype'],
      }),
    },
    config
  );

  if (!response.ok) {
    const text = await response.text();
    const is401 = response.status === 401;
    return {
      error: 'jira_api_error',
      status: response.status,
      message: is401
        ? 'Authentication failed. Update your credentials in Settings.'
        : text.slice(0, 500),
    };
  }

  const data = await response.json();
  const baseUrl = config.jiraBaseUrl;
  const issues = data.issues.map((issue) => ({
    key: issue.key,
    summary: issue.fields.summary,
    status: issue.fields.status?.name || 'Unknown',
    created: issue.fields.created,
    updated: issue.fields.updated,
    priority: issue.fields.priority?.name || 'None',
    type: issue.fields.issuetype?.name || 'Task',
    url: `${baseUrl}/browse/${issue.key}`,
  }));

  return { total: data.total, issues, jql, sinceDate };
}

module.exports = { fetchIssues, testConnection, twoMonthsAgoDate };
