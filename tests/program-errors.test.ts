import { describe, expect, it } from "vitest";
import { programErrorFromStatus } from "@blueshift-gg/quasar-svm";

describe("stable program errors", () => {
  it("preserves compute, runtime, and the complete custom-code domain", () => {
    expect(programErrorFromStatus(-21, null)).toEqual({
      type: "ComputeBudgetExceeded",
    });
    expect(programErrorFromStatus(1, null, 0)).toEqual({
      type: "Custom",
      code: 0,
    });
    expect(programErrorFromStatus(1, null, 0xffff_ffff)).toEqual({
      type: "Custom",
      code: 0xffff_ffff,
    });
    expect(programErrorFromStatus(-26, "CallDepth")).toEqual({
      type: "Runtime",
      message: "CallDepth",
    });
  });
});
