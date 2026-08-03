export const FIRESTORE_COLLECTIONS = {
  users: "users",
  stocks: "stocks",
  settings: "settings",
  publicData: "public_data",
  internal: "internal",
  events: "events",
  news: "news",
  scheduledPostNews: "scheduled_post_news",
  admins: "admins",
  publicSignages: "public_signages",
  riddleRooms: "riddle_rooms",
  videoLibrary: "video_library",
  imageLibrary: "image_library",
  scheduleSessions: "schedule_sessions",
  signagePlaylists: "signage_playlists",
  newsPresets: "news_presets",
} as const;

export const FIRESTORE_DOCS = {
  systemSettings: [FIRESTORE_COLLECTIONS.settings, "system"],
  prizeSettings: [FIRESTORE_COLLECTIONS.settings, "prizes"],
  classroomSettings: [FIRESTORE_COLLECTIONS.settings, "classroom_operation"],
  marketForUsers: [FIRESTORE_COLLECTIONS.publicData, "market_for_users"],
  ranking: [FIRESTORE_COLLECTIONS.publicData, "ranking"],
  priceEngine: [FIRESTORE_COLLECTIONS.internal, "price_engine"],
} as const;

export const userTransactionsPath = (uid: string) =>
  [FIRESTORE_COLLECTIONS.users, uid, "transactions"] as const;
