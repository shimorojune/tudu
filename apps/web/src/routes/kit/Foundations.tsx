import { ICONS, Icon, Logo, Segmented, Sheet, useTheme, type IconName, type ThemeChoice } from '@tudu/ui';
import { useState } from 'react';
import { Col, Label, Pair, Row, Section } from './Pair';

const COLOURS = [
  'background',
  'foreground',
  'card',
  'muted',
  'muted-foreground',
  'foreground-2',
  'ghost',
  'accent',
  'selection',
  'border',
  'border-strong',
  'hair',
  'line',
  'primary',
  'primary-hover',
  'brand',
  'brand-text',
  'ring',
  'destructive',
  'destructive-soft',
  'success',
  'success-soft',
  'warning',
  'warning-soft',
  'jira',
  'jira-soft',
  'space-team',
  'space-project',
  'check',
  'check-border',
  'spark',
  'toast',
  'toast-foreground',
  'veil',
  'skeleton',
];
const TYPE: Array<[string, string, React.CSSProperties]> = [
  ['day', 'Monday', { fontFamily: 'var(--font-serif)', fontSize: 64, lineHeight: 0.9 }],
  [
    'day-date',
    '19 October',
    { fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 28, color: 'var(--muted-foreground)' },
  ],
  ['h2', 'Subtasks', { fontSize: 20, lineHeight: 1.3, fontWeight: 600 }],
  ['task', 'Review Quick Add PR and leave comments', { fontSize: 16, lineHeight: 1.4 }],
  [
    'subtask',
    'Test global shortcut on macOS',
    { fontSize: 14.5, lineHeight: 1.4, color: 'var(--foreground-2)' },
  ],
  [
    'body',
    'Everything lands in the Inbox either way.',
    { fontSize: 14.5, lineHeight: 1.55, color: 'var(--foreground-2)' },
  ],
  ['ui', 'New task', { fontSize: 13, lineHeight: 1.3, fontWeight: 600 }],
  ['label', 'Planned', { fontSize: 11, lineHeight: 1.3, fontWeight: 600 }],
  [
    'meta',
    'ME-52 · 2 comments',
    { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted-foreground)' },
  ],
  [
    'eyebrow',
    'TODAY · WEEK 42',
    { fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.14em', color: 'var(--brand-text)' },
  ],
];
const RADII = ['xs', 'sm', 'md', 'lg', 'xl', '2xl'];
const SHADOWS = ['sheet', 'pop', 'toast', 'seg', 'tip'];
const DURATIONS = [
  'tooltip-delay',
  'menu',
  'arrive',
  'tick',
  'fold',
  'row-open',
  'spark',
  'panel-in',
  'day-turn',
  'spread',
  'toast',
];
const EASINGS = ['arrive', 'change', 'leave', 'settle'];
const DURATION_VARS = DURATIONS.map((d) => `dur-${d}`);
const EASING_VARS = EASINGS.map((e) => `ease-${e}`);

function readTokenValues(names: string[]): Record<string, string> {
  const cs = getComputedStyle(document.documentElement);
  const out: Record<string, string> = {};
  for (const n of names) out[n] = cs.getPropertyValue(`--${n}`).trim();
  return out;
}

function useTokenValues(names: string[]): Record<string, string> {
  const [vals] = useState(() => readTokenValues(names));
  return vals;
}

export function ThemeBlock() {
  const { choice, setTheme } = useTheme();
  return (
    <Section
      id="theme"
      title="Theme"
      lead="Light, Dark or System. The whole window cross-fades over 280ms, never flashes. The choice is remembered."
    >
      <Row>
        <Segmented
          label="Theme"
          value={choice}
          onChange={(v) => setTheme(v as ThemeChoice)}
          items={[
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
            { value: 'system', label: 'System' },
          ]}
        />
      </Row>
    </Section>
  );
}

export function Foundations() {
  const durations = useTokenValues(DURATION_VARS);
  const easings = useTokenValues(EASING_VARS);
  return (
    <>
      <Section
        id="type"
        title="Type"
        lead="Geist for everything, Geist Mono for quiet signals, Instrument Serif only for the day title."
      >
        <Pair
          title="Type scale"
          render={() => (
            <div className="kit-type">
              {TYPE.map(([name, sample, style]) => (
                <div key={name}>
                  <Label>{name}</Label>
                  <span style={style}>{sample}</span>
                </div>
              ))}
            </div>
          )}
        />
      </Section>

      <Section
        id="colour"
        title="Colour"
        lead="Semantic tokens from paper-theme.css. Primary is ink; red is brand and means today, now and focus."
      >
        <Pair
          title="Tokens"
          render={() => (
            <div className="kit-swatches">
              {COLOURS.map((c) => (
                <div key={c} className="kit-swatch">
                  <i style={{ background: `var(--${c})` }} />
                  {c}
                </div>
              ))}
            </div>
          )}
        />
      </Section>

      <Section
        id="shape"
        title="Shape and depth"
        lead="Radius base 12px: 6 / 8 / 10 / 12 / 16 / 20. Warm, low shadows that deepen in dark."
      >
        <Pair
          title="Radius"
          render={() => (
            <div className="kit-radii">
              {RADII.map((r) => (
                <div key={r} style={{ borderRadius: `var(--radius-${r})` }}>
                  {r}
                </div>
              ))}
            </div>
          )}
        />
        <Pair
          title="Shadows"
          render={() => (
            <div className="kit-shadows">
              {SHADOWS.map((s) => (
                <div key={s} style={{ boxShadow: `var(--shadow-${s})` }}>
                  {s}
                </div>
              ))}
            </div>
          )}
        />
        <Pair
          title="Paper grain"
          note="Every sheet carries the grain: a 240px tiling noise, multiply in light, screen in dark."
          render={() => (
            <Sheet label="Sample sheet" style={{ padding: 24, minHeight: 120 }}>
              <span className="tp-eyebrow">Today · Week 42</span>
              <div className="tp-day" style={{ marginTop: 8 }}>
                <h1>Sunday</h1>
                <span>18 October</span>
              </div>
            </Sheet>
          )}
        />
      </Section>

      <Section
        id="motion"
        title="Motion tokens"
        lead="Curves: arrive for things coming in, leave for things going, change for state, settle for layout."
      >
        <div className="kit-tokens">
          {DURATIONS.map((d) => (
            <div key={d}>
              <b>dur-{d}</b> {durations[`dur-${d}`]}
            </div>
          ))}
          {EASINGS.map((e) => (
            <div key={e}>
              <b>ease-{e}</b> {easings[`ease-${e}`]}
            </div>
          ))}
        </div>
      </Section>

      <Section
        id="logo"
        title="Logo and icons"
        lead="The stacked ink tick, drawn live in the theme's colours. Icons are Lucide, 2px stroke, round caps."
      >
        <Pair
          title="Logo"
          render={() => (
            <Col gap={20}>
              <Row gap={24} align="flex-start">
                {[16, 24, 32, 64].map((s) => (
                  <Col key={s} gap={6}>
                    <Logo size={s} />
                    <Label>{s}px</Label>
                  </Col>
                ))}
              </Row>
              <Row gap={24}>
                <Logo size={24} wordmark />
                <Logo size={32} wordmark />
              </Row>
            </Col>
          )}
        />
        <Pair
          title="Icons"
          render={() => (
            <Row gap={14}>
              {(Object.keys(ICONS) as IconName[]).map((n) => (
                <Col key={n} gap={4}>
                  <Icon name={n} size={16} />
                  <Label>{n}</Label>
                </Col>
              ))}
            </Row>
          )}
        />
      </Section>
    </>
  );
}
