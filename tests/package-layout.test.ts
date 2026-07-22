import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

interface PackageManifest {
  name: string;
  version: string;
  optionalDependencies?: Record<string, string>;
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function readManifest(path: string): PackageManifest {
  return JSON.parse(readFileSync(path, "utf8")) as PackageManifest;
}

describe("native npm packages", () => {
  test("are exact, lockstep dependencies of the public package", () => {
    const publicPackage = readManifest(join(root, "package.json"));
    const nativePackages = readdirSync(join(root, "npm"), {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .map((entry) => readManifest(join(root, "npm", entry.name, "package.json")))
      .sort((left, right) => left.name.localeCompare(right.name));

    expect(publicPackage.optionalDependencies).toEqual(
      Object.fromEntries(
        nativePackages.map((nativePackage) => [
          nativePackage.name,
          publicPackage.version,
        ]),
      ),
    );

    for (const nativePackage of nativePackages) {
      expect(nativePackage.version).toBe(publicPackage.version);
    }
  });
});
