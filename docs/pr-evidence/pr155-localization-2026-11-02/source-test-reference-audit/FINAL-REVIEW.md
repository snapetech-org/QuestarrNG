# QuestarrNG PR #155 source/test-reference review

The primary and independent reviews cover 23 source-coverage entries at PR head 1ab1c680fda2da8c4933fa78b529ef29e29ffc90. All 23 were cross-checked against exact source producers and cited tests.

Twenty-one entries have direct producer-branch tests already present. Their coverage arrays now list only those direct test paths; downstream consumer-contract-only paths were excluded. Two entries remain empty because no existing test reaches the emitted producer branch: service.api_failed_to_update_path_mapping needs a rejected updatePathMapping case that asserts the 500 error, and service.api_romm_imports_are_disabled needs disabled-configuration coverage for the route and ImportManager sites.

The primary packet is retained at this directory root; the independent packet is under cross-review. coverage-apply-plan.jsonl records each metadata update and the test evidence; coverage-readback.json records hashes and remaining blockers. Exact producer paths are recorded in review evidence. Existing owners arrays are unchanged because the repository does not document whether owners means feature ownership or exact producer files, and the reviewer rated that meaning as uncertain.

The PR remains open and ready for review. No tests, builds, scans, CI, browser work, workflow edits, releases, or tags were performed. Qualified native-speaker signoff, broader browser coverage, populated provider results, private-JIT validation, and the two branch-coverage gaps remain outstanding.
