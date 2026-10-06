// Theme (light / dark / auto) and text size, remembered per device.
const get = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
const put = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };
const mq = window.matchMedia('(prefers-color-scheme: dark)');

export const getTheme = () => get('ob.theme', 'auto');
export const getSize = () => get('ob.size', '1');
export const resolved = () => { const t = getTheme(); return t === 'auto' ? (mq.matches ? 'dark' : 'light') : t; };

export function applyTheme() {
  const r = resolved();
  document.documentElement.dataset.theme = r;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', r === 'dark' ? '#000000' : '#f6f3fb');
  document.querySelectorAll('.themelink').forEach(a => { a.textContent = r === 'dark' ? '☀ Light mode' : '🌙 Dark mode'; });
  document.documentElement.style.setProperty('--zoom', getSize());
  document.querySelectorAll('input[name=th]').forEach(i => { i.checked = i.value === getTheme(); });
  document.querySelectorAll('input[name=sz]').forEach(i => { i.checked = i.value === getSize(); });
}
export function setTheme(v) { put('ob.theme', v); applyTheme(); }
export function setSize(v) { put('ob.size', v); applyTheme(); }
export function toggleTheme() { setTheme(resolved() === 'dark' ? 'light' : 'dark'); }

mq.addEventListener?.('change', applyTheme);
applyTheme();
