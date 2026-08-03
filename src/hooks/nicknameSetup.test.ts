import { describe, expect, it } from "vitest";
import { needsNicknameSetup } from "./nicknameSetup";

describe("needsNicknameSetup", () => {
  it.each([
    [undefined, "0001"],
    ["", "0001"],
    ["未登録", "0001"],
    ["(0001)", "0001"],
    ["エージェント(0001)", "0001"]
  ])("treats %s as an unset nickname", (nickname, shortId) => {
    expect(needsNicknameSetup(nickname, shortId)).toBe(true);
  });

  it("accepts a nickname chosen by the user", () => {
    expect(needsNicknameSetup("ナナシ(0001)", "0001")).toBe(false);
  });
});
