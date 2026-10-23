import { addDays, dueDistance, fileSize, formatDay, landsWords, type IsoDate } from '@tudu/core';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type ReactNode,
} from 'react';
import { cx } from '../lib/cx';
import { useOutside, useWidthEase } from '../lib/hooks';
import { Icon } from '../lib/icons';
import { Linger } from '../lib/linger';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { Logo } from './Logo';
import { MiniCalendar, type MiniCalendarProps } from './MiniCalendar';
import { PersonDot, type PersonDotPerson } from './PersonDot';
import { PersonPick, type PickPerson } from './PersonPick';
import { ProjectMenu, type ProjectOption } from './ProjectMenu';
import { SpaceTile, type SpaceTileSpace } from './SpaceTile';
import { showToast } from './Toast';

export interface QuickAddFile {
  /** Local identity while it uploads. */
  key: string;
  name: string;
  size: number;
  /** The attachment's id once the upload landed. */
  id?: string;
  /** 0 to 1 while it uploads. */
  progress: number;
  error?: string;
}

export interface QuickAddDraft {
  title: string;
  /** The day it lands on; null is the Backlog. */
  planned: IsoDate | null;
  due: IsoDate | null;
  projectId: string | null;
  note: string;
  files: QuickAddFile[];
}

/** What Quick Add hands over when the task is added. */
export interface QuickAddResult {
  title: string;
  planned: IsoDate | null;
  due: IsoDate | null;
  projectId: string | null;
  note: string;
  attachments: string[];
  /** The space it goes to (the top line's "In …"), when there is a choice. */
  spaceId?: string;
  /** Who it goes to; null is you. */
  toId?: string | null;
}

export interface QuickAddSpace extends SpaceTileSpace {
  id: string;
  name: string;
}

/**
 * The top line "In Northwind for Me": the spaces you are in and the people in the chosen one. Pick a person and the
 * task goes to their Inbox as a request.
 */
export interface QuickAddSend {
  spaces: QuickAddSpace[];
  /** The chosen space's id. */
  spaceId: string;
  onSpace: (spaceId: string) => void;
  /** The people in the chosen space (you included or not; you are left out of the list). */
  people: PickPerson[];
  /** Who it is for; null is you. */
  to: PickPerson | null;
  onTo: (person: PickPerson | null) => void;
  me: PersonDotPerson;
  /** Personal: no person menu. */
  canSend: boolean;
}

export interface QuickAddProps {
  /** Over the page: the bar (or the sheet on phones) with a veil. */
  open: boolean;
  /** `sheet` on phones: rises with the keyboard, pickers open upward. */
  variant?: 'bar' | 'sheet';
  /** `none`: no veil and no layer, the bar sits in the page (the floating window, the kit). */
  layer?: 'overlay' | 'none';
  today: IsoDate;
  /** The day it lands on when it opens: the day you are looking at. */
  planned?: IsoDate | null;
  projects: ProjectOption[];
  calendar?: Pick<MiniCalendarProps, 'marks' | 'month'>;
  /** The phone keyboard's height, so the sheet sits on it. */
  keyboard?: number;
  /** Offline: files need a connection. */
  offline?: boolean;
  /** Save the task. Resolve when it is on its way; reject to keep the draft. */
  onSave?: (task: QuickAddResult) => Promise<void> | void;
  /** After "Added": the task is handed over as the bar leaves. */
  onAdded?: (task: QuickAddResult) => void;
  onClose?: () => void;
  /** Every change to the draft (the macOS app keeps the floating bar's draft across launches). */
  onDraftChange?: (draft: QuickAddDraft) => void;
  onNewProject?: (name: string) => string | void;
  /** Upload a file as soon as it is added; resolve with the attachment's id. */
  onUpload?: (
    file: File,
    onProgress: (ratio: number) => void,
  ) => Promise<{ id: string; name: string; size: number }>;
  /** The kit: start in a state. */
  initial?: Partial<QuickAddDraft> & {
    added?: boolean;
    saving?: boolean;
    dropping?: boolean;
    noFocus?: boolean;
    /** The look-alike line already open with these tasks. */
    similar?: SimilarItem[];
    similarOpen?: boolean;
  };
  /** Words to start the title with (Create from Search): a new nonce writes them in. */
  seed?: { title?: string; nonce: number } | null;
  /**
   * Close matches while you write: tasks that read like the title, asked a moment after a pause. A quiet line under
   * the title names the closest; it never blocks adding.
   */
  similar?: (title: string) => Promise<SimilarItem[]>;
  /** The title in the look-alike line: go to that task, keeping the draft. */
  onOpenSimilar?: (item: SimilarItem) => void;
  /** The top line: which space, and for whom. */
  send?: QuickAddSend;
  className?: string;
}

