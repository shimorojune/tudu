import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  whenWords,
  type Invite,
  type InviteResponse,
  type MembersResponse,
  type SpaceSummary,
} from '@tudu/core';
import { ApiError, type MeResponse } from '@tudu/client';
import { CreateSpace, MembersCard, showToast, type CreateSpaceInput } from '@tudu/ui';
import { useState } from 'react';
import { closeCreateSpace, closeMembers, useCreateSpaceOpen, useMembersOpen } from './dayView';
import { api, queryClient, refreshMe } from './session';
import { rememberSpace, spacePath } from './space';
import { taskStore } from './tasks';
import { useViewport } from './viewport';

/** "Northwind is ready. Invites sent to 2 people." */
export function readyWords(name: string, invited: number): string {
  if (!invited) return `${name} is ready.`;
  return `${name} is ready. ${invited === 1 ? 'An invite went out.' : `Invites sent to ${invited} people.`}`;
}

/** What inviting came to, in one line: "Invite sent to meera@x.y.", "arjun@x.y is already in Northwind." */
export function invitedWords(results: InviteResponse['results'], spaceName: string): string {
  const sent = results.filter((r) => r.outcome !== 'member');
  const already = results.filter((r) => r.outcome === 'member');
  const parts: string[] = [];
  if (sent.length === 1) parts.push(`Invite sent to ${sent[0]!.email}.`);
  else if (sent.length > 1) parts.push(`Invites sent to ${sent.length} people.`);
  if (already.length === 1) parts.push(`${already[0]!.email} is already in ${spaceName}.`);
  else if (already.length > 1) parts.push(`${already.length} of them are already in ${spaceName}.`);
  return parts.join(' ');
}

/** Make a team space on the server and open it. */
export async function createSpace(
  input: CreateSpaceInput,
): Promise<{ space: SpaceSummary; invited: string[] }> {
  return api.post<{ space: SpaceSummary; invited: string[] }>('/api/spaces', {
    name: input.name,
    color: input.color,
    invites: input.invites,
  });
}

/** The Create a space dialog over the app: you land on the new space's Today with a toast. */
export function CreateSpaceHost() {
  const vp = useViewport();
  const open = useCreateSpaceOpen();
  const navigate = useNavigate();
  return (
    <CreateSpace
      open={open}
      variant={vp === 'phone' ? 'sheet' : 'dialog'}
      onClose={closeCreateSpace}
      onCreate={async (input) => {
        try {
          const out = await createSpace(input);
          await refreshMe();
          rememberSpace(out.space.slug);
          setTimeout(() => {
            closeCreateSpace();
            void navigate({ href: spacePath(out.space.slug) });
            showToast(readyWords(out.space.name, out.invited.length));
          }, 520);
        } catch (err) {
          showToast(err instanceof ApiError ? err.message : 'Couldn’t create the space. Try again.');
          throw err;
        }
      }}
    />
  );
}

/** The Members card over the app: who is in the space, invite by email, the invites waiting with Cancel (Undo). */
export function MembersHost({ me, space }: { me: MeResponse; space: SpaceSummary }) {
  const vp = useViewport();
  const open = useMembersOpen();
  const q = useQuery({ ...taskStore.membersQuery(space.id), enabled: open });
  const [now] = useState(() => new Date());
  const data: MembersResponse = q.data ?? { members: [], invites: [] };
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['members', space.id] });
    void queryClient.invalidateQueries({ queryKey: ['me'] });
  };
  const cancel = async (inv: Invite) => {
    try {
      await api.delete(`/api/invites/${inv.id}`);
      refresh();
      showToast(`Invite to ${inv.email} cancelled`, {
        action: 'Undo',
        onAction: () => void api.post(`/api/invites/${inv.id}/restore`).then(refresh),
      });
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Couldn’t cancel the invite.');
    }
  };
  const invite = async (emails: string[]) => {
    try {
      const out = await api.post<InviteResponse>(`/api/spaces/${space.id}/invites`, { emails });
      refresh();
      showToast(invitedWords(out.results, space.name));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Couldn’t send the invites.');
      throw err;
    }
  };
  if (space.kind !== 'team') return null;
  return (
    <MembersCard
      open={open}
      variant={vp === 'phone' ? 'sheet' : 'dialog'}
      spaceName={space.name}
      members={data.members.map((m) => ({
        id: m.id,
        name: m.name || m.email,
        email: m.email,
        initials: initialsFor(m.name, m.email),
        color: m.color ?? undefined,
        role: m.role,
        you: m.id === me.user.id,
      }))}
      invites={data.invites.map((i) => ({ id: i.id, email: i.email, when: whenWords(i.sentAt, now) }))}
      onInvite={invite}
      onCancelInvite={(i) => void cancel(data.invites.find((x) => x.id === i.id)!)}
      onResendInvite={(i) => void invite([i.email])}
      onClose={closeMembers}
    />
  );
}

function initialsFor(name: string, email: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  if (words.length === 1 && words[0]!.length) return words[0]!.slice(0, 2).toUpperCase();
  return email.slice(0, 1).toUpperCase();
}
