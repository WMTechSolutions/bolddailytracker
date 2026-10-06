import './style.css';
import { sb, configured } from './supabase.js';
import { CATS, exportCSV, exportXLSX } from './export.js';

const DAYN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const dkey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
function weekStart(d) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
function weekKeys(from = new Date()) { const ws = weekStart(from); return [...Array(7)].map((_, i) => { const d = new Date(ws); d.setDate(ws.getDate() + i); return dkey(d); }); }

let S = { entries: [], settings: { weekly: 100, days: [1, 2, 3, 4, 5] } };
let user = null;

// ---------- per-device "already celebrated today" flag ----------
const celeb = {
  has: k => { try { return localStorage.getItem('ob.celebrated.' + k) === '1'; } catch { return false; } },
  set: k => { try { localStorage.setItem('ob.celebrated.' + k, '1'); } catch { /* ignore */ } },
  clear: k => { try { localStorage.removeItem('ob.celebrated.' + k); } catch { /* ignore */ } },
};

// ---------- data layer ----------
const fromRow = r => ({ id: r.id, name: r.name, cat: r.cat, ch: r.ch, two: r.two, phone: r.phone, notes: r.notes, date: r.date, ts: Date.parse(r.created_at) });

async function loadAll() {
  const entries = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('conversations').select('*').order('created_at').range(from, from + 999);
    if (error) throw error;
    entries.push(...data.map(fromRow));
    if (data.length < 1000) break;
  }
  S.entries = entries;
  const { data: st } = await sb.from('settings').select('*').maybeSingle();
  if (st) S.settings = { weekly: st.weekly, days: st.days };
}

async function saveSettings() {
  const { error } = await sb.from('settings').upsert({ user_id: user.id, weekly: S.settings.weekly, days: S.settings.days });
  if (error) toast('⚠️ Could not save settings: ' + error.message);
}

// ---------- goal math ----------
function calc() {
  const wk = weekKeys(), today = dkey(new Date()), wg = +S.settings.weekly || 100, days = S.settings.days;
  const conv = S.entries.filter(e => e.two && wk.includes(e.date));
  const before = conv.filter(e => e.date < today).length;
  const todayN = conv.filter(e => e.date === today).length;
  const weekN = conv.length;
  const isWork = days.includes(new Date().getDay());
  const daysLeft = wk.filter(k => k >= today && days.includes(fromKey(k).getDay())).length;
  const remStart = Math.max(0, wg - before);
  let goal, mode;
  if (remStart === 0) { goal = 0; mode = 'done'; }
  else if (isWork) { goal = Math.ceil(remStart / Math.max(1, daysLeft)); mode = 'work'; }
  else if (daysLeft > 0) { goal = 0; mode = 'rest'; }
  else { goal = remStart; mode = 'catch'; }
  const base = Math.ceil(wg / Math.max(1, days.length));
  return {
    wk, today, wg, weekN, todayN, before, goal, mode, daysLeft, base, remaining: Math.max(0, wg - weekN),
    attempts: S.entries.filter(e => e.date === today && !e.two).length,
  };
}

