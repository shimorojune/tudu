// Tudu UI: the Tudu Paper design system in React. Components keep the design system's own markup and
// stylesheet (tp-* classes) and use Radix underneath for focus, keyboard and screen readers.
export { cx } from './lib/cx';
export { Icon, ICONS, type IconName, type IconProps } from './lib/icons';
export { InkTick, PlainTick, TickSvg, INK_SHAPE, INK_PATH, TICK_PATH } from './lib/ink';
export { Sparkle, useSpark } from './lib/spark';
export { copyText } from './lib/clipboard';
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
  syncThemeChoice,
  readThemeChoice,
  resolveTheme,
  systemTheme,
  paintTheme,
  fadeTheme,
  isThemeChoice,
  resetThemeForTests,
  onThemeChoice,
  THEME_STORAGE_KEY,
  CROSS_FADE_MS,
  MOTION_STORAGE_KEY,
  readLessMotion,
  setLessMotion,
  paintMotion,
  useLessMotion,
  type Theme,
  type ThemeChoice,
} from './lib/theme';

export { Button, type ButtonProps, type ButtonVariant } from './components/Button';
export { IconButton, type IconButtonProps } from './components/IconButton';
export { Checkbox, type CheckboxProps } from './components/Checkbox';
export { Tag, type TagProps, type TagTone } from './components/Tag';
export { Chip, type ChipProps } from './components/Chip';
export { ProjectFilter, type ProjectFilterProps, type FilterProject } from './components/ProjectFilter';
export { SpaceFilter, type SpaceFilterProps, type FilterSpace } from './components/SpaceFilter';
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
  type TopBarInbox,
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
  QA_SIMILAR_AFTER_MS,
  QA_SIMILAR_MIN,
  type QuickAddProps,
  type SimilarItem,
  type QuickAddDraft,
  type QuickAddFile,
  type QuickAddResult,
} from './components/QuickAdd';

// Week (chunk 05)
export { WeekDay, WeekTiles, type WeekDayProps, type WeekTilesProps } from './components/WeekDay';
export { WeekPicker, weekRowsOf, weekRowLabel, type WeekPickerProps } from './components/WeekPicker';

// Search (chunk 07)
export { SearchHit, markWords, type SearchHitProps, type SearchItem } from './components/SearchHit';
export {
  SearchPanel,
  SP_LEAVE_MS,
  SP_LEAVE_PHONE_MS,
  type SearchPanelProps,
  type SearchResults,
} from './components/SearchPanel';

// Spaces and People (chunk 08)
export {
  SpaceSwitch,
  SSW_SHEET_LEAVE_MS,
  type SpaceSwitchProps,
  type SwitchSpace,
} from './components/SpaceSwitch';
export { ColorPick, type ColorPickProps } from './components/ColorPick';
export { InviteField, type InviteFieldProps } from './components/InviteField';
export { FilterField, type FilterFieldProps } from './components/FilterField';
export {
  CreateSpace,
  CS_DONE_MS,
  type CreateSpaceProps,
  type CreateSpaceInput,
} from './components/CreateSpace';
export { MemberRow, ROLE_WORDS, type MemberRowProps, type MemberRowPerson } from './components/MemberRow';
export {
  MembersBody,
  FIND_PAST,
  type MembersBodyProps,
  type MembersBodyMember,
  type MembersBodyInvite,
} from './components/MembersBody';
export {
  SettingsSection,
  SettingRow,
  type SettingsSectionProps,
  type SettingRowProps,
} from './components/SettingsSection';
export {
  SettingsNav,
  type SettingsNavProps,
  type SettingsNavGroup,
  type SettingsNavItem,
} from './components/SettingsNav';
export { VersionLink, STAGING_TIP, type VersionLinkProps } from './components/VersionLink';
export { ThemePick, type ThemePickProps } from './components/ThemePick';
export {
  ProjectSettings,
  openShort,
  openWords,
  type ProjectSettingsProps,
  type ProjectSettingsProject,
} from './components/ProjectSettings';
export {
  Settings,
  type SettingsProps,
  type SettingsMe,
  type SettingsSpace,
  type SettingsMac,
  type SettingsLogin,
  type SettingsDock,
  type SettingsUpdates,
  type SettingsUpdateState,
  type SettingsSectionName,
  UP_TO_DATE_MS,
} from './components/Settings';
export {
  MembersCard,
  MC_DONE_MS,
  type MembersCardProps,
  type MembersCardMember,
  type MembersCardInvite,
} from './components/MembersCard';
export { MemberList, type MemberListProps, type MemberListPerson } from './components/MemberList';
export { TaskLine, type TaskLineProps, type SharedTask, type TaskLinePerson } from './components/TaskLine';
export { PersonRow, type PersonRowProps } from './components/PersonRow';
export { PersonHeader, type PersonHeaderProps } from './components/PersonHeader';
export { JoinCard, JoinHead, type JoinCardProps, type JoinInvite } from './components/JoinCard';

// The Inbox and sending (chunk 08, second PR)
export { PersonPick, PICK_FIND_FROM, type PersonPickProps, type PickPerson } from './components/PersonPick';
export {
  InboxItem,
  InboxSection,
  type InboxItemProps,
  type InboxItemMode,
  type InboxSectionProps,
  type InboxEntry,
  type InboxWho,
  type InboxTaskFacts,
  type InboxOutcome,
  type SentStatus,
} from './components/InboxItem';
export type { QuickAddSend, QuickAddSpace } from './components/QuickAdd';

// Jira (chunk 10)
export { QAChip, type QAChipProps } from './components/QuickAdd';
export {
  JiraPanel,
  JiraPreview,
  JPConnect,
  JPLinked,
  updatedWords,
  JP_CONNECTED_MS,
  JP_FRESH_MS,
  JP_PREVIEW_LEAVE_MS,
  JP_SHEET_LEAVE_MS,
  JP_SEARCH_AFTER_MS,
  type JiraPanelProps,
  type JiraPanelIssue,
  type JiraPanelLink,
  type JiraPanelState,
  type JiraPreviewIssue,
  type JiraPreviewComment,
  type JiraPreviewProps,
  type JiraView,
  type JiraConnectError,
  type JPConnectProps,
  type JPLinkedProps,
  type AddState,
} from './components/JiraPanel';
export { AppsPanel, type AppsPanelProps, type AppsPanelApp } from './components/AppsPanel';
export {
  GettingStarted,
  GS_LEAVE_MS,
  type GettingStartedProps,
  type GettingStartedItem,
} from './components/GettingStarted';
export { FeedbackDialog, type FeedbackDialogProps, type FeedbackPhase } from './components/FeedbackDialog';
export {
  MenuBarSheet,
  MenuBarRow,
  type MenuBarSheetProps,
  type MenuBarRowItem,
  type MenuBarGroupItem,
} from './components/MenuBarSheet';
