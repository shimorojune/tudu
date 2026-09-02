import { AlertCircle, ExternalLink, Inbox, RefreshCw } from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";
import type { JiraIssue } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

interface JiraPanelProps {
  issues: JiraIssue[];
  loading: boolean;
  error: string | null;
  softMessage: string | null;
  configured: boolean;
  onRefresh: () => void;
}

function Placeholder({
  icon: Icon,
  message,
  tone = "muted",
}: {
  icon: typeof Inbox;
  message: string;
  tone?: "muted" | "soft";
}) {
  return (
    <div
      className={`flex h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 text-center text-sm ${
        tone === "soft" ? "text-muted-foreground" : "text-muted-foreground"
      }`}
    >
      <Icon className="size-8 opacity-40" />
      <p>{message}</p>
    </div>
  );
}

export function JiraPanel({
  issues,
  loading,
  error,
  softMessage,
  configured,
  onRefresh,
}: JiraPanelProps) {
  return (
    <Card className="flex min-h-0 flex-col shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
        <CardTitle className="text-base font-semibold">JIRA / Assigned to Me</CardTitle>
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading || !configured}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 p-4">
        <ScrollArea className="h-full min-h-[480px] pr-2">
          {!configured ? (
            <Placeholder
              icon={Inbox}
              message="Connect JIRA in Settings to see your assigned issues."
            />
          ) : loading ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-14 w-full rounded-lg" />
              <Skeleton className="h-14 w-full rounded-lg" />
              <Skeleton className="h-14 w-full rounded-lg" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-6 text-center text-sm text-destructive">
              <AlertCircle className="size-8" />
              <p>{error}</p>
            </div>
          ) : softMessage ? (
            <Placeholder icon={AlertCircle} message={softMessage} tone="soft" />
          ) : issues.length === 0 ? (
            <Placeholder
              icon={Inbox}
              message="No open issues assigned to you."
            />
          ) : (
            <ul className="divide-y divide-border rounded-lg border">
              {issues.map((issue) => (
                <li key={issue.key} className="flex items-start gap-3 px-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{issue.key}</Badge>
                      <Badge variant="secondary">{issue.status}</Badge>
                    </div>
                    <p className="text-sm font-medium leading-snug">{issue.summary}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {issue.type} · {issue.priority}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0"
                    onClick={() => void open(issue.url)}
                    aria-label={`Open ${issue.key}`}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