// ---------- render ----------
function render() {
  const c = calc();
  $('today').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const pct = c.goal > 0 ? Math.min(1, c.todayN / c.goal) : (c.mode === 'done' ? 1 : 0);
  $('ringfg').style.strokeDashoffset = 452.4 * (1 - pct);
  $('rcount').textContent = c.todayN;
  $('rgoal').textContent = c.goal > 0 ? `of ${c.goal} today` : 'today';
  let head, pills = '', detail = '';
  if (c.mode === 'done') { head = '🏆 Weekly goal crushed!'; detail = `You've hit ${c.wg} two-way conversations this week. Anything extra is bonus.`; }
  else if (c.mode === 'rest') { head = 'Rest day'; detail = `Not a work day, but anything you log still counts toward the week. Next work day you'll need about ${Math.ceil(c.remaining / Math.max(1, c.daysLeft))}.`; }
  else {
    const left = Math.max(0, c.goal - c.todayN);
    head = left === 0 ? '🎉 Daily goal hit!' : `${left} more to hit today's goal`;
    if (c.goal > c.base) pills += `<span class="pill warn">+${c.goal - c.base} catch-up (normal pace is ${c.base})</span>`;
    else if (c.goal < c.base) pills += `<span class="pill ok">${c.base - c.goal} under normal pace — you're ahead</span>`;
    else pills += `<span class="pill">On pace: ${c.base}/day</span>`;
    pills += `<span class="pill">${c.daysLeft} work day${c.daysLeft === 1 ? '' : 's'} left incl. today</span>`;
    detail = c.mode === 'catch' ? "Work days are over for the week — this is what's left to finish strong." :
      (c.goal > c.base ? `You were behind going into today, so today's target went up from ${c.base} to ${c.goal}.` : 'Hit this and you stay on track for 100.');
  }
  $('headline').textContent = head; $('pills').innerHTML = pills; $('detail').textContent = detail;
  $('s-week').textContent = c.weekN; $('s-wg').textContent = c.wg; $('s-left').textContent = c.remaining; $('s-att').textContent = c.attempts;
  $('weekbar').style.width = Math.min(100, c.weekN / c.wg * 100) + '%';

  $('known').innerHTML = people().map(p => `<option value="${esc(p.name)}">`).join('');

  const te = S.entries.filter(e => e.date === c.today).sort((a, b) => b.ts - a.ts);
  $('logcount').textContent = te.length ? `· ${te.length}` : '';
  $('todaylog').innerHTML = te.length ? te.map(entryHTML).join('') : '<div class="empty">Nothing logged yet today. Go get \'em.</div>';

  renderWeek(c); renderPeople();
}
function entryHTML(e) {
  const t = new Date(e.ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `<div class="entry"><div class="main"><div class="nm">${esc(e.name)}</div>
  <div class="meta"><span class="tag ${e.cat}">${CATS[e.cat]}</span>${e.two ? '' : '<span class="tag one">No reply</span>'}${esc(e.ch)} · ${t}${e.phone ? ' · ' + esc(e.phone) : ''}</div>
  ${e.notes ? `<div class="nt">${esc(e.notes)}</div>` : ''}</div>
  <button class="x" data-del="${e.id}" title="Delete">✕</button></div>`;
}
function renderWeek(c) {
  const mx = Math.max(c.base, ...c.wk.map(k => S.entries.filter(e => e.two && e.date === k).length), 1);
  $('weekdays').innerHTML = c.wk.map(k => {
    const n = S.entries.filter(e => e.two && e.date === k).length, d = fromKey(k);
    return `<div class="day ${k === c.today ? 'today' : ''}"><div class="d">${DAYN[d.getDay()]} ${d.getDate()}</div>
    <div class="bar"><i style="width:${n / mx * 100}%"></i></div><div class="c">${n}</div></div>`;
  }).join('');
  $('weeksum').textContent = `${c.weekN} of ${c.wg} (${Math.round(c.weekN / c.wg * 100)}%) · ${c.remaining} to go · ${c.daysLeft} work day${c.daysLeft === 1 ? '' : 's'} left`;
  const wkE = S.entries.filter(e => e.two && c.wk.includes(e.date));
  const by = f => { const m = {}; wkE.forEach(e => m[f(e)] = (m[f(e)] || 0) + 1); return m; };
  const line = m => Object.keys(m).length ? Object.entries(m).map(([k, v]) => `<span class="pill">${esc(k)}: ${v}</span>`).join('') : '<span class="date">No data yet</span>';
  $('breakdown').innerHTML = `<div>${line(by(e => CATS[e.cat]))}</div><div style="margin-top:8px">${line(by(e => e.ch))}</div>`;
}
function people() {
  const m = {};
  [...S.entries].sort((a, b) => a.ts - b.ts).forEach(e => {
    const k = e.name.trim().toLowerCase();
    const p = m[k] || (m[k] = { name: e.name.trim(), cat: e.cat, phone: '', n: 0, lastDate: '' });
    p.cat = e.cat; if (e.phone) p.phone = e.phone; if (e.two) p.n++; p.lastDate = e.date; p.name = e.name.trim();
  });
  return Object.values(m).sort((a, b) => a.name.localeCompare(b.name));
}
function renderPeople() {
  const q = $('q').value.trim().toLowerCase(), f = $('filt').value;
  const list = people().filter(p => (!f || p.cat === f) && (!q || p.name.toLowerCase().includes(q) || p.phone.toLowerCase().includes(q)));
  $('people').innerHTML = list.length ? list.map(p => `<div class="entry"><div class="main"><div class="nm">${esc(p.name)}</div>
    <div class="meta">${p.n} conversation${p.n === 1 ? '' : 's'} · last ${fromKey(p.lastDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}${p.phone ? ' · ' + esc(p.phone) : ''}</div></div>
    <select data-cat="${esc(p.name.toLowerCase())}" style="width:auto">${Object.entries(CATS).map(([k, v]) => `<option value="${k}" ${k === p.cat ? 'selected' : ''}>${v}</option>`).join('')}</select></div>`).join('')
    : '<div class="empty">No one here yet.</div>';
}

// ---------- events ----------
$('nav').onclick = e => {
  const t = e.target.dataset.t; if (!t) return;
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b === e.target));
  ['today', 'week', 'people', 'settings'].forEach(x => $('tab-' + x).classList.toggle('hide', x !== t));
};
$('name').addEventListener('input', () => {
  const p = people().find(p => p.name.toLowerCase() === $('name').value.trim().toLowerCase());
  if (p) { document.querySelector(`input[name=cat][value=${p.cat}]`).checked = true; if (p.phone && !$('phone').value) $('phone').value = p.phone; }
});

