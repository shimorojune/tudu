import { useQuery } from '@tanstack/react-query';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import {
  deleteAsk,
  goneWords,
  leaveAsk,
  PERSONAL_SLUG,
  projectDeletedWords,
  removeAsk,
  spaceRules,
  whenWords,
  type Ask,
  type Invite,
  type InviteResponse,
  type MembersResponse,
  type SpaceGoneEvent,
  type SpaceSummary,
} from '@tudu/core';
import { ApiError, type MeResponse } from '@tudu/client';
import {
  ConfirmDialog,
  Dialog,
  Settings,
  showToast,
  useLessMotion,
  useTheme,
  type MembersBodyMember,
  type SettingsMac,
  type SettingsSectionName,
} from '@tudu/ui';
import { useEffect, useState } from 'react';
import { openCreateSpace } from './dayView';
import { useAppVersion } from './DesktopHost';
import { desktop, inApp, type ThisMac } from './desktop';
import { useAppInfo } from './DesktopHost';
import { updateStore, updatesRow, useUpdateStatus } from './updates';
import { scrollToProjects, settingsClosed } from './editProjects';
import { api, initialsOf, photoSrc, queryClient, refreshMe, signOut } from './session';
import { forgetSpace, spacePath, useSpace as useSpaceFromShell } from './space';
import { invitedWords } from './spaces';
import { askJiraReconnect, clearJiraGlow, hostOf, jiraClient, peekJiraGlow, useJira } from './jira';
import { taskStore, useOnline } from './tasks';
import { useViewport } from './viewport';

export const SECTIONS: SettingsSectionName[] = ['account', 'appearance', 'mac', 'space', 'members', 'apps'];

/** A section this space has: Personal has no Members, and This Mac is only in the Mac app. */
export function sectionFor(raw: unknown, space: Pick<SpaceSummary, 'kind'>): SettingsSectionName | null {
  if (typeof raw !== 'string' || !SECTIONS.includes(raw as SettingsSectionName)) return null;
  if (raw === 'members' && space.kind !== 'team') return 'space';
  if (raw === 'mac' && !inApp()) return 'account';
  return raw as SettingsSectionName;
}

/** Where Settings lives: `?settings=members` over the page on the desk and tablets, a page of its own on phones. */
export function settingsHref(
  at: { pathname: string; searchStr: string },
  slug: string,
  section: SettingsSectionName | null,
  phone: boolean,
): string {
  if (phone) return `/${slug}/settings${section ? `/${section}` : ''}`;
  const q = new URLSearchParams(at.searchStr);
  if (section) q.set('settings', section);
  else q.delete('settings');
  const s = q.toString();
  return `${at.pathname}${s ? `?${s}` : ''}`;
}

/** Spaces this tab is leaving or deleting itself: their space.gone needs no second toast. */
const goingHere = new Set<string>();

/** A space this tab is leaving (or deleting) itself: true once, so its own event says nothing more. */
export function leftHere(spaceId: string): boolean {
  return goingHere.delete(spaceId);
}

/** Someone else ended your place in a space (or another tab did): leave it if you are in it, and say why. */

export function onSpaceGone(
  e: SpaceGoneEvent,
  current: SpaceSummary | null,
  go: (href: string) => void,
): void {
  if (goingHere.delete(e.spaceId)) return;
  showToast(goneWords(e));
  if (current?.id === e.spaceId) {
    forgetSpace();
    go(spacePath(PERSONAL_SLUG));
  }
}

/** Make a photo small before it goes up: a 256px square from its middle, as a JPEG. The original when that fails. */
async function shrink(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const side = Math.min(bmp.width, bmp.height);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = Math.min(256, side);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(
      bmp,
      (bmp.width - side) / 2,
      (bmp.height - side) / 2,
      side,
      side,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    const out = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.88));
    return out ?? file;
  } catch {
    return file;
  }
}

const errText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

interface Asking {
  ask: Ask;
  typeToConfirm?: string;
  run: () => Promise<void>;
}

/**
 * Settings › This Mac in the Mac app: read fresh from the app each time Settings opens, since you can change the
 * login item in System Settings too. Null on the web (the section is not listed).
 */
