import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Runs a TypeScript example file by:
 * - reading the `.ts` source from disk,
 * - importing the file through Vitest's module pipeline,
 * - executing it and capturing `console.log` output.
 */
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

const nativeLibs: Record<string, string[]> = {
  "darwin-arm64": ["target/release/libquasar_svm.dylib", "libquasar_svm.dylib"],
  "darwin-x64": ["target/release/libquasar_svm.dylib", "libquasar_svm_x64.dylib"],
  "linux-x64": ["target/release/libquasar_svm.so", "libquasar_svm_x64.so"],
  "linux-arm64": ["target/release/libquasar_svm.so", "libquasar_svm_arm64.so"],
  "win32-x64": ["target/release/quasar_svm.dll", "quasar_svm.dll"],
};

let nativeBuildChecked = false;

export async function runReadmeExample(example: { sourceFilePath: string }): Promise<{ expectedLogs: string[]; actualLogs: string[] }> {
  const rawSource = await fs.readFile(example.sourceFilePath, "utf8");
  const expectedLogs = extractExpectedLogs(rawSource);

  if (expectedLogs.length === 0) {
    throw new Error(`TypeScript example ${example.sourceFilePath} does not declare any expected console output.`);
  }

  ensureNativeLibraryBuilt();

  const actualLogs: string[] = [];
  const originalLog = console.log;
  const priorLibPath = process.env.QUASAR_SVM_LIB;
  const resolvedLibPath = resolveNativeLibraryPath();

  console.log = (...args: unknown[]) => {
    actualLogs.push(args.map(formatConsoleValue).join(" "));
  };

  if (!priorLibPath && resolvedLibPath) {
    process.env.QUASAR_SVM_LIB = resolvedLibPath;
  }

  try {
    await import(`${pathToFileURL(example.sourceFilePath).href}?t=${Date.now()}`);
  } finally {
    console.log = originalLog;
    if (!priorLibPath) {
      delete process.env.QUASAR_SVM_LIB;
    } else {
      process.env.QUASAR_SVM_LIB = priorLibPath;
    }
  }

  return { expectedLogs, actualLogs };
}

function extractExpectedLogs(source: string): string[] {
  return source
    .split(/\r?\n/)
    .flatMap(line => {
      const commentIndex = line.indexOf("//");
      if (commentIndex === -1) {
        return [];
      }

      const code = line.slice(0, commentIndex).trim();
      const expectedLog = line.slice(commentIndex + 2).trim();

      if (!code.startsWith("console.log(") || !code.endsWith(");") || expectedLog === "") {
        return [];
      }

      return [expectedLog];
    });
}

function resolveNativeLibraryPath(): string | null {
  const key = `${process.platform}-${process.arch}`;
  const candidates = nativeLibs[key] ?? [];

  for (const candidate of candidates) {
    const fullPath = path.join(repoRoot, candidate);
    if (existsSync(fullPath)) {
      return fullPath;
    }
  }

  return null;
}

function ensureNativeLibraryBuilt(): void {
  if (nativeBuildChecked) {
    return;
  }

  execFileSync("cargo", ["build", "--release", "-p", "quasar-svm-ffi"], {
    cwd: repoRoot,
    stdio: "inherit",
  });

  nativeBuildChecked = true;
}

function formatConsoleValue(value: unknown): string {
  if (typeof value === "bigint") {
    return `${value}n`;
  }
  return String(value);
}
