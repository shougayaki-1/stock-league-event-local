import type { NewsItem } from "../types/domain";

export type NormalizedNewsKind = "PUBLIC" | "POST";

export const getNewsKind = (item: Pick<NewsItem, "kind">): NormalizedNewsKind =>
  item.kind === "POST" ? "POST" : "PUBLIC";

export const getLatestNewsByKind = (news: NewsItem[], kind: NormalizedNewsKind) =>
  news.find(item => getNewsKind(item) === kind) || null;
