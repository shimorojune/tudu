import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { JiraSettingsPanel } from "./JiraSettingsPanel";

const connectJira = vi.hoisted(() => vi.fn());
const disconnectJira = vi.hoisted(() => vi.fn());
const updateJiraProjectKeys = vi.hoisted(() => vi.fn());
const refreshJiraComponents = vi.hoisted(() => vi.fn());
const createJiraJqlPreset = vi.hoisted(() => vi.fn());
const updateJiraJqlPreset = vi.hoisted(() => vi.fn());
const deleteJiraJqlPreset = vi.hoisted(() => vi.fn());
const jiraState = vi.hoisted(() => ({
  connected: true,
  projectKeys: ["EGS"],
  presets: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      name: "My bugs",
      jql: "issuetype = Bug",
      isDefault: true,
      createdAt: "2026-09-13T10:00:00.000Z",
      updatedAt: "2026-09-13T10:00:00.000Z",
    },
  ],
}));
const mutationResult = vi.hoisted(() => ({
  unwrap: () => Promise.resolve({}),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@tudu/store", () => ({
  useGetJiraStatusRestQuery: () => ({
    data: {
      connection: {
        connected: jiraState.connected,
        baseUrl: jiraState.connected ? "https://jira.example.test" : null,
        displayName: jiraState.connected ? "Test User" : null,
        email: jiraState.connected ? "testuser@example.test" : null,
        projectKeys: jiraState.projectKeys,
        updatedAt: jiraState.connected ? "2026-09-11T08:00:00.000Z" : null,
      },
    },
    isLoading: false,
    isError: false,
  }),
  useGetJiraProjectsQuery: () => ({
    data: {
      projects: [
        { key: "EGS", name: "eGain Suite" },
        { key: "KB", name: "Knowledge Base" },
      ],
    },
    isLoading: false,
  }),
  useConnectJiraMutation: () => [connectJira, { isLoading: false }],
  useDisconnectJiraMutation: () => [disconnectJira, { isLoading: false }],
  useUpdateJiraProjectKeysMutation: () => [
    updateJiraProjectKeys,
    { isLoading: false },
  ],
  useRefreshJiraComponentsMutation: () => [refreshJiraComponents, { isLoading: false }],
  useGetJiraJqlPresetsQuery: () => ({
    data: { presets: jiraState.presets },
    isLoading: false,
  }),
  useCreateJiraJqlPresetMutation: () => [createJiraJqlPreset, { isLoading: false }],
  useUpdateJiraJqlPresetMutation: () => [updateJiraJqlPreset, { isLoading: false }],
  useDeleteJiraJqlPresetMutation: () => [deleteJiraJqlPreset, { isLoading: false }],
}));

describe("JiraSettingsPanel", () => {
  beforeEach(() => {
    jiraState.connected = true;
    jiraState.projectKeys = ["EGS"];
    connectJira.mockReset();
    disconnectJira.mockReset();
    updateJiraProjectKeys.mockReset();
    refreshJiraComponents.mockReset();
    createJiraJqlPreset.mockReset();
    updateJiraJqlPreset.mockReset();
    deleteJiraJqlPreset.mockReset();
    connectJira.mockReturnValue(mutationResult);
    disconnectJira.mockReturnValue(mutationResult);
    updateJiraProjectKeys.mockReturnValue(mutationResult);
    refreshJiraComponents.mockReturnValue(mutationResult);
    createJiraJqlPreset.mockReturnValue(mutationResult);
    updateJiraJqlPreset.mockReturnValue(mutationResult);
    deleteJiraJqlPreset.mockReturnValue(mutationResult);
  });

  it("shows connected account and a project catalog instead of a Component dump", async () => {
    const user = userEvent.setup();

    render(<JiraSettingsPanel />);

    expect(screen.getByText("Connected as Test User")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Jira projects" })).toBeInTheDocument();
    expect(screen.queryByText("Refresh Components")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Disconnect Jira" }));
    expect(disconnectJira).toHaveBeenCalled();
  });

  it("connects with a base URL and PAT", async () => {
    jiraState.connected = false;
    jiraState.projectKeys = ["EGS"];
    const user = userEvent.setup();

    render(<JiraSettingsPanel />);

    await user.type(screen.getByLabelText("Jira Data Center URL"), "https://jira.example.test");
    await user.type(screen.getByLabelText("Personal access token"), "pat-token");
    await user.click(screen.getByRole("button", { name: "Connect Jira" }));

    expect(connectJira).toHaveBeenCalledWith({
      baseUrl: "https://jira.example.test",
      token: "pat-token",
      projectKeys: ["EGS"],
    });
    expect(refreshJiraComponents).toHaveBeenCalled();
  });

  it("saves selected project keys and refreshes Components in the background", async () => {
    const user = userEvent.setup();

    render(<JiraSettingsPanel />);

    await user.click(screen.getByRole("button", { name: "Jira projects" }));
    await user.click(screen.getByText("KB · Knowledge Base"));
    await user.click(screen.getByRole("button", { name: "Save project keys" }));

    expect(updateJiraProjectKeys).toHaveBeenCalledWith({
      projectKeys: ["EGS", "KB"],
    });
    expect(refreshJiraComponents).toHaveBeenCalled();
  });

  it("creates and manages personal Jira JQL presets", async () => {
    const user = userEvent.setup();

    render(<JiraSettingsPanel />);

    expect(screen.getByText("JQL presets")).toBeInTheDocument();
    expect(screen.getByText("My bugs")).toBeInTheDocument();
    expect(screen.getByText("Default")).toBeInTheDocument();

    await user.type(screen.getByLabelText("JQL preset name"), "Review queue");
    await user.type(screen.getByLabelText("JQL preset"), "status = \"Code Review\"");
    await user.click(screen.getByRole("button", { name: "Create JQL preset" }));

    expect(createJiraJqlPreset).toHaveBeenCalledWith({
      name: "Review queue",
      jql: "status = \"Code Review\"",
      isDefault: false,
    });

    await user.click(screen.getByRole("button", { name: "Make My bugs default" }));
    expect(updateJiraJqlPreset).toHaveBeenCalledWith({
      id: "11111111-1111-4111-8111-111111111111",
      patch: { isDefault: true },
    });

    await user.click(screen.getByRole("button", { name: "Delete My bugs" }));
    expect(deleteJiraJqlPreset).toHaveBeenCalledWith({
      id: "11111111-1111-4111-8111-111111111111",
    });
  });
});