export function useThisMac(): SettingsMac | undefined {
  const bridge = desktop();
  const [mac, setMac] = useState<ThisMac | null>(null);
  const info = useAppInfo();
  const { supported, status } = useUpdateStatus(bridge);
  const [restartError, setRestartError] = useState<string | undefined>();
  useEffect(() => {
    if (!bridge) return;
    let live = true;
    void bridge.thisMac().then(
      (m) => live && setMac(m),
      () => live && setMac({ openAtLogin: 'off', dock: 'open' }),
    );
    return () => {
      live = false;
    };
  }, [bridge]);
  if (!bridge || !mac) return undefined;
  const name = info?.name ?? 'Tudu';
  return {
    ...mac,
    // An app too old to say where its updates stand has no Updates section.
    updates:
      supported === false
        ? undefined
        : {
            ...updatesRow(supported ? status : null, { name, version: info?.version ?? '' }, new Date()),
            onCheck: () => {
              setRestartError(undefined);
              // The Inbox hears of a new version at once (the app also says so to the desk).
              void bridge.checkUpdate(true).then(
                (r) => r && updateStore.setReady(r),
                () => {},
              );
            },
            onRestart: () => {
              setRestartError(undefined);
              void bridge
                .installUpdate()
                .catch(() => setRestartError(`Couldn’t restart. Quit and open ${name} again to finish.`));
            },
            restartError,
          },
    onOpenAtLogin: (on) => {
      setMac((m) => m && { ...m, openAtLogin: on ? 'on' : 'off' });
      void bridge.setOpenAtLogin(on).then(
        (openAtLogin) => setMac((m) => m && { ...m, openAtLogin }),
        () => setMac((m) => m && { ...m, openAtLogin: 'refused' }),
      );
    },
    onLoginItems: () => bridge.openLoginItems(),
    onDock: (dock) => {
      setMac((m) => m && { ...m, dock });
      bridge.setDock(dock);
    },
  };
}

/**
 * Settings over the app: the dialog on the desk and tablets, the page on phones. Every change here saves as you
 * make it (names and colours through the outbox; photos, email, roles and leaving online) and every other member's
 * Tudu follows from the live stream.
 */
