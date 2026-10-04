'use strict';
// ---------- Today tab (same-day snapshot) + Finance tab (Collections/AR + Unsent invoices). Loaded before app.js; uses its helpers at render time.
const money2 = v => v == null ? '–' : '$' + Number(v).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
const ctNow = () => new Date(new Date().toLocaleString('en-US', {timeZone:TZ}));
const wdate = d => new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', {weekday:'short', month:'numeric', day:'numeric'});
const daysTo = d => -daysOld(String(d).slice(0, 10));
const SEV = {r:0, y:1, n:2, g:3};
const isoCT = (t = Date.now()) => new Date(t).toLocaleDateString('en-CA', {timeZone:TZ});
const kfmt = v => v == null ? '–' : Math.abs(v) >= 1e4 ? usdK(v) : usd(v);
function trow(r) {
  const c = COL[r.st] || C.gray, f = r.feed ? feed(r.feed) : {status:'OK'}, stale = f.status !== 'OK';
  const [p, why] = cfOf({cf:r.cf}, stale, f);
  const lab = r.lab ? `<span class="lab ${r.lab === 'FACT' ? 'FACT' : 'ESTIMATE'}">${esc(r.lab)}</span>` : '';
  const stake = 'amt' in r ? `<em class="tamt">${r.amt ? usd(r.amt) + (r.amtEst ? ' est.' : '') : '$ n/a'}</em>` : '';
  const line2 = r.cons ? `<span>${stake}${esc(r.cons)}</span>` : r.txt ? `<span>${esc(r.txt)}</span>` : '';
  const meta = r.owner || r.due ? `<span class="towner">👤 ${esc(r.owner || '–')} · ⏰ ${esc(r.due || '–')}</span>` : '';
  return `<div class="trw${r.go ? ' tgo' : ''}"${r.go ? ` data-go="${r.go}"` : ''} style="border-left-color:${c}"><div class="tic" style="background:${c}">${r.st === 'r' ? '!' : r.st === 'g' ? '✓' : r.st === 'y' ? '?' : 'i'}</div>
   <div class="ttx"><b>${esc(r.h)}</b>${line2}<i>${meta}${lab}${esc(r.src || '')}${cfBadge(p, why)}</i><div class="cfr" hidden></div></div></div>`;
}
function tsh(title, sub) { return `<div class="tsh"><h2>${title}</h2>${sub ? `<span>${sub}</span>` : ''}</div>`; }
// age of the 15-minute ServiceTitan "today" feed -> confidence cap
function stCf(base, what) {
  const st = (S.today || {}).st || {}, age = st.as_of ? (Date.now() - new Date(st.as_of)) / 60e3 : 1e9;
  if (age > 45) return [Math.min(base, 80), `Today feed last ran ${ct(st.as_of)}, so this may be behind. ${what}`];
  return [base, what + ` Refreshed every 15 min (last ${ct(st.as_of)}).`];
}
// shared numbers for the Today tab
function TD() {
  const T = S.today || {}, d = D(), today = isoCT(), yday = isoCT(Date.now() - 864e5), m1 = today.slice(0, 8) + '01';
  const jd = (T.jc_days || []).map(r => ({...r, day:String(r.day).slice(0, 10)}));
  const lastWD = (jd.filter(r => r.day < today && r.jobs >= 3).slice(-1)[0] || {}).day || null;
  let wd = 0; for (let x = new Date(m1 + 'T12:00:00'); isoCT(x) < today; x = new Date(x.getTime() + 864e5)) if (![0, 6].includes(x.getDay())) wd++;
  const calDays = Number(today.slice(8, 10)) - 1;
  const br = d.lc && d.lc.lead_calls ? d.lc.booked / d.lc.lead_calls : .45, avgJob = (T.avg_job || {}).v || 0;
  return {T, d, today, yday, m1, jd, lastWD, wd, calDays, br, avgJob, st:T.st || {}};
}

