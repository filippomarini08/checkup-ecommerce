const form = document.getElementById('form');
const input = document.getElementById('url');
const btn = document.getElementById('go');
const out = document.getElementById('esito');

const LABEL = { ok: 'In regola', attenzione: 'Da verificare', manca: 'Non trovato', info: 'Informazione' };

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else e.setAttribute(k, v);
  }
  for (const k of kids) if (k != null && k !== '') e.append(k);
  return e;
}

function render(r) {
  out.replaceChildren();
  const host = (() => {
    try { return new URL(r.url).hostname; } catch { return r.url; }
  })();
  const { ok, attenzione, manca } = r.riepilogo;
  out.append(
    el('h2', {}, `Risultato per ${host}`),
    el('div', { class: 'score' },
      el('div', { class: 'num' }, `${r.punteggio}%`),
      el('div', { class: 'meta' },
        `${ok} ${ok === 1 ? 'controllo' : 'controlli'} in regola, ${attenzione} da verificare, ${manca} non ${manca === 1 ? 'trovato' : 'trovati'}.`,
        el('br'),
        r.paginaProdotto ? `Pagine controllate: home e una scheda prodotto.` : 'Pagina controllata: home (nessuna scheda prodotto trovata).'
      )
    )
  );
  const order = { manca: 0, attenzione: 1, ok: 2, info: 3 };
  const list = el('ul', { class: 'checks' });
  for (const c of [...r.risultati].sort((a, b) => order[a.esito] - order[b.esito])) {
    const li = el('li', { class: `check ${c.esito}` },
      el('h3', {}, c.titolo, el('span', { class: 'badge' }, LABEL[c.esito] || c.esito)),
      el('p', {}, c.dettaglio)
    );
    if (c.comeRisolvere) li.append(el('p', { class: 'fix' }, el('strong', {}, 'Come sistemare: '), c.comeRisolvere));
    if (c.norma) {
      const law = el('p', { class: 'law' }, c.norma);
      if (c.fonte) law.append(' · ', el('a', { href: c.fonte, target: '_blank', rel: 'noopener' }, 'fonte'));
      li.append(law);
    }
    list.append(li);
  }
  out.append(list, el('p', { class: 'note' }, 'Controllo automatico sulle pagine pubbliche: non è una consulenza legale.'));
  out.hidden = false;
  out.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const url = input.value.trim();
  if (!url) {
    input.focus();
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Controllo in corso…';
  out.hidden = false;
  out.replaceChildren(el('p', { class: 'muted' }, 'Sto leggendo le pagine del negozio, ci vogliono pochi secondi…'));
  try {
    const res = await fetch(`/api/check?url=${encodeURIComponent(url)}`);
    const data = await res.json();
    if (!res.ok || data.errore) throw new Error(data.errore || 'Errore imprevisto.');
    render(data);
    history.replaceState(null, '', `?url=${encodeURIComponent(url)}`);
  } catch (e) {
    out.replaceChildren(el('p', { class: 'alert' }, e.message || 'Non sono riuscito a controllare il sito.'));
  } finally {
    btn.disabled = false;
    btn.textContent = 'Controlla gratis';
  }
});

const preset = new URLSearchParams(location.search).get('url');
if (preset) {
  input.value = preset;
  form.requestSubmit();
}
