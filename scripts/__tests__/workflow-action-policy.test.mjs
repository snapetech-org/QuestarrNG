import { readFileSync } from "node:fs";
import path from "node:path";
import { load } from "js-yaml";

const workflow = load(
  readFileSync(path.join(process.cwd(), ".github/workflows/trivy-filesystem.yml"), "utf8")
);

describe("Trivy workflow action policy", () => {
  it("uses the organization-allowlisted setup-trivy commit", () => {
    const job = workflow.jobs.trivy;
    const setup = job.steps.find((step) => step.name === "Install the latest Trivy release");

    expect(job["runs-on"]).toContain("ng-shared-main-jit");
    expect(job["runs-on"]).toContain("ng-main-run-{0}");
    expect(setup.uses).toBe("aquasecurity/setup-trivy@3fb12ec12f41e471780db15c232d5dd185dcb514");
    expect(setup.with.version).toBe("latest");
    expect(setup.with.token).toBe("${{ github.token }}");
  });
});
