export const MAIN_NAV_ITEMS = [
  { label: "Today", to: "/", exact: true, dayTab: true },
  { label: "Week", to: "/week", exact: false },
  { label: "Inbox", to: "/inbox", exact: false, badge: true },
  { label: "Unscheduled", to: "/unscheduled", exact: false, count: true },
  { label: "Team", to: "/team", exact: false },
] as const;
