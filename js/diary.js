// Tagebuch: Einträge (Training, Spiel, alleine geübt), Ziele und „An Trainer schicken“.
import * as St from './store.js';
import { icon, face } from './icons.js';
import { t, fmtDay, monthLabel } from './i18n.js';
import { $, $$, esc, toast, modal, closeModal } from './ui.js';
import { makePkg, sharePkg } from './share.js';

const KIND_ICON = { training: 'calendar', match: 'trophy', solo: 'solo' };
export const kindIcon = (k) => KIND_ICON[k] || 'calendar';

/** Eine Zeile in der Liste (auch im Trainer-Bericht benutzt; dann ohne Link) */
export function entryRow(e, link = true) {
  const tag = link ? 'a' : 'div';
  const lines = [
    e.good ? `<span><b class="lbl-good">${esc(t('en.goodShort'))}</b> ${esc(e.good)}</span>` : '',
    e.work ? `<span><b class="lbl-work">${esc(t('en.workShort'))}</b> ${esc(e.work)}</span>` : '',
    e.note ? `<span class="muted">${esc(e.note)}</span>` : '',
  ].filter(Boolean);
  return `<${tag} class="drow entry" ${link ? `href="#/entry/${e.id}"` : ''}>
    <span class="dday"><b>${esc(fmtDay(e.day, 'short'))}</b><span>${esc(fmtDay(e.day, 'wd'))}</span></span>
    <span class="exrow-b"><span class="kindline">${icon(kindIcon(e.kind), 15)}<b>${esc(t(`kind.${e.kind}`))}</b></span>
      ${lines.length ? `<span class="entrytext ${link ? 'clamp2' : ''}">${lines.join('')}</span>` : ''}</span>
    ${e.mood ? `<span class="moodbig">${face(e.mood, 30)}</span>` : ''}
  </${tag}>`;
}

/** Einträge nach Monaten gruppiert */
export function entryList(list, link = true) {
  let cur = '';
  return list.map((e) => {
    const m = e.day.slice(0, 7);
    const head = m !== cur ? `<h3 class="monthh">${esc(monthLabel(e.day))}</h3>` : '';
    cur = m;
    return head + entryRow(e, link);
  }).join('');
}

// ================= Startseite: Tagebuch =================
export function diaryView(el) {
  const render = () => {
    const d = St.S.data;
    const all = St.entriesSorted();
    const month = St.todayIso().slice(0, 7);
    const inMonth = all.filter((e) => e.day.startsWith(month)).length;
    const goalsDone = d.goals.filter((g) => g.done).length;
    const open = St.openTasks().length;
    const name = St.S.meta.name;
    el.innerHTML = `
      <div class="pagehead"><h1><span class="eyebrow">${esc(t('dy.eyebrow'))}</span>${esc(name ? t('dy.hello', { name }) : t('dy.helloAnon'))}</h1></div>
      <button class="primary huge" id="dy-new">${icon('plus', 24)}<span>${esc(t('dy.new'))}</span></button>
      ${open ? `<a class="hint-card" href="#/tasks">${icon('clipboard', 22)}<span><b>${esc(t(open === 1 ? 'dy.tasks1' : 'dy.tasks', { n: open }))}</b><span class="muted small">${esc(t('dy.tasksText'))}</span></span>${icon('chevR', 20)}</a>` : ''}
      <div class="stats">
        <div class="stat-tile"><b>${inMonth}</b><span>${esc(t('dy.statMonth'))}</span></div>
        <div class="stat-tile"><b>${goalsDone}<small>/${d.goals.length}</small></b><span>${esc(t('dy.statGoals'))}</span></div>
        <div class="stat-tile"><b>${St.doneTasks().length}</b><span>${esc(t('dy.statTasks'))}</span></div>
      </div>
      <section class="panel" id="dy-goals">
        <h2>${icon('target', 20)} ${esc(t('go.title'))}</h2>
        ${d.goals.length ? '' : `<p class="muted">${esc(t('go.empty'))}</p>`}
        <div class="goals">${goalsSorted().map((g) => `
          <div class="goal ${g.done ? 'done' : ''}" data-id="${g.id}">
            <button class="goalcheck" data-act="toggle" aria-pressed="${g.done}" aria-label="${esc(t(g.done ? 'go.undone' : 'go.done'))}">${g.done ? icon('check', 18) : ''}</button>
            <span class="goaltext">${esc(g.text)}</span>
            <button class="ib sm" data-act="del" aria-label="${esc(t('ui.delete'))}" title="${esc(t('ui.delete'))}">${icon('x', 16)}</button>
          </div>`).join('')}</div>
        <form class="addrow" id="go-add"><input id="go-text" maxlength="300" placeholder="${esc(t('go.ph'))}" autocomplete="off"><button class="primary" aria-label="${esc(t('go.add'))}">${icon('plus', 18)}<span class="hide-s">${esc(t('go.add'))}</span></button></form>
      </section>
      <section class="entries">
        <div class="sechead"><h2>${icon('book', 20)} ${esc(t('dy.entries'))}</h2>
          ${all.length ? `<button class="sm" id="dy-send">${icon('send', 16)}<span>${esc(t('dy.send'))}</span></button>` : ''}</div>
        ${all.length ? `<div class="dlist">${entryList(all)}</div>` : `<div class="emptycard">${icon('book', 36)}<p>${esc(t('dy.empty'))}</p></div>`}
      </section>`;
    $('#dy-new', el).onclick = () => (location.hash = '#/entry/new');
    $('#dy-send', el)?.addEventListener('click', sendDiary);
    $('#go-add', el).onsubmit = (e) => {
      e.preventDefault();
      const text = $('#go-text', el).value.trim();
      if (!text) return $('#go-text', el).focus();
      St.add('goals', { text });
      setTimeout(() => $('#go-text', el)?.focus(), 0);
    };
    $$('.goal', el).forEach((row) => row.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const g = St.S.data.goals.find((x) => x.id === row.dataset.id);
      if (!g) return;
      if (b.dataset.act === 'toggle') {
        St.update('goals', g.id, { done: !g.done, doneAt: g.done ? 0 : Date.now() });
        if (!g.done) toast(t('go.yay'));
      } else {
        const undo = St.remove('goals', g.id);
        toast(t('go.deleted'), t('ui.undo'), undo);
      }
    }));
  };
  render();
  return { refresh: render };
}
const goalsSorted = () => [...St.S.data.goals].sort((a, b) => a.done - b.done || (a.done ? b.doneAt - a.doneAt : a.createdAt - b.createdAt));

