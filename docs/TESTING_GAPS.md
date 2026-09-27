# Testing gap backlog (Waves D and E)

Tracked after Waves A-C land in CI. Update as coverage grows.

## Wave D: UI units

- `WeekGrid`, `SortableWeekCard`, `UnscheduledRail`, `DayTaskList`
- `useRolloverOnFocus`, `autosave`, `NotificationHost`, `TimelineTab`, `TeamManagerPane`
- Editor attachment pipeline under `packages/ui/src/components/editor/`
- Deepen thin route tests: `WeekRoute`, `InboxRoute`, `TaskDescriptionField`, `CommentsTab`

## Wave E: platform and jobs

- `notificationScheduler`, `regularWorker`, `versionWorker`, FCM delivery (mocked)
- `storage/minio.ts`
- Desktop bridge: `quickAdd.tsx`, `DesktopUpdater.tsx`, `DesktopNotifications.tsx`
- Web: `webPush.ts`, `WebPushHost.tsx`
- TipTap template integration (reduce reliance on Vitest simple-editor mock)

Ratchet `vitest.config.ts` coverage thresholds after each batch.
