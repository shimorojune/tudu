import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeStore } from "@tudu/store";
import type { TeamResponse } from "@tudu/shared";
import type { ViewportBand } from "@/lib/viewport";
import { TeamRoute } from "./TeamRoute";

const band = vi.hoisted(() => ({ current: "desktop" as ViewportBand }));
const teamState = vi.hoisted(() => ({
  data: {
    reports: [],
    manager: null,
    outgoingInvites: [],
    incomingInvites: [],
  } as TeamResponse,
  isLoading: false,
  isError: false,
}));
const createInvite = vi.hoisted(() => vi.fn());
const navigate = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/useViewportBand", () => ({
  useViewportBand: () => band.current,
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  Link: ({
    to,
    children,
    ...props
  }: {
    to: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@tudu/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tudu/store")>();
  return {
    ...actual,
    todayIso: () => "2026-09-11",
    useGetTeamQuery: () => ({
      data: teamState.data,
      isLoading: teamState.isLoading,
      isError: teamState.isError,
    }),
    useCreateTeamInviteMutation: () => [
      createInvite,
      { isLoading: false },
    ],
    useAcceptTeamInviteMutation: () => [vi.fn()],
    useDeclineTeamInviteMutation: () => [vi.fn()],
  };
});

function emptyTeam(): TeamResponse {
  return {
    reports: [],
    manager: null,
    outgoingInvites: [],
    incomingInvites: [],
  };
}

function renderTeam() {
  return render(
    <Provider store={makeStore()}>
      <TeamRoute />
    </Provider>,
  );
}

describe("TeamRoute", () => {
  beforeEach(() => {
    band.current = "desktop";
    teamState.isLoading = false;
    teamState.isError = false;
    teamState.data = emptyTeam();
    createInvite.mockReset();
    navigate.mockReset();
  });

  it("shows a first-run instead of an empty spreadsheet", () => {
    renderTeam();

    expect(screen.getByText("Nobody on your team yet.")).toBeInTheDocument();
    expect(screen.getByLabelText("Work email")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send invite" })).toBeInTheDocument();
    expect(screen.queryByText("Reports to me")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Slipping = carried two days or more, or past deadline"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("You do not report to anyone yet.")).toBeInTheDocument();
  });

  it("lists a report with counts next to their name", () => {
    teamState.data = {
      reports: [
        {
          user: {
            id: "priya",
            name: "Priya Raman",
            email: "priya@egain.com",
          },
          nowCount: 2,
          openCount: 7,
          slippingCount: 2,
          nowTitle: "Incorrect article version",
        },
      ],
      manager: {
        id: "marcus",
        name: "Marcus Bell",
        email: "marcus@egain.com",
      },
      outgoingInvites: [],
      incomingInvites: [],
    };

    renderTeam();

    expect(screen.getByText("Priya Raman")).toBeInTheDocument();
    expect(screen.getByText("now: Incorrect article version")).toBeInTheDocument();
    expect(screen.getByText("Now")).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("Slipping")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open day" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open week" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open inbox" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add task" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add someone" })).toBeInTheDocument();
    expect(screen.getByText("Marcus Bell")).toBeInTheDocument();
    expect(
      screen.getByText("Slipping = carried two days or more, or past deadline"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Nobody on your team yet.")).not.toBeInTheDocument();
  });

  it("shows a pending invite without fake counts", () => {
    teamState.data = {
      ...emptyTeam(),
      outgoingInvites: [
        {
          id: "inv-1",
          email: "dana@egain.com",
          direction: "outgoing",
          inviter: {
            id: "me",
            name: "Test User",
            email: "testuser@egain.com",
          },
          createdAt: "2026-09-11T00:00:00.000Z",
        },
      ],
    };

    renderTeam();

    expect(screen.getByText("dana@egain.com")).toBeInTheDocument();
    expect(
      screen.getByText("Invite sent. Waiting for them to confirm."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Nobody on your team yet.")).not.toBeInTheDocument();
    expect(screen.queryByText("Now")).not.toBeInTheDocument();
  });

  it("shows incoming invites at the top of the people pane", () => {
    teamState.data = {
      ...emptyTeam(),
      incomingInvites: [
        {
          id: "inv-in",
          email: "testuser@egain.com",
          direction: "incoming",
          inviter: {
            id: "marcus",
            name: "Marcus Bell",
            email: "marcus@egain.com",
          },
          createdAt: "2026-09-11T00:00:00.000Z",
        },
      ],
    };

    renderTeam();

    expect(screen.getByText("Incoming invites")).toBeInTheDocument();
    expect(screen.getByText("Marcus Bell")).toBeInTheDocument();
    expect(screen.getByText("wants to be your manager")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Decline" })).toBeInTheDocument();
    expect(screen.getByText("Nobody on your team yet.")).toBeInTheDocument();
  });

  it("keeps I report to on the stacked page on phone", () => {
    band.current = "phone";
    renderTeam();

    expect(screen.getByText("Nobody on your team yet.")).toBeInTheDocument();
    expect(screen.getByText("You do not report to anyone yet.")).toBeInTheDocument();
    expect(screen.getByLabelText("I report to")).toBeInTheDocument();
  });

  it("sends an invite from the first-run form", async () => {
    createInvite.mockReturnValue({ unwrap: () => Promise.resolve({}) });
    const user = userEvent.setup();
    renderTeam();

    await user.type(screen.getByLabelText("Work email"), "dana@egain.com");
    await user.click(screen.getByRole("button", { name: "Send invite" }));

    expect(createInvite).toHaveBeenCalledWith({ email: "dana@egain.com" });
  });

  it("shows a skeleton while team data loads", () => {
    teamState.isLoading = true;
    renderTeam();

    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    expect(screen.queryByText("Nobody on your team yet.")).not.toBeInTheDocument();
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
  });
});
