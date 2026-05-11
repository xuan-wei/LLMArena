import { runInNewContext } from "vm";
import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import type { EvalResult } from "./index";

const execFileAsync = promisify(execFile);

export interface ScriptContext {
  outputs: string[];
  expected: (string | null)[];
  hiddenCases: boolean[];
}

export interface ScriptResult {
  scores: number[];
  reasons?: string[];
}

export async function runScript(
  script: string,
  lang: "JAVASCRIPT" | "PYTHON",
  context: ScriptContext
): Promise<ScriptResult> {
  if (lang === "JAVASCRIPT") {
    return runJavaScript(script, context);
  } else {
    return runPython(script, context);
  }
}

function runJavaScript(script: string, context: ScriptContext): ScriptResult {
  const sandbox: Record<string, unknown> = {
    outputs: context.outputs,
    expected: context.expected,
    hiddenCases: context.hiddenCases,
    result: null,
    // Safe utilities
    JSON,
    Math,
    String,
    Number,
    Array,
    Object,
    console: {
      log: () => {},
      error: () => {},
    },
  };

  try {
    runInNewContext(script, sandbox, { timeout: 10000 });
  } catch (error) {
    throw new Error(
      `Script execution error: ${error instanceof Error ? error.message : "unknown"}`
    );
  }

  const result = sandbox.result as ScriptResult | null;
  if (!result || !Array.isArray(result.scores)) {
    throw new Error("Script must set result = { scores: number[] }");
  }

  return {
    scores: result.scores.map((s) => Math.max(0, Math.min(1, Number(s) || 0))),
    reasons: result.reasons,
  };
}

async function runPython(
  script: string,
  context: ScriptContext
): Promise<ScriptResult> {
  const tmpId = randomUUID();
  const scriptPath = join(tmpdir(), `arena_eval_${tmpId}.py`);
  const inputJson = JSON.stringify(context);

  const wrapper = `
import json
import sys

context = json.loads(${JSON.stringify(inputJson)})
outputs = context['outputs']
expected = context['expected']
hiddenCases = context['hiddenCases']
result = None

${script}

if result is None:
    raise ValueError("Script must set result = {'scores': [...]}")

print(json.dumps(result))
`;

  await writeFile(scriptPath, wrapper, "utf8");

  try {
    const { stdout } = await execFileAsync("python3", [scriptPath], {
      timeout: 90000,
      maxBuffer: 1024 * 64,
    });

    const parsed: ScriptResult = JSON.parse(stdout.trim());
    if (!Array.isArray(parsed.scores)) {
      throw new Error("Script result must have scores array");
    }

    return {
      scores: parsed.scores.map((s) => Math.max(0, Math.min(1, Number(s) || 0))),
      reasons: parsed.reasons,
    };
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("Script produced invalid JSON output");
    }
    throw new Error(
      `Python script error: ${error instanceof Error ? error.message : "unknown"}`
    );
  } finally {
    await unlink(scriptPath).catch(() => {});
  }
}

export function scriptResultToEvalResults(
  result: ScriptResult,
  count: number
): EvalResult[] {
  return Array.from({ length: count }, (_, i) => ({
    score: result.scores[i] ?? 0,
    reason: result.reasons?.[i],
  }));
}
