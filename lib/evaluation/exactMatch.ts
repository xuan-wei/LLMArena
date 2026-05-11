import type { EvalResult } from "./index";

function normalize(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^\u4e00-\u9fa5a-z0-9]/g, "") // keep CJK, letters, digits
    .replace(/\s+/g, "");
}

export function evaluateExactMatch(
  rawOutput: string,
  expected: string | null
): EvalResult {
  if (!expected) {
    return { score: 0, reason: "No expected answer configured" };
  }

  const normalOutput = normalize(rawOutput);
  const normalExpected = normalize(expected);

  if (normalOutput === normalExpected) {
    return { score: 1, reason: "Exact match" };
  }

  if (normalOutput.includes(normalExpected) || normalExpected.includes(normalOutput)) {
    return { score: 0.5, reason: "Partial match" };
  }

  return { score: 0, reason: "No match" };
}