// ================= Eintrag anlegen / bearbeiten =================
export function entryFormView(el, id) {
  const old = id ? St.entry(id) : null;
  if (id && !old) {
    el.innerHTML = `<div class="emptybig">${icon('alert', 40)}<h2>${esc(t('en.notFound'))}</h2><p><a class="btn" href="#/">${esc(t('nav.diary'))}</a></p></div>`;
    return {};
  }
  const f = old ? { ...old } : { day: St.todayIso(), kind: 'training', mood: 0, good: '', work: '', note: '' };
  const start = JSON.stringify(f);
  let saved = false;
  el.innerHTML = `
    <div class="pagehead"><a class="back" href="#/">${icon('back', 16)} ${esc(t('nav.diary'))}</a>
      <h1>${esc(t(old ? 'en.editTitle' : 'en.newTitle'))}</h1></div>
    <form class="panel entryform" id="en-form">
      <div class="lbl">${esc(t('en.kind'))}</div>
      <div class="kindpick">${St.KINDS.map((k) => `<label class="kindbtn"><input type="radio" name="kind" value="${k}" ${f.kind === k ? 'checked' : ''}><span>${icon(kindIcon(k), 22)}<b>${esc(t(`kind.${k}`))}</b></span></label>`).join('')}</div>
      <label>${esc(t('en.day'))}<input type="date" id="en-day" value="${f.day}" max="${St.addDays(St.todayIso(), 30)}" required></label>
      <div class="lbl">${esc(t('en.mood'))}</div>
      <div class="moodpick">${[1, 2, 3, 4, 5].map((n) => `<label class="moodbtn"><input type="radio" name="mood" value="${n}" ${f.mood === n ? 'checked' : ''}><span title="${esc(t(`mood.${n}`))}">${face(n, 40)}<small>${esc(t(`mood.${n}`))}</small></span></label>`).join('')}</div>
      <label>${esc(t('en.good'))}<textarea id="en-good" rows="2" placeholder="${esc(t('en.goodPh'))}">${esc(f.good)}</textarea></label>
      <label>${esc(t('en.work'))}<textarea id="en-work" rows="2" placeholder="${esc(t('en.workPh'))}">${esc(f.work)}</textarea></label>
      <label>${esc(t('en.note'))}<textarea id="en-note" rows="2" placeholder="${esc(t('en.notePh'))}">${esc(f.note)}</textarea></label>
      <div class="formacts">
        <button class="primary huge" type="submit">${icon('check', 22)}<span>${esc(t('ui.save'))}</span></button>
        ${old ? `<button class="danger" type="button" id="en-del">${icon('trash', 18)}<span>${esc(t('ui.delete'))}</span></button>` : ''}
      </div>
    </form>`;
  const form = $('#en-form', el);
  const read = () => ({
    day: $('#en-day', el).value || St.todayIso(),
    kind: $('input[name=kind]:checked', el)?.value || 'training',
    mood: +($('input[name=mood]:checked', el)?.value || 0),
    good: $('#en-good', el).value.trim(), work: $('#en-work', el).value.trim(), note: $('#en-note', el).value.trim(),
  });
  // Nochmal auf dasselbe Gesicht tippen = Auswahl aufheben
  $$('.moodbtn input', el).forEach((r) => r.addEventListener('click', () => {
    if (r.dataset.was === '1') { r.checked = false; r.dataset.was = ''; } else { $$('.moodbtn input', el).forEach((x) => (x.dataset.was = '')); r.dataset.was = '1'; }
  }));
  $$('.moodbtn input:checked', el).forEach((r) => (r.dataset.was = '1'));
  const submit = () => {
    const x = read();
    if (old) St.update('entries', old.id, x); else St.add('entries', x);
    saved = true;
    toast(t(old ? 'en.saved' : 'en.added'));
    location.hash = '#/';
  };
  form.onsubmit = (e) => { e.preventDefault(); submit(); };
  $('#en-del', el)?.addEventListener('click', () => {
    if (!confirm(t('en.delConfirm'))) return;
    saved = true;
    const undo = St.remove('entries', old.id);
    location.hash = '#/';
    toast(t('en.deleted'), t('ui.undo'), undo);
  });
  const dirty = () => !saved && JSON.stringify({ ...f, ...read() }) !== start;
  return {
    submit,
    isDirty: dirty,
    canLeave: () => !dirty() || confirm(t('ui.leave')),
  };
}