$('form').onsubmit = async ev => {
  ev.preventDefault();
  const name = $('name').value.trim(); if (!name) return;
  const before = calc();
  const row = {
    name, cat: document.querySelector('input[name=cat]:checked').value,
    ch: document.querySelector('input[name=ch]:checked').value, two: $('two').checked,
    phone: $('phone').value.trim(), notes: $('notes').value.trim(), date: $('date').value || dkey(new Date()),
  };
  const btn = $('logbtn'); btn.disabled = true;
  const { data, error } = await sb.from('conversations').insert(row).select().single();
  btn.disabled = false;
  if (error) { toast('⚠️ Not saved: ' + error.message); return; }
  S.entries.push(fromRow(data));
  $('name').value = ''; $('phone').value = ''; $('notes').value = ''; $('two').checked = true; $('date').value = dkey(new Date());
  render();
  const after = calc();
  if (row.two && after.mode !== 'rest' && before.mode !== 'done') {
    const weekHit = before.weekN < before.wg && after.weekN >= after.wg;
    const dayHit = before.goal > 0 && before.todayN < before.goal && after.todayN >= before.goal && !celeb.has(after.today);
    if (weekHit) { celeb.set(after.today); confetti(true); toast(`🏆 WEEKLY GOAL HIT! ${after.wg} conversations!`); }
    else if (dayHit) { celeb.set(after.today); confetti(); toast('🎉 Daily goal hit — nice work!'); }
  }
  $('name').focus();
};

document.addEventListener('click', async ev => {
  const d = ev.target.dataset?.del;
  if (d && confirm('Delete this entry?')) {
    const { error } = await sb.from('conversations').delete().eq('id', d);
    if (error) { toast('⚠️ ' + error.message); return; }
    S.entries = S.entries.filter(e => e.id !== d);
    const c = calc(); if (c.goal > 0 && c.todayN < c.goal) celeb.clear(c.today);
    render();
  }
});
$('people').addEventListener('change', async ev => {
  const k = ev.target.dataset.cat; if (!k) return;
  const ids = S.entries.filter(e => e.name.trim().toLowerCase() === k).map(e => e.id);
  const { error } = await sb.from('conversations').update({ cat: ev.target.value }).in('id', ids);
  if (error) { toast('⚠️ ' + error.message); return; }
  S.entries.forEach(e => { if (ids.includes(e.id)) e.cat = ev.target.value; });
  render();
});
$('q').oninput = renderPeople; $('filt').onchange = renderPeople;

