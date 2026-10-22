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
});
