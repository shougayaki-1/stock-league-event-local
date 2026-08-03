export type ExactNumberInput = string | number | bigint | null | undefined;

const INTEGER_RE = /^-?\d+$/;

const expandExponential = (value: string) => {
  const match = value.match(/^(-?)(\d+(?:\.\d+)?)[eE]([+-]?\d+)$/);
  if (!match) return value;

  const [, sign, coefficient, exponentText] = match;
  const exponent = Number(exponentText);
  const [whole, fraction = ""] = coefficient.split(".");
  const digits = `${whole}${fraction}`;
  const decimalIndex = whole.length + exponent;

  if (decimalIndex <= 0) return `${sign}0`;
  if (decimalIndex >= digits.length) return `${sign}${digits}${"0".repeat(decimalIndex - digits.length)}`;
  return `${sign}${digits.slice(0, decimalIndex)}`;
};

const numberToIntegerString = (value: number) => {
  if (!Number.isFinite(value)) return "0";
  if (Number.isSafeInteger(value)) return Math.trunc(value).toString();
  return expandExponential(Math.trunc(value).toString());
};

export const toExactString = (value: ExactNumberInput): string => {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") return numberToIntegerString(value);
  if (typeof value !== "string") return "0";

  const clean = value.trim().replace(/,/g, "");
  if (!clean) return "0";
  const expanded = expandExponential(clean);
  if (INTEGER_RE.test(expanded)) return expanded.replace(/^(-?)0+(\d)/, "$1$2");
  const numeric = Number(clean);
  return numberToIntegerString(numeric);
};

export const toExactBigInt = (value: ExactNumberInput): bigint => BigInt(toExactString(value));

export const compareExact = (a: ExactNumberInput, b: ExactNumberInput) => {
  const left = toExactBigInt(a);
  const right = toExactBigInt(b);
  return left === right ? 0 : left > right ? 1 : -1;
};

export const addExact = (a: ExactNumberInput, b: ExactNumberInput) => (toExactBigInt(a) + toExactBigInt(b)).toString();

export const subExact = (a: ExactNumberInput, b: ExactNumberInput) => (toExactBigInt(a) - toExactBigInt(b)).toString();

export const mulExact = (a: ExactNumberInput, b: ExactNumberInput) => (toExactBigInt(a) * toExactBigInt(b)).toString();

export const divFloorExact = (a: ExactNumberInput, b: ExactNumberInput) => {
  const divisor = toExactBigInt(b);
  if (divisor <= 0n) return "0";
  return (toExactBigInt(a) / divisor).toString();
};

export const isPositiveExact = (value: ExactNumberInput) => toExactBigInt(value) > 0n;

export const isPositiveIntegerInput = (value: ExactNumberInput) => {
  if (typeof value === "bigint") return value > 0n;
  if (typeof value === "number") return Number.isInteger(value) && value > 0;
  if (typeof value !== "string") return false;
  const clean = value.trim().replace(/,/g, "");
  return INTEGER_RE.test(clean) && BigInt(clean) > 0n;
};

export const absExact = (value: ExactNumberInput) => {
  const bigintValue = toExactBigInt(value);
  return (bigintValue < 0n ? -bigintValue : bigintValue).toString();
};

export const formatExact = (value: ExactNumberInput) => {
  const exact = toExactString(value);
  const sign = exact.startsWith("-") ? "-" : "";
  const digits = sign ? exact.slice(1) : exact;
  return `${sign}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
};

export const toDisplayNumber = (value: ExactNumberInput) => {
  const bigintValue = toExactBigInt(value);
  if (bigintValue > BigInt(Number.MAX_SAFE_INTEGER)) return Number.MAX_SAFE_INTEGER;
  if (bigintValue < BigInt(Number.MIN_SAFE_INTEGER)) return Number.MIN_SAFE_INTEGER;
  return Number(bigintValue);
};