// 1) ACT NOW: max 5, each with $ at stake, consequence, owner, due. Ranked by $ at stake x urgency.
function actNow(t) {
  const {T, d} = t, B = T.bills || {}, P = PR(), open = P.open || [], top = open.slice(0, P.visible || 7), out = [], rv = d.rv;
  const urg = dd => dd == null ? 1 : dd <= 0 ? 4 : dd <= 2 ? 3 : dd <= 7 ? 2 : 1;
  const dueTxt = dd => dd == null ? 'no date' : dd < 0 ? `overdue ${-dd}d` : dd === 0 ? 'today' : dd === 1 ? 'tomorrow' : null;
  const add = (r, dd) => { r.score = (r.amt || 400) * urg(dd) * (r.st === 'r' ? 1.5 : 1); out.push(r); };
  // vendor bill that blocks ordering
  const ming = open.find(r => /mingledorff/i.test(r.title)), ml = (B.lines || []).find(l => /mingledorff/i.test(l.line));
  if (ming || ml) { const due = ming && ming.due_on, dd = due ? daysTo(due) : null, over = B.ming_balance && B.ming_limit ? B.ming_balance - B.ming_limit : null;
    add({st:ming && ming.needs_ok ? 'r' : 'y', go:'act', lab:'PLAN', h:`${ming && ming.needs_ok ? 'OK ' : 'Pay '}Mingledorff's ACH`, amt:ml ? ml.amount : null,
      cons:over > 0 ? `Account is ${usd(over)} over its ${usd(B.ming_limit)} credit limit; ordering can be blocked.` : 'Keeps the equipment account open.',
      owner:`You (OK) → CFO Desk`, due:due ? (dueTxt(dd) || wdate(due)) : 'this week', src:`CFO Desk · ${B.file || 'cash13'}`,
      cf:[90, `Amount is the CFO Desk recommendation (${B.file || 'cash13'}); balance and limit are from the 9/30 Mingledorff statement, not live.`]}, dd); }
  // callbacks owed (leak tracker)
  const ls = S.lk_calls_sum || {};
  if (ls.as_of && ls.open7) { const n = ls.open7_existing || ls.open7;
    add({st:ls.open7_existing ? 'r' : 'y', go:'est', lab:'ESTIMATE', feed:'dash_leak_calls', h:`Call back ${n} ${ls.open7_existing ? 'existing customer' + (n > 1 ? 's' : '') : 'missed caller' + (n > 1 ? 's' : '')}`, amt:Math.round(n * t.br * t.avgJob), amtEst:1,
      cons:`No callback in ${ls.hours || 4}h (${ls.open7} missed callers in 7 days). They may book someone else.`, owner:'Office / CSRs', due:'today', src:'ST calls (leak tracker)',
      cf:[75, `ESTIMATE: $ = callers × ${pct(t.br)} booking rate × ${usd(t.avgJob)} average job (ServiceTitan's Missed Revenue method). "No callback" = no outbound call, booking or new job for that number within ${ls.hours || 4}h; cell-phone calls outside ServiceTitan are not seen.`]}, 0); }
  // unsent invoices finished 4+ days ago
  const ua = (S.unsent_age || []).slice(1), un = sum(ua, b => b.n), uamt = sum(ua, b => b.amt);
  if (un) add({st:uamt > 1000 ? 'r' : 'y', go:'fin', lab:'FACT', feed:'dash_unsent', h:`Send ${un} invoice${un > 1 ? 's' : ''} finished 4+ days ago`, amt:uamt,
    cons:`Cash comes in later the longer they sit. ${S.unsent.ready_noemail ? S.unsent.ready_noemail + ' of the unsent ' + (S.unsent.ready_noemail > 1 ? 'have' : 'has') + ' no email on file.' : ''}`, owner:'Office', due:'today', src:'ST 2427', cf:[96, 'ST 2427 unsent invoices minus the hand-kept hold list.']}, 0);
  // biggest AR 60+ account
  const a60 = (S.top60 || [])[0];
  if (a60 && a60.over_60 >= 2500) add({st:'y', go:'fin', lab:'FACT', feed:'dash_ar_aging', h:`Collect from ${a60.customer}`, amt:Number(a60.over_60),
    cons:`Biggest balance over 60 days. ${a60.next_action || ''}`, owner:a60.owner || 'Office', due:'this week', src:'ST 385', cf:CF.st('ST 385 AR aging')}, 5);
  // biggest open estimate past 48h (follow-up not tracked yet)
  const ef = (S.est_follow || [])[0];
  if (ef) add({st:'y', go:'est', lab:'FACT', feed:'dash_sales', h:`Follow up: ${String(ef.name).slice(0, 48)}`, amt:Math.round(Number(ef.subtotal) * (d.tw90.close_rate || .35)), amtEst:1,
    cons:`expected (${usd(ef.subtotal)} estimate × ${pct(d.tw90.close_rate || .35)} close rate). Biggest unsold, ${ef.age} days old; follow-up calls not tracked yet.`, owner:String(ef.sold_by || 'Sales').trim(), due:'this week', src:'ST estimates', cf:CF.st('the ServiceTitan estimates feed')}, 6);
  // FCCI workers' comp self-bill (due the 15th)
  const n = ctNow(), f15 = new Date(n.getFullYear(), n.getMonth() + (n.getDate() > 15 ? 1 : 0), 15), fd = Math.ceil((f15 - new Date(n.getFullYear(), n.getMonth(), n.getDate())) / 864e5);
  if (fd <= 14) add({st:fd <= 3 ? 'r' : 'y', lab:'REMINDER', h:`FCCI workers' comp report + payment`, amt:null, cons:'Monthly self-bill. September\'s was flagged overdue on 9/16; a lapse risks the policy.',
    owner:'You', due:dueTxt(fd) || wdate(f15.toISOString()), src:'FCCI notice 9/16', cf:[85, "Due-date rule from FCCI's 9/16 overdue notice. The dashboard can't see whether this month's report is already filed or paid."]}, fd);
  // priorities that need Stephen's OK / due within 2 days
  top.filter(r => r !== ming && !r.held && (r.needs_ok || (r.due_on && daysTo(r.due_on) <= 2))).forEach(r => { const dd = r.due_on ? daysTo(r.due_on) : null;
    add({st:r.needs_ok ? 'r' : 'y', go:'act', lab:'FACT', h:`${r.needs_ok ? 'OK: ' : ''}${r.title}`, amt:null, cons:r.next_step || 'Waiting on you.', owner:r.needs_ok ? `You → ${r.owner_bot}` : r.owner_bot,
      due:r.due_on ? (dueTxt(dd) || wdate(r.due_on)) : 'no date', src:'My priorities', cf:[100, 'Live from your priorities list (the list is the source of record).']}, dd ?? 3); });
  if (rv.w7 && rv.w7.low) add({st:'r', go:'mk', lab:'FACT', feed:'birdeye_sync', h:`Call ${rv.w7.low} customer${rv.w7.low > 1 ? 's' : ''} who left 3★ or less`, amt:null, cons:'Then reply on Google. Unanswered low reviews cost new calls.', owner:'You / office', due:'today', src:'Birdeye', cf:[98, 'Birdeye copy of Google reviews (synced hourly).']}, 0);
  out.sort((a, b) => b.score - a.score);
  const vis = out.slice(0, 5), more = out.slice(5);
  return `<div class="tsec">${tsh('🔴 Act now', 'Ranked by $ at stake × how soon it is due.')}${vis.map(trow).join('') || '<div class="cs tnone">✅ Nothing urgent.</div>'}
   ${more.length ? `<details class="fold tmore"><summary>+${more.length} lower</summary>${more.map(trow).join('')}</details>` : ''}</div>`;
}

