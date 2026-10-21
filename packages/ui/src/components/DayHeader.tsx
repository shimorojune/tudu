import { Popover } from 'radix-ui';
import { useState, type ReactNode } from 'react';
import { cx } from '../lib/cx';
import { Icon } from '../lib/icons';
import { DayProgress } from './DayProgress';
import { IconButton } from './IconButton';
import { MiniCalendar, type MiniCalendarProps } from './MiniCalendar';
import { WeekPicker, type WeekPickerProps } from './WeekPicker';

export interface DayHeaderProps {
  /** "Today · Week 42", "Tomorrow · Week 43". Brand-text on today only; other days are quiet. */
  eyebrow?: string;
  /** The day, in Instrument Serif: "Monday". */
  day: string;
  /** "19 October". */
  date?: string;
  done?: number;
  /** With a total, the progress ring sits at the right. */
  total?: number;
  isToday?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  /** Shows "Back to today" while `isToday` is false. */
  onToday?: () => void;
  /** Props for the MiniCalendar the title opens; its `onPick` gets the day and the pop closes. */
  calendar?: MiniCalendarProps;
  /** `false` hides the arrows (the second sheet of the two-day view). */
  nav?: boolean;
  /** Phones. */
  compact?: boolean;
  /** Tools under the title: filters lead on the left, a view switch sits at the right end. */
  children?: ReactNode;
  prevLabel?: string;
  nextLabel?: string;
  todayLabel?: string;
  pickLabel?: string;
  /** The week on the desk: no sheet padding or rule, and the arrows sit on the title's line before the ring. */
  bare?: boolean;
  /** The week: the title opens the WeekPicker instead of the calendar; its `onPick` gets the Monday. */
  weeks?: WeekPickerProps;
  /** The line under "All crossed off". */
  doneNote?: string;
  className?: string;
}

/**
 * The top of the day sheet: an eyebrow, the day in Instrument Serif, the date, arrows to turn the day and the
 * progress ring. Nothing moves when you change day: the arrows sit at the right edge and "Back to today" has its
 * own slot to their left that only fades in and out. The whole title is one button that opens the calendar
 * under it (floated by Radix, see app.css); picking a day switches the sheet to it.
 */
export function DayHeader({
  eyebrow,
  day,
  date,
  done,
  total,
  isToday,
  onPrev,
  onNext,
  onToday,
  calendar,
  nav,
  compact,
  children,
  prevLabel = 'Previous day',
  nextLabel = 'Next day',
  todayLabel = 'Back to today',
  pickLabel = 'Pick a day',
  bare,
  weeks,
  doneNote,
  className,
}: DayHeaderProps) {
  const [open, setOpen] = useState(false);
  // "Back to today" always holds its place to the left of the arrows and only fades in and out, so the arrows never move.
  const away = isToday === false;
  const turn =
    nav === false ? null : (
      <div className="tp-dh-turn">
        {onToday ? (
          <button
            type="button"
            className={cx('tp-backtoday', !away && 'tp-hide')}
            onClick={away ? onToday : undefined}
            tabIndex={away ? 0 : -1}
            aria-hidden={away ? undefined : 'true'}
          >
            {todayLabel}
          </button>
        ) : null}
        <IconButton label={prevLabel} tipSide="bottom" onClick={onPrev}>
          <Icon name="left" size={16} />
        </IconButton>
        <IconButton label={nextLabel} tipSide="bottom" onClick={onNext}>
          <Icon name="right" size={16} />
        </IconButton>
      </div>
    );
  const title = (
    <>
      <h1>{day}</h1>
      {date ? <span className="tp-dh-date">{date}</span> : null}
    </>
  );

  return (
    <div className={cx('tp-root tp-dh', compact && 'tp-compact', bare && 'tp-bare', className)}>
      {/* No eyebrow and no arrows (the Backlog): no top line at all, so the title sits up where the eyebrow would be. */}
      {eyebrow || (turn && !bare) ? (
        <div className="tp-dh-top">
          <div className={cx('tp-eyebrow', isToday === false && 'tp-eb-quiet')}>{eyebrow}</div>
          {bare ? null : turn}
        </div>
      ) : null}
      <div className="tp-dh-row">
        <div className="tp-dh-day">
          {calendar || weeks ? (
            <Popover.Root open={open} onOpenChange={setOpen}>
              <Popover.Trigger asChild>
                <button
                  type="button"
                  className="tp-day tp-dh-pick"
                  aria-expanded={open ? 'true' : 'false'}
                  aria-haspopup="dialog"
                  aria-label={`${pickLabel}. Showing ${day}${date ? ` ${date}` : ''}`}
                >
                  {title}
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  className="tp-root tp-dh-pop"
                  side="bottom"
                  align="start"
                  sideOffset={10}
                  collisionPadding={8}
                >
                  {weeks ? (
                    <WeekPicker
                      {...weeks}
                      onPick={(k) => {
                        setOpen(false);
                        weeks.onPick?.(k);
                      }}
                    />
                  ) : (
                    <MiniCalendar
                      {...calendar}
                      onPick={(k) => {
                        setOpen(false);
                        calendar!.onPick?.(k);
                      }}
                    />
                  )}
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          ) : (
            <div className="tp-day">{title}</div>
          )}
        </div>
        {/* bare (the week on the desk): the arrows sit on the title's line, just before the ring, so they never move with the title. */}
        {bare ? turn : null}
        {total ? (
          <DayProgress
            done={done}
            total={total}
            compact={compact}
            size={compact ? 30 : 36}
            doneNote={doneNote}
          />
        ) : null}
      </div>
      {children ? <div className="tp-dh-tools">{children}</div> : null}
    </div>
  );
}
