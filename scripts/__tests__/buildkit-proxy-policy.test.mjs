import { readFileSync } from "node:fs";
import path from "node:path";
import { load } from "js-yaml";

const root = process.cwd();

const workflows = [
  {
    file: ".github/workflows/ci.yml",
    job: "docker-build",
    proxyGate:
      "${{ (vars.NG_HOSTED_FIRST != 'true' || vars.NG_FORCE_JIT == 'true' || github.run_attempt > 1) && (github.event_name == 'push' || github.event_name == 'workflow_dispatch') && github.ref == 'refs/heads/main' && 'http://10.0.2.100:3128' || '' }}",
  },
  {
    file: ".github/workflows/vulnerability-scan.yml",
    job: "image-scan",
    proxyGate:
      "${{ (vars.NG_HOSTED_FIRST != 'true' || vars.NG_FORCE_JIT == 'true' || github.run_attempt > 1) && (github.event_name == 'push' || github.event_name == 'workflow_dispatch' || github.event_name == 'schedule') && github.ref == 'refs/heads/main' && 'http://10.0.2.100:3128' || '' }}",
  },
];

describe("trusted-main BuildKit proxy policy", () => {
  it.each(workflows)(
    "keeps proxy use limited to the JIT path in $file",
    ({ file, job: jobName, proxyGate }) => {
      const workflow = load(readFileSync(path.join(root, file), "utf8"));
      const job = workflow.jobs[jobName];
      const setup = job.steps.find((step) => step.uses?.includes("setup-buildx-action"));
      const build = job.steps.find((step) => step.uses?.includes("docker-build-push-action"));

      expect(job.env.BUILDKIT_EGRESS_PROXY).toBe(proxyGate);
      expect(proxyGate).not.toContain("pull_request");
      expect(proxyGate).toContain("refs/heads/main");
      expect(job["runs-on"]).toContain("ng-shared-main-jit");
      expect(job["runs-on"]).toContain('"ng-shared-main-questarrng"');
      expect(job["runs-on"]).toContain("github.run_id");
      expect(setup.with["driver-opts"]).toContain(
        "env.HTTP_PROXY=${{ env.BUILDKIT_EGRESS_PROXY }}"
      );
      expect(setup.with["driver-opts"]).toContain(
        "env.https_proxy=${{ env.BUILDKIT_EGRESS_PROXY }}"
      );
      expect(
        setup.with["driver-opts"]
          .split("\n")
          .filter(Boolean)
          .every((option) => !option.includes(","))
      ).toBe(true);
      expect(build.with["build-args"]).toContain("HTTP_PROXY=${{ env.BUILDKIT_EGRESS_PROXY }}");
      expect(build.with["build-args"]).toContain("https_proxy=${{ env.BUILDKIT_EGRESS_PROXY }}");
      expect(build.with["build-args"]).toContain("NO_PROXY=localhost,127.0.0.1");
      expect(build.with["build-args"]).toContain("no_proxy=localhost,127.0.0.1");
    }
  );
});
