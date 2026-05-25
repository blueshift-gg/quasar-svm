import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

/**
 * Runs a TypeScript README snippet by:
 * - extracting the first `ts` code block under a heading,
 * - typechecking a generated `.ts` file with `tests/tsconfig.json`,
 * - rewriting local package imports,
 * - transpiling to a temporary `.mjs` module,
 * - executing it and capturing `console.log` output.
 */
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const typecheckDir = path.join(repoRoot, "tests", ".readme-example-typecheck");
const testsTsconfigPath = path.join(repoRoot, "tests", "tsconfig.json");
const web3JsEntryPoint = path.join(repoRoot, "bindings/node/src/web3.js/index.ts");
const kitEntryPoint = path.join(repoRoot, "bindings/node/src/kit/index.ts");
const testCompilerOptions = loadTestCompilerOptions();

const nativeLibs: Record<string, string[]> = {
  "darwin-arm64": ["target/release/libquasar_svm.dylib", "libquasar_svm.dylib"],
  "darwin-x64": ["target/release/libquasar_svm.dylib", "libquasar_svm_x64.dylib"],
  "linux-x64": ["target/release/libquasar_svm.so", "libquasar_svm_x64.so"],
  "linux-arm64": ["target/release/libquasar_svm.so", "libquasar_svm_arm64.so"],
  "win32-x64": ["target/release/quasar_svm.dll", "quasar_svm.dll"],
};

let nativeBuildChecked = false;

export interface ReadmeExample {
  filePath: string;
  heading: string;
}

export async function runReadmeExample(example: ReadmeExample): Promise<{ expectedLogs: string[]; actualLogs: string[] }> {
  const markdown = await fs.readFile(example.filePath, "utf8");
  const rawSource = extractTsCodeBlock(markdown, example.heading);
  const expectedLogs = extractExpectedLogs(rawSource);

  if (expectedLogs.length === 0) {
    throw new Error(`README example ${example.heading} in ${example.filePath} does not declare any expected console output.`);
  }

  const relativeFile = path.relative(repoRoot, example.filePath)
    .replaceAll(path.sep, "-")
    .replaceAll("..", "__");
  const fileStem = `${relativeFile}-${slugify(example.heading)}`;
  const typecheckFilePath = await writeTypecheckModule(fileStem, rawSource);
  
  typecheckExample(example, typecheckFilePath);
  ensureNativeLibraryBuilt();

  const workingTempDir = await fs.mkdtemp(path.join(tmpdir(), "quasar-svm-readme-example-tests-"));
  const source = rewriteRuntimePackageImports(rawSource);
  const jsFilePath = await writeExecutableModule(fileStem, source, workingTempDir);
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
    await import(`${pathToFileURL(jsFilePath).href}?t=${Date.now()}`);
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

function extractTsCodeBlock(markdown: string, heading: string): string {
  const lines = markdown.split(/\r?\n/);
  const headingIndex = lines.findIndex(line => line.trim() === heading);

  if (headingIndex === -1) {
    throw new Error(`Unable to find heading ${heading}.`);
  }

  const startFence = lines.findIndex((line, index) => index > headingIndex && line.trim() === "```ts");
  if (startFence === -1) {
    throw new Error(`Unable to find TypeScript code block after heading ${heading}.`);
  }

  const endFence = lines.findIndex((line, index) => index > startFence && line.trim() === "```");
  if (endFence === -1) {
    throw new Error(`Unable to find closing code fence after heading ${heading}.`);
  }

  return `${lines.slice(startFence + 1, endFence).join("\n")}\n`;
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

function rewriteRuntimePackageImports(source: string): string {
  return rewriteImports(source, {
    "@blueshift-gg/quasar-svm/web3.js": pathToFileURL(web3JsEntryPoint).href,
    "@blueshift-gg/quasar-svm/kit": pathToFileURL(kitEntryPoint).href,
  });
}

function rewriteTypecheckPackageImports(source: string, fromDir: string): string {
  return rewriteImports(source, {
    "@blueshift-gg/quasar-svm/web3.js": toRelativeImportSpecifier(fromDir, web3JsEntryPoint),
    "@blueshift-gg/quasar-svm/kit": toRelativeImportSpecifier(fromDir, kitEntryPoint),
  });
}

function rewriteImports(source: string, replacements: Record<string, string>): string {
  let rewritten = source;
  for (const [pkg, replacement] of Object.entries(replacements)) {
    rewritten = rewritten.replaceAll(`"${pkg}"`, `"${replacement}"`);
    rewritten = rewritten.replaceAll(`'${pkg}'`, `'${replacement}'`);
  }
  return rewritten;
}

function typecheckExample(example: ReadmeExample, sourceFilePath: string): void {
  const program = ts.createProgram([sourceFilePath], testCompilerOptions);
  const diagnostics = ts.getPreEmitDiagnostics(program).filter(diagnostic => {
    if (!diagnostic.file) {
      return true;
    }
    return diagnostic.file.fileName === sourceFilePath;
  });

  if (diagnostics.length > 0) {
    const formatted = formatDiagnostics(diagnostics);
    throw new Error(`TypeScript typecheck failed for README example ${example.heading} in ${example.filePath}.\n\n${formatted}`);
  }
}

function loadTestCompilerOptions(): ts.CompilerOptions {
  const parsed = ts.getParsedCommandLineOfConfigFile(
    testsTsconfigPath,
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: diagnostic => {
        throw new Error(`Failed to load ${testsTsconfigPath}.\n\n${formatDiagnostics([diagnostic])}`);
      },
    }
  );

  if (!parsed) {
    throw new Error(`Failed to parse ${testsTsconfigPath}.`);
  }

  if (parsed.errors.length > 0) {
    throw new Error(`Failed to parse ${testsTsconfigPath}.\n\n${formatDiagnostics(parsed.errors)}`);
  }

  return { ...parsed.options };
}

async function writeTypecheckModule(fileStem: string, source: string): Promise<string> {
  await fs.mkdir(typecheckDir, { recursive: true });
  const outputPath = path.join(typecheckDir, `${fileStem}.ts`);
  const rewritten = rewriteTypecheckPackageImports(source, typecheckDir);
  await fs.writeFile(outputPath, rewritten, "utf8");
  return outputPath;
}

async function writeExecutableModule(fileStem: string, source: string, workingTempDir: string): Promise<string> {
  const outputPath = path.join(workingTempDir, `${fileStem}.mjs`);
  const transpiled = ts.transpileModule(source, {
    compilerOptions: testCompilerOptions,
    fileName: `${fileStem}.ts`,
  });

  await fs.writeFile(outputPath, transpiled.outputText, "utf8");
  return outputPath;
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

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function toRelativeImportSpecifier(fromDir: string, toPath: string): string {
  const relativePath = path.relative(fromDir, toPath).replaceAll(path.sep, "/");
  return relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
}

function formatDiagnostics(diagnostics: readonly ts.Diagnostic[]): string {
  return ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: fileName => fileName,
    getCurrentDirectory: () => repoRoot,
    getNewLine: () => "\n",
  });
}
