import { Settings2 } from "lucide-react";
import { TuduLogo } from "@/components/TuduLogo";
import { relativeDayLabel } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface HeaderProps {
  date: string;
  personalOpen: number;
  jiraOpen: number;
  onDateChange: (date: string) => void;
  onOpenSettings: () => void;
}

export function Header({
  date,
  personalOpen,
  jiraOpen,
  onDateChange,
  onOpenSettings,
}: HeaderProps) {
  return (
    <header className="flex items-center justify-between gap-4 border-b bg-card/40 px-5 py-4">
      <div className="flex items-center gap-3">
        <TuduLogo size="sm" showText />
        <p className="text-sm text-muted-foreground">{relativeDayLabel(date)}</p>
      </div>

      <div className="flex items-center gap-2">
        <Input
          type="date"
          value={date}
          onChange={(e) => onDateChange(e.target.value)}
          className="w-auto bg-background"
        />
        <Badge variant="secondary">{personalOpen} personal open</Badge>
        <Badge variant="secondary">{jiraOpen} jira open</Badge>
        <Button variant="outline" size="icon" onClick={onOpenSettings} aria-label="Settings">
          <Settings2 className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
