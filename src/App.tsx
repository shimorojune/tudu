import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Toaster, toast } from "sonner";
import { api } from "@/lib/api";
import type { JiraIssue, PublicConfig, Task } from "@/lib/types";
import { todayStr } from "@/lib/utils";
import { Header } from "@/components/Header";
import { JiraPanel } from "@/components/JiraPanel";
import { SettingsDialog } from "@/components/SettingsDialog";
import { SplashIntro } from "@/components/SplashIntro";
import { TaskList } from "@/components/TaskList";

export default function App() {
  const [splashDone, setSplashDone] = useState(false);
  const [date, setDate] = useState(todayStr());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [issues, setIssues] = useState<JiraIssue[]>([]);
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [jiraLoading, setJiraLoading] = useState(false);
  const [jiraError, setJiraError] = useState<string | null>(null);
  const [jiraSoftMessage, setJiraSoftMessage] = useState<string | null>(null);
  const [jiraUserRefresh, setJiraUserRefresh] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const loadConfig = useCallback(async () => {
    const next = await api.getConfig();
    setConfig(next);
    if (!next.configured) {
      setSettingsOpen(true);
    }
  }, []);

  const loadTasks = useCallback(async () => {
    setTasksLoading(true);
    try {
      const next = await api.listTasks(date);
      setTasks(next);
    } finally {
      setTasksLoading(false);
    }
  }, [date]);

  const loadJira = useCallback(async (trackChanges = false, userInitiated = false) => {
    if (!config?.configured) {
      setIssues([]);
      setJiraError(null);
      setJiraSoftMessage(null);
      return;
    }

    if (userInitiated) {
      setJiraUserRefresh(true);
    }

    setJiraLoading(true);
    if (userInitiated) {
      setJiraError(null);
      setJiraSoftMessage(null);
    }

    try {
      const result = await api.fetchJiraIssues(trackChanges);
      setIssues(result.issues);
      setJiraError(null);
      setJiraSoftMessage(null);
      if (trackChanges) {
        const changeCount = result.changes.new.length + result.changes.updated.length;
        if (changeCount > 0) {
          toast.message(`${changeCount} JIRA update${changeCount === 1 ? "" : "s"} found`);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setIssues([]);
      if (userInitiated) {
        setJiraError(message);
        setJiraSoftMessage(null);
      } else {
        setJiraError(null);
        setJiraSoftMessage("We couldn't reach JIRA. Check Settings or hit Refresh.");
      }
    } finally {
      setJiraLoading(false);
    }
  }, [config?.configured]);

  useEffect(() => {
    document.documentElement.classList.add("dark");
    void loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    void loadJira(false, false);
  }, [loadJira]);

  useEffect(() => {
    const unsubs: Array<Promise<() => void>> = [];

    unsubs.push(
      listen("open-settings", () => setSettingsOpen(true)),
      listen("jira-updated", (event) => {
        const payload = event.payload as { issues: JiraIssue[] };
        setIssues(payload.issues);
        setJiraLoading(false);
        setJiraError(null);
        setJiraSoftMessage(null);
      }),
      listen("jira-error", (event) => {
        if (jiraUserRefresh) {
          setJiraError(String(event.payload));
        } else {
          setJiraSoftMessage("We couldn't reach JIRA. Check Settings or hit Refresh.");
          setJiraError(null);
        }
        setJiraLoading(false);
      }),
    );

    return () => {
      void Promise.all(unsubs).then((fns) => fns.forEach((fn) => fn()));
    };
  }, [jiraUserRefresh]);

  const personalOpen = tasks.filter((task) => !task.done).length;
  const jiraOpen = issues.length;

  if (!splashDone) {
    return <SplashIntro onComplete={() => setSplashDone(true)} />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header
        date={date}
        personalOpen={personalOpen}
        jiraOpen={jiraOpen}
        onDateChange={setDate}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main className="grid min-h-0 flex-1 grid-cols-2 gap-5 p-5">
        <TaskList
          date={date}
          tasks={tasks}
          loading={tasksLoading}
          onChange={() => void loadTasks()}
        />
        <JiraPanel
          issues={issues}
          loading={jiraLoading}
          error={jiraError}
          softMessage={jiraSoftMessage}
          configured={config?.configured ?? false}
          onRefresh={() => void loadJira(true, true)}
        />
      </main>

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        config={config}
        onSaved={() => {
          setJiraUserRefresh(false);
          void loadConfig();
          void loadJira(false, false);
        }}
      />

      <Toaster richColors position="top-right" />
    </div>
  );
}