/** A task that reads like the one being written. */
export interface SimilarItem {
  key: string;
  title: string;
  where?: { label: string } | null;
}

/** Quick Add waits this long after a pause in the title before asking for look-alikes. */
export const QA_SIMILAR_AFTER_MS = 380;
/** Titles shorter than this are never checked. */
export const QA_SIMILAR_MIN = 4;

/** The bar confirms "Added" for this long, then leaves. */
export const QA_CLOSE_AFTER_MS = 650;
export const QA_LEAVE_MS = 160;
export const QA_LEAVE_PHONE_MS = 220;

function fresh(p: QuickAddProps): QuickAddDraft {
  const i = p.initial ?? {};
  return {
    title: i.title ?? p.seed?.title ?? '',
    planned: i.planned !== undefined ? i.planned : p.planned !== undefined ? p.planned : p.today,
    due: i.due ?? null,
    projectId: i.projectId ?? null,
    note: i.note ?? '',
    files: i.files ?? [],
  };
}

const I = {
  note: <path d="M4 6h16M4 12h16M4 18h10" />,
  backlog: <path d="M3 7h18M3 12h18M3 17h12" />,
  attach: (
    <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  ),
  file: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </>
  ),
  day: (
    <>
      <rect x={3} y={4} width={18} height={18} rx={2} />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </>
  ),
  due: (
    <>
      <circle cx={12} cy={12} r={9} />
      <path d="M12 7v5l3 2" />
    </>
  ),
  project: (
    <>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx={12} cy={10} r={3} />
    </>
  ),
};
function Ic({ name, size = 14 }: { name: keyof typeof I; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {I[name]}
    </svg>
  );
}

export interface QAChipProps {
  open: boolean;
  onOpen: (open: boolean) => void;
  up?: boolean;
  empty?: boolean;
  tone?: 'today' | 'od' | null;
  aria: string;
  icon: ReactNode;
  label: string;
  pop: ReactNode;
}

/** A quiet chip that opens its picker right under it (above it on phones) and eases its width when its label changes. */
export function QAChip(p: QAChipProps) {
  const box = useRef<HTMLDivElement | null>(null);
  const btn = useRef<HTMLButtonElement | null>(null);
  useOutside(p.open, box, () => p.onOpen(false));
  useWidthEase(btn, p.label);
  return (
    <div className={cx('tp-qa-chipw', p.open && 'tp-on')} ref={box}>
      <button
        ref={btn}
        type="button"
        className={cx('tp-qa-chip', p.empty && 'tp-qa-empty', p.tone && `tp-qa-${p.tone}`)}
        aria-expanded={p.open ? 'true' : 'false'}
        aria-haspopup="dialog"
        aria-label={p.aria}
        onClick={() => p.onOpen(!p.open)}
      >
        {p.icon}
        <span>{p.label}</span>
      </button>
      <Linger open={p.open} className={cx('tp-qa-pop', p.up && 'tp-qa-pop-up')}>
        {p.pop}
      </Linger>
    </div>
  );
}

/**
 * One calm sheet for capturing a task from anywhere: the bar New task opens over the app, the floating window on
 * the desktop, the sheet above the keyboard on phones. One line to write in, three quiet chips (Planned, Due,
 * Project), a note and files only when you ask for them. Closing keeps the draft for next time.
 */
