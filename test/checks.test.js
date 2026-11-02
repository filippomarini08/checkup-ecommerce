import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analizza, extractLinks, hasDiscountMarkup, htmlToText, trovaPaginaProdotto } from '../public/lib/checks.js';
import { isValidPartitaIva } from '../public/lib/piva.js';
import { controlla, normalizzaUrl } from '../worker/index.js';

const fx = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const byId = (report) => Object.fromEntries(report.risultati.map((r) => [r.id, r]));

test('partita IVA checksum', () => {
  assert.equal(isValidPartitaIva('01234567897'), true);
  assert.equal(isValidPartitaIva('IT12345678903'), true);
  assert.equal(isValidPartitaIva('01234567890'), false);
  assert.equal(isValidPartitaIva('00000000000'), false);
  assert.equal(isValidPartitaIva('123'), false);
});

test('links and text extraction', () => {
  const links = extractLinks('<a href="/x" aria-label="Apri">Vai&nbsp;a <b>pagina</b></a><button title="Recedi">X</button>');
  assert.deepEqual(links[0], { tag: 'a', href: '/x', text: 'Vai a pagina Apri' });
  assert.equal(links[1].tag, 'button');
  assert.equal(htmlToText('<p>Prezzo &euro;10</p><script>var a=1</script>'), 'Prezzo €10');
});

test('product page discovery', () => {
  assert.equal(trovaPaginaProdotto('https://negozio.it/', fx('negozio-conforme.html')), 'https://negozio.it/products/felpa-grigia');
  assert.equal(trovaPaginaProdotto('https://negozio.it/', fx('negozio-da-sistemare.html')), 'https://negozio.it/prodotto/scarpa-rossa');
  assert.equal(trovaPaginaProdotto('https://negozio.it/', '<a href="https://altro.it/products/x">x</a>'), null);
});

test('compliant shop passes every applicable check', () => {
  const r = analizza({
    home: { url: 'https://negozio.it/', html: fx('negozio-conforme.html') },
    product: { url: 'https://negozio.it/products/felpa-grigia', html: fx('prodotto-conforme.html') },
  });
  const c = byId(r);
  for (const id of ['https', 'partita-iva', 'recesso', 'condizioni', 'privacy', 'cookie', 'contatti', 'odr', 'prezzo-30-giorni', 'sicurezza-prodotto', 'accessibilita']) {
    assert.equal(c[id].esito, 'ok', `${id}: ${c[id].dettaglio}`);
  }
  assert.equal(r.punteggio, 100);
});

test('shop with problems gets the right warnings', () => {
  const r = analizza({
    home: { url: 'http://negozio.it/', html: fx('negozio-da-sistemare.html') },
    product: { url: 'http://negozio.it/prodotto/scarpa-rossa', html: fx('prodotto-da-sistemare.html') },
  });
  const c = byId(r);
  assert.equal(c.https.esito, 'manca');
  assert.equal(c['partita-iva'].esito, 'attenzione'); // wrong check digit
  assert.equal(c.recesso.esito, 'attenzione'); // returns page but no withdrawal function
  assert.equal(c.condizioni.esito, 'manca');
  assert.equal(c.privacy.esito, 'manca');
  assert.equal(c.cookie.esito, 'manca'); // Meta pixel without consent banner
  assert.equal(c.contatti.esito, 'attenzione');
  assert.equal(c.odr.esito, 'attenzione');
  assert.equal(c['prezzo-30-giorni'].esito, 'manca');
  assert.equal(c['sicurezza-prodotto'].esito, 'attenzione');
  assert.equal(c.accessibilita.esito, 'info');
  assert.ok(r.punteggio < 20, `score ${r.punteggio}`);
  for (const x of r.risultati) assert.ok(x.dettaglio.length > 10);
});

test('URL normalisation blocks private and odd addresses', () => {
  assert.equal(normalizzaUrl('negozio.it').toString(), 'https://negozio.it/');
  for (const bad of ['', 'localhost', 'http://127.0.0.1', 'http://192.168.1.1', 'ftp://x.it', 'http://x.it:8080', 'http://u:p@x.it', 'intranet']) {
    assert.throws(() => normalizzaUrl(bad), undefined, bad);
  }
});

