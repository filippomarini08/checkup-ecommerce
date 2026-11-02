// Reads an Italian electronic invoice (FatturaPA / FPR12 / FPA12) into a plain object.
import { parseXml, child, children, text, at } from './xml.js';

export const TIPI_DOCUMENTO = {
  TD01: 'Fattura',
  TD02: 'Acconto/anticipo su fattura',
  TD03: 'Acconto/anticipo su parcella',
  TD04: 'Nota di credito',
  TD05: 'Nota di debito',
  TD06: 'Parcella',
  TD07: 'Fattura semplificata',
  TD08: 'Nota di credito semplificata',
  TD09: 'Nota di debito semplificata',
  TD16: 'Integrazione fattura reverse charge interno',
  TD17: 'Integrazione/autofattura per acquisto servizi dall’estero',
  TD18: 'Integrazione per acquisto di beni intracomunitari',
  TD19: 'Integrazione/autofattura per acquisto di beni ex art. 17 c.2 DPR 633/72',
  TD20: 'Autofattura per regolarizzazione e integrazione delle fatture',
  TD21: 'Autofattura per splafonamento',
  TD22: 'Estrazione beni da Deposito IVA',
  TD23: 'Estrazione beni da Deposito IVA con versamento dell’IVA',
  TD24: 'Fattura differita (art. 21, c. 4, lett. a)',
  TD25: 'Fattura differita (art. 21, c. 4, terzo periodo, lett. b)',
  TD26: 'Cessione di beni ammortizzabili e passaggi interni',
  TD27: 'Fattura per autoconsumo o cessioni gratuite senza rivalsa',
  TD28: 'Acquisti da San Marino con IVA',
};

export const REGIMI_FISCALI = {
  RF01: 'Ordinario',
  RF02: 'Contribuenti minimi',
  RF04: 'Agricoltura e attività connesse e pesca',
  RF05: 'Vendita sali e tabacchi',
  RF06: 'Commercio fiammiferi',
  RF07: 'Editoria',
  RF08: 'Gestione servizi telefonia pubblica',
  RF09: 'Rivendita documenti di trasporto pubblico e di sosta',
  RF10: 'Intrattenimenti, giochi e altre attività',
  RF11: 'Agenzie viaggi e turismo',
  RF12: 'Agriturismo',
  RF13: 'Vendite a domicilio',
  RF14: 'Rivendita beni usati, oggetti d’arte, antiquariato',
  RF15: 'Agenzie di vendite all’asta di oggetti d’arte e antiquariato',
  RF16: 'IVA per cassa P.A.',
  RF17: 'IVA per cassa',
  RF18: 'Altro',
  RF19: 'Forfettario',
  RF20: 'Regime transfrontaliero di franchigia IVA',
};

export const MODALITA_PAGAMENTO = {
  MP01: 'Contanti',
  MP02: 'Assegno',
  MP03: 'Assegno circolare',
  MP04: 'Contanti presso Tesoreria',
  MP05: 'Bonifico',
  MP06: 'Vaglia cambiario',
  MP07: 'Bollettino bancario',
  MP08: 'Carta di pagamento',
  MP09: 'RID',
  MP10: 'RID utenze',
  MP11: 'RID veloce',
  MP12: 'RIBA',
  MP13: 'MAV',
  MP14: 'Quietanza erario',
  MP15: 'Giroconto su conti di contabilità speciale',
  MP16: 'Domiciliazione bancaria',
  MP17: 'Domiciliazione postale',
  MP18: 'Bollettino di c/c postale',
  MP19: 'SEPA Direct Debit',
  MP20: 'SEPA Direct Debit CORE',
  MP21: 'SEPA Direct Debit B2B',
  MP22: 'Trattenuta su somme già riscosse',
  MP23: 'PagoPA',
};

export const CONDIZIONI_PAGAMENTO = {
  TP01: 'Pagamento a rate',
  TP02: 'Pagamento completo',
  TP03: 'Anticipo',
};

