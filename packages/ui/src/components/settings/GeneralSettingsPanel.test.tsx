import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "@/providers/ThemeProvider";
import { GeneralSettingsPanel } from "./GeneralSettingsPanel";

vi.mock("@/lib/commands", () => ({
  isDesktopApp: () => false,
}));

vi.mock("@tudu/store", () => ({
  useGetSpacePrefixSettingsQuery: () => ({
    data: { personalKeyPrefix: "ME", prefixLocked: false },
  }),
  useUpdateSpacePrefixSettingsMutation: () => [vi.fn()],
}));

describe("GeneralSettingsPanel", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("switches to dark theme from appearance controls", async () => {
    const user = userEvent.setup();

    render(
      <ThemeProvider>
        <GeneralSettingsPanel />
      </ThemeProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Dark" }));

    expect(localStorage.getItem("tudu.theme")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("shows isolated light preview swatch and saves palette choice", async () => {
    const user = userEvent.setup();

    document.documentElement.classList.add("dark");

    render(
      <ThemeProvider>
        <GeneralSettingsPanel />
      </ThemeProvider>,
    );

    const lightPreview = document.querySelector(
      '[data-appearance-preview="light"]',
    );
    expect(lightPreview).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Modernist" }));

    expect(localStorage.getItem("tudu.theme.palette")).toBe("modernist");
  });
});
