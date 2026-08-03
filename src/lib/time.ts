/**
 * 日時を「○分前」などの相対表現に変換する。
 * date-fns 等の外部ライブラリは未導入のため純JSで実装。
 */
export function formatRelativeTime(date: Date, now: Date = new Date()): string {
  const diffMs = now.getTime() - date.getTime();

  // 未来の時刻（時計ずれ等）はたった今扱い
  if (diffMs < 0) return "たった今";

  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "たった今";

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}分前`;

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}時間前`;

  return date.toLocaleDateString();
}
