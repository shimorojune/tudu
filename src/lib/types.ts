export interface PublicConfig {
  configured: boolean;
  jiraBaseUrl: string;
  jiraUsername: string;
  jiraType: string;
  tlsRejectUnauthorized: boolean;
  hasToken: boolean;
  checkinIntervalMinutes: number;
  jiraPollIntervalMinutes: number;
}

export interface Task {
  id: string;
  text: string;
  done: boolean;
  date: string;
  parentId?: string | null;
  createdAt: string;
}

export interface JiraIssue {
  key: string;
  summary: string;
  status: string;
  created: string;
  updated: string;
  priority: string;
  type: string;
  url: string;
}

export interface JiraChanges {
  new: string[];
  updated: string[];
}

export interface JiraFetchResult {
  total: number;
  issues: JiraIssue[];
  jql: string;
  changes: JiraChanges;
}

export interface JiraSyncStatus {
  lastSyncAt?: string | null;
  lastError?: string | null;
  pendingChangeCount: number;
  issueCount: number;
}

export interface AvatarPayload {
  message: string;
  kind: string;
}

export interface SaveConfigInput {
  jiraBaseUrl?: string;
  jiraUsername?: string;
  jiraApiToken?: string;
  jiraType?: string;
  tlsRejectUnauthorized?: boolean;
  checkinIntervalMinutes?: number;
  jiraPollIntervalMinutes?: number;
}