export function SettingsView({
  me,
  space,
  section,
  layout,
  view,
  onSection,
  onClose,
  onBack,
}: {
  me: MeResponse;
  space: SpaceSummary;
  section: SettingsSectionName;
  layout: 'dialog' | 'phone';
  view?: 'list' | 'section';
  onSection: (s: SettingsSectionName) => void;
  onClose?: () => void;
  onBack?: () => void;
}) {
  const navigate = useNavigate();
  const { choice, setTheme } = useTheme();
  const [lessMotion, setLessMotion] = useLessMotion();
  const mac = useThisMac();
  const version = useAppVersion();
  const team = space.kind === 'team';
  const members = useQuery({ ...taskStore.membersQuery(space.id), enabled: team });
  const projects = useQuery(taskStore.projectsQuery(space.id));
  const counts = useQuery({
    ...taskStore.projectCountsQuery(space.id),
    staleTime: 0,
    enabled: section === 'space',
  });
  const [now] = useState(() => new Date());
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [asking, setAsking] = useState<Asking | null>(null);
  const online = useOnline();
  const jira = useJira(space.id);
  const jiraSpaces = useQuery({ ...jiraClient.spacesQuery(), enabled: !!jira.connected });
  // Manage spaces… from a space's Jira panel: that space's row glows, once.
  const [glow] = useState(peekJiraGlow);
  useEffect(() => clearJiraGlow(), []);
  const loc = useRouterState({ select: (s) => s.location });
  const data: MembersResponse = members.data ?? { members: [], invites: [] };
  const rules = spaceRules(space, data.members, me.user.id);
  const refreshMembers = () => {
    void queryClient.invalidateQueries({ queryKey: ['members', space.id] });
    void queryClient.invalidateQueries({ queryKey: ['me'] });
  };
  // The Jira panel's form, beside the page (a page of its own on phones).
  const openJira = () => {
    if (layout === 'phone') void navigate({ href: spacePath(space.slug, 'jira') });
    else {
      const q = new URLSearchParams(loc.searchStr);
      q.delete('settings');
      q.set('jira', '');
      void navigate({ href: `${loc.pathname}?${q.toString().replace(/(^|&)jira=(&|$)/, '$1jira$2')}` });
    }
  };
  const toPersonal = () => {
    forgetSpace();
    void navigate({ href: spacePath(PERSONAL_SLUG), replace: true });
  };

  const people: MembersBodyMember[] = data.members.map((m) => ({
    id: m.id,
    name: m.name || m.email,
    email: m.email,
    initials: initialsOf(m.name, m.email),
    color: m.color ?? undefined,
    image: photoSrc(m.image),
    role: m.role,
    you: m.id === me.user.id,
  }));

  const leave = () => {
    const ask = leaveAsk(space.name, rules.leaveBlock);
    if (rules.leaveBlock === 'last-admin') return setAsking({ ask, run: async () => onSection('members') });
    if (rules.leaveBlock === 'last-person') return setAsking({ ask, run: async () => {} });
    setAsking({
      ask,
      run: async () => {
        goingHere.add(space.id);
        try {
          await api.post(`/api/spaces/${space.id}/leave`);
        } catch (err) {
          goingHere.delete(space.id);
          throw err;
        }
        await refreshMe();
        toPersonal();
        showToast(`You left ${space.name}.`);
      },
    });
  };
  const remove = (m: MembersBodyMember) =>
    setAsking({
      ask: removeAsk(m.name, space.name),
      run: async () => {
        await api.delete(`/api/spaces/${space.id}/members/${m.id}`);
        refreshMembers();
        showToast(`${m.name} was removed from ${space.name}.`, {
          action: 'Undo',
          onAction: () =>
            void api
              .post(`/api/spaces/${space.id}/members/${m.id}/restore`)
              .then(refreshMembers, (err: unknown) => showToast(errText(err, 'Couldn’t put them back.'))),
        });
      },
    });
  const del = () =>
    setAsking({
      ask: deleteAsk(space.name, space.members),
      typeToConfirm: space.name,
      run: async () => {
        goingHere.add(space.id);
        try {
          await api.delete(`/api/spaces/${space.id}`);
        } catch (err) {
          goingHere.delete(space.id);
          throw err;
        }
        await refreshMe();
        toPersonal();
        showToast(`${space.name} was deleted.`);
      },
    });

  return (
    <>
      <Settings
        layout={layout}
        view={view}
        section={section}
        onSection={onSection}
        onClose={onClose}
        onBack={onBack}
        offline={!online}
        version={version ?? undefined}
        me={{
          name: me.user.name || me.user.email,
          fieldName: me.user.name,
          email: me.user.email,
          initials: initialsOf(me.user.name, me.user.email),
          color: me.user.color ?? undefined,
          image: photoSrc(me.user.image),
        }}
        space={{
          name: space.name,
          color: space.color ?? undefined,
          personal: !team,
          members: space.members,
          role: space.role,
        }}
        onName={(name) => taskStore.renameMe(me.user.id, name)}
        photoBusy={photoBusy}
        photoError={photoError}
        onPhoto={(file) => {
          setPhotoError(null);
          setPhotoBusy(true);
          void (async () => {
            try {
              const form = new FormData();
              form.append('file', await shrink(file), 'photo.jpg');
              await api.upload('/api/me/photo', form);
              await refreshMe();
            } catch (err) {
              setPhotoError(errText(err, 'That photo didn’t upload. Try again.'));
            } finally {
              setPhotoBusy(false);
            }
          })();
        }}
        onRemovePhoto={() =>
          void api.delete('/api/me/photo').then(
            () => refreshMe(),
            (err: unknown) => showToast(errText(err, 'Couldn’t remove the photo.')),
          )
        }
        onEmailStart={async (email) => {
          try {
            await api.post('/api/me/email', { email });
          } catch (err) {
            throw new Error(errText(err, 'Couldn’t send the code. Try again.'), { cause: err });
          }
        }}
        onEmailConfirm={async (code) => {
          try {
            const out = await api.post<{ email: string }>('/api/me/email/confirm', { code });
            showToast(`Your email is now ${out.email}.`);
            await refreshMe();
          } catch (err) {
            throw new Error(errText(err, 'That code didn’t work.'), { cause: err });
          }
        }}
        onSignOut={() => void signOut().then(() => navigate({ to: '/sign-in', replace: true }))}
        theme={choice}
        onTheme={setTheme}
        lessMotion={lessMotion}
        onLessMotion={setLessMotion}
        mac={mac}
        onSpaceName={(name) => taskStore.updateSpace(space.id, { name })}
        onSpaceColor={(color) => taskStore.updateSpace(space.id, { color })}
        onLeave={leave}
        onDelete={del}
        onCreateSpace={openCreateSpace}
        projects={{
          projects: (projects.data ?? []).map((p) => ({
            id: p.id,
            name: p.name,
            color: p.color,
            open: counts.data?.[p.id] ?? 0,
          })),
          onRename: (p, name) => taskStore.updateProject(space.id, p.id, { name }),
          onRecolour: (p, color) => taskStore.updateProject(space.id, p.id, { color }),
          spaceName: space.name,
          onCreate: (name, color) => taskStore.createProject(space.id, name, color),
          onDelete: (p) => {
            taskStore.deleteProject(space.id, p.id);
            showToast(projectDeletedWords(p.name, p.open), {
              action: 'Undo',
              onAction: () => taskStore.restoreProject(space.id, p.id),
            });
          },
        }}
        members={people}
        invites={data.invites.map((i) => ({ id: i.id, email: i.email, when: whenWords(i.sentAt, now) }))}
        onInvite={async (emails) => {
          try {
            const out = await api.post<InviteResponse>(`/api/spaces/${space.id}/invites`, { emails });
            refreshMembers();
            showToast(invitedWords(out.results, space.name));
          } catch (err) {
            showToast(errText(err, 'Couldn’t send the invites.'));
            throw err;
          }
        }}
        onResendInvite={(i) =>
          void api
            .post(`/api/spaces/${space.id}/invites`, { emails: [i.email] })
            .then(refreshMembers, (err: unknown) => showToast(errText(err, 'Couldn’t resend it.')))
        }
        onCancelInvite={(i) => {
          const inv = data.invites.find((x) => x.id === i.id) as Invite;
          void api.delete(`/api/invites/${inv.id}`).then(
            () => {
              refreshMembers();
              showToast(`Invite to ${inv.email} cancelled`, {
                action: 'Undo',
                onAction: () => void api.post(`/api/invites/${inv.id}/restore`).then(refreshMembers),
              });
            },
            (err: unknown) => showToast(errText(err, 'Couldn’t cancel the invite.')),
          );
        }}
        onRole={(m, role) =>
          void api.patch(`/api/spaces/${space.id}/members/${m.id}`, { role }).then(
            () => {
              refreshMembers();
              showToast(role === 'admin' ? `${m.name} is an admin now.` : `${m.name} is a member now.`);
            },
            (err: unknown) => showToast(errText(err, 'Couldn’t change the role.')),
          )
        }
        onRemove={remove}
        jira={
          jira.connected
            ? {
                connected: true,
                who: jira.connected.who.email || jira.connected.who.name,
                site: hostOf(jira.connected),
                state: jira.connected.state,
                loading: jiraSpaces.isPending,
                error: jiraSpaces.isError,
                spaces: jiraSpaces.data?.spaces.map((x) => ({
                  id: x.id,
                  name: x.name,
                  color: x.color ?? undefined,
                  personal: x.kind === 'personal',
                  on: x.on,
                  linked: x.linked,
                  current: x.id === space.id,
                  highlight: x.id === glow,
                })),
              }
            : { connected: false }
        }
        onJiraSpace={(x, on) =>
          jiraClient.setOn(x.id, on).then(
            () => undefined,
            (err: unknown) => ({
              error: errText(err, on ? 'Couldn’t turn Jira on there.' : 'Couldn’t turn Jira off there.'),
            }),
          )
        }
        onRetry={() => void jiraSpaces.refetch()}
        onJiraReconnect={() => {
          askJiraReconnect();
          openJira();
        }}
        onJira={() => {
          if (jira.connected) {
            setAsking({
              ask: {
                title: 'Disconnect Jira?',
                body: 'Jira goes from every space you turned it on in, with your saved views. Your tasks keep their Jira keys.',
                confirm: 'Disconnect Jira',
              },
              run: async () => {
                await jiraClient.disconnect();
                showToast('Jira disconnected from all your spaces. Your tasks keep their Jira keys.');
              },
            });
            return;
          }
          openJira();
        }}
      />
      <ConfirmDialog
        open={!!asking}
        variant={layout === 'phone' ? 'sheet' : 'dialog'}
        title={asking?.ask.title ?? ''}
        confirmLabel={asking?.ask.confirm ?? ''}
        typeToConfirm={asking?.typeToConfirm}
        onClose={() => setAsking(null)}
        onConfirm={async () => {
          try {
            await asking?.run();
          } catch (err) {
            showToast(errText(err, 'That didn’t work. Try again.'));
            throw err;
          }
        }}
      >
        {asking?.ask.body}
      </ConfirmDialog>
    </>
  );
}

