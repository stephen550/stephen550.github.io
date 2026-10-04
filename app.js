'use strict';
const C = {navy:'#003B49', teal:'#007D8A', red:'#BE3A34', green:'#1f8a4c', amber:'#d98a00', mut:'#5b6b70', gray:'#8a979b', light:'#c9d6d9'};
const COL = {g:C.green, y:C.amber, r:C.red, n:C.teal};
const LAB = {g:'ON TRACK', y:'WATCH', r:'OFF TRACK', n:'INFO'};
const TZ = 'America/Chicago';
let S = null;

// ---------- formatting
function usd(v, plus) {
  if (v === null || v === undefined || isNaN(v)) return '–';
  const a = Math.abs(v), s = v < 0 ? '-' : (plus && v > 0 ? '+' : '');
  if (a >= 1e6) return s + '$' + (a / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return s + '$' + (a / 1e3).toFixed(1) + 'K';
  return s + '$' + Math.round(a);
}
const usdK = v => Math.abs(v) >= 1e6 ? (v < 0 ? '-' : '') + '$' + (Math.abs(v) / 1e6).toFixed(1) + 'M' : (v < 0 ? '-' : '') + '$' + Math.round(Math.abs(v) / 1000) + 'K';
const usdM = v => '$' + (v / 1e6).toFixed(1) + 'M';
const pct = (v, d = 0) => (v * 100).toFixed(d) + '%';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const mon = (m, y) => { const d = new Date(m.slice(0, 10) + 'T12:00:00Z'); return d.toLocaleString('en-US', {month:'short', timeZone:'UTC'}) + (y ? ' ' + String(d.getUTCFullYear()).slice(2) : ''); };
function ct(ts) {
  if (!ts) return 'no data';
  const d = new Date(ts), now = new Date();
  const day = x => x.toLocaleDateString('en-US', {timeZone:TZ});
  const t = d.toLocaleTimeString('en-US', {timeZone:TZ, hour:'numeric', minute:'2-digit'});
  if (day(d) === day(now)) return t;
  return d.toLocaleDateString('en-US', {timeZone:TZ, month:'short', day:'numeric'}) + (now - d < 6 * 864e5 ? ' ' + t : '');
}
const feed = k => (S.feeds.find(f => f.feed === k) || {status:'NO DATA', label:k});
const last = a => a[a.length - 1];

// ---------- building blocks
function spark(vals, color, goal) {
  vals = vals.filter(v => v !== null && v !== undefined);
  if (vals.length < 2) return '';
  const w = 110, h = 38, all = goal !== undefined ? vals.concat([goal]) : vals;
  const lo = Math.min(...all), hi = Math.max(...all), rng = (hi - lo) || 1;
  const pts = vals.map((v, i) => [i * (w - 8) / (vals.length - 1) + 4, h - 4 - (v - lo) / rng * (h - 8)]);
  let g = '';
  if (goal !== undefined) { const gy = h - 4 - (goal - lo) / rng * (h - 8); g = `<line x1="0" x2="${w}" y1="${gy.toFixed(1)}" y2="${gy.toFixed(1)}" stroke="#9aa9ad" stroke-dasharray="4 3" stroke-width="1.5"/>`; }
  const [lx, ly] = last(pts);
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${g}<polyline points="${pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')}" fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="4.5" fill="${color}"/></svg>`;
}
// DATA CONFIDENCE (separate from on-track status). o.cf = [pct, reason]. Late feed caps it at 80% (red).
const CF_COL = p => p >= 100 ? C.green : p >= 89 ? C.amber : C.red;
function cfOf(o, stale, f) {
  let [p, why] = o.cf || [80, 'No confidence rule set for this tile yet.'];
  if (stale) { p = Math.min(p, 80); why = `Feed is ${String(f.status).toLowerCase()} (last load ${ct(f.last_loaded_at)}), so the number may be out of date. ` + why; }
  return [Math.max(0, Math.min(100, Math.round(p))), why];
}
function cfBadge(p, why) { return `<button type="button" class="cf" data-cfr="${esc(why)}" title="Data confidence ${p}%: ${esc(why)}" aria-label="Data confidence ${p} percent. ${esc(why)}"><i style="background:${CF_COL(p)}"></i>${p}%</button>`; }
function tile(o) {
  const f = o.feed ? feed(o.feed) : {status:'OK'};
  const stale = f.status !== 'OK';
  const [cp, cwhy] = cfOf(o, stale, f);
  const c = stale ? C.gray : COL[o.st];
  const pill = stale ? `⚠ ${esc(f.status)}` : LAB[o.st];
  return `<div class="tile${o.hero ? ' hero' : ''}${o.cls ? ' ' + o.cls : ''}${stale ? ' stale' : ''}" style="border-top-color:${c}">
 <div class="trow"><div class="ttitle">${esc(o.title)}</div><span class="st" style="background:${c}">${pill}</span></div>
 <div class="vrow"><div class="val">${o.val}</div>${o.spark ? spark(o.spark, c, o.goal) : ''}</div>
 <div class="sub">${o.sub}</div>
 <div class="own"><span class="lab ${o.label}">${o.label}</span>${esc(o.src)} · as of ${esc(ct(o.asof))}${cfBadge(cp, cwhy)}</div><div class="cfr" hidden></div></div>`;
}
function chartBox(title, sub, svg, extra) { return `<div class="chart"><h3>${title}</h3><div class="cs">${sub}</div>${svg}${extra || ''}</div>`; }

// line chart: series [{vals, color, width, dash, label}], labels [], hlines [{v,label,color}], estFrom index (hollow points from there)
function lineChart({labels, series, hlines = [], estFrom = 1e9, W = 600, H = 300, fmt = usdK}) {
  const L = 54, R = W - 92, T = 14, B = H - 30;
  const vals = series.flatMap(s => s.vals).concat(hlines.map(h => h.v)).filter(v => v !== null);
  let lo = Math.min(0, ...vals), hi = Math.max(...vals); const pad = (hi - lo) * .06; lo -= pad; hi += pad;
  const y = v => B - (v - lo) / (hi - lo) * (B - T), x = i => L + i * (R - L) / Math.max(1, labels.length - 1);
  const o = [];
  const step = niceStep((hi - lo) / 4);
  for (let g = Math.ceil(lo / step) * step; g <= hi; g += step) o.push(`<line x1="${L}" x2="${R}" y1="${y(g)}" y2="${y(g)}" stroke="${g === 0 ? '#9aa9ad' : '#e3eaec'}" stroke-width="${g === 0 ? 1.5 : 1}"/><text x="${L - 6}" y="${y(g) + 4}" text-anchor="end" font-size="12" fill="${C.mut}">${fmt(g)}</text>`);
  const every = Math.ceil(labels.length / (String(labels[0]).length > 4 ? 7 : 13)); labels.forEach((l, i) => { if ((labels.length - 1 - i) % every === 0) o.push(`<text x="${x(i)}" y="${B + 19}" text-anchor="middle" font-size="12" fill="${C.mut}">${l}</text>`); });
  hlines.forEach(h => o.push(`<line x1="${L}" x2="${R}" y1="${y(h.v)}" y2="${y(h.v)}" stroke="${h.color}" stroke-dasharray="7 5" stroke-width="2.2"/><text x="${R + 6}" y="${y(h.v) + 4}" font-size="12.5" font-weight="800" fill="${h.color}">${h.label}</text>`));
  series.forEach(s => {
    const pts = s.vals.map((v, i) => v === null ? null : [x(i), y(v)]).filter(Boolean);
    o.push(`<polyline points="${pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="${s.color}" stroke-width="${s.width || 3.5}" ${s.dash ? 'stroke-dasharray="' + s.dash + '"' : ''} stroke-linejoin="round"/>`);
    s.vals.forEach((v, i) => { if (v !== null && (i === s.vals.length - 1 || i >= estFrom)) o.push(`<circle cx="${x(i)}" cy="${y(v)}" r="5" fill="${i >= estFrom ? '#fff' : s.color}" stroke="${s.color}" stroke-width="2.5"/>`); });
    const lv = last(s.vals); if (s.label && lv !== null) o.push(`<text x="${R + 6}" y="${y(lv) + (s.dy || 4)}" font-size="13" font-weight="800" fill="${s.color}">${s.label}</text>`);
  });
  return `<svg viewBox="0 0 ${W} ${H}">${o.join('')}</svg>`;
}
function niceStep(r) { const p = Math.pow(10, Math.floor(Math.log10(Math.abs(r) || 1))); for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= r) return m * p; return 10 * p; }

// bars: labels, vals, ly (ghost), colors per bar, est flags
function barChart({labels, vals, ly, colors, est = [], W = 600, H = 300, fmt = usdK, goal, goalLabel}) {
  const L = 50, R = W - 10, T = 16, B = H - 30;
  const all = vals.concat(ly || []).concat(goal !== undefined ? [goal] : []).filter(v => v !== null && v !== undefined);
  let lo = Math.min(0, ...all), hi = Math.max(0, ...all); const pad = (hi - lo) * .08; hi += pad; if (lo < 0) lo -= pad;
  const y = v => B - (v - lo) / (hi - lo) * (B - T);
  const n = labels.length, bw = (R - L) / n, o = [];
  o.push(`<defs><pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="#fff"/><line x1="0" y1="0" x2="0" y2="7" stroke="${C.amber}" stroke-width="4"/></pattern></defs>`);
  const step = niceStep((hi - lo) / 4);
  for (let g = Math.ceil(lo / step) * step; g <= hi; g += step) o.push(`<line x1="${L}" x2="${R}" y1="${y(g)}" y2="${y(g)}" stroke="${g === 0 ? '#9aa9ad' : '#eef3f4'}"/><text x="${L - 6}" y="${y(g) + 4}" text-anchor="end" font-size="12" fill="${C.mut}">${fmt(g)}</text>`);
  labels.forEach((l, i) => {
    const cx = L + bw * i + bw / 2, w = bw * .62;
    if (ly && ly[i] !== null && ly[i] !== undefined) { const v = ly[i]; o.push(`<rect x="${cx - w / 2 - 4}" y="${Math.min(y(v), y(0))}" width="${w + 8}" height="${Math.abs(y(v) - y(0))}" rx="4" fill="#dfe7e9"/>`); }
    const v = vals[i];
    if (v !== null && v !== undefined) {
      const fill = est[i] ? 'url(#hatch)' : colors[i];
      o.push(`<rect x="${cx - w / 2}" y="${Math.min(y(v), y(0))}" width="${w}" height="${Math.max(1, Math.abs(y(v) - y(0)))}" rx="4" fill="${fill}" ${est[i] ? 'stroke="' + C.amber + '" stroke-width="2"' : ''}/>`);
      if (n <= 13) o.push(`<text x="${cx}" y="${v >= 0 ? y(v) - 4 : y(v) + 13}" text-anchor="middle" font-size="${n > 9 ? 10.5 : 12}" font-weight="800" fill="${C.navy}">${fmt(v)}</text>`);
    }
    o.push(`<text x="${cx}" y="${B + 19}" text-anchor="middle" font-size="12" fill="${C.mut}">${l}</text>`);
  });
  if (goal !== undefined) o.push(`<line x1="${L}" x2="${R}" y1="${y(goal)}" y2="${y(goal)}" stroke="${C.navy}" stroke-dasharray="7 5" stroke-width="2.2"/><text x="${R}" y="${y(goal) - 5}" text-anchor="end" font-size="12" font-weight="800" fill="${C.navy}">${goalLabel || ''}</text>`);
  return `<svg viewBox="0 0 ${W} ${H}">${o.join('')}</svg>`;
}
function legend(items) { return `<div class="cs" style="margin-top:4px">${items.map(([c, t, hatch]) => `<span style="display:inline-flex;align-items:center;gap:5px;margin-right:12px"><span style="width:12px;height:12px;border-radius:3px;background:${hatch ? 'repeating-linear-gradient(45deg,#d98a00 0 3px,#fff 3px 6px)' : c};${hatch ? 'border:1.5px solid #d98a00' : ''}"></span>${t}</span>`).join('')}</div>`; }

// ---------- data helpers
function season() {
  const now = new Date(new Date().toLocaleString('en-US', {timeZone:TZ}));
  const y = now.getMonth() >= 9 ? now.getFullYear() : now.getFullYear() - 1;
  const start = `${y}-10-01`, end = `${y + 1}-04-01`;
  const cur = S.rev_month.filter(r => r.month >= start && r.month < end).reduce((a, r) => a + r.revenue, 0);
  return {cur, ly: S.std_ly.value, asof: last(S.rev_month).as_of, start};
}
function gmByMonth() { return S.jc.map(r => ({month:r.month, gm:(r.rev - r.cost) / r.rev, rev:r.rev, cost:r.cost, jobs:r.jobs, as_of:r.as_of})); }
const kpi = id => (S.kpi.find(k => k.kpi_id === id) || {}).target_value;
// confidence helpers (see README "Data confidence"): tie = automated $0.00 check; st = straight from one report, not tied out yet
const CF = {
  tie: (passed, what, when, extra) => passed ? [100, `Ties exactly to ${what} ($0.00 diff, checked ${ct(when)}).${extra ? ' ' + extra : ''}`] : [85, `Tie-out to ${what} did NOT pass at the last check (${ct(when)}).`],
  st: what => [98, `Straight from ${what}, no estimating; no automated tie-out to the report total yet.`],
  ar: extra => CF.tie(S.ar_recon.passed, 'ServiceTitan AR report 385', S.ar_recon.run_at, extra),
  rev: () => CF.tie(S.recon.passed, 'ServiceTitan report 334 (12-month revenue)', S.recon.run_at),
  ebitda() { const T = last(S.ttm), n = T.est_months || 0; return n ? [Math.round(100 * (12 - n) / 12), `${12 - n} of 12 months are QBO closed books; ${n} month${n > 1 ? 's are' : ' is'} a CFO Desk estimate until the books close.`] : [100, 'All 12 months are QBO closed books.']; },
  fuel(lf) { if (!lf.through_date) return [85, 'Fuel card data has no through-date; month may be partial.']; const m = new Date(lf.month.slice(0, 10) + 'T12:00:00Z'), endD = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 0)).getUTCDate(), th = new Date(lf.through_date + 'T12:00:00Z'), miss = th.getUTCMonth() === m.getUTCMonth() ? endD - th.getUTCDate() : 0;
    return miss <= 0 ? CF.st('the fuel card files') : miss <= 3 ? [95, `Fuel card files run through ${md(lf.through_date)}; the last ${miss} day${miss > 1 ? 's' : ''} of ${mon(lf.month)} may still be missing.`] : [80, `Partial month: fuel card files only run through ${md(lf.through_date)}.`]; },
};

