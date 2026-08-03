import type { Timestamp } from "firebase/firestore";

export const DEFAULT_ROOM_DURATION_SECONDS = 600;
export const DEFAULT_TV_ROLES = ["entrance", "exit"] as const;
export const RIDDLE_DB_NAME = "insider_riddle_db";
export const RIDDLE_STORE_NAME = "cloud_videos";
export const RIDDLE_ACTION_LOCK_MS = 700;
export const VIDEO_ERROR_SKIP_GRACE_MS = 5000;
export const TV_ROLE_PATTERN = /^[a-z0-9_-]+$/;
export type SignageTheme = "light" | "dark";
export const DEFAULT_SIGNAGE_THEME: SignageTheme = "dark";
export const parseSignageTheme = (value: unknown): SignageTheme => (
  value === "light" || value === "dark" ? value : DEFAULT_SIGNAGE_THEME
);

export interface RiddleStep {
  name: string;
  autoTransitionType: "VIDEO_END" | "TIME_ELAPSED" | "MANUAL_OR_TIMER";
  triggerTvRole?: string;
  durationSeconds?: number;
  timerDurationSeconds?: number;
  tvActions: Record<string, {
    mode: "STANDBY" | "DARK" | "VIDEO" | "TIMER" | "NEXT_ROOM";
    videoAssetId?: string;
    /** 未指定の既存データは、従来どおり音声ありとして扱う。 */
    audioEnabled?: boolean;
  }>;
}

export interface RiddleRoom {
  id: string;
  name: string;
  phase: "STANDBY" | "RUNNING";
  duration: number;
  currentStepIndex: number;
  stepStartedAt?: Timestamp | null;
  timerEndTime?: Timestamp | null;
  timerRemainingAtPause?: number | null;
  timerState: "STOPPED" | "RUNNING" | "PAUSED";
  tvRoles: string[];
  steps: RiddleStep[];
  theme: SignageTheme;
}
