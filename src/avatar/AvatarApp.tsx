import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { AvatarPayload } from "@/lib/types";
import { MochiAvatar } from "@/components/MochiAvatar";
import "../index.css";

export default function AvatarApp() {
  const [payload, setPayload] = useState<AvatarPayload | null>(null);

  useEffect(() => {
    document.documentElement.classList.add("dark");
    document.body.classList.add("avatar-body");

    const unsubs: Array<Promise<() => void>> = [
      listen<AvatarPayload>("avatar-show", (event) => {
        setPayload(event.payload);
      }),
    ];

    return () => {
      void Promise.all(unsubs).then((fns) => fns.forEach((fn) => fn()));
    };
  }, []);

  useEffect(() => {
    void getCurrentWindow().setDecorations(false);
  }, []);

  return (
    <div className="flex min-h-screen items-end justify-end bg-transparent">
      <MochiAvatar payload={payload} alerting={Boolean(payload)} />
    </div>
  );
}
