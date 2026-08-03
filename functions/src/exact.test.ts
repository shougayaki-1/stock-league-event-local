// functions/src/exact.test.ts
//
// BigInt厳密計算ヘルパーのユニットテスト。取引のポイント/株数計算はここに依存するため、
// 端数・負値・文字列/数値混在・指数表記の境界を重点的に検証する。

import { describe, expect, it } from "vitest";
import { compareExact, requirePositiveInteger, toExactBigInt, toExactString } from "./exact";

describe("toExactString", () => {
  it("整数文字列はそのまま返す", () => {
    expect(toExactString("1000")).toBe("1000");
  });

  it("カンマ区切りの数値文字列を除去する", () => {
    expect(toExactString("1,000,000")).toBe("1000000");
  });

  it("前後の空白を無視する", () => {
    expect(toExactString("  42  ")).toBe("42");
  });

  it("先頭ゼロを除去する（符号は保持）", () => {
    expect(toExactString("007")).toBe("7");
    expect(toExactString("-007")).toBe("-7");
  });

  it("数値型の安全な整数はそのまま整数文字列にする", () => {
    expect(toExactString(1000)).toBe("1000");
    expect(toExactString(0)).toBe("0");
    expect(toExactString(-5)).toBe("-5");
  });

  it("小数の数値/文字列は切り捨てられる", () => {
    expect(toExactString(100.9)).toBe("100");
    expect(toExactString("100.9")).toBe("100");
  });

  it("指数表記を展開する", () => {
    expect(toExactString("1e3")).toBe("1000");
    expect(toExactString("1.5e3")).toBe("1500");
    expect(toExactString("-2e2")).toBe("-200");
  });

  it("未定義/null/オブジェクト/空文字は0として扱う", () => {
    expect(toExactString(undefined)).toBe("0");
    expect(toExactString(null)).toBe("0");
    expect(toExactString({})).toBe("0");
    expect(toExactString("")).toBe("0");
    expect(toExactString("   ")).toBe("0");
  });

  it("bigint値はそのまま文字列化する", () => {
    expect(toExactString(BigInt("9007199254740993"))).toBe("9007199254740993");
  });

  it("Number.MAX_SAFE_INTEGERを超える大きな数値でも安全に扱える", () => {
    // 直接の数値リテラルは精度を失うため、文字列経由で厳密さを保証する
    expect(toExactString("9007199254740993")).toBe("9007199254740993");
  });
});

describe("toExactBigInt", () => {
  it("文字列からBigIntへ変換できる", () => {
    expect(toExactBigInt("300")).toBe(BigInt(300));
  });

  it("不正な入力は0扱いになる", () => {
    expect(toExactBigInt("abc")).toBe(BigInt(0));
  });
});

describe("requirePositiveInteger", () => {
  it("正の整数はそのまま返す", () => {
    expect(requirePositiveInteger("5", "err")).toBe(BigInt(5));
  });

  it("0は拒否される", () => {
    expect(() => requirePositiveInteger("0", "数量エラー")).toThrow("数量エラー");
  });

  it("負数は拒否される", () => {
    expect(() => requirePositiveInteger("-1", "数量エラー")).toThrow("数量エラー");
  });
});

describe("compareExact", () => {
  it("大小関係を厳密に比較できる（浮動小数点誤差なし）", () => {
    expect(compareExact("100", "200")).toBe(-1);
    expect(compareExact("200", "100")).toBe(1);
    expect(compareExact("100", "100")).toBe(0);
  });

  it("Number型では丸められてしまうような桁数でも正しく比較できる", () => {
    const big1 = "90071992547409931";
    const big2 = "90071992547409932";
    expect(compareExact(big1, big2)).toBe(-1);
  });
});