// ---------- shared helpers (v2: 10-tab layout from the approved mockup)
const md = d => { const x = new Date(d.slice(0, 10) + 'T12:00:00Z'); return (x.getUTCMonth() + 1) + '/' + x.getUTCDate(); };
const curMonth = () => { const n = new Date(new Date().toLocaleString('en-US', {timeZone:TZ})); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-01`; };
const curWeek = () => { const n = new Date(new Date().toLocaleString('en-US', {timeZone:TZ})); const d = (n.getDay() + 6) % 7; n.setDate(n.getDate() - d); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; };
const daysOld = d => Math.floor((Date.now() - new Date(d.length <= 10 ? d + 'T12:00:00' : d)) / 864e5);
const sum = (a, f) => a.reduce((t, r) => t + (Number(f(r)) || 0), 0);
const L = (k) => `<span class="lab ${k}">${k}</span>`;
function table(cols, rows, empty) {
  if (!rows.length) return `<div class="cs">${empty || 'Nothing to show.'}</div>`;
  return `<div class="tw"><table><tr>${cols.map(c => `<th class="${c.n ? 'n' : ''}${c.hs ? ' hs' : ''}">${c.h}</th>`).join('')}</tr>${rows.map(r => `<tr>${cols.map(c => `<td class="${c.n ? 'n' : ''}${c.hs ? ' hs' : ''}">${c.f(r)}</td>`).join('')}</tr>`).join('')}</table></div>`;
}
function hbars(rows, {fmt = usd, color = C.teal, W = 600} = {}) {
  if (!rows.length) return '<div class="cs">No data.</div>';
  const mx = Math.max(...rows.map(r => r.v)) || 1, rowH = 40, lw = 170;
  return `<svg viewBox="0 0 ${W} ${rows.length * rowH + 6}">${rows.map((r, i) => { const w = r.v / mx * (W - lw - 110); const y = 4 + i * rowH; return `<text x="${lw - 8}" y="${y + 22}" text-anchor="end" font-size="14" font-weight="700" fill="${C.navy}">${esc(String(r.k).slice(0, 22))}</text><rect x="${lw}" y="${y + 4}" width="${Math.max(2, w)}" height="28" rx="4" fill="${r.c || color}"/><text x="${lw + w + 6}" y="${y + 23}" font-size="13.5" font-weight="800" fill="${C.navy}">${r.t || fmt(r.v)}</text>`; }).join('')}</svg>`;
}
function stackOwner() {
  const owners = {}; S.ar_owner_bucket.forEach(r => { const o = owners[r.owner] = owners[r.owner] || [0, 0, 0]; o[r.age_bucket === '0-30' ? 0 : r.age_bucket === '31-60' ? 1 : 2] += r.amt; });
  const rows = Object.entries(owners).sort((a, b) => sum(b[1], x => x) - sum(a[1], x => x));
  const mx = Math.max(...rows.map(r => sum(r[1], x => x))) || 1, W = 600, lw = 130, rowH = 56, cols = [C.teal, C.amber, C.red];
  const bars = rows.map(([o, v], i) => { let x = lw; const y = 8 + i * rowH; const seg = v.map((a, j) => { const w = Math.max(0, a) / mx * (W - lw - 90); const s = `<rect x="${x}" y="${y}" width="${w}" height="38" fill="${cols[j]}"/>`; x += w; return s; }).join('');
    return `<text x="${lw - 8}" y="${y + 25}" text-anchor="end" font-size="15" font-weight="700" fill="${C.navy}">${esc(o)}</text>${seg}<text x="${x + 6}" y="${y + 25}" font-size="14" font-weight="800" fill="${C.navy}">${usdK(sum(v, a => a))}</text>`; }).join('');
  return `<svg viewBox="0 0 ${W} ${rows.length * rowH + 12}">${bars}</svg>` + legend([[C.teal, '0–30 days'], [C.amber, '31–60'], [C.red, '60+ days']]);
}
function multiLine({labels, series, W = 600, H = 300, fmt = v => v + '%', goal}) {
  const Lp = 44, R = W - 130, T = 14, B = H - 30, vals = series.flatMap(s => s.vals).filter(v => v !== null).concat(goal !== undefined ? [goal] : []);
  let lo = Math.min(0, ...vals), hi = Math.max(...vals) * 1.08;
  const y = v => B - (v - lo) / (hi - lo) * (B - T), x = i => Lp + i * (R - Lp) / Math.max(1, labels.length - 1), o = [];
  const step = niceStep((hi - lo) / 4);
  for (let g = Math.ceil(lo / step) * step; g <= hi; g += step) o.push(`<line x1="${Lp}" x2="${R}" y1="${y(g)}" y2="${y(g)}" stroke="#e3eaec"/><text x="${Lp - 6}" y="${y(g) + 4}" text-anchor="end" font-size="12" fill="${C.mut}">${fmt(g)}</text>`);
  labels.forEach((l, i) => o.push(`<text x="${x(i)}" y="${B + 19}" text-anchor="middle" font-size="12.5" fill="${C.mut}">${l}</text>`));
  if (goal !== undefined) o.push(`<line x1="${Lp}" x2="${R}" y1="${y(goal)}" y2="${y(goal)}" stroke="${C.navy}" stroke-dasharray="7 5" stroke-width="2"/><text x="${Lp + 4}" y="${y(goal) - 5}" font-size="12" font-weight="800" fill="${C.navy}">Goal ${fmt(goal)}</text>`);
  const used = [];
  series.forEach(s => {
    const pts = s.vals.map((v, i) => v === null ? null : [x(i), y(v)]).filter(Boolean);
    o.push(`<polyline points="${pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="${s.color}" stroke-width="3.5" stroke-linejoin="round"/>`);
    const lp = last(pts); if (!lp) return; o.push(`<circle cx="${lp[0]}" cy="${lp[1]}" r="5" fill="${s.color}"/>`);
    let ly = lp[1] + 5; while (used.some(u => Math.abs(u - ly) < 16)) ly += 16; used.push(ly);
    o.push(`<text x="${R + 10}" y="${ly}" font-size="14" font-weight="800" fill="${s.color}">${esc(s.label)}</text>`);
  });
  return `<svg viewBox="0 0 ${W} ${H}">${o.join('')}</svg>`;
}
function soon(title, what, needs) {
  return `<div class="soon"><div class="soonh">Coming next</div><h2>${esc(title)}</h2><p>${what}</p><p class="cs"><b>What it needs:</b> ${needs}</p><p class="cs">No numbers are shown here until a live data feed is connected.</p></div>`;
}
const section = (t, s) => `<div class="sect"><h2>${t}</h2>${s ? `<span>${s}</span>` : ''}</div>`;

// ---------- derived numbers
function D() {
  const cm = curMonth(), cw = curWeek(), t = S.targets;
  const weeks = S.rev_week.filter(r => r.week < cw).slice(-8), wkNow = S.rev_week.find(r => r.week === cw);
  const lastWk = last(weeks);
  const rpdGoal = kpi(1) || 21335;
  const gmAll = gmByMonth().filter(g => g.month < cm), lastGm = last(gmAll), gmGoal = (kpi(3) || 45) / 100;
  const depts = ['HVAC', 'Plumbing', 'Electrical'], gmMonths = [...new Set(S.gm_bu.filter(r => r.month < cm).map(r => r.month))].sort();
  const gmDept = depts.map(d => ({d, vals:gmMonths.map(m => { const r = S.gm_bu.find(x => x.grp === d && x.month === m); return r && r.rev ? Math.round(r.gp / r.rev * 1000) / 10 : null; })}));
  const csrDone = S.csr.filter(r => r.month < cm), lc = last(csrDone);
  const callsDone = S.calls.filter(r => r.month < cm), lcall = last(callsDone);
  const rec = S.recall.filter(r => r.month < cm), lrec = last(rec);
  const tw30 = S.tech_window.find(r => r.window_days === 30) || {}, tw90 = S.tech_window.find(r => r.window_days === 90) || {};
  const rv = S.reviews || {};
  const fm = S.fuel_month.filter(r => r.month < cm), lf = last(fm), pf = fm[fm.length - 2];
  return {cm, cw, t, weeks, wkNow, lastWk, rpdGoal, gmAll, lastGm, gmGoal, depts, gmMonths, gmDept, csrDone, lc, callsDone, lcall, rec, lrec, tw30, tw90, rv, fm, lf, pf, T:last(S.ttm), P:S.ttm[S.ttm.length - 2]};
}

