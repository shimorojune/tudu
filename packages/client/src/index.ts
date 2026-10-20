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
  draftOf,
  dayKey,
  marksKey,
  type DayData,
  type TaskStoreOptions,
} from './tasks';
