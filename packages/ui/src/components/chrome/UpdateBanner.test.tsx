import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UpdateProvider } from "@/providers/UpdateContext";
import { UpdateBanner } from "./UpdateBanner.js";

function renderBanner(value: Parameters<typeof UpdateProvider>[0]["value"]) {
  return render(
    <UpdateProvider value={value}>
      <UpdateBanner />
    </UpdateProvider>,
  );
}

describe("UpdateBanner", () => {
  it("renders nothing when hidden", () => {
    const { container } = renderBanner({
      phase: "hidden",
      dismiss: vi.fn(),
      install: vi.fn(),
      restart: vi.fn(),
    });

    expect(container.firstChild).toBeNull();
  });

  it("shows available update actions", async () => {
    const user = userEvent.setup();
    const install = vi.fn();
    const dismiss = vi.fn();
    const openRelease = vi.fn();

    renderBanner({
      phase: "available",
      version: "0.11.0",
      releaseUrl: "https://github.com/eGainDev/tudu/releases/tag/v0.11.0",
      notes: "Bug fixes",
      dismiss,
      install,
      restart: vi.fn(),
      openRelease,
    });

    expect(screen.getByRole("status")).toHaveTextContent("Version 0.11.0 is ready.");
    expect(screen.getByText("Bug fixes")).toBeInTheDocument();

    const releaseLink = screen.getByRole("link", { name: "0.11.0" });
    expect(releaseLink).toHaveAttribute(
      "href",
      "https://github.com/eGainDev/tudu/releases/tag/v0.11.0",
    );

    await user.click(releaseLink);
    expect(openRelease).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "Update" }));
    expect(install).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "Later" }));
    expect(dismiss).toHaveBeenCalledOnce();
  });

  it("shows download progress", () => {
    renderBanner({
      phase: "downloading",
      version: "0.11.0",
      progress: 42,
      dismiss: vi.fn(),
      install: vi.fn(),
      restart: vi.fn(),
    });

    expect(screen.getByRole("status")).toHaveTextContent("Installing update… 42%");
    expect(screen.queryByRole("button", { name: "Update" })).not.toBeInTheDocument();
  });

  it("shows restart actions after install", async () => {
    const user = userEvent.setup();
    const restart = vi.fn();
    const dismiss = vi.fn();

    renderBanner({
      phase: "ready",
      version: "0.11.0",
      dismiss,
      install: vi.fn(),
      restart,
    });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Restart Tudu to use the update.",
    );

    await user.click(screen.getByRole("button", { name: "Restart" }));
    expect(restart).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "Later" }));
    expect(dismiss).toHaveBeenCalledOnce();
  });
});