export const NATURE = {
  N1: 'Escluse ex art. 15',
  N2: 'Non soggette',
  'N2.1': 'Non soggette ad IVA (artt. da 7 a 7-septies)',
  'N2.2': 'Non soggette – altri casi',
  N3: 'Non imponibili',
  'N3.1': 'Non imponibili – esportazioni',
  'N3.2': 'Non imponibili – cessioni intracomunitarie',
  'N3.3': 'Non imponibili – cessioni verso San Marino',
  'N3.4': 'Non imponibili – operazioni assimilate alle cessioni all’esportazione',
  'N3.5': 'Non imponibili – a seguito di dichiarazioni d’intento',
  'N3.6': 'Non imponibili – altre operazioni',
  N4: 'Esenti',
  N5: 'Regime del margine / IVA non esposta in fattura',
  N6: 'Inversione contabile',
  'N6.1': 'Inversione contabile – cessione di rottami',
  'N6.2': 'Inversione contabile – cessione di oro e argento',
  'N6.3': 'Inversione contabile – subappalto nel settore edile',
  'N6.4': 'Inversione contabile – cessione di fabbricati',
  'N6.5': 'Inversione contabile – cessione di telefoni cellulari',
  'N6.6': 'Inversione contabile – cessione di prodotti elettronici',
  'N6.7': 'Inversione contabile – settore edile e connessi',
  'N6.8': 'Inversione contabile – settore energetico',
  'N6.9': 'Inversione contabile – altri casi',
  N7: 'IVA assolta in altro stato UE',
};

