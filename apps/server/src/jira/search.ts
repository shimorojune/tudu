import type { JiraIssue, JiraIssuesResponse } from "@tudu/shared";

export function prependKeyIssueToSearchResults(
  keyIssue: JiraIssue,
  response: JiraIssuesResponse,
): JiraIssuesResponse {
  const withoutDuplicate = response.issues.filter((item) => item.id !== keyIssue.id);
  const added = withoutDuplicate.length < response.issues.length ? 0 : 1;
  return {
    issues: [keyIssue, ...withoutDuplicate],
    total: response.total + added,
    startAt: response.startAt,
    hasMore: response.hasMore || added > 0,
  };
}
