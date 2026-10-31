import { filterSemgrepSarif } from "../filter-semgrep-sarif.mjs";

describe("Semgrep SARIF suppression filtering", () => {
  it("filters in-source suppressions when SARIF omits the status field", () => {
    const input = {
      version: "2.1.0",
      runs: [
        {
          results: [
            { ruleId: "reviewed-false-positive", suppressions: [{ kind: "inSource" }] },
            { ruleId: "active-finding" },
          ],
        },
      ],
    };

    const result = filterSemgrepSarif(input);

    expect(result.filteredCount).toBe(1);
    expect(result.activeCount).toBe(1);
    expect(result.sarif.runs[0].results.map(({ ruleId }) => ruleId)).toEqual(["active-finding"]);
  });

  it("filters accepted in-source suppressions but keeps unresolved and external suppressions", () => {
    const input = {
      runs: [
        {
          results: [
            { ruleId: "accepted", suppressions: [{ kind: "inSource", status: "accepted" }] },
            { ruleId: "under-review", suppressions: [{ kind: "inSource", status: "underReview" }] },
            { ruleId: "rejected", suppressions: [{ kind: "inSource", status: "rejected" }] },
            { ruleId: "external", suppressions: [{ kind: "external", status: "accepted" }] },
          ],
        },
      ],
    };

    const result = filterSemgrepSarif(input);

    expect(result.filteredCount).toBe(1);
    expect(result.activeCount).toBe(3);
    expect(result.sarif.runs[0].results.map(({ ruleId }) => ruleId)).toEqual([
      "under-review",
      "rejected",
      "external",
    ]);
  });

  it("rejects malformed SARIF instead of silently uploading an incomplete report", () => {
    expect(() => filterSemgrepSarif({})).toThrow("runs array");
  });
});
