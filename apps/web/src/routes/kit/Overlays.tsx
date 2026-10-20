import { addDays, dateLabel, dueDistance, formatDay, weekdayName, type IsoDate } from '@tudu/core';
import {
  Banner,
  Button,
  ConfirmDialog,
  DayTitle,
  Dialog,
  Drawer,
  EmptyState,
  Icon,
  IconButton,
  Menu,
  MiniCalendar,
  Sheet,
  SheetBody,
  Tooltip,
  showToast,
} from '@tudu/ui';
import { useState } from 'react';
import { Col, Pair, Row, Section } from './Pair';

const TODAY: IsoDate = '2026-10-18';

function DialogDemo() {
  const [open, setOpen] = useState<null | 'md' | 'lg' | 'sheet'>(null);
  return (
    <Row>
      <Button variant="secondary" onClick={() => setOpen('md')}>
        Dialog
      </Button>
      <Button variant="secondary" onClick={() => setOpen('lg')}>
        Large
      </Button>
      <Button variant="secondary" onClick={() => setOpen('sheet')}>
        Sheet
      </Button>
      <Dialog
        open={open === 'md'}
        onClose={() => setOpen(null)}
        title="Create a space"
        sub="A space is its own Tudu, like a Slack workspace."
        footer={
          <>
            <span style={{ flex: 1 }} />
            <Button variant="quiet" size="sm" onClick={() => setOpen(null)}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => setOpen(null)}>
              Create space
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: 14, color: 'var(--foreground-2)' }}>
          The form goes here. Press Esc or click the veil to close.
        </p>
      </Dialog>
      <Dialog open={open === 'lg'} onClose={() => setOpen(null)} title="Settings" size="lg">
        <p style={{ margin: 0, fontSize: 14, color: 'var(--foreground-2)' }}>900 × 640, for Settings.</p>
      </Dialog>
      <Dialog
        open={open === 'sheet'}
        onClose={() => setOpen(null)}
        title="Create a space"
        variant="sheet"
        footer={<Button onClick={() => setOpen(null)}>Create space</Button>}
      >
        <p style={{ margin: 0, fontSize: 14, color: 'var(--foreground-2)' }}>
          On phones the dialog rises from the bottom.
        </p>
      </Dialog>
    </Row>
  );
}

function ConfirmDemo() {
  const [open, setOpen] = useState<null | 'leave' | 'delete'>(null);
  const [note, setNote] = useState('');
  return (
    <Col>
      <Row>
        <Button variant="secondary" onClick={() => setOpen('leave')}>
          Leave Northwind
        </Button>
        <Button variant="secondary" onClick={() => setOpen('delete')}>
          Delete Northwind
        </Button>
        <span style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>{note}</span>
      </Row>
      <ConfirmDialog
        open={open === 'leave'}
        onClose={() => setOpen(null)}
        title="Leave Northwind?"
        confirmLabel="Leave Northwind"
        busyLabel="Leaving…"
        doneLabel="Left"
        onConfirm={() => new Promise((r) => setTimeout(r, 700))}
        onDone={() => {
          setOpen(null);
          setNote('You left Northwind.');
        }}
      >
        You’ll stop seeing its lists, Inbox and people. What you shared stays with the space for everyone
        else.
      </ConfirmDialog>
      <ConfirmDialog
        open={open === 'delete'}
        onClose={() => setOpen(null)}
        title="Delete Northwind?"
        confirmLabel="Delete Northwind"
        busyLabel="Deleting…"
        doneLabel="Deleted"
        typeToConfirm="Northwind"
        onConfirm={() => new Promise((r) => setTimeout(r, 700))}
        onDone={() => {
          setOpen(null);
          setNote('Northwind was deleted.');
        }}
      >
        This removes Northwind and everything in it for all 19 people. It can’t be undone.
      </ConfirmDialog>
    </Col>
  );
}

