// Trainer-Bereich (in den Einstellungen einschaltbar): Aufgaben und Clips per Link schicken,
// Rückmeldungen von Spielern ansehen und speichern. Dazu das Empfangen von Links (#/import/…).
import * as St from './store.js';
import { icon, face } from './icons.js';
import { t, fmtDay, fmtDateTime } from './i18n.js';
import { $, $$, esc, toast, modal, closeModal } from './ui.js';
import { makePkg, sharePkg, readLink } from './share.js';
import { kindLabel, thumb } from './video.js';
import { entryList } from './diary.js';

const multiline = (s) => esc(s).replace(/\n/g, '<br>');
const dayOf = (ms) => St.iso(new Date(ms));

// ================= Übersicht =================
export function coachView(el) {
  const render = () => {
    const d = St.S.data;
    const inbox = [...d.inbox].sort((a, b) => b.receivedAt - a.receivedAt);
    const sent = [...d.sent].sort((a, b) => b.createdAt - a.createdAt);
    el.innerHTML = `
      <div class="pagehead"><h1><span class="eyebrow">${esc(t('co.eyebrow'))}</span>${esc(t('co.title'))}</h1></div>
      <p class="note">${icon('shield', 16)}<span>${esc(t('co.note'))}</span></p>
      <div class="bigchoice">
        <a class="choice" href="#/coach/new/task" id="co-task">${icon('clipboard', 28)}<b>${esc(t('co.newTask'))}</b><span class="muted small">${esc(t('co.newTaskT'))}</span></a>
        <a class="choice" href="#/coach/new/clips" id="co-clips">${icon('library', 28)}<b>${esc(t('co.newClips'))}</b><span class="muted small">${esc(t('co.newClipsT'))}</span></a>
      </div>
      <section class="panel">
        <h2>${icon('inbox', 20)} ${esc(t('co.inbox'))}</h2>
        ${inbox.length ? `<div class="dlist">${inbox.map((r) => `<a class="drow" href="#/report/${r.id}">
            <span class="rep-ic ${r.kind}">${icon(r.kind === 'done' ? 'check' : 'book', 18)}</span>
            <span class="exrow-b"><b>${esc(r.player || t('co.someone'))}</b><span class="muted small">${esc(r.kind === 'done' ? t('co.repDone', { title: r.data.task?.title || '' }) : t('co.repDiary', { n: r.data.entries?.length || 0 }))}</span></span>
            <span class="muted small nowrap">${esc(fmtDay(dayOf(r.receivedAt), 'short'))}</span></a>`).join('')}</div>`
          : `<p class="muted">${esc(t('co.inboxEmpty'))}</p>`}
      </section>
      <section class="panel">
        <h2>${icon('send', 20)} ${esc(t('co.sent'))}</h2>
        ${sent.length ? `<div class="dlist">${sent.map((s) => `<div class="drow sentrow" data-id="${s.id}">
            <span class="rep-ic">${icon(s.kind === 'task' ? 'clipboard' : 'library', 18)}</span>
            <span class="exrow-b"><b>${esc(s.title || t(s.kind === 'task' ? 'tk.untitled' : 'co.clipsOnly'))}</b><span class="muted small">${esc([s.to && t('co.to', { name: s.to }), fmtDay(dayOf(s.createdAt), 'short')].filter(Boolean).join(' · '))}</span></span>
            <span class="rowbtns"><button class="sm" data-act="again" title="${esc(t('co.again'))}">${icon('send', 16)}<span class="hide-s">${esc(t('co.again'))}</span></button>
            <button class="ib sm" data-act="copy" title="${esc(t('co.template'))}" aria-label="${esc(t('co.template'))}">${icon('copy', 16)}</button>
            <button class="ib sm" data-act="del" title="${esc(t('ui.delete'))}" aria-label="${esc(t('ui.delete'))}">${icon('trash', 16)}</button></span></div>`).join('')}</div>`
          : `<p class="muted">${esc(t('co.sentEmpty'))}</p>`}
      </section>`;
    $$('.sentrow', el).forEach((row) => row.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const s = St.sentItem(row.dataset.id);
      if (!s) return;
      if (b.dataset.act === 'again') shareSent(s.pkg);
      else if (b.dataset.act === 'copy') location.hash = `#/coach/new/${s.kind}/${s.id}`;
      else { const undo = St.remove('sent', s.id); toast(t('co.sentDeleted'), t('ui.undo'), undo); }
    }));
  };
  render();
  return { refresh: render };
}

