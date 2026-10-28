import { useEffect, useRef, useState } from 'react';
import { Icon } from '../lib/icons';
import {
  AccessPick,
  ReachMore,
  spacesWords,
  useReach,
  type AiReach,
  type AiReachInitial,
  type AiSpace,
} from './AiReach';
import { Button } from './Button';
import { CopyBox } from './CopyBox';
import { Dialog } from './Dialog';
import { Field } from './Field';
import { Segmented } from './Segmented';

/** How long a key lasts: 30, 90 or 365 days, or never runs out. */
export type AiExpiry = '30' | '90' | '365' | 'never';

/** A new key, as the API takes it. */
export interface AiDraft extends AiReach {
  name: string;
  /** Days until it runs out; null never. */
  days: number | null;
}

export interface ApiKeyDialogProps {
  open: boolean;
  onClose?: () => void;
  /** Your spaces, for Only some. */
  spaces: AiSpace[];
  /** Names your keys already have: a new one can't repeat them. */
  taken?: string[];
  /** The MCP server's address, for the Claude Code and Cursor settings. */
  url: string;
  /** Makes the key; resolves with it (shown once), or rejects with the reason to show. */
  onCreate?: (draft: AiDraft) => Promise<{ key: string }>;
  /** State boards and tests. */
  initial?: AiReachInitial & { name?: string; expiry?: AiExpiry; more?: boolean; error?: string };
  step?: 'form' | 'reveal';
  secret?: string;
  tool?: 'claude' | 'cursor';
  copied?: boolean;
  inline?: boolean;
}

const EXPIRY_WORDS: Record<AiExpiry, string> = {
  '30': 'expires in 30 days',
  '90': 'expires in 90 days',
  '365': 'expires in 1 year',
  never: 'never expires',
};

export const KEY_FAILED_WORDS = 'Couldn’t create the key. Check your connection and try again.';

/**
 * New API key: a name and Read only or Read and write; the rest (spaces, Notebook, delete, expiry) sits folded under
 * one summary line with Change. Then the key, shown once, with how to add it to Claude Code or Cursor. A key's access
 * can't be widened later: you make a new one.
 */
