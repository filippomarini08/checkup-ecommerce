// Compliance checks for Italian B2C e-commerce sites.
// Works on raw HTML strings so it runs the same in the Worker and in tests.
// These are automatic heuristics, not legal advice: every message says what was (not) found.
import { isValidPartitaIva } from './piva.js';
import { decodeEntities } from './xml.js';

export const ESITI = { OK: 'ok', ATTENZIONE: 'attenzione', MANCA: 'manca', INFO: 'info' };

const HTML_ENTITIES = {
  nbsp: ' ', ndash: '–', mdash: '—', euro: '€', agrave: 'à', egrave: 'è', eacute: 'é',
  igrave: 'ì', ograve: 'ò', ugrave: 'ù', Agrave: 'À', Egrave: 'È', Eacute: 'É', laquo: '«',
  raquo: '»', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', hellip: '…',
  copy: '©', reg: '®', middot: '·', bull: '•', deg: '°', times: '×',
};

function decodeHtml(s) {
  return decodeEntities(String(s).replace(/&([a-zA-Z]+);/g, (m, e) => HTML_ENTITIES[e] ?? m));
}

export function htmlToText(html) {
  return decodeHtml(
    String(html || '')
      .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t ]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

function attr(attrs, name) {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(attrs);
  return m ? decodeHtml(m[2] ?? m[3] ?? m[4] ?? '') : '';
}

/** Links and buttons with their visible text (plus aria-label/title). */
/** Remove blocks whose content is never visible markup (scripts, styles, comments). */
export function stripNonVisible(html) {
  return String(html || '')
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
}

const LOOKS_LIKE_CODE = /[{};]|=>|function\s*\(|\b(let|const|var|return)\s/;

export function extractLinks(html) {
  const out = [];
  const re = /<(a|button)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi;
  const clean = stripNonVisible(html);
  let m;
  while ((m = re.exec(clean))) {
    const visible = htmlToText(m[3]);
    const label = [visible, attr(m[2], 'aria-label'), attr(m[2], 'title')]
      .filter((t) => t && !LOOKS_LIKE_CODE.test(t))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);
    out.push({ tag: m[1].toLowerCase(), href: attr(m[2], 'href'), text: label });
  }
  return out;
}

/** Text to show the user for a matched link: its label, or its address. */
function etichetta(link, max) {
  const t = link.text || link.href || '';
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

const FONTI = {
  recesso: {
    norma: 'Art. 54-bis Codice del consumo (D.Lgs. 209/2025), in vigore per i contratti dal 19 giugno 2026',
    fonte: 'https://www.pmi.it/impresa/normativa/496173/pulsante-recesso-online-obbligatorio-ecommerce.html',
  },
  piva: {
    norma: 'Art. 35, c. 1, DPR 633/1972 e Risoluzione AdE 60/E del 2006',
    fonte: 'https://www.diritto.it/l-indicazione-della-partita-iva-sul-sito-web-e-obbligatoria/',
  },
  odr: {
    norma: 'Regolamento (UE) 2024/3228: piattaforma ODR chiusa dal 20 luglio 2025',
    fonte: 'https://eur-lex.europa.eu/eli/reg/2024/3228/oj/eng',
  },
  prezzo30: {
    norma: 'Art. 17-bis Codice del consumo (D.Lgs. 26/2023)',
    fonte: 'https://www.mimit.gov.it/it/assistenza/domande-frequenti/annunci-di-riduzione-di-prezzo-domande-frequenti-faq',
  },
  gpsr: {
    norma: 'Art. 19 Regolamento (UE) 2023/988 sulla sicurezza generale dei prodotti (GPSR)',
    fonte: 'https://eur-lex.europa.eu/eli/reg/2023/988/oj',
  },
  privacy: {
    norma: 'Art. 13 Regolamento (UE) 2016/679 (GDPR)',
    fonte: 'https://eur-lex.europa.eu/eli/reg/2016/679/oj',
  },
  cookie: { norma: 'Linee guida cookie del Garante privacy (10 giugno 2021)', fonte: '' },
  info: {
    norma: 'Art. 7 D.Lgs. 70/2003 e art. 49 Codice del consumo (informazioni obbligatorie)',
    fonte: '',
  },
  accessibilita: {
    norma: 'D.Lgs. 82/2022 (European Accessibility Act), in vigore dal 28 giugno 2025',
    fonte: '',
  },
};

const CMP_PATTERNS = [
  /iubenda/i, /cookiebot/i, /onetrust/i, /cookieyes/i, /cookie-?script/i, /complianz/i, /usercentrics/i,
  /didomi/i, /axeptio/i, /termly/i, /cookiefirst/i, /consentmanager/i, /quantcast/i, /klaro/i,
  /cookie[-_ ]?(banner|consent|notice|bar)/i, /consent[-_ ]?banner/i, /pandectes/i, /consentmo/i,
];
const TRACKER_PATTERNS = [/googletagmanager\.com/i, /gtag\(/i, /fbq\(/i, /connect\.facebook\.net/i, /hotjar/i, /tiktok\.com\/i18n\/pixel|analytics\.tiktok\.com/i, /clarity\.ms/i];

function check(id, titolo, esito, dettaglio, comeRisolvere, fonteKey) {
  const f = FONTI[fonteKey] || { norma: '', fonte: '' };
  return { id, titolo, esito, dettaglio, comeRisolvere, norma: f.norma, fonte: f.fonte };
}

function findPartitaIva(text) {
  const labelled = /\b(?:p\.?\s?iva|partita\s+iva|vat(?:\s+(?:no\.?|number|id))?)[^\d\n]{0,25}?((?:IT)?\s?\d[\d\s]{9,14}\d)/gi;
  const found = [];
  let m;
  while ((m = labelled.exec(text))) {
    const digits = m[1].replace(/\s+/g, '').replace(/^IT/i, '');
    if (digits.length === 11) found.push(digits);
  }
  if (!found.length) {
    const bare = /\bIT\s?(\d{11})\b/g;
    while ((m = bare.exec(text))) found.push(m[1]);
  }
  return found;
}

/**
 * True only when the page shows an actual struck-through price, or a class that
 * themes add exclusively to discounted items. Theme templates (e.g. Shopify Dawn)
 * always ship an empty "price__sale" block and a compare-at <s>, so class names
 * like those are not evidence of a discount on their own.
 */
export function hasDiscountMarkup(html) {
  const clean = stripNonVisible(html);
  const strike = /<(s|del|strike)\b[^>]*>([\s\S]{0,300}?)<\/\1\s*>/gi;
  let m;
  while ((m = strike.exec(clean))) {
    if (/\d/.test(htmlToText(m[2]))) return true;
  }
  return /class\s*=\s*["'](?:[^"']*\s)?(price--on-sale|onsale|old-price|price-old|was-price)(?:\s[^"']*)?["']/i.test(clean);
}

/**
 * Run all checks.
 * @param {{home: {url: string, html: string}, product?: {url: string, html: string}|null}} pages
 */
export function analizza(pages) {
  const home = pages.home;
  const product = pages.product || null;
  const homeText = htmlToText(home.html);
  const allHtml = [home.html, product ? product.html : ''].join('\n');
  const links = extractLinks(home.html).concat(product ? extractLinks(product.html) : []);
  const linkText = (re) => links.filter((l) => re.test(l.text) || re.test(l.href));
  const risultati = [];

  // 1. HTTPS
  risultati.push(
    /^https:\/\//i.test(home.url)
      ? check('https', 'Connessione sicura (HTTPS)', ESITI.OK, 'Il sito usa HTTPS.', '', '')
      : check('https', 'Connessione sicura (HTTPS)', ESITI.MANCA, 'Il sito non usa HTTPS: i dati di pagamento e di contatto viaggiano in chiaro.', 'Attiva il certificato SSL dal pannello del tuo hosting o della piattaforma e reindirizza tutto su https://.', '')
  );

  // 2. Partita IVA in home page
  const pive = findPartitaIva(homeText);
  const valida = pive.find((p) => isValidPartitaIva(p));
  if (valida) {
    risultati.push(check('partita-iva', 'Partita IVA nella home page', ESITI.OK, `Trovata la partita IVA ${valida}, con codice di controllo corretto.`, '', 'piva'));
  } else if (pive.length) {
    risultati.push(check('partita-iva', 'Partita IVA nella home page', ESITI.ATTENZIONE, `Trovato il numero ${pive[0]}, ma il codice di controllo non torna: potrebbe esserci un errore di battitura.`, 'Controlla il numero sul tuo certificato di attribuzione della partita IVA e correggilo nel footer.', 'piva'));
  } else {
    risultati.push(check('partita-iva', 'Partita IVA nella home page', ESITI.MANCA, 'Non ho trovato la partita IVA nella home page. La sanzione per l’omissione va da 250 a 2.000 euro circa.', 'Aggiungi nel footer di tutte le pagine: ragione sociale, indirizzo e "P.IVA" seguita dal numero.', 'piva'));
  }

  // 3. Funzione di recesso (pulsante)
  const recessoFunzione = linkText(/recedi|recesso\s+(online|qui|dal\s+contratto)|esercita(re)?\s+(il\s+)?(diritto\s+di\s+)?recesso|richied[ia]\s+(il\s+)?recesso|modulo\s+(di\s+)?recesso|withdraw(al)?\s+(button|form|from)|widerruf/i);
  const recessoInfo = linkText(/recesso|resi\b|reso\b|returns?|refund/i);
  if (recessoFunzione.length) {
    risultati.push(check('recesso', 'Funzione di recesso online', ESITI.OK, `Trovato: "${etichetta(recessoFunzione[0], 60)}". Verifica che funzioni senza login e invii una conferma su supporto durevole (email).`, '', 'recesso'));
  } else if (recessoInfo.length) {
    risultati.push(check('recesso', 'Funzione di recesso online', ESITI.ATTENZIONE, `Ho trovato una pagina informativa ("${etichetta(recessoInfo[0], 50)}"), ma non un pulsante o modulo per recedere. Dal 19 giugno 2026 serve una funzione dedicata, accessibile come l’acquisto.`, 'Aggiungi un pulsante "Recedi dal contratto" sempre visibile (per esempio nel footer), che porti a un modulo in due passaggi con conferma via email. Su Shopify esistono app gratuite che lo fanno.', 'recesso'));
  } else {
    risultati.push(check('recesso', 'Funzione di recesso online', ESITI.MANCA, 'Non ho trovato né un pulsante di recesso né una pagina su resi e recesso.', 'Aggiungi la pagina con le condizioni di recesso e un pulsante "Recedi dal contratto" con modulo in due passaggi e conferma via email.', 'recesso'));
  }

  // 4. Condizioni di vendita
  const condizioni = linkText(/condizioni\s+generali|condizioni\s+(di\s+)?vendita|termini\s+(e|&)\s+condizioni|termini\s+(di|del|dei)\s+servizi|termini\s+d.uso|terms\s+(of\s+)?(service|sale)|terms\s*(&|and)\s*conditions|\/policies\/terms-of-service|condizioni-(generali-)?(di-)?vendita|termini-e-condizioni|terms-and-conditions/i);
  risultati.push(
    condizioni.length
      ? check('condizioni', 'Condizioni generali di vendita', ESITI.OK, `Trovato il link "${etichetta(condizioni[0], 50)}".`, '', 'info')
      : check('condizioni', 'Condizioni generali di vendita', ESITI.MANCA, 'Non ho trovato un link alle condizioni di vendita.', 'Pubblica le condizioni generali di vendita (prezzi, consegna, garanzia, recesso) e collegale dal footer e dal checkout.', 'info')
  );

  // 5. Privacy
  const privacy = linkText(/privacy/i);
  risultati.push(
    privacy.length
      ? check('privacy', 'Informativa privacy', ESITI.OK, 'Trovato il link all’informativa privacy.', '', 'privacy')
      : check('privacy', 'Informativa privacy', ESITI.MANCA, 'Non ho trovato un link all’informativa privacy.', 'Pubblica l’informativa privacy e collegala dal footer e dai moduli che raccolgono dati.', 'privacy')
  );

  // 6. Cookie
  const cmp = CMP_PATTERNS.some((re) => re.test(allHtml));
  const trackers = TRACKER_PATTERNS.filter((re) => re.test(allHtml)).length;
  if (cmp) {
    risultati.push(check('cookie', 'Banner cookie', ESITI.OK, 'Ho trovato un sistema di gestione del consenso ai cookie.', '', 'cookie'));
  } else if (trackers) {
    risultati.push(check('cookie', 'Banner cookie', ESITI.MANCA, 'Il sito carica strumenti di tracciamento (per esempio Google o Meta), ma non ho trovato un banner per il consenso.', 'Installa un banner che blocchi i cookie di profilazione finché il visitatore non accetta.', 'cookie'));
  } else {
    risultati.push(check('cookie', 'Banner cookie', ESITI.INFO, 'Non ho trovato né un banner né tracciamenti evidenti. Se usi strumenti di statistica o pubblicità, serve il consenso.', '', 'cookie'));
  }

  // 7. Contatti
  const email = /[\w.+-]+@[\w-]+\.[\w.-]+/.test(homeText) || /href\s*=\s*["']mailto:/i.test(home.html);
  const contattiLink = linkText(/contatt|contact/i);
  risultati.push(
    email || contattiLink.length
      ? check('contatti', 'Contatti del venditore', ESITI.OK, email ? 'Trovato un indirizzo email.' : 'Trovata una pagina contatti.', '', 'info')
      : check('contatti', 'Contatti del venditore', ESITI.ATTENZIONE, 'Non ho trovato un indirizzo email né una pagina contatti.', 'Indica nome dell’impresa, indirizzo e un indirizzo email a cui scriverti direttamente.', 'info')
  );

  // 8. Link ODR obsoleto
  const odr = /ec\.europa\.eu\/consumers\/odr|piattaforma\s+(europea\s+)?(per\s+la\s+risoluzione\s+delle\s+controversie\s+online|odr)/i.test(allHtml);
  risultati.push(
    odr
      ? check('odr', 'Riferimenti alla piattaforma ODR', ESITI.ATTENZIONE, 'Il sito cita ancora la piattaforma ODR, chiusa il 20 luglio 2025.', 'Togli il link e i riferimenti alla piattaforma ODR da sito e condizioni di vendita.', 'odr')
      : check('odr', 'Riferimenti alla piattaforma ODR', ESITI.OK, 'Nessun riferimento alla vecchia piattaforma ODR nelle pagine controllate.', '', 'odr')
  );

  // 9. Prezzo più basso degli ultimi 30 giorni
  const discountHtml = product ? product.html : home.html;
  if (hasDiscountMarkup(discountHtml) || hasDiscountMarkup(home.html)) {
    const indicato = /prezzo\s+(più|piu)\s+basso|ultimi\s+30\s+giorni|30\s+giorni\s+precedenti|lowest\s+price|niedrigster\s+preis/i.test(htmlToText(allHtml));
    risultati.push(
      indicato
        ? check('prezzo-30-giorni', 'Prezzo più basso degli ultimi 30 giorni', ESITI.OK, 'Ci sono prodotti scontati e ho trovato l’indicazione del prezzo più basso degli ultimi 30 giorni.', '', 'prezzo30')
        : check('prezzo-30-giorni', 'Prezzo più basso degli ultimi 30 giorni', ESITI.MANCA, 'Ci sono prezzi barrati o scontati, ma non ho trovato l’indicazione del prezzo più basso degli ultimi 30 giorni.', 'Accanto a ogni sconto mostra "Prezzo più basso degli ultimi 30 giorni" e calcola lo sconto da quel prezzo.', 'prezzo30')
    );
  } else {
    risultati.push(check('prezzo-30-giorni', 'Prezzo più basso degli ultimi 30 giorni', ESITI.INFO, 'Non ho visto prodotti scontati nelle pagine controllate. La regola si applica solo quando annunci uno sconto.', '', 'prezzo30'));
  }

  // 10. Sicurezza prodotti (GPSR)
  if (product) {
    const gpsr = /produttore|fabbricante|manufacturer|persona\s+responsabile|responsabile\s+(ue|ce|nell.unione)|importatore|avvertenze\s+di\s+sicurezza|informazioni\s+(sulla\s+)?sicurezza/i.test(htmlToText(product.html));
    risultati.push(
      gpsr
        ? check('sicurezza-prodotto', 'Informazioni di sicurezza del prodotto', ESITI.OK, 'Nella scheda prodotto ho trovato riferimenti a produttore o sicurezza.', '', 'gpsr')
        : check('sicurezza-prodotto', 'Informazioni di sicurezza del prodotto', ESITI.ATTENZIONE, 'Nella scheda prodotto non ho trovato produttore, responsabile UE o avvertenze.', 'Per i prodotti fisici indica nome e contatti del produttore (e del responsabile UE se il produttore è fuori UE), un identificativo del prodotto e le avvertenze.', 'gpsr')
    );
  } else {
    risultati.push(check('sicurezza-prodotto', 'Informazioni di sicurezza del prodotto', ESITI.INFO, 'Non ho trovato una scheda prodotto da controllare.', '', 'gpsr'));
  }

  // 11. Accessibilità
  const accessibilita = linkText(/accessibilit/i);
  risultati.push(
    accessibilita.length
      ? check('accessibilita', 'Dichiarazione di accessibilità', ESITI.OK, 'Trovato un riferimento all’accessibilità.', '', 'accessibilita')
      : check('accessibilita', 'Dichiarazione di accessibilità', ESITI.INFO, 'Non ho trovato una dichiarazione di accessibilità. Le microimprese (meno di 10 dipendenti e fino a 2 milioni di fatturato) sono esentate; le altre devono pubblicarla.', '', 'accessibilita')
  );

  const valutati = risultati.filter((r) => r.esito !== ESITI.INFO);
  const ok = valutati.filter((r) => r.esito === ESITI.OK).length;
  const punteggio = valutati.length ? Math.round((ok / valutati.length) * 100) : 0;
  return {
    url: home.url,
    paginaProdotto: product ? product.url : null,
    punteggio,
    riepilogo: {
      ok,
      attenzione: risultati.filter((r) => r.esito === ESITI.ATTENZIONE).length,
      manca: risultati.filter((r) => r.esito === ESITI.MANCA).length,
      info: risultati.filter((r) => r.esito === ESITI.INFO).length,
    },
    risultati,
  };
}

/** Pick a same-site product page URL from the home page, if any. */
export function trovaPaginaProdotto(homeUrl, html) {
  const base = new URL(homeUrl);
  for (const l of extractLinks(html)) {
    if (!l.href) continue;
    let u;
    try {
      u = new URL(l.href, base);
    } catch {
      continue;
    }
    if (u.hostname.replace(/^www\./, '') !== base.hostname.replace(/^www\./, '')) continue;
    if (/\/(products|product|prodotto|prodotti)\/[^/?#]+\/?$/i.test(u.pathname)) {
      u.hash = '';
      return u.toString();
    }
  }
  return null;
}
