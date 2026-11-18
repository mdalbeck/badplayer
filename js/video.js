// Videos: YouTube-Links werden eingebettet abgespielt, Dropbox-Freigaben und Videodateien im eigenen Player.
// Alles andere wird als Link geöffnet.
import { icon } from './icons.js';
import { esc } from './ui.js';
import { t } from './i18n.js';

/** Zeit wie „90“, „90s“, „1m30s“ oder „1:30“ in Sekunden */
function parseT(v) {
  const s = String(v || '').trim();
  if (/^\d+$/.test(s)) return +s;
  if (/^\d+:\d{1,2}(:\d{1,2})?$/.test(s)) return s.split(':').reduce((a, b) => a * 60 + +b, 0);
  const m = s.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0;
}

/** Erkennt, was für ein Video hinter einer Adresse steckt. */
export function parseVideo(url) {
  let u;
  try { u = new URL(String(url || '').trim()); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const h = u.hostname.replace(/^(www|m|music)\./, '');
  let id = null;
  if (h === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (h === 'youtube.com' || h === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else { const m = u.pathname.match(/^\/(embed|shorts|live|v)\/([\w-]+)/); if (m) id = m[2]; }
  }
  if (id && /^[\w-]{6,20}$/.test(id)) return { type: 'yt', id, start: parseT(u.searchParams.get('t') || u.searchParams.get('start')), url: u.href };
  if (h === 'dropbox.com' || h.endsWith('.dropbox.com')) {
    u.searchParams.delete('dl');
    u.searchParams.set('raw', '1');
    return { type: 'file', src: u.href, url: url.trim() };
  }
  if (/\.(mp4|webm|mov|m4v)$/i.test(u.pathname)) return { type: 'file', src: u.href, url: u.href };
  return { type: 'link', url: u.href };
}

export const isVideo = (url) => !!parseVideo(url);

/** Kleines Vorschaubild (nur YouTube hat eins) */
export function thumb(url) {
  const v = parseVideo(url);
  if (v?.type === 'yt') return `<span class="vthumb"><img src="https://i.ytimg.com/vi/${v.id}/mqdefault.jpg" alt="" loading="lazy" onerror="this.remove()"><i>${icon('play', 18)}</i></span>`;
  return `<span class="vthumb none"><i>${icon(v?.type === 'link' ? 'external' : 'play', 18)}</i></span>`;
}

/** Player für die Detailansicht */
export function player(url) {
  const v = parseVideo(url);
  if (!v) return '';
  if (v.type === 'yt') {
    return `<div class="vid"><iframe src="https://www.youtube-nocookie.com/embed/${v.id}?rel=0&playsinline=1${v.start ? `&start=${v.start}` : ''}"
      title="YouTube" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe></div>`;
  }
  if (v.type === 'file') return `<div class="vid"><video src="${esc(v.src)}" controls playsinline preload="metadata"></video></div>`;
  return `<a class="btn big vlink" href="${esc(v.url)}" target="_blank" rel="noopener">${icon('external', 20)}<span>${esc(t('clip.open'))}</span></a>`;
}

/** Kurze Beschreibung, was erkannt wurde (für das Formular im Trainer-Bereich) */
export function kindLabel(url) {
  const v = parseVideo(url);
  if (!String(url || '').trim()) return '';
  if (!v) return t('clip.kindBad');
  return t(`clip.kind.${v.type}`);
}
