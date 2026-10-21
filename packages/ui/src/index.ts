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

// Sign in (chunk 01)
export { CodeField, type CodeFieldProps } from './components/CodeField';
export {
  AuthLayer,
  AuthArt,
  AUTH_LEAVE_MS,
  type AuthLayerProps,
  type AuthArtProps,
} from './components/AuthLayer';
export {
  SignIn,
  SignInError,
  countdown,
  EMAIL_PATTERN,
  DONE_DELAY_MS,
  DEFAULT_RESEND_SECONDS,
  type SignInProps,
  type SignInInitial,
  type SignInStep,
  type SignInErrorKind,
} from './components/SignIn';

// The shell (chunk 01)
export { JiraMark, type JiraMarkProps } from './components/JiraMark';
export { PersonDot, type PersonDotProps, type PersonDotPerson } from './components/PersonDot';
export { SpaceTile, type SpaceTileProps, type SpaceTileSpace } from './components/SpaceTile';
export {
  Sidebar,
  Count,
  type SidebarProps,
  type SidebarItem,
  type SidebarDay,
  type SidebarSpace,
  type SidebarApp,
  type CountProps,
} from './components/Sidebar';
export {
  TopBar,
  type TopBarProps,
  type TopBarUser,
  type TopBarViews,
  type TopBarJira,
} from './components/TopBar';
export { BottomTabs, type BottomTabsProps, type BottomTab } from './components/BottomTabs';
export { Fab, type FabProps } from './components/Fab';
export { AccountMenu, type AccountMenuProps, type AccountMenuPerson } from './components/AccountMenu';
export { DayProgress, REWARD_MS, type DayProgressProps } from './components/DayProgress';
export { DayHeader, type DayHeaderProps } from './components/DayHeader';

// Today (chunk 02)
export {
  TaskRow,
  COPY_FLASH_MS,
  type TaskRowProps,
  type TaskDue,
  type TaskCarried,
  type TaskProject,
  type TaskSignal,
} from './components/TaskRow';
export { TaskList, FRESH_MS, type TaskListProps, type TaskItem, type TaskMove } from './components/TaskList';
export { AddTask, type AddTaskProps } from './components/AddTask';
export { DatePop, DATEPOP_LEAVE_MS, type DatePopProps } from './components/DatePop';
export { Spread, SpreadPage, SPREAD_MS, type SpreadProps, type SpreadPageProps } from './components/Spread';
export { useReorder, useDropGroup, moveItem, itemByKey, DRAG_START_PX, TOUCH_HOLD_MS } from './lib/reorder';
export { openRow, closeRow, dropFlash, settleFrom, easeArrive, bezier } from './lib/motion';

// Task detail (chunk 03)
export {
  TaskDetail,
  TaskDetailSkeleton,
  COMMENT_FRESH_MS,
  type TaskDetailProps,
  type TaskDetailTask,
  type DetailComment,
  type DetailEvent,
  type VisibilityOption,
} from './components/TaskDetail';
export { SubtaskList, SUB_LEAVE_MS, type SubtaskListProps, type SubtaskItem } from './components/SubtaskList';
export {
  RichTextEditor,
  RichTextContent,
  toHtml,
  editorExtensions,
  type RichTextEditorProps,
  type RichTextContentProps,
} from './components/RichTextEditor';

// Quick Add (chunk 04)
export { Linger, POP_LEAVE_MS } from './lib/linger';
export { ProjectMenu, type ProjectMenuProps, type ProjectOption } from './components/ProjectMenu';
export {
  QuickAdd,
  QA_CLOSE_AFTER_MS,
  QA_LEAVE_MS,
  QA_LEAVE_PHONE_MS,
  type QuickAddProps,
  type QuickAddDraft,
  type QuickAddFile,
  type QuickAddResult,
} from './components/QuickAdd';

// Week (chunk 05)
export { WeekDay, WeekTiles, type WeekDayProps, type WeekTilesProps } from './components/WeekDay';
export { WeekPicker, weekRowsOf, weekRowLabel, type WeekPickerProps } from './components/WeekPicker';