// ---------- LOOK HERE (plain if-then rules on live data, worst first)
function looks() {
  const d = D(), out = [], t = d.t, T = d.T, need = S.needed[0];
  const add = (st, h, txt, src, tab) => out.push({st, h, txt, src, tab});
  if (T.ttm_ebitda < t.ttm_floor) add('r', `TTM EBITDA is ${usd(t.ttm_floor - T.ttm_ebitda)} below the floor`, `${usd(T.ttm_ebitda)} for the 12 months to ${mon(T.month, 1)}. Needs about ${usd(need.floor)} EBITDA (${usd(need.rev_floor)} revenue) a month to reach the floor by ${last(S.needed).month}.`, 'Finance / CFO Desk · ' + T.label, 'ov');
  const base = S.cash13.filter(r => r.scenario === 'Base'), bmin = base.reduce((a, r) => r.ending_cash < a.ending_cash ? r : a, base[0]);
  if (bmin && bmin.ending_cash < 0) add('r', `Cash forecast goes to ${usd(bmin.ending_cash)} the week of ${md(bmin.week_start)}`, '13-week forecast, base case. Plan for it now.', 'Finance / CFO Desk · ESTIMATE', 'ar');
  d.gmDept.forEach(g => { const v = g.vals, a = last(v), b = v[v.length - 2]; if (a !== null && b !== null && (a < 20 || a < b - 10)) add('r', `${g.d} job margin fell to ${a.toFixed(0)}% in ${mon(last(d.gmMonths))}`, `Was ${b.toFixed(0)}% the month before. Company goal ${pct(d.gmGoal)}. Check pricing and labor on ${g.d.toLowerCase()} jobs.`, 'Pricebook & Pay · ST 2469 · FACT', 'ov'); });
  if (d.lastWk && d.lastWk.rev / 5 < d.rpdGoal * .9) add('y', `Revenue per day ${usd(d.lastWk.rev / 5)} last week`, `Goal ${usd(d.rpdGoal)} (under review). Week of ${md(d.lastWk.week)}: ${usd(d.lastWk.rev)} job revenue on ${d.lastWk.jobs} jobs.`, 'Finance / CFO Desk · ST 2469', 'ov');
  if (S.over60.amt > 30000) add('y', `${usd(S.over60.amt)} of AR is over 60 days`, `${S.over60.customers} customers. No company target yet (idea: under $30K).${S.over60.no_owner ? ` ${S.over60.no_owner} have no owner (${usd(S.over60.no_owner_amt)}).` : ''}`, 'Finance / CFO Desk · ST 385', 'ar');
  if (S.unsent.ready_n > 0) add('y', `${S.unsent.ready_n} finished jobs not invoiced by email (${usd(S.unsent.ready_amt)})`, `${S.unsent.ready_noemail} have no email on file. ${S.unsent.held_n} more are on hold on purpose.`, 'Chief of Staff · ST 2427', 'un');
  const pv = PR(), top = (pv.open || []).slice(0, pv.visible || 7), nok = top.filter(r => r.needs_ok && !r.held);
  if (nok.length) add('r', `${nok.length} of your top priorities need your OK`, nok.map(r => r.title).join(' · '), 'Priorities list', 'act');
  const pdue = top.filter(r => r.due_on && daysOld(r.due_on) >= -3);
  pdue.forEach(r => add(daysOld(r.due_on) > 0 ? 'r' : 'y', `${r.title}: due ${new Date(r.due_on + 'T12:00:00').toLocaleDateString('en-US', {weekday:'short', month:'numeric', day:'numeric'})}`, r.next_step || '', r.owner_bot, 'act'));
  if (d.tw30.close_rate && d.tw30.close_rate < (kpi(10) || 35) / 100) add('y', `Estimate close rate ${pct(d.tw30.close_rate)} (30 days)`, `Goal ${kpi(10) || 35}%. 90-day rate ${pct(d.tw90.close_rate || 0)}. ${S.est_age[1].n} open estimates are 8–30 days old (${usd(S.est_age[1].amt)}).`, 'Ops / Dispatch · ST 325', 'est');
  if (S.est_nosales.length) add('y', `${S.est_nosales.length} big open estimates have no salesperson`, `Biggest ${usd(S.est_nosales[0].subtotal)}. Assign a Sold By.`, 'Ops / Dispatch', 'est');
  if (S.lk_fu_sum && S.lk_fu_sum.n > 0) add(S.lk_fu_sum.n > 20 ? 'r' : 'y', `${S.lk_fu_sum.n} estimates (${usd(S.lk_fu_sum.amt)}) have no follow-up after 48 h`, `Open estimates from the last 30 days with zero follow-ups logged in ServiceTitan. Biggest: ${(S.lk_fu || []).slice(0, 3).map(r => r.customer_name + ' ' + usd(r.max_subtotal)).join(', ')}.`, 'ST 85159837 · FACT', 'est');
  if (S.lk_hot_sum && S.lk_hot_sum.open > 0) add('y', `${S.lk_hot_sum.open} customers talked about buying with no estimate yet`, `Heard in recordings over the last 30 days; ServiceTitan shows no estimate since. Top: ${(S.lk_hot || []).slice(0, 3).map(r => r.customer_name).join(', ')}. Machine-matched (ESTIMATE).`, 'Recordings + ST estimates', 'est');
  if (S.lk_calls_sum && S.lk_calls_sum.open7_existing > 0) add('y', `${S.lk_calls_sum.open7_existing} existing customers called, missed, no callback`, `Last 7 days, no callback or booking within ${S.lk_calls_sum.hours || 4} h. ${S.lk_calls_sum.open7} missed callers in all.`, 'ST calls · ESTIMATE', 'est');
  if (S.lk_rs) { const e = S.lk_rs.find(r => r.window_days === 30 && r.scope === 'bu_group' && r.name === 'Electrical'), c = S.lk_rs.find(r => r.window_days === 30 && r.scope === 'company'); if (e && c && e.appts >= 10 && (e.reschedules + e.cancels) / e.appts > 1.2 * (c.reschedules + c.cancels) / c.appts) add('y', `Electrical reschedules + cancels ${pct((e.reschedules + e.cancels) / e.appts)} vs company ${pct((c.reschedules + c.cancels) / c.appts)}`, 'Last 30 days. See the electrical list on Estimates & sales.', 'ST job history · ESTIMATE', 'est'); }
  if (d.lcall && d.lcall.abandoned / d.lcall.calls > .15) add('y', `${pct(d.lcall.abandoned / d.lcall.calls)} of calls abandoned in ${mon(d.lcall.month)}`, `${d.lcall.abandoned} of ${d.lcall.calls} inbound calls. Check phone routing / after-hours answering before reading it as lost demand.`, 'Ops / Dispatch · ST 2246', 'mk');
  if (d.rv.w30 && d.rv.w30.unanswered > 0) add('y', `${d.rv.w30.unanswered} Google reviews in 30 days have no reply`, `Average rating ${d.rv.w30.avg}★ over 30 days (goal ${kpi(17) || 4.7}★).`, 'Brand · Birdeye', 'mk');
  if (d.rv.w7 && d.rv.w7.low > 0) add('y', `${d.rv.w7.low} low rating${d.rv.w7.low > 1 ? 's' : ''} (3★ or less) this week`, 'Call the customer and reply on Google.', 'Brand · Birdeye', 'mk');
  if (d.lf && d.pf && d.lf.fuel_usd > d.pf.fuel_usd * 1.25) add('y', `Fuel spend up ${pct(d.lf.fuel_usd / d.pf.fuel_usd - 1)} in ${mon(d.lf.month)}`, `${usd(d.lf.fuel_usd)} vs ${usd(d.pf.fuel_usd)} the month before.`, 'Fleet · fuel card', 'fl');
  S.bots.filter(b => b.status === 'STALE').forEach(b => add('y', `${b.bot} feed is late`, b.detail || '', 'Bot feeds', 'ov'));
  return out.sort((x, y) => (x.st === 'r' ? 0 : 1) - (y.st === 'r' ? 0 : 1));
}
function lookBox() {
  const ls = looks();
  return `<div class="lookbox"><div class="lookhead"><div class="eye">!</div><div><h2>LOOK HERE: bad trends</h2><span>Simple rules on live data, worst first. Tap one to open its tab.</span></div></div>
  ${ls.length ? ls.map(l => `<a class="look" href="#${l.tab}" data-go="${l.tab}" style="border-left-color:${COL[l.st]}"><div class="lic" style="background:${COL[l.st]}">${l.st === 'r' ? '!' : '?'}</div><div class="ltxt"><b>${esc(l.h)}</b><span>${esc(l.txt)}</span><i>Source: ${esc(l.src)}</i></div></a>`).join('') : '<div class="cs">Nothing flagged right now.</div>'}</div>`;
}
function botBox() {
  return `<div class="feeds"><h3>Bot feeds: last update</h3><div class="fgrid">${S.bots.map(b => {
    const c = b.status === 'OK' ? C.green : b.status === 'NOT LIVE' ? C.gray : b.status === 'STALE' ? C.amber : C.red;
    const tt = b.status === 'NOT LIVE' ? 'not live' : (b.status === 'OK' ? '' : b.status.toLowerCase() + ' · ') + ct(b.last_update);
    return `<div class="feed" title="${esc(b.detail || b.note || '')}"><span class="dot" style="background:${c}"></span><b>${esc(b.bot)}</b><span class="ft">${esc(tt)}</span></div>`; }).join('')}</div>
  <div class="cs" style="margin-top:8px">Time = last load of each bot's main feed (e.g. the action list for Chief of Staff). Dot turns yellow if any feed it owns is late. Hover for detail.</div></div>`;
}
const right = () => `<div class="right"><a class="todaylink desk" href="#today" data-go="today"><b>📋 Today</b><span>What needs you today, good news and bad trends now live on the Today tab.</span></a>${botBox()}</div>`;
const mobLook = () => '';

// ---------- Overview
function pageOv() {
  const d = D(), t = d.t, T = d.T, P = d.P, tt = S.ttm.slice(-13), need = S.needed[0], R = last(S.rev_ttm);
  const rpd = d.lastWk ? d.lastWk.rev / 5 : null;
  const csrRate = d.lc ? d.lc.booked / d.lc.lead_calls : null, bookGoal = (kpi(9) || 40) / 100;
  const ftf = d.lrec ? 1 - d.lrec.recalls / d.lrec.jobs : null, ftfGoal = (kpi(11) || 85) / 100;
  const rv = d.rv, rvGoal = kpi(17) || 4.7;
  const tiles = [
    tile({cf:[92, 'ST 2469 job-costing margin. ServiceTitan job costs can miss late-posted materials or labor and are not tied to QBO cost of goods.'], title:'Gross margin %', val:d.lastGm ? pct(d.lastGm.gm, 1) : '–', st:!d.lastGm ? 'n' : d.lastGm.gm >= d.gmGoal ? 'g' : d.lastGm.gm >= d.gmGoal - .05 ? 'y' : 'r', label:'FACT', feed:'dash_job_costing', asof:d.lastGm && d.lastGm.as_of,
      sub:`Goal ${pct(d.gmGoal)} (under review) · job margin, ${d.lastGm ? mon(d.lastGm.month) : ''} · ${d.lastGm ? d.lastGm.jobs : 0} jobs`, src:'ST 2469', spark:d.gmAll.map(g => g.gm * 100), goal:d.gmGoal * 100}),
    tile({cf:[96, 'ST 2469 job revenue for the last full week ÷ 5 workdays. The 12-month total ties to ST, but weekly figures are not tied out.'], title:'Revenue per day', val:rpd ? usd(rpd) : '–', st:!rpd ? 'n' : rpd >= d.rpdGoal ? 'g' : rpd >= d.rpdGoal * .9 ? 'y' : 'r', label:'FACT', feed:'dash_job_costing', asof:d.lastWk && d.lastWk.as_of,
      sub:`Goal ${usd(d.rpdGoal)} · ${rpd ? pct(rpd / d.rpdGoal) : '–'} of plan · last full week ÷ 5 workdays`, src:'ST 2469 job revenue', spark:d.weeks.map(w => w.rev / 5), goal:d.rpdGoal}),
    tile({cf:CF.st('ST 325 (technician rows summed into one company rate)'), title:'Estimate close rate', val:d.tw30.close_rate != null ? pct(d.tw30.close_rate) : '–', st:d.tw30.close_rate == null ? 'n' : d.tw30.close_rate >= (kpi(10) || 35) / 100 ? 'g' : d.tw30.close_rate >= (kpi(10) || 35) / 100 - .05 ? 'y' : 'r', label:'FACT', feed:'dash_sales', asof:d.tw30.as_of,
      sub:`Goal ${kpi(10) || 35}% · last 30 days · ${d.tw30.opps || 0} opportunities · 90-day ${d.tw90.close_rate != null ? pct(d.tw90.close_rate) : '–'}`, src:'ST 325 by technician'}),
    tile({cf:CF.st('the ST 2409 CSR report (last full month)'), title:'Call booking %', val:csrRate != null ? pct(csrRate) : '–', st:csrRate == null ? 'n' : csrRate >= bookGoal ? 'g' : csrRate >= bookGoal - .05 ? 'y' : 'r', label:'FACT', feed:'dash_marketing', asof:d.lc && d.lc.as_of,
      sub:`Goal ${pct(bookGoal)} (stretch 45%) · ${d.lc ? mon(d.lc.month) + ': ' + d.lc.booked + ' of ' + d.lc.lead_calls + ' lead calls' : ''}`, src:'ST 2409 CSR report', spark:d.csrDone.slice(-7).map(r => r.lead_calls ? r.booked / r.lead_calls * 100 : null), goal:bookGoal * 100}),
    tile({cf:CF.ar('60+ bucket comes from the same rows.'), title:'AR over 60 days', val:usd(S.over60.amt), st:S.over60.amt > 30000 ? 'r' : 'g', label:'FACT', feed:'dash_ar_aging', asof:S.over60.as_of,
      sub:`No target set yet (idea: under $30K) · ${S.over60.customers} customers`, src:'ST 385'}),
    tile({cf:[96, 'ST 2427 unsent invoices minus the hand-kept hold list.'], title:'Unsent invoices', val:usd(S.unsent.ready_amt), st:S.unsent.ready_n ? (S.unsent.ready_amt > 5000 ? 'r' : 'y') : 'g', label:'FACT', feed:'dash_unsent', asof:S.unsent.as_of,
      sub:`Goal $0 by end of day · ${S.unsent.ready_n} to send · ${S.unsent.held_n} on hold`, src:'ST 2427'}),
    tile({cf:[98, 'Birdeye copy of Google reviews (synced hourly); can lag Google by up to an hour.'], title:'New reviews (week)', val:rv.w7 ? String(rv.w7.n) : '–', st:!rv.w7 ? 'n' : (rv.w7.avg || 0) >= rvGoal ? 'g' : 'y', label:'FACT', feed:'birdeye_sync', asof:rv.as_of,
      sub:`Google, last 7 days · ${rv.w7 && rv.w7.avg ? rv.w7.avg + '★' : '–'} avg · goal ${rvGoal}★ · 30-day ${rv.w30 && rv.w30.avg ? rv.w30.avg + '★' : '–'}`, src:'Birdeye', spark:(rv.weekly || []).map(w => w.n)}),
    tile({cf:[75, 'A proxy, not a measured rate: 100% minus jobs flagged as recalls in ServiceTitan. Recalls nobody flagged are missed.'], title:'First-time fix rate', val:ftf != null ? pct(ftf, 1) : '–', st:ftf == null ? 'n' : ftf >= ftfGoal ? 'g' : 'y', label:'ESTIMATE', feed:'dash_job_costing', asof:d.lrec && d.lrec.as_of,
      sub:`Goal ${pct(ftfGoal)} · ${d.lrec ? d.lrec.recalls + ' recalls of ' + d.lrec.jobs + ' jobs in ' + mon(d.lrec.month) : ''} · 100% − recall-flagged jobs`, src:'ST 2469 recall flag', spark:d.rec.map(r => (1 - r.recalls / r.jobs) * 100), goal:ftfGoal * 100}),
  ];
  const wk = d.weeks.concat(d.wkNow ? [d.wkNow] : []), goalWk = d.rpdGoal * 5;
  const c1 = barChart({labels:wk.map(w => md(w.week)), vals:wk.map(w => w.rev), colors:wk.map(w => w.week === d.cw ? C.gray : w.rev >= goalWk ? C.teal : C.red), goal:goalWk, goalLabel:'Goal ' + usdK(goalWk) + '/wk'});
  const c2 = multiLine({labels:d.gmMonths.map(m => mon(m)), series:d.gmDept.map((g, i) => ({vals:g.vals, color:[C.teal, C.red, C.amber][i], label:`${g.d} ${last(g.vals) !== null ? last(g.vals).toFixed(0) + '%' : ''}`})), goal:d.gmGoal * 100});
  // profit goals section
  const st = v => v >= t.ttm_goal ? 'g' : v >= t.ttm_floor ? 'y' : 'r';
  const pt = [
    tile({cf:CF.ebitda(), title:'TTM EBITDA vs. profit goals', val:usd(T.ttm_ebitda), st:st(T.ttm_ebitda), label:T.label, feed:'dash_pl_qbo', asof:T.as_of,
      sub:`Floor ${usd(t.ttm_floor)} · goal ${usd(t.ttm_goal)} · stretch ${usd(t.ttm_stretch)}<br><b>${usd(t.ttm_floor - T.ttm_ebitda)} to the floor</b> · ${mon(S.ttm[S.ttm.length - 12].month, 1)}–${mon(T.month, 1)}`,
      src:T.est_months ? `${12 - T.est_months} mo QBO closed + ${T.est_months} mo estimate` : '12 mo QBO closed', spark:tt.map(r => r.ttm_ebitda)}),
    tile({cf:(S.adjust.proposed ? [Math.min(CF.ebitda()[0], 80), `${S.adjust.proposed} of ${S.adjust.proposed + S.adjust.confirmed} add-backs are proposed, not confirmed. ` + CF.ebitda()[1]] : CF.ebitda()), title:'TTM Adjusted EBITDA', val:usd(T.ttm_adj_ebitda), st:st(T.ttm_adj_ebitda), label:'ESTIMATE', feed:'dash_pl_qbo', asof:S.adjust.as_of,
      sub:`Adjustments ${usd(S.adjust.total, 1)} · ${S.adjust.confirmed} confirmed, ${S.adjust.proposed} proposed`, src:'EBITDA + adjustments table', spark:tt.map(r => r.ttm_adj_ebitda)}),
    tile({cf:[CF.ebitda()[0], 'Math on the set profit-goal targets and TTM EBITDA, so it is only as certain as the EBITDA tile. ' + CF.ebitda()[1]], title:'EBITDA needed per month', val:usd(need.floor), st:T.month_ebitda >= need.floor ? 'g' : 'r', label:'ESTIMATE', feed:'dash_pl_qbo', asof:T.as_of,
      sub:`To reach the floor by ${last(S.needed).month} · ${mon(T.month)} was ${usd(T.month_ebitda)} · ≈${usd(need.rev_floor)} revenue/mo`, src:'Targets table'}),
    tile({cf:CF.rev(), title:'TTM revenue', val:usd(R.ttm), st:R.ttm >= S.rev_ttm[S.rev_ttm.length - 2].ttm ? 'g' : 'y', label:'FACT', feed:'dash_revenue', asof:R.as_of,
      sub:`a year ago ${usd(S.rev_ttm[0].ttm)} · ties to ServiceTitan ${S.recon.passed ? '✓' : '✗'}`, src:'ST 334', spark:S.rev_ttm.map(r => r.ttm)}),
  ];
  const estIdx = tt.findIndex(r => r.label === 'ESTIMATE');
  const p1 = lineChart({labels:tt.map(r => mon(r.month)), estFrom:estIdx < 0 ? 1e9 : estIdx,
    series:[{vals:tt.map(r => r.ttm_adj_ebitda), color:C.amber, width:2.5, dash:'5 4', label:'Adj.', dy:-6}, {vals:tt.map(r => r.ttm_ebitda), color:C.red, label:usdK(T.ttm_ebitda), dy:12}],
    hlines:[{v:t.ttm_stretch, label:'Stretch ' + usdM(t.ttm_stretch), color:C.green}, {v:t.ttm_goal, label:'Goal ' + usdM(t.ttm_goal), color:C.teal}, {v:t.ttm_floor, label:'Floor ' + usdM(t.ttm_floor), color:C.navy}]});
  const em = S.ebitda_monthly.slice(-12), lyOf = m => { const r = S.ebitda_monthly.find(x => x.month === (Number(m.slice(0, 4)) - 1) + m.slice(4)); return r ? r.ebitda : null; };
  const p2 = barChart({labels:em.map(r => mon(r.month)), vals:em.map(r => r.ebitda), ly:em.map(r => lyOf(r.month)), colors:em.map(r => r.ebitda >= (lyOf(r.month) ?? -1e12) ? C.teal : C.red), est:em.map(r => r.label === 'ESTIMATE')});
  const tbl = table([{h:'Month', f:r => `<b>${esc(r.month.slice(0, 3) + ' ' + r.month.slice(-2))}</b>`}, {h:'Beat LY EBITDA ' + L('FACT'), n:1, f:r => usd(r.ly_ebitda)}, {h:'Floor/mo ' + L('ESTIMATE'), n:1, f:r => usd(r.floor)}, {h:'Goal/mo', n:1, hs:1, f:r => usd(r.goal)}, {h:'Revenue/mo for floor', n:1, f:r => usd(r.rev_floor)}, {h:'LY revenue', n:1, f:r => usd(r.ly_rev)}, {h:'MTD', n:1, f:r => r.rev_mtd ? usd(r.rev_mtd) : ''}], S.needed);
  // profit order: EBITDA + margin, then revenue/sales, then cash collection, then reviews/quality
  const all = [pt[0], tiles[0], pt[2], pt[1], tiles[1], pt[3], tiles[2], tiles[3], tiles[4], tiles[5], tiles[6], tiles[7]];
  return `<div class="cols"><div class="left">
   ${section('Profit goals & key numbers', 'Top to bottom by how much each drives profit. TTM EBITDA: QBO closed months are FACT; later months are ESTIMATES until the books close.')}
   <div class="grid">${all.join('')}</div>${mobLook()}
   <div class="charts two">
    ${chartBox('TTM EBITDA vs. profit goals', 'Solid red = EBITDA, dashed amber = adjusted. Hollow dot = includes an estimate month.', p1)}
    ${chartBox('EBITDA by month vs last year', 'Gray = same month last year. Teal = beat last year. Hatched = estimate.', p2, legend([[C.teal, 'beat LY'], [C.red, 'below LY'], ['', 'estimate', 1], ['#dfe7e9', 'last year']]))}
   </div>
   <div class="charts two">
    ${chartBox('Gross margin by department', `Job margin by month (complete months) · ${L('FACT')} ST 2469 job types · ${esc(ct(d.lastGm && d.lastGm.as_of))}`, c2)}
    ${chartBox('Revenue by week vs goal', `Job revenue by invoice week · dashed = goal ${usdK(goalWk)}/week (${usd(d.rpdGoal)}/day × 5) · gray = this week so far · ${L('FACT')} ST 2469`, c1)}
   </div>
   <div class="chart"><h3>What each month needs (to ${esc(last(S.needed).month)})</h3><div class="cs">To keep TTM rising, beat last year's month. To reach the floor, hit the floor column.</div>${tbl}
    <div class="cs" style="margin-top:8px">Revenue check: TTM ${usd(S.recon.dash_total)} = ServiceTitan ${usd(S.recon.reference_total)} (diff $${Number(S.recon.diff).toFixed(2)}) · ${S.recon.passed ? '✅ PASS' : '❌ CHECK'} · ${esc(ct(S.recon.run_at))}</div></div>
   ${chartBox('Money owed to us, by owner', `Open AR by collections owner and age · ${L('FACT')} ST 385 · ${esc(ct(S.ar.as_of))}`, stackOwner())}
  </div>${right()}</div>`;
}