/** The dialog on the desk and tablets, opened by `?settings=` on whatever page you are on. */
export function SettingsHost({ me, space }: { me: MeResponse; space: SpaceSummary }) {
  const vp = useViewport();
  const navigate = useNavigate();
  const loc = useRouterState({ select: (s) => s.location });
  const raw = new URLSearchParams(loc.searchStr).get('settings');
  const section = sectionFor(raw, space);
  const phone = vp === 'phone';
  const [last, setLast] = useState<SettingsSectionName>('account');
  if (section && section !== last) setLast(section);
  // A phone reached with ?settings= goes to the Settings page instead.
  useEffect(() => {
    if (phone && section)
      void navigate({ href: settingsHref(loc, space.slug, section, true), replace: true });
  }, [phone, section, loc, space.slug, navigate]);
  // "Edit projects…" lands here with #projects: the block comes into view.
  useEffect(() => {
    if (section === 'space' && loc.hash === 'projects') scrollToProjects();
  }, [section, loc.hash]);
  if (phone) return null;
  const close = () => {
    void navigate({ href: settingsHref(loc, space.slug, null, false) });
    settingsClosed();
  };
  return (
    <Dialog open={!!section} onClose={close} size="lg" bare label="Settings">
      <SettingsView
        me={me}
        space={space}
        section={section ?? last}
        layout="dialog"
        onSection={(s) => void navigate({ href: settingsHref(loc, space.slug, s, false), replace: true })}
        onClose={close}
      />
    </Dialog>
  );
}

