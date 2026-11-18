// Links zwischen Trainer und Spieler – ohne Server: Der Inhalt steckt komprimiert im Link
// (nach dem #, das wird nie an einen Server geschickt). Gleiches Verfahren wie das Teilen in BadPlan.
//
// Paket: { format: 'badplayer-share', v: 1, kind, id, from, ... }
//   kind 'task'  (Trainer → Spieler)  title, text, due, clips: [{ url, title, note }], to
//   kind 'clips' (Trainer → Spieler)  clips: [{ url, title, note }], to
//   kind 'done'  (Spieler → Trainer)  player, task: { pkg, title }, doneAt, reply
//   kind 'diary' (Spieler → Trainer)  player, range: { from, to }, entries: [...], goals: [...]
// BadPlan und BadClip können später Pakete im selben Format bauen und auf BadPlayer verlinken.
import * as St from './store.js';
import { icon } from './icons.js';
import { t } from './i18n.js';
import { $, esc, toast, modal, closeModal } from './ui.js';

export const FORMAT = 'badplayer-share';
export const KINDS = ['task', 'clips', 'done', 'diary'];
// Adresse, unter der BadPlayer gerade läuft (online: badmplayer.mpdalbeck.workers.dev)
export const APP_URL = location.origin + location.pathname;

// ---------- Ein-/Auspacken (deflate + base64url), wie in BadPlan ----------
const b64url = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
async function pipe(bytes, stream) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }
export async function pack(obj) {
  const raw = new TextEncoder().encode(JSON.stringify(obj));
  if (typeof CompressionStream === 'function') return `z${b64url(await pipe(raw, new CompressionStream('deflate-raw')))}`;
  return `j${b64url(raw)}`;
}
export async function unpack(code) {
  const bytes = unb64url(code.slice(1));
  const raw = code[0] === 'z' ? await pipe(bytes, new DecompressionStream('deflate-raw')) : bytes;
  return JSON.parse(new TextDecoder().decode(raw));
}

/** Paket fertig machen (Format, Version, eigene ID) */
export const makePkg = (kind, body) => ({ format: FORMAT, v: 1, kind, id: St.uid(), ...body });
export const linkFor = async (pkg) => `${APP_URL}#/import/${await pack(pkg)}`;

/** Link lesen und prüfen. Liefert ein aufgeräumtes Paket oder wirft einen Fehler. */
export async function readLink(code) {
  const p = await unpack(code);
  if (!p || p.format !== FORMAT || !KINDS.includes(p.kind) || !p.id) throw new Error('format');
  const s = St.str;
  const out = { kind: p.kind, id: s(p.id, 100), from: s(p.from, 100), to: s(p.to, 100) };
  const clips = (Array.isArray(p.clips) ? p.clips : []).map(St.cleanClip).filter((c) => c.url).slice(0, 30);
  if (p.kind === 'task') Object.assign(out, { title: s(p.title, 200), text: s(p.text), due: /^\d{4}-\d{2}-\d{2}$/.test(p.due || '') ? p.due : '', clips });
  if (p.kind === 'clips') { if (!clips.length) throw new Error('empty'); out.clips = clips; }
  if (p.kind === 'done') Object.assign(out, { player: s(p.player, 100), task: { pkg: s(p.task?.pkg, 100), title: s(p.task?.title, 200) }, doneAt: +p.doneAt || 0, reply: s(p.reply) });
  if (p.kind === 'diary') {
    const day = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : '');
    Object.assign(out, {
      player: s(p.player, 100), range: { from: day(p.range?.from), to: day(p.range?.to) },
      entries: (Array.isArray(p.entries) ? p.entries : []).slice(0, 500).map((e) => ({ day: day(e.day), kind: St.KINDS.includes(e.kind) ? e.kind : 'training',
        mood: Math.max(0, Math.min(5, Math.round(+e.mood || 0))), good: s(e.good), work: s(e.work), note: s(e.note) })).filter((e) => e.day),
      goals: (Array.isArray(p.goals) ? p.goals : []).slice(0, 100).map((g) => ({ text: s(g.text, 300), done: !!g.done })).filter((g) => g.text),
    });
  }
  return out;
}

/**
 * Teilen-Dialog: am Handy WhatsApp/Teilen-Menü, sonst Link kopieren.
 * @param {object} o  title (Überschrift), hint (Erklärung), text (Begleittext für die Nachricht), url
 */
export function shareDialog({ title, hint, text, url }) {
  const wa = `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`;
  const d = modal(`<h2>${icon('send', 20)} ${esc(title)}</h2>
    <p class="muted">${esc(hint)}</p>
    <div class="sharebtns">
      <a class="btn primary big" id="sh-wa" href="${esc(wa)}" target="_blank" rel="noopener">${icon('send', 20)}<span>WhatsApp</span></a>
      ${navigator.share ? `<button class="big" id="sh-native">${icon('share', 20)}<span>${esc(t('sh.native'))}</span></button>` : ''}
      <button class="big" id="sh-copy">${icon('copy', 20)}<span>${esc(t('sh.copy'))}</span></button>
    </div>
    <details class="more"><summary>${esc(t('sh.showLink'))}</summary><input id="sh-url" readonly value="${esc(url)}">
      <p class="muted small">${esc(t('sh.size', { n: Math.round(url.length / 100) / 10 }))}</p></details>
    <div class="dlg-actions"><span class="grow"></span><button class="ghost" id="sh-ok">${esc(t('ui.done'))}</button></div>`);
  $('#sh-copy', d).onclick = async () => {
    try { await navigator.clipboard.writeText(url); } catch { const i = $('#sh-url', d); i.closest('details').open = true; i.select(); document.execCommand?.('copy'); }
    toast(t('sh.copied'));
  };
  const nb = $('#sh-native', d);
  if (nb) nb.onclick = () => navigator.share({ title, text, url }).catch(() => {});
  $('#sh-ok', d).onclick = closeModal;
}

/** Paket bauen und den Teilen-Dialog zeigen */
export async function sharePkg(pkg, { title, hint, text }) {
  let url;
  try { url = await linkFor(pkg); } catch (e) { console.error(e); return toast(t('sh.err')); }
  shareDialog({ title, hint, text, url });
}
