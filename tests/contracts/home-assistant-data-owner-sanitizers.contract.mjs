// Copyright (c) QuestarrNG contributors. All rights reserved.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const requireSanitizerToolchain = process.env.REQUIRE_SANITIZER_TOOLCHAIN === "1";
const childEnvironment = { ...process.env };
delete childEnvironment.LD_PRELOAD;

test("Home Assistant ownership helper survives ASan and UBSan fixture traversal", (t) => {
  if (process.platform !== "linux") {
    if (requireSanitizerToolchain) assert.fail("The sanitizer contract requires Linux.");
    t.skip("The Home Assistant helper sanitizer contract runs on Linux CI.");
    return;
  }

  const compiler = spawnSync("cc", ["--version"], {
    encoding: "utf8",
    env: childEnvironment,
  });
  if (compiler.error || compiler.status !== 0) {
    if (requireSanitizerToolchain) {
      assert.fail("The sanitizer contract requires the C compiler available in CI.");
    }
    t.skip("The isolated validation sandbox does not expose a C compiler.");
    return;
  }

  const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), "questarr-data-owner-sanitizer-"));
  try {
    const sanitizerEnvironment = {
      ...childEnvironment,
      ASAN_OPTIONS: "detect_leaks=1:halt_on_error=1:abort_on_error=1",
      UBSAN_OPTIONS: "halt_on_error=1:print_stacktrace=1",
    };
    const probeBinaryPath = path.join(temporaryRoot, "sanitizer-toolchain-probe");
    const probe = spawnSync(
      "cc",
      [
        "-std=c11",
        "-Wall",
        "-Wextra",
        "-Werror",
        "-fsanitize=address,undefined",
        "-fno-omit-frame-pointer",
        "-x",
        "c",
        "-o",
        probeBinaryPath,
        "-",
      ],
      {
        encoding: "utf8",
        env: childEnvironment,
        input:
          "#define _XOPEN_SOURCE 700\n#include <errno.h>\n#include <ftw.h>\n#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\n#include <sys/stat.h>\n#include <sys/types.h>\n#include <unistd.h>\nint main(void) { return 0; }\n",
      }
    );
    const probeRun =
      probe.error || probe.status !== 0
        ? null
        : spawnSync(probeBinaryPath, [], { encoding: "utf8", env: sanitizerEnvironment });
    if (
      probe.error ||
      probe.status !== 0 ||
      probeRun?.error ||
      probeRun?.status !== 0
    ) {
      const detail =
        probe.error?.message ||
        probe.stderr ||
        probeRun?.error?.message ||
        probeRun?.stderr ||
        "sanitizer probe exited unsuccessfully";
      if (requireSanitizerToolchain) {
        assert.fail(`The sanitizer contract requires a complete C sanitizer toolchain: ${detail}`);
      }
      t.skip("The isolated validation sandbox does not expose a complete C sanitizer toolchain.");
      return;
    }

    const dataRoot = path.join(temporaryRoot, "data");
    const nested = path.join(dataRoot, "nested");
    const file = path.join(nested, "fixture.txt");
    const outsideTarget = path.join(temporaryRoot, "outside.txt");
    const symlink = path.join(nested, "outside-link");
    const logPath = path.join(temporaryRoot, "lchown.log");
    const binaryPath = path.join(temporaryRoot, "questarr-fix-data-owner");
    mkdirSync(nested, { recursive: true });
    writeFileSync(file, "fixture");
    writeFileSync(outsideTarget, "outside fixture");
    symlinkSync(outsideTarget, symlink);

    execFileSync(
      "cc",
      [
        "-std=c11",
        "-Wall",
        "-Wextra",
        "-Werror",
        "-g",
        "-O1",
        "-fsanitize=address,undefined",
        "-fno-omit-frame-pointer",
        `-DQUESTARR_DATA_DIR="${dataRoot}"`,
        `-DQUESTARR_TEST_CHOWN_LOG="${logPath}"`,
        path.join(repositoryRoot, "questarr/fix-data-owner.c"),
        path.join(repositoryRoot, "questarr/fix-data-owner-test-wrap.c"),
        "-Wl,--wrap=lchown",
        "-o",
        binaryPath,
      ],
      { cwd: repositoryRoot, stdio: "pipe", env: childEnvironment }
    );

    for (const args of [
      [],
      ["0", "2"],
      ["2", "0"],
      ["-1", "2"],
      ["2", "not-a-number"],
      ["2", "3", "extra"],
    ]) {
      const invalid = spawnSync(binaryPath, args, {
        encoding: "utf8",
        env: sanitizerEnvironment,
      });
      assert.equal(invalid.status, 2, invalid.stderr);
    }
    assert.equal(existsSync(logPath), false, "invalid arguments must not walk /data");

    const targetUid = process.getuid?.() === 1 ? 2 : 1;
    const targetGid = process.getgid?.() === 1 ? 2 : 1;
    const traversed = spawnSync(binaryPath, [String(targetUid), String(targetGid)], {
      encoding: "utf8",
      env: sanitizerEnvironment,
    });
    assert.equal(traversed.status, 0, traversed.stderr);

    const calls = readFileSync(logPath, "utf8")
      .trimEnd()
      .split("\n")
      .map((line) => {
        const [uid, gid, ...parts] = line.split("\t");
        return { uid, gid, path: parts.join("\t") };
      });
    assert.equal(
      calls.length,
      4,
      "only the fixture root, nested directory, file, and link should be visited"
    );
    for (const call of calls) {
      assert.equal(call.uid, String(targetUid));
      assert.equal(call.gid, String(targetGid));
      assert.ok(
        call.path === dataRoot || call.path.startsWith(dataRoot + path.sep),
        `walk escaped its fixture: ${call.path}`
      );
    }
    assert.ok(!calls.some((call) => call.path === outsideTarget));
    assert.equal(lstatSync(symlink).isSymbolicLink(), true);

    if ((process.getuid?.() ?? 0) > 0 && (process.getgid?.() ?? 0) > 0) {
      writeFileSync(logPath, "");
      const matchingOwners = spawnSync(
        binaryPath,
        [String(process.getuid()), String(process.getgid())],
        { encoding: "utf8", env: sanitizerEnvironment }
      );
      assert.equal(matchingOwners.status, 0, matchingOwners.stderr);
      assert.equal(
        readFileSync(logPath, "utf8").length,
        0,
        "matching ownership must not call lchown"
      );
    }

    const unavailableRoot = path.join(temporaryRoot, "data-unavailable");
    renameSync(dataRoot, unavailableRoot);
    try {
      const missingData = spawnSync(binaryPath, [String(targetUid), String(targetGid)], {
        encoding: "utf8",
        env: sanitizerEnvironment,
      });
      assert.equal(missingData.status, 1, missingData.stderr);
      assert.match(missingData.stderr, /Cannot walk the Home Assistant \/data volume/u);
    } finally {
      renameSync(unavailableRoot, dataRoot);
    }
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
