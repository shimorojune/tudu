import { useState } from 'react';
import type { AiLevel } from './AiAccess';
import { Segmented } from './Segmented';
import { SettingRow } from './SettingsSection';
import { SpaceTile } from './SpaceTile';
import { Switch } from './Switch';

/** One of your spaces, to pick from when an app or key reaches only some. */
export interface AiSpace {
  id: string;
  name: string;
  color?: string;
  personal?: boolean;
  initials?: string;
}

/** What you chose an app or key may do: what the API takes as `reach`. */
export interface AiReach {
  level: AiLevel;
  canDelete: boolean;
  /** Null is all your spaces, now and later. */
  spaces: string[] | null;
  notebook: boolean;
}

export interface AiReachInitial {
  level?: AiLevel;
  del?: boolean;
  scope?: 'all' | 'pick';
  picked?: string[];
  notebook?: boolean;
}

/** The choices behind the key dialog and the consent page. Read only drops Can delete. */
export function useReach(init: AiReachInitial, fallback: AiLevel) {
  const [level, setLevelRaw] = useState<AiLevel>(init.level ?? fallback);
  const [del, setDel] = useState(!!init.del);
  const [scope, setScope] = useState<'all' | 'pick'>(init.scope ?? 'all');
  const [picked, setPicked] = useState<string[]>(init.picked ?? []);
  const [notebook, setNotebook] = useState(init.notebook !== false);
  const setLevel = (v: AiLevel) => {
    setLevelRaw(v);
    if (v === 'read') setDel(false);
  };
  const toggle = (id: string, on: boolean) =>
    setPicked((l) => (on ? (l.includes(id) ? l : [...l, id]) : l.filter((x) => x !== id)));
  const reach: AiReach = {
    level,
    canDelete: level === 'write' && del,
    spaces: scope === 'all' ? null : picked,
    notebook,
  };
  return { level, setLevel, del, setDel, scope, setScope, picked, toggle, notebook, setNotebook, reach };
}

export type ReachState = ReturnType<typeof useReach>;

/** "All spaces", "Work", "3 spaces". */
export function spacesWords(spaces: AiSpace[], r: AiReach): string {
  if (!r.spaces) return 'All spaces';
  const names = spaces.filter((x) => r.spaces!.includes(x.id)).map((x) => x.name);
  return names.length === 1 ? names[0]! : `${names.length} spaces`;
}

export function AccessPick({ r }: { r: ReachState }) {
  return (
    <>
      <div className="tp-cs-l">Access</div>
      <Segmented<AiLevel>
        label="Access"
        value={r.level}
        onChange={r.setLevel}
        items={[
          { value: 'read', label: 'Read only' },
          { value: 'write', label: 'Read and write' },
        ]}
      />
    </>
  );
}

/** Spaces (all, or only some), Notebook and Can delete: what sits folded under the summary line. */
export function ReachMore({
  r,
  spaces,
  onChange,
}: {
  r: ReachState;
  spaces: AiSpace[];
  onChange?: () => void;
}) {
  return (
    <>
      <div className="tp-cs-l">Spaces</div>
      <Segmented<'all' | 'pick'>
        label="Spaces"
        value={r.scope}
        onChange={(v) => {
          r.setScope(v);
          onChange?.();
        }}
        items={[
          { value: 'all', label: 'All my spaces' },
          { value: 'pick', label: 'Only some' },
        ]}
      />
      {r.scope === 'pick' ? (
        <div className="tp-ak-spaces">
          {spaces.map((x) => (
            <SettingRow
              key={x.id}
              title={
                <span className="tp-set-app">
                  <SpaceTile space={x} size={20} />
                  {x.name}
                </span>
              }
              control={
                <Switch
                  label={x.name}
                  checked={r.picked.includes(x.id)}
                  onChange={(v) => {
                    r.toggle(x.id, v);
                    onChange?.();
                  }}
                />
              }
            />
          ))}
        </div>
      ) : null}
      <SettingRow
        className="tp-ak-sw"
        title="Notebook"
        control={<Switch label="Notebook" checked={r.notebook} onChange={r.setNotebook} />}
      />
      {r.level === 'write' ? (
        <SettingRow
          className="tp-ak-sw"
          title="Can delete"
          sub="Things go to Trash, where you can bring them back."
          control={<Switch label="Can delete" checked={r.del} onChange={r.setDel} />}
        />
      ) : null}
    </>
  );
}
