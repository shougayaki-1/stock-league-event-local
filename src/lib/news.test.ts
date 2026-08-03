import { describe, expect, it } from "vitest";
import { getLatestNewsByKind, getNewsKind } from "./news";
import type { NewsItem } from "../types/domain";

const makeNews = (id: string, kind?: NewsItem["kind"]) => ({
  id,
  title: id,
  body: "",
  stockId: null,
  target: "ALL",
  kind,
  timestamp: { toDate: () => new Date(), toMillis: () => 0 },
} as unknown as NewsItem);

describe("news helpers", () => {
  it("kind未設定の既存ニュースはPUBLIC扱いにする", () => {
    expect(getNewsKind(makeNews("legacy"))).toBe("PUBLIC");
  });

  it("表ニュースと後出しニュースの最新1件を分けて取得する", () => {
    const publicNews = makeNews("public");
    const postNews = makeNews("post", "POST");

    expect(getLatestNewsByKind([publicNews, postNews], "PUBLIC")?.id).toBe("public");
    expect(getLatestNewsByKind([publicNews, postNews], "POST")?.id).toBe("post");
  });
});
