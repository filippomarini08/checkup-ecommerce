import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analizza, extractLinks, htmlToText, trovaPaginaProdotto } from '../public/lib/checks.js';
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
