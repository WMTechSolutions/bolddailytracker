export const CATS = { current: 'Current Agent', past: 'Past Agent', biz: 'Business Customer' };
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

export async function exportXLSX(entries, from, to, weeklyGoal) {
  const ExcelJS = (await import('exceljs')).default;
  const list = inRange(entries, from, to);
  const two = list.filter(e => e.two);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Onward BOLD Tracker';

  const ORANGE = 'FFFF7A1A', INK = 'FF1A0D00', LIGHT = 'FFF3F5FA';
  const head = row => row.eachCell(c => {
    c.font = { bold: true, color: { argb: INK } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ORANGE } };
    c.alignment = { vertical: 'middle' };
  });

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
