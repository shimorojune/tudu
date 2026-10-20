// Tudu UI: the Tudu Paper design system in React. Components keep the design system's own markup and
// stylesheet (tp-* classes) and use Radix underneath for focus, keyboard and screen readers.
export { cx } from './lib/cx';
export { Icon, ICONS, type IconName, type IconProps } from './lib/icons';
export { InkTick, PlainTick, TickSvg, INK_SHAPE, INK_PATH, TICK_PATH } from './lib/ink';
export { Sparkle, useSpark } from './lib/spark';
export {
  useControllable,
  useOutside,
  useReducedMotion,
  prefersReducedMotion,
  useWidthEase,
  useFieldId,
  useTimer,
} from './lib/hooks';
export {
  useTheme,
  setThemeChoice,
  readThemeChoice,
  resolveTheme,
  systemTheme,
  paintTheme,
  fadeTheme,
  isThemeChoice,
  resetThemeForTests,
  THEME_STORAGE_KEY,
  CROSS_FADE_MS,
  type Theme,
  type ThemeChoice,
} from './lib/theme';

export { Button, type ButtonProps, type ButtonVariant } from './components/Button';
export { IconButton, type IconButtonProps } from './components/IconButton';
export { Checkbox, type CheckboxProps } from './components/Checkbox';
export { Tag, type TagProps, type TagTone } from './components/Tag';
export { Chip, type ChipProps } from './components/Chip';
export { Segmented, type SegmentedProps, type SegmentedItem } from './components/Segmented';
export { Field, type FieldProps } from './components/Field';
export { Switch, type SwitchProps } from './components/Switch';
export {
  Sheet,
  SheetBody,
  DayTitle,
  type SheetProps,
  type SheetBodyProps,
  type DayTitleProps,
} from './components/Sheet';
export { Desk, type DeskProps } from './components/Desk';
export { Tooltip, TOOLTIP_DELAY_MS, type TooltipProps, type TooltipSide } from './components/Tooltip';
export { Menu, MenuList, type MenuProps, type MenuItem } from './components/Menu';
export {
  Toast,
  ToastHost,
  showToast,
  dismissToast,
  TOAST_WITH_ACTION_MS,
  TOAST_PLAIN_MS,
  type ToastProps,
  type ToastOptions,
} from './components/Toast';
export { Banner, type BannerProps, type BannerTone, type BannerAction } from './components/Banner';
export { Skeleton, TaskListSkeleton, type SkeletonProps } from './components/Skeleton';
export { Logo, type LogoProps } from './components/Logo';
export { Avatar, type AvatarProps } from './components/Avatar';
export { EmptyState, type EmptyStateProps } from './components/EmptyState';
export { Dialog, escapeStepsBack, type DialogProps } from './components/Dialog';
export { ConfirmDialog, type ConfirmDialogProps } from './components/ConfirmDialog';
export { Drawer, type DrawerProps } from './components/Drawer';
export {
  MiniCalendar,
  type MiniCalendarProps,
  type CalendarPreset,
  type CalendarHint,
} from './components/MiniCalendar';
