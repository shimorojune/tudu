import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useDispatch } from "react-redux";
import { useGetMeQuery, type AppDispatch } from "@tudu/store";
import { personInitials } from "@/lib/person";
import { signOut } from "@/lib/signOut";

function displayName(name: string | null | undefined, email: string) {
  const trimmed = name?.trim();
  if (trimmed) {
    return trimmed;
  }
  const local = email.split("@")[0]?.trim();
  return local || email;
}

export function AccountSettingsPanel() {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const { data: me, isLoading } = useGetMeQuery();
  const [submitting, setSubmitting] = useState(false);

  if (isLoading || !me) {
    return (
      <div className="px-[30px] py-[26px] text-[14px] text-muted-foreground">
        Loading…
      </div>
    );
  }

  const name = displayName(me.name, me.email);
  const initials = personInitials(name);

  async function handleSignOut() {
    if (submitting) {
      return;
    }
    setSubmitting(true);
    try {
      await signOut(dispatch);
      void navigate({ to: "/sign-in" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto px-[30px] py-[26px]">
      <div className="flex flex-col gap-[22px]">
        <div className="flex flex-col gap-[14px]">
          <div className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-faint">
            You
          </div>
          <div className="flex items-center gap-[14px]">
            <div
              aria-hidden
              className="flex h-[44px] w-[44px] items-center justify-center bg-foreground text-[16px] font-extrabold tracking-[-0.02em] text-card"
            >
              {initials}
            </div>
            <div className="min-w-0 flex flex-col gap-[3px]">
              <span className="text-[15px] font-semibold">{name}</span>
              <span className="text-[12.5px] text-muted-foreground">{me.email}</span>
            </div>
          </div>
          <dl className="grid grid-cols-[150px_minmax(0,1fr)] items-center gap-x-[16px] gap-y-[14px] text-[14px]">
            <dt className="text-muted-foreground">Display name</dt>
            <dd>{name}</dd>
            <dt className="text-muted-foreground">Work email</dt>
            <dd className="text-muted-foreground">{me.email}</dd>
          </dl>
        </div>

        <div className="border-t border-hair pt-[20px]">
          <div className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-faint">
            Sign-in
          </div>
          <p className="mt-[12px] text-[12px] text-faint">
            Signed in on this device.
          </p>
        </div>
      </div>

      <div className="mt-auto flex items-center gap-[16px] border-t border-hair pt-[18px]">
        <button
          type="button"
          disabled={submitting}
          className="border border-rule px-[14px] py-[8px] text-[12.5px] text-foreground disabled:opacity-50"
          onClick={() => {
            void handleSignOut();
          }}
        >
          {submitting ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </div>
  );
}
