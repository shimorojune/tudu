# Step 9: Manager Inbox, roster, report's day

Status: Done
Depends on: step 8
Blocks: step 10

## Goal

After this step:

- Inbox shows tasks a manager sent. Accept into Now, Next, or Later, or decline with a reason.
- Decline bounces the task to the sender's Inbox. Returned cards can be accepted or deleted, not declined again.
- Accept day is the task start date if set, otherwise today. Start and deadline stay on the task.
- Team roster lists reports with Now / Open / Slipping counts. Add someone by email. Incoming invites confirm on Team and on a thin banner.
- A report's day is readable by their manager: comment, reorder, delete, send to Inbox. No edit, complete, or private.
- New work from a manager always lands in Inbox, never on the day.

## Non goals

- C5 signup wizard.
- Settings permission toggles and Change manager (step 11).
- Last-seen / "hasn't opened Tudu today" on the roster.
- JIRA on the send form (step 10).
- What-leaves-Now modal on Inbox accept. Over-cap is allowed.

## Key files

| Path | Role |
|------|------|
| `packages/db/src/manager-schema.ts` | Invites, links, permissions, inbox items |
| `packages/db/src/manager.ts` | Access, send/accept/decline, team, report day |
| `apps/server/src/routes/manager.ts` | Inbox and team HTTP routes |
| `packages/store/src/api/managerApi.ts` | RTK Inbox and Team endpoints |
| `packages/ui/src/routes/InboxRoute.tsx` | B1 Inbox |
| `packages/ui/src/routes/TeamRoute.tsx` | B2 roster |
| `packages/ui/src/routes/ReportDayRoute.tsx` | B3 report's day |
| `apps/server/scripts/seed-test-user.ts` | testuser, Marcus, Priya |

## Decisions (settled)

1. **One manager per person.** Many reports per manager. Confirm before anything is shared.
2. **Email invite.** Unknown emails stay pending until that person signs up, then they confirm.
3. **Accept uses startDate, else today.** Deadline is kept. Neither is wiped.
4. **Decline bounces to the sender.** Reason required. No second decline on a returned card.
5. **Manager verbs on a report's day:** read, comment, reorder, delete, send. Not edit / complete / private.
6. **Seed:** `testuser@egain.com`, `marcus@egain.com`, `priya@egain.com`, password `egain@123`. Seed refuses in production.

## API

- `GET /inbox`, `GET /inbox/count`
- `POST /inbox/:id/accept` `{ bucket }`
- `POST /inbox/:id/decline` `{ reason }`
- `GET /team?date=`
- `POST /team/invites` `{ email }`
- `POST /team/invites/:id/accept` and `/decline`
- `GET /team/:userId/day?date=`
- `POST /team/:userId/tasks`
- `PATCH /team/:userId/reorder`
- `DELETE /team/:userId/tasks/:taskId`

## Shortcuts

On Inbox, focused or first pending card: Cmd+1 Now, Cmd+2 Next, Cmd+3 Later, Cmd+\\ Decline (assigned cards only). Command palette lists accept commands while Inbox has a pending item.

## Verification

```bash
pnpm test
pnpm lint:copy
pnpm --filter @tudu/ui exec tsc --noEmit
pnpm db:seed
```

Browser (two accounts, signed in):

1. `testuser@egain.com`: banner if any invite, Inbox accept/decline, badge, shortcuts, private task hidden from Marcus.
2. Decline a Marcus-sent item. Log in as Marcus: task is in his Inbox with the reason. Accept onto his day. Start/deadline still there.
3. Send to Priya with start = tomorrow. Priya accepts into Next: task sits on tomorrow, Next, deadline kept.
4. `marcus@egain.com`: open testuser's day, send, comment, reorder, delete, cannot complete/edit.
5. Add someone with a brand-new email, sign that user up, confirm via banner, then Team shows the link.
6. Today, Week, Unscheduled hide pending inbox tasks. Console clean.

Prod: run `pnpm db:migrate` before deploy. Do not seed Marcus/Priya in prod.
