import { parseFattura, formatEuro, formatData, NATURE } from '/lib/fattura.js';
import { extractFromP7m, decodeXmlBytes } from '/lib/p7m.js';

const drop = document.getElementById('drop');
const fileInput = document.getElementById('file');
const out = document.getElementById('out');
const errors = document.getElementById('errors');
const actions = document.getElementById('actions');

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else e.setAttribute(k, v);
  }
  for (const k of kids) if (k != null && k !== '') e.append(k);
  return e;
}

const fmtNum = (v, d = 2) =>
  v == null ? '' : new Intl.NumberFormat('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: d }).format(v);

function party(label, p) {
  if (!p) return el('div');
  return el('div', {},
    el('div', { class: 'label' }, label),
    el('p', {}, el('strong', {}, p.nome || '—')),
    p.indirizzo ? el('p', {}, p.indirizzo) : null,
    p.partitaIva ? el('p', {}, `P.IVA ${p.partitaIva}`) : null,
    p.codiceFiscale ? el('p', {}, `C.F. ${p.codiceFiscale}`) : null,
    p.regimeLabel ? el('p', { class: 'muted' }, `Regime fiscale: ${p.regimeLabel}`) : null,
    p.email ? el('p', { class: 'muted' }, p.email) : null
  );
}

function downloadLink(a) {
  const bin = atob(a.base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const type = /pdf/i.test(a.formato) || /\.pdf$/i.test(a.nome) ? 'application/pdf' : 'application/octet-stream';
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  return el('a', { href: url, download: a.nome || 'allegato' }, a.nome || 'allegato');
}

function renderInvoice(f, fileName) {
  const nodes = [];
  for (const d of f.documenti) {
    const box = el('article', { class: 'invoice' });
    box.append(
      el('div', { class: 'inv-head' },
        el('div', {},
          el('div', { class: 'muted' }, d.tipoLabel),
          el('h2', {}, `N. ${d.numero || '—'} del ${formatData(d.data)}`)
        ),
        el('div', { class: 'muted' }, fileName)
      ),
      el('div', { class: 'parties' }, party('Fornitore', f.cedente), party('Cliente', f.cessionario))
    );
    if (d.causale.length) box.append(el('p', {}, el('span', { class: 'muted' }, 'Causale: '), d.causale.join(' ')));

    const table = el('table', { class: 'lines' });
    table.append(el('thead', {}, el('tr', {},
      el('th', {}, 'Descrizione'), el('th', { class: 'r' }, 'Q.tà'), el('th', { class: 'r' }, 'Prezzo'),
      el('th', { class: 'r' }, 'IVA'), el('th', { class: 'r' }, 'Totale'))));
    const tb = el('tbody');
    for (const l of d.linee) {
      const iva = l.natura ? l.natura : l.aliquota != null ? `${fmtNum(l.aliquota)}%` : '';
      tb.append(el('tr', {},
        el('td', {}, l.descrizione, l.codice ? el('div', { class: 'muted' }, `Cod. ${l.codice}`) : null),
        el('td', { class: 'r' }, l.quantita != null ? `${fmtNum(l.quantita, 4)} ${l.unitaMisura}`.trim() : ''),
        el('td', { class: 'r' }, formatEuro(l.prezzoUnitario, d.divisa)),
        el('td', { class: 'r' }, iva),
        el('td', { class: 'r' }, formatEuro(l.prezzoTotale, d.divisa))
      ));
    }
    table.append(tb);
    box.append(el('div', { class: 'table-scroll' }, table));

    const totals = el('div', { class: 'totals' });
    for (const r of d.riepilogo) {
      const label = r.natura ? r.natura : `IVA ${fmtNum(r.aliquota)}%`;
      totals.append(el('div', {}, el('span', {}, `Imponibile ${label}`), el('span', {}, formatEuro(r.imponibile, d.divisa))));
      if (!r.natura) totals.append(el('div', {}, el('span', {}, `Imposta ${fmtNum(r.aliquota)}%`), el('span', {}, formatEuro(r.imposta, d.divisa))));
    }
    for (const c of d.cassa) totals.append(el('div', {}, el('span', {}, `Cassa previdenziale ${c.tipo}`), el('span', {}, formatEuro(c.importo, d.divisa))));
    if (d.bollo) totals.append(el('div', {}, el('span', {}, 'Bollo'), el('span', {}, formatEuro(d.bollo, d.divisa))));
    const totale = d.totaleDichiarato != null ? d.totaleDichiarato : d.totaleCalcolato;
    totals.append(el('div', { class: 'grand' }, el('span', {}, 'Totale documento'), el('span', {}, formatEuro(totale, d.divisa))));
    for (const r of d.ritenute) totals.append(el('div', {}, el('span', {}, `Ritenuta ${r.tipo} ${fmtNum(r.aliquota)}%`), el('span', {}, `− ${formatEuro(r.importo, d.divisa)}`)));
    box.append(totals);
    if (d.totaleDichiarato == null) box.append(el('p', { class: 'warnline' }, 'La fattura non indica il totale: quello mostrato è calcolato dal riepilogo IVA più l’eventuale bollo.'));
    for (const r of d.riepilogo) {
      const note = [r.natura && NATURE[r.natura] ? `${r.natura}: ${NATURE[r.natura]}` : '', r.riferimentoNormativo].filter(Boolean).join(' \u00b7 ');
      if (note) box.append(el('p', { class: 'muted' }, note));
    }

    if (d.pagamenti.length) {
      const kv = el('div', { class: 'kv' });
      for (const p of d.pagamenti) {
        kv.append(el('div', {}, el('div', { class: 'label' }, 'Pagamento'), el('p', {}, [p.modalitaLabel || p.modalita, p.condizioniLabel].filter(Boolean).join(' · '))));
        if (p.scadenza) kv.append(el('div', {}, el('div', { class: 'label' }, 'Scadenza'), el('p', {}, formatData(p.scadenza))));
        if (p.importo != null) kv.append(el('div', {}, el('div', { class: 'label' }, 'Importo'), el('p', {}, formatEuro(p.importo, d.divisa))));
        if (p.iban) kv.append(el('div', {}, el('div', { class: 'label' }, 'IBAN'), el('p', {}, p.iban)));
      }
      box.append(kv);
    }
    const t = f.trasmissione;
    box.append(el('p', { class: 'muted' }, `Formato ${t.formato || f.versione} · Codice destinatario ${t.codiceDestinatario || '—'}${t.pecDestinatario ? ' · PEC ' + t.pecDestinatario : ''}`));
    if (d.allegati.length) {
      const p = el('p', { class: 'no-print' }, 'Allegati: ');
      d.allegati.forEach((a, i) => {
        if (i) p.append(', ');
        p.append(downloadLink(a));
      });
      box.append(p);
    }
    nodes.push(box);
  }
  return nodes;
}

async function handle(files) {
  errors.replaceChildren();
  out.replaceChildren();
  for (const file of files) {
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      const bytes = /\.p7m$/i.test(file.name) ? extractFromP7m(buf) : buf;
      const fattura = parseFattura(decodeXmlBytes(bytes));
      out.append(...renderInvoice(fattura, file.name));
    } catch (e) {
      errors.append(el('p', { class: 'alert' }, `${file.name}: ${e.message}`));
    }
  }
  actions.hidden = !out.children.length;
  if (out.children.length) out.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

fileInput.addEventListener('change', () => handle([...fileInput.files]));
['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', (e) => handle([...e.dataTransfer.files]));
document.getElementById('print').addEventListener('click', () => window.print());
document.getElementById('reset').addEventListener('click', () => {
  out.replaceChildren();
  errors.replaceChildren();
  actions.hidden = true;
  fileInput.value = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