export function ApiKeyDialog(p: ApiKeyDialogProps) {
  const init = p.initial ?? {};
  const r = useReach(init, 'read');
  const [name, setName] = useState(init.name ?? '');
  const [expiry, setExpiry] = useState<AiExpiry>(init.expiry ?? '90');
  const [more, setMore] = useState(!!init.more);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(init.error ?? null);
  const [srv, setSrv] = useState<string | null>(null);
  const [step, setStep] = useState(p.step ?? 'form');
  const [key, setKey] = useState(p.secret ?? '');
  const [tool, setTool] = useState<'claude' | 'cursor'>(p.tool ?? 'claude');
  const nameEl = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Opening starts fresh, the caret in the name once the dialog has risen.
  const [was, setWas] = useState(p.open);
  if (p.open !== was) {
    setWas(p.open);
    if (p.open && !p.step) {
      setStep('form');
      setName('');
      setKey('');
      setErr(null);
      setSrv(null);
      setMore(false);
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!p.open || step !== 'form' || p.inline) return;
    const t = setTimeout(() => nameEl.current?.focus({ preventScroll: true }), 240);
    return () => clearTimeout(t);
  }, [p.open, step, p.inline]);

  const taken = (p.taken ?? []).map((x) => x.toLowerCase());
  async function create() {
    if (busy) return;
    const nm = name.trim();
    if (!nm) return setErr('Give it a name, like “Claude Code on my Mac”.');
    if (taken.includes(nm.toLowerCase())) return setErr(`You already have a key called “${nm}”.`);
    if (r.scope === 'pick' && !r.picked.length) {
      setErr(null);
      setMore(true);
      return setSrv('Pick at least one space, or choose All my spaces.');
    }
    setErr(null);
    setSrv(null);
    setBusy(true);
    try {
      const out = await p.onCreate?.({
        name: nm,
        ...r.reach,
        days: expiry === 'never' ? null : Number(expiry),
      });
      if (!alive.current) return;
      setBusy(false);
      setKey(out?.key ?? '');
      setStep('reveal');
    } catch (e) {
      if (!alive.current) return;
      setBusy(false);
      setSrv(e instanceof Error && e.message ? e.message : KEY_FAILED_WORDS);
    }
  }

  if (step === 'reveal') {
    const cursor = JSON.stringify(
      { mcpServers: { tudu: { url: p.url, headers: { Authorization: `Bearer ${key}` } } } },
      null,
      2,
    );
    return (
      <Dialog
        open={p.open}
        inline={p.inline}
        onClose={p.onClose}
        title="Copy your key"
        sub={name.trim() || init.name || 'New key'}
        className="tp-ak-dlg"
        noFocus
        footer={
          <>
            <span className="tp-cs-says">You won’t see it again.</span>
            <Button size="sm" onClick={p.onClose}>
              Done
            </Button>
          </>
        }
      >
        <div className="tp-ak-reveal">
          <CopyBox value={key} secret label="Your new API key" copied={p.copied} />
          <div className="tp-cs-l">Add it to</div>
          <Segmented<'claude' | 'cursor'>
            label="Add it to"
            value={tool}
            onChange={setTool}
            items={[
              { value: 'claude', label: 'Claude Code' },
              { value: 'cursor', label: 'Cursor' },
            ]}
          />
          {tool === 'cursor' ? (
            <div key="cu" className="tp-ak-tool">
              <p className="tp-ak-how">
                Paste into <code>~/.cursor/mcp.json</code>, or the project’s <code>.cursor/mcp.json</code>.
                Tudu shows up under MCP in Cursor’s settings.
              </p>
              <CopyBox block value={cursor} label="Settings for Cursor" />
            </div>
          ) : (
            <div key="cc" className="tp-ak-tool">
              <p className="tp-ak-how">
                Run this in a terminal. Add <code>--scope user</code> to use Tudu in every project.
              </p>
              <CopyBox
                block
                value={`claude mcp add --transport http tudu ${p.url} --header "Authorization: Bearer ${key}"`}
                label="Command for Claude Code"
              />
            </div>
          )}
        </div>
      </Dialog>
    );
  }

  const summary = [spacesWords(p.spaces, r.reach)]
    .concat(r.notebook ? ['Notebook'] : [])
    .concat(r.reach.canDelete ? ['can delete'] : [])
    .concat([EXPIRY_WORDS[expiry]])
    .join(' · ');
  return (
    <Dialog
      open={p.open}
      inline={p.inline}
      onClose={busy ? undefined : p.onClose}
      title="New API key"
      className="tp-ak-dlg"
      noFocus
      footer={
        <>
          <span className="tp-cs-sp" />
          <Button variant="quiet" size="sm" onClick={p.onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={busy}
            loadingLabel="Creating…"
            onClick={() => void create()}
          >
            Create key
          </Button>
        </>
      }
    >
      <div className="tp-ak">
        <div className="tp-cs-l">Name</div>
        <Field
          ref={nameEl}
          label="Key name"
          placeholder="Claude Code on my Mac"
          value={name}
          maxLength={60}
          error={err ?? undefined}
          onChange={(e) => {
            setName(e.target.value);
            if (err) setErr(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void create();
          }}
        />
        <AccessPick r={r} />
        {more ? (
          <div className="tp-ak-more">
            <ReachMore r={r} spaces={p.spaces} onChange={() => setSrv(null)} />
            <div className="tp-cs-l">Expires</div>
            <Segmented<AiExpiry>
              label="Expires"
              value={expiry}
              onChange={setExpiry}
              items={[
                { value: '30', label: '30 days' },
                { value: '90', label: '90 days' },
                { value: '365', label: '1 year' },
                { value: 'never', label: 'Never' },
              ]}
            />
          </div>
        ) : (
          <div className="tp-ak-sum">
            <span>{summary.charAt(0).toUpperCase() + summary.slice(1)}</span>
            <button type="button" className="tp-auth-link" onClick={() => setMore(true)}>
              Change
            </button>
          </div>
        )}
        {srv ? (
          <div className="tp-help tp-ak-err" role="alert">
            <Icon name="error" size={13} stroke={2.2} />
            {srv}
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
