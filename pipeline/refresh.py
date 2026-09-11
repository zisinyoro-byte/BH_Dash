#!/usr/bin/env python3
"""
End-to-end data refresh for the BTTS-both-halves dashboard.

Pipeline (pure Python, stdlib only):
  1. upstream source : an openfootball/football.json working clone (--src)
  2. csv/            : one qualifying-matches CSV per league   (btts_csv.py)
  3. data.json       : compact aggregates + packed history     (prep_data.py)
  4. index.html      : single-file dashboard                   (build.py)

The output is deterministic for a given source revision — the 'generated'
stamp comes from the upstream HEAD commit (date + short SHA), not the build
clock — so a scheduled run against an unchanged source produces
byte-identical files and commits nothing. When openfootball pushes new
results, the rebuild changes and the caller (GitHub Actions) commits +
pushes, which redeploys GitHub Pages automatically.
"""
import argparse
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
# repo pipeline/ layout: all modules side by side; sandbox layout: btts_csv
# lives one level above the dashboard scripts
for p in (str(HERE), str(HERE.parent)):
    if p not in sys.path:
        sys.path.insert(0, p)

import btts_csv          # noqa: E402
import build             # noqa: E402
import prep_data         # noqa: E402


def upstream_info(src):
    """(short SHA, ISO date) of the source clone's HEAD commit."""
    out = subprocess.run(
        ['git', '-C', str(src), 'log', '-1', '--format=%h %cI'],
        capture_output=True, text=True, check=True).stdout.strip()
    sha7, iso = out.split()
    return sha7, iso[:10]


def main():
    ap = argparse.ArgumentParser(description='Refresh the dashboard from upstream')
    ap.add_argument('--src', required=True,
                    help='path to an openfootball/football.json working clone')
    ap.add_argument('--repo', default='.',
                    help='dashboard repo root (expects pipeline/, csv/, index.html)')
    ap.add_argument('--cutoff', default=None,
                    help='fixture cutoff override (default: derived from source)')
    args = ap.parse_args()

    src, repo = Path(args.src).resolve(), Path(args.repo).resolve()
    seasons = [d.name for d in src.iterdir()
               if d.is_dir() and d.name[:2] == '20']
    if not seasons:
        raise SystemExit(f'ERROR: {src} does not look like an '
                         'openfootball/football.json clone (no 20xx season dirs)')

    sha7, cdate = upstream_info(src)
    print(f'upstream HEAD: {sha7} ({cdate}) | season dirs: {len(seasons)}')

    csv_dir = repo / 'csv'
    csv_dir.mkdir(parents=True, exist_ok=True)

    print('\n[1/3] qualifying-match CSVs ...')
    btts_csv.run(src, csv_dir)

    print('\n[2/3] data.json ...')
    with tempfile.TemporaryDirectory() as tmp:
        data_json = Path(tmp) / 'data.json'
        prep_data.run(src, csv_dir, data_json,
                      stamp_date=cdate, stamp_sha=sha7, cutoff=args.cutoff)

        print('\n[3/3] index.html ...')
        build.run(HERE, data_json, repo / 'index.html')

    print(f'\nrefresh complete — data as of {cdate} (source commit {sha7})')
    print('if index.html/csv changed vs the committed versions, the caller '
          'should commit + push so GitHub Pages redeploys.')


if __name__ == '__main__':
    main()