// ---------- Collections / AR
function pageAR() {
  const ar = S.ar, o60 = S.over60;
  const base = S.cash13.filter(r => r.scenario === 'Base'), low = S.cash13.filter(r => r.scenario === 'Low');
  const bmin = base.reduce((a, r) => r.ending_cash < a.ending_cash ? r : a, base[0]), lmin = low.reduce((a, r) => r.ending_cash < a.ending_cash ? r : a, low[0]);
  const bk = last(S.bank), b90 = S.ar_buckets.find(b => b.bucket === '90+') || {amt:0};
  const tiles = [
    tile({cf:CF.ar('60+ bucket comes from the same rows.'), title:'AR over 60 days', val:usd(o60.amt), st:o60.amt > 30000 ? 'r' : 'g', label:'FACT', feed:'dash_ar_aging', asof:o60.as_of, sub:`${o60.customers} customers · no target yet (idea: under $30K)`, src:'ST 385'}),
    tile({cf:CF.ar('90+ bucket comes from the same rows.'), title:'Over 90 days', val:usd(b90.amt), st:b90.amt > 20000 ? 'r' : 'y', label:'FACT', feed:'dash_ar_aging', asof:ar.as_of, sub:'Oldest money; most at risk', src:'ST 385'}),
    tile({cf:[95, 'Dollars tie to ST 385; who owns each account comes from our hand-kept collections owner table.'], title:'60+ days with no owner', val:usd(o60.no_owner_amt || 0), st:o60.no_owner ? 'y' : 'g', label:'FACT', feed:'dash_ar_aging', asof:o60.as_of, sub:`${o60.no_owner} customers · assign an owner`, src:'AR rules'}),
    tile({cf:CF.ar(), title:'Total open AR', val:usd(ar.open_ar), st:'n', label:'FACT', feed:'dash_ar_aging', asof:ar.as_of, sub:`${ar.n} open items · ties to ST 385 ${S.ar_recon.passed ? '✓' : '✗'}`, src:'ST 385'}),
    tile({cf:[70, '13-week cash forecast from the CFO Desk model (base case), not actual bank balances.'], title:'Cash low point (13 weeks)', val:usd(bmin.ending_cash), st:bmin.ending_cash < 0 ? 'r' : bmin.ending_cash < bmin.min_cash_target ? 'y' : 'g', label:'ESTIMATE', feed:'dash_cash13', asof:bmin.file_mtime, sub:`Base case, week of ${md(bmin.week_start)} · low case ${usd(lmin.ending_cash)}`, src:'CFO Desk forecast', spark:base.map(r => r.ending_cash), goal:0}),
    tile({cf:[95, 'Bank history totals; owner money is removed by a tagging rule, so a mis-tagged transfer would shift the net.'], title:`Bank: ${bk ? mon(bk.month) : ''} net`, val:bk ? usd(bk.inflow - bk.outflow) : '–', st:bk && bk.inflow >= bk.outflow ? 'g' : 'r', label:'FACT', feed:'dash_cash13', asof:bk && bk.as_of, sub:bk ? `In ${usd(bk.inflow)} (excl. owner money) · out ${usd(bk.outflow)}` : '', src:'Bank history', spark:S.bank.map(r => r.inflow - r.outflow), goal:0}),
  ];
  const c1 = barChart({labels:S.ar_buckets.map(b => b.bucket + ' d'), vals:S.ar_buckets.map(b => b.amt), colors:[C.teal, C.amber, C.red, C.red]});
  const c3 = lineChart({labels:base.map(r => md(r.week_start)), series:[{vals:low.map(r => r.ending_cash), color:C.red, width:2.5, dash:'5 4', label:'Low'}, {vals:base.map(r => r.ending_cash), color:C.navy, label:'Base'}], hlines:[{v:base[0].min_cash_target, label:'Min ' + usd(base[0].min_cash_target), color:C.amber}]});
  const t60 = table([{h:'Customer', f:r => `${esc(r.customer)}<div class="mini">${esc(r.next_action || '')}</div>`}, {h:'60+ days', n:1, f:r => `<b>${usd(r.over_60)}</b>`}, {h:'Open', n:1, f:r => usd(r.open_total)}, {h:'Owner', f:r => esc(r.owner)}], S.top60);
  return `<div class="cols"><div class="left"><div class="grid g3">${tiles.join('')}</div>${mobLook()}
   ${chartBox('Biggest AR over 60 days', `Top customers with the next step · ${L('FACT')}`, t60)}
   <div class="charts">
    ${chartBox('Open AR by age', `Days past due, net of credits · ${L('FACT')} ST 385 · ${esc(ct(ar.as_of))}`, c1)}
    ${chartBox('Money owed to us, by owner', `By collections owner and age · ${L('FACT')}`, stackOwner())}
    ${chartBox('13-week cash: base vs low case', `Ending cash by week · ${L('ESTIMATE')} CFO Desk forecast · file ${esc(ct(base[0].file_mtime))}`, c3)}
   </div>
  </div>${right()}</div>`;
}

// ---------- Unsent invoices
function pageUnsent() {
  const u = S.unsent, ready = S.unsent_list.filter(r => !r.hold);
  const oldest = ready.reduce((a, r) => r.completed_date && (!a || r.completed_date < a) ? r.completed_date : a, null);
  const tiles = [
    tile({cf:[96, 'ST 2427 unsent invoices minus the hand-kept hold list.'], title:'Ready to send', val:usd(u.ready_amt), st:u.ready_n ? (u.ready_amt > 5000 ? 'r' : 'y') : 'g', label:'FACT', feed:'dash_unsent', asof:u.as_of, sub:`${u.ready_n} invoices · goal $0 by end of day`, src:'ST 2427'}),
    tile({cf:CF.st('ST 2427 job finish dates'), title:'Oldest unsent', val:oldest ? daysOld(oldest) + ' days' : '–', st:!oldest ? 'g' : daysOld(oldest) > 3 ? 'y' : 'g', label:'FACT', feed:'dash_unsent', asof:u.as_of, sub:oldest ? `Job finished ${md(oldest)}` : 'Nothing waiting', src:'ST 2427'}),
    tile({cf:CF.st('ST 2427 and the customer email field'), title:'No email on file', val:String(u.ready_noemail), st:u.ready_noemail ? 'y' : 'g', label:'FACT', feed:'dash_unsent', asof:u.as_of, sub:'Get an email or mail/text the invoice', src:'ST 2427'}),
    tile({cf:[95, 'Hand-kept hold list matched to ST 2427 invoices.'], title:'On hold on purpose', val:usd(u.held_amt), st:'n', label:'FACT', feed:'dash_invoice_holds', asof:u.as_of, sub:`${u.held_n} invoices on the hold list`, src:'Hold list + ST 2427'}),
  ];
  const c1 = barChart({labels:S.unsent_age.map(b => b.bucket), vals:S.unsent_age.map(b => b.amt), colors:[C.teal, C.amber, C.red, C.red]});
  const tr = table([{h:'Invoice', f:r => esc(r.invoice)}, {h:'Customer', f:r => esc(r.customer) + (r.has_email ? '' : ' <span class="warnt">no email</span>')}, {h:'Finished', f:r => r.completed_date ? md(r.completed_date) : ''}, {h:'Balance', n:1, f:r => usd(r.amount)}, {h:'Do', f:() => `<span class="pill" style="background:${C.green}">SEND</span>`}], ready, '✅ Nothing waiting to be sent.');
  const th = table([{h:'Invoice', f:r => esc(r.invoice)}, {h:'Customer', f:r => esc(r.customer)}, {h:'Balance', n:1, f:r => usd(r.balance)}, {h:'Why held', f:r => `<span class="mini">${esc(r.reason || '')}</span>`}], S.held_list);
  const tt = table([{h:'Technician', f:r => esc(r.tech)}, {h:'Invoices', n:1, f:r => r.n}, {h:'Amount', n:1, f:r => usd(r.amt)}], S.unsent_tech, 'None.');
  return `<div class="cols"><div class="left"><div class="grid">${tiles.join('')}</div>${mobLook()}
   <div class="charts two">
    ${chartBox('Send these now', `Finished jobs with a balance, not emailed · ${L('FACT')} ST 2427 · ${esc(ct(u.as_of))}`, tr)}
    ${chartBox('Ready to send, by age', `Days since the job finished · ${L('FACT')}`, c1)}
   </div>
   <div class="charts two">
    ${chartBox('On hold (do not send yet)', `From the hold list, biggest first · ${L('FACT')} · ${esc(ct(S.held_list[0] && S.held_list[0].synced_at))}`, th)}
    ${chartBox('Ready to send, by technician', `Who finished the job · ${L('FACT')}`, tt)}
   </div>
  </div>${right()}</div>`;
}