// 2) PACE STRIP: last workday + month to date vs target
function pace(t) {
  const {d, jd, lastWD, m1, today, wd, calDays, st} = t, lw = jd.find(r => r.day === lastWD) || {}, mtd = jd.filter(r => r.day >= m1 && r.day < today);
  const lwl = lastWD ? wdate(lastWD).replace(',', '') : 'last workday';
  const vp = (a, b) => a == null || !b ? null : a / b - 1, vpts = (a, b) => a == null || b == null ? null : (a - b) * 100;
  const chip = (v, unit) => v == null ? '<b class="pv">–</b>' : `<b class="pv" style="color:${v >= 0 ? C.green : v > (unit === '%' ? -.1 : -10) ? C.amber : C.red}">${v >= 0 ? '+' : '−'}${unit === '%' ? Math.round(Math.abs(v) * 100) + '%' : Math.abs(v).toFixed(0) + ' pts'}</b>`;
  const cell = (o) => { const [p, why] = cfOf({cf:o.cf}, false, {status:'OK'});
    return `<div class="pc"><div class="pt">${o.t}${cfBadge(p, why)}</div><div class="pr"><span>${lwl}</span><em>${o.a}</em>${chip(o.av, o.u)}</div><div class="pr"><span>MTD</span><em>${o.m}</em>${chip(o.mv, o.u)}</div><div class="pg">${o.g}</div><div class="cfr" hidden></div></div>`; };
  const revM = sum(mtd, r => +r.rev), goalM = d.rpdGoal * wd;
  const gm = rs => { const rv = sum(rs, r => +r.rev); return rv ? (rv - sum(rs, r => +r.cost)) / rv : null; };
  const gL = gm(lw.day ? [lw] : []), gM = gm(jd.filter(r => r.day >= m1));
  const cur = S.csr.find(r => String(r.month).slice(0, 10) === d.cm), bM = cur && cur.lead_calls ? cur.booked / cur.lead_calls : null, bookGoal = (kpi(9) || 40) / 100;
  const cd = (S.lk_calls_daily || []).find(r => String(r.ct_date).slice(0, 10) === lastWD), ans = cd && cd.lead_inbound ? 1 - cd.missed / cd.lead_inbound : null;
  const pd = ((st.payments || {}).days) || {}, pdays = Object.entries(pd).filter(([k]) => k < today);
  const last30 = pdays.filter(([k]) => k >= isoCT(Date.now() - 31 * 864e5) && k < m1), perDay = last30.length ? sum(last30, ([, v]) => v[1]) / 30 : null;
  const wkd = pdays.filter(([k]) => ![0, 6].includes(new Date(k + 'T12:00:00').getDay()) && k < (lastWD || today)), perWd = wkd.length ? sum(wkd, ([, v]) => v[1]) / wkd.length : null;
  const cL = lastWD && pd[lastWD] ? pd[lastWD][1] : null, cM = sum(pdays.filter(([k]) => k >= m1), ([, v]) => v[1]);
  const sd = ((st.sold || {}).days) || {}, sM = sum(Object.entries(sd).filter(([k]) => k >= m1 && k < today), ([, v]) => v[1]), sL = lastWD && sd[lastWD] ? sd[lastWD][1] : 0;
  const cells = [
    {t:'Revenue', a:kfmt(lw.rev), av:vp(lw.rev, d.rpdGoal), m:kfmt(revM), mv:wd ? vp(revM, goalM) : null, u:'%', g:`goal ${usdK(d.rpdGoal)}/workday${wd ? ` · MTD goal ${usdK(goalM)} (${wd} workdays)` : ''} · sold ${kfmt(sL)} / ${kfmt(sM)} MTD`,
      cf:[95, 'ST 2469 job revenue by invoice date vs the revenue-per-day goal × Mon–Fri workdays so far this month (through yesterday). "Sold" = estimates sold, from the 15-min ServiceTitan feed.']},
    {t:'Booking rate', a:ans != null ? pct(ans) + '*' : '–', av:null, m:bM != null ? pct(bM) : '–', mv:bM != null ? vpts(bM, bookGoal) : null, u:'pts', g:`goal ${pct(bookGoal)}${cur ? ` · MTD ${cur.booked} of ${cur.lead_calls} lead calls` : ''} · *day = lead calls answered or not missed`,
      cf:[88, 'MTD is the ST 2409 CSR report for this month so far (loaded daily). ServiceTitan has no booked-per-day split here, so the day figure is lead calls not missed (leak tracker), a proxy shown without a variance.']},
    {t:'Cash collected', a:kfmt(cL), av:vp(cL, perWd), m:kfmt(cM), mv:perDay && calDays ? vp(cM, perDay * calDays) : null, u:'%', g:`vs normal: ${kfmt(perWd)}/weekday, ${kfmt(perDay)}/day (last 30 days) · no cash target set`,
      cf:stCf(96, 'ServiceTitan payments by payment date (as entered). There is no cash-collected target yet, so variance is vs the last 30 days\' normal.')},
    {t:'Completed-job margin', a:gL != null ? pct(gL, 0) : '–', av:vpts(gL, d.gmGoal), m:gM != null ? pct(gM, 0) : '–', mv:vpts(gM, d.gmGoal), u:'pts', g:`goal ${pct(d.gmGoal)} · ${lw.jobs || 0} jobs ${lwl} · ${sum(jd.filter(r => r.day >= m1), r => r.jobs)} MTD · may drop as vendor bills post`,
      cf:[85, 'ST 2469 job-costing margin on invoiced jobs. Vendor bills often post days after the job, so recent days read high until costs land; a same-day margin is not shown for that reason.']}];
  return `<div class="tsec">${tsh('📈 Pace', `${lwl} (last full workday) and month to date vs target.`)}<div class="pace">${cells.map(cell).join('')}</div></div>`;
}

