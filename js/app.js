import * as St from './store.js';
import { icon } from './icons.js';
import { t, lang, setLang, fmtDateTime } from './i18n.js';
import { $, $$, esc, toast, modal, closeModal, dlg } from './ui.js';
import { diaryView, entryFormView } from './diary.js';
import { tasksView, taskView, clipsView, clipView } from './tasks.js';
import { coachView, coachFormView, reportView, importView, composeView } from './coach.js';
import { startTour, isTourOpen } from './tour.js';
import { mountSwitcher, hideBoot } from './family.js';

const root = () => $('#view');
let view = null;
dlg().addEventListener('click', (e) => { if (e.target === dlg()) closeModal(); });

// ================= Seiten (unten am Handy, oben am Computer) =================
const pages = () => [
  ['diary', 'nav.diary', 'book'],
  ['tasks', 'nav.tasks', 'clipboard'],
  ['clips', 'nav.clips', 'library'],
  ...(St.S.meta.coach ? [['coach', 'nav.coach', 'whistle']] : []),
  ['me', 'nav.me', 'user'],
];

// ================= Einstellungen: Name, Aussehen, Sprache, Sicherung, Trainer-Bereich =================
function meView(el) {
  const render = () => {
    const m = St.S.meta, d = St.S.data;
    el.innerHTML = `
      <div class="pagehead"><h1><span class="eyebrow">${esc(t('me.eyebrow'))}</span>${esc(t('me.title'))}</h1></div>
      <section class="panel">
        <label>${esc(t('me.name'))}<input id="me-name" maxlength="100" value="${esc(m.name)}" placeholder="${esc(t('me.namePh'))}" autocomplete="given-name"></label>
        <p class="muted small">${esc(t('me.nameHint'))}</p>
      </section>
      <section class="panel">
        <div class="lbl">${esc(t('me.theme'))}</div>
        <div class="seg wide" id="me-theme">${THEMES.map(([k, ic]) => `<button type="button" data-v="${k}" class="${theme === k ? 'on' : ''}">${icon(ic, 16)}${esc(t(`theme.${k}`))}</button>`).join('')}</div>
        <div class="lbl" style="margin-top:14px">${esc(t('me.lang'))}</div>
        <div class="seg wide" id="me-lang"><button type="button" data-v="de" class="${lang() === 'de' ? 'on' : ''}">Deutsch</button><button type="button" data-v="en" class="${lang() === 'en' ? 'on' : ''}">English</button></div>
      </section>
      <section class="panel" id="me-backup">
        <h2>${icon('shield', 20)} ${esc(t('bk.title'))}</h2>
        <p>${esc(t('bk.text'))}</p>
        <p class="muted small">${esc(t('bk.counts', { n: d.entries.length, g: d.goals.length, t: d.tasks.length, c: d.clips.length }))}<br>
          ${esc(t('bk.last', { when: m.lastExport ? fmtDateTime(m.lastExport) : t('bk.never') }))}</p>
        <div class="dlg-actions">
          <button class="primary" id="bk-exp">${icon('download', 18)}<span>${esc(t('bk.export'))}</span></button>
          <button id="bk-imp">${icon('upload', 18)}<span>${esc(t('bk.import'))}</span></button>
          <input type="file" id="bk-file" accept=".json,application/json" hidden>
        </div>
      </section>
      <section class="panel">
        <h2>${icon('whistle', 20)} ${esc(t('me.coach'))}</h2>
        <p class="muted">${esc(t('me.coachText'))}</p>
        <label class="switch"><input type="checkbox" id="me-coach" ${m.coach ? 'checked' : ''}><i></i><span>${esc(t('me.coachOn'))}</span></label>
      </section>
      <section class="panel">
        <h2>${icon('help', 20)} ${esc(t('me.help'))}</h2>
        <div class="dlg-actions"><button id="me-tour">${icon('help', 18)}<span>${esc(t('tour.btn'))}</span></button></div>
      </section>
      <section class="panel dangerzone">
        <h2>${icon('trash', 20)} ${esc(t('bk.dangerTitle'))}</h2>
        <p>${esc(t('bk.dangerText'))}</p>
        <button class="danger" id="bk-wipe">${icon('trash', 18)}<span>${esc(t('bk.wipe'))}</span></button>
      </section>
      <p class="muted small center">BadPlayer · ${esc(t('me.privacy'))}</p>`;
    $('#me-name', el).onchange = (e) => { St.setMeta({ name: e.target.value.trim() }); toast(t('me.nameSaved')); };
    $$('#me-theme button', el).forEach((b) => (b.onclick = () => setTheme(b.dataset.v)));
    $$('#me-lang button', el).forEach((b) => (b.onclick = () => { if (b.dataset.v !== lang()) toggleLang(); }));
    $('#bk-exp', el).onclick = exportAll;
    $('#bk-imp', el).onclick = () => $('#bk-file', el).click();
    $('#bk-file', el).onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importFile(f); };
    $('#me-coach', el).onchange = (e) => { St.setMeta({ coach: e.target.checked }); renderNav(); markNav('me'); toast(t(e.target.checked ? 'me.coachYes' : 'me.coachNo')); };
    $('#me-tour', el).onclick = runTour;
    $('#bk-wipe', el).onclick = () => { if (confirm(t('bk.wipeConfirm'))) { St.wipeAll(); toast(t('bk.wiped')); } };
  };
  render();
  return { refresh: () => { if (document.activeElement?.id !== 'me-name') render(); } };
}

