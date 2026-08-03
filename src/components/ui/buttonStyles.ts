import { cn } from "../../lib/utils";

// Material Design 3 のボタン種別（新）＋ 既存コードとの後方互換エイリアス（旧）。
// 旧 variant 名は内部で MD3 スタイルにマッピングされるため、呼び出し側の改修は不要。
export type ButtonVariant =
  // --- MD3 標準種別 ---
  | "filled"
  | "tonal"
  | "outlined"
  | "text"
  | "elevated"
  // --- 後方互換エイリアス ---
  | "primary"
  | "secondary"
  | "danger"
  | "destructive"
  | "success"
  | "warning"
  | "info"
  | "neutral"
  | "outline"
  | "soft"
  | "subtle"
  | "ghost";

export type ButtonSize = "xs" | "sm" | "md" | "lg" | "icon-sm" | "icon-md" | "icon-lg";

// MD3 ボタン: pill 形状・medium ウェイト・控えめなプレス。ホバーは state layer で表現。
const baseStyles =
  "relative inline-flex items-center justify-center gap-2 font-medium rounded-full transition-all duration-200 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

// 実体スタイル（MD3 種別ごと）。意味色のバリエーションも内包。
const variantStyles = {
  // Filled: 主要アクション（Google Blue）
  filled:
    "bg-primary text-on-primary elevation-1 hover:elevation-2 hover:brightness-105",
  // Filled (danger): 破壊的アクション
  filledDanger:
    "bg-error text-on-error elevation-1 hover:elevation-2 hover:brightness-105",
  // Filled (success)
  filledSuccess:
    "bg-success text-white elevation-1 hover:elevation-2 hover:brightness-105",
  // Filled (warning)
  filledWarning:
    "bg-warning text-[#1f1f1f] elevation-1 hover:elevation-2 hover:brightness-105",
  // Tonal: primary-container を使った中程度の強調
  tonal:
    "bg-primary-container text-on-primary-container hover:elevation-1 hover:brightness-[0.98]",
  // Outlined: 枠線のみ
  outlined:
    "border border-outline text-primary bg-transparent hover:bg-primary/8",
  // Text: 文字のみ（state layer ホバー）
  text: "bg-transparent text-primary hover:bg-primary/8 shadow-none",
  // Neutral text: 中立的なテキストボタン
  textNeutral:
    "bg-transparent text-on-surface-variant hover:bg-on-surface/8 shadow-none",
  // Elevated: 浮いた中立サーフェス
  elevated:
    "bg-surface-container text-primary elevation-1 hover:elevation-2",
  // Tonal neutral: 控えめなサーフェスボタン
  tonalNeutral:
    "bg-surface-variant text-on-surface hover:brightness-[0.97]",
} as const;

const variants: Record<ButtonVariant, string> = {
  // MD3 標準
  filled: variantStyles.filled,
  tonal: variantStyles.tonal,
  outlined: variantStyles.outlined,
  text: variantStyles.text,
  elevated: variantStyles.elevated,
  // 後方互換マッピング
  primary: variantStyles.filled,
  secondary: variantStyles.tonalNeutral,
  danger: variantStyles.filledDanger,
  destructive: variantStyles.filledDanger,
  success: variantStyles.filledSuccess,
  warning: variantStyles.filledWarning,
  info: variantStyles.tonal,
  neutral: variantStyles.tonalNeutral,
  outline: variantStyles.outlined,
  soft: variantStyles.tonalNeutral,
  subtle: variantStyles.textNeutral,
  ghost: variantStyles.textNeutral,
};

const sizes: Record<ButtonSize, string> = {
  xs: "px-3 py-1 text-[11px]",
  sm: "px-4 py-1.5 text-xs",
  md: "px-6 py-2.5 text-sm",
  lg: "px-8 py-3.5 text-base",
  "icon-sm": "h-11 w-11 p-0",
  "icon-md": "h-11 w-11 p-0",
  "icon-lg": "h-12 w-12 p-0",
};

export function buttonClassNames({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  return cn(baseStyles, variants[variant], sizes[size], className);
}