// settings
function renderSettings() {
  $('set-weekly').value = S.settings.weekly;
  $('set-days').innerHTML = [1, 2, 3, 4, 5, 6, 0].map(i => `<input type="checkbox" id="wd${i}" ${S.settings.days.includes(i) ? 'checked' : ''}><label for="wd${i}">${DAYN[i]}</label>`).join('');
}
$('set-weekly').onchange = async () => { S.settings.weekly = Math.max(1, +$('set-weekly').value || 100); await saveSettings(); render(); };
$('set-days').onchange = async () => {
  const d = [1, 2, 3, 4, 5, 6, 0].filter(i => $('wd' + i).checked);
  if (!d.length) { toast('Pick at least one work day'); renderSettings(); return; }
  S.settings.days = d; await saveSettings(); render();
};

// export
function setRange(a, b) { $('x-from').value = a; $('x-to').value = b; }
function thisWeek() { const k = weekKeys(); setRange(k[0], k[6]); }
$('x-week').onclick = thisWeek;
$('x-lweek').onclick = () => { const d = new Date(); d.setDate(d.getDate() - 7); const k = weekKeys(d); setRange(k[0], k[6]); };
$('x-month').onclick = () => { const n = new Date(); setRange(dkey(new Date(n.getFullYear(), n.getMonth(), 1)), dkey(new Date(n.getFullYear(), n.getMonth() + 1, 0))); };
function range() {
  const a = $('x-from').value, b = $('x-to').value;
  if (!a || !b || a > b) { toast('Pick a valid date range'); return null; }
  return [a, b];
}
$('exp-xlsx').onclick = async () => { const r = range(); if (!r) return; $('exp-xlsx').disabled = true; try { await exportXLSX(S.entries, r[0], r[1], S.settings.weekly); } catch (e) { toast('⚠️ Export failed: ' + e.message); } $('exp-xlsx').disabled = false; };
$('exp-csv').onclick = () => { const r = range(); if (r) exportCSV(S.entries, r[0], r[1]); };

// import old backup (from the offline version)
$('imp').onclick = () => $('impfile').click();
$('impfile').onchange = async () => {
  try {
    const old = JSON.parse(await $('impfile').files[0].text());
    if (!Array.isArray(old.entries)) throw new Error('bad file');
    if (!confirm(`Import ${old.entries.length} entries into your account?`)) return;
    const rows = old.entries.map(e => ({
      name: e.name, cat: e.cat, ch: e.ch, two: !!e.two, phone: e.phone || '', notes: e.notes || '',
      date: e.date, created_at: new Date(e.ts || Date.now()).toISOString(),
    }));
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await sb.from('conversations').insert(rows.slice(i, i + 500));
      if (error) throw error;
    }
    await loadAll(); render(); toast(`Imported ${rows.length} entries`);
  } catch (e) { toast('Import failed: ' + (e.message || 'not a valid backup')); }
  $('impfile').value = '';
};
$('fxtest').onclick = () => confetti();

