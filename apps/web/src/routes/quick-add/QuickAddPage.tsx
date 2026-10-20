import { addedWords } from '@tudu/core';
import { Desk, QuickAdd, showToast, useTheme } from '@tudu/ui';
import type { MeResponse } from '@tudu/client';
import { useQuickAddActions } from '../../app/quickAdd';
import './quick-add.css';

/**
 * The floating bar on its own: the same Quick Add, summoned over whatever you are doing. Write, press Add task,
 * and it is gone again. On the web it is just a page; the macOS window (chunk 11) opens it on the global summon.
 */
export function QuickAddPage({ me }: { me: MeResponse }) {
  const { theme } = useTheme();
  const space = me.spaces.find((s) => s.kind === 'personal') ?? me.spaces[0];
  const a = useQuickAddActions(space?.id);
  return (
    <Desk theme={theme} className="app-floating">
      <div className="app-floating-bar">
        <QuickAdd
          open
          layer="none"
          today={a.today}
          planned={a.today}
          projects={a.projects}
          offline={!a.online}
          onNewProject={a.newProject}
          onUpload={a.upload}
          onSave={(t) => {
            a.save(t);
          }}
          onAdded={(t) => showToast(addedWords(t.planned, a.today))}
        />
      </div>
      <p className="app-floating-note">
        The same Quick Add floats over whatever you are doing. Write, press Add task, and it is gone again.
      </p>
    </Desk>
  );
}
