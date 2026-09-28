export type MainNavItem = {
  label: string;
  to: string;
  exact: boolean;
  dayTab?: boolean;
  count?: boolean;
  badge?: boolean;
};

export function mainNavItems(orgSlug: string | null): MainNavItem[] {
  if (!orgSlug) {
    return [
      { label: "Today", to: "/", exact: true, dayTab: true },
      { label: "Week", to: "/week", exact: false },
      { label: "Requests", to: "/requests", exact: false, badge: true },
      { label: "Unscheduled", to: "/unscheduled", exact: false, count: true },
    ];
  }

  const base = `/o/${orgSlug}`;
  return [
    { label: "Today", to: base, exact: true, dayTab: true },
    { label: "Week", to: `${base}/week`, exact: false },
    { label: "Requests", to: `${base}/requests`, exact: false, badge: true },
    {
      label: "Unscheduled",
      to: `${base}/unscheduled`,
      exact: false,
      count: true,
    },
    { label: "Co-workers", to: `${base}/coworkers`, exact: false },
  ];
}
