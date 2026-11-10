import { describe, expect, it } from 'vitest';
import { EventHub } from './events';

describe('EventHub', () => {
  it('C12-U07 an old stream unsubscribing twice never takes a newer stream’s place', () => {
    const hub = new EventHub();
    const old = hub.subscribe('u', () => {});
    old();
    const seen: string[] = [];
    hub.subscribe('u', (e) => seen.push(e.type));
    old();
    expect(hub.connections('u')).toBe(1);
    hub.publish('u', 'task.changed', {});
    expect(seen).toEqual(['task.changed']);
  });

  it('C11-U46 last is where a stream opened after a read starts: what was published since comes back', () => {
    const hub = new EventHub();
    expect(hub.last('u')).toBe(0);
    hub.publish('u', 'inbox.changed', {});
    const at = hub.last('u');
    expect(at).toBe(1);
    hub.publish('u', 'members.changed', {});
    hub.publish('v', 'inbox.changed', {});
    expect(hub.since('u', at).map((e) => e.type)).toEqual(['members.changed']);
    expect(hub.last('v')).toBe(1);
  });
});