function DrawerDemo() {
  const [open, setOpen] = useState<null | 'modal' | 'modeless' | 'full'>(null);
  const body = (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Row>
        <span
          style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted-foreground)' }}
        >
          ME-52
        </span>
        <IconButton label="Close" tipSide="bottom-end" onClick={() => setOpen(null)}>
          <Icon name="x" />
        </IconButton>
      </Row>
      <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Review Quick Add PR and leave comments</h2>
      <p style={{ margin: 0, fontSize: 14, color: 'var(--foreground-2)' }}>
        Esc steps out of a field first, then closes the panel.
      </p>
      <input
        aria-label="A field"
        placeholder="Try Esc while typing here"
        style={{
          height: 38,
          padding: '0 12px',
          borderRadius: 10,
          border: '1px solid var(--border-strong)',
          background: 'var(--card)',
          color: 'inherit',
        }}
      />
    </div>
  );
  return (
    <Row>
      <Button variant="secondary" onClick={() => setOpen('modal')}>
        Task panel
      </Button>
      <Button variant="secondary" onClick={() => setOpen('modeless')}>
        Modeless (Jira)
      </Button>
      <Button variant="secondary" onClick={() => setOpen('full')}>
        Phone page
      </Button>
      <Drawer open={open === 'modal'} onClose={() => setOpen(null)} label="Task">
        {body}
      </Drawer>
      <Drawer open={open === 'modeless'} onClose={() => setOpen(null)} label="Jira" modal={false} width={560}>
        {body}
      </Drawer>
      <Drawer open={open === 'full'} onClose={() => setOpen(null)} label="Task" fullscreen>
        {body}
      </Drawer>
    </Row>
  );
}

function CalendarDemo() {
  const [sel, setSel] = useState<IsoDate | null>('2026-10-18');
  return (
    <Row gap={20} align="flex-start">
      <MiniCalendar
        today={TODAY}
        selected={sel}
        onPick={setSel}
        marks={{ '2026-10-19': 3, '2026-10-20': 1, '2026-10-22': 2 }}
        hint={(d) => {
          const r = dueDistance(d, TODAY);
          return { text: `${formatDay(d)} · ${r.text}`, tone: r.tone };
        }}
      />
      <MiniCalendar
        today={TODAY}
        defaultSelected={null}
        presets={[
          { label: 'Today', value: TODAY },
          { label: 'Tomorrow', value: addDays(TODAY, 1) },
          { label: 'Backlog', value: null, on: true },
        ]}
        onPreset={() => {}}
        onClear={() => {}}
        clearLabel="Remove due date"
      />
    </Row>
  );
}

function TurnDemo() {
  const [off, setOff] = useState(0);
  const [dir, setDir] = useState<'next' | 'prev'>('next');
  const day = addDays(TODAY, off);
  const go = (n: number) => {
    setDir(n > 0 ? 'next' : 'prev');
    setOff((o) => o + n);
  };
  const lines = Math.max(1, 3 + (((off % 4) + 4) % 4));
  return (
    <Col>
      <Row>
        <IconButton label="Previous day" tipSide="bottom" onClick={() => go(-1)}>
          <Icon name="left" />
        </IconButton>
        <IconButton label="Next day" tipSide="bottom" onClick={() => go(1)}>
          <Icon name="right" />
        </IconButton>
      </Row>
      <Sheet
        label="The day"
        turnKey={day}
        turnDir={dir}
        fill
        minHeight={220}
        style={{ width: 'min(420px, 100%)', padding: 24, maxHeight: 320 }}
      >
        <div className="tp-dh">
          <DayTitle
            eyebrow={off === 0 ? 'Today · Week 42' : `Day ${off > 0 ? '+' : ''}${off}`}
            day={weekdayName(day)}
            date={dateLabel(day)}
          />
        </div>
        <SheetBody style={{ marginTop: 12 }}>
          <ul
            className="tp-list"
            style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 10 }}
          >
            {Array.from({ length: lines }, (_, i) => (
              <li key={i} style={{ fontSize: 15 }}>
                Task {i + 1} for {formatDay(day)}
              </li>
            ))}
          </ul>
        </SheetBody>
      </Sheet>
    </Col>
  );
}

