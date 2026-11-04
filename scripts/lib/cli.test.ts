import { describe, expect, it } from "vitest";
import { parseArgs } from "./cli";

describe("parseArgs", () => {
  it("フラグと値", () => {
    expect(parseArgs(["--from", "2026-01-01", "--force", "--to=2026-02-01", "x"])).toEqual({
      flags: { from: "2026-01-01", force: true, to: "2026-02-01" },
      positional: ["x"],
    });
  });
});
