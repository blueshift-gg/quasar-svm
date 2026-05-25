import path from "node:path";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runReadmeExample, type ReadmeExample } from "./helpers/readmeExamples.js";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

const examples: Array<{ name: string; example: ReadmeExample }> = [
  {
    name: "root README web3.js example",
    example: {
      filePath: path.join(repoRoot, "README.md"),
      heading: "### TypeScript (web3.js)",
    },
  },
  {
    name: "root README kit example",
    example: {
      filePath: path.join(repoRoot, "README.md"),
      heading: "### TypeScript (kit)",
    },
  },
  {
    name: "web3.js README quick start",
    example: {
      filePath: path.join(repoRoot, "bindings/node/src/web3.js/README.md"),
      heading: "## Quick Start",
    },
  },
  {
    name: "web3.js README full example",
    example: {
      filePath: path.join(repoRoot, "bindings/node/src/web3.js/README.md"),
      heading: "## Full Example",
    },
  },
  {
    name: "kit README quick start",
    example: {
      filePath: path.join(repoRoot, "bindings/node/src/kit/README.md"),
      heading: "## Quick Start",
    },
  },
  {
    name: "kit README full example",
    example: {
      filePath: path.join(repoRoot, "bindings/node/src/kit/README.md"),
      heading: "## Full Example",
    },
  },
];

describe("README examples", () => {
  for (const { name, example } of examples) {
    it(name, async () => {
      const { expectedLogs, actualLogs } = await runReadmeExample(example);
      expect(actualLogs).toEqual(expectedLogs);
    }, 120000);
  }

  it("fails when a README example has TypeScript type errors", async () => {
    const tempDir = await fs.mkdtemp(path.join(tmpdir(), "quasar-svm-readme-type-error-"));
    const markdownPath = path.join(tempDir, "broken.md");

    await fs.writeFile(markdownPath, [
      "## Broken Example",
      "",
      "```ts",
      "const amount: bigint = 1;",
      "console.log(amount); // 1n",
      "```",
      "",
    ].join("\n"));

    await expect(runReadmeExample({ filePath: markdownPath, heading: "## Broken Example" })).rejects.toThrow(/TypeScript typecheck failed/);

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("typechecks snippets with Node types from tests tsconfig", async () => {
    const tempDir = await fs.mkdtemp(path.join(tmpdir(), "quasar-svm-readme-node-types-"));
    const markdownPath = path.join(tempDir, "node-types.md");

    await fs.writeFile(markdownPath, [
      "## Node Types Example",
      "",
      "```ts",
      "const cwd: string = process.cwd();",
      'console.log(typeof cwd); // string',
      "```",
      "",
    ].join("\n"));

    const { expectedLogs, actualLogs } = await runReadmeExample({
      filePath: markdownPath,
      heading: "## Node Types Example",
    });

    expect(actualLogs).toEqual(expectedLogs);

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("rewrites single-quoted package imports", async () => {
    const tempDir = await fs.mkdtemp(path.join(tmpdir(), "quasar-svm-readme-single-quotes-"));
    const markdownPath = path.join(tempDir, "single-quotes.md");

    await fs.writeFile(markdownPath, [
      "## Single Quotes Example",
      "",
      "```ts",
      "import { QuasarSvm } from '@blueshift-gg/quasar-svm/web3.js';",
      "const vm = new QuasarSvm();",
      "console.log(vm instanceof QuasarSvm); // true",
      "```",
      "",
    ].join("\n"));

    const { expectedLogs, actualLogs } = await runReadmeExample({
      filePath: markdownPath,
      heading: "## Single Quotes Example",
    });

    expect(actualLogs).toEqual(expectedLogs);

    await fs.rm(tempDir, { recursive: true, force: true });
  });
});