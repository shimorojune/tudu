export { createApi, ApiError, type Api, type ApiConfig } from './api';
export { createAuthClientFor, type AuthClient, type Me, type MeResponse, type SpaceSummary } from './auth';
export { connectEvents, type EventsHandle, type EventsOptions, type LiveEvent } from './events';
export {
  Outbox,
  MemoryOutboxStore,
  IndexedDbOutboxStore,
  type Mutation,
  type OutboxStore,
  type OutboxOptions,
} from './outbox';
export {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
export {
  TaskStore,
  applyToDay,
  applyToDetail,
  applySubtasks,
  applyToProjects,
  projectsKey,
  membersKey,
  peopleKey,
  personKey,
  inboxKey,
  allPlacesKey,
  draftOf,
  dayKey,
  weekKey,
  marksKey,
  taskKey,
  type DayData,
  type WeekData,
  type TaskStoreOptions,
} from './tasks';
export {
  JiraClient,
  applyToLinks,
  jiraError,
  listName,
  jiraConnectionKey,
  jiraSpacesKey,
  jiraIssuesKey,
  jiraIssueKey,
  jiraSearchKey,
  jiraLinksKey,
  type JiraListAsk,
} from './jira';
export { tickGettingStarted } from './firstRun';
export {
  NotebookStore,
  applyToNotebook,
  notebookKey,
  noteKey,
  recentKey,
  trashKey,
  taskNotesKey,
  SAVE_QUIET_MS,
  SLOW_SAVE_MS,
  type NoteView,
  type SaveState,
  type NotebookStoreOptions,
} from './notebook';
