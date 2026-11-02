// Cloudflare Worker: serves the static site and the /api/check endpoint.
import { analizza, extractLinks, htmlToText, trovaPaginaProdotto } from '../public/lib/checks.js';

const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 10_000;
const USER_AGENT = 'Mozilla/5.0 (compatible; CheckupEcommerceIT/0.2; +https://checkup-ecommerce.mfilippocer.workers.dev/)';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|0\.0\.0\.0|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|\[?::1\]?|\[?f[cd][0-9a-f]{2}:.*)$/i;

/** Normalise user input into a public http(s) URL, or throw a user-facing message. */
export function normalizzaUrl(input) {
  let s = String(input || '').trim();
  if (!s) throw new Error('Inserisci l’indirizzo del negozio.');
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  let u;
  try {
    u = new URL(s);
  } catch {
    throw new Error('L’indirizzo non è valido.');
  }
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Sono ammessi solo indirizzi http o https.');
  if (u.port && !['80', '443'].includes(u.port)) throw new Error('Porta non ammessa.');
  if (u.username || u.password) throw new Error('L’indirizzo non deve contenere credenziali.');
  if (PRIVATE_HOST.test(u.hostname) || !u.hostname.includes('.')) throw new Error('Questo indirizzo non è un sito pubblico.');
  u.hash = '';
  return u;
}

/** Captcha or challenge pages that big shops show to automated visitors: short pages with a challenge. */
export function isBotWall(html) {
  const text = htmlToText(html);
  if (text.length > 1500) return false;
  return (
    /<title>[^<]*(just a moment|attention required|access denied|accesso negato|robot check|captcha)/i.test(html) ||
    /enter the characters you see|are you a robot|sei un robot|verify you are (a )?human|verifica di essere un essere umano/i.test(text)
  );
}

function erroreHttp(status) {
  let msg = `Il sito ha risposto con errore ${status}.`;
  if ([401, 403, 429, 503].includes(status)) msg = `Il sito blocca i controlli automatici (errore ${status}). Succede con alcuni sistemi anti-bot: il controllo da qui non è possibile.`;
  else if (status === 404) msg = 'Il sito risponde "pagina non trovata" (errore 404). Prova a incollare l’indirizzo completo copiato dal browser, per esempio https://www.negozio.it/.';
  const e = new Error(msg);
  e.status = status;
  return e;
}

async function scarica(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml', 'accept-language': 'it-IT,it;q=0.9' },
    });
    if (!res.ok) throw erroreHttp(res.status);
    const type = res.headers.get('content-type') || '';
    if (type && !/html/i.test(type)) throw new Error('L’indirizzo non restituisce una pagina web.');
    const reader = res.body.getReader();
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) break;
      chunks.push(value);
    }
    const bytes = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0));
    let o = 0;
    for (const c of chunks) {
      bytes.set(c, o);
      o += c.length;
    }
    const html = new TextDecoder('utf-8').decode(bytes);
    if (isBotWall(html)) throw new Error('Il sito ha mostrato una pagina di verifica anti-robot al posto del negozio, quindi non posso controllarlo in automatico.');
    return { url: res.url || url.toString(), html };
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Il sito non ha risposto in tempo.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function controlla(target, fetchPage = scarica) {
  const url = normalizzaUrl(target);
  let home;
  try {
    home = await fetchPage(url.toString());
  } catch (e) {
    // Many shops only answer on www. (or only on the bare domain): try the other one once.
    const alt = new URL(url);
    alt.hostname = url.hostname.startsWith('www.') ? url.hostname.slice(4) : `www.${url.hostname}`;
    try {
      home = await fetchPage(alt.toString());
    } catch {
      throw e;
    }
  }
  // A real shop home page always has navigation. Almost no links means we got a
  // challenge page or a JavaScript-only shell, and scoring it would be misleading.
  if (extractLinks(home.html).length < 3 || htmlToText(home.html).length < 80) {
    throw new Error('Il sito ha restituito una pagina quasi vuota, probabilmente una verifica anti-robot o una pagina che si carica solo con JavaScript. Per non darti un risultato sbagliato, non lo valuto. Capita soprattutto con i grandi marketplace come Amazon.');
  }
  let product = null;
  const productUrl = trovaPaginaProdotto(home.url, home.html);
  if (productUrl) {
    try {
      product = await fetchPage(productUrl);
    } catch {
      product = null;
    }
  }
  return analizza({ home, product });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/check') {
      if (request.method !== 'GET') return json({ errore: 'Metodo non ammesso.' }, 405);
      try {
        const report = await controlla(url.searchParams.get('url'));
        return json(report);
      } catch (e) {
        return json({ errore: e.message || 'Errore imprevisto.' }, 400);
      }
    }
    return env.ASSETS.fetch(request);
  },
};
