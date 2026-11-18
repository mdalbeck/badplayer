// Aufgaben und Clips vom Trainer (kommen per Link), abhaken und zurückmelden.
import * as St from './store.js';
import { icon } from './icons.js';
import { t, fmtDay, fmtDateTime } from './i18n.js';
import { $, esc, toast, modal, closeModal } from './ui.js';
import { makePkg, sharePkg } from './share.js';
import { thumb, player } from './video.js';

const notFound = (el, key, back, label) => {
  el.innerHTML = `<div class="emptybig">${icon('alert', 40)}<h2>${esc(t(key))}</h2><p><a class="btn" href="${back}">${esc(t(label))}</a></p></div>`;
  return {};
};
const multiline = (s) => esc(s).replace(/\n/g, '<br>');

/** Frist als kleines Schild: „noch 3 Tage“, „heute“, „vorbei“ */
export function dueChip(due, done = false) {
  if (!due) return '';
  const n = St.daysBetween(St.todayIso(), due);
  const cls = done ? '' : n < 0 ? 'late' : n <= 2 ? 'soon' : '';
  const rel = done ? '' : n < 0 ? t('due.late') : n === 0 ? t('due.today') : n === 1 ? t('due.tomorrow') : t('due.inDays', { n });
  return `<span class="due ${cls}">${icon('clock', 14)}${esc(t('due.until', { day: fmtDay(due, 'wdShort') }))}${rel ? ` · ${esc(rel)}` : ''}</span>`;
}

function taskCard(x) {
  return `<a class="tcard ${x.done ? 'done' : ''}" href="#/task/${x.id}">
    <span class="tcheck">${x.done ? icon('check', 18) : icon('clipboard', 18)}</span>
    <span class="exrow-b"><b>${esc(x.title || t('tk.untitled'))}</b>
      <span class="exmeta">${x.from ? `<span>${icon('whistle', 14)}${esc(x.from)}</span>` : ''}${x.clips.length ? `<span>${icon('play', 12)}${esc(t(x.clips.length === 1 ? 'tk.clips1' : 'tk.clips', { n: x.clips.length }))}</span>` : ''}</span>
      ${x.done ? '' : dueChip(x.due)}</span>
    ${icon('chevR', 20, 'chev')}</a>`;
}

// ================= Aufgaben-Liste =================
export function tasksView(el) {
  const render = () => {
    const open = St.openTasks(), done = St.doneTasks();
    el.innerHTML = `
      <div class="pagehead"><h1><span class="eyebrow">${esc(t('tk.eyebrow'))}</span>${esc(t('nav.tasks'))}</h1></div>
      ${open.length ? `<div class="tlist">${open.map(taskCard).join('')}</div>`
        : `<div class="emptycard">${icon('clipboard', 36)}<p><b>${esc(t(done.length ? 'tk.allDone' : 'tk.empty'))}</b><br>${esc(t('tk.emptyText'))}</p></div>`}
      ${done.length ? `<details class="donelist" ${open.length ? '' : 'open'}><summary>${icon('check', 18)} ${esc(t('tk.doneList', { n: done.length }))}</summary>
        <div class="tlist">${done.map(taskCard).join('')}</div></details>` : ''}`;
  };
  render();
  return { refresh: render };
}