function num(s) {
  if (s === '' || s == null) return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

function anagrafica(node) {
  if (!node) return null;
  const dati = child(node, 'DatiAnagrafici');
  const sede = child(node, 'Sede');
  const denominazione = text(dati, 'Anagrafica/Denominazione');
  const nome = text(dati, 'Anagrafica/Nome');
  const cognome = text(dati, 'Anagrafica/Cognome');
  const paese = text(dati, 'IdFiscaleIVA/IdPaese');
  const codice = text(dati, 'IdFiscaleIVA/IdCodice');
  const regime = text(dati, 'RegimeFiscale');
  const indirizzo = sede
    ? [
        [text(sede, 'Indirizzo'), text(sede, 'NumeroCivico')].filter(Boolean).join(' '),
        [text(sede, 'CAP'), text(sede, 'Comune'), text(sede, 'Provincia') && `(${text(sede, 'Provincia')})`]
          .filter(Boolean)
          .join(' '),
        text(sede, 'Nazione') && text(sede, 'Nazione') !== 'IT' ? text(sede, 'Nazione') : '',
      ]
        .filter(Boolean)
        .join(', ')
    : '';
  return {
    nome: denominazione || [nome, cognome].filter(Boolean).join(' '),
    partitaIva: codice ? `${paese}${codice}` : '',
    codiceFiscale: text(dati, 'CodiceFiscale'),
    regime,
    regimeLabel: REGIMI_FISCALI[regime] || '',
    indirizzo,
    email: text(node, 'Contatti/Email'),
    telefono: text(node, 'Contatti/Telefono'),
  };
}

function documento(body) {
  const gen = at(body, 'DatiGenerali/DatiGeneraliDocumento');
  const tipo = text(gen, 'TipoDocumento');
  const beni = child(body, 'DatiBeniServizi');
  const linee = children(beni, 'DettaglioLinee').map((l) => ({
    numero: text(l, 'NumeroLinea'),
    codice: children(l, 'CodiceArticolo').map((c) => text(c, 'CodiceValore')).filter(Boolean).join(', '),
    descrizione: text(l, 'Descrizione'),
    quantita: num(text(l, 'Quantita')),
    unitaMisura: text(l, 'UnitaMisura'),
    prezzoUnitario: num(text(l, 'PrezzoUnitario')),
    sconti: children(l, 'ScontoMaggiorazione').map((s) => ({
      tipo: text(s, 'Tipo'),
      percentuale: num(text(s, 'Percentuale')),
      importo: num(text(s, 'Importo')),
    })),
    prezzoTotale: num(text(l, 'PrezzoTotale')),
    aliquota: num(text(l, 'AliquotaIVA')),
    natura: text(l, 'Natura'),
  }));
  const riepilogo = children(beni, 'DatiRiepilogo').map((r) => ({
    aliquota: num(text(r, 'AliquotaIVA')),
    natura: text(r, 'Natura'),
    naturaLabel: NATURE[text(r, 'Natura')] || '',
    imponibile: num(text(r, 'ImponibileImporto')),
    imposta: num(text(r, 'Imposta')),
    esigibilita: text(r, 'EsigibilitaIVA'),
    riferimentoNormativo: text(r, 'RiferimentoNormativo'),
  }));
  const pagamenti = children(body, 'DatiPagamento').flatMap((p) => {
    const condizioni = text(p, 'CondizioniPagamento');
    return children(p, 'DettaglioPagamento').map((d) => ({
      condizioni,
      condizioniLabel: CONDIZIONI_PAGAMENTO[condizioni] || '',
      modalita: text(d, 'ModalitaPagamento'),
      modalitaLabel: MODALITA_PAGAMENTO[text(d, 'ModalitaPagamento')] || '',
      scadenza: text(d, 'DataScadenzaPagamento'),
      importo: num(text(d, 'ImportoPagamento')),
      iban: text(d, 'IBAN'),
      istituto: text(d, 'IstitutoFinanziario'),
      beneficiario: text(d, 'Beneficiario'),
    }));
  });
  const ritenute = children(gen, 'DatiRitenuta').map((r) => ({
    tipo: text(r, 'TipoRitenuta'),
    importo: num(text(r, 'ImportoRitenuta')),
    aliquota: num(text(r, 'AliquotaRitenuta')),
    causale: text(r, 'CausalePagamento'),
  }));
  const cassa = children(gen, 'DatiCassaPrevidenziale').map((c) => ({
    tipo: text(c, 'TipoCassa'),
    aliquota: num(text(c, 'AlCassa')),
    importo: num(text(c, 'ImportoContributoCassa')),
  }));
  const allegati = children(body, 'Allegati').map((a) => ({
    nome: text(a, 'NomeAttachment'),
    formato: text(a, 'FormatoAttachment'),
    descrizione: text(a, 'DescrizioneAttachment'),
    base64: text(a, 'Attachment').replace(/\s+/g, ''),
  }));
  const totaleDichiarato = num(text(gen, 'ImportoTotaleDocumento'));
  const imponibileTot = riepilogo.reduce((s, r) => s + (r.imponibile || 0), 0);
  const impostaTot = riepilogo.reduce((s, r) => s + (r.imposta || 0), 0);
  return {
    tipo,
    tipoLabel: TIPI_DOCUMENTO[tipo] || tipo,
    divisa: text(gen, 'Divisa') || 'EUR',
    data: text(gen, 'Data'),
    numero: text(gen, 'Numero'),
    causale: children(gen, 'Causale').map((c) => c.text.trim()).filter(Boolean),
    bollo: num(text(gen, 'DatiBollo/ImportoBollo')),
    ritenute,
    cassa,
    linee,
    riepilogo,
    pagamenti,
    allegati,
    totaleDichiarato,
    imponibile: round2(imponibileTot),
    imposta: round2(impostaTot),
    // Total computed from the VAT summary, used when the document does not declare one.
    totaleCalcolato: round2(imponibileTot + impostaTot + (num(text(gen, 'DatiBollo/ImportoBollo')) || 0)),
  };
}

function round2(v) {
  return Math.round(v * 100) / 100;
}

/** Parse a FatturaPA XML string. Throws if the file is not an electronic invoice. */
export function parseFattura(xmlString) {
  const root = parseXml(xmlString);
  if (root.local !== 'FatturaElettronica') {
    throw new Error('Il file non sembra una fattura elettronica (manca l’elemento FatturaElettronica).');
  }
  const header = child(root, 'FatturaElettronicaHeader');
  const bodies = children(root, 'FatturaElettronicaBody');
  if (!header || !bodies.length) {
    throw new Error('La fattura è incompleta: mancano intestazione o corpo.');
  }
  return {
    versione: root.attrs.versione || '',
    trasmissione: {
      formato: text(header, 'DatiTrasmissione/FormatoTrasmissione'),
      progressivo: text(header, 'DatiTrasmissione/ProgressivoInvio'),
      codiceDestinatario: text(header, 'DatiTrasmissione/CodiceDestinatario'),
      pecDestinatario: text(header, 'DatiTrasmissione/PECDestinatario'),
    },
    cedente: anagrafica(child(header, 'CedentePrestatore')),
    cessionario: anagrafica(child(header, 'CessionarioCommittente')),
    documenti: bodies.map(documento),
  };
}

export function formatEuro(v, divisa = 'EUR') {
  if (v == null) return '';
  try {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: divisa || 'EUR' }).format(v);
  } catch {
    return `${v.toFixed(2)} ${divisa}`;
  }
}

export function formatData(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso || '';
}
