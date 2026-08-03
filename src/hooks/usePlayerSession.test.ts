import { describe, expect, it } from "vitest";
import { decidePlayerSession } from "../lib/playerSessionDecision";

describe("decidePlayerSession", () => {
  it("保存IDがなければログインが必要", () => {
    expect(decidePlayerSession(null, null)).toEqual({ action: "missing" });
  });

  it("保存IDとFirebase Auth UIDが一致すれば認証済み", () => {
    expect(decidePlayerSession("0001-AbCdEf", "0001-abcdef")).toEqual({
      action: "authenticated",
      uid: "0001-abcdef",
    });
  });

  it("Authが消えた場合は保存IDから復元する", () => {
    expect(decidePlayerSession("0001-abcdef", null)).toEqual({
      action: "restore",
      uid: "0001-abcdef",
    });
  });

  it("別UIDのAuthセッションは復元し直す", () => {
    expect(decidePlayerSession("0001-abcdef", "0002-ghijkl")).toEqual({
      action: "restore",
      uid: "0001-abcdef",
    });
  });
});