// 3) LEAK $ YESTERDAY: one number, four queues
function leak(t) {
  const {T, yday, br, avgJob} = t, ylab = wdate(yday).replace(',', ''), on = x => String(x.day).slice(0, 10) === yday;
  const lc = (T.leak_calls || []).filter(on), cOpen = sum(lc.filter(r => r.status === 'open'), r => r.n), cRes = sum(lc.filter(r => r.status !== 'open'), r => r.n);
  const can = sum((T.leak_cancels || []).filter(on), r => r.n);
  const lh = (T.leak_hot || []).filter(on), hOpen = lh.filter(r => r.status === 'open'), hN = sum(hOpen, r => r.n), hAmt = sum(hOpen, r => +(r.amt || 0)) || hN * avgJob, hRec = sum(lh.filter(r => r.status !== 'open'), r => r.n);
  const has = k => T[k] && !T[k + '_error'];
  const q = [
    {h:'Calls not called back', n:cOpen, v:cOpen * br * avgJob, rec:cRes ? `${cRes} called back (≈${usd(cRes * br * avgJob)})` : '', who:'Office / CSRs', ok:has('leak_calls')},
    {h:'Cancels not rebooked', n:can, v:can * avgJob, rec:can ? 'rebook check not built yet; all counted' : '', who:'Dispatch', ok:has('leak_cancels')},
    {h:'Heard, not estimated', n:hN, v:hAmt, rec:hRec ? `${hRec} now estimated` : '', who:'Sales', ok:has('leak_hot')},
    {h:'Estimates, no follow-up in 48h', n:null, v:null, rec:'', who:'Sales', ok:false, ph:'placeholder: follow-up calls not tracked yet'}];
  const total = sum(q.filter(x => x.v != null), x => x.v);
  const [p, why] = cfOf({cf:[65, `ESTIMATE: ServiceTitan's Missed Revenue method. Calls = count × ${pct(br)} booking rate (last full month) × ${usd(avgJob)} average job (90 days); cancels and heard-not-estimated = count × average job (or the amount heard). Cancels are not yet checked for a rebook, so they are an upper bound. The fourth queue is not measured yet.`]}, false, {status:'OK'});
  return `<div class="tsec tleak tgo" data-go="est">${tsh(`💧 Leak $ yesterday · ${ylab}`, '')}
   <div class="lk1"><b>≈${usd(total)}</b><span class="lab ESTIMATE">ESTIMATE</span>${cfBadge(p, why)}</div><div class="cfr" hidden></div>
   ${q.map(x => `<div class="lkq"><span>${x.h}</span><em>${x.ok ? x.n : '–'}</em><b>${x.ok && x.v != null ? usd(x.v) : '–'}</b><i>${x.ph ? x.ph : x.ok ? [x.rec, x.who].filter(Boolean).join(' · ') : 'tracker not loaded'}</i></div>`).join('')}</div>`;
}

