import { describe, expect, it } from "vitest";
import { FIRESTORE_COLLECTIONS, FIRESTORE_DOCS, userTransactionsPath } from "./firestorePaths";

describe("firestorePaths", () => {
  it("keeps canonical collection and document paths centralized", () => {
    expect(FIRESTORE_COLLECTIONS.publicData).toBe("public_data");
    expect(FIRESTORE_COLLECTIONS.publicSignages).toBe("public_signages");
    expect(FIRESTORE_DOCS.marketForUsers).toEqual(["public_data", "market_for_users"]);
    expect(FIRESTORE_DOCS.systemSettings).toEqual(["settings", "system"]);
    expect(userTransactionsPath("u1")).toEqual(["users", "u1", "transactions"]);
  });
});