test('end-to-end with a fake fetcher', async () => {
  const pages = {
    'https://negozio.it/': fx('negozio-conforme.html'),
    'https://negozio.it/products/felpa-grigia': fx('prodotto-conforme.html'),
  };
  const fetchPage = async (url) => {
    if (!(url in pages)) throw new Error('404');
    return { url, html: pages[url] };
  };
  const r = await controlla('negozio.it', fetchPage);
  assert.equal(r.paginaProdotto, 'https://negozio.it/products/felpa-grigia');
  assert.equal(r.punteggio, 100);
});

test('Shopify-like theme: no script leaks, no phantom discount, policy links found', () => {
  const home = fx('shopify-home.html');
  const links = extractLinks(home);
  assert.ok(links.every((l) => !/[{};]/.test(l.text)), 'link text must not contain code');
  const r = byId(analizza({
    home: { url: 'https://negozio-esempio.it/', html: home },
    product: { url: 'https://negozio-esempio.it/products/maglia-blu', html: fx('shopify-prodotto.html') },
  }));
  assert.equal(r['partita-iva'].esito, 'ok');
  assert.equal(r.condizioni.esito, 'ok');
  assert.match(r.condizioni.dettaglio, /Termini del servizio/);
  assert.equal(r.recesso.esito, 'attenzione');
  assert.match(r.recesso.dettaglio, /Informativa sui rimborsi/);
  assert.doesNotMatch(r.recesso.dettaglio, /[{};]/);
  assert.equal(r['prezzo-30-giorni'].esito, 'info');
  assert.equal(r['sicurezza-prodotto'].esito, 'ok');
});

test('discount detection needs a real struck-through price', () => {
  assert.equal(hasDiscountMarkup('<div class="price__sale"><s class="price-item"></s>€29,00</div>'), false);
  assert.equal(hasDiscountMarkup('<script>var t="<s>€49,00</s>"</script>'), false);
  assert.equal(hasDiscountMarkup('<div class="price price--on-sale"><s>€49,00</s> €29,00</div>'), true);
  assert.equal(hasDiscountMarkup('<del><span>49,00&nbsp;€</span></del> <ins>29,00 €</ins>'), true);
  assert.equal(hasDiscountMarkup('<span class="onsale">Offerta!</span>'), true);
});

test('falls back to www. when the bare domain fails', async () => {
  const fetchPage = async (url) => {
    if (url === 'https://www.negozio.it/') return { url, html: fx('negozio-conforme.html') };
    if (url === 'https://www.negozio.it/products/felpa-grigia') return { url, html: fx('prodotto-conforme.html') };
    throw new Error('Il sito ha risposto con errore 404.');
  };
  const r = await controlla('negozio.it', fetchPage);
  assert.equal(r.url, 'https://www.negozio.it/');
  await assert.rejects(controlla('altro.it', fetchPage), /404/);
});

test('labels are not repeated and support links count as contacts', () => {
  const links = extractLinks('<a href="/cgv" title="Condizioni generali di vendita">Condizioni generali di vendita</a>');
  assert.equal(links[0].text, 'Condizioni generali di vendita');
  const r = byId(analizza({ home: { url: 'https://x.it/', html: '<a href="/pages/help">Assistenza clienti</a>' } }));
  assert.equal(r.contatti.esito, 'ok');
});

test('foreign sites get a notice, query strings do not trigger matches, bot walls are spotted', async () => {
  const { isBotWall } = await import('../worker/index.js');
  const html = '<html lang="en"><body><a href="/prefs?preferencesReturnUrl=%2F">EN</a><a href="/gp/help/customer/display.html?nodeId=508088">Conditions of Use</a></body></html>';
  const r = analizza({ home: { url: 'https://www.shop.com/', html } });
  assert.match(r.avviso, /pubblico italiano/);
  const by = byId(r);
  assert.equal(by.recesso.esito, 'manca');
  assert.equal(by.condizioni.esito, 'ok');
  assert.equal(analizza({ home: { url: 'https://negozio.it/', html } }).avviso, null);
  assert.equal(isBotWall('<html><body><h4>Enter the characters you see below</h4><form></form></body></html>'), true);
  assert.equal(isBotWall(fx('negozio-conforme.html') + '<script src="https://www.google.com/recaptcha/api.js"></script>'), false);
});

test('nearly empty home pages are refused instead of scored', async () => {
  const fetchPage = async (url) => ({ url, html: '<html><body><form><button>Continua</button></form></body></html>' });
  await assert.rejects(controlla('grande-marketplace.it', fetchPage), /quasi vuota/);
});