const shareSent = (pkg) => sharePkg(pkg, pkg.kind === 'task'
  ? { title: t('co.newTask'), hint: t('co.shareHint'), text: t('co.msgTask', { title: pkg.title }) }
  : { title: t('co.newClips'), hint: t('co.shareHint'), text: t('co.msgClips', { n: pkg.clips.length }) });

// ================= Aufgabe / Clips zusammenstellen =================
export function coachFormView(el, kind, fromId) {
  const tpl = fromId ? St.sentItem(fromId)?.pkg : null;
  let mode = kind === 'clips' ? 'clips' : 'task';
  const f = { from: St.S.meta.coachName, title: tpl?.title || '', text: tpl?.text || '', due: '', to: '', clips: tpl?.clips?.length ? tpl.clips.map((c) => ({ ...c })) : [{ url: '', title: '', note: '' }] };
  let sent = false;
  const start = JSON.stringify(f);
  const clipRow = (c, i) => `<div class="cliprow" data-i="${i}">
      <div class="cliprow-h"><b>${esc(t('co.clipN', { n: i + 1 }))}</b><span class="kindlbl small muted">${esc(kindLabel(c.url))}</span><span class="grow"></span>
        <button type="button" class="ib sm" data-act="rm" aria-label="${esc(t('ui.delete'))}" title="${esc(t('ui.delete'))}">${icon('x', 16)}</button></div>
      <input class="c-url" inputmode="url" placeholder="${esc(t('co.urlPh'))}" value="${esc(c.url)}">
      <input class="c-title" maxlength="200" placeholder="${esc(t('co.clipTitlePh'))}" value="${esc(c.title)}">
      <input class="c-note" maxlength="1000" placeholder="${esc(t('co.clipNotePh'))}" value="${esc(c.note)}">
    </div>`;
  const readClips = () => $$('.cliprow', el).map((r) => ({ url: $('.c-url', r).value.trim(), title: $('.c-title', r).value.trim(), note: $('.c-note', r).value.trim() }));
  const read = () => ({
    title: $('#cf-title', el)?.value.trim() ?? f.title, text: $('#cf-text', el)?.value.trim() ?? f.text, due: $('#cf-due', el)?.value || '',
    from: $('#cf-from', el).value.trim(), to: $('#cf-to', el).value.trim(), clips: readClips(),
  });
  const render = () => {
    el.innerHTML = `
      <div class="pagehead"><a class="back" href="#/coach">${icon('back', 16)} ${esc(t('co.title'))}</a>
        <h1>${esc(t(mode === 'task' ? 'co.newTask' : 'co.newClips'))}</h1></div>
      <div class="seg wide" id="cf-mode"><button type="button" data-m="task" class="${mode === 'task' ? 'on' : ''}">${icon('clipboard', 16)}${esc(t('co.modeTask'))}</button><button type="button" data-m="clips" class="${mode === 'clips' ? 'on' : ''}">${icon('library', 16)}${esc(t('co.modeClips'))}</button></div>
      <form class="panel" id="cf-form">
        <div class="row2">
          <label>${esc(t('co.from'))}<input id="cf-from" maxlength="100" value="${esc(f.from)}" placeholder="${esc(t('co.fromPh'))}"></label>
          <label>${esc(t('co.forWho'))}<input id="cf-to" maxlength="100" value="${esc(f.to)}" placeholder="${esc(t('co.forWhoPh'))}"></label>
        </div>
        ${mode === 'task' ? `
          <label>${esc(t('co.taskTitle'))}<input id="cf-title" class="bigname" maxlength="200" value="${esc(f.title)}" placeholder="${esc(t('co.taskTitlePh'))}"></label>
          <label>${esc(t('co.taskText'))}<textarea id="cf-text" rows="4" placeholder="${esc(t('co.taskTextPh'))}">${esc(f.text)}</textarea></label>
          <label class="dueline">${esc(t('co.due'))}<input type="date" id="cf-due" value="${f.due}" min="${St.todayIso()}"></label>` : ''}
        <div class="lbl">${esc(t(mode === 'task' ? 'co.clipsOpt' : 'co.clipsReq'))}</div>
        <div id="cf-clips">${f.clips.map(clipRow).join('')}</div>
        <button type="button" class="sm" id="cf-add">${icon('plus', 16)}<span>${esc(t('co.addClip'))}</span></button>
        <p class="muted small">${esc(t('co.clipHelp'))}</p>
        <div class="formacts"><button class="primary huge" type="submit">${icon('send', 22)}<span>${esc(t('co.make'))}</span></button></div>
      </form>`;
    $$('#cf-mode button', el).forEach((b) => (b.onclick = () => { Object.assign(f, read()); mode = b.dataset.m; render(); }));
    $('#cf-add', el).onclick = () => { Object.assign(f, read()); f.clips.push({ url: '', title: '', note: '' }); render(); $$('.c-url', el).pop().focus(); };
    $('#cf-clips', el).addEventListener('input', (e) => {
      if (!e.target.classList.contains('c-url')) return;
      $('.kindlbl', e.target.closest('.cliprow')).textContent = kindLabel(e.target.value);
    });
    $('#cf-clips', el).addEventListener('click', (e) => {
      const b = e.target.closest('[data-act=rm]');
      if (!b) return;
      Object.assign(f, read());
      f.clips.splice(+b.closest('.cliprow').dataset.i, 1);
      if (!f.clips.length) f.clips.push({ url: '', title: '', note: '' });
      render();
    });
    $('#cf-form', el).onsubmit = (e) => { e.preventDefault(); submit(); };
  };
  const submit = () => {
    Object.assign(f, read());
    const from = f.from;
    if (from !== St.S.meta.coachName) St.setMeta({ coachName: from });
    const rows = f.clips.filter((c) => c.url);
    const bad = rows.find((c) => !St.cleanUrl(c.url));
    if (bad) return toast(t('co.badUrl'));
    const clips = rows.map(St.cleanClip);
    if (mode === 'task' && !f.title) { $('#cf-title', el).focus(); return toast(t('co.titleMissing')); }
    if (mode === 'clips' && !clips.length) { $('.c-url', el)?.focus(); return toast(t('co.clipMissing')); }
    const pkg = mode === 'task'
      ? makePkg('task', { from, to: f.to, title: f.title, text: f.text, due: f.due, clips })
      : makePkg('clips', { from, to: f.to, clips });
    St.add('sent', { kind: mode, to: f.to, title: mode === 'task' ? f.title : clips.map((c) => c.title).filter(Boolean).join(', ') || t('co.clipsN', { n: clips.length }), pkg });
    sent = true;
    location.hash = '#/coach';
    shareSent(pkg);
  };
  render();
  const dirty = () => !sent && JSON.stringify({ ...f, ...read() }) !== start;
  return { submit, isDirty: dirty, canLeave: () => !dirty() || confirm(t('ui.leave')) };
}

