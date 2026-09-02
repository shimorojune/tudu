import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { PublicConfig, SaveConfigInput } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: PublicConfig | null;
  onSaved: () => void;
}

export function SettingsDialog({ open, onOpenChange, config, onSaved }: SettingsDialogProps) {
  const [form, setForm] = useState<SaveConfigInput>({});
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<{ type: "ok" | "error"; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!config) return;
    setForm({
      jiraBaseUrl: config.jiraBaseUrl,
      jiraUsername: config.jiraUsername,
      jiraType: config.jiraType,
      tlsRejectUnauthorized: config.tlsRejectUnauthorized,
      checkinIntervalMinutes: config.checkinIntervalMinutes,
      jiraPollIntervalMinutes: config.jiraPollIntervalMinutes,
    });
    setToken("");
    setStatus(null);
  }, [config, open]);

  const isCloud = form.jiraType === "cloud";

  async function handleTest() {
    setTesting(true);
    setStatus(null);
    try {
      if (form.jiraBaseUrl || form.jiraUsername || token) {
        await api.saveConfig({
          ...form,
          jiraApiToken: token || undefined,
        });
      }
      const result = await api.testJiraConnection();
      setStatus({
        type: "ok",
        message: `Connected as ${result.displayName}`,
      });
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setStatus(null);
    try {
      await api.saveConfig({
        ...form,
        jiraApiToken: token || undefined,
      });
      onSaved();
      onOpenChange(false);
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Connect JIRA and set how often the app checks for updates.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="jiraBaseUrl">JIRA URL</Label>
            <Input
              id="jiraBaseUrl"
              value={form.jiraBaseUrl ?? ""}
              onChange={(e) => setForm((prev) => ({ ...prev, jiraBaseUrl: e.target.value }))}
              placeholder="https://your-org.atlassian.net"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="jiraType">JIRA type</Label>
            <select
              id="jiraType"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={form.jiraType ?? "server"}
              onChange={(e) => setForm((prev) => ({ ...prev, jiraType: e.target.value }))}
            >
              <option value="cloud">Jira Cloud</option>
              <option value="server">Jira Server / Data Center</option>
            </select>
          </div>

            <div className="grid gap-2">
            <Label htmlFor="jiraUsername">{isCloud ? "Email" : "Username"}</Label>
            <Input
              id="jiraUsername"
              value={form.jiraUsername ?? ""}
              onChange={(e) => setForm((prev) => ({ ...prev, jiraUsername: e.target.value }))}
              placeholder={isCloud ? "you@company.com" : "your.username"}
            />
            {!isCloud && (
              <p className="text-xs text-muted-foreground">
                For PAT auth, username is only needed as a fallback. Your token is sent as Bearer.
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="jiraApiToken">
              {isCloud ? "API token" : "Password or PAT"}
            </Label>
            <Input
              id="jiraApiToken"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={
                config?.hasToken && !token
                  ? "Leave blank to keep saved token"
                  : isCloud
                    ? "Atlassian API token"
                    : "Jira password or personal access token"
              }
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.tlsRejectUnauthorized === false}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  tlsRejectUnauthorized: !e.target.checked,
                }))
              }
            />
            Allow self-signed SSL certificates
          </label>

          <Separator />

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="jiraPollIntervalMinutes">JIRA poll (minutes)</Label>
              <Input
                id="jiraPollIntervalMinutes"
                type="number"
                min={5}
                max={120}
                value={form.jiraPollIntervalMinutes ?? 15}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    jiraPollIntervalMinutes: Number(e.target.value),
                  }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="checkinIntervalMinutes">Reminder (minutes)</Label>
              <Input
                id="checkinIntervalMinutes"
                type="number"
                min={1}
                max={240}
                value={form.checkinIntervalMinutes ?? 15}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    checkinIntervalMinutes: Number(e.target.value),
                  }))
                }
              />
            </div>
          </div>

          {status && (
            <p className={`text-sm ${status.type === "ok" ? "text-primary" : "text-destructive"}`}>
              {status.message}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => void handleTest()} disabled={testing}>
              {testing ? "Testing..." : "Test connection"}
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