// 4) TREND FLAGS: fixed threshold rules, max 3
function flags(t) {
  const {T, st, d} = t, out = [], ok = [], notyet = [];
  const ah = st.ar_hist && st.ar_hist.points;
  if (ah && ah.length >= 4) { const p = k => ah.find(x => x.days_ago === k) || {}; const a = p(0), b = p(30), e = p(90);
    if (a.over60 > b.over60 * 1.25 && a.over60 - b.over60 > 5000) out.push({st:a.over60 > b.over60 * 1.5 ? 'r' : 'y', ord:1, go:'fin', lab:'FACT', h:`AR 60+ creeping: ${usd(a.over60)} vs ${usd(b.over60)} a month ago`,
      txt:`${usd(e.over60)} 90 days ago. Rule: up >25% and >$5K vs 30 days ago.`, src:'ST 385', cf:[95, 'ServiceTitan AR report 385 re-run as of each past date (same method). Late-keyed payments are back-dated, so older points can shift a little.']});
    else ok.push('AR 60+'); } else notyet.push('AR 60+ trend');
  (T.dept_trend || []).forEach(g => { if (!g.n7 || g.n7 < 5 || !g.rev90) return; const m7 = g.gp7 / g.rev7, m90 = g.gp90 / g.rev90, thr = Math.max(.05, 2 * (g.sd_week || 0));
    if (m7 < m90 - thr) out.push({st:m7 < m90 - 1.5 * thr ? 'r' : 'y', ord:2, go:'ov', lab:'FACT', feed:'dash_job_costing', h:`${g.grp} margin ${pct(m7)} last 7 days vs ${pct(m90)} normal`, txt:`${g.n7} jobs. Rule: below 90-day margin by more than ${pct(thr)}.`, src:'ST 2469', cf:[88, 'ServiceTitan job-costing margin; recent jobs can be missing late vendor bills.']});
    else ok.push(`${g.grp} margin`); });
  d.gmDept.forEach(g => { const v = g.vals.filter(x => x !== null); if (v.length < 4) return; const a = last(v), prev = v.slice(-4, -1), avg = prev.reduce((s, x) => s + x, 0) / prev.length;
    if (a < avg - 8) out.push({st:a < avg - 15 ? 'r' : 'y', ord:3, go:'ov', lab:'FACT', feed:'dash_job_costing', h:`${g.d} margin ${a.toFixed(0)}% in ${mon(last(d.gmMonths))} vs ${avg.toFixed(0)}% normal`, txt:'Rule: last month more than 8 pts under the 3 months before.', src:'ST 2469', cf:[92, 'ServiceTitan job-costing margin for a closed month.']});
    else ok.push(`${g.d} month margin`); });
  const bw = S.booked_weekly.filter(r => r.week < d.cw && r.booked > 0), rates = bw.map(r => r.canceled / r.booked);
  if (rates.length >= 7) { const lr = last(rates), base = rates.slice(0, -1), mu = base.reduce((s, x) => s + x, 0) / base.length, sdv = Math.sqrt(base.reduce((s, x) => s + (x - mu) ** 2, 0) / base.length);
    if (lr > mu + 2 * sdv && last(bw).canceled >= 5) out.push({st:'y', ord:4, go:'est', lab:'FACT', feed:'dash_sales', h:`Cancels ${pct(lr)} of jobs booked wk of ${md(last(bw).week)}`, txt:`Normal ${pct(mu)}. Rule: above normal + 2 SD and 5+ cancels.`, src:'ST jobs', cf:CF.st('ServiceTitan jobs (canceled ÷ booked)')});
    else ok.push('cancels'); }
  const c30 = d.tw30.close_rate, c90 = d.tw90.close_rate;
  if (c30 != null && c90 != null) { if (c30 < c90 - .03) out.push({st:c30 < c90 - .07 ? 'r' : 'y', ord:5, go:'est', lab:'FACT', feed:'dash_sales', h:`Close rate ${pct(c30)} (30 days) vs ${pct(c90)} (90)`, txt:'Rule: 30-day rate more than 3 pts under 90-day.', src:'ST 325', cf:CF.st('ST 325')});
    else ok.push('close rate'); }
  const cl = S.calls, cm = d.cm, cur = cl.find(r => r.month.slice(0, 10) === cm), prev = cl.filter(r => r.month.slice(0, 10) < cm).slice(-3);
  if (cur && cur.calls >= 30 && prev.length === 3) { const rr = r => r.abandoned / r.calls, mu = prev.reduce((s, r) => s + rr(r), 0) / 3, sdv = Math.sqrt(prev.reduce((s, r) => s + (rr(r) - mu) ** 2, 0) / 3), lim = mu + Math.max(.05, 2 * sdv);
    if (rr(cur) > lim) out.push({st:'r', ord:6, go:'mk', lab:'FACT', feed:'dash_marketing', h:`Call abandonment ${pct(rr(cur))} this month vs ${pct(mu)}`, txt:'Rule: above 3-month normal by 5 pts or 2 SD.', src:'ST 2246', cf:CF.st('the ST 2246 call report')});
    else ok.push('call abandonment'); }
  const base = S.cash13.filter(r => r.scenario === 'Base'), firstNeg = base.find(r => r.ending_cash < 0);
  if (firstNeg) out.push({st:'r', ord:7, go:'fin', lab:'ESTIMATE', feed:'dash_cash13', h:`Cash forecast below $0 wk of ${md(firstNeg.week_start)}`, txt:'Rule: any base-case week under $0.', src:'CFO Desk 13-week', cf:[70, '13-week cash forecast (base case), not bank balances.']}); else ok.push('cash forecast');
  if (d.lf && d.pf && d.lf.fuel_usd > d.pf.fuel_usd * 1.25) out.push({st:'y', ord:8, go:'fl', lab:'FACT', feed:'fleet_fuel', h:`Fuel spend up ${pct(d.lf.fuel_usd / d.pf.fuel_usd - 1)} in ${mon(d.lf.month)}`, txt:'Rule: up >25% month over month.', src:'Fuel card', cf:CF.fuel(d.lf)});
  out.sort((a, b) => (SEV[a.st] - SEV[b.st]) || (a.ord - b.ord));
  const rules = out.length + ok.length, hid = out.length - 3;
  return `<div class="tsec">${tsh('🟡 Flags', `${rules} fixed rules checked · ${out.length} tripped${hid > 0 ? ` · worst 3 shown (${hid} more on their tabs)` : ''}`)}${out.slice(0, 3).map(trow).join('') || '<div class="cs tnone">✅ Every rule inside its normal range.</div>'}
   <details class="fold tmore"><summary>Rules inside normal range (${ok.length})${notyet.length ? ` · not checked yet (${notyet.length})` : ''}</summary><div class="tfoot">${esc(ok.join(' · '))}${notyet.length ? '<br>Not checked yet: ' + esc(notyet.join(' · ')) : ''}</div></details></div>`;
}