// ---------- Estimates & sales
function pageEst() {
  const d = D(), e = S.est_sum, tw = d.tw30, bw = S.booked_weekly.filter(r => r.week < d.cw), lbw = last(bw);
  const mm = S.memb_monthly.filter(r => r.month < d.cm), lmm = last(mm), am = S.metrics.active_memberships;
  const crGoal = (kpi(10) || 35) / 100;
  const tiles = [
    tile({cf:CF.st('ST 325 (technician rows summed)'), title:'Sold (30 days)', val:usd(tw.sales), st:'n', label:'FACT', feed:'dash_sales', asof:tw.as_of, sub:`${md(tw.pf)}–${md(tw.pt)} · 90 days ${usd(d.tw90.sales)}`, src:'ST 325'}),
    tile({cf:CF.st('ST 325 (technician rows summed into one company rate)'), title:'Close rate (30 days)', val:tw.close_rate != null ? pct(tw.close_rate) : '–', st:tw.close_rate == null ? 'n' : tw.close_rate >= crGoal ? 'g' : tw.close_rate >= crGoal - .05 ? 'y' : 'r', label:'FACT', feed:'dash_sales', asof:tw.as_of, sub:`Goal ${pct(crGoal)} · 90-day ${d.tw90.close_rate != null ? pct(d.tw90.close_rate) : '–'} · ${tw.opps} opportunities`, src:'ST 325'}),
    tile({cf:CF.st('the ServiceTitan estimates feed'), title:'Follow up now (8–30 days)', val:usd(S.est_age[1].amt), st:S.est_age[1].n > 100 ? 'y' : 'n', label:'FACT', feed:'dash_sales', asof:e.as_of, sub:`${S.est_age[1].n} open estimates in the follow-up window`, src:'ST estimates'}),
    tile({cf:CF.st('the ServiceTitan estimates feed'), title:'Open estimates (≤90 days)', val:usd(e.amt90), st:'n', label:'FACT', feed:'dash_sales', asof:e.as_of, sub:`${e.n90} estimates · ${S.est_age[0].n} new this week`, src:'ST estimates'}),
    tile({cf:CF.st('ServiceTitan memberships'), title:'Active memberships', val:am ? Math.round(am.value).toLocaleString() : '–', st:'n', label:'FACT', feed:'dash_sales', asof:am && am.as_of, sub:lmm ? `${lmm.conv} sold in ${mon(lmm.month)}` : '', src:'ST memberships', spark:mm.slice(-8).map(r => r.conv)}),
    tile({cf:CF.st('ServiceTitan jobs'), title:'Jobs booked last week', val:lbw ? String(lbw.booked) : '–', st:'n', label:'FACT', feed:'dash_sales', asof:lbw && lbw.as_of, sub:lbw ? `Week of ${md(lbw.week)} · ${lbw.canceled} canceled` : '', src:'ST jobs', spark:bw.map(r => r.booked)}),
  ];
  const c1 = barChart({labels:S.est_age.map(b => b.bucket + ' d'), vals:S.est_age.map(b => b.amt), colors:[C.teal, C.amber, C.red, C.gray]});
  const c2 = barChart({labels:bw.map(r => md(r.week)), vals:bw.map(r => r.booked), colors:bw.map(() => C.teal), fmt:v => String(Math.round(v))});
  const ts = table([{h:'Technician', f:r => esc(r.technician)}, {h:'Sold', n:1, f:r => usd(r.total_sales)}, {h:'Close', n:1, f:r => r.close_rate != null ? `<b style="color:${r.close_rate >= crGoal ? C.green : C.red}">${pct(r.close_rate)}</b>` : '–'}, {h:'Opps', n:1, hs:1, f:r => r.sales_opportunities}, {h:'Avg sale', n:1, f:r => usd(r.closed_avg_sale)}], S.tech_sales);
  const fu = table([{h:'Estimate', f:r => `${esc(r.name)}<div class="mini">${esc(r.business_unit || '')}</div>`}, {h:'Amount', n:1, f:r => `<b>${usd(r.subtotal)}</b>`}, {h:'Age', n:1, f:r => r.age + ' d'}, {h:'Sold by', f:r => esc(r.sold_by)}], S.est_follow);
  return `<div class="cols"><div class="left"><div class="grid g3">${tiles.join('')}</div>${mobLook()}
   <div class="charts two">
    ${chartBox('Technician sales, last 30 days', `Close rate vs goal ${pct(crGoal)} · ${L('FACT')} ST 325`, ts)}
    ${chartBox('Biggest estimates to follow up', `Open 3–30 days, biggest first · ${L('FACT')}`, fu)}
   </div>
   <div class="charts two">
    ${chartBox('Open estimates by age', `Dollar value of open estimates · ${L('FACT')} ST · ${esc(ct(e.as_of))}`, c1)}
    ${chartBox('Jobs booked by week', `All departments · ${L('FACT')} ST jobs`, c2)}
   </div>
   ${leaks()}
  </div>${right()}</div>`;
}

