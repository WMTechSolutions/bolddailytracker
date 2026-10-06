export const CATS = { client: 'Real Estate Client', recruit: 'Recruit', current: 'Current Agent', past: 'Past Agent', biz: 'Business Customer' };
// Weekly numbers BOLD asks for (l = short label in the app, r = wording on the BOLD report)
export const NUMS = [
  { k: 'contacts_added', l: 'Contacts added to database', r: 'Contacts Added to Database' },
  { k: 'listing_appts', l: 'Listing appointments gone on', r: 'Total Listing Appointments Gone On Last Week' },
  { k: 'buyer_appts', l: 'Buyer appointments gone on', r: 'Total Buyer Appointments Gone On Last Week' },
  { k: 'listings_taken', l: 'Listings taken', r: 'Total Listings Taken Last Week' },
  { k: 'buyers_taken', l: 'Buyers taken', r: 'Total Buyers Taken Last Week' },
  { k: 'under_contract', l: 'Under contract', r: 'Total Under Contract' },
];
export const LEADER_NUMS = [
  { k: 'recruits_added', l: 'Recruits added to database', r: 'Recruits Added to Database' },
  { k: 'recruiting_appts', l: 'Recruiting appointments', r: 'Recruiting Appts (for Leaders)' },
  { k: 'recruits_signed', l: 'Recruits signed', r: 'Recruits Signed (for Leaders)' },
];
const AGENT_CATS = ['client', 'current', 'past'];

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const pad = n => String(n).padStart(2, '0');
const fromKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const toKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const pretty = k => fromKey(k).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

function download(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function inRange(entries, from, to) {
  return entries.filter(e => e.date >= from && e.date <= to).sort((a, b) => a.ts - b.ts);
}

export function exportCSV(entries, from, to) {
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['Date', 'Time', 'Name', 'Category', 'Channel', 'Two-way', 'Phone/Handle', 'Notes'],
    ...inRange(entries, from, to).map(e => [e.date, new Date(e.ts).toLocaleTimeString(), e.name, CATS[e.cat], e.ch, e.two ? 'Yes' : 'No', e.phone, e.notes])];
  download(`onward-bold-calls-${from}_to_${to}.csv`, new Blob([rows.map(r => r.map(q).join(',')).join('\n')], { type: 'text/csv' }));
}

