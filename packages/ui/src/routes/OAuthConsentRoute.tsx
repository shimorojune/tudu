import { Navigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { BrandMark } from "@/components/chrome/BrandMark";
import { Button } from "@/components/ui/button";
import { authClient, oauth2Consent } from "@/lib/authClient";

function formatScopeLabel(scope: string): string {
  switch (scope) {
    case "tasks:read":
      return "Read your tasks and spaces";
    case "tasks:write":
      return "Create, update, and delete tasks";
    case "openid":
      return "Sign in identity";
    case "profile":
      return "Your name";
    case "email":
      return "Your email address";
    case "offline_access":
      return "Stay connected when you are away";
    default:
      return scope;
  }
}

export function OAuthConsentRoute() {
  const { data: session, isPending } = authClient.useSession();
  const [busy, setBusy] = useState<"allow" | "deny" | null>(null);

  const oauthQuery = useMemo(() => {
    if (typeof window === "undefined") {
      return "";
    }
    return window.location.search.startsWith("?")
      ? window.location.search.slice(1)
      : window.location.search;
  }, []);

  const scopeList = useMemo(() => {
    const params = new URLSearchParams(oauthQuery);
    const scope = params.get("scope") ?? "";
    return scope
      .split(/\s+/)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0 && entry !== "openid");
  }, [oauthQuery]);

  const clientLabel =
    new URLSearchParams(oauthQuery).get("client_id") ?? "An application";

  if (isPending) {
    return null;
  }

  if (!session) {
    return <Navigate to="/sign-in" />;
  }

  if (!oauthQuery) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <p className="text-sm text-muted-foreground">
          Missing authorization request.
        </p>
      </div>
    );
  }

  async function respond(accept: boolean) {
    setBusy(accept ? "allow" : "deny");
    const { data, error } = await oauth2Consent({
      accept,
      oauth_query: oauthQuery,
    });
    setBusy(null);

    if (error) {
      toast.error(error.message ?? "Authorization failed");
      return;
    }

    const redirectUrl =
      data && typeof data === "object" && "url" in data
        ? String(data.url)
        : data && typeof data === "object" && "redirect_uri" in data
          ? String(data.redirect_uri)
          : null;

    if (redirectUrl) {
      window.location.assign(redirectUrl);
      return;
    }

    toast.success(accept ? "Access granted" : "Access denied");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="flex w-full max-w-md flex-col gap-6 border border-rule bg-card p-8">
        <BrandMark />
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-extrabold tracking-[-0.03em]">
            Allow access
          </h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{clientLabel}</span>
            wants to connect to your Tudu account.
          </p>
        </div>
        {scopeList.length > 0 ? (
          <ul className="flex flex-col gap-2 text-sm">
            {scopeList.map((scope) => (
              <li key={scope} className="border border-rule px-3 py-2">
                {formatScopeLabel(scope)}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            disabled={busy !== null}
            aria-busy={busy === "deny"}
            onClick={() => void respond(false)}
          >
            {busy === "deny" ? "Denying..." : "Deny"}
          </Button>
          <Button
            type="button"
            className="flex-1"
            disabled={busy !== null}
            aria-busy={busy === "allow"}
            onClick={() => void respond(true)}
          >
            {busy === "allow" ? "Allowing..." : "Allow"}
          </Button>
        </div>
      </div>
    </div>
  );
}
