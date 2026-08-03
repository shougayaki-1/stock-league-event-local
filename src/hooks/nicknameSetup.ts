/** 一括作成時の仮名を含め、ユーザーがまだニックネームを登録していないかを判定する。 */
export const needsNicknameSetup = (nickname: string | null | undefined, shortId: string | null | undefined) => {
  const normalizedNickname = nickname?.trim() ?? "";
  const normalizedShortId = shortId?.trim() ?? "";

  return !normalizedNickname
    || normalizedNickname === "未登録"
    || normalizedNickname === `(${normalizedShortId})`
    || normalizedNickname === `エージェント(${normalizedShortId})`;
};