// ---------- Revenue leaks (load_leaks.py, daily): heard-not-estimated, missed calls, reschedules & cancels by tech
let hotBusy = false;
const LK_FEEDS = ['dash_est_followup', 'dash_hot_leads', 'dash_leak_calls', 'dash_leak_resched'];
function leakBanner() {
  if (!S.feeds) return '';
  const bad = LK_FEEDS.map(feed).filter(f => f.status !== 'OK');
  return bad.length ? `<div class="banner warn">⚠ Late data in this section: ${bad.map(f => `${esc(f.label)} (${esc(String(f.status).toLowerCase())}, last load ${esc(ct(f.last_loaded_at))})`).join('; ')}. Gray tiles are not current.</div>` : '';
}
const rate = (n, d) => d ? pct(n / d) : '–';
function leaks() {
  if (!S.lk_rs) return '';
  const hs = S.lk_hot_sum || {}, hot = S.lk_hot || [], cs = S.lk_calls_sum || {}, rec = S.lk_calls_recon || {}, cd = S.lk_calls_daily || [];
  const rs = w => S.lk_rs.filter(r => r.window_days === w);
  const comp = w => rs(w).find(r => r.scope === 'company') || {};
  const elec = w => rs(w).find(r => r.scope === 'bu_group' && r.name === 'Electrical') || {};
  const c30 = comp(30), e30 = elec(30), c7 = comp(7), e7 = elec(7);
  const jv = w => rs(w).filter(r => r.scope === 'tech' && r.bu_group === 'Electrical' && r.appts >= 3);
  const done7 = cd.filter(r => daysOld(r.ct_date) >= 1 && daysOld(r.ct_date) <= 7);
  const m7 = sum(done7, r => r.missed), in7 = sum(done7, r => r.lead_inbound), un7 = sum(done7, r => r.unresolved_numbers);
  const recCf = rec.pct == null ? [85, 'No tie-out to ServiceTitan report 2319 yet.'] : rec.pct >= 100 ? [100, `Missed-call IDs tie exactly to ServiceTitan report 2319 (Unbooked and Abandoned Calls) for ${md(rec.period_from)}–${md(rec.period_to)}.`] : [Math.min(99, Math.max(0, Math.round(rec.pct))), `${rec.matched} of ${Math.max(rec.export_n, rec.report_n)} missed calls match ST report 2319 for ${md(rec.period_from)}–${md(rec.period_to)} (${rec.pct}%). ${rec.note || ''}`];
  const cbCf = [80, `ESTIMATE: "no callback" = no outbound call to that number, no booked call and no new job for that customer within ${cs.hours || 4} h in ServiceTitan. Calls or texts from cell phones outside ServiceTitan are not seen.`];
  const hotCf = [70, 'ESTIMATE: names are matched from recordings to ServiceTitan customers by machine. Hand spot-check found some false matches; read the snippet before acting.'];
  const rsCf = [75, 'ESTIMATE: ServiceTitan logs who clicked Reschedule (office almost always), not who asked. Reschedules = days a job was moved, excluding the first hour after booking and same-day time shuffles. Initiator comes from cancel reasons and job notes only.'];
  const fs = S.lk_fu_sum || {};
  const tiles = [
    tile({cf:[85, 'ESTIMATE: canceled job value = job total, else the largest estimate option on the job, else the median completed ticket for that department. "Rebooked" = same customer got a new job within 14 days (or the job was un-canceled).'], title:'Canceled $, not rebooked (30 d)', val:usd(c30.canceled_value_lost), st:(c30.canceled_value_lost || 0) > 20000 ? 'y' : 'n', label:'ESTIMATE', feed:'dash_leak_resched', asof:c30.as_of, sub:`${c30.cancels_not_rebooked || 0} of ${c30.cancels || 0} cancels not rebooked · ${c30.saved_pct != null ? pct(c30.saved_pct) : '–'} of at-risk jobs saved by a reschedule · ${c30.cancel_tech || 0} tech-caused`, src:'ST cancel log + jobs'}),
    tile({cf:[98, 'Straight from ServiceTitan report 85159837 Unsold Estimates (its own follow-up count). Options on one job are grouped; the largest option is shown.'], title:'Estimates, no follow-up after 48 h', val:usd(fs.amt), st:(fs.n || 0) > 20 ? 'r' : (fs.n || 0) > 5 ? 'y' : 'g', label:'FACT', feed:'dash_est_followup', asof:fs.as_of, sub:`${fs.n || 0} open estimates (2–30 days old) with zero follow-ups logged in ServiceTitan · ${fs.called || 0} did get an outbound call`, src:'ST 85159837'}),
    tile({cf:hotCf, title:'Heard, not estimated', val:String(hs.open || 0), st:(hs.open || 0) > 5 ? 'y' : 'n', label:'ESTIMATE', feed:'dash_hot_leads', asof:hs.as_of, sub:`Buying talk about a named customer in the last 30 days of recordings with no estimate. ${hs.estimated || 0} mentions already have one · ${hs.dropped || 0} dropped`, src:'Plaud · Fireflies · Fieldy + ST'}),
    tile({cf:cbCf, title:`Missed calls, no callback in ${cs.hours || 4} h (7 d)`, val:String(cs.open7 || 0), st:(cs.open7 || 0) > 20 ? 'r' : (cs.open7 || 0) > 5 ? 'y' : 'n', label:'ESTIMATE', feed:'dash_leak_calls', asof:cs.as_of, sub:`${cs.open7_existing || 0} are existing customers · ${cs.open7_short || 0} hung up in under 10 s · 30 days ${cs.open30 || 0}`, src:'ST calls'}),
    tile({cf:recCf, title:'Missed-call rate (last 7 days)', val:rate(m7, in7), st:in7 && m7 / in7 > .3 ? 'r' : in7 && m7 / in7 > .15 ? 'y' : 'g', label:'FACT', feed:'dash_leak_calls', asof:cs.as_of, sub:`${m7} abandoned or unbooked of ${in7} inbound lead calls · ${un7} callers never got a callback`, src:'ST calls', spark:cd.filter(r => daysOld(r.ct_date) >= 1).map(r => r.lead_inbound ? Math.round(r.missed / r.lead_inbound * 100) : null)}),
    tile({cf:rsCf, title:'⚡ Electrical vs company (30 d)', val:`${rate(e30.reschedules + e30.cancels, e30.appts)} <small>vs ${rate(c30.reschedules + c30.cancels, c30.appts)}</small>`, st:e30.appts && c30.appts && (e30.reschedules + e30.cancels) / e30.appts > 1.2 * (c30.reschedules + c30.cancels) / c30.appts ? 'r' : 'g', label:'ESTIMATE', feed:'dash_leak_resched', asof:c30.as_of, sub:`Reschedules ${rate(e30.reschedules, e30.appts)} (co. ${rate(c30.reschedules, c30.appts)}) · cancels ${rate(e30.cancels, e30.appts)} (co. ${rate(c30.cancels, c30.appts)}) on ${e30.appts || 0} jobs · tech-caused ${(e30.cancel_tech || 0) + (e30.resched_tech || 0)}`, src:'ST job history + cancel log'}),
  ];
  const fuT = table([
    {h:'Customer · estimate', f:r => `<b>${esc(r.customer_name)}</b><div class="mini">${esc(r.top_option)}${r.options > 1 ? ` (+${r.options - 1} option${r.options > 2 ? 's' : ''})` : ''} · ${esc(r.business_unit || '')}</div>`},
    {h:'Amount', n:1, f:r => `<b>${usd(r.max_subtotal)}</b><div class="mini">${r.age_days} d old</div>`},
    {h:'Signals', f:r => `<div class="mini">${r.email_sent ? 'emailed' : 'not emailed'}${r.viewed_online ? ' · <b>viewed online</b>' : ''}${r.outbound_call_after ? ' · outbound call (not logged as follow-up)' : ''}</div><div class="mini">By ${esc(r.sold_by || '—')} · ${r.phone ? `<a href="tel:${esc(r.phone)}">call</a>` : ''}</div>`}], S.lk_fu || [], 'Every open estimate from the last 30 days has a follow-up logged.');
  const hotT = table([
    {h:'Customer · heard', f:r => `<b>${esc(r.customer_name)}</b><div class="mini">${esc(md(r.said_date))} · ${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.source)}</a>` : esc(r.source)} · ${esc(r.speaker || '')}</div><div class="mini">“${esc(String(r.snippet).replace(/^…/, '').slice(0, 260))}…”</div>`},
    {h:'Owner · nudge', f:r => `<b>${esc(r.suggested_owner)}</b><div class="mini">${esc(r.nudge)}</div><div class="mini">Match ${r.match_count === 1 ? 'unique' : r.match_count + ' ST customers'} · ${cfBadgeMini(r.confidence)}</div>`},
    {h:'', f:r => `<button class="pb" data-hot="drop" data-id="${r.id}" title="Drop this lead" aria-label="Drop this lead">✕ Drop</button>`}], hot, 'Nothing open: every buying mention in the recordings has an estimate in ServiceTitan.');
  const callT = table([
    {h:'Caller', f:r => `<b>${esc(r.name || 'Unknown caller')}</b>${r.existing_customer ? ' <span class="badge amber">CUSTOMER</span>' : ''}<div class="mini"><a href="tel:${esc(r.phone)}">${esc(r.phone.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3'))}</a>${r.n_calls > 1 ? ` · called ${r.n_calls}×` : ''}</div>`},
    {h:'When', f:r => `${esc(ct(r.called_at))}<div class="mini">${esc(r.call_type)} · ${r.duration_s != null ? r.duration_s + ' s' : ''}</div>`},
    {h:'Campaign · why', f:r => `${esc(r.campaign || '—')}<div class="mini">${esc(r.reason || '')}</div>`}], S.lk_calls || [], 'No missed callers waiting.');
  const techRows = rs(30).filter(r => r.scope === 'tech' && r.appts >= 5).sort((a, b) => (b.resched_rate + b.cancel_rate) - (a.resched_rate + a.cancel_rate));
  const crR = c30.appts ? c30.reschedules / c30.appts : 0, crC = c30.appts ? c30.cancels / c30.appts : 0;
  const hl = (v, avg) => v == null ? '–' : `<b style="color:${v > avg * 1.2 ? C.red : v < avg * .8 ? C.green : C.navy}">${pct(v)}</b>`;
  const techT = table([
    {h:'Technician', f:r => `${r.bu_group === 'Electrical' ? '⚡ ' : ''}<b>${esc(r.name)}</b><div class="mini">${esc(r.bu_group || '')} · ${r.appts} jobs</div>`},
    {h:'Tech-caused', n:1, f:r => `<b style="color:${(r.cancel_tech + r.resched_tech) > 0 ? C.red : C.green}">${(r.cancel_tech || 0) + (r.resched_tech || 0)}</b>`},
    {h:'Resched', n:1, f:r => `${hl(r.resched_rate, crR)}<div class="mini">${r.reschedules}</div>`},
    {h:'Cancel', n:1, f:r => `${hl(r.cancel_rate, crC)}<div class="mini">${r.cancels}${r.cancels ? ` (${r.cancel_customer}c/${r.cancel_office}o)` : ''}${r.canceled_value_lost ? `<br>${usd(r.canceled_value_lost)}` : ''}</div>`},
    {h:'Recalls', n:1, hs:1, f:r => r.recall_events || 0}],
    [{name:'Company average', bu_group:'all', appts:c30.appts, reschedules:c30.reschedules, resched_rate:crR, resched_tech:c30.resched_tech, resched_customer:c30.resched_customer, cancels:c30.cancels, cancel_rate:crC, cancel_customer:c30.cancel_customer, cancel_office:c30.cancel_office, cancel_tech:c30.cancel_tech, canceled_value_lost:c30.canceled_value_lost, recall_events:c30.recall_events}].concat(techRows));
  const quiet = rs(30).filter(r => r.scope === 'tech' && r.customer_cancels_aged >= 3).map(r => ({...r, nl:r.no_later_job / r.customer_cancels_aged})).sort((x, y) => y.nl - x.nl);
  const coNl = c30.customer_cancels_aged ? c30.no_later_job / c30.customer_cancels_aged : null;
  const elecEv = (S.lk_rs_ev || []).filter(r => r.bu_group === 'Electrical').slice(0, 14);
  const evT = table([
    {h:'Date', f:r => `${esc(md(r.ct_date))}<div class="mini">${r.kind === 'cancel' ? 'CANCEL' : 'resched'}</div>`},
    {h:'Tech · customer', f:r => `<b>${esc((r.technicians || []).join(', ') || 'no tech yet')}</b><div class="mini">${esc(r.customer || '')}</div>`},
    {h:'Reason / who asked', f:r => `${esc(r.reason || '')}${r.memo ? `<div class="mini">“${esc(r.memo.slice(0, 120))}”</div>` : ''}<div class="mini">${esc(r.initiator)} · ${esc(r.initiator_basis || '')} · entered by ${esc(r.entered_by || '?')}${r.late_notice ? ' · same day' : ''}${r.after_dispatch ? ' · after dispatch' : ''}${r.is_recall ? ' · RECALL' : ''}${r.kind === 'cancel' ? (r.rebooked ? ' · rebooked' : ` · not rebooked (${usd(r.value)})`) : ''}</div>`}], elecEv, 'No electrical reschedules or cancels in 30 days.');
  const bars = barChart({labels:['1 d', '7 d', '30 d'].flatMap(l => [l + ' ⚡', l + ' all']), vals:[1, 7, 30].flatMap(w => { const e = elec(w), c = comp(w); return [e.appts ? Math.round(1000 * (e.reschedules + e.cancels) / e.appts) / 10 : 0, c.appts ? Math.round(1000 * (c.reschedules + c.cancels) / c.appts) / 10 : 0]; }), colors:[C.amber, C.teal, C.amber, C.teal, C.amber, C.teal], fmt:v => v + '%'});
  return `${section('Revenue leaks', 'Daily · biggest money first · read-only from ServiceTitan and recordings')}${leakBanner()}
   <div class="grid g3">${tiles.join('')}</div>
   <div class="chart"><h3>1 · Estimates with no follow-up after 48 h (${fs.n || 0})</h3><div class="cs">Open estimates created 2–30 days ago where ServiceTitan shows zero follow-ups. Biggest first. ${L('FACT')} ServiceTitan report 85159837 Unsold Estimates · ${esc(ct(fs.as_of))}</div>${fuT}</div>
   <div class="chart"><h3>2 · Heard but not estimated (${hot.length})</h3><div class="cs">A tech or manager talked about a real customer with buying intent (replacement, quote, new system, send a price) and ServiceTitan shows no estimate on or after that day (or in the 3 weeks before, since debriefs often recap jobs already quoted). Stays here until an estimate shows up or you drop it. ${L('ESTIMATE')} matched by machine, spot-check before acting · checked ${esc(ct(hs.as_of))}</div><div id="hmsg" class="pmsg"></div>${hotT}
    ${(S.lk_hot_dropped || []).length ? `<details class="fold"><summary>Dropped (${S.lk_hot_dropped.length})</summary>${S.lk_hot_dropped.map(r => `<div class="act"><div><b>${esc(r.customer_name)}</b><div class="mini">heard ${esc(md(r.said_date))} · dropped ${esc(ct(r.dropped_at))}</div></div><div class="actd"><button class="pb" data-hot="restore" data-id="${r.id}">↺ Restore</button></div></div>`).join('')}</details>` : ''}</div>
   <div class="chart"><h3>3 · Missed calls to call back (last 7 days)</h3><div class="cs">Inbound calls that were abandoned or not booked, with no callback, booking or new job within ${cs.hours || 4} hours. One row per number; customers and real conversations first, hang-ups under 10 s last. ${L('ESTIMATE')} callback check · ${L('FACT')} call list from ST · tie-out to ST report 2319: ${rec.pct != null ? rec.pct + '%' : 'n/a'} · ${esc(ct(cs.as_of))}</div>${callT}</div>
   <div class="charts two">
    ${chartBox('4 · Reschedules & cancels by technician (30 days)', `Only tech-caused events (cancel reason "Tech was late", a note saying the tech couldn\'t make it, or the tech moving his own job) count against a tech. Rates include every cause, for context; red = 20%+ above company average. Recalls are kept out and shown separately. Cancel column: c = customer reason, o = office; $ = canceled and not rebooked. ${L('ESTIMATE')} reschedules · ${L('FACT')} cancels · ${esc(ct(c30.as_of))}`, techT)}
    ${chartBox('Electrical vs company: reschedules + cancels', `Per 100 jobs, last 1 / 7 / 30 days · ⚡ = electrical (service + install) · ${L('ESTIMATE')}`, bars)}
   </div>
   <details class="fold"><summary>Quiet check: canceled customers with no later job</summary><div class="cs">Customer-reason cancels at least 7 days old where that customer has no other job in ServiceTitan since. Most canceled customers never come back, so only a tech far above the company rate is worth a quiet look; this is not evidence of anything on its own. Company: ${c30.no_later_job || 0} of ${c30.customer_cancels_aged || 0}${coNl != null ? ' (' + pct(coNl) + ')' : ''} · ${L('ESTIMATE')}</div>
    ${table([{h:'Technician', f:r => esc(r.name)}, {h:'No later job', n:1, f:r => `${r.no_later_job} of ${r.customer_cancels_aged}`}, {h:'Rate', n:1, f:r => hl(r.nl, coNl || 1)}], quiet, 'No technician has 3+ aged customer cancels.')}</details>
   <div class="chart"><h3>⚡ Electrical reschedules & cancels, one by one (30 days)</h3><div class="cs">ServiceTitan records who clicked, not who asked. "customer" = the office picked a customer cancel reason or a note says the customer asked. Read the memo. ${L('FACT')} events · ${L('ESTIMATE')} who asked</div>${evT}</div>`;
}
const cfBadgeMini = p => `<span class="cfm"><i style="background:${CF_COL(p || 0)}"></i>${p || 0}% match</span>`;
async function hotDo(action, id) {
  if (hotBusy) return; hotBusy = true;
  const msg = document.getElementById('hmsg'); if (msg) { msg.textContent = 'Saving…'; msg.className = 'pmsg on'; }
  try {
    if (CFG) await rpc('dash_hot_leads', {p_action:action, p_id:Number(id)});
    else await jfetch('api/hot_leads', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({action, id:Number(id)})});
    const r = (S.lk_hot || []).find(x => String(x.id) === String(id)) || (S.lk_hot_dropped || []).find(x => String(x.id) === String(id));
    if (action === 'drop' && r) { S.lk_hot = S.lk_hot.filter(x => x !== r); S.lk_hot_dropped = [{...r, dropped_at:new Date().toISOString()}].concat(S.lk_hot_dropped || []); S.lk_hot_sum.open--; S.lk_hot_sum.dropped++; }
    if (action === 'restore' && r) { S.lk_hot_dropped = S.lk_hot_dropped.filter(x => x !== r); S.lk_hot_sum.dropped--; }
    renderPage('est');
  } catch (e) { if (msg) msg.textContent = 'Not saved: ' + e.message; }
  finally { hotBusy = false; }
}
document.addEventListener('click', e => { const b = e.target.closest('button[data-hot]'); if (!b) return; e.preventDefault(); hotDo(b.dataset.hot, b.dataset.id); });

// ---------- Action tracker = Stephen's Priorities list (ops.priorities). ~7 cards, the rest folded under Backlog (N).
const PR = () => S.priorities || {open:[], closed:[], visible:7};
let prioBusy = false, addOpen = false;
function prioCard(r, i, n, compact) {
  const ok = r.needs_ok ? `<span class="badge red">NEEDS YOUR OK${r.ok_count ? ' (' + r.ok_count + ')' : ''}</span>` : '';
  const held = r.held ? '<span class="badge gray">ON HOLD</span>' : '';
  const due = r.due_on ? `<span class="badge ${daysOld(r.due_on) > 0 ? 'red' : 'amber'}">DUE ${esc(new Date(r.due_on + 'T12:00:00').toLocaleDateString('en-US', {weekday:'short', month:'numeric', day:'numeric'}))}</span>` : '';
  const btn = (a, label, title, dis) => `<button class="pb pb-${a}" data-pa="${a}" data-id="${r.id}" title="${title}" aria-label="${title}"${dis ? ' disabled' : ''}>${label}</button>`;
  return `<div class="pcard${compact ? ' compact' : ''}${r.held ? ' held' : ''}" data-id="${r.id}">
   <div class="prank">${i + 1}</div>
   <div class="pbody"><div class="ptitle">${esc(r.title)} ${ok}${held}${due}</div>
    ${r.next_step ? `<div class="pnext"><b>Next:</b> ${esc(r.next_step)}</div>` : ''}
    <div class="pmeta">Owner: <b>${esc(r.owner_bot)}</b> · updated ${esc(ct(r.updated_at))}${r.updated_by && r.updated_by !== 'seed' ? ' by ' + esc(r.updated_by) : ''}</div>
    <div class="pctl">${btn('up', '▲', 'Move up', i === 0)}${btn('down', '▼', 'Move down', i === n - 1)}${btn('done', '✓ Done', 'Mark done')}${btn('drop', '✕ Drop', 'Drop')}</div>
   </div></div>`;
}
function pageAct() {
  const P = PR(), open = P.open || [], vis = P.visible || 7, top = open.slice(0, vis), back = open.slice(vis);
  const needOk = open.filter(r => r.needs_ok && !r.held), a = S.actions_sum || {};
  const owners = ['Chief of Staff', 'Finance / CFO Desk', 'Ops / Dispatch', 'Pricebook & Pay', 'SEO & AEO', 'Brand', 'Fleet', 'Payroll', 'Warranty', 'Dashboard build'];
  const addForm = addOpen ? `<form class="padd" id="padd"><input name="title" maxlength="300" placeholder="What needs to happen?" required>
     <input name="next" maxlength="500" placeholder="Next step (optional)">
     <div class="paddrow"><select name="owner">${owners.map(o => `<option>${esc(o)}</option>`).join('')}</select>
     <label><input type="checkbox" name="needs_ok"> Needs my OK</label></div>
     <div class="paddrow"><button type="submit" class="pb pb-save">Add to my list</button><button type="button" class="pb" data-pa="cancel-add">Cancel</button></div></form>`
    : `<button class="pb pb-add" data-pa="open-add">＋ Add a priority</button>`;
  const old = (S.actions || []).slice(0, 25);
  return `<div class="cols"><div class="left">
   <div class="chart"><h3>My priorities</h3><div class="cs">Top ${vis} only. Use ▲ ▼ to reorder; moving a backlog item up past #${vis} brings it onto this list. ${needOk.length ? `<b style="color:${C.red}">${needOk.length} need your OK.</b>` : ''} Saved for everyone right away · ${L('FACT')} list updated ${esc(ct(P.as_of))}</div>
    <div id="pmsg" class="pmsg"></div>
    ${top.map((r, i) => prioCard(r, i, open.length)).join('') || '<div class="cs">Nothing on the list.</div>'}
    ${addForm}
   </div>
   <details class="fold"><summary>Backlog (${back.length})</summary><div class="cs">Build projects and later items, in order. Move one up to promote it.</div>
    ${back.map((r, i) => prioCard(r, i + vis, open.length, 1)).join('')}</details>
   <details class="fold"><summary>Done or dropped recently (${(P.closed || []).length})</summary>
    ${(P.closed || []).map(r => `<div class="act"><div><b>${esc(r.title)}</b><div class="mini">${esc(r.status)} ${esc(ct(r.closed_at))}${r.updated_by && r.updated_by !== 'seed' ? ' by ' + esc(r.updated_by) : ''}</div></div><div class="actd"><button class="pb" data-pa="restore" data-id="${r.id}">↺ Restore</button></div></div>`).join('') || '<div class="cs">None yet.</div>'}</details>
   <details class="fold"><summary>Old meeting-notes action list (${a.n || 0} items, read-only)</summary>
    <div class="cs">Auto-collected from meeting notes (Fieldy + Fireflies) by the Chief of Staff bot; ${a.overdue || 0} have past dates. Kept for reference only, not a to-do list. Showing the first ${old.length}. Updated ${esc(ct(a.as_of))}.</div>
    ${old.map(r => `<div class="act"><div>${esc(r.title)}<div class="mini">${esc(r.source || '')}${r.due_at ? ' · due ' + md(r.due_at.slice(0, 10)) : ''}</div></div></div>`).join('')}</details>
  </div>${right()}</div>`;
}
async function prioDo(action, body) {
  if (prioBusy) return; prioBusy = true;
  const msg = document.getElementById('pmsg'); if (msg) { msg.textContent = 'Saving…'; msg.className = 'pmsg on'; }
  try {
    S.priorities = await API.prio(action, body || {});
    if (action === 'add') addOpen = false;
    render();
    const m2 = document.getElementById('pmsg'); if (m2) { m2.textContent = 'Saved ✓'; m2.className = 'pmsg on ok'; setTimeout(() => { m2.className = 'pmsg'; }, 1800); }
  } catch (e) {
    const m2 = document.getElementById('pmsg'); if (m2) { m2.textContent = 'Not saved: ' + e.message; m2.className = 'pmsg on bad'; }
  } finally { prioBusy = false; }
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-pa]'); if (!b) return;
  const a = b.dataset.pa, id = b.dataset.id;
  if (a === 'open-add') { addOpen = true; renderPage('act'); const f = document.querySelector('#padd input'); if (f) f.focus(); return; }
  if (a === 'cancel-add') { addOpen = false; renderPage('act'); return; }
  if (a === 'drop') { const r = PR().open.find(x => String(x.id) === id); if (!confirm('Drop "' + (r ? r.title : 'this item') + '"? You can restore it later.')) return; }
  prioDo(a, {id});
});
document.addEventListener('submit', e => {
  if (e.target.id !== 'padd') return; e.preventDefault();
  const f = new FormData(e.target);
  prioDo('add', {title:f.get('title'), next:f.get('next'), owner:f.get('owner'), needs_ok:!!f.get('needs_ok')});
});

// ---------- Marketing & reviews
function pageMk() {
  const d = D(), rv = d.rv, lc = d.lcall, ma = S.mkt_actions_sum, rvGoal = kpi(17) || 4.7;
  const csrRate = d.lc ? d.lc.booked / d.lc.lead_calls : null;
  const tiles = [
    tile({cf:CF.st('the ST 2409 CSR report (last full month)'), title:'Call booking %', val:csrRate != null ? pct(csrRate) : '–', st:csrRate == null ? 'n' : csrRate >= (kpi(9) || 40) / 100 ? 'g' : 'y', label:'FACT', feed:'dash_marketing', asof:d.lc && d.lc.as_of, sub:`Goal ${kpi(9) || 40}% · ${d.lc ? mon(d.lc.month) : ''} lead calls`, src:'ST 2409'}),
    tile({cf:CF.st('the ST 2246 call report (last full month)'), title:'Abandoned calls', val:lc ? pct(lc.abandoned / lc.calls) : '–', st:!lc ? 'n' : lc.abandoned / lc.calls > .15 ? 'r' : 'g', label:'FACT', feed:'dash_marketing', asof:lc && lc.as_of, sub:lc ? `${lc.abandoned} of ${lc.calls} inbound in ${mon(lc.month)}` : '', src:'ST 2246', spark:d.callsDone.slice(-7).map(r => r.abandoned / r.calls * 100)}),
    tile({cf:[98, 'Birdeye copy of Google reviews (synced hourly); can lag Google by up to an hour.'], title:'Average rating (30 days)', val:rv.w30 && rv.w30.avg ? rv.w30.avg + '★' : '–', st:!rv.w30 || !rv.w30.avg ? 'n' : rv.w30.avg >= rvGoal ? 'g' : 'y', label:'FACT', feed:'birdeye_sync', asof:rv.as_of, sub:`Goal ${rvGoal}★ · since ${rv.first_date ? md(rv.first_date) : ''}: ${rv.avg_all}★ on ${rv.rated_total}`, src:'Birdeye'}),
    tile({cf:[98, 'Birdeye copy of Google reviews (synced hourly); can lag Google by up to an hour.'], title:'New Google reviews (7 days)', val:rv.w7 ? String(rv.w7.n) : '–', st:'n', label:'FACT', feed:'birdeye_sync', asof:rv.as_of, sub:`${rv.w30 ? rv.w30.n : 0} in 30 days · ${rv.w7 ? rv.w7.feedback : 0} private feedback this week`, src:'Birdeye', spark:(rv.weekly || []).map(w => w.n)}),
    tile({cf:[95, 'Reply status comes from Birdeye; replies typed directly in Google can take a while to show.'], title:'Reviews with no reply', val:rv.w30 ? String(rv.w30.unanswered) : '–', st:rv.w30 && rv.w30.unanswered ? 'y' : 'g', label:'FACT', feed:'birdeye_sync', asof:rv.as_of, sub:'Google, last 30 days', src:'Birdeye'}),
    tile({cf:[95, "Self-reported by the SEO & AEO bots' own action log."], title:'SEO desk actions (7 days)', val:String(ma.wk), st:'n', label:'FACT', feed:'marketing_actions', asof:ma.as_of, sub:`${ma.n} logged in total`, src:'SEO desk log'}),
  ];
  const mo = (rv.monthly || []);
  const c1 = barChart({labels:mo.map(m => mon(m.month + '-01')), vals:mo.map(m => m.n), colors:mo.map(m => (m.avg || 0) >= rvGoal ? C.teal : C.amber), fmt:v => String(Math.round(v))});
  const cl = S.calls.slice(-7);
  const c2 = barChart({labels:cl.map(r => mon(r.month)), vals:cl.map(r => r.booked), ly:cl.map(r => r.calls), colors:cl.map(r => r.month >= d.cm ? C.gray : C.teal), fmt:v => String(Math.round(v))});
  const star = n => n ? '★'.repeat(Math.round(n)) : '<span class="mini">feedback</span>';
  const rr = table([{h:'Date', f:r => md(r.date)}, {h:'Rating', f:r => `<span style="color:${(r.rating || 5) <= 3 ? C.red : C.amber}">${star(r.rating)}</span>`}, {h:'Customer', f:r => esc(r.name)}, {h:'Said', hs:1, f:r => `<span class="mini">${esc(r.text)}</span>`}, {h:'Reply', f:r => r.rating ? (r.responded ? '✓' : `<b style="color:${C.red}">none</b>`) : ''}], rv.recent || []);
  const cp = table([{h:'Campaign', f:r => esc(r.campaign)}, {h:'Calls', n:1, f:r => r.calls}, {h:'Booked', n:1, f:r => r.booked}, {h:'Revenue', n:1, hs:1, f:r => usd(r.rev)}], S.camp_top);
  const cs = table([{h:'CSR', f:r => esc(r.csr)}, {h:'Lead calls', n:1, f:r => r.lead_calls}, {h:'Booked', n:1, f:r => r.inbound_booked}, {h:'Rate', n:1, f:r => r.lead_calls ? pct(r.booking_rate) : '–'}], S.csr_month.filter(r => r.calls_taken > 0));
  const sa = table([{h:'When', f:r => md((r.date_completed || r.date_created).slice(0, 10))}, {h:'What', f:r => `${esc(r.description || r.action_type)}<div class="mini">${esc(r.action_type || '')} · ${esc(r.agent_id || '')}</div>`}, {h:'Status', f:r => esc(r.status || '')}], S.mkt_actions.slice(0, 10));
  const sl = table([{h:'Metric', f:r => esc(r.metric)}, {h:'Status', f:r => `<span class="pill" style="background:${r.status === 'wired' ? C.green : r.status === 'placeholder' ? C.amber : C.gray}">${esc(r.status)}</span>`}, {h:'Source', hs:1, f:r => `<span class="mini">${esc(r.source)}</span>`}], S.mkt_slots);
  const cm0 = S.camp_top[0];
  return `<div class="cols"><div class="left"><div class="grid g3">${tiles.join('')}</div>${mobLook()}
   <div class="charts two">
    ${chartBox(`Calls by campaign (${cm0 ? mon(S.calls[S.calls.length - 1].month) + ' to ' + md(cm0.pt) : ''})`, `Top campaigns this month · ${L('FACT')} ST 2246`, cp)}
    ${chartBox('CSR booking (this month)', `Lead calls booked by person · ${L('FACT')} ST 2409`, cs)}
   </div>
   <div class="charts two">
    ${chartBox('Calls: booked vs all inbound', `Bar = jobs booked, gray ghost = inbound calls · current month so far · ${L('FACT')} ST 2246`, c2)}
    ${chartBox('Google reviews by month', `Count of star reviews · teal = average at or above ${rvGoal}★ · ${L('FACT')} Birdeye (history starts ${rv.first_date ? md(rv.first_date) : ''})`, c1)}
   </div>
   ${chartBox('Latest reviews', `First name + last initial · ${L('FACT')} Birdeye · ${esc(ct(rv.as_of))}`, rr)}
   <div class="charts two">
    ${chartBox('SEO desk: latest work', `From the SEO & AEO bots' action log · ${L('FACT')} · ${esc(ct(ma.as_of))}`, sa)}
    ${chartBox('Marketing data still to connect', 'Ad spend, map-pack and Google Business Profile numbers are not live yet', sl)}
   </div>
  </div>${right()}</div>`;
}

// ---------- Fleet & fuel
function pageFl() {
  const d = D(), lf = d.lf, pf = d.pf, f = feed('fleet_fuel');
  if (!lf) return soon('Fleet & fuel', 'Fuel card spend by truck, cost per gallon, and flagged purchases.', 'The fuel card feed.');
  const tiles = [
    tile({cf:CF.fuel(lf), title:`Fuel spend (${mon(lf.month)})`, val:usd(lf.fuel_usd), st:pf && lf.fuel_usd > pf.fuel_usd * 1.25 ? 'y' : 'n', label:'FACT', feed:'fleet_fuel', asof:lf.as_of, sub:pf ? `${mon(pf.month)} ${usd(pf.fuel_usd)} · ${lf.fills} fills` : '', src:'Fuel card', spark:d.fm.map(r => r.fuel_usd)}),
    tile({cf:CF.fuel(lf), title:'Flagged purchases (45 days)', val:String(S.fuel_flags.length), st:S.fuel_flags.length ? 'y' : 'g', label:'FACT', feed:'fleet_fuel', asof:lf.as_of, sub:'Premium grade, non-fuel, out of state', src:'Fuel card rules'}),
    tile({cf:CF.fuel(lf), title:'Average $/gallon', val:'$' + Number(lf.avg_usd_per_gal).toFixed(2), st:'n', label:'FACT', feed:'fleet_fuel', asof:lf.as_of, sub:`${Math.round(lf.gallons).toLocaleString()} gallons in ${mon(lf.month)}`, src:'Fuel card'}),
    tile({cf:CF.fuel(lf), title:'Trucks share', val:lf.truck_usd ? pct(lf.truck_usd / lf.fuel_usd) : '–', st:'n', label:'FACT', feed:'fleet_fuel', asof:lf.as_of, sub:`${usd(lf.truck_usd)} on truck cards · rest on driver cards`, src:'Fuel card'}),
  ];
  const c1 = barChart({labels:d.fm.map(r => mon(r.month)), vals:d.fm.map(r => r.fuel_usd), colors:d.fm.map(() => C.teal)});
  const tt = table([{h:'Truck / card', f:r => esc(r.label)}, {h:'Fills', n:1, f:r => r.fills}, {h:'Gallons', n:1, f:r => Math.round(r.gallons)}, {h:'Spend', n:1, f:r => usd(r.usd)}], S.fuel_truck);
  const fl = table([{h:'When', f:r => md(r.tran_ts_local)}, {h:'Card', f:r => esc(r.label)}, {h:'Where', hs:1, f:r => `<span class="mini">${esc(r.merchant_name)} · ${esc(r.merchant_city)}, ${esc(r.merchant_state)}</span>`}, {h:'$', n:1, f:r => usd(r.amount)}, {h:'Flag', f:r => `<span class="mini">${esc(r.flags.join(', '))}</span>`}], S.fuel_flags, 'No flagged purchases.');
  return `<div class="cols"><div class="left"><div class="grid">${tiles.join('')}</div>${mobLook()}
   ${chartBox('Purchases to check', `Last 45 days · ${L('FACT')} · weekend/after-hours alone are not shown`, fl)}
   <div class="charts two">
    ${chartBox('Fuel spend by month', `Complete months · ${L('FACT')} fuel card · data through ${esc(md(lf.through_date || lf.month))}`, c1)}
    ${chartBox(`Spend by truck / card (${mon(lf.month)})`, `${L('FACT')} fuel card`, tt)}
   </div>
   <div class="cs">Fuel card files arrive in batches, so the newest month can lag (feed ${esc(f.status)}, loaded ${esc(ct(f.last_loaded_at))}). Miles-per-gallon and truck GPS views come next.</div>
  </div>${right()}</div>`;
}

// ---------- tabs with no data feed yet
const pageWar = () => `<div class="cols"><div class="left">${soon('Warranty', 'Open warranty claims, parts credits owed by vendors, and warranty labor by month.', 'A warranty claims source. The Warranty bot is not writing data yet; once it writes its claims table, this tab turns on.')}</div>${right()}</div>`;
const pagePay = () => `<div class="cols"><div class="left">${soon('Payroll & commission', 'Labor cost as a percent of revenue, commission owed by technician, and overtime hours.', 'Read access to ServiceTitan payroll exports or the payroll provider, plus the new commission plan rules. The Payroll bot feed is not live yet.')}</div>${right()}</div>`;
const pageLook = () => `<div class="cols"><div class="left">${soon('🔍 Look up', 'Type a customer, invoice, job or estimate number and see balance, open estimates, last visit and reviews on one card.', 'A search endpoint on the read-only database role. Planned for the production build.')}</div>${right()}</div>`;

// Today (same-day) and Finance (AR + unsent) live in today.js. Old #ar / #un links open Finance.
const PAGES = {today:pageToday, ov:pageOv, est:pageEst, mk:pageMk, fin:pageFin, act:pageAct, pay:pagePay, fl:pageFl, war:pageWar, look:pageLook};
const PAGE_ALIAS = {ar:'fin', un:'fin'};
const cfLegend = () => `<div class="cflegend" title="Green 100% = ties exactly to the source of record (ST report or QBO closed month). Yellow 89-99% = straight from the source but not tied out yet, or a small known gap. Red under 89% = estimate, forecast, proxy, partial month or late feed."><b>Data confidence %:</b><span><i style="background:${C.green}"></i>100% ties exactly</span><span><i style="background:${C.amber}"></i>89–99% minor gaps</span><span><i style="background:${C.red}"></i>under 89% estimate / partial / late</span><em>Tap a % chip for the reason.</em></div>`;
function banner() {
  const bad = S.bots.filter(b => b.status !== 'OK' && b.status !== 'NOT LIVE');
  const el = document.getElementById('banner');
  if (bad.length) el.innerHTML = `<div class="banner warn">⚠ Late data: ${bad.map(b => esc(b.bot) + ' (' + esc(b.detail || b.status) + ')').join('; ')}. Gray tiles are not current.</div>` + cfLegend();
  else el.innerHTML = `<div class="banner ok">✅ All live feeds current · TTM revenue ties to ServiceTitan ($${Number(S.recon.diff).toFixed(2)} diff) · AR ties to ST 385 ($${Number(S.ar_recon.diff).toFixed(2)} diff)</div>` + cfLegend();
}
function renderPage(k) { const el = document.getElementById('p-' + k); try { el.innerHTML = PAGES[k](); } catch (e) { el.innerHTML = `<div class="err">This tab could not be drawn (${esc(e.message)}). Other tabs still work.</div>`; console.error(k, e); } }
function renderLooks() { render(); }
function render() {
  for (const k of Object.keys(PAGES)) renderPage(k);
  banner();
  const g = new Date(S.generated_at);
  document.getElementById('upd').innerHTML = `Updated ${esc(ct(S.generated_at))} CT<br>${g.toLocaleDateString('en-US', {timeZone:TZ, weekday:'short', month:'short', day:'numeric'})}`;
  document.getElementById('gen').textContent = `Snapshot ${g.toLocaleString('en-US', {timeZone:TZ})} CT.`;
  const live = document.getElementById('live'), old = Date.now() - g > 15 * 60e3;
  live.textContent = old ? 'NOT UPDATING' : 'LIVE'; live.classList.toggle('stale', old);
}

// ---------- data layer: box (passcode cookie + /api/*) or hosted (Supabase Auth + RPC)
const CFG = window.DASH_CFG || null;
// Minimal Supabase Auth + RPC client (no library): password sign-in, token refresh, RPC calls.
const AUTH_KEY = 'ahpe-dash-auth';
const SB = {
  sess() { try { return JSON.parse(localStorage.getItem(AUTH_KEY)); } catch (e) { return null; } },
  save(d) { const s = {access_token:d.access_token, refresh_token:d.refresh_token, expires_at:d.expires_at || (Math.floor(Date.now() / 1000) + (d.expires_in || 3600)), email:(d.user && d.user.email) || (SB.sess() || {}).email}; localStorage.setItem(AUTH_KEY, JSON.stringify(s)); return s; },
  clear() { localStorage.removeItem(AUTH_KEY); },
  async call(path, opt) {
    const r = await fetch(CFG.url + path, Object.assign({cache:'no-store'}, opt, {headers:Object.assign({apikey:CFG.key, 'Content-Type':'application/json'}, (opt || {}).headers || {})}));
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.msg || j.message || j.error_description || j.error || ('HTTP ' + r.status)); e.status = r.status; e.code = j.code || j.error_code; throw e; }
    return j;
  },
  async signIn(email, password) { return SB.save(await SB.call('/auth/v1/token?grant_type=password', {method:'POST', body:JSON.stringify({email, password})})); },
  async token() {
    let s = SB.sess(); if (!s || !s.refresh_token) return null;
    if (s.expires_at - 90 < Date.now() / 1000) {
      try { s = SB.save(await SB.call('/auth/v1/token?grant_type=refresh_token', {method:'POST', body:JSON.stringify({refresh_token:s.refresh_token})})); }
      catch (e) { if (e.status && e.status < 500) { SB.clear(); return null; } throw e; }
    }
    return s.access_token;
  },
  async rpc(fn, args) {
    const t = await SB.token(); if (!t) { const e = new Error('signed out'); e.code = 'signedout'; throw e; }
    return SB.call('/rest/v1/rpc/' + fn, {method:'POST', headers:{Authorization:'Bearer ' + t}, body:JSON.stringify(args || {})});
  },
  async setPassword(password) { const t = await SB.token(); return SB.call('/auth/v1/user', {method:'PUT', headers:{Authorization:'Bearer ' + t}, body:JSON.stringify({password})}); },
  async signOut() { const t = (SB.sess() || {}).access_token; SB.clear(); if (t) { try { await SB.call('/auth/v1/logout', {method:'POST', headers:{Authorization:'Bearer ' + t}}); } catch (e) {} } },
};
async function jfetch(url, opt) {
  const r = await fetch(url, Object.assign({cache:'no-store', credentials:'same-origin'}, opt || {}));
  if (r.status === 401) { location.href = 'login'; throw new Error('signed out'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
  return j;
}
async function rpc(fn, args) {
  try { return await SB.rpc(fn, args); }
  catch (e) { if (e.code === 'signedout' || e.code === '42501' || e.status === 401) { await SB.signOut(); S = null; showLogin('Please sign in.'); } throw e; }
}
const API = {
  async snapshot() {
    if (CFG) return rpc('dash_snapshot');
    const s = await jfetch('api/snapshot');
    try { s.priorities = await jfetch('api/priorities'); } catch (e) { s.priorities = null; console.error(e); }
    return s;
  },
  async prio(action, b) {
    if (CFG) return rpc('dash_priorities', {p_action:action, p_id:b.id ? Number(b.id) : null, p_title:b.title || null, p_next:b.next || null, p_owner:b.owner || null, p_needs_ok:!!b.needs_ok});
    return jfetch('api/priorities', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(Object.assign({action}, b))});
  },
};
function showLogin(msg) {
  document.body.classList.add('signedout');
  document.getElementById('login').innerHTML = `<form id="lf" class="lform"><h2>Sign in</h2>
   <label for="le">Email</label><input id="le" name="email" type="email" autocomplete="username" inputmode="email" required>
   <label for="lp">Password</label><input id="lp" name="password" type="password" autocomplete="current-password" required>
   <button type="submit">Sign in</button><div class="lmsg" id="lmsg">${esc(msg || '')}</div>
   <div class="note">Only approved Advantage HPE accounts can sign in. You stay signed in on this device. Forgot the password? Ask Ranger to reset it.</div></form>`;
  document.getElementById('lf').addEventListener('submit', async e => {
    e.preventDefault(); const f = new FormData(e.target), m = document.getElementById('lmsg'); m.textContent = 'Signing in…';
    try { await SB.signIn(String(f.get('email')).trim().toLowerCase(), f.get('password')); }
    catch (err) { m.textContent = /invalid/i.test(err.message) ? 'That email or password did not work.' : err.message; return; }
    document.body.classList.remove('signedout'); document.getElementById('login').innerHTML = ''; load();
  });
}
async function load() {
  try {
    S = await API.snapshot(); render();
  } catch (e) {
    const live = document.getElementById('live'); live.textContent = 'OFFLINE'; live.classList.add('stale');
    if (!S && !document.body.classList.contains('signedout')) document.querySelector('main').innerHTML = `<div class="err">Could not load data (${esc(e.message)}). It will retry in 5 minutes.</div>`;
  }
}
async function start() {
  if (CFG) {
    document.getElementById('acct').innerHTML = ' · <a href="#" id="pwchg">Change password</a> · <a href="#" id="sout">Sign out</a>';
    document.getElementById('sout').onclick = async e => { e.preventDefault(); await SB.signOut(); S = null; showLogin('Signed out.'); };
    document.getElementById('pwchg').onclick = async e => { e.preventDefault(); const p = prompt('New password (at least 10 characters):'); if (!p) return; if (p.length < 10) return alert('Too short.'); try { await SB.setPassword(p); alert('Password changed.'); } catch (err) { alert('Not changed: ' + err.message); } };
    if (!SB.sess()) return showLogin();
  } else {
    document.getElementById('acct').innerHTML = ' · <a href="logout">Sign out</a>';
  }
  load();
}
function go(p) {
  p = PAGE_ALIAS[p] || p;
  if (!PAGES[p]) p = 'today';
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x.dataset.p === p));
  document.querySelectorAll('.page').forEach(x => x.classList.toggle('on', x.id === 'p-' + p));
  history.replaceState(null, '', '#' + p); window.scrollTo(0, 0);
  const b = document.querySelector(`.tab[data-p="${p}"]`); if (b) b.scrollIntoView({inline:'center', block:'nearest'});
}
document.addEventListener('click', e => {
  const b = e.target.closest('button.cf'); if (!b) return; e.preventDefault(); e.stopPropagation();
  const box = b.closest('.tile, .trw, .pc, .tleak').querySelector('.cfr'); const open = !box.hidden && box.dataset.for === b.dataset.cfr;
  box.hidden = open; box.dataset.for = b.dataset.cfr; box.textContent = open ? '' : b.textContent + ' confidence: ' + b.dataset.cfr;
});
document.getElementById('tabs').addEventListener('click', e => { const b = e.target.closest('button.tab'); if (b) go(b.dataset.p); });
document.querySelector('main').addEventListener('click', e => { if (e.target.closest('button.cf')) return; const a = e.target.closest('[data-go]'); if (a) { e.preventDefault(); go(a.dataset.go); } });
go(location.hash.slice(1) || 'today');
start(); setInterval(() => { if (S) load(); }, 5 * 60e3);
document.addEventListener('visibilitychange', () => { if (!document.hidden && S && Date.now() - new Date(S.generated_at) > 5 * 60e3) load(); });
