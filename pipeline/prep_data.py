#!/usr/bin/env python3
"""
Prepare compact JSON for the BTTS-both-halves dashboard.

Inputs:
  - /home/z/my-project/download/btts_both_halves/*.csv  (validated deliverable CSVs)
  - /home/z/my-project/data/football.json/20*/          (source scan for per-season
    evaluated denominators, using the same -full-preference rule as btts_csv.py)

Output: /home/z/my-project/scripts/dashboard/data.json
"""
import argparse
import csv
import json
import re
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

DEFAULT_SRC = Path('/home/z/my-project/data/football.json')
DEFAULT_CSV = Path('/home/z/my-project/download/btts_both_halves')
DEFAULT_OUT = Path('/home/z/my-project/scripts/dashboard/data.json')

SEASON_START_RE = re.compile(r'^(\d{4})')
ALIAS_SUFFIXES = ('afc', 'fc', 'cf', 'sc', 'sk', 'bk', 'if')

DATE_RE = re.compile(r'^\d{4}-\d{2}-\d{2}$')


def _norm_key(name):
    """Normalize a club name for variant grouping (Unicode-aware).

    Merges spelling variants such as 'Manchester United' / 'Manchester United FC'
    and 'sc Heerenveen' / 'SC Heerenveen'. Falls back to the plain lowercased
    name when the stripped key would be degenerate (short or non-Latin scripts
    are preserved, so unrelated names can never collide)."""
    base = re.sub(r'\s+', ' ', re.sub(r'[^\w ]', ' ', name.lower())).strip()
    if len(base) < 3:
        return base
    while True:
        for suf in ALIAS_SUFFIXES:
            if base.endswith(' ' + suf):
                base = base[: -(len(suf) + 1)].strip()
                break
        else:
            return base


def build_alias_maps(allm):
    """alias[code][raw_name] = canonical_name.

    Canonical spelling = the most frequent variant within the league
    (longest wins on ties), so 'Manchester United' (418 matches) wins over
    'Manchester United FC' (228)."""
    alias = {}
    for code, am in allm.items():
        cnt = defaultdict(int)
        for row in am:
            cnt[row[2]] += 1
            cnt[row[3]] += 1
        groups = defaultdict(list)
        for n in cnt:
            groups[_norm_key(n)].append(n)
        cmap = {}
        for members in groups.values():
            best = max(members, key=lambda n: (cnt[n], len(n), n))
            for n in members:
                cmap[n] = best
        alias[code] = cmap
    return alias


def season_sort_key(name):
    m = SEASON_START_RE.match(name)
    return (int(m.group(1)) if m else 9999, name)


def season_index(src):
    """Global chronological ordering of all season labels found in source."""
    labels = {d.name for d in Path(src).iterdir() if d.is_dir()
              and SEASON_START_RE.match(d.name)}
    return {s: i for i, s in enumerate(sorted(labels, key=season_sort_key))}


def max_played_date(src):
    """Latest date across the source that has a full-time score recorded.

    Used to derive the fixture cutoff: upcoming fixtures must be dated after
    the last known result, so postponed/unscored matches from finished rounds
    are excluded while genuine future fixtures are kept. Deriving the cutoff
    from the source (instead of the build clock) keeps the output
    deterministic for a given source revision."""
    latest = None
    for sdir in Path(src).iterdir():
        if not sdir.is_dir() or not SEASON_START_RE.match(sdir.name):
            continue
        for jf in sdir.glob('*.json'):
            try:
                data = json.loads(jf.read_text(encoding='utf-8'))
            except Exception:
                continue
            for m in data.get('matches', []):
                sc = m.get('score')
                dt = m.get('date', '') or ''
                if (isinstance(sc, dict) and sc.get('ft')
                        and DATE_RE.match(dt)):
                    if latest is None or dt > latest:
                        latest = dt
    return latest


def fixture_cutoff(src, cutoff=None):
    """Resolve the fixture cutoff date (YYYY-MM-DD string).

    Default: day after the last match with a recorded FT score in the source,
    so today's in-progress/unscored matches stay listed as fixtures until the
    result lands."""
    if cutoff:
        return cutoff
    latest = max_played_date(src)
    if latest is None:
        return date.today(timezone.utc).isoformat()
    d = datetime.strptime(latest, '%Y-%m-%d').date() + timedelta(days=1)
    return d.isoformat()


