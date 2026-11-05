import hashlib, json, subprocess
from datetime import datetime, timezone
from pathlib import Path

root=Path('/mnt/disks/scratch/task-worktrees/localization-20261102/questarrng-pr155-catalog-reconciliation')
inp=Path('/mnt/disks/scratch/task-scratch/questarrng-pr155-test-reference-followup-20261102')
out=Path('/mnt/disks/scratch/task-scratch/questarrng-pr155-test-reference-crossreview-20261102')
expected_head='1ab1c680fda2da8c4933fa78b529ef29e29ffc90'
expected_tree='bf909d8b3057a480f455a9ba916e6c55c52f8833'
repo='snapetech-org/QuestarrNG'

def cmd(args,cwd=None): return subprocess.check_output(args,cwd=cwd,text=True).strip()
def sha(b): return hashlib.sha256(b).hexdigest()
def blob(b): return hashlib.sha1(f'blob {len(b)}\0'.encode()+b).hexdigest()
def canon(x): return json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()
def utc(): return datetime.now(timezone.utc).isoformat()
def snapshot_path(f):
    a=inp/'inputs'/f['repositoryPath']
    return a if a.exists() else inp/f['path']

def attest(stage):
    pr=json.loads(cmd(['gh','pr','view','155','--repo',repo,'--json','state,isDraft,headRefOid,headRefName,baseRefName,baseRefOid,url,title']))
    wh=cmd(['git','rev-parse','HEAD'],cwd=root)
    wt=cmd(['git','rev-parse','HEAD^{tree}'],cwd=root)
    status=cmd(['git','status','--short'],cwd=root)
    manifest=json.loads((inp/'input-manifest.json').read_text())
    checks=[]
    for f in manifest['files']:
        sp=snapshot_path(f); sb=sp.read_bytes()
        live=subprocess.check_output(['git','show',f"{expected_head}:{f['repositoryPath']}"],cwd=root)
        checks.append({'repositoryPath':f['repositoryPath'],'snapshotPath':str(sp),'snapshotBytes':len(sb),'snapshotSha256':sha(sb),'snapshotGitBlobSha':blob(sb),'manifestBytes':f['bytes'],'manifestSha256':f['sha256'],'manifestGitBlobSha':f['gitBlobSha'],'liveHeadBytes':len(live),'liveHeadSha256':sha(live),'liveHeadGitBlobSha':blob(live),'snapshotMatchesManifest':len(sb)==f['bytes'] and sha(sb)==f['sha256'] and blob(sb)==f['gitBlobSha'],'snapshotMatchesLiveHead':sb==live})
    result={'stage':stage,'verifiedAtUtc':utc(),'repository':repo,'pullRequest':pr,'expectedHead':expected_head,'expectedTree':expected_tree,'worktreeHead':wh,'worktreeTree':wt,'worktreeStatusShort':status,'preexistingUntrackedPath':'docs/pr-evidence/pr155-localization-2026-11-02/source-test-reference-audit/','inputManifestPath':str(inp/'input-manifest.json'),'inputManifestFiles':len(manifest['files']),'inputManifestCommit':manifest['commit'],'inputManifestTree':manifest['tree'],'inputSnapshotChecks':checks,'allInputSnapshotsMatchManifest':all(x['snapshotMatchesManifest'] for x in checks),'allInputSnapshotsMatchLiveHead':all(x['snapshotMatchesLiveHead'] for x in checks),'exactPinMatched':pr['state']=='OPEN' and pr['headRefOid']==expected_head and wh==expected_head and wt==expected_tree and manifest['commit']==expected_head and manifest['tree']==expected_tree,'draftStatus':pr['isDraft'],'scope':'read-only reattestation; no tests/builds/scans/CI/browser executed'}
    if not result['exactPinMatched'] or not result['allInputSnapshotsMatchManifest'] or not result['allInputSnapshotsMatchLiveHead']:
        raise RuntimeError('PR, tree, or frozen input drift; stop before review')
    return result