export async function exportXLSX(entries, from, to, weeklyGoal, numbers = {}, isLeader = false) {
  const ExcelJS = (await import('exceljs')).default;
  const list = inRange(entries, from, to);
  const two = list.filter(e => e.two);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Onward BOLD Tracker';

  const PURPLE = 'FF6735A3', INK = 'FFFFFFFF', LIGHT = 'FFF3F5FA';
  const head = row => row.eachCell(c => {
    c.font = { bold: true, color: { argb: INK } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PURPLE } };
    c.alignment = { vertical: 'middle' };
  });

  // ---- BOLD Report (matches the weekly BOLD categories) ----
  const mondayOf = k => { const d = fromKey(k); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return toKey(d); };
  const sums = {};
  for (const [ws, m] of Object.entries(numbers)) {
    if (ws >= mondayOf(from) && ws <= to) for (const [k, v] of Object.entries(m)) sums[k] = (sums[k] || 0) + v;
  }
  const r = wb.addWorksheet('BOLD Report');
  r.columns = [{ width: 52 }, { width: 14 }];
  r.addRow(['Onward BOLD — Weekly Numbers']).font = { bold: true, size: 16 };
  r.addRow([`${pretty(from)} – ${pretty(to)}`]).font = { color: { argb: 'FF666666' } };
  r.addRow([]);
  const section = (title, rows) => {
    head(r.addRow([title, '']));
    rows.forEach(([label, n]) => { const row = r.addRow([label, n]); row.getCell(2).alignment = { horizontal: 'right' }; row.getCell(2).font = { bold: true }; });
    r.addRow([]);
  };
  section('AGENTS', [
    ['Conversations Made', two.filter(e => AGENT_CATS.includes(e.cat)).length],
    ...NUMS.map(n => [n.r, sums[n.k] || 0]),
  ]);
  if (isLeader) section('LEADERSHIP', [
    ['Recruit Conversations Made', two.filter(e => e.cat === 'recruit').length],
    ['Business Customer Conversations Made', two.filter(e => e.cat === 'biz').length],
    ...LEADER_NUMS.map(n => [n.r, sums[n.k] || 0]),
  ]);
  r.addRow(['Conversations Made = two-way conversations with Real Estate Clients, Current Agents and Past Agents. Recruit and Business Customer conversations are listed under Leadership.']).font = { italic: true, color: { argb: 'FF888888' } };

  // ---- Summary ----
  const s = wb.addWorksheet('Summary');
  s.columns = [{ width: 26 }, { width: 18 }, { width: 18 }, { width: 18 }];
  s.addRow(['Onward BOLD — Conversation Report']).font = { bold: true, size: 16 };
  s.addRow([`${pretty(from)} – ${pretty(to)}`]).font = { color: { argb: 'FF666666' } };
  s.addRow([]);
  const days = Math.round((fromKey(to) - fromKey(from)) / 864e5) + 1;
  const isWeek = days === 7;
  const t = s.addRow(['Two-way conversations', two.length]);
  t.font = { bold: true, size: 13 };
  if (isWeek && weeklyGoal) {
    s.addRow(['Weekly goal', weeklyGoal]);
    s.addRow(['% of goal', two.length / weeklyGoal]).getCell(2).numFmt = '0%';
  }
  s.addRow(['Attempts (no reply)', list.length - two.length]);
  s.addRow(['Unique people reached', new Set(two.map(e => e.name.trim().toLowerCase())).size]);
  s.addRow([]);

  const table = (title, header, rows) => {
    s.addRow([title]).font = { bold: true, size: 12 };
    head(s.addRow(header));
    rows.forEach(r => s.addRow(r));
    s.addRow([]);
  };

  const dayRows = [];
  for (let d = fromKey(from); toKey(d) <= to; d.setDate(d.getDate() + 1)) {
    const k = toKey(d);
    dayRows.push([k, DAYS[d.getDay()], two.filter(e => e.date === k).length, list.filter(e => e.date === k && !e.two).length]);
  }
  if (dayRows.length <= 92) table('By day', ['Date', 'Day', 'Conversations', 'Attempts'], dayRows);

  const count = f => { const m = {}; two.forEach(e => { const k = f(e); m[k] = (m[k] || 0) + 1; }); return Object.entries(m); };
  table('By category (two-way)', ['Category', 'Conversations'], count(e => CATS[e.cat]));
  table('By channel (two-way)', ['Channel', 'Conversations'], count(e => e.ch));

  // ---- Log ----
  const l = wb.addWorksheet('Log', { views: [{ state: 'frozen', ySplit: 1 }] });
  l.columns = [
    { header: 'Date', key: 'date', width: 12 }, { header: 'Time', key: 'time', width: 10 },
    { header: 'Name', key: 'name', width: 28 }, { header: 'Category', key: 'cat', width: 18 },
    { header: 'Channel', key: 'ch', width: 10 }, { header: 'Two-way', key: 'two', width: 10 },
    { header: 'Phone / Handle', key: 'phone', width: 18 }, { header: 'Notes', key: 'notes', width: 50 },
  ];
  head(l.getRow(1));
  list.forEach((e, i) => {
    const r = l.addRow({
      date: e.date, time: new Date(e.ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      name: e.name, cat: CATS[e.cat], ch: e.ch, two: e.two ? 'Yes' : 'No', phone: e.phone, notes: e.notes,
    });
    r.getCell('notes').alignment = { wrapText: true, vertical: 'top' };
    if (i % 2) r.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } }; });
  });
  l.autoFilter = { from: 'A1', to: 'H1' };

  const buf = await wb.xlsx.writeBuffer();
  download(`onward-bold-report-${from}_to_${to}.xlsx`,
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
}
