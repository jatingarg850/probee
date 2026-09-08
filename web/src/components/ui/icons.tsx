'use client'

/**
 * The app's icon set, in one place.
 *
 * Everything imports icons from here rather than from an icon library
 * directly. That is what made swapping the whole app from Lucide to Phosphor
 * a single-file change instead of an edit in twenty-four components, and it
 * is what will make the next swap cheap too.
 *
 * The exported names are deliberately the ones the app already used, so call
 * sites did not have to change and a reviewer can still search for the icon
 * they see on screen. Where Phosphor's own name is clearer it is exported
 * under both.
 *
 * Sizing and colour work exactly as before: every icon renders an <svg> that
 * inherits `currentColor` and takes its box from Tailwind classes
 * (`className="h-4 w-4"`), which override Phosphor's default 1em.
 */

export {
  // — status and feedback —
  WarningCircle as AlertCircle,
  Warning as AlertTriangle,
  CheckCircle as CheckCircle2,
  XCircle,
  Check,
  X,
  Circle,
  Info,
  Question as HelpCircle,
  ShieldWarning as ShieldAlert,
  ShieldCheck,
  // Deliberately not re-exported: CircleNotch (as "Loader2") was the app's
  // circular spinner. Every loading state now uses a skeleton (page/section
  // level) or LoadingDots (inline, in a button) instead — see
  // src/components/ui/loading-dots.tsx. Removed rather than left unused, so
  // a future "just add a spinner" reaches for one of those instead of
  // reintroducing the icon this barrel used to offer for it.
  // — navigation and layout —
  ArrowRight,
  CaretRight as ChevronRight,
  CaretRight,
  CaretDown,
  ArrowSquareOut as ExternalLink,
  List as Menu,
  SquaresFour as LayoutDashboard,
  SignOut as LogOut,
  Plus,
  DotsSix as GripHorizontal,
  CornersOut as Maximize,
  ArrowsOut as Maximize2,
  // — media and call controls —
  Microphone as Mic,
  MicrophoneSlash as MicOff,
  PhoneDisconnect as PhoneOff,
  VideoCameraSlash as VideoOff,
  PlayCircle,
  Broadcast as Radio,
  Eye,
  // — content —
  FileText,
  FileMagnifyingGlass as FileSearch,
  MagnifyingGlass as Search,
  FunnelSimple as Filter,
  DownloadSimple as Download,
  UploadSimple as Upload,
  Quotes as Quote,
  Chat as MessageSquare,
  ChatText as MessageSquareText,
  BookOpen,
  Lightbulb,
  // — domain —
  Briefcase,
  ClipboardText,
  Gear,
  PencilSimple,
  Trash,
  Copy,
  UserPlus,
  Sliders,
  Buildings as Building2,
  Buildings,
  GraduationCap,
  Medal as Award,
  Star,
  Target,
  TrendUp as TrendingUp,
  Sparkle as Sparkles,
  Fire as Flame,
  Users,
  User,
  Wrench,
  MapPin,
  Clock,
  GearSix as Settings,
  ArrowsClockwise as RefreshCw,
  ArrowCounterClockwise as RotateCcw,
} from '@phosphor-icons/react'

/** The shape every icon in this module satisfies — used by components that
 * take an icon as a prop (see EmptyState and StatCard in ui/page.tsx).
 * Exported under the old name as well so those call sites keep working. */
export type { Icon, Icon as LucideIcon, IconProps, IconWeight } from '@phosphor-icons/react'

export { IconContext } from '@phosphor-icons/react'
