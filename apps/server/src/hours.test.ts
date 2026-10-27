import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_HOURS, ME_CHANGED, type WorkHours } from '@tudu/core';
import type { Jar } from '../test/harness';
import { get, post, signIn, startServer } from '../test/harness';

let server: ReturnType<typeof startServer>;
beforeAll(() => {
  server = startServer();
});
afterAll(async () => {
  await server.close();
});

async function me(jar: Jar): Promise<{ user: { id: string }; workHours: WorkHours }> {
  const res = await get(server.app, '/api/me', jar);
  expect(res.status).toBe(200);
  return (await res.json()) as { user: { id: string }; workHours: WorkHours };
}

const shortFriday: WorkHours = {
  days: [
    { day: 1, start: '09:00', end: '18:00' },
    { day: 2, start: '09:00', end: '18:00' },
    { day: 3, start: '09:00', end: '18:00' },
    { day: 4, start: '09:00', end: '18:00' },
    { day: 5, start: '09:00', end: '14:00' },
  ],
  same: false,
};

describe('working hours', () => {
  it('WH-A01 a new account reads the default hours', async () => {
    const { jar } = await signIn(server);
    expect((await me(jar)).workHours).toEqual(DEFAULT_HOURS);
  });

  it('WH-A02 saving keeps the hours, a second save replaces them, and your other Tudus are told', async () => {
    const { jar } = await signIn(server);
    const id = (await me(jar)).user.id;
    const before = server.hub.since(id, 0).length;

    const res = await post(server.app, '/api/me/hours', shortFriday, jar);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ workHours: shortFriday });
    expect((await me(jar)).workHours).toEqual(shortFriday);

    const everyDay: WorkHours = {
      days: [1, 2, 3, 4, 5, 6, 7].map((day) => ({ day, start: '10:00', end: '16:00' })),
      same: true,
    };
    expect((await post(server.app, '/api/me/hours', everyDay, jar)).status).toBe(200);
    expect((await me(jar)).workHours).toEqual(everyDay);

    const told = server.hub
      .since(id, 0)
      .slice(before)
      .filter((e) => e.type === ME_CHANGED);
    expect(told).toHaveLength(2);
  });

  it('WH-A03 refuses bad bodies with the reason, and needs a session', async () => {
    const { jar } = await signIn(server);
    const refuse = async (body: unknown, error: string) => {
      const res = await post(server.app, '/api/me/hours', body, jar);
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBe(error);
    };
    await refuse({ days: [], same: true }, 'Pick at least one day.');
    await refuse(
      { days: [{ day: 1, start: '18:00', end: '09:00' }], same: true },
      'The end needs to be after the start.',
    );
    await refuse(
      { days: [{ day: 1, start: '9am', end: '18:00' }], same: true },
      'Times are written like 09:00.',
    );
    await refuse({ ...DEFAULT_HOURS, zone: 'UTC' }, 'Send { days: [{ day, start, end }], same }.');
    expect((await me(jar)).workHours).toEqual(DEFAULT_HOURS);

    expect((await post(server.app, '/api/me/hours', DEFAULT_HOURS)).status).toBe(401);
  });
});
