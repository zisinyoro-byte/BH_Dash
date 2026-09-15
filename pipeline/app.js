/* BTTS Both Halves — League Analytics (vanilla JS + ECharts, dark theme) */
(function () {
  'use strict';

  var DATA = window.DATA;
  var ACCENT = '#2DD4BF';
  var AMBER = '#FBBF24';
  var SLATE = '#475569';
  var TEXT = '#F1F5F9';
  var SUB = '#94A3B8';
  var MUTED = '#64748B';
  var AXIS = '#334155';
  var GRID = '#1E293B';

  var state = {
    code: 'en.1',
    q: '',
    season: 'all',
    sortKey: 1,      // index into match array (1 = date)
    sortDir: 1,
    page: 1,
    per: 50,
  };

  /* ── helpers ─────────────────────────────────────── */
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function pct(btts, evald) { return evald ? (100 * btts / evald) : 0; }
  function fmt1(x) { return (Math.round(x * 10) / 10).toFixed(1); }
  function cmpScore(a, b) {
    var pa = a.split('-'), pb = b.split('-');
    return (parseInt(pa[0], 10) - parseInt(pb[0], 10)) ||
           (parseInt(pa[1], 10) - parseInt(pb[1], 10));
  }

  var tooltipStyle = {
    backgroundColor: '#1E293B', borderColor: '#475569', borderWidth: 1,
    textStyle: { color: TEXT, fontSize: 12 },
  };
  function cleanAxis() {
    return {
      axisLine: { lineStyle: { color: AXIS, width: 0.8 } },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: GRID, width: 0.6 } },
      axisLabel: { color: SUB, fontSize: 10.5 },
    };
  }

  /* ── league dropdown ─────────────────────────────── */
  function buildLeagueOptions() {
    var sel = $('league');
    var codes = Object.keys(DATA.leagues).sort(function (a, b) {
      var la = DATA.leagues[a], lb = DATA.leagues[b];
      return la.name.localeCompare(lb.name);
    });
    codes.forEach(function (c) {
      var L = DATA.leagues[c];
      var o = document.createElement('option');
      o.value = c;
      o.textContent = L.name + ' — ' + fmt1(L.rate) + '% (' + L.btts + ' matches)';
      sel.appendChild(o);
    });
    sel.value = state.code;
    sel.addEventListener('change', function () {
      state.code = sel.value;
      state.page = 1;
      state.q = ''; $('q').value = '';
      state.season = 'all';
      buildTeamOptions(DATA.leagues[state.code]);
      renderFocus();
      renderAll();
    });
  }

  /* ── KPI cards ───────────────────────────────────── */
  function renderKpis(L) {
    var kpis = $('kpis');
    kpis.innerHTML = '';

    // peak season: highest rate among seasons with a meaningful sample
    var eligible = L.seasons.filter(function (s) { return s.eval >= 30; });
    if (!eligible.length) eligible = L.seasons.filter(function (s) { return s.eval > 0; });
    var peak = eligible.reduce(function (a, b) { return b.rate > a.rate ? b : a; }, eligible[0]);

    var latest = null;
    for (var i = L.seasons.length - 1; i >= 0; i--) {
      if (L.seasons[i].eval > 0) { latest = L.seasons[i]; break; }
    }

    var first = L.seasons[0], last = L.seasons[L.seasons.length - 1];

    [
      ['Qualifying matches', String(L.btts), L.btts + ' of ' + L.eval + ' with HT/FT recorded'],
      ['Overall hit rate', fmt1(L.rate) + '%', 'matches evaluated incl. half-time scores'],
      ['Peak season', fmt1(peak.rate) + '%', peak.s + ' · ' + peak.btts + '/' + peak.eval + (L.seasons.length > 1 ? ' (sample ≥ 30)' : '')],
      ['Latest season', latest ? fmt1(latest.rate) + '%' : '—', latest ? latest.s + ' · ' + latest.btts + '/' + latest.eval : 'no matches yet'],
      ['Seasons covered', String(L.seasons.length), first.s + ' → ' + last.s],
    ].forEach(function (k) {
      var card = el('div', 'kpi');
      card.appendChild(el('div', 'label', k[0]));
      var v = el('div', 'value accent', k[1]);
      card.appendChild(v);
      card.appendChild(el('div', 'note', k[2]));
      kpis.appendChild(card);
    });
  }

  /* ── league bar ──────────────────────────────────── */
  function renderLeagueBar(L, code) {
    var bar = $('leagueBar');
    bar.innerHTML = '';
    bar.appendChild(el('span', 'name', L.name));
    bar.appendChild(el('span', 'chip', code));
    bar.appendChild(el('span', 'meta',
      L.btts + ' qualifying matches · ' + fmt1(L.rate) + '% hit rate · ' +
      L.seasons.length + ' season' + (L.seasons.length === 1 ? '' : 's') +
      ' · ' + L.eval + ' evaluated'));
  }

  /* ── trend chart ─────────────────────────────────── */
  function renderTrend(L) {
    var seasons = L.seasons.map(function (s) { return s.s; });
    var rates = L.seasons.map(function (s) { return s.rate; });
    var counts = L.seasons.map(function (s) { return s.btts; });
    var evals = L.seasons.map(function (s) { return s.eval; });
    // peak marker uses the same eligibility rule as the KPI card (sample ≥ 30)
    var eligible = [];
    L.seasons.forEach(function (s, i) { if (s.eval >= 30) eligible.push(i); });
    var thresholded = eligible.length > 0;
    if (!thresholded) {
      L.seasons.forEach(function (s, i) { if (s.eval > 0) eligible.push(i); });
    }
    if (!eligible.length) eligible = [0];
    var peakIdx = eligible.reduce(function (a, i) {
      return L.seasons[i].rate > L.seasons[a].rate ? i : a;
    }, eligible[0]);
    var maxRate = rates[peakIdx];

    var points = rates.map(function (r, i) {
      var item = { value: r };
      if (i === peakIdx && r > 0) {
        item.symbolSize = 10;
        item.itemStyle = { color: AMBER, borderColor: AMBER };
        item.label = {
          show: true, position: 'left', distance: 8,
          formatter: fmt1(r) + '%',
          color: AMBER, fontSize: 11, fontWeight: 600,
        };
      }
      return item;
    });

    trendChart.setOption({
      backgroundColor: 'transparent',
      textStyle: { color: TEXT },
      grid: { left: 48, right: 48, top: 34, bottom: 42, containLabel: true },
      tooltip: Object.assign({ trigger: 'axis' }, tooltipStyle, {
        formatter: function (ps) {
          var i = ps[0].dataIndex;
          var s = L.seasons[i];
          return '<b>' + s.s + '</b><br>' +
            'Qualifying: ' + s.btts + '<br>' +
            'Evaluated: ' + s.eval + '<br>' +
            'Hit rate: <b>' + fmt1(s.rate) + '%</b>';
        },
      }),
      xAxis: Object.assign({ type: 'category', data: seasons }, cleanAxis(),
        { axisLabel: { color: SUB, fontSize: 10.5, interval: 'auto', rotate: 0 } }),
      // barWidth: percentage blows up when few categories — clamp to px
      yAxis: [
        Object.assign({ type: 'value', name: '', axisLabel: {
          color: SUB, fontSize: 10.5, formatter: '{value}%' }, max: function (v) { return Math.ceil(v.max * 1.2); } }, cleanAxis(),
          { splitLine: { lineStyle: { color: GRID, width: 0.6 } } }),
        Object.assign({ type: 'value', axisLabel: { color: SUB, fontSize: 10.5 } }, cleanAxis(),
          { splitLine: { show: false }, minInterval: 1 }),
      ],
      series: [
        {
          name: 'Qualifying matches', type: 'bar', yAxisIndex: 1,
          data: counts, barWidth: L.seasons.length <= 4 ? 30 : '45%',
          itemStyle: { color: 'rgba(71,85,105,0.55)', borderRadius: [3, 3, 0, 0] },
        },
        {
          name: 'Hit rate', type: 'line', yAxisIndex: 0,
          data: points, smooth: true,
          symbol: 'circle', symbolSize: 6,
          lineStyle: { width: 2.5, color: ACCENT },
          itemStyle: { color: ACCENT },
          areaStyle: {
            color: {
              type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(45,212,191,0.16)' },
                { offset: 1, color: 'rgba(45,212,191,0)' },
              ],
            },
          },
        },
      ],
    }, true);

    $('trendDesc').textContent =
      'Peak: ' + L.seasons[peakIdx].s + ' at ' + fmt1(maxRate) + '%' +
      (thresholded ? ' (sample ≥ 30)' : '') + ' · bars show qualifying match count';
  }

  /* ── team leaderboard ────────────────────────────── */
  function renderTeams(L) {
    var teams = L.teams.slice().reverse(); // largest on top
    var names = teams.map(function (t) { return t.t; });
    var vals = teams.map(function (t) { return t.c; });
    var maxV = Math.max.apply(null, vals.concat([1]));

    teamsChart.setOption({
      backgroundColor: 'transparent',
      textStyle: { color: TEXT },
      grid: { left: 8, right: 46, top: 12, bottom: 10, containLabel: true },
      tooltip: Object.assign({ trigger: 'item' }, tooltipStyle, {
        formatter: function (p) {
          return '<b>' + p.name + '</b><br>' + p.value +
            ' qualifying matches (home + away)';
        },
      }),
      xAxis: Object.assign({ type: 'value' }, cleanAxis(),
        { splitLine: { lineStyle: { color: GRID, width: 0.6 } }, minInterval: 1 }),
      yAxis: Object.assign({ type: 'category', data: names }, cleanAxis(),
        { axisTick: { show: false }, axisLabel: { color: SUB, fontSize: 11 } }),
      series: [{
        type: 'bar', data: vals, barWidth: '62%',
        itemStyle: {
          borderRadius: [0, 4, 4, 0],
          color: {
            type: 'linear', x: 0, y: 0, x2: 1, y2: 0,
            colorStops: [
              { offset: 0, color: 'rgba(45,212,191,0.35)' },
              { offset: 1, color: 'rgba(45,212,191,0.9)' },
            ],
          },
        },
        label: {
          show: true, position: 'right', color: SUB, fontSize: 10.5,
          fontVariant: 'tabular-nums',
        },
      }],
    }, true);

    $('teamsDesc').textContent =
      'Top ' + L.teams.length + ' by appearances in qualifying matches · leader: ' +
      L.teams[0].t + ' (' + L.teams[0].c + ')';
  }

  /* ── scoreline matrix ────────────────────────────── */
  function renderMatrix(L) {
    var M = L.matrix;
    var maxV = 1;
    M.data.forEach(function (d) { if (d[2] > maxV) maxV = d[2]; });

    // size & center the grid so cells never stretch with few categories
    var W = matrixChart.getWidth(), H = matrixChart.getHeight();
    var CW = 56, CH = 46;
    var totalW = Math.min(M.ht.length * CW, W - 110);
    var totalH = Math.min(M.ft.length * CH, H - 90);
    var gLeft = Math.max(70, (W - totalW) / 2);
    var gRight = Math.max(40, W - gLeft - totalW);
    var gBottom = Math.max(76, H - 14 - totalH);

    var labelMin = Math.min(3, maxV);
    var brightCut = maxV * 0.45;
    var cells = M.data.map(function (d) {
      var show = d[2] >= labelMin;
      return {
        value: d,
        label: {
          show: show,
          color: d[2] >= brightCut ? '#04211F' : '#8FE8DC',
          fontSize: 10.5, fontWeight: 600,
        },
      };
    });

    matrixChart.setOption({
      backgroundColor: 'transparent',
      textStyle: { color: TEXT },
      grid: { left: gLeft, right: gRight, top: 14, bottom: gBottom, containLabel: false },
      tooltip: Object.assign({ trigger: 'item', position: 'top' }, tooltipStyle, {
        formatter: function (p) {
          return '<b>HT ' + M.ht[p.data[0]] + ' → FT ' + M.ft[p.data[1]] +
            '</b><br>' + p.data[2] + ' matches';
        },
      }),
      xAxis: Object.assign({ type: 'category', data: M.ht }, cleanAxis(),
        { splitArea: { show: false }, axisLabel: { color: SUB, fontSize: 11 } }),
      yAxis: Object.assign({ type: 'category', data: M.ft, inverse: true }, cleanAxis(),
        { splitLine: { show: false }, axisLabel: { color: SUB, fontSize: 11 } }),
      visualMap: {
        min: 0, max: maxV, calculable: false, orient: 'horizontal',
        left: 'center', bottom: 4, itemHeight: 90, itemWidth: 12,
        textStyle: { color: MUTED, fontSize: 10 },
        inRange: {
          color: ['rgba(45,212,191,0.06)', 'rgba(19,78,74,0.75)',
                  'rgba(45,212,191,0.85)', '#99F6E4'],
        },
      },
      series: [{
        type: 'heatmap',
        data: cells,
        itemStyle: { borderColor: '#0F172A', borderWidth: 2, borderRadius: 3 },
        emphasis: { itemStyle: { shadowBlur: 6, shadowColor: 'rgba(45,212,191,0.4)' } },
      }],
    }, true);

    $('matrixDesc').textContent =
      'Most common scoreline paths among qualifying matches — hover any cell for detail';
  }

  /* ── match explorer ──────────────────────────────── */
  function seasonOptions(L) {
    var sel = $('seasonFilter');
    sel.innerHTML = '';
    var all = document.createElement('option');
    all.value = 'all';
    all.textContent = 'All seasons';
    sel.appendChild(all);
    L.seasons.forEach(function (s) {
      var o = document.createElement('option');
      o.value = s.s;
      o.textContent = s.s + ' (' + s.btts + ')';
      sel.appendChild(o);
    });
    sel.value = state.season;
  }

  function filteredRows(L) {
    var q = state.q.trim().toLowerCase();
    var rows = L.matches.filter(function (m) {
      if (state.season !== 'all' && m[0] !== state.season) return false;
      if (!q) return true;
      return (m[3] + ' ' + m[4] + ' ' + m[5] + ' ' + m[1] + ' ' + m[0])
        .toLowerCase().indexOf(q) !== -1;
    });
    var k = state.sortKey, dir = state.sortDir;
    rows.sort(function (a, b) {
      var va = a[k], vb = b[k];
      var c;
      if (k === 6 || k === 7) c = cmpScore(va, vb);
      else c = String(va).localeCompare(String(vb));
      return c * dir;
    });
    return rows;
  }

  function renderExplorer(L) {
    var rows = filteredRows(L);
    var totalPages = Math.max(1, Math.ceil(rows.length / state.per));
    if (state.page > totalPages) state.page = totalPages;
    var start = (state.page - 1) * state.per;
    var slice = rows.slice(start, start + state.per);

    var tbody = $('rows');
    tbody.innerHTML = '';
    slice.forEach(function (m) {
      var tr = document.createElement('tr');
      [m[0], m[1], m[3], m[4], m[5], m[6], m[7]].forEach(function (v, i) {
        var td = el('td');
        if (i === 1 || i === 5 || i === 6) td.className = 'num';
        if (i === 5) { td.className = 'score'; }
        if (i === 6) { td.className = 'score'; }
        if (i === 3 || i === 4) td.className = 'teams';
        td.textContent = v === '' ? '—' : v;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });

    $('matchCount').textContent = rows.length + ' matching matches';
    $('pageInfo').textContent = 'Page ' + state.page + ' / ' + totalPages +
      ' · rows ' + (rows.length ? start + 1 : 0) + '–' + Math.min(start + state.per, rows.length);
    $('prev').disabled = state.page <= 1;
    $('next').disabled = state.page >= totalPages;
  }

  /* ── team focus & H2H (independent section) ──────── */
  var focusChart = null;
  var focusState = { a: '', b: '' };

  function decodeAll(L) {
    if (L._decoded) return L._decoded;
    var ms = (L.all && L.all.m ? L.all.m.split(';') : []).map(function (r) {
      var p = r.split(',');
      return {
        s: +p[0], h: +p[1], a: +p[2],
        h0: +p[3], h1: +p[4], f0: +p[5], f1: +p[6],
        d: p.length > 7 ? p[7] : '',
      };
    });
    L._decoded = ms;
    return ms;
  }

  function decodeFx(L) {
    if (L._fx) return L._fx;
    var ms = (L.all && L.all.fx ? L.all.fx.split(';') : []).map(function (r) {
      var p = r.split(',');
      return { s: +p[0], h: +p[1], a: +p[2], d: p[3], r: p.length > 4 ? p[4] : '' };
    }).sort(function (x, y) { return x.d < y.d ? -1 : x.d > y.d ? 1 : 0; });
    L._fx = ms;
    return ms;
  }

  function isQual(h0, h1, f0, f1) {
    return h0 > 0 && h1 > 0 && (f0 - h0) > 0 && (f1 - h1) > 0;
  }

  function patternOf(m) {
    if (m.h0 < 0) return ['n/a · no HT', 'b-na'];
    if (isQual(m.h0, m.h1, m.f0, m.f1)) return ['✔ both halves', 'b-full'];
    if (m.f0 > 0 && m.f1 > 0) return ['BTTS only', 'b-btts'];
    return ['No', 'b-no'];
  }

  function byDateDesc(x, y) {
    return String(y.d || '0').localeCompare(String(x.d || '0'));
  }

  function teamStats(D, teamIdx) {
    var st = {
      played: 0, evaluable: 0, qual: 0, btts: 0, cs: 0,
      // [played, evaluable, qualified, both-scored-1H, both-scored-2H, clean-sheets]
      home: [0, 0, 0, 0, 0, 0], away: [0, 0, 0, 0, 0, 0],
      gf: 0, ga: 0, qualRows: [], byOpp: {},
    };
    D.forEach(function (m) {
      var isHome = m.h === teamIdx, isAway = m.a === teamIdx;
      if (!isHome && !isAway) return;
      st.played++;
      st.gf += isHome ? m.f0 : m.f1;
      st.ga += isHome ? m.f1 : m.f0;
      if (m.f0 > 0 && m.f1 > 0) st.btts++;
      // clean sheet: team kept the opposition scoreless over 90 minutes
      // (every packed match has a FT score, so the CS denominator = played)
      if (isHome ? m.f1 === 0 : m.f0 === 0) { st.cs++; }
      var hasHt = m.h0 >= 0;
      var q = hasHt && isQual(m.h0, m.h1, m.f0, m.f1);
      if (hasHt) st.evaluable++;
      var opp = isHome ? m.a : m.h;
      var o = st.byOpp[opp] || (st.byOpp[opp] = { meets: 0, qual: 0, lastQ: '' });
      o.meets++;
      var bucket = isHome ? st.home : st.away;
      bucket[0]++;
      if (isHome ? m.f1 === 0 : m.f0 === 0) bucket[5]++;
      if (hasHt) {
        bucket[1]++;
        if (m.h0 > 0 && m.h1 > 0) bucket[3]++;
        if (m.f0 - m.h0 > 0 && m.f1 - m.h1 > 0) bucket[4]++;
      }
      if (q) {
        bucket[2]++;
        st.qual++;
        st.qualRows.push({ m: m, home: isHome, opp: opp });
        o.qual++;
        if (String(m.d || '') > String(o.lastQ)) o.lastQ = String(m.d || '');
      }
    });
    st.qualRows.sort(byDateDesc);
    return st;
  }

  // ── next-match outlook model ──────────────────────
  // Estimated P(next meeting = BTTS both halves) from empirical frequencies:
  //   75% venue-adjusted team-pair rate  +  25% head-to-head rate,
  // each shrunk toward the league base rate (prior strength below) so small
  // samples can't dominate. Purely historical — an estimate, not a prophecy.
  var PRIOR_TEAM = 20;   // pseudo-matches added to each team rate
  var PRIOR_H2H = 10;    // pseudo-matches added to the H2H rate

  function shrunk(cnt, ev, prior, k) {
    return (cnt + k * prior) / (ev + k);
  }

  function leagueBase(L) {
    return L.eval ? L.btts / L.eval : 0;
  }

  function leagueHalfPriors(L, D) {
    if (L._hp) return L._hp;
    var ev = 0, p1 = 0, p2 = 0;
    D.forEach(function (m) {
      if (m.h0 < 0) return;
      ev++;
      if (m.h0 > 0 && m.h1 > 0) p1++;
      if (m.f0 - m.h0 > 0 && m.f1 - m.h1 > 0) p2++;
    });
    L._hp = { ev: ev, p1: ev ? p1 / ev : 0, p2: ev ? p2 / ev : 0 };
    return L._hp;
  }

  // venue: 'H' | 'A' · bucket indices: 1=evaluable 2=qual 3=H1-both 4=H2-both
  function venueRates(st, venue, rL, hp) {
    var b = venue === 'H' ? st.home : st.away;
    return {
      qual: shrunk(b[2], b[1], rL, PRIOR_TEAM), nQual: b[1],
      h1: shrunk(b[3], b[1], hp.p1, PRIOR_TEAM),
      h2: shrunk(b[4], b[1], hp.p2, PRIOR_TEAM),
    };
  }

  function pairOutlook(L, D, homeIdx, awayIdx) {
    var rL = leagueBase(L);
    var hp = leagueHalfPriors(L, D);
    var stH = teamStats(D, homeIdx), stA = teamStats(D, awayIdx);
    var rh = venueRates(stH, 'H', rL, hp);
    var ra = venueRates(stA, 'A', rL, hp);
    var h2hQ = 0, h2hE = 0;
    D.forEach(function (m) {
      var isM = (m.h === homeIdx && m.a === awayIdx) ||
                (m.h === awayIdx && m.a === homeIdx);
      if (!isM) return;
      if (m.h0 >= 0) {
        h2hE++;
        if (isQual(m.h0, m.h1, m.f0, m.f1)) h2hQ++;
      }
    });
    return {
      rL: rL,
      teamSig: Math.sqrt(rh.qual * ra.qual),
      h2h: { r: shrunk(h2hQ, h2hE, rL, PRIOR_H2H), n: h2hE },
      p1: Math.sqrt(rh.h1 * ra.h1),
      p2: Math.sqrt(rh.h2 * ra.h2),
      rh: rh, ra: ra,
      stH: stH, stA: stA,
      lowN: rh.nQual < 30 || ra.nQual < 30,
    };
  }

  function finalizeOutlook(o) {
    o.p = 0.75 * o.teamSig + 0.25 * o.h2h.r;
    return o;
  }

  function bandOf(p, rL) {
    if (!rL) return ['—', 'b-mid'];
    var ratio = p / rL;
    if (ratio < 0.6) return ['Well below league norm', 'b-low'];
    if (ratio < 0.85) return ['Below league norm', 'b-below'];
    if (ratio <= 1.15) return ['Around league norm', 'b-mid'];
    if (ratio <= 1.6) return ['Above league norm', 'b-above'];
    return ['Well above league norm', 'b-high'];
  }

  // horizontal probability bar with optional league-average tick (amber)
  function probBar(pct, tickPct, cap, cls) {
    var bar = el('div', 'obar' + (cls ? ' ' + cls : ''));
    var fill = el('div', 'obar-fill');
    fill.style.width = Math.min(100, 100 * pct / cap).toFixed(1) + '%';
    bar.appendChild(fill);
    if (tickPct !== null && tickPct !== undefined) {
      var tick = el('div', 'obar-tick');
      tick.style.left = Math.min(100, 100 * tickPct / cap).toFixed(1) + '%';
      bar.appendChild(tick);
    }
    return bar;
  }

  function loadPairInSlots(side, teamName) {
    var sel = side === 'a' ? $('teamB') : $('teamA');
    sel.value = teamName;
    sel.dispatchEvent(new Event('change'));
  }

  // Opponent the team has had the most BTTS-both-halves (qualifying) matches with.
  // Tie-breaks: more total meetings → most recent qualifying match → team order.
  function topRival(st) {
    var best = null;
    Object.keys(st.byOpp).forEach(function (k) {
      var o = st.byOpp[k], idx = +k;
      if (!o.qual) return;
      if (!best) {
        best = { idx: idx, qual: o.qual, meets: o.meets, lastQ: o.lastQ };
        return;
      }
      if (o.qual > best.qual ||
          (o.qual === best.qual && o.meets > best.meets) ||
          (o.qual === best.qual && o.meets === best.meets &&
           String(o.lastQ) > String(best.lastQ)) ||
          (o.qual === best.qual && o.meets === best.meets &&
           String(o.lastQ) === String(best.lastQ) && idx < best.idx)) {
        best = { idx: idx, qual: o.qual, meets: o.meets, lastQ: o.lastQ };
      }
    });
    return best;
  }

  function mkChip(parent, label, value, note, accent) {
    var c = el('div', 'mkpi');
    c.appendChild(el('div', 'label', label));
    c.appendChild(el('div', 'value' + (accent ? ' accent' : ''), value));
    if (note) c.appendChild(el('div', 'note', note));
    parent.appendChild(c);
  }

  function buildTeamOptions(L) {
    ['teamA', 'teamB'].forEach(function (id) {
      var sel = $(id);
      sel.innerHTML = '';
      var ph = document.createElement('option');
      ph.value = '';
      ph.textContent = '— pick a team —';
      sel.appendChild(ph);
      (L.all ? L.all.teams : []).forEach(function (t) {
        var o = document.createElement('option');
        o.value = t;
        o.textContent = t;
        sel.appendChild(o);
      });
      sel.value = '';
    });
    focusState.a = '';
    focusState.b = '';
  }

  function renderMatchRows(tbody, rows, cols) {
    tbody.innerHTML = '';
    if (!rows.length) {
      var tr = document.createElement('tr');
      var td = el('td', 'teams', cols.empty);
      td.colSpan = 7;
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }
    rows.forEach(function (r) {
      var tr = document.createElement('tr');
      if (cols.rowCls) tr.className = cols.rowCls(r) || '';
      cols.cells(r).forEach(function (cell) {
        var td = el('td', cell.cls || '');
        if (cell.badge) {
          td.appendChild(el('span', 'badge ' + cell.badge[1], cell.badge[0]));
        } else {
          td.textContent = cell.v === '' || cell.v === undefined ? '—' : cell.v;
          if (cell.star) td.appendChild(el('span', 'rival-star', '★'));
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  }

  function renderTeamPanel(root, L, D, teamIdx, side) {
    var name = L.all.teams[teamIdx];
    var st = teamStats(D, teamIdx);
    root.innerHTML = '';

    var head = el('div', 'tp-head');
    head.appendChild(el('span', 'dot ' + side));
    head.appendChild(el('span', 'tp-name', name));
    head.appendChild(el('span', 'tp-side', 'Team ' + side.toUpperCase()));
    root.appendChild(head);

    var chips = el('div', 'mkpis');
    var rateTxt = st.evaluable ? fmt1(100 * st.qual / st.evaluable) + '%' : '—';
    mkChip(chips, 'Matches', String(st.played), 'all seasons in this league', false);
    mkChip(chips, 'Qualifying', String(st.qual),
           st.evaluable ? rateTxt + ' of ' + st.evaluable + ' with HT' : 'no HT data', true);
    mkChip(chips, 'Classic BTTS', String(st.btts),
           st.played ? fmt1(100 * st.btts / st.played) + '% of matches' : '—', false);
    mkChip(chips, 'Avg goals', fmt1((st.gf + st.ga) / Math.max(1, st.played)),
           st.gf + ' for · ' + st.ga + ' against', false);
    mkChip(chips, 'As home', st.home[2] + ' / ' + Math.max(st.home[1], 0),
           st.home[0] + ' played · of ' + st.home[1] + ' with HT', false);
    mkChip(chips, 'As away', st.away[2] + ' / ' + Math.max(st.away[1], 0),
           st.away[0] + ' played · of ' + st.away[1] + ' with HT', false);
    mkChip(chips, 'Clean sheets',
           st.played ? fmt1(100 * st.cs / st.played) + '%' : '—',
           st.cs + ' of ' + st.played + ' matches (FT, 0 conceded)', false);
    var csH = st.home[0] ? fmt1(100 * st.home[5] / st.home[0]) + '%' : '—';
    var csA = st.away[0] ? fmt1(100 * st.away[5] / st.away[0]) + '%' : '—';
    mkChip(chips, 'CS home / away', csH + ' / ' + csA,
           st.home[5] + ' of ' + st.home[0] + ' H · ' + st.away[5] + ' of ' + st.away[0] + ' A', false);
    root.appendChild(chips);

    // ── highlight: opponent with the most BTTS-both-halves matches together ──
    var other = side === 'a' ? focusState.b : focusState.a;
    var rival = topRival(st);
    if (rival) {
      var rName = L.all.teams[rival.idx];
      var banner = el('div', 'rival-banner side-' + side);
      banner.appendChild(el('div', 'rb-label',
        '★ Most BTTS both-halves rival'));
      banner.appendChild(el('span', 'rb-name', rName));
      banner.appendChild(el('span', 'rb-stats',
        rival.qual + ' qualifying match' + (rival.qual === 1 ? '' : 'es') + ' together'));
      if (other !== rName) {
        var btn = el('button', 'rb-btn', 'Load H2H ⇄');
        btn.title = 'Put ' + rName + ' in the other slot and show their head-to-head';
        btn.addEventListener('click', function () { loadPairInSlots(side, rName); });
        banner.appendChild(btn);
      }
      banner.appendChild(el('div', 'rb-note',
        'out of ' + rival.meets + ' meeting' + (rival.meets === 1 ? '' : 's') +
        ' in this league · ' + fmt1(100 * rival.qual / st.qual) + '% of ' + name +
        '’s ' + st.qual + ' qualifying match' + (st.qual === 1 ? '' : 'es') +
        ' — highlighted below'));
      root.appendChild(banner);
    }

    // ── next scheduled fixture + outlook ──
    var fx = decodeFx(L).find(function (f) {
      return f.h === teamIdx || f.a === teamIdx;
    });
    if (fx) {
      var oIdx = fx.h === teamIdx ? fx.a : fx.h;
      var oName = L.all.teams[oIdx];
      var o = finalizeOutlook(pairOutlook(L, D, fx.h, fx.a));
      var nf = el('div', 'nextfx');
      nf.appendChild(el('span', 'nf-label', 'Next fixture'));
      nf.appendChild(el('span', 'nf-text',
        oName + ' (' + (fx.h === teamIdx ? 'H' : 'A') + ') · ' + fx.d +
        (fx.r ? ' · ' + fx.r : '')));
      var nb = el('button', 'nf-btn', '≈ ' + fmt1(100 * o.p) + '% outlook');
      if (oName !== other) {
        nb.title = 'Estimated chance this match is BTTS in both halves — ' +
                   'click for the head-to-head view';
        nb.addEventListener('click', function () { loadPairInSlots(side, oName); });
      } else {
        nb.disabled = true;
        nb.title = 'Already selected in the other slot';
      }
      nf.appendChild(nb);
      root.appendChild(nf);
    }

    var title = el('div', 'tbl-title',
      'Their qualifying matches — ' + st.qual + (st.qual === 1 ? ' match' : ' matches'));
    root.appendChild(title);

    var scroll = el('div', 'table-scroll small');
    var table = el('table');
    table.innerHTML = '<thead><tr><th>Season</th><th>Date</th><th>Venue</th>' +
      '<th>Opponent</th><th>HT</th><th>FT</th><th>Pattern</th></tr></thead>';
    var tbody = el('tbody');
    renderMatchRows(tbody, st.qualRows.map(function (r) { return r.m; }), {
      empty: 'This team has no qualifying matches in this league.',
      rowCls: rival ? function (m) {
        return (m.h === teamIdx ? m.a : m.h) === rival.idx ? 'rival-row ' + side : '';
      } : null,
      cells: function (m) {
        var home = L.all.teams[m.h], away = L.all.teams[m.a];
        var pat = patternOf(m);
        var isRival = !!rival && (m.h === teamIdx ? m.a : m.h) === rival.idx;
        return [
          { v: L.all.seasons[m.s] },
          { v: m.d, cls: 'num' },
          { v: m.h === teamIdx ? 'Home' : 'Away' },
          { v: m.h === teamIdx ? away : home, star: isRival },
          { v: m.h0 < 0 ? '' : m.h0 + '-' + m.h1, cls: 'score' },
          { v: m.f0 + '-' + m.f1, cls: 'score' },
          { badge: pat },
        ];
      },
    });
    table.appendChild(tbody);
    scroll.appendChild(table);
    root.appendChild(scroll);
  }

  function renderOutlookBlock(L, D, ai, bi) {
    var root = $('outlookBlock');
    if (!root) return;
    root.innerHTML = '';
    var aName = L.all.teams[ai], bName = L.all.teams[bi];

    var fx = decodeFx(L).find(function (f) {
      return (f.h === ai && f.a === bi) || (f.h === bi && f.a === ai);
    });
    var o, fxLine;
    if (fx) {
      o = finalizeOutlook(pairOutlook(L, D, fx.h, fx.a));
      var ht = fx.h === ai ? aName : bName;
      var at = fx.h === ai ? bName : aName;
      fxLine = 'Next scheduled meeting: ' + ht + ' vs ' + at + ' · ' + fx.d +
        (fx.r ? ' · ' + fx.r : '') + ' · ' + L.all.seasons[fx.s];
    } else {
      var o1 = finalizeOutlook(pairOutlook(L, D, ai, bi));
      var o2 = finalizeOutlook(pairOutlook(L, D, bi, ai));
      o = {
        rL: o1.rL,
        p: (o1.p + o2.p) / 2,
        p1: (o1.p1 + o2.p1) / 2,
        p2: (o1.p2 + o2.p2) / 2,
        h2h: o1.h2h,
        rh: o1.rh, ra: o1.ra,
        stA: o1.stH, stB: o1.stA,
        lowN: o1.lowN || o2.lowN,
      };
      fxLine = 'No upcoming ' + aName + ' vs ' + bName + ' fixture in the embedded ' +
        'schedule — venue-neutral estimate (both home/away orientations averaged).';
    }

    var wrap = el('div', 'outlook');
    var main = el('div', 'ol-main');
    main.appendChild(el('div', 'ol-fixture', fxLine));

    var band = bandOf(o.p, o.rL);
    var numrow = el('div', 'ol-numrow');
    var num = el('span', 'ol-num', fmt1(100 * o.p));
    num.appendChild(el('span', 'ol-pct', '%'));
    numrow.appendChild(num);
    numrow.appendChild(el('span', 'ol-band ' + band[1], band[0]));
    if (o.lowN) numrow.appendChild(el('span', 'ol-band b-low', 'small sample'));
    main.appendChild(numrow);

    main.appendChild(probBar(100 * o.p, 100 * o.rL, 25));
    main.appendChild(el('div', 'ol-scale',
      'chance of BTTS both halves · scale 0–25% · | league average ' +
      fmt1(100 * o.rL) + '%'));
    wrap.appendChild(main);

    var hp = leagueHalfPriors(L, D);
    var sideCol = el('div', 'ol-side');
    [['Both teams score in 1H', o.p1, hp.p1],
     ['Both teams score in 2H', o.p2, hp.p2]].forEach(function (h) {
      var half = el('div', 'ol-half');
      var row = el('div', 'oh-row');
      row.appendChild(el('span', null, h[0]));
      var b = el('b', null, fmt1(100 * h[1]) + '%');
      row.appendChild(b);
      half.appendChild(row);
      half.appendChild(probBar(100 * h[1], 100 * h[2], 30, 'ob-half'));
      sideCol.appendChild(half);
    });

    var chips = el('div', 'mkpis');
    if (fx) {
      mkChip(chips, L.all.teams[fx.h] + ' at home', fmt1(100 * o.rh.qual) + '%',
             o.rh.nQual + ' matches with HT', false);
      mkChip(chips, L.all.teams[fx.a] + ' away', fmt1(100 * o.ra.qual) + '%',
             o.ra.nQual + ' matches with HT', false);
    } else {
      var sA = o.stA, sB = o.stB;
      mkChip(chips, aName + ' · overall', fmt1(100 * shrunk(sA.qual, sA.evaluable, o.rL, PRIOR_TEAM)) + '%',
             sA.evaluable + ' matches with HT', false);
      mkChip(chips, bName + ' · overall', fmt1(100 * shrunk(sB.qual, sB.evaluable, o.rL, PRIOR_TEAM)) + '%',
             sB.evaluable + ' matches with HT', false);
    }
    mkChip(chips, 'Head-to-head', o.h2h.n ? fmt1(100 * o.h2h.r) + '%' : '—',
           o.h2h.n + ' meetings with HT', false);
    mkChip(chips, 'League average', fmt1(100 * o.rL) + '%',
           'all evaluated matches', false);
    sideCol.appendChild(chips);
    wrap.appendChild(sideCol);
    root.appendChild(wrap);

    root.appendChild(el('div', 'ol-note',
      'Estimate = 75% venue-adjusted team rates + 25% head-to-head, each pulled ' +
      'toward the league average (prior = ' + PRIOR_TEAM + ' / ' + PRIOR_H2H +
      ' pseudo-matches) so small samples cannot dominate. Half bars assume ' +
      'independent halves; the amber tick marks the league half average. ' +
      'This is a historical frequency estimate — not a prediction of the actual result.'));
  }

  function renderComparison(L, sa, sb, nameA, nameB) {
    var rateA = sa.evaluable ? Math.round(1000 * sa.qual / sa.evaluable) / 10 : 0;
    var rateB = sb.evaluable ? Math.round(1000 * sb.qual / sb.evaluable) / 10 : 0;
    var bttsA = sa.played ? Math.round(1000 * sa.btts / sa.played) / 10 : 0;
    var bttsB = sb.played ? Math.round(1000 * sb.btts / sb.played) / 10 : 0;
    var gA = sa.played ? Math.round(100 * sa.gf / sa.played) / 100 : 0;
    var gB = sb.played ? Math.round(100 * sb.gf / sb.played) / 100 : 0;
    var cA = sa.played ? Math.round(100 * sa.ga / sa.played) / 100 : 0;
    var cB = sb.played ? Math.round(100 * sb.ga / sb.played) / 100 : 0;
    var tA = sa.played ? Math.round(100 * (sa.gf + sa.ga) / sa.played) / 100 : 0;
    var tB = sb.played ? Math.round(100 * (sb.gf + sb.ga) / sb.played) / 100 : 0;
    var csA = sa.played ? Math.round(1000 * sa.cs / sa.played) / 10 : 0;
    var csB = sb.played ? Math.round(1000 * sb.cs / sb.played) / 10 : 0;

    var cats = ['Qualifying rate %', 'Classic BTTS rate %', 'Clean sheet %',
                'Avg goals scored', 'Avg goals conceded', 'Avg match goals'];
    var valsA = [rateA, bttsA, csA, gA, cA, tA];
    var valsB = [rateB, bttsB, csB, gB, cB, tB];

    focusChart.setOption({
      backgroundColor: 'transparent',
      textStyle: { color: TEXT },
      grid: { left: 8, right: 64, top: 26, bottom: 8, containLabel: true },
      legend: {
        data: [nameA, nameB], top: 0, right: 0,
        textStyle: { color: SUB, fontSize: 11.5 },
        itemWidth: 14, itemHeight: 9,
      },
      tooltip: Object.assign({ trigger: 'axis', axisPointer: { type: 'shadow' } }, tooltipStyle),
      xAxis: Object.assign({ type: 'value' }, cleanAxis(),
        { splitLine: { lineStyle: { color: GRID, width: 0.6 } } }),
      yAxis: Object.assign({ type: 'category', data: cats }, cleanAxis(),
        { axisTick: { show: false }, axisLabel: { color: SUB, fontSize: 11.5 } }),
      series: [
        {
          name: nameA, type: 'bar', data: valsA, barWidth: '30%',
          itemStyle: { color: 'rgba(45,212,191,0.85)', borderRadius: [0, 4, 4, 0] },
          label: { show: true, position: 'right', color: SUB, fontSize: 10.5,
                   fontVariant: 'tabular-nums' },
        },
        {
          name: nameB, type: 'bar', data: valsB, barWidth: '30%',
          itemStyle: { color: 'rgba(251,191,36,0.8)', borderRadius: [0, 4, 4, 0] },
          label: { show: true, position: 'right', color: SUB, fontSize: 10.5,
                   fontVariant: 'tabular-nums' },
        },
      ],
    }, true);
    $('h2hChartDesc').textContent =
      'Rates are % of matches with HT data (qualifying) / all matches (classic BTTS, clean sheets) · goal averages over all matches played';
  }

  function renderFocus() {
    var L = DATA.leagues[state.code];
    var wrap = $('focusContent'), empty = $('focusEmpty'), msg = $('focusMsg');
    msg.textContent = '';

    if (!L.all) {
      empty.textContent = 'No packed match history available for this league.';
      empty.classList.remove('hidden');
      wrap.classList.add('hidden');
      return;
    }
    var a = focusState.a, b = focusState.b;

    if (!a || !b) {
      empty.textContent = 'Select two teams above to reveal their head-to-head meetings, ' +
        'qualifying patterns and a side-by-side comparison.';
      empty.classList.remove('hidden');
      wrap.classList.add('hidden');
      return;
    }
    if (a === b) {
      empty.textContent = '“' + a + '” is selected for both slots — pick two different teams to compare them.';
      empty.classList.remove('hidden');
      wrap.classList.add('hidden');
      return;
    }

    empty.classList.add('hidden');
    wrap.classList.remove('hidden');

    var D = decodeAll(L);
    var ai = L.all.teams.indexOf(a), bi = L.all.teams.indexOf(b);
    var meetings = D.filter(function (m) {
      return (m.h === ai && m.a === bi) || (m.h === bi && m.a === ai);
    }).sort(byDateDesc);

    var qual = 0, evaluable = 0, btts = 0, goals = 0, winsA = 0, draws = 0, winsB = 0;
    var csA = 0, csB = 0;
    meetings.forEach(function (m) {
      var hasHt = m.h0 >= 0;
      if (hasHt) evaluable++;
      if (hasHt && isQual(m.h0, m.h1, m.f0, m.f1)) qual++;
      if (m.f0 > 0 && m.f1 > 0) btts++;
      goals += m.f0 + m.f1;
      var aScore = m.h === ai ? m.f0 : m.f1;
      var bScore = m.h === ai ? m.f1 : m.f0;
      if (aScore > bScore) winsA++;
      else if (aScore < bScore) winsB++;
      else draws++;
      if (bScore === 0) csA++;
      if (aScore === 0) csB++;
    });

    var sa = teamStats(D, ai), sb = teamStats(D, bi);

    // cross-link: when a selected team's top both-halves rival is the OTHER
    // selected team, call it out on the H2H chip
    var ra = topRival(sa), rb = topRival(sb);
    var cross = [];
    if (ra && ra.idx === bi) cross.push('top rival of ' + a);
    if (rb && rb.idx === ai) cross.push('top rival of ' + b);

    var kpis = $('h2hKpis');
    kpis.innerHTML = '';
    mkChip(kpis, 'Meetings', String(meetings.length), 'all seasons in this league', false);
    mkChip(kpis, 'With HT data', String(evaluable),
           evaluable ? 'rest shown as n/a' : 'none — rates unavailable', false);
    mkChip(kpis, 'Both halves ✔', String(qual),
           evaluable ? fmt1(100 * qual / evaluable) + '% of meetings with HT' +
             (cross.length ? ' · ' + cross.join(' and ') : '') : 'no HT data', true);
    mkChip(kpis, 'Classic BTTS', String(btts),
           meetings.length ? fmt1(100 * btts / meetings.length) + '% of meetings' : '—', false);
    mkChip(kpis, 'Avg goals', meetings.length ? fmt1(goals / meetings.length) : '—',
           'per meeting (FT)', false);
    mkChip(kpis, 'Record', winsA + ' · ' + draws + ' · ' + winsB,
           a + ' wins · draws · ' + b + ' wins', false);
    mkChip(kpis, 'Clean sheets', csA + ' · ' + csB,
           a + ' clean sheets · ' + b + ' clean sheets', false);

    renderMatchRows($('h2hRows'), meetings, {
      empty: 'No head-to-head meetings found between these two teams in this league ' +
             '(' + (L.all.seasons[0] || '') + ' → ' +
             (L.all.seasons[L.all.seasons.length - 1] || '') + ').',
      cells: function (m) {
        var pat = patternOf(m);
        return [
          { v: L.all.seasons[m.s] },
          { v: m.d, cls: 'num' },
          { v: L.all.teams[m.h] },
          { v: L.all.teams[m.a] },
          { v: m.h0 < 0 ? '' : m.h0 + '-' + m.h1, cls: 'score' },
          { v: m.f0 + '-' + m.f1, cls: 'score' },
          { badge: pat },
        ];
      },
    });

    renderTeamPanel($('panelA'), L, D, ai, 'a');
    renderTeamPanel($('panelB'), L, D, bi, 'b');
    renderOutlookBlock(L, D, ai, bi);

    if (!focusChart) focusChart = echarts.init($('h2hChart'));
    renderComparison(L, sa, sb, a, b);
    focusChart.resize();
  }

  /* ── wiring ──────────────────────────────────────── */
  var trendChart, teamsChart, matrixChart;

  function renderAll() {
    var L = DATA.leagues[state.code];
    renderLeagueBar(L, state.code);
    renderKpis(L);
    renderTrend(L);
    renderTeams(L);
    renderMatrix(L);
    seasonOptions(L);
    renderExplorer(L);
    // NOTE: renderFocus() is intentionally NOT part of renderAll — the team
    // focus section must stay independent of the league analysis refresh.
  }

  function initDataStamp() {
    var el = $('dataStamp');
    if (!el || !DATA.generated) return;
    var t = 'data updated ' + DATA.generated;
    if (DATA.src && DATA.src !== 'local') t += ' (source commit ' + DATA.src + ')';
    el.textContent = t;
  }

  function init() {
    initDataStamp();
    buildLeagueOptions();
    buildTeamOptions(DATA.leagues[state.code]);
    renderFocus();

    trendChart = echarts.init($('trend'));
    teamsChart = echarts.init($('teams'));
    matrixChart = echarts.init($('matrix'));

    window.addEventListener('resize', function () {
      trendChart.resize(); teamsChart.resize(); matrixChart.resize();
      if (focusChart) focusChart.resize();
    });

    $('teamA').addEventListener('change', function () {
      focusState.a = this.value;
      renderFocus();
    });
    $('teamB').addEventListener('change', function () {
      focusState.b = this.value;
      renderFocus();
    });
    $('swapTeams').addEventListener('click', function () {
      var ta = $('teamA'), tb = $('teamB');
      var tmp = ta.value; ta.value = tb.value; tb.value = tmp;
      focusState.a = ta.value; focusState.b = tb.value;
      renderFocus();
    });

    $('q').addEventListener('input', function () {
      state.q = this.value; state.page = 1;
      renderExplorer(DATA.leagues[state.code]);
    });
    $('seasonFilter').addEventListener('change', function () {
      state.season = this.value; state.page = 1;
      renderExplorer(DATA.leagues[state.code]);
    });
    document.querySelectorAll('#explorerTable thead th').forEach(function (th) {
      th.addEventListener('click', function () {
        var k = parseInt(th.getAttribute('data-key'), 10);
        if (state.sortKey === k) state.sortDir *= -1;
        else { state.sortKey = k; state.sortDir = 1; }
        document.querySelectorAll('thead th .arr').forEach(function (a) { a.remove(); });
        var arr = el('span', 'arr', state.sortDir === 1 ? '▲' : '▼');
        th.appendChild(arr);
        state.page = 1;
        renderExplorer(DATA.leagues[state.code]);
      });
    });
    // (sorting is scoped to the explorer table — team focus tables are static)
    $('prev').addEventListener('click', function () {
      if (state.page > 1) { state.page--; renderExplorer(DATA.leagues[state.code]); }
    });
    $('next').addEventListener('click', function () {
      state.page++;
      renderExplorer(DATA.leagues[state.code]);
    });

    renderAll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