// 5) ONE WIN
function win(t) {
  const {st, d, jd, m1, today, wd} = t, top = ((st.sold || {}).top_recent || [])[0], r1 = d.rv.d1 || {}, revM = sum(jd.filter(r => r.day >= m1 && r.day < today), r => +r.rev);
  let w = null;
  if (top && top.amt >= 5000) w = {h:`Sold ${usd(top.amt)}: ${top.name} (${wdate(top.day).replace(',', '')})`, src:'ST estimates', go:'est', cf:stCf(98, 'Straight from ServiceTitan estimates sold (CT).')};
  else if (wd && revM >= d.rpdGoal * wd) w = {h:`Revenue ${pct(revM / (d.rpdGoal * wd) - 1)} ahead of goal this month`, src:'ST 2469', go:'ov', cf:[95, 'ST 2469 job revenue vs revenue-per-day goal × workdays so far.']};
  else if (r1.five) w = {h:`${r1.five} new 5★ review${r1.five > 1 ? 's' : ''} today`, src:'Birdeye', go:'mk', feed:'birdeye_sync', cf:[98, 'Birdeye copy of Google reviews.']};
  else if (top) w = {h:`Biggest recent sale ${usd(top.amt)}: ${top.name}`, src:'ST estimates', go:'est', cf:stCf(98, 'ServiceTitan estimates sold.')};
  return w ? `<div class="tsec">${tsh('🟢 Win', '')}${trow({...w, st:'g', lab:'FACT'})}</div>` : '';
}