export function QuickAdd(p: QuickAddProps) {
  const { today } = p;
  const phone = p.variant === 'sheet';
  const overlay = p.layer !== 'none';
  const open = overlay ? p.open : true;
  const [f, setF] = useState<QuickAddDraft>(() => fresh(p));
  const [pop, setPop] = useState<null | 'planned' | 'due' | 'project' | 'space' | 'for'>(null);
  const [added, setAdded] = useState(!!p.initial?.added);
  const [saving, setSaving] = useState(!!p.initial?.saving);
  const [drop, setDrop] = useState(p.initial?.dropping ? 1 : 0);
  const [mounted, setMounted] = useState(open);
  const [leaving, setLeaving] = useState(false);
  const [noteOpen, setNoteOpen] = useState(!!p.initial?.note);
  const input = useRef<HTMLInputElement | null>(null);
  const noteEl = useRef<HTMLTextAreaElement | null>(null);
  const fileEl = useRef<HTMLInputElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);
  const live = useRef(p);
  useLayoutEffect(() => {
    live.current = p;
  });
  const set = (patch: Partial<QuickAddDraft>) => setF((v) => ({ ...v, ...patch }));
  useEffect(() => {
    live.current.onDraftChange?.(f);
  }, [f]);

  // Words handed in (Create from Search) become the title.
  const [seenSeed, setSeenSeed] = useState(p.seed?.nonce ?? 0);
  if (p.seed && p.seed.nonce !== seenSeed) {
    setSeenSeed(p.seed.nonce);
    if (p.seed.title !== undefined) set({ title: p.seed.title });
  }

  // Close matches while you write: when the title reads like tasks you already have, a quiet box under it says so
  // and names the closest one (its title opens it); "N more" unfolds the rest (up to three in all). It never blocks
  // adding; × hides them for those tasks.
  const [simHits, setSimHits] = useState<SimilarItem[]>(() => p.initial?.similar ?? []);
  const [simMore, setSimMore] = useState(!!p.initial?.similarOpen);
  const [simGone, setSimGone] = useState<Record<string, true>>({});
  const titleWords = f.title.trim();
  const simAsked = titleWords.length >= QA_SIMILAR_MIN;
  useEffect(() => {
    if (!live.current.similar || live.current.initial?.similar || !simAsked) return;
    let on = true;
    const t = setTimeout(() => {
      Promise.resolve()
        .then(() => live.current.similar!(titleWords))
        .then(
          (r) => {
            if (!on) return;
            const next = (r ?? []).slice(0, 3);
            setSimHits((cur) => {
              const same = cur.length === next.length && cur.every((x, i) => x.key === next[i]!.key);
              if (!same) setSimMore(false);
              return same ? cur : next;
            });
          },
          () => {
            if (on) setSimHits([]);
          },
        );
    }, QA_SIMILAR_AFTER_MS);
    return () => {
      on = false;
      clearTimeout(t);
    };
  }, [titleWords, simAsked]);
  const simShown = simAsked ? simHits.filter((x) => !simGone[x.key]) : [];
  const simOn = simShown.length > 0 && !added && !saving;

  // Opening: the panel arrives, Planned follows the day you are looking at, and the line is ready to write in.
  // Closing keeps the draft for next time.
  const [was, setWas] = useState(open);
  const [seenPlanned, setSeenPlanned] = useState(p.planned);
  if (open !== was) {
    setWas(open);
    if (open) {
      setLeaving(false);
      setMounted(true);
      setAdded(false);
      setSaving(false);
      setPop(null);
      if (p.planned !== undefined && p.planned !== seenPlanned) {
        setSeenPlanned(p.planned);
        set({ planned: p.planned });
      }
    } else if (overlay) setLeaving(true);
  }
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(
      () => {
        setMounted(false);
        setLeaving(false);
      },
      phone ? QA_LEAVE_PHONE_MS : QA_LEAVE_MS,
    );
    return () => clearTimeout(t);
  }, [leaving, phone]);
  useEffect(() => {
    if (!mounted || !open || p.initial?.noFocus) return;
    const t = setTimeout(() => input.current?.focus({ preventScroll: true }), overlay ? 30 : 0);
    return () => clearTimeout(t);
  }, [mounted, open, overlay, p.initial?.noFocus]);
  // Without a layer (the macOS app's floating window) Esc still closes the bar when there is somewhere to go.
  const escapes = overlay || !!p.onClose;
  useEffect(() => {
    if (!mounted || !open || !escapes) return;
    // Esc steps back one layer: a picker first, then the bar.
    function key(e: KeyboardEvent) {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('.tp-pm-new')) return;
      e.stopPropagation();
      setPop((cur) => {
        if (cur) return null;
        live.current.onClose?.();
        return null;
      });
    }
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [mounted, open, escapes]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const title = f.title.trim();
  const uploading = f.files.some((x) => !x.id && !x.error);

  async function add() {
    if (!title || added || saving) return;
    setSaving(true);
    setPop(null);
    // Files still on their way land first; one that failed is left out.
    const settled = async (): Promise<QuickAddFile[]> => {
      for (let i = 0; i < 200; i++) {
        const list = latestFiles.current;
        if (!list.some((x) => !x.id && !x.error)) return list;
        await new Promise((r) => setTimeout(r, 100));
      }
      return latestFiles.current;
    };
    try {
      const files = await settled();
      const task: QuickAddResult = {
        title,
        planned: f.planned,
        due: f.due,
        projectId: f.projectId,
        note: f.note.trim(),
        attachments: files.filter((x) => x.id).map((x) => x.id!),
        spaceId: p.send?.spaceId,
        toId: p.send ? (p.send.to?.id ?? null) : undefined,
      };
      await p.onSave?.(task);
      setSaving(false);
      setAdded(true);
      timer.current = setTimeout(() => {
        const now = live.current;
        now.onAdded?.(task);
        setF({
          title: '',
          planned: now.planned !== undefined ? now.planned : now.today,
          due: null,
          projectId: null,
          note: '',
          files: [],
        });
        if (overlay) now.onClose?.();
        else {
          setAdded(false);
          input.current?.focus({ preventScroll: true });
        }
      }, QA_CLOSE_AFTER_MS);
    } catch {
      setSaving(false);
      showToast('Couldn’t add the task. Your draft is still here.');
    }
  }
  const latestFiles = useRef(f.files);
  useLayoutEffect(() => {
    latestFiles.current = f.files;
  });

  function addFiles(list: ArrayLike<File>) {
    if (!list.length) return;
    if (p.offline) {
      showToast('You’re offline. Files need a connection.');
      return;
    }
    const now = Array.from(list).map((file) => ({ file, key: `f${seq.current++}` }));
    set({
      files: [
        ...f.files,
        ...now.map(({ file, key }) => ({ key, name: file.name, size: file.size, progress: 0 })),
      ],
    });
    for (const { file, key } of now) {
      const patch = (x: Partial<QuickAddFile>) =>
        setF((v) => ({ ...v, files: v.files.map((y) => (y.key === key ? { ...y, ...x } : y)) }));
      if (!p.onUpload) {
        patch({ id: key, progress: 1 });
        continue;
      }
      p.onUpload(file, (ratio) => patch({ progress: ratio })).then(
        (saved) => patch({ id: saved.id, name: saved.name, size: saved.size, progress: 1 }),
        (err: { message?: string }) => {
          patch({ error: err?.message || 'The upload failed.' });
          showToast(err?.message || `Couldn’t upload ${file.name}.`);
        },
      );
    }
  }
  function onPaste(e: ClipboardEvent) {
    const files = e.clipboardData?.files;
    if (files && files.length) {
      e.preventDefault();
      addFiles(files);
    }
  }
  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

  if (overlay && !mounted) return null;

  const proj = p.projects.find((x) => x.id === f.projectId) ?? null;
  const tomorrow = addDays(today, 1);
  const plannedWord = !f.planned
    ? 'Backlog'
    : f.planned === today
      ? 'Today'
      : f.planned === tomorrow
        ? 'Tomorrow'
        : formatDay(f.planned);
  // For someone: the task goes to their Inbox. Planned becomes the day you would like ("Asks for Tue"); they pick the day.
  const to = p.send?.to ?? null;
  const toName = to ? to.name.trim().split(/\s+/)[0]! : '';
  const space = p.send
    ? (p.send.spaces.find((s) => s.id === p.send!.spaceId) ?? p.send.spaces[0])
    : undefined;
  const plannedLabel = to ? (f.planned ? `Asks for ${plannedWord}` : 'No day asked') : plannedWord;
  const dueRel = f.due ? dueDistance(f.due, today) : null;
  const lands = landsWords(
    { planned: f.planned, due: f.due, projectName: proj?.name, note: f.note, files: f.files.length },
    today,
  );

  const plannedChip = (
    <QAChip
      open={pop === 'planned'}
      onOpen={(v) => setPop(v ? 'planned' : null)}
      up={phone}
      aria={`${to ? 'Asks for' : 'Planned for'}: ${plannedWord}`}
      icon={f.planned ? <Ic name="day" /> : <Ic name="backlog" />}
      label={plannedLabel}
      tone={f.planned === today && !to ? 'today' : null}
      pop={
        <MiniCalendar
          {...(p.calendar ?? {})}
          today={today}
          selected={f.planned ?? undefined}
          month={(f.planned ?? today).slice(0, 7)}
          presets={[
            { label: 'Today', on: f.planned === today, value: today },
            { label: 'Tomorrow', on: f.planned === tomorrow, value: tomorrow },
            { label: 'Backlog', on: !f.planned, value: null },
          ]}
          onPreset={(v) => {
            set({ planned: v });
            setPop(null);
          }}
          onPick={(k) => {
            set({ planned: k });
            setPop(null);
          }}
        />
      }
    />
  );
  const dueChip = (
    <QAChip
      open={pop === 'due'}
      onOpen={(v) => setPop(v ? 'due' : null)}
      up={phone}
      empty={!f.due}
      aria={f.due ? `Due ${formatDay(f.due)}` : 'Add a due date'}
      icon={<Ic name="due" />}
      label={f.due ? `Due ${formatDay(f.due)}` : 'Due date'}
      tone={dueRel?.tone === 'overdue' ? 'od' : null}
      pop={
        <MiniCalendar
          today={today}
          selected={f.due ?? undefined}
          month={(f.due ?? today).slice(0, 7)}
          marks={{}}
          clearLabel={f.due ? 'Remove due date' : undefined}
          onClear={
            f.due
              ? () => {
                  set({ due: null });
                  setPop(null);
                }
              : undefined
          }
          hint={(k) => {
            const r = dueDistance(k, today);
            return { text: `${formatDay(k)} · ${r.tone === 'today' ? 'due today' : r.text}`, tone: r.tone };
          }}
          hintEmpty="Pick a due date"
          onPick={(k) => {
            set({ due: k });
            setPop(null);
          }}
        />
      }
    />
  );
  const projChip = (
    <QAChip
      open={pop === 'project'}
      onOpen={(v) => setPop(v ? 'project' : null)}
      up={phone}
      empty={!proj}
      aria={proj ? `Project: ${proj.name}` : 'Choose a project'}
      icon={proj ? <i className="tp-dot" style={{ background: proj.color }} /> : <Ic name="project" />}
      label={proj ? proj.name : 'Project'}
      pop={
        <ProjectMenu
          projects={p.projects}
          selected={f.projectId}
          onPick={(id) => {
            set({ projectId: id });
            setPop(null);
          }}
          onNew={
            p.onNewProject
              ? (name) => {
                  const id = p.onNewProject!(name);
                  if (id) set({ projectId: id });
                  setPop(null);
                }
              : undefined
          }
        />
      }
    />
  );

  const noteBtn = (
    <button
      type="button"
      className={cx('tp-qa-tool', noteOpen && 'tp-on')}
      aria-label="Add a note"
      title="Add a note"
      aria-pressed={noteOpen ? 'true' : 'false'}
      onClick={() => {
        if (noteOpen && !f.note.trim()) {
          setNoteOpen(false);
          return;
        }
        setNoteOpen(true);
      }}
    >
      <Ic name="note" size={15} />
    </button>
  );
  const fileBtn = (
    <button
      type="button"
      className="tp-qa-tool"
      aria-label="Attach a file"
      title="Attach a file"
      onClick={() => {
        if (p.offline) {
          showToast('You’re offline. Files need a connection.');
          return;
        }
        fileEl.current?.click();
      }}
    >
      <Ic name="attach" size={15} />
    </button>
  );
  const simLink = (it: SimilarItem) => (
    <span key={it.key} className="tp-qa-sim-it">
      <button
        type="button"
        className="tp-qa-sim-t"
        title={`Open ${it.title}`}
        onClick={() => p.onOpenSimilar?.(it)}
      >
        {it.title}
      </button>
      {it.where?.label ? <span className="tp-qa-sim-w">{it.where.label}</span> : null}
    </span>
  );
  const addBtn = (
    <Button
      variant="primary"
      className="tp-qa-add"
      disabled={!title && !added && !saving}
      icon={to ? <Icon name="send" size={14} /> : undefined}
      loading={saving}
      loadingLabel={uploading ? 'Uploading…' : to ? 'Sending…' : 'Adding…'}
      success={added}
      successLabel={to ? 'Sent' : 'Added'}
      onClick={() => void add()}
    >
      {to ? 'Send' : phone ? 'Add' : 'Add task'}
    </Button>
  );
  // With one space there is nothing to pick: the chip reads where the task goes and is not a button.
  const spaceChip =
    p.send && p.send.spaces.length < 2 ? (
      <span className="tp-qa-chip tp-qa-static-chip" aria-label={`In ${space?.name ?? ''}`}>
        {space ? <SpaceTile space={space} size={18} /> : null}
        <span>{space?.name ?? ''}</span>
      </span>
    ) : p.send ? (
      <QAChip
        open={pop === 'space'}
        onOpen={(v) => setPop(v ? 'space' : null)}
        up={phone}
        aria={`Space: ${space?.name ?? ''}`}
        icon={space ? <SpaceTile space={space} size={18} /> : <Ic name="project" />}
        label={space?.name ?? ''}
        pop={
          <div className="tp-ppick-pop">
            <div className="tp-sswl" role="menu" aria-label="Which space">
              <div className="tp-mh">Which space</div>
              {p.send.spaces.map((s) => {
                const on = s.id === space?.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={on ? 'true' : 'false'}
                    className={cx('tp-sswl-it', on && 'tp-on')}
                    onClick={() => {
                      setPop(null);
                      if (!on) p.send!.onSpace(s.id);
                    }}
                  >
                    <SpaceTile space={s} size={24} />
                    <span className="tp-sswl-n">
                      <span>{s.name}</span>
                    </span>
                    {on ? (
                      <span className="tp-sswl-ok" aria-hidden="true">
                        <svg
                          width={14}
                          height={14}
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2.6}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M5 12.4 9.8 17.2 19.2 6.8" />
                        </svg>
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        }
      />
    ) : null;
  const forChip =
    p.send && p.send.canSend ? (
      <QAChip
        open={pop === 'for'}
        onOpen={(v) => setPop(v ? 'for' : null)}
        up={phone}
        empty={!to}
        aria={to ? `For ${to.name}` : 'Who it’s for'}
        icon={<PersonDot person={to ?? p.send.me} size={18} />}
        label={to ? to.name : 'Me'}
        pop={
          <div className="tp-ppick-pop">
            <PersonPick
              people={p.send.people}
              me={p.send.me}
              meSub={space ? `On your list in ${space.name}` : undefined}
              selected={to}
              heading="Who it’s for"
              onPick={(x) => {
                setPop(null);
                p.send!.onTo(x);
              }}
            />
          </div>
        }
      />
    ) : p.send ? (
      <span className="tp-qa-chip tp-qa-static-chip" aria-label="For you">
        <PersonDot person={p.send.me} size={18} />
        <span>Me</span>
      </span>
    ) : null;

  const panel = (
    <section
      className={cx(
        'tp-qa tp-sheet',
        phone ? 'tp-qa-phone' : 'tp-qa-desk',
        p.send && 'tp-qa-send',
        to && 'tp-qa-for',
        drop > 0 && 'tp-qa-dropping',
        added && 'tp-qa-added',
        saving && 'tp-qa-saving',
      )}
      role="dialog"
      aria-label={p.send && p.send.spaces.length > 1 ? 'New task' : 'Quick Add'}
      aria-busy={saving ? 'true' : undefined}
      onPaste={onPaste}
      onDragEnter={(e) => {
        if (hasFiles(e)) {
          e.preventDefault();
          setDrop((d) => d + 1);
        }
      }}
      onDragOver={(e) => {
        if (hasFiles(e)) e.preventDefault();
      }}
      onDragLeave={(e) => {
        if (hasFiles(e)) setDrop((d) => Math.max(0, d - 1));
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        setDrop(0);
        addFiles(e.dataTransfer.files);
      }}
    >
      <input
        ref={fileEl}
        type="file"
        multiple
        hidden
        tabIndex={-1}
        aria-label="Choose files to attach"
        onChange={(e) => {
          addFiles(e.target.files ?? []);
          e.target.value = '';
        }}
      />
      {phone ? <div className="tp-qa-grabber" aria-hidden="true" /> : null}
      {p.send ? (
        <div className="tp-qa-toline">
          <span className="tp-qa-tol">In</span>
          {spaceChip}
          <span className="tp-qa-tol">for</span>
          {forChip}
          <span className="tp-qa-sp" />
          {!phone && p.onClose ? (
            <IconButton label="Close" className="tp-qa-x" tip={false} onClick={p.onClose}>
              <Icon name="x" size={16} />
            </IconButton>
          ) : null}
        </div>
      ) : null}
      <div className="tp-qa-line">
        {phone ? null : (
          <span className="tp-qa-mark">
            <Logo size={20} />
          </span>
        )}
        <input
          ref={input}
          className="tp-qa-title"
          value={f.title}
          readOnly={saving}
          placeholder={to ? `What should ${toName} do?` : 'What needs doing?'}
          aria-label="Task title"
          spellCheck
          enterKeyHint="done"
          onChange={(e) => set({ title: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void add();
            }
          }}
        />
        {phone || !p.onClose || p.send ? null : (
          <IconButton label="Close" className="tp-qa-x" tip={false} onClick={p.onClose}>
            <Icon name="x" size={16} />
          </IconButton>
        )}
      </div>
      {p.similar || p.initial?.similar ? (
        <div className={cx('tp-qa-simwrap', simOn && 'tp-on')} aria-live="polite" inert={!simOn}>
          <div>
            {simShown.length ? (
              <div className="tp-qa-sim">
                <div className="tp-qa-sim-head">
                  <span className="tp-qa-sim-k">
                    {simShown.length > 1 ? 'Looks like tasks you have' : 'Looks like a task you have'}
                  </span>
                  <span className="tp-qa-sp" />
                  {simShown.length > 1 ? (
                    <button
                      type="button"
                      className={cx('tp-qa-sim-more', simMore && 'tp-on')}
                      aria-expanded={simMore}
                      onClick={() => setSimMore((v) => !v)}
                    >
                      {simShown.length - 1} more
                      <span className="tp-qa-sim-chev" aria-hidden="true">
                        <Icon name="right" size={12} />
                      </span>
                    </button>
                  ) : null}
                  <IconButton
                    label={simShown.length > 1 ? 'None of these' : 'Not the same task'}
                    tip={false}
                    className="tp-qa-sim-x"
                    onClick={() => {
                      const g: Record<string, true> = {};
                      for (const x of simShown) g[x.key] = true;
                      setSimGone((v) => ({ ...v, ...g }));
                      input.current?.focus();
                    }}
                  >
                    <Icon name="x" size={12} />
                  </IconButton>
                </div>
                {simLink(simShown[0]!)}
                {simShown.length > 1 ? (
                  <div className={cx('tp-qa-sim-rest', simMore && 'tp-on')} inert={!simMore}>
                    <div>{simShown.slice(1).map(simLink)}</div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {noteOpen ? (
        <textarea
          ref={noteEl}
          autoFocus
          className="tp-qa-note"
          rows={Math.min(3, Math.max(1, f.note.split('\n').length))}
          value={f.note}
          placeholder="Add a note"
          aria-label="Note"
          onChange={(e) => set({ note: e.target.value.split('\n').slice(0, 3).join('\n') })}
          onBlur={() => {
            if (!f.note.trim()) setNoteOpen(false);
          }}
        />
      ) : null}
      {f.files.length ? (
        <div className="tp-qa-files">
          {f.files.map((x) => (
            <span
              key={x.key}
              className={cx('tp-qa-file', !x.id && !x.error && 'tp-qa-file-up', x.error && 'tp-qa-file-err')}
              style={!x.id && !x.error ? ({ '--qa-up': x.progress } as React.CSSProperties) : undefined}
              title={x.error}
            >
              <Ic name="file" size={13} />
              <span className="tp-qa-fname">{x.name}</span>
              <span className="tp-qa-fsize">{x.error ? 'failed' : fileSize(x.size)}</span>
              <button
                type="button"
                aria-label={`Remove ${x.name}`}
                onClick={() => set({ files: f.files.filter((y) => y.key !== x.key) })}
              >
                <Icon name="x" size={11} />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="tp-qa-chips">
        {plannedChip}
        {dueChip}
        {projChip}
        {phone ? null : <span className="tp-qa-sp" />}
        {phone ? null : noteBtn}
        {phone ? null : fileBtn}
      </div>
      {phone ? (
        <div className="tp-qa-foot">
          {noteBtn}
          {fileBtn}
          <span className="tp-qa-sp" />
          {addBtn}
        </div>
      ) : (
        <div className="tp-qa-foot">
          <span className="tp-qa-lands" aria-live="polite">
            {to ? (
              added ? (
                <span className="tp-qa-done">
                  Sent to <b>{toName}</b>
                </span>
              ) : saving ? (
                <span className="tp-qa-busy">
                  Sending to <b>{toName}</b>…
                </span>
              ) : (
                <>
                  Goes to <b>{toName}’s Inbox</b>
                  {space && p.send!.spaces.length > 1 ? ` in ${space.name}` : ''}. {toName} picks the day
                  {lands.extra ? ` · ${lands.extra}` : ''}
                </>
              )
            ) : added ? (
              <span className="tp-qa-done">
                Added to <b>{lands.where}</b>
              </span>
            ) : saving ? (
              <span className="tp-qa-busy">
                Adding to <b>{lands.where}</b>…
              </span>
            ) : (
              <>
                {lands.pre}
                <b>{lands.where}</b>
                {lands.extra ? ` · ${lands.extra}` : ''}
              </>
            )}
          </span>
          {addBtn}
        </div>
      )}
      {drop > 0 ? (
        <div className="tp-qa-drop" aria-hidden="true">
          <Ic name="attach" size={18} />
          <span>
            <b>Drop to attach</b> · the files go with the task
          </span>
        </div>
      ) : null}
    </section>
  );

  if (!overlay)
    return (
      <div className={cx('tp-root tp-qa-static', phone && 'tp-qa-static-phone', p.className)}>{panel}</div>
    );
  return (
    <div
      className={cx(
        'tp-root tp-qa-layer',
        phone ? 'tp-qa-layer-sheet' : 'tp-qa-layer-bar',
        leaving && 'tp-leaving',
        p.className,
      )}
      style={phone && p.keyboard ? ({ '--qa-kb': `${p.keyboard}px` } as React.CSSProperties) : undefined}
    >
      <div className="tp-qa-veil" aria-hidden="true" onClick={() => p.onClose?.()} />
      {panel}
    </div>
  );
}