// ================= Rückmeldung eines Spielers =================
export function reportHtml(r) {
  if (r.kind === 'done') {
    return `<section class="panel report">
      <div class="donebar">${icon('check', 22)}<span><b>${esc(t('rp.done', { name: r.player || t('co.someone') }))}</b><span class="small">${esc(r.doneAt ? fmtDateTime(r.doneAt) : '')}</span></span></div>
      <h3>${icon('clipboard', 16)} ${esc(r.task?.title || t('tk.untitled'))}</h3>
      ${r.reply ? `<blockquote>${multiline(r.reply)}</blockquote>` : `<p class="muted">${esc(t('rp.noReply'))}</p>`}
    </section>`;
  }
  const es = r.entries || [];
  const cnt = (k) => es.filter((e) => e.kind === k).length;
  const moods = es.filter((e) => e.mood);
  const avg = moods.length ? Math.round(moods.reduce((a, e) => a + e.mood, 0) / moods.length) : 0;
  const withIds = es.map((e, i) => ({ ...e, id: `r${i}`, createdAt: 0 })).sort((a, b) => b.day.localeCompare(a.day));
  return `<section class="panel report">
      <p class="muted">${esc(t('rp.range', { from: r.range?.from ? fmtDay(r.range.from, 'short') : '–', to: r.range?.to ? fmtDay(r.range.to, 'short') : '–' }))}</p>
      <div class="stats four">
        <div class="stat-tile"><b>${cnt('training')}</b><span>${esc(t('kind.trainingPl'))}</span></div>
        <div class="stat-tile"><b>${cnt('match')}</b><span>${esc(t('kind.matchPl'))}</span></div>
        <div class="stat-tile"><b>${cnt('solo')}</b><span>${esc(t('kind.soloPl'))}</span></div>
        <div class="stat-tile mood"><b>${avg ? face(avg, 34) : '–'}</b><span>${esc(t('rp.mood'))}</span></div>
      </div>
      ${r.goals?.length ? `<h3>${icon('target', 16)} ${esc(t('go.title'))}</h3><ul class="goallist">${r.goals.map((g) => `<li class="${g.done ? 'done' : ''}">${g.done ? icon('check', 16) : icon('target', 16)}<span>${esc(g.text)}</span></li>`).join('')}</ul>` : ''}
    </section>
    ${withIds.length ? `<div class="dlist">${entryList(withIds, false)}</div>` : `<p class="muted">${esc(t('rp.noEntries'))}</p>`}`;
}
const reportTitle = (r) => (r.kind === 'done' ? t('rp.titleDone') : t('rp.titleDiary', { name: r.player || t('co.someone') }));

