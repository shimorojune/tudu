import { SpacePickerWidget } from "@tudu/ui/mcp-widgets/SpacePickerWidget";
import { useToolInfo } from "skybridge/web";

type SpacePickerOutput = {
  spaces?: Array<{
    id?: string;
    name: string;
    slug?: string;
  }>;
};

export default function SpacePickerView() {
  const { isSuccess, output } = useToolInfo<{ output: SpacePickerOutput }>();
  return <SpacePickerWidget spaces={isSuccess ? output?.spaces : undefined} />;
}
