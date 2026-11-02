# Changelog

## 0.2.0 — 2026-11-02
- Titolare indicato nel footer e nella pagina privacy (con diritti dell'interessato e hosting)
- Se il dominio non risponde, il check-up riprova con o senza `www.`
- Messaggi chiari quando il sito blocca i controlli automatici (403, 429, 503) o risponde 404
- Contatti: riconosciuti anche assistenza clienti, supporto, help, telefono e WhatsApp
- Recesso: riconosciute le pagine "rimborsi" e "restituzioni"
- Le etichette dei link non vengono più ripetute due volte
- 19 test automatici

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
