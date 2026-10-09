import type { ReservationMode, ReservationStatus, RunResult, UserRole } from "@zero-second/shared";

/** 状態は色だけで伝えない。アイコン + ラベルを必ず一緒に出す */
export type Tone = "neutral" | "info" | "good" | "warning" | "serious" | "critical";
export type IconName = "clock" | "spinner" | "check" | "cross" | "hand" | "slash" | "sold";

type Label = { label: string; tone: Tone; icon: IconName };

export const STATUS_LABELS: Record<ReservationStatus, Label> = {
  pending: { label: "待機中", tone: "info", icon: "clock" },
  preparing: { label: "準備中", tone: "info", icon: "spinner" },
  running: { label: "実行中", tone: "info", icon: "spinner" },
  succeeded: { label: "購入済み", tone: "good", icon: "check" },
  failed: { label: "購入できず", tone: "critical", icon: "cross" },
  needs_human: { label: "要対応", tone: "warning", icon: "hand" },
  cancelled: { label: "取りやめ", tone: "neutral", icon: "slash" },
};

export const RESULT_LABELS: Record<RunResult, Label> = {
  succeeded: { label: "購入できた", tone: "good", icon: "check" },
  sold_out: { label: "売り切れ", tone: "serious", icon: "sold" },
  failed: { label: "失敗", tone: "critical", icon: "cross" },
  needs_human: { label: "要対応", tone: "warning", icon: "hand" },
};

export const MODE_LABELS: Record<ReservationMode, string> = {
  manual: "手動で購入",
  auto: "自動で購入",
};

export const PAYMENT_LABELS = {
  convenience_store: "コンビニ払い",
} as const;

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "管理者",
  member: "メンバー",
};

export const INVITATION_LABELS = {
  open: { label: "未使用", tone: "info", icon: "clock" },
  accepted: { label: "登録済み", tone: "good", icon: "check" },
  expired: { label: "期限切れ", tone: "neutral", icon: "slash" },
} as const satisfies Record<string, Label>;
