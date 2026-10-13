# npm CLI source tracker

This manifest and minimal lock track the npm CLI archive that CI verifies and extracts.
The extracted CLI is used with the separately installed, patched dependency graph in
the sibling npm-runtime directory; npm bundled dependencies are intentionally excluded.

Do not run npm install or npm ci in this directory. Keep the npm version, tarball URL,
and integrity in package-lock.json aligned when updating package.json. The source lock
is audited independently so advisories against the npm package itself block CI and
release publication without adding bundled dependencies to the runtime.