def scan_evaluated(src):
    """evaluated[(code, season)] = matches with HT+FT recorded (denominator)."""
    evaluated = defaultdict(int)
    for sdir in Path(src).iterdir():
        if not sdir.is_dir() or not SEASON_START_RE.match(sdir.name):
            continue
        full_codes = {p.name.replace('-full.json', '')
                      for p in sdir.glob('*-full.json')}
        for jf in sdir.glob('*.json'):
            base = jf.name.replace('.json', '').replace('-full', '')
            if '-full' not in jf.name and base in full_codes:
                continue
            try:
                data = json.loads(jf.read_text(encoding='utf-8'))
            except Exception:
                continue
            n = 0
            for m in data.get('matches', []):
                s = m.get('score')
                if (isinstance(s, dict) and isinstance(s.get('ht'), list)
                        and len(s['ht']) == 2 and isinstance(s.get('ft'), list)
                        and len(s['ft']) == 2):
                    n += 1
            evaluated[(base, sdir.name)] = n
    return evaluated


def scan_all_matches(src):
    """Per league code: every match with a valid FT score (90-minute basis),
    using the same -full-preference rule as scan_evaluated / btts_csv.py.

    Returns allm[code] = set of (season, date, team1, team2, ht0, ht1, ft0, ft1)
    where ht0/ht1 == -1 when the half-time score is unknown.
    """
    allm = defaultdict(set)
    for sdir in Path(src).iterdir():
        if not sdir.is_dir() or not SEASON_START_RE.match(sdir.name):
            continue
        # pick one file per base code, preferring the -full variant
        files = {}
        for jf in sdir.glob('*.json'):
            base = jf.name.replace('.json', '').replace('-full', '')
            is_full = '-full' in jf.name
            cur = files.get(base)
            if cur is None or (is_full and not cur[1]):
                files[base] = (jf, is_full)
        for base, (jf, _is_full) in files.items():
            try:
                data = json.loads(jf.read_text(encoding='utf-8'))
            except Exception:
                continue
            season = sdir.name
            for m in data.get('matches', []):
                sc = m.get('score')
                if not (isinstance(sc, dict) and isinstance(sc.get('ft'), list)
                        and len(sc['ft']) == 2):
                    continue
                t1, t2 = m.get('team1'), m.get('team2')
                if not t1 or not t2:
                    continue
                ht = sc.get('ht')
                if isinstance(ht, list) and len(ht) == 2:
                    h0, h1 = int(ht[0]), int(ht[1])
                else:
                    h0 = h1 = -1
                allm[base].add((season, m.get('date', '') or '', t1, t2,
                                h0, h1, int(sc['ft'][0]), int(sc['ft'][1])))
    return allm


def scan_fixtures(src, cutoff):
    """Per league code: scheduled matches without a score, dated >= cutoff
    (same -full-preference rule as scan_all_matches).

    Returns fxm[code] = set of (season, date, team1, team2, round)."""
    fxm = defaultdict(set)
    for sdir in Path(src).iterdir():
        if not sdir.is_dir() or not SEASON_START_RE.match(sdir.name):
            continue
        files = {}
        for jf in sdir.glob('*.json'):
            base = jf.name.replace('.json', '').replace('-full', '')
            is_full = '-full' in jf.name
            cur = files.get(base)
            if cur is None or (is_full and not cur[1]):
                files[base] = (jf, is_full)
        for base, (jf, _is_full) in files.items():
            try:
                data = json.loads(jf.read_text(encoding='utf-8'))
            except Exception:
                continue
            season = sdir.name
            for m in data.get('matches', []):
                sc = m.get('score')
                if isinstance(sc, dict) and sc.get('ft'):
                    continue
                t1, t2 = m.get('team1'), m.get('team2')
                dt = m.get('date', '') or ''
                if not t1 or not t2 or not dt or dt < cutoff:
                    continue
                fxm[base].add((season, dt, t1, t2, str(m.get('round', '') or '')))
    return fxm