function exportAll() {
  const blob = new Blob([JSON.stringify(St.buildExport(), null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `badplayer-${St.todayIso()}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  St.markExported();
  toast(t('bk.exported'));
}

async function importFile(file) {
  let inc;
  try { inc = St.parseImport(await file.text()); } catch { return toast(t('bk.badFile')); }
  const d = modal(`<h2>${esc(t('bk.importTitle'))}</h2>
    <p>${esc(t('bk.importInfo', { n: inc.entries.length, g: inc.goals.length, t: inc.tasks.length, c: inc.clips.length }))}</p>
    <label class="radio"><input type="radio" name="im" value="merge" checked><span><b>${esc(t('bk.merge'))}</b><br><span class="muted small">${esc(t('bk.mergeHint'))}</span></span></label>
    <label class="radio"><input type="radio" name="im" value="replace"><span><b>${esc(t('bk.replace'))}</b><br><span class="muted small">${esc(t('bk.replaceHint'))}</span></span></label>
    <div class="dlg-actions"><span class="grow"></span><button class="ghost" id="im-no">${esc(t('ui.cancel'))}</button><button class="primary" id="im-ok">${esc(t('bk.doImport'))}</button></div>`);
  $('#im-no', d).onclick = closeModal;
  $('#im-ok', d).onclick = () => {
    const mode = $('input[name=im]:checked', d).value;
    closeModal();
    St.applyImport(inc, mode);
    St.markExported(); // was gerade aus einer Datei kam, ist gesichert
    toast(t('bk.imported'));
  };
}

// ================= Kopfzeile & Navigation =================
function renderNav() {
  $('#nav').innerHTML = pages().map(([p, label, ic]) =>
    `<a href="#/${p === 'diary' ? '' : p}" data-nav="${p}">${icon(ic, 22)}<span>${esc(t(label))}</span><i class="dot hidden"></i></a>`).join('');
  updateDots();
}
const markNav = (nav) => $$('#nav a').forEach((x) => x.classList.toggle('on', x.dataset.nav === nav));
function updateDots() {
  const set = (p, on, title = '') => { const d = $(`#nav a[data-nav="${p}"] .dot`); if (d) { d.classList.toggle('hidden', !on); d.title = title; } };
  set('tasks', St.openTasks().length > 0, t('nav.tasksOpen'));
  set('clips', St.unseenClips() > 0, t('clip.new'));
  set('me', backupDue(), t('bn.backup'));
}

const THEMES = [['auto', 'auto'], ['light', 'sun'], ['dark', 'moon']];
let theme = 'auto';
try { theme = localStorage.getItem('badplayer-theme') || 'auto'; } catch { /* privat */ }
function applyTheme() {
  if (theme === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = theme;
}
function setTheme(v) {
  theme = v;
  try { localStorage.setItem('badplayer-theme', theme); } catch { /* privat */ }
  applyTheme();
  view?.refresh?.();
}

function runTour() {
  if (isTourOpen()) return;
  closeModal();
  St.setMeta({ tourDone: true });
  startTour();
}

function applyLangChrome() {
  document.title = 'BadPlayer';
  $('meta[name=description]').content = t('app.desc');
  const hb = $('#help-btn');
  hb.title = t('tour.btn'); hb.setAttribute('aria-label', t('tour.btn'));
  renderNav();
  applyTheme();
  mountSwitcher({ current: 'badplayer', lang });
}
function toggleLang() {
  if (view?.canLeave && !view.canLeave()) return;
  setLang(lang() === 'de' ? 'en' : 'de');
  applyLangChrome();
  route();
  updateChrome();
  toast(t('lang.toast'));
}

// ================= Router =================
let lastHash = location.hash;
function route() {
  // Ungespeichertes Formular? Dann bleiben, wenn der Nutzer das möchte.
  if (view?.canLeave && !view.canLeave()) { history.replaceState(null, '', lastHash || '#/'); return; }
  lastHash = location.hash;
  view?.destroy?.();
  view = null;
  closeModal();
  const parts = (location.hash.slice(1) || '/').split('/');
  const [, a, b, c, d] = parts.map((x) => { try { return decodeURIComponent(x); } catch { return x; } });
  const el = root();
  el.innerHTML = '';
  window.scrollTo(0, 0);
  let nav = 'diary';
  if (a === 'entry') view = entryFormView(el, b === 'new' ? null : b);
  else if (a === 'tasks') { view = tasksView(el); nav = 'tasks'; }
  else if (a === 'task') { view = taskView(el, b); nav = 'tasks'; }
  else if (a === 'clips') { view = clipsView(el); nav = 'clips'; }
  else if (a === 'clip') { view = clipView(el, b, c); nav = 'clips'; }
  else if (a === 'coach' && b === 'new') { view = coachFormView(el, c, d); nav = 'coach'; }
  else if (a === 'coach') { view = coachView(el); nav = 'coach'; }
  else if (a === 'report') { view = reportView(el, b); nav = 'coach'; }
  else if (a === 'me') { view = meView(el); nav = 'me'; }
  else if (a === 'import') { view = importView(el, parts[2] || ''); nav = ''; }
  else if (a === 'compose') { view = composeView(el, parts[2] || ''); nav = 'coach'; }
  else view = diaryView(el);
  markNav(nav);
}

// ================= Hinweisleiste: Speicher fehlt, Sicherung fällig =================
const DAY = 864e5;
function backupDue() {
  const m = St.S.meta, now = Date.now();
  if (!St.isDirty() || now < (m.nagUntil || 0)) return false;
  return m.lastExport ? now - m.lastExport > 30 * DAY : now - m.created > 14 * DAY;
}
let navCoach = null;
function updateChrome() {
  // Trainer-Bereich wurde ein-/ausgeschaltet (z. B. durch einen Entwurf aus BadPlan): Navigation neu
  if (navCoach !== null && navCoach !== !!St.S.meta.coach) { renderNav(); markNav(location.hash.startsWith('#/coach') || location.hash.startsWith('#/compose') ? 'coach' : ''); }
  navCoach = !!St.S.meta.coach;
  updateDots();
  const b = $('#banner');
  let html = '';
  if (St.S.volatile) html = `${icon('alert', 18)}<span>${esc(t('bn.volatile'))}</span><button id="bn-exp" class="sm">${esc(t('bk.export'))}</button>`;
  else if (backupDue()) html = `${icon('shield', 18)}<span>${esc(t('bn.backup'))}</span><button id="bn-exp" class="sm primary">${esc(t('bn.backupNow'))}</button><button id="bn-later" class="sm ghost">${esc(t('bn.later'))}</button>`;
  b.innerHTML = html;
  b.classList.toggle('hidden', !html);
  const bind = (sel, fn) => { const x = $(sel); if (x) x.onclick = fn; };
  bind('#bn-exp', exportAll);
  bind('#bn-later', () => St.setMeta({ nagUntil: Date.now() + 7 * DAY }));
}

document.addEventListener('keydown', (e) => {
  if (isTourOpen()) return;
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && view?.submit && !dlg().open) { e.preventDefault(); view.submit(); }
});
window.addEventListener('beforeunload', (e) => {
  St.flush();
  if (view?.isDirty?.()) { e.preventDefault(); e.returnValue = ''; }
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { view?.destroy?.(); St.flush(); } });

// ================= Start =================
(async function start() {
  $$('[data-icon]').forEach((el) => { el.outerHTML = icon(el.dataset.icon, el.classList.contains('brand-mark') ? 22 : 20, el.className); });
  $('#help-btn').onclick = runTour;
  await St.init();
  applyLangChrome();
  St.subscribe(() => { view?.refresh?.(); updateChrome(); });
  window.addEventListener('hashchange', route);
  route();
  hideBoot();
  updateChrome();
  // Beim allerersten Besuch einmal von selbst starten – nicht, wenn gerade ein Link geöffnet wird oder schon Daten da sind
  if (!St.S.meta.tourDone) {
    if (St.hasData() || /^#\/(import|compose)\//.test(location.hash)) St.setMeta({ tourDone: true });
    else setTimeout(() => { if (!St.S.meta.tourDone && !dlg().open) runTour(); }, 700);
  }
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    const hadSw = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').then((reg) => {
      const check = () => reg.update().catch(() => {});
      setInterval(check, 30 * 60 * 1000);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    }).catch(() => {});
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadSw) toast(t('update.toast'), t('update.reload'), () => { St.flush().finally(() => location.reload()); });
    });
  }
})();
