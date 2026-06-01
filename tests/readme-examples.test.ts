import { describe, expect, it } from "vitest";
import { getReadmeExampleMismatches, README_EXAMPLE_TARGETS } from "../scripts/sync-readme-examples.js";
import { runReadmeExample } from "./helpers/readmeExamples.js";

describe("README examples", () => {
  for (const target of README_EXAMPLE_TARGETS) {
    it(target.name, async () => {
      const { expectedLogs, actualLogs } = await runReadmeExample(target);
      expect(actualLogs).toEqual(expectedLogs);
    }, 120000);
  }

  it("README snippets stay synced", async () => {
    const mismatches = await getReadmeExampleMismatches();
    expect(mismatches).toEqual([]);
  });
});