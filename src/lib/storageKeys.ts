export const STORAGE_KEYS = {
  USER_ID: "insider_userID",
  OFFLINE_MODE: "insider_offline_mode",
  OFFLINE_QUEUE: "insider_offline_queue",
  OFFLINE_MEMO: "insider_offline_memo",
  VIEW_CLEAR_TIME: "insider_view_cleartime",
  ONBOARDING_DONE: "insider_onboarding_done",
  PUBLIC_SIGNAGE_STARTED: "insider_public_signage_started",
  PENDING_TRADE: "insider_pending_trade",
} as const;

export const SESSION_STORAGE_KEYS = {
  SKIP_INFO_PAGE: "skipInfoPage",
} as const;
