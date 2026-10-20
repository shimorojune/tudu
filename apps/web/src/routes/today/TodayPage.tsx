import { addDays, dayHeading, isoToday, type IsoDate } from '@tudu/core';
import { DayHeader, EmptyState, Sheet, SheetBody } from '@tudu/ui';
import { useState } from 'react';
import { useViewport } from '../../app/viewport';

/** The day page. Tasks arrive with chunk 02; this is the sheet, the header and the empty state. */
export function TodayPage() {
  const vp = useViewport();
  const today = isoToday();
  const [day, setDay] = useState<IsoDate>(today);
  const [dir, setDir] = useState<'next' | 'prev'>('next');
  const go = (next: IsoDate) => {
    setDir(next > day ? 'next' : 'prev');
    setDay(next);
  };
  const h = dayHeading(day, today);
  return (
    <div className="app-page">
      <Sheet
        label="The day"
        turnKey={day}
        turnDir={dir}
        fill
        minHeight={vp === 'phone' ? 520 : vp === 'tablet' ? 640 : 560}
      >
        <DayHeader
          eyebrow={h.eyebrow}
          day={h.day}
          date={h.date}
          done={0}
          total={0}
          isToday={h.isToday}
          onPrev={() => go(addDays(day, -1))}
          onNext={() => go(addDays(day, 1))}
          onToday={() => go(today)}
          calendar={{ today, selected: day, onPick: go }}
          compact={vp === 'phone'}
        />
        <SheetBody>
          <EmptyState
            title={h.isToday ? 'Nothing planned for today yet.' : `Nothing planned for ${h.day} yet.`}
            action="Add a task"
            onAction={() => {}}
          >
            Write the first thing you want to get done. It stays on this page until you cross it off.
          </EmptyState>
        </SheetBody>
      </Sheet>
    </div>
  );
}

/** A view that arrives with a later chunk. */
export function SoonPage({ title, body }: { title: string; body: string }) {
  return (
    <div className="app-page">
      <Sheet label={title} fill minHeight={560}>
        <SheetBody>
          <EmptyState title={title} mark={false}>
            {body}
          </EmptyState>
        </SheetBody>
      </Sheet>
    </div>
  );
}