// ---------- toast ----------
let tt;
function toast(m) { const t = $('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 3500); }

// ---------- confetti ----------
const cv = $('fx'), cx = cv.getContext('2d'); let parts = [], raf = 0;
function size() { cv.width = innerWidth * devicePixelRatio; cv.height = innerHeight * devicePixelRatio; }
addEventListener('resize', size); size();
function confetti(big) {
  const cols = ['#6735a3', '#a47be0', '#8c5bd0', '#4f8cff', '#ff5dc8', '#2ecc8f', '#ffffff'], r = devicePixelRatio;
  const n = big ? 420 : 220;
  for (let i = 0; i < n; i++) {
    const side = i % 3;
    const x = side === 0 ? 0 : side === 1 ? cv.width : Math.random() * cv.width;
    const y = side === 2 ? -20 * r : cv.height * .75;
    const ang = side === 0 ? -Math.PI / 3 + Math.random() * .5 : side === 1 ? -2 * Math.PI / 3 - Math.random() * .5 : Math.PI / 2;
    const sp = (side === 2 ? 3 : 14 + Math.random() * 12) * r * (.6 + Math.random() * .6);
    parts.push({
      x, y, vx: Math.cos(ang) * sp + (Math.random() - .5) * 4 * r, vy: Math.sin(ang) * sp, w: (6 + Math.random() * 7) * r, h: (10 + Math.random() * 8) * r,
      rot: Math.random() * 6, vr: (Math.random() - .5) * .35, c: cols[i % cols.length], life: 0, max: 200 + Math.random() * 120, circ: Math.random() < .25,
    });
  }
  if (!raf) raf = requestAnimationFrame(tick);
}
function tick() {
  cx.clearRect(0, 0, cv.width, cv.height); const r = devicePixelRatio;
  parts = parts.filter(p => p.life < p.max && p.y < cv.height + 40);
  for (const p of parts) {
    p.life++; p.vy += .35 * r; p.vx *= .992; p.vy *= .992; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
    cx.save(); cx.globalAlpha = Math.min(1, (p.max - p.life) / 40); cx.translate(p.x, p.y); cx.rotate(p.rot); cx.fillStyle = p.c;
    if (p.circ) { cx.beginPath(); cx.arc(0, 0, p.w / 2, 0, 7); cx.fill(); } else cx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot * 2)));
    cx.restore();
  }
  raf = parts.length ? requestAnimationFrame(tick) : 0; if (!raf) cx.clearRect(0, 0, cv.width, cv.height);
}

// ---------- auth ----------
let signup = false;
function showAuth(msg = '') { $('app').classList.add('hide'); $('auth').classList.remove('hide'); $('a-msg').textContent = msg; }
$('a-switch').onclick = e => {
  e.preventDefault(); signup = !signup;
  $('auth-title').textContent = signup ? 'Create account' : 'Sign in';
  $('a-submit').textContent = signup ? 'Create account' : 'Sign in';
  $('a-switch').textContent = signup ? 'Have an account? Sign in' : 'Need an account? Create one';
  $('a-pass').autocomplete = signup ? 'new-password' : 'current-password';
};
$('authform').onsubmit = async e => {
  e.preventDefault();
  const email = $('a-email').value.trim(), password = $('a-pass').value;
  $('a-msg').textContent = '';
  const { data, error } = signup ? await sb.auth.signUp({ email, password }) : await sb.auth.signInWithPassword({ email, password });
  if (error) { $('a-msg').textContent = error.message; return; }
  if (signup && !data.session) $('a-msg').textContent = 'Check your email to confirm your account, then sign in.';
};
$('signout').onclick = async e => { e.preventDefault(); await sb.auth.signOut(); };

async function enter(session) {
  user = session.user;
  $('auth').classList.add('hide'); $('app').classList.remove('hide');
  try { await loadAll(); }
  catch (err) { toast('⚠️ Could not load data — did you run schema.sql? ' + err.message); }
  $('date').value = dkey(new Date()); thisWeek();
  renderSettings(); render();
}

if (!configured) {
  document.body.innerHTML = '<div style="padding:40px;font:16px system-ui;color:#eef2fb;max-width:520px;margin:auto"><h2>Supabase not configured</h2><p>Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to your <code>.env</code> file (or Vercel environment variables) and restart.</p></div>';
} else {
  let current = null;
  sb.auth.onAuthStateChange((_ev, session) => {
    if (session && session.user.id !== current) { current = session.user.id; enter(session); }
    else if (!session) { current = null; user = null; S.entries = []; showAuth(); }
  });
  sb.auth.getSession().then(({ data }) => { if (!data.session) showAuth(); });
  setInterval(() => { if (user && $('date').value !== dkey(new Date()) && document.activeElement.id !== 'date') { $('date').value = dkey(new Date()); render(); } }, 60000);
}
