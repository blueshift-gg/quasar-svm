import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

export type ReadmeExampleTarget = {
  name: string;
  readmePath: string;
  heading: string;
  sourceFilePath: string;
};


export const README_EXAMPLE_TARGETS: ReadmeExampleTarget[] = [
  {
    name: "root README web3.js example",
    readmePath: path.join(repoRoot, "README.md"),
    heading: "### TypeScript (web3.js)",
    sourceFilePath: path.join(repoRoot, "examples/typescript/root-web3.ts"),
  },
  {
    name: "root README kit example",
    readmePath: path.join(repoRoot, "README.md"),
    heading: "### TypeScript (kit)",
    sourceFilePath: path.join(repoRoot, "examples/typescript/root-kit.ts"),
  },
  {
    name: "web3.js README quick start",
    readmePath: path.join(repoRoot, "bindings/node/src/web3.js/README.md"),
    heading: "## Quick Start",
    sourceFilePath: path.join(repoRoot, "examples/typescript/web3-quick-start.ts"),
  },
  {
    name: "web3.js README full example",
    readmePath: path.join(repoRoot, "bindings/node/src/web3.js/README.md"),
    heading: "## Full Example",
    sourceFilePath: path.join(repoRoot, "examples/typescript/web3-full-example.ts"),
  },
  {
    name: "kit README quick start",
    readmePath: path.join(repoRoot, "bindings/node/src/kit/README.md"),
    heading: "## Quick Start",
    sourceFilePath: path.join(repoRoot, "examples/typescript/kit-quick-start.ts"),
  },
  {
    name: "kit README full example",
    readmePath: path.join(repoRoot, "bindings/node/src/kit/README.md"),
    heading: "## Full Example",
    sourceFilePath: path.join(repoRoot, "examples/typescript/kit-full-example.ts"),
  },
];

export async function getReadmeExampleMismatches(): Promise<string[]> {
  return (await readmeExampleSyncPlan()).mismatches;
}

export async function syncReadmeExamples(): Promise<string[]> {
  const plan = await readmeExampleSyncPlan();

  await Promise.all(
    [...plan.changedReadmes].map(async readmePath => {
      await fs.writeFile(readmePath, plan.nextContents.get(readmePath) ?? "", "utf8");
    })
  );

  return plan.mismatches;
}

type ReadmeExampleSyncPlan = {
  changedReadmes: Set<string>;
  mismatches: string[];
  nextContents: Map<string, string>;
};

async function readmeExampleSyncPlan(): Promise<ReadmeExampleSyncPlan> {
  const nextContents = new Map<string, string>();
  const changedReadmes = new Set<string>();
  const mismatches: string[] = [];

  for (const target of README_EXAMPLE_TARGETS) {
    const markdown = nextContents.get(target.readmePath) ?? await fs.readFile(target.readmePath, "utf8");
    const source = await fs.readFile(target.sourceFilePath, "utf8");
    const nextMarkdown = replaceTsCodeBlock(markdown, target.heading, source.trimEnd());

    nextContents.set(target.readmePath, nextMarkdown);

    if (nextMarkdown !== markdown) {
      changedReadmes.add(target.readmePath);
      mismatches.push(formatMismatch(target));
    }
  }

  return { changedReadmes, mismatches, nextContents };
}

/**
 * Replaces the first TypeScript fence under an exact heading match.
 *
 * The sync script relies on a simple README convention instead of markers:
 * each managed heading owns one `ts` code block, and the surrounding prose stays untouched.
 * Trailing newline preservation keeps repeated syncs stable in diff output.
 */
function replaceTsCodeBlock(markdown: string, heading: string, source: string): string {
  const hasTrailingNewline = markdown.endsWith("\n");
  const normalizedMarkdown = hasTrailingNewline ? markdown.slice(0, -1) : markdown;
  const lines = normalizedMarkdown.split(/\r?\n/);
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

  const replacement = ["```ts", ...source.split(/\r?\n/), "```"];
  lines.splice(startFence, endFence - startFence + 1, ...replacement);
  return lines.join("\n") + (hasTrailingNewline ? "\n" : "");
}

function formatMismatch(target: ReadmeExampleTarget): string {
  return `${path.relative(repoRoot, target.readmePath)} :: ${target.heading} <= ${path.relative(repoRoot, target.sourceFilePath)}`;
}

async function main(): Promise<void> {
  const mismatches = await syncReadmeExamples();

  if (mismatches.length === 0) {
    console.log("README examples synced.");
    return;
  }

  console.log("Synced README examples:");
  for (const mismatch of mismatches) {
    console.log(`- ${mismatch}`);
  }
}

// Only run if this script is invoked directly, not when imported by tests
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}