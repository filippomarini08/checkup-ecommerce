# Check-up E-commerce

Sito gratuito con due strumenti per chi vende online in Italia:

1. **Check-up conformità** (`/`): inserisci l'indirizzo di un negozio e ricevi una pagella su 11 obblighi italiani ed europei (pulsante di recesso, prezzo più basso degli ultimi 30 giorni, partita IVA in home page, sicurezza prodotti, link ODR obsoleto, privacy, cookie, contatti, condizioni di vendita, HTTPS, accessibilità).
2. **Lettore di fatture elettroniche** (`/fattura/`): apre file FatturaPA `.xml` e firmati `.p7m`, li mostra come documento leggibile e li salva in PDF. Tutto avviene nel browser, il file non lascia il computer.

Più 4 guide in `/guide/` che portano visite da Google verso il check-up.

> Il check-up è un controllo automatico sulle pagine pubbliche e non è una consulenza legale. Ogni controllo indica la norma di riferimento e una fonte.

## Struttura

```
public/            sito statico (HTML, CSS, JS)
  lib/             logica condivisa: parser XML, fatture, p7m, partita IVA, controlli
  assets/          stile e script delle pagine
  fattura/         lettore di fatture
  guide/           articoli
worker/index.js    Cloudflare Worker: serve il sito e l'endpoint /api/check
scripts/           server locale per sviluppo
test/              test con node:test e file di esempio (fatture, p7m, pagine HTML)
```

Nessuna dipendenza esterna: il codice gira uguale nel browser, nel Worker e in Node.

## Sviluppo

Serve Node 20 o superiore.

```bash
npm test                                   # esegue tutti i test
node scripts/dev-server.js 8787            # sito in locale su http://localhost:8787
FIXTURES=1 node scripts/dev-server.js      # check-up su pagine di esempio, senza internet
```

Con `FIXTURES=1` prova gli indirizzi `negozio-conforme.example` e `negozio-da-sistemare.example`.

## Pubblicazione

Il sito gira su Cloudflare Workers con asset statici (piano gratuito, uso commerciale consentito).

```bash
npx wrangler login     # una volta, con l'account Cloudflare del titolare
npm run deploy
```

Prima della pubblicazione vanno inseriti titolare e partita IVA nel footer di tutte le pagine e nella pagina privacy: cercare il testo `[Titolare`.

## Sicurezza

- L'endpoint `/api/check` accetta solo indirizzi pubblici `http`/`https` sulle porte standard e rifiuta host locali e reti private.
- Le pagine scaricate sono limitate a 2 MB e 10 secondi.
- Nessuna chiave o credenziale nel repository: eventuali segreti vanno nei secret di Cloudflare.

## Licenza

Codice proprietario, tutti i diritti riservati. Vedi `LICENSE`.