// ================= Tagebuch an den Trainer schicken =================
const RANGES = [['14', 14], ['28', 28], ['90', 90], ['all', 0]];
function sendDiary() {
  let range = '28';
  const d = modal(`<h2>${icon('send', 20)} ${esc(t('ds.title'))}</h2>
    <p class="muted">${esc(t('ds.text'))}</p>
    <label>${esc(t('ds.name'))}<input id="ds-name" maxlength="100" value="${esc(St.S.meta.name)}" placeholder="${esc(t('ds.namePh'))}"></label>
    <div class="lbl">${esc(t('ds.range'))}</div>
    <div class="seg wide" id="ds-range">${RANGES.map(([k]) => `<button type="button" data-r="${k}" class="${k === range ? 'on' : ''}">${esc(t(`ds.r${k}`))}</button>`).join('')}</div>
    <label class="switch" style="margin-top:14px"><input type="checkbox" id="ds-goals" checked><i></i><span>${esc(t('ds.goals'))}</span></label>
    <p class="muted small" id="ds-count"></p>
    <div class="dlg-actions"><button class="ghost" id="ds-no">${esc(t('ui.cancel'))}</button><span class="grow"></span><button class="primary" id="ds-ok">${icon('send', 18)}<span>${esc(t('ds.make'))}</span></button></div>`);
  const pick = () => {
    const days = RANGES.find((r) => r[0] === range)[1];
    const from = days ? St.addDays(St.todayIso(), -days + 1) : '';
    return { from, list: St.entriesSorted().filter((e) => !from || e.day >= from) };
  };
  const count = () => { $('#ds-count', d).textContent = t('ds.count', { n: pick().list.length }); };
  $$('#ds-range button', d).forEach((b) => (b.onclick = () => { range = b.dataset.r; $$('#ds-range button', d).forEach((x) => x.classList.toggle('on', x === b)); count(); }));
  count();
  $('#ds-no', d).onclick = closeModal;
  $('#ds-ok', d).onclick = () => {
    const name = $('#ds-name', d).value.trim();
    if (!name) { $('#ds-name', d).focus(); return toast(t('ds.nameMissing')); }
    if (name !== St.S.meta.name) St.setMeta({ name });
    const { from, list } = pick();
    const pkg = makePkg('diary', {
      player: name, from: name,
      range: { from: from || list[list.length - 1]?.day || St.todayIso(), to: St.todayIso() },
      entries: list.map(({ day, kind, mood, good, work, note }) => ({ day, kind, mood, good, work, note })),
      goals: $('#ds-goals', d).checked ? St.S.data.goals.map(({ text, done }) => ({ text, done })) : [],
    });
    sharePkg(pkg, { title: t('ds.title'), hint: t('ds.hint'), text: t('ds.msg', { name }) });
  };
}
