#!/usr/bin/env python3
"""
Build one CSV per league containing only matches where BOTH TEAMS SCORED
IN BOTH HALVES (BTTS in 1st half AND BTTS in 2nd half).

Source: openfootball/football.json (local clone at /home/z/my-project/data/football.json)

Qualifying condition (per match, using 90-minute score):
  1H BTTS: ht[0] > 0 AND ht[1] > 0
  2H BTTS: (ft[0] - ht[0]) > 0 AND (ft[1] - ht[1]) > 0

Output: /home/z/my-project/download/btts_both_halves/<code>_btts_both_halves.csv
Columns: season, league, date, time, round, home, away, ht_score, ft_score
Sorting: oldest first (chronological season order, then date, then time)
"""
import argparse
import csv
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

DEFAULT_SRC = Path('/home/z/my-project/data/football.json')
DEFAULT_OUT = Path('/home/z/my-project/download/btts_both_halves')

SEASON_START_RE = re.compile(r'^(\d{4})')


def season_sort_key(name: str):
    """Chronological key for season labels: '2010-11' -> 2010, '2019' -> 2019."""
    m = SEASON_START_RE.match(name)
    return (int(m.group(1)) if m else 9999, name)


def clean_league_name(name: str) -> str:
    """'English Premier League 2025/26' -> 'English Premier League'."""
    name = re.sub(r'\s+\d{4}(/\d{2,4})?(-\d{2,4})?\s*$', '', name).strip()
    return name


def run(src, out):
    """Write one qualifying-match CSV per league into `out` from source `src`."""
    src = Path(src)
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    rows_by_league = defaultdict(list)
    seen = defaultdict(set)  # league code -> {(date, team1, team2, round)}
    stats = defaultdict(lambda: {'played': 0, 'no_ht': 0, 'btts2h': 0})
    names_by_league = {}     # code -> (season_sort_key, display name)
    files_read = 0
    parse_errors = 0

    season_dirs = [d for d in src.iterdir()
                   if d.is_dir() and SEASON_START_RE.match(d.name)]
    season_dirs.sort(key=lambda d: season_sort_key(d.name))

    for season_dir in season_dirs:
        season = season_dir.name
        # Prefer -full.json variants (superset, same matches + extra detail);
        # skip the plain file for any code that has a -full variant to avoid
        # cross-variant duplicates (they differ in team/round naming).
        full_codes = {p.name.replace('-full.json', '')
                      for p in season_dir.glob('*-full.json')}
        for jf in sorted(season_dir.glob('*.json')):
            base = jf.name.replace('.json', '').replace('-full', '')
            if '-full' not in jf.name and base in full_codes:
                continue
            code = base
            try:
                data = json.loads(jf.read_text(encoding='utf-8'))
            except Exception as e:
                print(f'WARN: cannot parse {jf}: {e}', file=sys.stderr)
                parse_errors += 1
                continue
            files_read += 1

            lg_name = clean_league_name(data.get('name', '') or '')
            skey = season_sort_key(season)
            if code not in names_by_league or skey > names_by_league[code][0]:
                names_by_league[code] = (skey, lg_name)

            for m in data.get('matches', []):
                key = (m.get('date', ''), m.get('team1', ''),
                       m.get('team2', ''), m.get('round', ''))
                if key in seen[code]:
                    continue  # -full.json duplicate of the regular file
                seen[code].add(key)

                s = m.get('score')
                ft = ht = None
                if isinstance(s, dict):
                    ft, ht = s.get('ft'), s.get('ht')
                elif isinstance(s, list) and len(s) == 2:
                    ft = s          # compact FT-only form, HT unknown
                st = stats[code]
                if not ft or len(ft) != 2:
                    continue                      # fixture / unplayed
                if not ht or len(ht) != 2:
                    st['no_ht'] += 1              # HT not recorded -> cannot evaluate
                    continue
                st['played'] += 1

                h1, a1 = int(ht[0]), int(ht[1])
                hF, aF = int(ft[0]), int(ft[1])
                h2, a2 = hF - h1, aF - a1

                if h1 > 0 and a1 > 0 and h2 > 0 and a2 > 0:
                    st['btts2h'] += 1
                    rows_by_league[code].append({
                        'season': season,
                        'league': lg_name,
                        'date': m.get('date', '') or '',
                        'time': m.get('time', '') or '',
                        'round': m.get('round', '') or '',
                        'home': m.get('team1', '') or '',
                        'away': m.get('team2', '') or '',
                        'ht_score': f'{h1}-{a1}',
                        'ft_score': f'{hF}-{aF}',
                    })

    # Chronological ordering of the season labels actually present
    all_seasons = {r['season'] for rows in rows_by_league.values() for r in rows}
    season_rank = {sn: i for i, sn in
                   enumerate(sorted(all_seasons, key=season_sort_key))}

    for code, rows in rows_by_league.items():
        rows.sort(key=lambda r: (season_rank[r['season']],
                                 r['date'] or '9999-99-99',
                                 r['time'] or ''))

    # Write one CSV per league (header-only file if zero qualifying matches)
    fieldnames = ['season', 'league', 'date', 'time', 'round',
                  'home', 'away', 'ht_score', 'ft_score']
    summary = []
    for code in sorted(set(stats) | set(rows_by_league)):
        rows = rows_by_league.get(code, [])
        fname = f'{code}_btts_both_halves.csv'
        with open(out / fname, 'w', newline='', encoding='utf-8-sig') as f:
            w = csv.DictWriter(f, fieldnames=fieldnames)
            w.writeheader()
            w.writerows(rows)
        st = stats[code]
        pct = (100.0 * st['btts2h'] / st['played']) if st['played'] else 0.0
        display = names_by_league.get(code, ((0, ''), code))[1]
        summary.append([code, display, st['played'], st['no_ht'],
                        st['btts2h'], f'{pct:.1f}%', fname])

    with open(out / '_summary.csv', 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.writer(f)
        w.writerow(['league_code', 'league', 'matches_evaluated',
                    'excluded_no_ht_score', 'btts_both_halves_matches',
                    'btts_both_halves_pct', 'file'])
        w.writerows(summary)

    # Console report
    print(f'Season folders: {len(season_dirs)} | JSON files read: {files_read} '
          f'| parse errors: {parse_errors}')
    print(f'Leagues: {len(summary)} | Output dir: {out}')
    print()
    hdr = f'{"code":<9}{"league":<34}{"eval":>7}{"noHT":>7}{"BTTS2H":>8}{"pct":>8}  file'
    print(hdr)
    print('-' * len(hdr))
    tot_eval = tot_btts = 0
    for code, display, played, no_ht, btts, pct, fname in summary:
        tot_eval += played
        tot_btts += btts
        print(f'{code:<9}{display[:33]:<34}{played:>7}{no_ht:>7}{btts:>8}{pct:>8}  {fname}')
    print('-' * len(hdr))
    overall = (100.0 * tot_btts / tot_eval) if tot_eval else 0.0
    print(f'TOTAL evaluated: {tot_eval} | BTTS-both-halves: {tot_btts} ({overall:.1f}%)')


def main():
    ap = argparse.ArgumentParser(description='BTTS-both-halves CSV builder')
    ap.add_argument('--src', default=str(DEFAULT_SRC),
                    help='path to an openfootball/football.json working clone')
    ap.add_argument('--out', default=str(DEFAULT_OUT),
                    help='output directory for the per-league CSVs')
    args = ap.parse_args()
    run(Path(args.src), Path(args.out))


if __name__ == '__main__':
    main()
