import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  applyTheme,
  readStoredTheme,
  resolveTheme,
  writeStoredTheme,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/theme";
import {
  applyPaletteToDocument,
  readStoredCustomColors,
  readStoredFontId,
  readStoredPaletteId,
  writeStoredCustomColors,
  writeStoredFontId,
  writeStoredPaletteId,
  CUSTOM_COLORS_STORAGE_KEY,
  FONT_STORAGE_KEY,
  PALETTE_STORAGE_KEY,
} from "@/lib/themePalette";
import type { CustomThemeColors, FontId, PaletteId } from "@/lib/themePalettes";

type ThemeContextValue = {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (next: ThemePreference) => void;
  paletteId: PaletteId;
  setPaletteId: (next: PaletteId) => void;
  customColors: CustomThemeColors;
  setCustomColors: (next: CustomThemeColors) => void;
  fontId: FontId;
  setFontId: (next: FontId) => void;
};

export const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyAll(
  preference: ThemePreference,
  paletteId: PaletteId,
  customColors: CustomThemeColors,
  fontId: FontId,
) {
  const resolved = resolveTheme(preference);
  applyTheme(resolved);
  applyPaletteToDocument(paletteId, resolved, customColors, fontId);
  return resolved;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() =>
    readStoredTheme(),
  );
  const [paletteId, setPaletteIdState] = useState<PaletteId>(() =>
    readStoredPaletteId(),
  );
  const [customColors, setCustomColorsState] = useState<CustomThemeColors>(() =>
    readStoredCustomColors(),
  );
  const [fontId, setFontIdState] = useState<FontId>(() => readStoredFontId());
  const [resolved, setResolved] = useState<ResolvedTheme>(() =>
    applyAll(
      readStoredTheme(),
      readStoredPaletteId(),
      readStoredCustomColors(),
      readStoredFontId(),
    ),
  );

  useEffect(() => {
    const next = applyAll(preference, paletteId, customColors, fontId);
    setResolved(next);
  }, [preference, paletteId, customColors, fontId]);

  useEffect(() => {
    if (preference !== "system") {
      return;
    }

    const query = window.matchMedia("(prefers-color-scheme: dark)");

    const onChange = () => {
      const next = applyAll(preference, paletteId, customColors, fontId);
      setResolved(next);
    };

    query.addEventListener("change", onChange);

    return () => query.removeEventListener("change", onChange);
  }, [preference, paletteId, customColors, fontId]);

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key === "tudu.theme" && event.newValue != null) {
        const stored = event.newValue;
        if (stored === "light" || stored === "dark" || stored === "system") {
          setPreferenceState(stored);
        }
      }
      if (event.key === PALETTE_STORAGE_KEY && event.newValue != null) {
        const stored = event.newValue;
        if (
          stored === "modernist" ||
          stored === "github" ||
          stored === "current" ||
          stored === "neutral" ||
          stored === "custom"
        ) {
          setPaletteIdState(stored);
        }
      }
      if (event.key === CUSTOM_COLORS_STORAGE_KEY && event.newValue != null) {
        try {
          setCustomColorsState(JSON.parse(event.newValue) as CustomThemeColors);
        } catch {
          setCustomColorsState({});
        }
      }
      if (event.key === FONT_STORAGE_KEY && event.newValue != null) {
        const stored = event.newValue;
        if (stored === "archivo" || stored === "ar-one-sans" || stored === "system") {
          setFontIdState(stored);
        }
      }
    }

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    writeStoredTheme(next);
    setPreferenceState(next);
  }, []);

  const setPaletteId = useCallback((next: PaletteId) => {
    writeStoredPaletteId(next);
    setPaletteIdState(next);
  }, []);

  const setCustomColors = useCallback((next: CustomThemeColors) => {
    writeStoredCustomColors(next);
    setCustomColorsState(next);
  }, []);

  const setFontId = useCallback((next: FontId) => {
    writeStoredFontId(next);
    setFontIdState(next);
  }, []);

  const value = useMemo(
    () => ({
      preference,
      resolved,
      setPreference,
      paletteId,
      setPaletteId,
      customColors,
      setCustomColors,
      fontId,
      setFontId,
    }),
    [
      preference,
      resolved,
      setPreference,
      paletteId,
      setPaletteId,
      customColors,
      setCustomColors,
      fontId,
      setFontId,
    ],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
