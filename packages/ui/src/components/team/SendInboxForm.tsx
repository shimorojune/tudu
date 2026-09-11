import { useState, type FormEvent } from "react";
import { ProjectChip } from "@/components/projects/ProjectChip";
import { ProjectPicker } from "@/components/projects/ProjectPicker";
import { DateField } from "@/components/ui/date-field";
import {
  useCreateReportProjectMutation,
  useGetReportProjectsQuery,
  useSendInboxTaskMutation,
} from "@tudu/store";
import { personFirstName } from "@/lib/person";

export type SendInboxFormProps = {
  userId: string;
  reportName: string;
  autoFocus?: boolean;
  onSent?: () => void;
  onCancel?: () => void;
};

export function SendInboxForm({
  userId,
  reportName,
  autoFocus = false,
  onSent,
  onCancel,
}: SendInboxFormProps) {
  const first = personFirstName(reportName);
  const [sendTask, { isLoading }] = useSendInboxTaskMutation();
  const { data: projects = [] } = useGetReportProjectsQuery(userId);
  const [createReportProject] = useCreateReportProjectMutation();
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [startDate, setStartDate] = useState("");
  const [deadline, setDeadline] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const selectedProject =
    projects.find((project) => project.id === projectId) ?? null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      return;
    }
    setError(null);
    try {
      await sendTask({
        userId,
        title: trimmed,
        description: note.trim() ? note.trim() : null,
        startDate: startDate || null,
        deadline: deadline ? `${deadline}T18:00:00.000Z` : null,
        projectId: projectId ?? undefined,
      }).unwrap();
      setTitle("");
      setNote("");
      setStartDate("");
      setDeadline("");
      setProjectId(null);
      onSent?.();
    } catch (caught) {
      const message =
        caught && typeof caught === "object" && "data" in caught
          ? String((caught as { data?: { error?: string } }).data?.error ?? "Could not send")
          : "Could not send";
      setError(message);
    }
  }

  return (
    <form className="flex h-full min-h-0 flex-col bg-background" onSubmit={(event) => void handleSubmit(event)}>
      <div className="flex flex-col gap-[4px] border-b border-hair px-[24px] py-[20px]">
        <span className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-faint">
          Send a task to {first}
        </span>
        <span className="text-[11.5px] text-muted-foreground">
          Lands in their Inbox. They accept or decline.
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-[16px] overflow-y-auto px-[24px] py-[18px]">
        <label className="flex flex-col gap-[7px]">
          <span className="text-[12px] text-muted-foreground">Task</span>
          <input
            required
            autoFocus={autoFocus}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="border border-rule bg-card px-[11px] py-[9px] text-[14px] outline-none"
          />
        </label>
        <div className="grid grid-cols-2 gap-[12px]">
          <label className="flex flex-col gap-[7px]">
            <span className="text-[12px] text-muted-foreground">Start</span>
            <DateField
              value={startDate}
              onChange={setStartDate}
              aria-label="Start date"
            />
          </label>
          <label className="flex flex-col gap-[7px]">
            <span className="text-[12px] text-muted-foreground">Deadline</span>
            <DateField
              value={deadline}
              onChange={setDeadline}
              aria-label="Deadline"
            />
          </label>
        </div>
        <label className="flex flex-col gap-[7px]">
          <span className="text-[12px] text-muted-foreground">Project</span>
          <ProjectPicker
            value={projectId}
            onChange={setProjectId}
            projects={projects}
            onCreate={(body) =>
              createReportProject({ userId, body }).unwrap()
            }
          />
          {selectedProject ? (
            <span className="text-[12px] text-muted-foreground">
              Lands on <ProjectChip project={selectedProject} />
            </span>
          ) : null}
        </label>
        <label className="flex flex-col gap-[7px]">
          <span className="text-[12px] text-muted-foreground">Note</span>
          <textarea
            value={note}
            rows={3}
            placeholder={'Why this matters, or what "done" looks like…'}
            onChange={(event) => setNote(event.target.value)}
            className="min-h-[56px] resize-none border border-rule bg-card px-[11px] py-[9px] text-[13.5px] outline-none placeholder:text-faint"
          />
        </label>
        {error ? (
          <p className="text-[12.5px] text-destructive">{error}</p>
        ) : null}
        <div className="flex items-center gap-[12px]">
          <button
            type="submit"
            disabled={!title.trim() || isLoading}
            className="bg-primary px-[15px] py-[8px] text-[12.5px] font-bold text-primary-foreground disabled:opacity-40"
          >
            Send to Inbox
          </button>
          {onCancel ? (
            <button
              type="button"
              className="text-[12.5px] text-muted-foreground"
              onClick={onCancel}
            >
              Cancel
            </button>
          ) : null}
        </div>
      </div>
    </form>
  );
}
