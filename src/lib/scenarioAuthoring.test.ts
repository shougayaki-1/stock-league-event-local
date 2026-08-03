import { describe, expect, it } from "vitest";
import {
  buildOverviewClusters,
  categoryForEvent,
  detectEventWarnings,
  formatOffsetSigned,
  groupEventsByTimeBucket,
} from "./scenarioAuthoring";
import type { ScenarioEvent } from "../types/scenario";

const makeEvent = (over: Partial<ScenarioEvent>): ScenarioEvent => ({
  id: "e",
  time: null,
  offsetSeconds: 0,
  publicNews: null,
  postNews: null,
  insiderNews: null,
  priceChanges: null,
  breakingVideoId: null,
  signageAction: null,
  sessionId: null,
  isProcessed: false,
  ...over,
});

describe("formatOffsetSigned", () => {
  it("formats seconds as +MM:SS", () => {
    expect(formatOffsetSigned(0)).toBe("+00:00");
    expect(formatOffsetSigned(600)).toBe("+10:00");
    expect(formatOffsetSigned(305)).toBe("+05:05");
  });

  it("clamps negative and NaN to +00:00", () => {
    expect(formatOffsetSigned(-5)).toBe("+00:00");
    expect(formatOffsetSigned(Number.NaN)).toBe("+00:00");
  });
});

describe("groupEventsByTimeBucket", () => {
  it("groups by minute bucket in ascending order", () => {
    const groups = groupEventsByTimeBucket([
      makeEvent({ id: "b", offsetSeconds: 75 }),
      makeEvent({ id: "a", offsetSeconds: 10 }),
      makeEvent({ id: "c", offsetSeconds: 40 }),
    ]);
    expect(groups.map(group => group.label)).toEqual(["00:00", "01:00"]);
    expect(groups[0].events.map(event => event.id)).toEqual(["a", "c"]);
    expect(groups[1].events.map(event => event.id)).toEqual(["b"]);
  });
});

describe("detectEventWarnings", () => {
  it("flags duplicate offsets", () => {
    const warnings = detectEventWarnings([
      makeEvent({ id: "x", offsetSeconds: 600, publicNews: { title: "十分な見出し", body: "" } }),
      makeEvent({ id: "y", offsetSeconds: 600, publicNews: { title: "別の見出し", body: "" } }),
    ]);
    expect(warnings.get("x")).toContain("DUPLICATE_TIME");
    expect(warnings.get("y")).toContain("DUPLICATE_TIME");
  });

  it("flags placeholder/short titles", () => {
    const warnings = detectEventWarnings([
      makeEvent({ id: "p", offsetSeconds: 10, publicNews: { title: "ああ", body: "" } }),
    ]);
    expect(warnings.get("p")).toContain("EMPTY_TITLE");
  });

  it("flags empty events with no content", () => {
    const warnings = detectEventWarnings([makeEvent({ id: "z", offsetSeconds: 20 })]);
    expect(warnings.get("z")).toEqual(expect.arrayContaining(["EMPTY_TITLE", "EMPTY_EVENT"]));
  });
});

describe("categoryForEvent", () => {
  it("classifies by content priority", () => {
    expect(categoryForEvent(makeEvent({ publicNews: { title: "x", body: "" } }))).toBe("news");
    expect(categoryForEvent(makeEvent({ priceChanges: [{ stockId: "s", branches: [] }] }))).toBe("price");
    expect(categoryForEvent(makeEvent({ breakingVideoId: "v" }))).toBe("video");
    expect(categoryForEvent(makeEvent({ signageAction: { signageId: "tv", mode: "ranking", duration: 30, kind: "NORMAL" } }))).toBe("signage");
  });
});

describe("buildOverviewClusters", () => {
  it("bins events across the range and counts them", () => {
    const clusters = buildOverviewClusters(
      [
        makeEvent({ id: "a", offsetSeconds: 0, publicNews: { title: "n", body: "" } }),
        makeEvent({ id: "b", offsetSeconds: 0, publicNews: { title: "n", body: "" } }),
        makeEvent({ id: "c", offsetSeconds: 600, priceChanges: [{ stockId: "s", branches: [] }] }),
      ],
      600,
      2
    );
    const first = clusters.find(cluster => cluster.binIndex === 0);
    const last = clusters.find(cluster => cluster.binIndex === 1);
    expect(first?.count).toBe(2);
    expect(first?.category).toBe("news");
    expect(last?.count).toBe(1);
    expect(last?.category).toBe("price");
  });

  it("returns empty for non-positive range", () => {
    expect(buildOverviewClusters([makeEvent({})], 0)).toEqual([]);
  });
});
