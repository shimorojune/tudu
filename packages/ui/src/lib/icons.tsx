import type { LucideIcon, LucideProps } from 'lucide-react';
import {
  ArrowRight,
  Bell,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronRight as Caret,
  CircleAlert,
  CircleCheck,
  Clock,
  CornerDownRight,
  Ellipsis,
  House,
  Inbox,
  Laptop,
  List,
  Lock,
  LogOut,
  MessageSquare,
  Moon,
  PanelLeft,
  Plug,
  Plus,
  RefreshCw,
  Search,
  Send,
  SlidersVertical,
  Sun,
  TriangleAlert,
  User,
  Users,
  X,
} from 'lucide-react';

/**
 * The icons the components draw, by the names the design system uses. All Lucide: 2px stroke, round caps,
 * currentColor. 16px in buttons and nav, 12px in quiet signals, 18px in banners.
 */
export const ICONS = {
  today: Sun,
  week: Calendar,
  backlog: List,
  inbox: Inbox,
  send: Send,
  user: User,
  team: Users,
  more: Ellipsis,
  search: Search,
  plus: Plus,
  sun: Sun,
  bell: Bell,
  home: House,
  signout: LogOut,
  left: ChevronLeft,
  right: ChevronRight,
  x: X,
  plug: Plug,
  laptop: Laptop,
  settings: SlidersVertical,
  refresh: RefreshCw,
  panel: PanelLeft,
  // quiet signals and status
  caret: Caret,
  comment: MessageSquare,
  lock: Lock,
  subtasks: CornerDownRight,
  clock: Clock,
  warning: TriangleAlert,
  error: CircleAlert,
  success: CircleCheck,
  info: Moon,
  carried: ArrowRight,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export interface IconProps extends Omit<LucideProps, 'size' | 'ref' | 'stroke' | 'strokeWidth'> {
  name: IconName;
  /** Pixel size, 16 by default. */
  size?: number;
  /** Stroke width, 2 by default. */
  stroke?: number;
}

export function Icon({ name, size = 16, stroke = 2, ...rest }: IconProps) {
  const Cmp = ICONS[name];
  return (
    <Cmp
      size={size}
      strokeWidth={stroke}
      absoluteStrokeWidth={false}
      aria-hidden="true"
      focusable="false"
      {...rest}
    />
  );
}
