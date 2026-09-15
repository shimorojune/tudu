import { useEffect, useState, type FormEvent } from "react";
import {
  useCreateJiraJqlPresetMutation,
  useDeleteJiraJqlPresetMutation,
  useConnectJiraMutation,
  useDisconnectJiraMutation,
  useGetJiraJqlPresetsQuery,
  useGetJiraProjectsQuery,
  useGetJiraStatusRestQuery,
  useRefreshJiraComponentsMutation,
  useUpdateJiraJqlPresetMutation,
  useUpdateJiraProjectKeysMutation,
} from "@tudu/store";
import { Button } from "@/components/ui/button";
import { FormBusy } from "@/components/forms/FormBusy";
import { MultiSelect } from "@/components/ui/multi-select";
import { notifyAction } from "@/lib/notifyAction";

function errorMessage(caught: unknown, fallback: string): string {
  if (caught && typeof caught === "object" && "data" in caught) {
    const data = (caught as { data?: { error?: string } }).data;
    return data?.error ?? fallback;
  }
  return fallback;
}

export function JiraSettingsPanel() {
  const { data, isLoading, isError } = useGetJiraStatusRestQuery();
  const connection = data?.connection;
  const connected = connection?.connected === true;
  const { data: projectsData } = useGetJiraProjectsQuery(undefined, {
    skip: !connected,
  });
  const { data: presetData } = useGetJiraJqlPresetsQuery(undefined, {
    skip: !connected,
  });
  const projects = projectsData?.projects ?? [];
  const presets = presetData?.presets ?? [];
  const [connectJira, connectState] = useConnectJiraMutation();
  const [disconnectJira, disconnectState] = useDisconnectJiraMutation();
  const [updateProjectKeys, projectKeysState] = useUpdateJiraProjectKeysMutation();
  const [refreshComponents, refreshState] = useRefreshJiraComponentsMutation();
  const [createJqlPreset, createPresetState] = useCreateJiraJqlPresetMutation();
  const [updateJqlPreset, updatePresetState] = useUpdateJiraJqlPresetMutation();
  const [deleteJqlPreset, deletePresetState] = useDeleteJiraJqlPresetMutation();
  const [baseUrl, setBaseUrl] = useState("");
  const [token, setToken] = useState("");
  const [projectKeys, setProjectKeys] = useState<string[]>([]);
  const [presetName, setPresetName] = useState("");
  const [presetJql, setPresetJql] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setBaseUrl(connection?.baseUrl ?? "");
    setProjectKeys(connection?.projectKeys ?? []);
  }, [connection?.baseUrl, connection?.projectKeys]);

  const busy =
    connectState.isLoading ||
    disconnectState.isLoading ||
    projectKeysState.isLoading ||
    refreshState.isLoading ||
    createPresetState.isLoading ||
    updatePresetState.isLoading ||
    deletePresetState.isLoading;
  const projectOptions = projects.map((project) => ({
    value: project.key,
    label: `${project.key} · ${project.name}`,
  }));
  const missingSelected = projectKeys.filter(
    (key) => !projectOptions.some((option) => option.value === key),
  );
  const options = [
    ...projectOptions,
    ...missingSelected.map((key) => ({ value: key, label: key })),
  ];

  async function submitConnect(event: FormEvent) {
    event.preventDefault();
    if (!baseUrl.trim() || !token.trim() || connectState.isLoading) {
      return;
    }
    setError(null);
    setMessage(null);
    try {
      await notifyAction(
        () =>
          connectJira({
            baseUrl: baseUrl.trim(),
            token: token.trim(),
            projectKeys,
          }).unwrap(),
        { success: "Jira connected", error: "Could not connect to Jira" },
      );
      setToken("");
      if (projectKeys.length > 0) {
        try {
          await refreshComponents().unwrap();
        } catch (caught) {
          setMessage("Jira connected.");
          setError(errorMessage(caught, "Jira connected, but Components could not refresh"));
          return;
        }
      }
      setMessage("Jira connected.");
    } catch (caught) {
      setError(errorMessage(caught, "Could not connect to Jira"));
    }
  }

  async function saveProjectKeys() {
    setError(null);
    setMessage(null);
    try {
      await notifyAction(
        () => updateProjectKeys({ projectKeys }).unwrap(),
        {
          success: "Jira project keys saved",
          error: "Could not save Jira project keys",
        },
      );
      await refreshComponents().unwrap();
      setMessage("Jira project keys saved.");
    } catch (caught) {
      setError(errorMessage(caught, "Could not save Jira project keys"));
    }
  }

  async function disconnect() {
    setError(null);
    setMessage(null);
    try {
      await notifyAction(
        () => disconnectJira().unwrap(),
        { success: "Jira disconnected", error: "Could not disconnect Jira" },
      );
      setToken("");
      setMessage("Jira disconnected.");
    } catch (caught) {
      setError(errorMessage(caught, "Could not disconnect Jira"));
    }
  }

  async function createPreset(event: FormEvent) {
    event.preventDefault();
    const name = presetName.trim();
    const jql = presetJql.trim();
    if (!name || !jql || createPresetState.isLoading) {
      return;
    }
    setError(null);
    setMessage(null);
    try {
      await notifyAction(
        () => createJqlPreset({ name, jql, isDefault: false }).unwrap(),
        {
          success: "JQL preset created",
          error: "Could not create JQL preset",
        },
      );
      setPresetName("");
      setPresetJql("");
      setMessage("JQL preset created.");
    } catch (caught) {
      setError(errorMessage(caught, "Could not create JQL preset"));
    }
  }

  async function makePresetDefault(id: string) {
    setError(null);
    setMessage(null);
    try {
      await notifyAction(
        () => updateJqlPreset({ id, patch: { isDefault: true } }).unwrap(),
        {
          success: "Default JQL preset saved",
          error: "Could not save default JQL preset",
        },
      );
      setMessage("Default JQL preset saved.");
    } catch (caught) {
      setError(errorMessage(caught, "Could not save default JQL preset"));
    }
  }

  async function deletePreset(id: string) {
    setError(null);
    setMessage(null);
    try {
      await notifyAction(
        () => deleteJqlPreset({ id }).unwrap(),
        {
          success: "JQL preset deleted",
          error: "Could not delete JQL preset",
        },
      );
      setMessage("JQL preset deleted.");
    } catch (caught) {
      setError(errorMessage(caught, "Could not delete JQL preset"));
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-[10px] px-[30px] py-[26px]">
        <div className="h-[12px] w-[100px] bg-hair" />
        <div className="h-[36px] w-full max-w-[520px] bg-hair" />
        <div className="h-[36px] w-full max-w-[520px] bg-hair" />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto px-[30px] py-[26px]">
      <h1 className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-faint">
        JIRA connection
      </h1>
      <p className="mt-[10px] max-w-[560px] text-[13px] leading-[1.55] text-muted-foreground">
        Connect to Jira Data Center with a personal access token. Tudu stores the
        token encrypted on the server and only keeps project keys and Components
        in the client.
      </p>

      {isError ? (
        <p className="mt-[14px] border border-destructive px-[10px] py-[8px] text-[12.5px] text-destructive">
          Could not load the Jira connection.
        </p>
      ) : null}

      <section className="mt-[22px] border border-hair p-[14px]">
        <div className="flex flex-wrap items-center gap-[10px]">
          <span className="text-[13px] font-bold">
            {connected
              ? `Connected as ${connection?.displayName ?? "Jira user"}`
              : "Not connected"}
          </span>
          {connection?.email ? (
            <span className="text-[12px] text-muted-foreground">{connection.email}</span>
          ) : null}
          {connection?.baseUrl ? (
            <a
              href={connection.baseUrl}
              target="_blank"
              rel="noreferrer"
              className="ml-auto text-[12px] font-semibold text-muted-foreground hover:text-foreground"
            >
              Open Jira
            </a>
          ) : null}
        </div>
      </section>

      <form
        className="mt-[16px] grid max-w-[620px] gap-[13px]"
        onSubmit={(event) => void submitConnect(event)}
      >
        <FormBusy busy={busy} className="grid gap-[13px]">
        <label className="flex flex-col gap-[6px]">
          <span className="text-[12px] font-semibold text-muted-foreground">
            Jira Data Center URL
          </span>
          <input
            value={baseUrl}
            aria-label="Jira Data Center URL"
            placeholder="https://jira.example.com"
            className="border border-rule bg-transparent px-[10px] py-[8px] text-[13.5px] outline-none placeholder:text-faint"
            onChange={(event) => setBaseUrl(event.target.value)}
          />
        </label>

        <label className="flex flex-col gap-[6px]">
          <span className="text-[12px] font-semibold text-muted-foreground">
            Personal access token
          </span>
          <input
            value={token}
            type="password"
            aria-label="Personal access token"
            placeholder={connected ? "Leave blank unless reconnecting" : "Jira PAT"}
            className="border border-rule bg-transparent px-[10px] py-[8px] text-[13.5px] outline-none placeholder:text-faint"
            onChange={(event) => setToken(event.target.value)}
          />
        </label>

        <div className="flex flex-col gap-[6px]">
          <span className="text-[12px] font-semibold text-muted-foreground">
            Jira projects
          </span>
          <MultiSelect
            aria-label="Jira projects"
            values={projectKeys}
            onChange={setProjectKeys}
            disabled={!connected && (!baseUrl.trim() || !token.trim())}
            placeholder="Select Jira projects"
            searchPlaceholder="Search projects"
            emptyText={connected ? "No Jira projects found" : "Connect Jira to load projects"}
            options={options}
          />
          <span className="text-[11.5px] text-faint">
            Components refresh in the background after you save project keys.
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-[10px]">
          <Button
            type="submit"
            loading={connectState.isLoading}
            disabled={!baseUrl.trim() || !token.trim() || busy}
            className="h-auto bg-foreground px-[12px] py-[7px] text-[12.5px] font-bold text-card"
          >
            {connected ? "Reconnect Jira" : "Connect Jira"}
          </Button>
          {connected ? (
            <>
              <Button
                type="button"
                variant="outline"
                loading={projectKeysState.isLoading || refreshState.isLoading}
                disabled={busy}
                className="h-auto border-rule px-[12px] py-[7px] text-[12.5px] font-semibold"
                onClick={() => void saveProjectKeys()}
              >
                Save project keys
              </Button>
              <Button
                type="button"
                variant="outline"
                loading={disconnectState.isLoading}
                disabled={busy}
                className="h-auto border-rule px-[12px] py-[7px] text-[12.5px] text-muted-foreground"
                onClick={() => void disconnect()}
              >
                Disconnect Jira
              </Button>
            </>
          ) : null}
        </div>
        </FormBusy>
      </form>

      {error ? (
        <p className="mt-[12px] max-w-[620px] border border-destructive px-[10px] py-[8px] text-[12.5px] text-destructive">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="mt-[12px] max-w-[620px] border border-hair px-[10px] py-[8px] text-[12.5px] text-muted-foreground">
          {message}
        </p>
      ) : null}

      {connected ? (
        <section className="mt-[28px] max-w-[620px] border border-hair p-[14px]">
          <div className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-faint">
            JQL presets
          </div>
          <p className="mt-[8px] text-[12.5px] leading-[1.55] text-muted-foreground">
            Saved filters run inside Tudu's assigned, unresolved, and project
            scope.
          </p>

          <div className="mt-[12px] divide-y divide-hair border border-hair">
            {presets.length > 0 ? (
              presets.map((preset) => (
                <div
                  key={preset.id}
                  className="grid gap-[8px] px-[10px] py-[9px]"
                >
                  <div className="flex items-center gap-[8px]">
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                      {preset.name}
                    </span>
                    {preset.isDefault ? (
                      <span className="border border-hair px-[6px] py-px text-[11px] text-muted-foreground">
                        Default
                      </span>
                    ) : null}
                    <button
                      type="button"
                      disabled={busy}
                      className="text-[11.5px] text-muted-foreground hover:text-foreground disabled:opacity-50"
                      aria-label={`Make ${preset.name} default`}
                      onClick={() => void makePresetDefault(preset.id)}
                    >
                      Make default
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className="text-[11.5px] text-destructive disabled:opacity-50"
                      aria-label={`Delete ${preset.name}`}
                      onClick={() => void deletePreset(preset.id)}
                    >
                      Delete
                    </button>
                  </div>
                  <code className="block whitespace-pre-wrap text-[11.5px] leading-[1.45] text-faint">
                    {preset.jql}
                  </code>
                </div>
              ))
            ) : (
              <p className="px-[10px] py-[10px] text-[12.5px] text-faint">
                No JQL presets yet.
              </p>
            )}
          </div>

          <form className="mt-[12px] grid gap-[9px]" onSubmit={(event) => void createPreset(event)}>
            <FormBusy busy={busy} className="grid gap-[9px]">
            <input
              value={presetName}
              aria-label="JQL preset name"
              placeholder="Preset name"
              className="border border-rule bg-transparent px-[10px] py-[8px] text-[13px] outline-none placeholder:text-faint"
              onChange={(event) => setPresetName(event.target.value)}
            />
            <textarea
              value={presetJql}
              rows={3}
              aria-label="JQL preset"
              placeholder='issuetype = Bug AND status = "Code Review"'
              className="resize-y border border-rule bg-transparent px-[10px] py-[8px] text-[12.5px] leading-[1.5] outline-none placeholder:text-faint"
              onChange={(event) => setPresetJql(event.target.value)}
            />
            <Button
              type="submit"
              loading={createPresetState.isLoading}
              disabled={!presetName.trim() || !presetJql.trim() || busy}
              className="h-auto justify-self-start bg-foreground px-[12px] py-[7px] text-[12.5px] font-bold text-card"
            >
              Create JQL preset
            </Button>
            </FormBusy>
          </form>
        </section>
      ) : null}
    </div>
  );
}
