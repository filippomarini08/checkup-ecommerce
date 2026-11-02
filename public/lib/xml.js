// Minimal, dependency-free XML parser.
// Enough for FatturaPA documents: elements, attributes, namespaces (kept as prefixes),
// text, CDATA, comments, processing instructions and the standard entities.
// Same code runs in the browser, in Cloudflare Workers and in Node tests.

const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return Object.prototype.hasOwnProperty.call(ENTITIES, e) ? ENTITIES[e] : m;
  });
}

function makeNode(name, attrs) {
  const i = name.indexOf(':');
  return { name, local: i >= 0 ? name.slice(i + 1) : name, attrs, children: [], text: '' };
}

/**
 * Parse an XML string and return the root element.
 * Throws an Error with a readable message on malformed input.
 */
export function parseXml(input) {
  let s = String(input);
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  const stack = [];
  let root = null;
  let i = 0;
  const n = s.length;

  const appendText = (t) => {
    if (stack.length) stack[stack.length - 1].text += t;
  };

  while (i < n) {
    const lt = s.indexOf('<', i);
    if (lt === -1) {
      appendText(decodeEntities(s.slice(i)));
      break;
    }
    if (lt > i) appendText(decodeEntities(s.slice(i, lt)));

    if (s.startsWith('<!--', lt)) {
      const end = s.indexOf('-->', lt + 4);
      if (end === -1) throw new Error('Commento XML non chiuso');
      i = end + 3;
    } else if (s.startsWith('<![CDATA[', lt)) {
      const end = s.indexOf(']]>', lt + 9);
      if (end === -1) throw new Error('Sezione CDATA non chiusa');
      appendText(s.slice(lt + 9, end));
      i = end + 3;
    } else if (s.startsWith('<?', lt)) {
      const end = s.indexOf('?>', lt + 2);
      if (end === -1) throw new Error('Istruzione XML non chiusa');
      i = end + 2;
    } else if (s.startsWith('<!', lt)) {
      const end = s.indexOf('>', lt + 2);
      if (end === -1) throw new Error('Dichiarazione XML non chiusa');
      i = end + 1;
    } else if (s[lt + 1] === '/') {
      const end = s.indexOf('>', lt + 2);
      if (end === -1) throw new Error('Tag di chiusura non terminato');
      const name = s.slice(lt + 2, end).trim();
      const open = stack.pop();
      if (!open || open.name !== name) {
        throw new Error(`Tag di chiusura inatteso </${name}>`);
      }
      i = end + 1;
    } else {
      // Opening tag: find the closing '>' while respecting quoted attribute values.
      let j = lt + 1;
      let quote = null;
      while (j < n) {
        const c = s[j];
        if (quote) {
          if (c === quote) quote = null;
        } else if (c === '"' || c === "'") {
          quote = c;
        } else if (c === '>') {
          break;
        }
        j++;
      }
      if (j >= n) throw new Error('Tag di apertura non terminato');
      let body = s.slice(lt + 1, j);
      const selfClosing = body.endsWith('/');
      if (selfClosing) body = body.slice(0, -1);
      const m = body.match(/^\s*([^\s/>]+)/);
      if (!m) throw new Error('Nome del tag mancante');
      const attrs = {};
      const attrRe = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
      let a;
      const rest = body.slice(m[0].length);
      while ((a = attrRe.exec(rest))) {
        attrs[a[1]] = decodeEntities(a[3] !== undefined ? a[3] : a[4]);
      }
      const node = makeNode(m[1], attrs);
      if (stack.length) stack[stack.length - 1].children.push(node);
      else if (!root) root = node;
      else throw new Error('Il documento ha più di un elemento radice');
      if (!selfClosing) stack.push(node);
      i = j + 1;
    }
  }
  if (stack.length) throw new Error(`Tag non chiuso <${stack[stack.length - 1].name}>`);
  if (!root) throw new Error('Nessun elemento XML trovato');
  return root;
}

/** First direct child with the given local name (namespace prefix ignored). */
export function child(node, local) {
  if (!node) return null;
  return node.children.find((c) => c.local === local) || null;
}

/** All direct children with the given local name. */
export function children(node, local) {
  if (!node) return [];
  return node.children.filter((c) => c.local === local);
}

/** Follow a path like "DatiGenerali/DatiGeneraliDocumento/Numero" and return the trimmed text, or ''. */
export function text(node, path) {
  let cur = node;
  for (const part of path.split('/')) {
    cur = child(cur, part);
    if (!cur) return '';
  }
  return cur.text.trim();
}

/** Follow a path and return the node, or null. */
export function at(node, path) {
  let cur = node;
  for (const part of path.split('/')) {
    cur = child(cur, part);
    if (!cur) return null;
  }
  return cur;
}
