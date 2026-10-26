import { useQuery } from '@tanstack/react-query';
import { addedWords } from '@tudu/core';
import { Desk, QuickAdd, showToast, syncThemeChoice, useTheme, type QuickAddDraft } from '@tudu/ui';
import type { MeResponse } from '@tudu/client';
import { useEffect, useState, type PointerEvent } from 'react';
import type { QuickAddSeed } from '../../app/dayView';
import { desktop } from '../../app/desktop';
import { useLiveEvents } from '../../app/live';
import { sendLine, useQuickAddActions, useSpacePeople } from '../../app/quickAdd';
import { taskStore } from '../../app/tasks';
import { meQuery, refreshMe } from '../../app/session';
import { lastSpace, spaceBySlug } from '../../app/space';
import { WorkingDayProvider } from '../../app/workingDay';
import './quick-add.css';

/**
 * The floating bar on its own: the same Quick Add, summoned over whatever you are doing. Write, press Add task,
 * and it is gone again. On the web it is just a page; in the macOS app it is the floating window the summon shows.
 */
export function QuickAddPage({ me }: { me: MeResponse }) {
  const { theme } = useTheme();
  const app = desktop();
  // The floating bar starts on the space you were last in on the desk (read again on every summon); its top line
  // can send it anywhere else.
  const lastHere = () => {
    const last = lastSpace(me.spaces);
    return ((last ? spaceBySlug(me.spaces, last) : undefined) ?? me.spaces.find((s) => s.kind === 'personal'))
      ?.id;
  };
  const [sendTo, setSendTo] = useState<{ spaceId: string; toId: string | null }>(() => ({
    spaceId: lastHere() ?? '',
    toId: null,
  }));
  const target = me.spaces.find((s) => s.id === sendTo.spaceId) ?? me.spaces[0]!;
  const people = useSpacePeople(me, target, true);
  const to = sendTo.toId ? (people.find((p) => p.id === sendTo.toId) ?? null) : null;
  const a = useQuickAddActions(target.id);
  // In the app the draft is kept on the Mac, so a quit and a new launch still have it.
  const [initial] = useState(() => (app ? readDraft(a.today) : undefined));
  // Make a task in the note window: the words (and the note's pill) it was summoned with, written over the draft.
  const [seed, setSeed] = useState<(QuickAddSeed & { nonce: number }) | null>(null);
  const takeSeed = () => {
    if (!app) return;
    void app.quickAddSeed().then((s) => {
      if (!s) return;
      const personal = me.spaces.find((x) => x.kind === 'personal');
      setSendTo({ spaceId: s.spaceId ?? personal?.id ?? lastHere() ?? '', toId: null });
      setSeed((was) => ({ ...s, nonce: (was?.nonce ?? 0) + 1 }));
    });
  };

  useEffect(() => {
    if (!app) return;
    takeSeed();
    return app.on('floating:shown', () => {
      setSendTo({ spaceId: lastHere() ?? '', toId: null });
      takeSeed();
      // The theme picked on the desk while the bar was put away (a hidden window may not hear it as it happens).
      syncThemeChoice();
      // The line is ready to write in, with the draft you left.
      setTimeout(() => document.querySelector<HTMLInputElement>('.app-floating .tp-qa-title')?.focus(), 0);
    });
    // lastHere reads the stored space each time; me changing does not need a new listener.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app]);

  // A click on the clear part around the bar puts it away (in the app; on the web it is just the page).
  const away = (e: PointerEvent<HTMLElement>) => {
    const t = e.target as Element;
    if (app && (t === e.currentTarget || t.classList.contains('app-floating-bar'))) app.hideFloating();
  };
  return (
    <Desk theme={theme} className="app-floating">
      <div className="app-floating-bar" onPointerDown={away}>
        <QuickAdd
          open
          layer="none"
          today={a.today}
          planned={a.today}
          projects={a.projects}
          offline={!a.online}
          onNewProject={a.newProject}
          onEditProjects={
            app
              ? () => {
                  // The desk opens Settings on this space's Projects (the bar is put away and keeps its draft).
                  app.showMain(`/${target.slug}?settings=space#projects`);
                }
              : undefined
          }
          onUpload={a.upload}
          send={sendLine(me, target, people, to, setSendTo)}
          onSave={(t) => {
            if (t.toId) {
              taskStore.sendRequest(target.id, t.toId, {
                title: t.title,
                note: t.note,
                askedDay: t.planned,
                due: t.due,
                projectId: t.projectId,
                attachments: t.attachments,
              });
              return;
            }
            a.save(t);
          }}
          onClose={app ? () => app.hideFloating() : undefined}
          initial={initial}
          seed={seed}
          onDraftChange={app ? keepDraft : undefined}
          onAdded={(t) => {
            // In the app the window goes once the tick has shown; the desk shows the task as it arrives.
            if (app) app.hideFloating();
            else showToast(addedWords(t.planned, a.today));
          }}
        />
      </div>
      {app ? null : (
        <p className="app-floating-note">
          The same Quick Add floats over whatever you are doing. Write, press Add task, and it is gone again.
        </p>
      )}
    </Desk>
  );
}

const DRAFT_KEY = 'tudu.floating.draft';

type KeptDraft = Pick<QuickAddDraft, 'title' | 'planned' | 'due' | 'projectId' | 'note'>;

/** The floating bar's draft as it was left (files are not kept: they live on the server only once added). */
export function readDraft(today: string): Partial<KeptDraft> | undefined {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null') as Partial<KeptDraft> | null;
    if (!d || typeof d.title !== 'string') return undefined;
    // A day gone by since is today again.
    if (d.planned && d.planned < today) delete d.planned;
    return d;
  } catch {
    return undefined;
  }
}

function keepDraft(d: QuickAddDraft) {
  try {
    if (!d.title && !d.note) localStorage.removeItem(DRAFT_KEY);
    else {
      const kept: KeptDraft = {
        title: d.title,
        planned: d.planned,
        due: d.due,
        projectId: d.projectId,
        note: d.note,
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(kept));
    }
  } catch {
    /* fine: the draft lives until the window closes */
  }
}

/**
 * The floating window's page in the app, signed in or not. Nobody signed in: nothing shows, and a summon that gets
 * here anyway (the session ended since) hands over to the desk's Sign in.
 */
export function FloatingQuickAdd({ me: first }: { me: MeResponse | null }) {
  const app = desktop();
  const { data } = useQuery({ ...meQuery, initialData: first });
  const me = data ?? null;
  useLiveEvents(!!me);
  useEffect(() => {
    if (!app) return;
    return app.on('floating:shown', () => {
      void refreshMe().then((now) => {
        if (!now) app.showMain('/sign-in');
      });
    });
  }, [app]);
  if (!me) return null;
  return (
    <WorkingDayProvider>
      <QuickAddPage me={me} />
    </WorkingDayProvider>
  );
}