export function reportView(el, id) {
  const r = St.report(id);
  if (!r) {
    el.innerHTML = `<div class="emptybig">${icon('alert', 40)}<h2>${esc(t('rp.notFound'))}</h2><p><a class="btn" href="#/coach">${esc(t('co.title'))}</a></p></div>`;
    return {};
  }
  el.innerHTML = `<div class="pagehead"><a class="back" href="#/coach">${icon('back', 16)} ${esc(t('co.title'))}</a>
      <h1><span class="eyebrow">${esc(t('co.inbox'))}</span>${esc(reportTitle(r.data))}</h1></div>
    ${reportHtml(r.data)}
    <p><button class="ghost danger sm" id="rp-del">${icon('trash', 16)}<span>${esc(t('rp.delete'))}</span></button></p>`;
  $('#rp-del', el).onclick = () => {
    const undo = St.remove('inbox', id);
    location.hash = '#/coach';
    toast(t('rp.deleted'), t('ui.undo'), undo);
  };
  return {};
}

// ================= Link empfangen =================
export function importView(el, code) {
  el.innerHTML = `<p class="muted">${esc(t('im.reading'))}</p>`;
  (async () => {
    let p;
    try { p = await readLink(code); } catch (e) {
      console.error(e);
      el.innerHTML = `<div class="emptybig">${icon('alert', 44)}<h2>${esc(t('im.bad'))}</h2><p>${esc(t('im.badText'))}</p><p><a class="btn" href="#/">${esc(t('nav.diary'))}</a></p></div>`;
      return;
    }
    const head = (eyebrow, title) => `<div class="pagehead"><h1><span class="eyebrow">${esc(eyebrow)}</span>${esc(title)}</h1></div>`;
    const from = p.from ? t('tk.from', { name: p.from }) : t('im.fromCoach');
    if (p.kind === 'task') {
      const have = St.taskByPkg(p.id);
      el.innerHTML = `${head(from, p.title || t('tk.untitled'))}
        <section class="panel">
          <p class="lead">${esc(t('im.taskLead'))}</p>
          ${p.due ? `<p>${esc(t('due.until', { day: fmtDay(p.due, 'wdShort') }))}</p>` : ''}
          ${p.text ? `<p class="tasktext">${multiline(p.text)}</p>` : ''}
          ${p.clips.length ? `<p class="muted iline">${icon('play', 14)} ${esc(t(p.clips.length === 1 ? 'tk.clips1' : 'tk.clips', { n: p.clips.length }))}</p>` : ''}
          <div class="formacts">${have
            ? `<p class="note">${icon('check', 16)}<span>${esc(t('im.have'))}</span></p><a class="btn primary huge" href="#/task/${have.id}">${esc(t('im.open'))}</a>`
            : `<button class="primary huge" id="im-ok">${icon('download', 22)}<span>${esc(t('im.takeTask'))}</span></button><a class="btn ghost" href="#/">${esc(t('ui.cancel'))}</a>`}</div>
        </section>`;
      $('#im-ok', el)?.addEventListener('click', () => {
        const id = St.add('tasks', { pkg: p.id, title: p.title, text: p.text, due: p.due, from: p.from, clips: p.clips, receivedAt: Date.now() });
        toast(t('im.tookTask'));
        location.hash = `#/task/${id}`;
      });
    } else if (p.kind === 'clips') {
      const fresh = p.clips.map((c, i) => ({ ...c, pkg: `${p.id}:${i}` })).filter((c) => !St.S.data.clips.some((x) => x.pkg === c.pkg));
      el.innerHTML = `${head(from, t(p.clips.length === 1 ? 'im.clips1' : 'im.clips', { n: p.clips.length }))}
        <section class="panel">
          <div class="implist">${p.clips.map((c) => `<div class="imrow">${thumb(c.url)}<span class="exrow-b"><b>${esc(c.title || t('clip.untitled'))}</b>${c.note ? `<span class="muted small clamp2">${esc(c.note)}</span>` : ''}</span></div>`).join('')}</div>
          <div class="formacts">${fresh.length
            ? `<button class="primary huge" id="im-ok">${icon('download', 22)}<span>${esc(t('im.takeClips'))}</span></button><a class="btn ghost" href="#/">${esc(t('ui.cancel'))}</a>`
            : `<p class="note">${icon('check', 16)}<span>${esc(t('im.haveClips'))}</span></p><a class="btn primary huge" href="#/clips">${esc(t('nav.clips'))}</a>`}</div>
        </section>`;
      $('#im-ok', el)?.addEventListener('click', () => {
        St.change((d) => {
          const now = Date.now();
          for (const c of fresh.reverse()) d.clips.unshift({ id: St.uid(), ...c, from: p.from, seen: false, receivedAt: now, createdAt: now, updatedAt: now });
        });
        toast(t('im.tookClips', { n: fresh.length }));
        location.hash = '#/clips';
      });
    } else {
      const have = St.reportByPkg(p.id);
      el.innerHTML = `${head(t('im.fromPlayer'), reportTitle(p))}
        ${reportHtml(p)}
        <section class="panel"><div class="formacts">${have
          ? `<p class="note">${icon('check', 16)}<span>${esc(t('im.haveReport'))}</span></p><a class="btn" href="#/report/${have.id}">${esc(t('im.open'))}</a>`
          : `<p class="muted small">${esc(t('im.saveHint'))}</p><button class="primary big" id="im-ok">${icon('download', 20)}<span>${esc(t('im.save'))}</span></button><a class="btn ghost" href="#/">${esc(t('im.dontSave'))}</a>`}</div></section>`;
      $('#im-ok', el)?.addEventListener('click', () => {
        const id = St.add('inbox', { pkg: p.id, kind: p.kind, player: p.player, data: p, receivedAt: Date.now() });
        if (!St.S.meta.coach) St.setMeta({ coach: true });
        toast(t('im.saved'));
        location.hash = `#/report/${id}`;
      });
    }
  })();
  return {};
}
