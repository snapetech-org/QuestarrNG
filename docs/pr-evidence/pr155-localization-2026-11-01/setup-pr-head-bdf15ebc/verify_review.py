#!/usr/bin/env python3
"""Verify pinned QuestarrNG setup-review evidence; optionally repeat the exact-target scan."""
import argparse
import collections
import hashlib
import json
import struct
import subprocess
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve()
BUNDLE = HERE.parent
REPO = next(p for p in HERE.parents if (p / '.git').exists())
BASE_HEAD = '6f592afae749d2ad9fa82a9807f7e992ead81e10'
REVIEW_HEAD = 'bdf15ebc8f19ea0d88a0fc6f007c46f7f9a7a845'
REVIEW_TREE = '0c8f45596655ebe1546a3d82f584663c7da30910'
LOCALES = ['es', 'zh-Hans', 'hi', 'de', 'ja', 'fr', 'pt-BR', 'ar', 'ko', 'zh-Hant', 'vi', 'id']
TERMINAL = {'accepted', 'corrected', 'keep'}


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def git_bytes(spec):
    return subprocess.check_output(['git', 'show', spec], cwd=REPO)


def verify_checksums():
    sums = BUNDLE / 'SHA256SUMS'
    if not sums.is_file():
        raise SystemExit('missing SHA256SUMS')
    seen = set()
    for line in sums.read_text(encoding='utf-8').splitlines():
        digest, name = line.split('  ', 1)
        path = BUNDLE / name
        if not path.is_file() or sha(path.read_bytes()) != digest:
            raise SystemExit(f'checksum mismatch or missing file: {name}')
        seen.add(name)
    expected = {p.name for p in BUNDLE.iterdir() if p.is_file() and p.name != 'SHA256SUMS'}
    if seen != expected:
        raise SystemExit(f'SHA256SUMS file set differs: missing={sorted(expected-seen)}, extra={sorted(seen-expected)}')


def verify_pins():
    manifest = json.loads((BUNDLE / 'manifest.json').read_text(encoding='utf-8'))
    if manifest['review_head'] != REVIEW_HEAD or manifest['review_tree'] != REVIEW_TREE:
        raise SystemExit('manifest review head/tree differs from verifier pins')
    tree = subprocess.check_output(['git', 'rev-parse', f'{REVIEW_HEAD}^{{tree}}'], cwd=REPO, text=True).strip()
    if tree != REVIEW_TREE:
        raise SystemExit(f'review tree mismatch: {tree}')
    for path, expected in manifest['code_file_sha256'].items():
        if sha(git_bytes(f'{REVIEW_HEAD}:{path}')) != expected:
            raise SystemExit(f'code file hash mismatch: {path}')
    messages_raw = git_bytes(f'{REVIEW_HEAD}:localization/messages.json')
    labels_raw = git_bytes(f'{REVIEW_HEAD}:client/src/lib/ui-labels.ts')
    if (sha(messages_raw) != manifest['direct_catalog']['catalog_sha256'] or
            sha(labels_raw) != manifest['direct_catalog']['generated_labels_sha256']):
        raise SystemExit('catalog/generated-label hash mismatch')
    current = json.loads(messages_raw)['messages']
    if len(current) * len(LOCALES) != 31080:
        raise SystemExit('direct catalog cell count differs from manifest')
    for mid, item in current.items():
        for locale in LOCALES:
            value = item.get('translations', {}).get(locale)
            if not isinstance(value, str) or not value:
                raise SystemExit(f'blank or missing direct target: {locale}:{mid}')
    base = json.loads(git_bytes(f'{BASE_HEAD}:localization/messages.json'))['messages']
    rows = [json.loads(line) for line in (BUNDLE / 'review-addendum.jsonl').read_text(encoding='utf-8').splitlines() if line]
    if len(rows) != 5:
        raise SystemExit(f'expected 5 per-cell decisions; found {len(rows)}')
    expected_cells = {
        'ko:navigation.discover', 'ja:navigation.browse',
        'id:interface.game_management_b1319076',
        'ja:interface.at_least_8_characters_including_on_2a6832ca',
        'id:interface.igdb_credentials_are_required_to_d_db32487d',
    }
    if {r['cell_id'] for r in rows} != expected_cells:
        raise SystemExit('addendum cell set differs from the five reviewed dispositions')
    for row in rows:
        source_id, locale = row['source_id'], row['locale']
        entry = current[source_id]
        source, target = entry['source'], entry['translations'][locale]
        if source != row['source'] or sha(source.encode()) != row['source_sha256']:
            raise SystemExit(f'source pin mismatch: {row["cell_id"]}')
        if target != row['target'] or sha(target.encode()) != row['target_sha256']:
            raise SystemExit(f'current target pin mismatch: {row["cell_id"]}')
        if row['status'] == 'corrected':
            old = base[source_id]['translations'][locale]
            if old != row['previous_target'] or sha(old.encode()) != row['previous_target_sha256']:
                raise SystemExit(f'previous target pin mismatch: {row["cell_id"]}')
        for shot in row.get('screenshots', []):
            raw = (BUNDLE / shot['file']).read_bytes()
            if sha(raw) != shot['sha256'] or raw[:8] != b'\x89PNG\r\n\x1a\n':
                raise SystemExit(f'screenshot hash or format mismatch: {shot["file"]}')
            if list(struct.unpack('>II', raw[16:24])) != [shot['width'], shot['height']]:
                raise SystemExit(f'screenshot dimensions mismatch: {shot["file"]}')
    report = json.loads((BUNDLE / 'prior-coverage-report.json').read_text(encoding='utf-8'))
    report_hash = sha((BUNDLE / 'prior-coverage-report.json').read_bytes())
    if report_hash != manifest['prior_review_reconciliation']['report_sha256']:
        raise SystemExit('prior-coverage report hash differs from manifest')
    if (report['base_head'] != BASE_HEAD or report['direct_message_ids'] != 2590 or
            report['direct_cells'] != 31080 or report['prior_exact_terminal_coverage_cells'] != 31077 or
            report['eligible_uncovered_cells_for_disjoint_25_key_batch'] != 3):
        raise SystemExit('stored prior-coverage report differs from documented counts')
    dup = json.loads((BUNDLE / 'password-prior-review-duplicates.json').read_text(encoding='utf-8'))
    if (dup['matched_artifact_record_count'], dup['distinct_artifact_paths'], dup['distinct_review_rows']) != (54, 54, 1):
        raise SystemExit('password duplicate-row reconciliation differs from documented counts')
    print('PASS: checksums, exact head/tree, seven code/catalog hashes, five per-cell decisions, screenshots, coverage report, duplicate reconciliation')