def attach_all_matches(leagues, allm, fxm, alias):
    """Pack full per-league match history into compact ';'-joined rows:
    seasonIdx,homeIdx,awayIdx,ht0,ht1,ft0,ft1,date   (ht == -1 when unknown).
    Team/season names live in plain JSON arrays, so no separator escaping is
    needed inside the packed strings. Team names are canonicalized via the
    league alias map first.

    Additionally packs upcoming fixtures (scan_fixtures) as
    seasonIdx,homeIdx,awayIdx,date,round — appending fixture-only teams
    (e.g. newly promoted clubs) and season labels to the shared arrays."""
    packed = 0
    merged_variants = 0
    for code, L in leagues.items():
        am = allm.get(code)
        if not am:
            print(f'  WARN {code}: no source matches found for team-focus data')
            continue
        cmap = alias.get(code, {})
        merged_variants += sum(1 for n in cmap if n != cmap[n])
        amc = {(s, d, cmap.get(t1, t1), cmap.get(t2, t2), h0, h1, f0, f1)
               for (s, d, t1, t2, h0, h1, f0, f1) in am}
        teams = sorted({t for (_s, _d, t, _a, *_r) in amc} |
                       {t for (_s, _d, _h, t, *_r) in amc})
        slabels = sorted({s for (s, *_r) in amc}, key=season_sort_key)
        sidx = {s: i for i, s in enumerate(slabels)}
        tidx = {t: i for i, t in enumerate(teams)}
        rows = []
        for (sn, date, t1, t2, h0, h1, f0, f1) in sorted(
                amc, key=lambda x: (sidx[x[0]], x[1], x[2], x[3])):
            rows.append('%d,%d,%d,%d,%d,%d,%d,%s' % (
                sidx[sn], tidx[t1], tidx[t2], h0, h1, f0, f1, date))

        # ── upcoming fixtures ──
        fxc = fxm.get(code) or set()
        canon = {}
        for (sn, dt, t1, t2, _r) in fxc:
            canon[(t1, t2)] = (cmap.get(t1, t1), cmap.get(t2, t2))
        added_teams = 0
        # sorted iteration: team indices must not depend on set/hash order
        for _k, (c1, c2) in sorted(canon.items()):
            for c in (c1, c2):
                if c not in tidx:
                    tidx[c] = len(teams)
                    teams.append(c)
                    added_teams += 1
        added_seasons = 0
        for (sn, *_r) in fxc:
            if sn not in sidx:
                slabels.append(sn)
                added_seasons += 1
        if added_seasons:
            slabels.sort(key=season_sort_key)
            sidx = {s: i for i, s in enumerate(slabels)}
        frows = []
        for (sn, dt, t1, t2, rnd) in sorted(
                fxc, key=lambda x: (x[1], canon[(x[2], x[3])])):
            c1, c2 = canon[(t1, t2)]
            rnd = rnd.replace(',', ' ').strip()[:28]
            frows.append('%d,%d,%d,%s,%s' % (sidx[sn], tidx[c1], tidx[c2], dt, rnd))

        L['all'] = {'seasons': slabels, 'teams': teams, 'm': ';'.join(rows),
                    'fx': ';'.join(frows)}
        if frows:
            print(f'  {code}: {len(frows)} upcoming fixtures '
                  f'({added_teams} new teams, {added_seasons} new season labels)')
        packed += len(rows)
    return packed, merged_variants


def build_matrix(matches):
    """HT score (x) vs FT score (y) heatmap buckets: top-N + Other."""
    ht_freq = defaultdict(int)
    ft_freq = defaultdict(int)
    pair_freq = defaultdict(int)
    for m in matches:
        ht, ft = m[6], m[7]
        ht_freq[ht] += 1
        ft_freq[ft] += 1
        pair_freq[(ht, ft)] += 1

    top_ht = [k for k, _ in sorted(ht_freq.items(),
                                   key=lambda kv: (-kv[1], kv[0]))][:8]
    top_ft = [k for k, _ in sorted(ft_freq.items(),
                                   key=lambda kv: (-kv[1], kv[0]))][:10]
    ht_labels = top_ht + (['Other'] if len(ht_freq) > 8 else [])
    ft_labels = top_ft + (['Other'] if len(ft_freq) > 10 else [])
    hti = {k: i for i, k in enumerate(top_ht)}
    fti = {k: i for i, k in enumerate(top_ft)}
    hi_other, fi_other = len(top_ht), len(top_ft)

    data = defaultdict(int)
    for (ht, ft), c in pair_freq.items():
        x = hti.get(ht, hi_other)
        y = fti.get(ft, fi_other)
        data[(x, y)] += c
    return {
        'ht': ht_labels,
        'ft': ft_labels,
        'data': [[x, y, c] for (x, y), c in data.items()],
    }


