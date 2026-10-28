import type { LucideIcon, LucideProps } from 'lucide-react';
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  Bug,
  Check,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronRight as Caret,
  Circle,
  CircleAlert,
  CircleCheck,
  CircleDot,
  Clock,
  Copy,
  CornerDownRight,
  Ellipsis,
  Globe,
  House,
  Key,
  Inbox,
  Laptop,
  Layers,
  Lightbulb,
  Link2,
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
  Trash2,
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
  /** Opens outside Tudu (a release on GitHub). */
  external: ArrowUpRight,
  /** Delete an Inbox item. */
  trash: Trash2,
  /** Mark as unread: a ring with the dot in it. */
  unread: CircleDot,
  /** Mark as read: the empty ring. */
  read: Circle,
  /** Copy a task's link (the ID chip). */
  link: Link2,
  /** Copied. */
  check: Check,
  /** All spaces: the sheets of every space stacked. */
  layers: Layers,
  /** Report a bug or idea, in the top bar. */
  bug: Bug,
  /** Public on GitHub, in the feedback form. */
  globe: Globe,
  /** An idea, in Your reports. */
  idea: Lightbulb,
  /** An API key, in Settings › AI access. */
  key: Key,
  /** Copy a value (a key, a command). */
  copy: Copy,
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
