// functions/src/utils.test.ts
//
// filterNickname（NGワードフィルタ）のユニットテスト。
// utils.ts はモジュール読込時に admin.firestore() を呼ぶため、
// Firestoreへの実際のアクセスは発生しないが、事前に admin.initializeApp() が必要。

import * as admin from "firebase-admin";
import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  if (admin.apps.length === 0) {
    admin.initializeApp({ projectId: "demo-stock-league-event-local-unit-test" });
  }
});

describe("filterNickname", () => {
  it("通常のニックネームはそのまま通す", async () => {
    const { filterNickname } = await import("./utils");
    expect(filterNickname("たろう")).toBe("たろう");
  });

  it("NGワードを含むニックネームは置き換えられる", async () => {
    const { filterNickname } = await import("./utils");
    const result = filterNickname("バカ野郎");
    expect(result).not.toContain("バカ");
    expect(result).toMatch(/^エージェント\d+$/);
  });

  it("全角/半角・大文字小文字の違いを正規化して検出する", async () => {
    const { filterNickname } = await import("./utils");
    const result = filterNickname("ｱﾎ"); // 半角カナ -> NFKCで正規化されると「アホ」相当になる
    expect(result).toMatch(/^エージェント\d+$/);
  });
});
