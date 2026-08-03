import type { Timestamp } from "firebase/firestore";

export const SCHEDULE_SESSIONS_COLLECTION = "schedule_sessions";

export interface ScheduleSession {
  id: string;
  name: string;
  startAt: Timestamp;
  endAt: Timestamp;
  order: number;
}
