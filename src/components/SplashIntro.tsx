import { useCallback, useEffect, useRef, useState } from "react";
import {
  runSplash,
  skipSplash,
  SPLASH_DURATION_MS,
  SPLASH_FADE_MS,
} from "@/lib/splashAnimation";

interface SplashIntroProps {
  onComplete: () => void;
}

export function SplashIntro({ onComplete }: SplashIntroProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const [wordmarkVisible, setWordmarkVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const completedRef = useRef(false);

  const finish = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete();
  }, [onComplete]);

  const handleSkip = useCallback(() => {
    if (completedRef.current || exiting) return;
    setExiting(true);
    setWordmarkVisible(true);
    if (cleanupRef.current) {
      skipSplash(cleanupRef.current, finish);
      cleanupRef.current = null;
    } else {
      window.setTimeout(finish, 250);
    }
  }, [exiting, finish]);

  useEffect(() => {
    document.documentElement.classList.add("dark");

    const canvas = canvasRef.current;
    if (!canvas) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    cleanupRef.current = runSplash(
      canvas,
      {
        onWordmark: () => setWordmarkVisible(true),
        onComplete: () => {
          setExiting(true);
          window.setTimeout(finish, SPLASH_FADE_MS);
        },
      },
      { reducedMotion },
    );

    const totalMs = reducedMotion ? 500 + SPLASH_FADE_MS : SPLASH_DURATION_MS + SPLASH_FADE_MS;
    const safetyTimer = window.setTimeout(() => {
      setExiting(true);
      finish();
    }, totalMs + 200);

    return () => {
      window.clearTimeout(safetyTimer);
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [finish]);

  return (
    <div
      className={`splash-screen${exiting ? " splash-screen--exit" : ""}`}
      onClick={handleSkip}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleSkip();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label="Skip intro"
    >
      <canvas ref={canvasRef} className="splash-canvas" aria-hidden="true" />
      <div
        className={`splash-wordmark${wordmarkVisible ? " splash-wordmark--in" : ""}`}
        aria-hidden={!wordmarkVisible}
      >
        Tudu
      </div>
    </div>
  );
}
