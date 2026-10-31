import { readFileSync } from "node:fs";
import path from "node:path";
import { load } from "js-yaml";

const root = process.cwd();
const validationWorkflow = load(
  readFileSync(path.join(root, ".github/workflows/fork-safe-validation.yml"), "utf8")
);
const callerWorkflow = load(
  readFileSync(path.join(root, ".github/workflows/public-fork-pr.yml"), "utf8")
);

describe("public fork release-note runner policy", () => {
  it("keeps fork release-note checks on private JIT runners and pins the trusted workflow", () => {
    const job = validationWorkflow.jobs["release-notes"];
    const caller = callerWorkflow.jobs.validate;

    expect(job["runs-on"]).toBe(
      '${{ fromJSON(\'{"group":"public-fork-jit","labels":["self-hosted","linux","x64","public-pr-questarrng"]}\') }}'
    );
    expect(job.if).toContain("github.event.pull_request.head.repo.fork == true");
    expect(job.if).toContain(
      "github.event.pull_request.base.repo.full_name == 'snapetech-org/QuestarrNG'"
    );
    expect(job.if).toContain("github.event.pull_request.base.ref == 'main'");
    expect(caller.if).toContain("github.event.pull_request.head.repo.fork == true");
    expect(caller.if).toContain(
      "github.event.pull_request.base.repo.full_name == 'snapetech-org/QuestarrNG'"
    );
    expect(caller.if).toContain("github.event.pull_request.base.ref == 'main'");
    expect(caller.uses).toMatch(
      /^snapetech-org\/QuestarrNG\/\.github\/workflows\/fork-safe-validation\.yml@[0-9a-f]{40}$/
    );
  });
});
