import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseXml, text } from '../public/lib/xml.js';
import { parseFattura, formatEuro, formatData } from '../public/lib/fattura.js';
import { extractFromP7m, decodeXmlBytes } from '../public/lib/p7m.js';

const fx = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));

test('xml: entities, CDATA, self-closing tags and namespaces', () => {
  const root = parseXml('<?xml version="1.0"?><p:a xmlns:p="x"><b k="1 &amp; 2"/><c><![CDATA[<ok>]]></c><d>&#224;&lt;</d></p:a>');
  assert.equal(root.local, 'a');
  assert.equal(root.children[0].attrs.k, '1 & 2');
  assert.equal(text(root, 'c'), '<ok>');
  assert.equal(text(root, 'd'), 'à<');
});

test('xml: malformed input gives a readable error', () => {
  assert.throws(() => parseXml('<a><b></a>'), /chiusura inatteso/);
  assert.throws(() => parseXml('<a>'), /non chiuso/);
  assert.throws(() => parseXml('solo testo'), /Nessun elemento/);
});

test('fattura ordinaria: header, lines, VAT summary, payment', () => {
  const f = parseFattura(decodeXmlBytes(fx('fattura-ordinaria.xml')));
  assert.equal(f.versione, 'FPR12');
  assert.equal(f.cedente.nome, 'Esempio Forniture S.r.l.');
  assert.equal(f.cedente.partitaIva, 'IT01234567897');
  assert.equal(f.cedente.regimeLabel, 'Ordinario');
  assert.equal(f.cedente.indirizzo, 'Via Roma 10, 48015 Cervia (RA)');
  assert.equal(f.cessionario.nome, 'Mario Rossi');
  const d = f.documenti[0];
  assert.equal(d.tipoLabel, 'Fattura');
  assert.equal(d.numero, '2026/118');
  assert.deepEqual(d.causale, ['Fornitura materiale & assistenza']);
  assert.equal(d.linee.length, 2);
  assert.equal(d.linee[0].descrizione, 'Felpa grigia <taglia M>');
  assert.equal(d.linee[0].codice, 'ART-01');
  assert.equal(d.linee[1].descrizione, 'Assistenza tecnica (1 ora)');
  assert.equal(d.imponibile, 150);
  assert.equal(d.imposta, 33);
  assert.equal(d.totaleDichiarato, 183);
  assert.equal(d.totaleCalcolato, 183);
  assert.equal(d.pagamenti[0].modalitaLabel, 'Bonifico');
  assert.equal(d.pagamenti[0].iban, 'IT60X0542811101000000123456');
});

test('fattura forfettario in ISO-8859-1 with stamp duty and no declared total', () => {
  const f = parseFattura(decodeXmlBytes(fx('fattura-forfettario.xml')));
  assert.equal(f.cedente.nome, 'Luca Bianchi');
  assert.equal(f.cedente.regimeLabel, 'Forfettario');
  const d = f.documenti[0];
  assert.equal(d.tipoLabel, 'Parcella');
  assert.equal(d.linee[0].descrizione, 'Consulenza grafica, ottobre (città di Cervia)');
  assert.equal(d.riepilogo[0].naturaLabel, 'Non soggette – altri casi');
  assert.equal(d.bollo, 2);
  assert.equal(d.totaleDichiarato, null);
  assert.equal(d.totaleCalcolato, 402);
});

test('p7m DER, BER (indefinite length) and base64 all give back the XML', () => {
  for (const [file, numero] of [
    ['fattura-ordinaria.xml.p7m', '2026/118'],
    ['fattura-ordinaria-base64.xml.p7m', '2026/118'],
    ['fattura-forfettario-ber.xml.p7m', '12'],
  ]) {
    const xml = decodeXmlBytes(extractFromP7m(new Uint8Array(fx(file))));
    assert.equal(parseFattura(xml).documenti[0].numero, numero, file);
  }
});

test('p7m: garbage is rejected with a clear message', () => {
  assert.throws(() => extractFromP7m(new Uint8Array([1, 2, 3, 4, 5])), /Non trovo la fattura/);
});

test('not an invoice', () => {
  assert.throws(() => parseFattura('<root/>'), /non sembra una fattura/);
});

test('formatting helpers', () => {
  assert.equal(formatData('2026-10-31'), '31/10/2026');
  assert.match(formatEuro(12345.5), /12\.345,50/);
});