def outcome(row):
    return str(row.get('review_outcome') or row.get('outcome') or row.get('status') or '').strip().lower().replace('-', '_').replace(' ', '_')


def targets(row):
    fields = ('input_target_value', 'target', 'target_value', 'reviewed_target_value', 'corrected_target_value', 'new_target_value', 'final_target_value', 'old_target_value', 'current_target_value')
    return {row[name] for name in fields if isinstance(row.get(name), str)}


def reproduce_scan(prior_root):
    messages = json.loads(git_bytes(f'{BASE_HEAD}:localization/messages.json'))['messages']
    cells = {}
    for mid, row in messages.items():
        for locale in LOCALES:
            target = row.get('translations', {}).get(locale)
            if not isinstance(target, str) or not target:
                raise SystemExit(f'blank or missing direct target {locale}:{mid}')
            source = row['source']
            cells[(mid, locale)] = (source, target)
    files, counts, covered = set(), collections.Counter(), set()
    row_count = source_match_rows = exact_rows = 0
    digest = hashlib.sha256()
    with tempfile.NamedTemporaryFile('w', encoding='utf-8', newline='\n', dir=BUNDLE, prefix='.review-ids-', suffix='.txt') as pattern:
        pattern.write('\n'.join(sorted(messages)) + '\n')
        pattern.flush()
        command = ['rg', '--json', '-n', '-F', '--sort', 'path', '-f', pattern.name, '--glob', 'semantic-review-*.jsonl', str(prior_root)]
        proc = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, encoding='utf-8')
        assert proc.stdout is not None
        for event_line in proc.stdout:
            event = json.loads(event_line)
            if event.get('type') != 'match':
                continue
            info = event['data']
            line = info['lines']['text'].rstrip('\n')
            row = json.loads(line)
            mid = row.get('message_id') or row.get('source_id') or row.get('id')
            locale = row.get('locale')
            key = (mid, locale)
            if key not in cells:
                continue
            row_count += 1
            rel = Path(info['path']['text']).relative_to(prior_root).as_posix()
            files.add(rel)
            current_source, current_target = cells[key]
            source_matches = row.get('source_value', row.get('source')) == current_source
            source_match_rows += int(source_matches)
            disposition = outcome(row)
            counts[disposition or '<missing>'] += 1
            if disposition in TERMINAL and source_matches and current_target in targets(row):
                covered.add(key)
                exact_rows += 1
            digest.update(rel.encode() + b'\0' + str(info['line_number']).encode('ascii') + b'\0' + line.encode() + b'\n')
        proc.stdout.close()
        status = proc.wait()
        if status not in (0, 1):
            raise SystemExit(f'rg failed with {status}')
    gaps = []
    for mid, locale in sorted(set(cells) - covered):
        source, target = cells[(mid, locale)]
        gaps.append({'cell_id': f'{locale}:{mid}', 'source_id': mid, 'locale': locale,
                     'source_sha256': sha(source.encode()), 'target_raw_utf8_sha256': sha(target.encode())})
    actual = {
        'base_head': BASE_HEAD, 'direct_message_ids': len(messages), 'direct_locales': LOCALES,
        'direct_cells': len(cells), 'semantic_review_files_with_matching_rows': len(files),
        'matching_review_rows_for_current_ids': row_count, 'rows_with_exact_source_value': source_match_rows,
        'exact_terminal_disposition_rows': exact_rows, 'outcome_counts': dict(sorted(counts.items())),
        'prior_exact_terminal_coverage_cells': len(covered), 'prior_exact_terminal_coverage_sha256': digest.hexdigest(),
        'uncovered_cells': gaps, 'eligible_uncovered_cells_for_disjoint_25_key_batch': len(gaps),
        'eligible_uncovered_source_keys': sorted({g['source_id'] for g in gaps}),
        'semantic_review_files': sorted(files),
        'scan_method': 'ripgrep --json -n -F --sort path -f <direct-message-ids> --glob semantic-review-*.jsonl; match requires same message ID, locale, source text, exact raw target, and terminal outcome accepted/corrected/keep',
    }
    expected = json.loads((BUNDLE / 'prior-coverage-report.json').read_text(encoding='utf-8'))
    if actual != expected:
        raise SystemExit('prior-coverage report differs from full rescan')
    print('PASS: full exact-target scan reproduces prior-coverage-report.json')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--verify', action='store_true', help='verify checksums and pinned review evidence')
    parser.add_argument('--rescan-prior', type=Path, metavar='PATH', help='also repeat the full scan against retained semantic-review artifacts')
    args = parser.parse_args()
    if not args.verify and args.rescan_prior is None:
        parser.error('choose --verify and/or --rescan-prior PATH')
    if args.verify:
        verify_checksums()
        verify_pins()
    if args.rescan_prior is not None:
        reproduce_scan(args.rescan_prior)


if __name__ == '__main__':
    main()