/** Phones: Settings is a page under More (or your avatar); a section pushes in with ‹ Settings. */
export function SettingsPage({ me, section }: { me: MeResponse; section?: string }) {
  const vp = useViewport();
  const navigate = useNavigate();
  const space = useSpaceFromShell();
  const picked = section ? sectionFor(section, space) : null;
  // The desk and tablets keep Settings over the page: the address turns into Today with ?settings=.
  useEffect(() => {
    if (vp !== 'phone')
      void navigate({ href: `${spacePath(space.slug)}?settings=${picked ?? 'account'}`, replace: true });
  }, [vp, picked, space.slug, navigate]);
  const hash = useRouterState({ select: (s) => s.location.hash });
  useEffect(() => {
    if (vp === 'phone' && picked === 'space' && hash === 'projects') scrollToProjects();
  }, [vp, picked, hash]);
  if (vp !== 'phone') return null;
  return (
    <div className="app-page app-settings">
      <SettingsView
        me={me}
        space={space}
        layout="phone"
        view={picked ? 'section' : 'list'}
        section={picked ?? 'account'}
        onSection={(s) => void navigate({ href: `/${space.slug}/settings/${s}` })}
        onBack={() => void navigate({ href: `/${space.slug}/settings` })}
      />
    </div>
  );
}
