import { useCallback, useMemo, type ReactNode } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useViewportBand } from "@/hooks/useViewportBand";

const STORAGE_KEY = "tudu.today-panel-layout";

const DEFAULT_LAYOUT = {
  "task-list": 49,
  jira: 23,
  inspector: 28,
};

type TodayPanelLayoutProps = {
  taskList: ReactNode;
  jiraColumn: ReactNode;
  inspector: ReactNode;
};

function readStoredLayout(): Record<string, number> | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return undefined;
    }
    return JSON.parse(raw) as Record<string, number>;
  } catch {
    return undefined;
  }
}

function PanelGrip() {
  return (
    <div className="flex flex-col gap-[3px]" aria-hidden>
      <span className="size-[3px] bg-ghost" />
      <span className="size-[3px] bg-ghost" />
      <span className="size-[3px] bg-ghost" />
    </div>
  );
}

export function TodayPanelLayout({
  taskList,
  jiraColumn,
  inspector,
}: TodayPanelLayoutProps) {
  const band = useViewportBand();
  const defaultLayout = useMemo(
    () => readStoredLayout() ?? DEFAULT_LAYOUT,
    [],
  );

  const onLayoutChanged = useCallback((layout: Record<string, number>) => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  }, []);

  if (band === "phone") {
    return <div className="h-full min-h-0">{taskList}</div>;
  }

  if (band === "tablet") {
    return (
      <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_minmax(280px,396px)]">
        <div className="min-h-0 border-r border-hair">{taskList}</div>
        <div className="min-h-0">{inspector}</div>
      </div>
    );
  }

  return (
    <ResizablePanelGroup
      id="today-panels"
      orientation="horizontal"
      className="h-full"
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
    >
      <ResizablePanel id="task-list" minSize={32} defaultSize={49}>
        {taskList}
      </ResizablePanel>
      <ResizableHandle className="relative z-[3] w-[7px] bg-transparent after:w-[7px]">
        <div className="absolute inset-y-0 left-1/2 flex -translate-x-1/2 items-center justify-center">
          <PanelGrip />
        </div>
      </ResizableHandle>
      <ResizablePanel id="jira" defaultSize={23} minSize={18}>
        {jiraColumn}
      </ResizablePanel>
      <ResizableHandle className="relative z-[3] w-[7px] bg-transparent after:w-[7px]">
        <div className="absolute inset-y-0 left-1/2 flex -translate-x-1/2 items-center justify-center">
          <PanelGrip />
        </div>
      </ResizableHandle>
      <ResizablePanel id="inspector" defaultSize={28} minSize={24}>
        {inspector}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
