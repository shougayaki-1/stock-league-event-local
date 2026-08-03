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

export const toExactString = (value: unknown): string => {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") return numberToIntegerString(value);
  if (typeof value !== "string") return "0";

  const clean = value.trim().replace(/,/g, "");
  if (!clean) return "0";
  const expanded = expandExponential(clean);
  if (INTEGER_RE.test(expanded)) return expanded.replace(/^(-?)0+(\d)/, "$1$2");
  return numberToIntegerString(Number(clean));
};

export const toExactBigInt = (value: unknown): bigint => BigInt(toExactString(value));

export const requirePositiveInteger = (value: unknown, message: string) => {
  const exact = toExactBigInt(value);
  if (exact <= BigInt(0)) throw new Error(message);
  return exact;
};

export const compareExact = (a: unknown, b: unknown) => {
  const left = toExactBigInt(a);
  const right = toExactBigInt(b);
  return left === right ? 0 : left > right ? 1 : -1;
};
