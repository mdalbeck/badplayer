# BadPlayer – diary, tasks and clips for players

**Online:** https://badplayer.mpdalbeck.workers.dev/

Part of the “Bad Apps” family, next to [BadClip](https://badclip.mpdalbeck.workers.dev/) (video library), [BadPlan](https://badplan.mpdalbeck.workers.dev/) (training plans) and [BadTeam](https://badteam.mpdalbeck.workers.dev/) (players, groups, attendance – for coaches).
BadPlayer is the app for **players**: made for the phone, simple enough for children, German/English, light/dark, accent pink `#ff4fd8`.
Local-first: no login, no server, no Dropbox, no build step. A player only ever sees their own data.

## Status
Working:
- **Diary**: entries (training / match / practised alone, date, mood face 1–5, what went well, what to practise, note), monthly list.
- **Goals**: add, tick off, delete (with undo).
- **Tasks from the coach** (received via link): text, clips, due date; tick off with a note; “tell your coach” sends a link back.
- **Clips from the coach** (received via link): YouTube plays embedded (youtube-nocookie, start time kept), shared Dropbox videos and video files play in a `<video>` player, other links open in the browser.
- **Send diary to coach** as a link (2 weeks / 4 weeks / 3 months / all, goals optional).
- **Coach area** (switch in settings, hidden by default): compose a task or clips, share via WhatsApp / share sheet / copy; list of sent links (send again, use as template); “From players” inbox for links players send back (saved only when the coach chooses).
- Backup file (export/import, merge or replace), reminder banner when no backup for a while, tour, PWA.

Later: buttons “send to player” in BadPlan (exercise) and BadClip (clip) that build the same link format; automatic diary entries from a server (entries already carry `source` and `ref` for that).

## Links between coach and player
No server: the content sits compressed in the address after `#` (`#/import/z…`, deflate-raw + base64url, same as BadPlan’s `share.js`).
The part after `#` is never sent to a server.

```
{ format: 'badplayer-share', v: 1, kind, id, from, to? , ... }
kind 'task'   coach → player   title, text, due 'YYYY-MM-DD' | '', clips: [{ url, title, note }]
kind 'clips'  coach → player   clips: [{ url, title, note }]
kind 'done'   player → coach   player, task: { pkg, title }, doneAt, reply
kind 'diary'  player → coach   player, range: { from, to }, entries: [{ day, kind, mood, good, work, note }], goals: [{ text, done }]
```
`id` is unique per package, so opening the same link twice does not create duplicates. Only `http(s)` URLs are accepted for clips.

## Data format (backup file, `format: 'badplayer'`)
```
entries { id, day, kind: 'training'|'match'|'solo', mood: 0..5, good, work, note, source: 'self', ref: null, createdAt, updatedAt }
goals   { id, text, done, doneAt, createdAt, updatedAt }
tasks   { id, pkg, title, text, due, from, clips: [{ url, title, note }], done, doneAt, reply, receivedAt, createdAt, updatedAt }
clips   { id, pkg, url, title, note, from, seen, receivedAt, createdAt, updatedAt }
sent    { id, kind: 'task'|'clips', to, title, pkg: {package}, createdAt, updatedAt }      (coach area)
inbox   { id, pkg, kind: 'done'|'diary', player, data: {package}, receivedAt, ... }     (coach area)
```

## Files
- `index.html`, `styles.css`: user interface (base look from BadTeam, accent pink)
- `js/app.js`: routing, navigation, settings page, backup, banner
- `js/store.js`: data layer (IndexedDB, export/import)
- `js/diary.js`: diary, entry form, goals, send diary
- `js/tasks.js`: tasks and clips
- `js/coach.js`: coach area, player reports, receiving links
- `js/share.js`: link format (pack/unpack, check), share dialog
- `js/video.js`: recognises YouTube / Dropbox / video files, player and thumbnails
- `js/i18n.js`: all texts in German and English (du-form)
- `js/icons.js`: icons, mood faces, BadPlayer logo
- `js/tour.js`: introduction tour
- `js/ui.js`: small UI helpers
- `js/family.js`: app switcher – identical in all Bad Apps
- `sw.js`, `manifest.webmanifest`, `icon.svg`: PWA
- `wrangler.jsonc`, `_headers`, `.assetsignore`: Cloudflare Workers hosting

## Run locally
```bash
python3 -m http.server 8000
```
Then open http://localhost:8000/.
