# Changelog

## 0.1.1 — 2026-11-02
- Corretto: il testo dei link non include più codice JavaScript dei temi (script e stili esclusi prima dell'analisi)
- Corretto: sconti rilevati solo con un prezzo barrato reale o classi usate solo per articoli in saldo; i blocchi vuoti dei temi Shopify non contano più
- Condizioni di vendita: riconosciuti "Termini del servizio" e i link `/policies/terms-of-service` di Shopify
- Partita IVA: riconosciute anche le forme "P. IVA n.", "Partita IVA n°" e simili
- Test di regressione con pagine in stile tema Shopify (17 test)

## 0.1.0 — 2026-11-02
- Check-up con 11 controlli su home page e una scheda prodotto
- Endpoint `/api/check` su Cloudflare Worker con protezione da indirizzi privati
- Lettore di fatture elettroniche XML e P7M (DER, BER e base64), con stampa in PDF e download degli allegati
- 4 guide: pulsante di recesso, prezzo più basso 30 giorni, partita IVA in home page, piattaforma ODR
- Pagina privacy (bozza), 404, robots.txt
- 15 test automatici e workflow GitHub Actions