// ================= Eine Aufgabe =================
export function taskView(el, id) {
  if (!St.task(id)) return notFound(el, 'tk.notFound', '#/tasks', 'nav.tasks');
  const render = () => {
    const x = St.task(id);
    if (!x) return void (location.hash = '#/tasks');
    el.innerHTML = `
      <div class="pagehead"><a class="back" href="#/tasks">${icon('back', 16)} ${esc(t('nav.tasks'))}</a>
        <h1><span class="eyebrow">${esc(x.from ? t('tk.from', { name: x.from }) : t('tk.eyebrow'))}</span>${esc(x.title || t('tk.untitled'))}</h1></div>
      ${x.done ? `<div class="donebar">${icon('check', 22)}<span><b>${esc(t('tk.isDone'))}</b><span class="small">${esc(fmtDateTime(x.doneAt))}</span></span></div>` : dueChip(x.due) ? `<p>${dueChip(x.due)}</p>` : ''}
      ${x.text ? `<section class="panel tasktext"><p>${multiline(x.text)}</p></section>` : ''}
      ${x.clips.map((c, i) => `<section class="panel clipbox">${player(c.url)}
        ${c.title || c.note ? `<div class="clipinfo">${c.title ? `<b>${esc(c.title)}</b>` : ''}${c.note ? `<p class="muted">${multiline(c.note)}</p>` : ''}</div>` : ''}
        <a class="small muted" href="#/clip/${x.id}/${i}">${icon('expand', 14)}${esc(t('clip.big'))}</a></section>`).join('')}
      <section class="panel">
        <label>${esc(t('tk.reply'))}<textarea id="tk-reply" rows="3" placeholder="${esc(t('tk.replyPh'))}">${esc(x.reply)}</textarea></label>
        <div class="formacts">
          ${x.done
            ? `<button class="primary huge" id="tk-send">${icon('send', 22)}<span>${esc(t('tk.send'))}</span></button>
               <button id="tk-undo">${icon('undo', 18)}<span>${esc(t('tk.notDone'))}</span></button>`
            : `<button class="primary huge" id="tk-done">${icon('check', 22)}<span>${esc(t('tk.done'))}</span></button>`}
        </div>
      </section>
      <p><button class="ghost danger sm" id="tk-del">${icon('trash', 16)}<span>${esc(t('tk.delete'))}</span></button></p>`;
    const reply = $('#tk-reply', el);
    const keep = () => { if (reply.value.trim() !== St.task(id)?.reply) St.update('tasks', id, { reply: reply.value }); };
    reply.addEventListener('change', keep);
    $('#tk-done', el)?.addEventListener('click', () => {
      St.update('tasks', id, { reply: reply.value, done: true, doneAt: Date.now() });
      askSend(id);
    });
    $('#tk-send', el)?.addEventListener('click', () => { keep(); sendDone(id); });
    $('#tk-undo', el)?.addEventListener('click', () => St.update('tasks', id, { done: false, doneAt: 0 }));
    $('#tk-del', el).onclick = () => {
      if (!confirm(t('tk.delConfirm'))) return;
      const undo = St.remove('tasks', id);
      location.hash = '#/tasks';
      toast(t('tk.deleted'), t('ui.undo'), undo);
    };
  };
  // Nur neu zeichnen, wenn sich mehr als die Notiz geändert hat
  // (sonst geht z. B. der Tipp auf „Erledigt!“ direkt nach dem Schreiben verloren)
  const sig = () => { const x = St.task(id); return x ? JSON.stringify({ ...x, reply: '', updatedAt: 0 }) : ''; };
  let last = sig();
  render();
  return {
    refresh: () => { const s = sig(); if (s !== last) { last = s; render(); } },
    destroy: () => { const r = $('#tk-reply', el); const x = St.task(id); if (r && x && r.value.trim() !== x.reply) St.update('tasks', id, { reply: r.value }); },
  };
}

function askSend(id) {
  const d = modal(`<div class="yay">${icon('star', 44)}</div><h2 class="center">${esc(t('tk.yay'))}</h2>
    <p class="center muted">${esc(t('tk.yayText'))}</p>
    <div class="dlg-actions col"><button class="primary big" id="ys-send">${icon('send', 20)}<span>${esc(t('tk.send'))}</span></button><button class="ghost" id="ys-no">${esc(t('tk.later'))}</button></div>`);
  $('#ys-send', d).onclick = () => sendDone(id);
  $('#ys-no', d).onclick = closeModal;
}

