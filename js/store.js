// Datenschicht: komplett getrennt von der Oberfläche (Aufbau wie in BadTeam).
// Alles bleibt auf dem Gerät (IndexedDB). Sichern über eine Datei (Export/Import). Kein Server, keine Dropbox.

const DB_NAME = 'badplayer';
const STORE = 'kv';
export const FORMAT = 'badplayer';
export const VERSION = 1;

/* ---------- Datenmodell ----------
 * entries   Tagebuch-Einträge
 *   { id, day: 'JJJJ-MM-TT', kind: 'training' | 'match' | 'solo', mood: 0 (keine Angabe) … 5,
 *     good, work, note, source: 'self' (selbst eingetragen; später z. B. 'server'), ref: null, createdAt, updatedAt }
 * goals     Ziele   { id, text, done, doneAt, createdAt, updatedAt }
 * tasks     Aufgaben vom Trainer (per Link bekommen)
 *   { id, pkg (ID des Pakets vom Trainer), title, text, due: 'JJJJ-MM-TT' | '', from, clips: [clip], done, doneAt, reply, receivedAt, updatedAt }
 * clips     Clips vom Trainer (per Link bekommen)   { id, pkg, url, title, note, from, seen, receivedAt, updatedAt }
 *   clip in einer Aufgabe: { url, title, note }
 * --- nur im Trainer-Bereich ---
 * sent      Verschickte Links   { id, kind: 'task' | 'clips', to, title, pkg: {Paket}, createdAt, updatedAt }
 * inbox     Von Spielern zurückgeschickt   { id, pkg, kind: 'done' | 'diary', player, data: {Paket}, receivedAt, updatedAt }
 */

const LISTS = ['entries', 'goals', 'tasks', 'clips', 'sent', 'inbox'];
const empty = () => ({ entries: [], goals: [], tasks: [], clips: [], sent: [], inbox: [] });
export const KINDS = ['training', 'match', 'solo'];

export const S = {
  data: empty(),
  meta: { created: 0, lastExport: 0, lastChange: 0, name: '', coach: false, coachName: '', nagUntil: 0, tourDone: false },
  volatile: false, // true = Speicher im Browser nicht verfügbar
};

let db = null;
let timer = null;
const subs = new Set();

export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
function openDb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
const kvGet = (k) => req(db.transaction(STORE).objectStore(STORE).get(k));
function kvPut(pairs) {
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    for (const [k, v] of pairs) tx.objectStore(STORE).put(v, k);
    tx.oncomplete = res;
    tx.onerror = tx.onabort = () => rej(tx.error);
  });
}

// ---------- Aufräumen (alles, was hereinkommt, läuft hier durch) ----------
export const str = (v, max = 4000) => String(v ?? '').trim().slice(0, max);
const isDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
const ts = (v) => (Number.isFinite(v) && v > 0 ? v : 0);
/** Nur echte Internet-Adressen (http/https) – nie „javascript:“ o. Ä. */
export function cleanUrl(u) {
  try { const x = new URL(String(u || '').trim()); return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : ''; } catch { return ''; }
}
export const cleanClip = (c) => ({ url: cleanUrl(c?.url), title: str(c?.title, 200), note: str(c?.note, 1000) });
const cleanClips = (list) => (Array.isArray(list) ? list.map(cleanClip).filter((c) => c.url).slice(0, 30) : []);

const CLEAN = {
  entries: (x) => ({ day: isDay(x.day) ? x.day : todayIso(), kind: KINDS.includes(x.kind) ? x.kind : 'training',
    mood: Math.max(0, Math.min(5, Math.round(+x.mood || 0))), good: str(x.good), work: str(x.work), note: str(x.note),
    source: str(x.source, 20) || 'self', ref: x.ref ? str(x.ref, 200) : null }),
  goals: (x) => ({ text: str(x.text, 300), done: !!x.done, doneAt: ts(x.doneAt) }),
  tasks: (x) => ({ pkg: str(x.pkg, 100), title: str(x.title, 200), text: str(x.text), due: isDay(x.due) ? x.due : '', from: str(x.from, 100),
    clips: cleanClips(x.clips), done: !!x.done, doneAt: ts(x.doneAt), reply: str(x.reply), receivedAt: ts(x.receivedAt) }),
  clips: (x) => ({ pkg: str(x.pkg, 100), ...cleanClip(x), from: str(x.from, 100), seen: !!x.seen, receivedAt: ts(x.receivedAt) }),
  sent: (x) => ({ kind: x.kind === 'clips' ? 'clips' : 'task', to: str(x.to, 100), title: str(x.title, 200), pkg: x.pkg && typeof x.pkg === 'object' ? x.pkg : null }),
  inbox: (x) => ({ pkg: str(x.pkg, 100), kind: x.kind === 'diary' ? 'diary' : 'done', player: str(x.player, 100), data: x.data && typeof x.data === 'object' ? x.data : null, receivedAt: ts(x.receivedAt) }),
};
const cleanItem = (k, x) => ({ id: str(x.id, 100) || uid(), ...CLEAN[k](x), createdAt: ts(x.createdAt), updatedAt: ts(x.updatedAt) });

function normalize(d) {
  const out = empty();
  for (const k of LISTS) out[k] = (Array.isArray(d?.[k]) ? d[k] : []).filter((x) => x && typeof x === 'object' && x.id).map((x) => cleanItem(k, x));
  out.clips = out.clips.filter((c) => c.url);
  out.sent = out.sent.filter((s) => s.pkg);
  out.inbox = out.inbox.filter((s) => s.data);
  return out;
}

