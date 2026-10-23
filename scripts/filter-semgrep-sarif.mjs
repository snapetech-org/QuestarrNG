import console from "node:console";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

export function filterSemgrepSarif(sarif) {
  if (!sarif || !Array.isArray(sarif.runs)) {
    throw new TypeError("SARIF input must contain a runs array");
  }

  let filteredCount = 0;
  let activeCount = 0;
  const filteredSarif = {
    ...sarif,
    runs: sarif.runs.map((run) => {
      if (!run || typeof run !== "object") {
        throw new TypeError("Every SARIF run must be an object");
      }
      if (!Array.isArray(run.results)) return run;

      const results = run.results.filter((result) => {
        const hasAcceptedInSourceSuppression = (result.suppressions ?? []).some(
          (suppression) =>
            suppression?.kind === "inSource" &&
            (suppression.status == null || suppression.status === "accepted")
        );
        if (hasAcceptedInSourceSuppression) {
          filteredCount += 1;
          return false;
        }
        activeCount += 1;
        return true;
      });

      return { ...run, results };
    }),
  };

  return { sarif: filteredSarif, filteredCount, activeCount };
}

function runCli() {
  const [inputPath, outputPath, ...extraArgs] = process.argv.slice(2);
  if (!inputPath || !outputPath || extraArgs.length > 0) {
    throw new Error("Usage: node scripts/filter-semgrep-sarif.mjs <input.sarif> <output.sarif>");
  }

  const input = JSON.parse(readFileSync(inputPath, "utf8"));
  const { sarif, filteredCount, activeCount } = filterSemgrepSarif(input);
  writeFileSync(outputPath, `${JSON.stringify(sarif, null, 2)}\n`);
  console.log(
    `Filtered ${filteredCount} accepted in-source suppression(s); uploading ${activeCount} active finding(s).`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runCli();
}