function sendDone(id) {
  const x = St.task(id);
  if (!x) return;
  const go = (name) => {
    const pkg = makePkg('done', { player: name, from: name, task: { pkg: x.pkg, title: x.title }, doneAt: x.doneAt || Date.now(), reply: x.reply });
    sharePkg(pkg, { title: t('tk.send'), hint: t('tk.sendHint'), text: t('tk.msg', { name, title: x.title }) });
  };
  if (St.S.meta.name) return go(St.S.meta.name);
  const d = modal(`<h2>${esc(t('ds.name'))}</h2><p class="muted">${esc(t('ds.nameWhy'))}</p>
    <input id="nm" maxlength="100" placeholder="${esc(t('ds.namePh'))}">
    <div class="dlg-actions"><button class="ghost" id="nm-no">${esc(t('ui.cancel'))}</button><span class="grow"></span><button class="primary" id="nm-ok">${esc(t('ui.next'))}</button></div>`);
  $('#nm', d).focus();
  $('#nm-no', d).onclick = closeModal;
  $('#nm-ok', d).onclick = () => {
    const name = $('#nm', d).value.trim();
    if (!name) return $('#nm', d).focus();
    St.setMeta({ name });
    go(name);
  };
}

// ================= Clips =================
/** Alle Clips: einzeln geschickte und die aus Aufgaben */
function allClips() {
  const list = St.S.data.clips.map((c) => ({ ...c, href: `#/clip/${c.id}`, at: c.receivedAt, isNew: !c.seen }));
  for (const x of St.S.data.tasks) x.clips.forEach((c, i) => list.push({ ...c, from: x.from, href: `#/clip/${x.id}/${i}`, at: x.receivedAt, task: x }));
  return list.sort((a, b) => b.at - a.at);
}

export function clipsView(el) {
  const render = () => {
    const list = allClips();
    el.innerHTML = `
      <div class="pagehead"><h1><span class="eyebrow">${esc(t('tk.eyebrow'))}</span>${esc(t('nav.clips'))}</h1></div>
      ${list.length ? `<div class="cgrid">${list.map((c) => `<a class="ccard" href="${c.href}">${thumb(c.url)}
          <span class="ccard-b"><b class="clamp2">${esc(c.title || t('clip.untitled'))}</b>
          <span class="muted small clamp1">${c.task ? `${icon('clipboard', 12)} ${esc(c.task.title)}` : esc([c.from, c.at ? fmtDay(St.iso(new Date(c.at)), 'short') : ''].filter(Boolean).join(' · '))}</span></span>
          ${c.isNew ? `<span class="newbadge">${esc(t('clip.new'))}</span>` : ''}</a>`).join('')}</div>`
        : `<div class="emptycard">${icon('library', 36)}<p><b>${esc(t('clip.empty'))}</b><br>${esc(t('clip.emptyText'))}</p></div>`}`;
  };
  render();
  return { refresh: render };
}

export function clipView(el, id, idx) {
  const own = St.clip(id);
  const tk = own ? null : St.task(id);
  const c = own || tk?.clips[+idx];
  if (!c) return notFound(el, 'clip.notFound', '#/clips', 'nav.clips');
  if (own && !own.seen) St.update('clips', id, { seen: true });
  el.innerHTML = `
    <div class="pagehead"><a class="back" href="${tk ? `#/task/${tk.id}` : '#/clips'}">${icon('back', 16)} ${esc(tk ? tk.title || t('tk.untitled') : t('nav.clips'))}</a>
      <h1><span class="eyebrow">${esc((own || tk).from ? t('tk.from', { name: (own || tk).from }) : t('nav.clips'))}</span>${esc(c.title || t('clip.untitled'))}</h1></div>
    <section class="panel clipbox big">${player(c.url)}${c.note ? `<p class="clipnote">${multiline(c.note)}</p>` : ''}</section>
    <p class="muted small"><a href="${esc(c.url)}" target="_blank" rel="noopener">${icon('external', 14)} ${esc(t('clip.open'))}</a></p>
    ${own ? `<p><button class="ghost danger sm" id="cl-del">${icon('trash', 16)}<span>${esc(t('clip.delete'))}</span></button></p>` : ''}`;
  $('#cl-del', el)?.addEventListener('click', () => {
    const undo = St.remove('clips', id);
    location.hash = '#/clips';
    toast(t('clip.deleted'), t('ui.undo'), undo);
  });
  return {};
}