before=attest('before-cross-review')
(out/'attestation-before.json').write_bytes(canon(before)+b'\n')
subprocess.check_call(['sha256sum','-c','SHA256SUMS'],cwd=inp,stdout=subprocess.DEVNULL)
rows=[json.loads(x) for x in (inp/'entry-review.jsonl').read_text().splitlines()]
coverage=json.loads((inp/'source-coverage.json').read_text())
manifest=json.loads((inp/'input-manifest.json').read_text())
assert len(rows)==23 and [x['sourcePosition'] for x in rows]==list(range(230,253))
source_key_checks=[]
for r in rows:
    entry_index=r['sourcePosition']-1
    entry=coverage['entries'][entry_index]
    assert entry['key']==r['key'] and entry.get('coverage')==r.get('currentCoverage')==[] and entry.get('owners')==r['declaredOwners']
    source_key_checks.append({'sourcePosition':r['sourcePosition'],'key':r['key'],'sourceCoverageEntryIndex':entry_index,'entryKeyMatches':True,'emptyCoverageMatches':True,'ownerListsMatch':True})

# Independent case-level adjudications; line ranges refer to immutable snapshots named in the input manifest.
decisions={
230:{('server/__tests__/integration_api.test.ts',1320):('direct-producer-branch','Mocked addApiKey rejection uses the exact cap sentinel; API-key route takes its 409 serviceMessage branch.','409 plus message-category assertion; not exact full fallback.')},
231:{('server/__tests__/integration_api.test.ts',1332):('direct-producer-branch','Unexpected addApiKey rejection enters the API-key route catch and emits the exact source-owned create-failure key.','500 and exact English fallback body.')},
232:{('server/__tests__/integration_api.test.ts',1350):('direct-producer-branch','removeApiKey=false reaches scoped missing-key 404 branch carrying this key.','404 status only; direct branch reached.')},
233:{('server/__tests__/integration_api.test.ts',1363):('direct-producer-branch','removeApiKey rejection enters the revocation catch and emits this key.','500 and exact English fallback body.')},
234:{('server/__tests__/import_routes_coverage.test.ts',321):('direct-producer-branch','addPathMapping rejection reaches route catch emitting create-mapping key.','500 plus regex over English fallback.')},
235:{('server/__tests__/import_routes_coverage.test.ts',344):('direct-producer-branch','removePathMapping=false reaches DELETE missing-mapping 404 branch.','404 status only; direct branch reached.'),('server/__tests__/import_routes_additional.test.ts',322):('direct-producer-branch','updatePathMapping=undefined reaches PATCH missing-mapping 404 branch.','404 status only; direct branch reached.')},
236:{('server/__tests__/import_routes_additional.test.ts',288):('does-not-reach-producer-branch','updatePathMapping resolves a row; handler returns 200 and never enters rejection catch emitting this key.','Success assertions; no failure branch.'),('server/__tests__/import_routes_additional.test.ts',322):('does-not-reach-producer-branch','updatePathMapping resolves undefined; handler emits the distinct missing-mapping 404 key, not this failure key.','404 assertion; wrong branch for this key.')},
237:{('server/__tests__/import_routes_coverage.test.ts',352):('direct-producer-branch','removePathMapping rejection reaches DELETE error catch and emits this key.','500 plus regex over fallback.')},
238:{('server/__tests__/import_routes_coverage.test.ts',451):('direct-producer-branch','getGameDownload=undefined reaches DELETE missing-download 404 branch.','404 and no status-update assertion.'),('server/__tests__/import_routes_additional.test.ts',187):('direct-producer-branch','getGameDownload=undefined reaches POST link missing-download 404 branch.','404 and no relink assertion.')},
239:{('server/__tests__/import_routes_coverage.test.ts',489):('direct-producer-branch','game_link_required status and conditional skip returning undefined reach race-conflict key branch.','409 and no status-update assertion.')},
240:{('server/__tests__/import_routes_coverage.test.ts',460):('direct-producer-branch','DELETE storage lookup rejection is caught and returns this internal-server-error key.','500 only; direct catch reached.'),('server/__tests__/import_routes_coverage.test.ts',635):('direct-producer-branch','unexpected confirmImport rejection reaches confirm catch and returns this key.','500 only; direct catch reached.'),('server/__tests__/import_routes_additional.test.ts',255):('direct-producer-branch','link-route storage lookup rejection reaches its generic catch and returns this key.','500 only; direct catch reached.')},
241:{('server/__tests__/import_routes_additional.test.ts',197):('direct-producer-branch','manual_review_required differs from game_link_required and reaches route 400 branch carrying this key.','400 and no relink assertion.')},
242:{('server/__tests__/import_routes_additional.test.ts',236):('direct-producer-branch','download passes game_link_required check, then relinkGameDownload=undefined reaches concurrent-update 409 key branch.','409 only; direct branch reached.')},
243:{('server/__tests__/import_routes_coverage.test.ts',95):('does-not-reach-producer-branch','test sets enabled=true and expects settings update success; disabled guard bypassed.','200/saved-config assertion; opposite configuration.'),('server/__tests__/import_manager.test.ts',1300):('does-not-reach-producer-branch','test configures enabled=true and completes RomM import; disabled guard bypassed.','Successful import; opposite configuration.')},
244:{('server/__tests__/api_routes.test.ts',5171):('direct-producer-branch','IGDB provider failure is mocked through the route; handler emits exact IGDB-search-failed key.','500 with exact English error body.')},
245:{('server/__tests__/import_routes_security.test.ts',44):('direct-producer-branch','literal traversal outside configured root is rejected with invalid-proposed-path key.','400, fallback regex, manager not called.'),('server/__tests__/import_routes_security.test.ts',79):('conditional-path-not-sufficient-alone','test accepts either 400/key branch or a safe 200 path; runtime outcome is not fixed by assertions.','Conditional 400 or 200; not sufficient alone.'),('server/__tests__/import_routes_security.test.ts',104):('mixed-direct-and-conditional-subcases','backslash case accepts safe 200 or error 400, but later absolute traversal subcase (130–141) deterministically rejects with this key.','Direct 400 assertion at 130–141; earlier backslash case conditional.'),('server/__tests__/import_routes_additional.test.ts',392):('direct-producer-branch','Windows-drive absolute proposed path is rejected before manager execution.','400 plus fallback regex.')},
246:{('server/__tests__/archive_service.test.ts',700):('direct-producer-branch','wrong retry password enters ArchiveService classifier with truthy password; classifier emits rejected-password service key.','Error regex, not exact key/fallback; source branch is direct.'),('server/__tests__/import_routes_additional.test.ts',508):('consumer-contract-only','test injects a manually constructed ArchivePasswordRequiredError into confirmImport; verifies route propagation without ArchiveService key selection.','Exact injected message and response; producer not reached.')},
247:{('server/__tests__/archive_service.test.ts',606):('direct-producer-branch','password-protected archive failure with no retry password emits required-password key in ArchiveService.','Typed error assertion; branch direct.'),('server/__tests__/import_manager.test.ts',1040):('consumer-contract-only','test injects ArchivePasswordRequiredError with hand-authored message into ImportManager; ArchiveService producer not executed.','Marker persistence only.'),('server/__tests__/import_routes_additional.test.ts',429):('consumer-contract-only','test seeds existing marker and checks API marker stripping; it does not execute ArchiveService producer.','Output/flag contract only.')},
248:{('server/__tests__/import_manager.test.ts',1745):('direct-producer-branch','incomplete scan result during confirmImport reaches ImportManager incomplete-scan branch and creates keyed error.','Typed IncompleteScanError and no file move; exact fallback not asserted.'),('server/__tests__/import_routes_coverage.test.ts',619):('consumer-contract-only','test manually constructs IncompleteScanError with literal text and checks route response; ImportManager keyed producer not called.','409 and reason substring; route contract only.')},
249:{('server/__tests__/import_manager_additional.test.ts',838):('direct-producer-branch','empty originalPath and missing downloader cause resolution failure and keyed ServiceMessageError.','Throws source-path text; key descriptor not asserted.'),('server/__tests__/import_routes_coverage.test.ts',591):('consumer-contract-only','test injects generic Error with matching English wording into route; does not execute ImportManager source-path resolution/keyed producer.','400 and message regex; route contract only.')},
250:{('server/__tests__/import_manager_additional.test.ts',95):('direct-producer-branch','planConfirmImport gets undefined game-download record and throws keyed missing-download error.','Exact message with download ID.')},
251:{('server/__tests__/import_manager_additional.test.ts',105):('direct-producer-branch','planConfirmImport gets a download but no game and throws keyed missing-game error.','Exact message with download ID.'),('server/__tests__/import_manager.test.ts',579):('direct-producer-branch','confirmImport gets no game for download and throws the same keyed error.','Exact message with download ID.')},
252:{('server/__tests__/import_manager.test.ts',329):('direct-producer-branch','pathExists=false reaches source-path-missing branch and constructs keyed error with safeOriginalPath.','Exact error prefix and path.')}
}