export function Overlays() {
  return (
    <>
      <Section
        id="feedback"
        title="Feedback"
        lead="Tooltips after 380ms beside the target; menus from scale .96; one toast at a time; banners that grow into place."
      >
        <Pair
          title="Tooltip and Menu"
          render={() => (
            <Row gap={16}>
              <Tooltip label="Hover or focus me" side="bottom">
                <Button variant="secondary">Tooltip</Button>
              </Tooltip>
              <Menu
                label="More"
                heading="Task"
                items={[
                  { label: 'Copy link', onSelect: () => showToast('Link copied') },
                  { label: 'Copy ID', hint: 'ME-52', onSelect: () => showToast('ID copied') },
                  {
                    label: 'Delete task',
                    danger: true,
                    onSelect: () =>
                      showToast('Task deleted', {
                        action: 'Undo',
                        onAction: () => showToast('Task is back'),
                      }),
                  },
                ]}
              >
                <Button variant="secondary" icon={<Icon name="more" size={14} />}>
                  Menu
                </Button>
              </Menu>
            </Row>
          )}
        />
        <Pair
          title="Toast"
          render={() => (
            <Row>
              <Button
                variant="secondary"
                onClick={() =>
                  showToast('Task moved to Tomorrow', {
                    action: 'Undo',
                    onAction: () => showToast('Task moved back'),
                  })
                }
              >
                With Undo
              </Button>
              <Button variant="secondary" onClick={() => showToast('ID copied')}>
                Plain
              </Button>
            </Row>
          )}
        />
        <Pair
          title="Banner"
          render={() => (
            <Col gap={10}>
              <Banner tone="warning" title="You’re offline." action="Retry">
                Changes are saved here and sync when you’re back.
              </Banner>
              <Banner tone="error" title="Jira didn’t sync." action="Reconnect">
                Your sign-in expired.
              </Banner>
              <Banner tone="success" title="Connected." onDismiss={() => {}}>
                Your issues will show in a moment.
              </Banner>
              <Banner
                tone="info"
                title="It’s 00:40 on Monday."
                actions={[{ label: 'Start Monday', primary: true }, { label: 'Stay on Sunday' }]}
              >
                You’re still on Sunday’s list.
              </Banner>
            </Col>
          )}
        />
        <Pair
          title="EmptyState"
          render={() => (
            <Col gap={0}>
              <EmptyState title="Nothing planned for today yet." action="Add a task">
                Write the first thing you want to get done.
              </EmptyState>
              <EmptyState tone="error" title="This day didn’t load." action="Try again">
                Check your connection and try again.
              </EmptyState>
              <EmptyState icon="inbox" title="All caught up." />
              <EmptyState title="No tasks in Northwind." plain action="Show all projects" mark={false} />
            </Col>
          )}
        />
      </Section>

      <Section
        id="layers"
        title="Layers"
        lead="A dialog over the page with a light veil; a drawer that never pushes the day; a calendar on paper."
      >
        <Pair title="Dialog" render={() => <DialogDemo />} />
        <Pair
          title="ConfirmDialog"
          note="The ink button names the action. Delete asks you to type the name."
          render={() => <ConfirmDemo />}
        />
        <Pair
          title="Drawer"
          note="Slides 24px in and fades; leaves faster. Modeless keeps the page live."
          render={() => <DrawerDemo />}
        />
        <Pair title="MiniCalendar" render={() => <CalendarDemo />} />
        <Pair
          title="Sheet, turning the page"
          note="The old day slides 10px away and fades (110ms), the new one slides in (280ms), the height eases to fit."
          render={() => <TurnDemo />}
        />
      </Section>
    </>
  );
}
