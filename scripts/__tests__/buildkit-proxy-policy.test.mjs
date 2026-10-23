import { readFileSync } from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { load } from "js-yaml";

const root = process.cwd();

const workflows = [
  {
    file: ".github/workflows/ci.yml",
    job: "docker-build",
    allowTags: true,
    events: ["push", "workflow_dispatch"],
  },
  {
    file: ".github/workflows/vulnerability-scan.yml",
    job: "image-scan",
    allowTags: false,
    events: ["push", "workflow_dispatch", "schedule"],
  },
];

describe("trusted-main BuildKit proxy policy", () => {
  it.each(workflows)(
    "keeps proxy use limited to the JIT path in $file",
    ({ file, job: jobName, allowTags, events }) => {
      const workflow = load(readFileSync(path.join(root, file), "utf8"));
      const job = workflow.jobs[jobName];
      const proxyGate = job.env.BUILDKIT_EGRESS_PROXY;
      const setup = job.steps.find((step) => step.uses?.includes("setup-buildx-action"));
      const build = job.steps.find((step) => step.uses?.includes("docker-build-push-action"));

      expect(proxyGate).not.toContain("pull_request");
      expect(proxyGate).toContain("refs/heads/main");
      expect(proxyGate).toContain("vars.NG_HOSTED_FIRST");
      expect(proxyGate).toContain("vars.NG_FORCE_JIT");
      expect(proxyGate).toContain("github.run_attempt > 1");
      expect(proxyGate).toContain("|| ''");
      for (const event of events) {
        expect(
          proxyGate.includes('"' + event + '"') ||
            proxyGate.includes("github.event_name == '" + event + "'")
        ).toBe(true);
      }
      if (allowTags) {
        expect(proxyGate).toContain("github.ref_type == 'tag'");
        expect(proxyGate).toContain("startsWith(github.ref_name, 'v')");
      } else {
        expect(proxyGate).not.toContain("github.ref_type");
      }
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
      const resolveProxy = ({
        event = "push",
        ref = "refs/heads/main",
        attempt = 1,
        hostedFirst = false,
        forceJit = false,
      } = {}) =>
        runInNewContext(proxyGate.slice(3, -2), {
          github: {
            event_name: event,
            ref,
            ref_type: ref.startsWith("refs/tags/") ? "tag" : "branch",
            ref_name: ref.replace(/^refs\/(?:heads|tags)\//u, ""),
            run_attempt: attempt,
          },
          vars: {
            NG_HOSTED_FIRST: hostedFirst ? "true" : "false",
            NG_FORCE_JIT: forceJit ? "true" : "false",
          },
          contains: (values, value) => values.includes(value),
          fromJSON: JSON.parse,
          startsWith: (value, prefix) => value.startsWith(prefix),
        });
      for (const event of events) {
        expect(resolveProxy({ event })).toBe("http://10.0.2.100:3128");
      }
      expect(resolveProxy({ event: "pull_request" })).toBe("");
      expect(resolveProxy({ hostedFirst: true })).toBe("");
      expect(resolveProxy({ hostedFirst: true, attempt: 2 })).toBe("http://10.0.2.100:3128");
      expect(resolveProxy({ ref: "refs/tags/v1.2.3" })).toBe(
        allowTags ? "http://10.0.2.100:3128" : ""
      );
      expect(resolveProxy({ event: "push", ref: "refs/tags/release-1.2.3" })).toBe("");
    }
  );
});