ledger=[]; verdict_counts={}; ref_count=0; producer_occurrences=[]
for r in rows:
    pos=r['sourcePosition']; expected=decisions[pos]
    assert len(expected)==len(r['testEvidence']),(pos,len(expected),len(r['testEvidence']))
    ev_audits=[]; direct=0
    for ev in r['testEvidence']:
        k=(ev['path'],ev['startLine']); assert k in expected,(pos,k)
        verdict,reason,assertion=expected[k]
        mf=next(f for f in manifest['files'] if f['repositoryPath']==ev['path'])
        data=snapshot_path(mf).read_bytes(); lines=data.decode().splitlines()
        assert 1<=ev['startLine']<=ev['endLine']<=len(lines)
        digest=sha(data); bsha=blob(data)
        assert digest==ev['sha256']==mf['sha256'] and bsha==ev['gitBlobSha']==mf['gitBlobSha'],(pos,k,'hash mismatch')
        excerpt='\n'.join(f'{i}: {lines[i-1]}' for i in range(ev['startLine'],ev['endLine']+1))
        if verdict in ('direct-producer-branch','mixed-direct-and-conditional-subcases'): direct+=1
        verdict_counts[verdict]=verdict_counts.get(verdict,0)+1
        ev_audits.append({'path':ev['path'],'startLine':ev['startLine'],'endLine':ev['endLine'],'primaryScenario':ev['scenario'],'independentVerdict':verdict,'reason':reason,'assertionStrength':assertion,'snapshotSha256':digest,'snapshotGitBlobSha':bsha,'referencedLinesSha256':sha(excerpt.encode()),'referencedLines':excerpt})
    ref_count+=len(ev_audits)
    disposition='missing-test-blocker' if not direct else 'metadata-only'
    assert disposition==r['disposition'],(pos,disposition,r['disposition'])
    direct_paths=list(dict.fromkeys(e['path'] for e in ev_audits if e['independentVerdict'] in ('direct-producer-branch','mixed-direct-and-conditional-subcases')))
    actual_paths=list(dict.fromkeys(loc['path'] for loc in r['actualProducerLocations']))
    for loc in r['actualProducerLocations']:
        mf=next(f for f in manifest['files'] if f['repositoryPath']==loc['path'])
        data=snapshot_path(mf).read_bytes(); lines=data.decode().splitlines()
        assert 1<=loc['line']<=len(lines) and r['key'] in '\n'.join(lines[max(0,loc['line']-3):min(len(lines),loc['line']+3)]),(pos,loc)
        window='\n'.join(lines[max(0,loc['line']-3):min(len(lines),loc['line']+3)])
        producer_occurrences.append({'sourcePosition':pos,'key':r['key'],'path':loc['path'],'line':loc['line'],'excerpt':loc['excerpt'],'nearbyKeyLiteralVerified':True,'sourceFileSha256':sha(data),'sourceFileGitBlobSha':blob(data),'sourceLineWindowSha256':sha(window.encode())})
    assert sorted(actual_paths)==sorted(r['actualProducerPaths'])
    no_key=[p for p in r['declaredOwners'] if p not in actual_paths]
    missing=[p for p in actual_paths if p not in r['declaredOwners']]
    assert sorted(no_key)==sorted(r['declaredOwnerPathsWithoutThisKey'])
    if pos<=245: owner='declared owners overstate exact producers across api-keys/import/general routes; actualProducerPaths are exact producer literals for this slice'
    else: owner='declared owners include the other service producer path without this key; actualProducerPaths distinguish ArchiveService from ImportManager'
    if pos==243: owner+='; ImportManager producer is absent from declared owners, while unrelated API/general route owners remain'
    ledger.append({'sourcePosition':pos,'key':r['key'],'englishFallback':r['englishFallback'],'placeholders':r['placeholders'],'sourceKind':r['kind'],'primaryDisposition':r['disposition'],'independentDisposition':disposition,'independentConfidence':'high','dispositionRationale':'At least one pinned test reaches an exact producer branch; this row can be closed by adding existing direct test paths to coverage metadata.' if disposition=='metadata-only' else 'No cited test reaches the source catch/guard that emits this key; coverage blocker confirmed.','currentCoverage':r['currentCoverage'],'proposedCoveragePaths':r['proposedCoveragePaths'],'recommendedDirectProducerTestPaths':direct_paths,'producerLocations':r['actualProducerLocations'],'actualProducerPaths':actual_paths,'declaredOwnerPaths':r['declaredOwners'],'declaredOwnerPathsWithoutThisKey':no_key,'actualProducerPathsMissingFromDeclaredOwners':missing,'producerOwnerAssessment':owner,'ownerMetadataConfidence':'moderate: exact producer literals verified at pinned lines; intent of broad owners is not defined in packet schema','testEvidenceAudits':ev_audits,'directProducerEvidenceCount':direct,'sourceCoverageMetadata':r['sourceCoverageMetadata'],'sourceCoveragePositionKeyOwnerCheck':source_key_checks[pos-230]})
