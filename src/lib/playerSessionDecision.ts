export const decidePlayerSession = (requestedId: string | null, authenticatedUid: string | null) => {
  if (!requestedId) return { action: "missing" } as const;
  const normalizedId = requestedId.trim().toLowerCase();
  if (authenticatedUid === normalizedId) return { action: "authenticated", uid: normalizedId } as const;
  return { action: "restore", uid: normalizedId } as const;
};