// ---------- Start, Speichern, Benachrichtigen ----------
export async function init() {
  try {
    db = await openDb();
    const d = await kvGet('data');
    const m = await kvGet('meta');
    S.data = normalize(d);
    if (m) Object.assign(S.meta, m);
  } catch (e) {
    console.error('IndexedDB nicht verfügbar', e);
    S.volatile = true;
    S.data = normalize(null);
  }
  if (!S.meta.created) S.meta.created = Date.now();
  try { await navigator.storage?.persist?.(); } catch { /* egal */ }
}

export const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };
export const notify = () => subs.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });

function save() {
  clearTimeout(timer);
  timer = setTimeout(flush, 300);
}
export async function flush() {
  clearTimeout(timer);
  if (!db) return;
  try { await kvPut([['data', S.data], ['meta', S.meta]]); } catch (e) { console.error('Speichern fehlgeschlagen', e); }
}

/** Jede Änderung an den Daten läuft hier durch: ändern, merken, speichern, Oberfläche benachrichtigen. */
export function change(fn) {
  fn(S.data);
  S.meta.lastChange = Date.now();
  save();
  notify();
}
export function setMeta(patch) {
  Object.assign(S.meta, patch);
  save();
  notify();
}
export const hasData = () => ['entries', 'goals', 'tasks', 'clips', 'inbox'].some((k) => S.data[k].length);
export const isDirty = () => hasData() && S.meta.lastChange > (S.meta.lastExport || 0);

// ---------- Datum ----------
const pad = (n) => String(n).padStart(2, '0');
export const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayIso = () => iso(new Date());
export const addDays = (day, n) => { const d = new Date(`${day}T12:00:00`); d.setDate(d.getDate() + n); return iso(d); };
export const daysBetween = (a, b) => Math.round((new Date(`${b}T12:00:00`) - new Date(`${a}T12:00:00`)) / 864e5);

// ---------- Allgemein: anlegen, ändern, löschen ----------
const find = (k, id) => S.data[k].find((x) => x.id === id);
export const entry = (id) => find('entries', id);
export const task = (id) => find('tasks', id);
export const clip = (id) => find('clips', id);
export const sentItem = (id) => find('sent', id);
export const report = (id) => find('inbox', id);
export const taskByPkg = (pkg) => S.data.tasks.find((x) => x.pkg === pkg);
export const reportByPkg = (pkg) => S.data.inbox.find((x) => x.pkg === pkg);

export function add(k, x) {
  const now = Date.now();
  const item = cleanItem(k, { ...x, id: uid(), createdAt: now, updatedAt: now });
  change((d) => d[k].unshift(item));
  return item.id;
}
export function update(k, id, patch) {
  change(() => { const x = find(k, id); if (x) Object.assign(x, CLEAN[k]({ ...x, ...patch }), { updatedAt: Date.now() }); });
}
/** Löscht ein Element und liefert „Rückgängig“ */
export function remove(k, id) {
  const i = S.data[k].findIndex((x) => x.id === id);
  if (i < 0) return () => {};
  const old = S.data[k][i];
  change((d) => { d[k] = d[k].filter((x) => x.id !== id); });
  return () => change((d) => { if (!d[k].some((x) => x.id === id)) d[k].splice(Math.min(i, d[k].length), 0, old); });
}

// ---------- Listen ----------
const byDayDesc = (a, b) => b.day.localeCompare(a.day) || b.createdAt - a.createdAt;
export const entriesSorted = () => [...S.data.entries].sort(byDayDesc);
export const openTasks = () => S.data.tasks.filter((x) => !x.done).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || b.receivedAt - a.receivedAt);
export const doneTasks = () => S.data.tasks.filter((x) => x.done).sort((a, b) => b.doneAt - a.doneAt);
export const unseenClips = () => S.data.clips.filter((c) => !c.seen).length;

// ---------- Alles löschen ----------
export function wipeAll() {
  change((d) => Object.assign(d, empty()));
}

// ---------- Sicherungsdatei ----------
export function buildExport() {
  return { format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), name: S.meta.name, ...S.data };
}
export function markExported() { setMeta({ lastExport: Date.now() }); }

const stamp = (x) => x.updatedAt || x.createdAt || 0;
/** Prüft eine Datei und liefert die aufgeräumten Daten (oder wirft einen Fehler). */
export function parseImport(text) {
  const d = JSON.parse(text);
  if (!d || d.format !== FORMAT) throw new Error('format');
  return { ...normalize(d), name: str(d.name, 100) };
}
/** mode: 'merge' (neuere Fassung gewinnt) oder 'replace' */
export function applyImport(inc, mode = 'merge') {
  change((d) => {
    for (const k of LISTS) {
      if (mode === 'replace') { d[k] = inc[k]; continue; }
      for (const x of inc[k]) {
        const i = d[k].findIndex((y) => y.id === x.id);
        if (i < 0) d[k].push(x);
        else if (stamp(x) > stamp(d[k][i])) d[k][i] = x;
      }
    }
  });
  if (inc.name && !S.meta.name) setMeta({ name: inc.name });
  return { n: inc.entries.length, g: inc.goals.length, t: inc.tasks.length, c: inc.clips.length };
}