assert len(ledger)==23 and ref_count==sum(len(r['testEvidence']) for r in rows)
assert sum(x['independentDisposition']=='metadata-only' for x in ledger)==21 and sum(x['independentDisposition']=='missing-test-blocker' for x in ledger)==2
path_exceptions=[]
for row in ledger:
    extra=sorted(set(row['proposedCoveragePaths'])-set(row['recommendedDirectProducerTestPaths']))
    if extra:path_exceptions.append({'sourcePosition':row['sourcePosition'],'key':row['key'],'proposedPathsThatDoNotReachProducer':extra,'recommendation':'Keep only as secondary consumer/route contract evidence or omit from producer-coverage field.'})
summary={'packet':'QuestarrNG PR #155 source coverage positions 230–252 independent cross-review','repository':repo,'pullRequest':155,'verifiedHead':expected_head,'verifiedTree':expected_tree,'prStateAtStart':before['pullRequest']['state'],'isDraftAtStart':before['pullRequest']['isDraft'],'verifiedAtUtc':utc(),'sourcePositionsReviewed':23,'sourceReferencesIndividuallyReviewed':ref_count,'independentDispositionCounts':{'metadata-only':21,'missing-test-blocker':2},'referenceVerdictCounts':verdict_counts,'sourceCoverageEntryIndexAndKeyMatches':len(source_key_checks),'currentCoverageFieldsEmptyForAll23':all(r['currentCoverage']==[] for r in ledger),'inputManifestFileCount':len(manifest['files']),'allInputHashesMatchedFrozenManifest':True,'allInputSnapshotsByteMatchedLivePinnedTree':True,'producerOwnerAssessment':{'confidence':'moderate for intended owner-field meaning; high for exact producer path/literals listed','finding':'declared owner arrays are not faithful exact producer-path metadata: they include unrelated route files or the other service producer path; position 243 omits ImportManager although it contains two keyed producer sites.','recommendation':'If owners denotes broad feature ownership, document it; otherwise make owners exact producer paths. In either case keep exact producer paths separate.','pathsWithConsumerOnlyProposedEvidence':path_exceptions},'confirmedCoverageGaps':[{'sourcePosition':236,'key':'service.api_failed_to_update_path_mapping','missingBehavior':'PATCH updatePathMapping rejection emits the failure key from the 500 catch.','citedTests':'PATCH success and updatePathMapping undefined (different missing-mapping 404 key).','blocker':'Add a rejected updatePathMapping test and assert the 500 source error.'},{'sourcePosition':243,'key':'service.api_romm_imports_are_disabled','missingBehavior':'Disabled RomM guard at route and ImportManager producer sites.','citedTests':'Only enabled configuration and successful enabled RomM import.','blocker':'Add disabled-config cases for each intended public path.'}],'directEvidenceCaveats':[{'sourcePosition':245,'key':'service.api_invalid_proposed_path','detail':'Encoded and backslash cases allow either keyed rejection or safe-path acceptance, so are conditional alone. The absolute traversal subcase at import_routes_security.test.ts:130–141 and Windows-drive path at import_routes_additional.test.ts:395–405 deterministically reject.'},{'sourcePositions':[246,247,248,249],'detail':'Additional cited route/marker tests manually seed errors or strings and establish downstream propagation only. Each key has a separate direct producer test.'}],'limitations':['Read-only review of pinned source/test content; no tests or runtime execution.','Exact producer locations from packet were checked against frozen file snapshots; no new repository-wide producer scan was run.','PR remains OPEN and isDraft=false; exact requested head/tree are unchanged.'],'confidence':'high for test branch/path decisions and 21/2 classification within cited frozen evidence; moderate for intended semantics of broad owner arrays.','blockers':['Missing producer-branch test evidence at positions 236 and 243.'],'inputChecks':{'entryReviewSha256':sha((inp/'entry-review.jsonl').read_bytes()),'sourceCoverageSha256':sha((inp/'source-coverage.json').read_bytes()),'sourceEvidenceSha256':sha((inp/'source-evidence.jsonl').read_bytes()),'inputManifestSha256':sha((inp/'input-manifest.json').read_bytes()),'inputPacketChecksumsVerified':True}}
(out/'crossreview-ledger.jsonl').write_text(''.join(json.dumps(x,ensure_ascii=False,sort_keys=True)+'\n' for x in ledger))
(out/'producer-occurrences.jsonl').write_text(''.join(json.dumps(x,ensure_ascii=False,sort_keys=True)+'\n' for x in producer_occurrences))
(out/'source-position-index-check.json').write_text(json.dumps({'sourceCoverageEntryIndexKeyChecks':source_key_checks,'producerLiteralOccurrenceCount':len(producer_occurrences),'uniqueProducerPaths':sorted(set(x['path'] for x in producer_occurrences))},ensure_ascii=False,indent=2,sort_keys=True)+'\n')
(out/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2,sort_keys=True)+'\n')
(out/'README.md').write_text(f'''# QuestarrNG PR #155 source-coverage cross-review (positions 230–252)\n\nRead-only independent review of the frozen primary packet at commit `{expected_head}` / tree `{expected_tree}`.\n\n## Result\n\n- Reviewed 23 source positions and {ref_count} cited test references.\n- Confirmed 21 metadata-only classifications: each has at least one cited test reaching an exact producer/error branch.\n- Confirmed 2 missing-test blockers: position 236 (update mapping failure) and position 243 (RomM disabled guard).\n- Proposed path associations at positions 246–249 include downstream contract tests that do not execute the source producer; the ledger distinguishes these from direct producer tests.\n- Position 245 includes conditional traversal cases; deterministic absolute traversal and Windows-drive rejection cases provide direct evidence.\n- Declared owner paths are broad or mismatched for this slice. Position 243 also omits the actual `ImportManager.ts` producer.\n\n## Pin and limits\n\nPR #155 is OPEN at the exact reviewed head/tree; `isDraft=false`. All {len(manifest['files'])} frozen input snapshots match manifest hashes and pinned tree bytes. The original input packet checksum manifest passed. No tests, builds, scans, CI, browser work, or repository/PR edits were made.\n\nConfidence is high for test-path verdicts and 21/2 classification within cited evidence; confidence is moderate for the intended semantics of broad `owners` metadata. Coverage gaps at positions 236 and 243 remain blockers.\n\n`crossreview-ledger.jsonl` contains per-position and per-reference verdicts, exact lines, and hashes. `producer-occurrences.jsonl` records the cited producer literals. `attestation-before.json` and `attestation-after.json` record live PR/tree and frozen-input checks.\n''')
after=attest('after-cross-review')
(out/'attestation-after.json').write_bytes(canon(after)+b'\n')
assert before['worktreeStatusShort']==after['worktreeStatusShort']=='?? docs/pr-evidence/pr155-localization-2026-11-02/source-test-reference-audit/'
files=sorted(x for x in out.iterdir() if x.is_file() and x.name!='SHA256SUMS')
(out/'SHA256SUMS').write_text(''.join(f'{sha(x.read_bytes())}  {x.name}\n' for x in files))
subprocess.check_call(['sha256sum','-c','SHA256SUMS'],cwd=out)
print(json.dumps({'output':str(out),'files':[x.name for x in sorted(out.iterdir()) if x.is_file()],'positions':len(ledger),'references':ref_count,'referenceVerdicts':verdict_counts,'metadataOnly':21,'blockers':2,'pr':before['pullRequest'],'exactTree':before['worktreeTree'],'inputSnapshotsMatchLiveHead':before['allInputSnapshotsMatchLiveHead'],'checksumVerified':True},indent=2))