def run(src, csv_dir, out, stamp_date=None, stamp_sha=None, cutoff=None):
    """Build the compact dashboard JSON.

    src        : openfootball/football.json working clone
    csv_dir    : directory with <code>_btts_both_halves.csv files (btts_csv.run)
    out        : output data.json path
    stamp_date : 'generated' stamp (defaults to build date when None)
    stamp_sha  : upstream source commit (defaults to 'local' when None)
    cutoff     : fixture cutoff override (defaults to derived-from-source)
    """
    src = Path(src)
    csv_dir = Path(csv_dir)
    out = Path(out)
    srank = season_index(src)
    cutoff = fixture_cutoff(src, cutoff)
    evaluated = scan_evaluated(src)
    allm = scan_all_matches(src)
    fxm = scan_fixtures(src, cutoff)
    alias = build_alias_maps(allm)

    leagues = {}
    for csv_file in sorted(csv_dir.glob('*_btts_both_halves.csv')):
        code = csv_file.name.replace('_btts_both_halves.csv', '')
        cmap = alias.get(code, {})
        with open(csv_file, encoding='utf-8-sig') as f:
            rows = list(csv.DictReader(f))
        matches = [[r['season'], r['date'], r['time'], r['round'],
                    cmap.get(r['home'], r['home']), cmap.get(r['away'], r['away']),
                    r['ht_score'], r['ft_score']]
                   for r in rows]
        name = rows[0]['league'] if rows else code

        # per-season aggregation
        per_season = defaultdict(lambda: [0, 0])   # season -> [evaluated, btts]
        for m in matches:
            per_season[m[0]][1] += 1
        for (c, sn), n in evaluated.items():
            if c == code:
                per_season[sn][0] += n
        seasons = []
        for sn in sorted(per_season, key=lambda s: srank.get(s, 9999)):
            ev, bt = per_season[sn]
            seasons.append({
                's': sn, 'eval': ev, 'btts': bt,
                'rate': round(100.0 * bt / ev, 1) if ev else 0.0,
            })

        # team leaderboard (home + away appearances)
        team_count = defaultdict(int)
        for m in matches:
            team_count[m[4]] += 1
            team_count[m[5]] += 1
        teams = [{'t': t, 'c': c} for t, c in
                 sorted(team_count.items(), key=lambda kv: (-kv[1], kv[0]))[:15]]

        total_eval = sum(s['eval'] for s in seasons)
        total_btts = len(matches)
        leagues[code] = {
            'name': name,
            'seasons': seasons,
            'teams': teams,
            'matrix': build_matrix(matches),
            'matches': matches,
            'eval': total_eval,
            'btts': total_btts,
            'rate': round(100.0 * total_btts / total_eval, 1) if total_eval else 0.0,
        }

    packed, merged = attach_all_matches(leagues, allm, fxm, alias)
    total_fx = sum(len((l.get('all') or {}).get('fx', '').split(';'))
                   if (l.get('all') or {}).get('fx') else 0
                   for l in leagues.values())

    payload = {
        'generated': stamp_date or date.today(timezone.utc).isoformat(),
        'src': stamp_sha or 'local',
        'fx_cutoff': cutoff,
        'definition': 'Both teams scored in the 1st half AND both teams scored '
                      'in the 2nd half (90-minute score basis).',
        'leagues': leagues,
    }
    out.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')),
                   encoding='utf-8')
    size_kb = out.stat().st_size / 1024
    print(f'leagues: {len(leagues)} | qualifying matches: '
          f'{sum(l["btts"] for l in leagues.values())} | packed history: {packed} '
          f'| upcoming fixtures: {total_fx} '
          f'| name variants merged: {merged} | data.json: {size_kb:.0f} KB')
    # quick sanity print
    for c in ['en.1', 'de.1', 'mls']:
        l = leagues[c]
        print(f"  {c}: {l['name']} | {l['btts']}/{l['eval']} = {l['rate']}% | "
              f"seasons={len(l['seasons'])} | top team: "
              f"{l['teams'][0]['t'] if l['teams'] else '-'}")


def main():
    ap = argparse.ArgumentParser(description='BTTS dashboard data.json builder')
    ap.add_argument('--src', default=str(DEFAULT_SRC),
                    help='path to an openfootball/football.json working clone')
    ap.add_argument('--csv', default=str(DEFAULT_CSV),
                    help='directory holding <code>_btts_both_halves.csv files')
    ap.add_argument('--out', default=str(DEFAULT_OUT), help='output data.json path')
    ap.add_argument('--stamp-date', default=None,
                    help='generated stamp (default: build date UTC)')
    ap.add_argument('--stamp-sha', default=None,
                    help='upstream source commit id (default: local)')
    ap.add_argument('--cutoff', default=None,
                    help='fixture cutoff override (default: derived from source)')
    args = ap.parse_args()
    run(Path(args.src), Path(args.csv), Path(args.out),
        stamp_date=args.stamp_date, stamp_sha=args.stamp_sha, cutoff=args.cutoff)


if __name__ == '__main__':
    main()