function synced(t) {
  const {T, st} = t, mx = a => a && a.length ? a.map(r => r.as_of).filter(Boolean).sort().slice(-1)[0] : null, rv = t.d.rv, B = T.bills || {};
  const srcs = [['ServiceTitan live (sales, payments, AR history)', st.as_of], ['ST job costing', mx(T.jc_days)], ['Calls & leak tracker', mx(T.leak_calls)], ['Google reviews (Birdeye)', rv.as_of],
    ['CFO Desk cash plan', B.file_mtime], ['My priorities', 'live']];
  return `<div class="tfoot tsync"><b>Data last synced:</b> ${srcs.map(([k, v]) => `${esc(k)} <b>${v === 'live' ? 'live' : esc(ct(v))}</b>`).join(' · ')} · QuickBooks P&amp;L: closed months only (Overview).</div>`;
}

function pageToday() {
  const n = ctNow(), t = TD();
  return `<div class="today"><div class="thead"><h1>Today · ${n.toLocaleDateString('en-US', {weekday:'short', month:'short', day:'numeric'})}</h1><span>Tap a row to open it · % chip = data confidence</span></div>
   ${actNow(t)}${pace(t)}${leak(t)}${flags(t)}${win(t)}${synced(t)}
   <div class="tfoot tlinks">Ongoing status: <a href="#ov" data-go="ov">Overview</a> · <a href="#fin" data-go="fin">Finance</a> · <a href="#est" data-go="est">Estimates &amp; sales</a></div></div>`;
}

// ---------- Finance = Collections / AR + Unsent invoices on one tab
function pageFin() {
  const r = right(), strip = h => h.replace('<div class="cols"><div class="left">', '').replace(`</div>${r}</div>`, '');
  return `<div class="cols"><div class="left">${section('Collections / AR', 'Money customers owe us, oldest first.')}${strip(pageAR())}
   ${section('Unsent invoices', 'Finished jobs with a balance that have not been emailed.')}${strip(pageUnsent())}</div>${r}</div>`;
}
