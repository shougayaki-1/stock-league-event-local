import { describe, expect, it } from "vitest";
import { buildRiddleSignageUrl, formatRiddleDuration, RIDDLE_TRANSITION_LABELS } from "./riddlePresentation";

describe("riddlePresentation", () => {
  it("formats durations for the admin display", () => {
    expect(formatRiddleDuration(null)).toBe("0秒");
    expect(formatRiddleDuration(45)).toBe("45秒");
    expect(formatRiddleDuration(120)).toBe("2分");
    expect(formatRiddleDuration(125)).toBe("2分5秒");
  });

  it("keeps transition labels centralized", () => {
    expect(RIDDLE_TRANSITION_LABELS.VIDEO_END).toBe("動画終了で次へ");
  });

  it("builds encoded signage URLs", () => {
    expect(buildRiddleSignageUrl("https://example.com/", "room A", "front/tv")).toBe(
      "https://example.com/signage/riddle?roomId=room%20A&role=front%2Ftv",
    );
  });
});
