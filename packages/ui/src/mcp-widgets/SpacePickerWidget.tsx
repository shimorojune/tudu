type SpacePickerWidgetProps = {
  spaces?: Array<{
    id?: string;
    name?: string;
    kind?: string;
    slug?: string;
  }>;
};

export function SpacePickerWidget({ spaces = [] }: SpacePickerWidgetProps) {
  if (spaces.length === 0) {
    return <p className="text-sm text-muted-foreground">No spaces found.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {spaces.map((space) => (
        <li
          key={space.id ?? space.slug ?? space.name}
          className="border border-rule px-3 py-2 text-sm"
        >
          <div className="font-semibold">{space.name ?? "Space"}</div>
          <div className="text-xs text-muted-foreground">
            {space.kind === "personal" ? "Personal" : space.slug}
          </div>
        </li>
      ))}
    </ul>
  );
}
