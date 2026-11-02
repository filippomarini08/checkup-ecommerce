// Extracts the signed XML from a CAdES ".p7m" file (PKCS#7 / CMS SignedData),
// handling DER and BER (indefinite lengths, chunked OCTET STRINGs) and base64-wrapped files.
// No signature verification is done: the goal is only to read the invoice.

function readNode(bytes, pos, depth = 0) {
  if (depth > 64) throw new Error('Struttura ASN.1 troppo profonda');
  if (pos >= bytes.length) throw new Error('Fine inattesa del file firmato');
  const first = bytes[pos];
  const cls = first >> 6;
  const constructed = (first & 0x20) !== 0;
  let number = first & 0x1f;
  let p = pos + 1;
  if (number === 0x1f) {
    number = 0;
    let b;
    do {
      if (p >= bytes.length) throw new Error('Tag ASN.1 non valido');
      b = bytes[p++];
      number = (number << 7) | (b & 0x7f);
    } while (b & 0x80);
  }
  if (p >= bytes.length) throw new Error('Lunghezza ASN.1 mancante');
  let lenByte = bytes[p++];
  let len;
  if (lenByte === 0x80) {
    len = -1; // indefinite
  } else if (lenByte & 0x80) {
    const count = lenByte & 0x7f;
    if (count > 4) throw new Error('Lunghezza ASN.1 non supportata');
    len = 0;
    for (let k = 0; k < count; k++) len = len * 256 + bytes[p++];
  } else {
    len = lenByte;
  }
  const node = { cls, constructed, number, contentStart: p, contentEnd: 0, end: 0, children: null };
  if (!constructed) {
    if (len < 0) throw new Error('Lunghezza indefinita su un valore primitivo');
    node.contentEnd = p + len;
    node.end = node.contentEnd;
    if (node.end > bytes.length) throw new Error('File firmato troncato');
    return node;
  }
  node.children = [];
  if (len >= 0) {
    const stop = p + len;
    if (stop > bytes.length) throw new Error('File firmato troncato');
    while (p < stop) {
      const c = readNode(bytes, p, depth + 1);
      node.children.push(c);
      p = c.end;
    }
    node.contentEnd = stop;
    node.end = stop;
  } else {
    while (true) {
      if (p + 1 >= bytes.length) throw new Error('File firmato troncato');
      if (bytes[p] === 0 && bytes[p + 1] === 0) {
        node.contentEnd = p;
        node.end = p + 2;
        break;
      }
      const c = readNode(bytes, p, depth + 1);
      node.children.push(c);
      p = c.end;
    }
  }
  return node;
}

function octets(bytes, node) {
  if (!node.constructed) return bytes.subarray(node.contentStart, node.contentEnd);
  const parts = node.children.map((c) => octets(bytes, c));
  const total = parts.reduce((s, x) => s + x.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const part of parts) {
    out.set(part, o);
    o += part.length;
  }
  return out;
}

const SIGNED_DATA_OID = [0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x07, 0x02];

function isSignedDataOid(bytes, node) {
  if (node.constructed || node.number !== 6) return false;
  const v = bytes.subarray(node.contentStart, node.contentEnd);
  return v.length === SIGNED_DATA_OID.length && v.every((b, i) => b === SIGNED_DATA_OID[i]);
}

function maybeBase64(bytes) {
  const head = Math.min(bytes.length, 4096);
  for (let i = 0; i < head; i++) {
    const c = bytes[i];
    const ok =
      (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) ||
      c === 43 || c === 47 || c === 61 || c === 10 || c === 13 || c === 32;
    if (!ok) return null;
  }
  const str = new TextDecoder('ascii').decode(bytes).replace(/[^A-Za-z0-9+/=]/g, '');
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function indexOfSeq(bytes, seq, from = 0) {
  outer: for (let i = from; i <= bytes.length - seq.length; i++) {
    for (let j = 0; j < seq.length; j++) if (bytes[i + j] !== seq[j]) continue outer;
    return i;
  }
  return -1;
}

const enc = new TextEncoder();

/** Last-resort extraction: slice from "<?xml" (or the root tag) to the closing root tag. */
function scanForXml(bytes) {
  let start = indexOfSeq(bytes, enc.encode('<?xml'));
  if (start < 0) start = indexOfSeq(bytes, enc.encode('FatturaElettronica'));
  if (start < 0) return null;
  while (start > 0 && bytes[start] !== 0x3c) start--;
  const closeTag = enc.encode('FatturaElettronica>');
  let end = -1;
  let p = start;
  while (true) {
    const k = indexOfSeq(bytes, closeTag, p);
    if (k < 0) break;
    end = k + closeTag.length;
    p = k + 1;
  }
  if (end < 0) return null;
  return bytes.subarray(start, end);
}

/** Return the XML bytes contained in a .p7m file. Throws if nothing usable is found. */
export function extractFromP7m(input) {
  let bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const decoded = maybeBase64(bytes);
  if (decoded && decoded.length) bytes = decoded;
  try {
    const root = readNode(bytes, 0);
    if (root.constructed && root.children.length >= 2 && isSignedDataOid(bytes, root.children[0])) {
      const signedData = root.children[1].children && root.children[1].children[0];
      const encap = signedData && signedData.children && signedData.children[2];
      const explicit = encap && encap.children && encap.children[1];
      const content = explicit && explicit.children && explicit.children[0];
      if (content && content.number === 4) return octets(bytes, content);
    }
  } catch {
    // fall through to the byte scan
  }
  const found = scanForXml(bytes);
  if (found) return found;
  throw new Error('Non trovo la fattura dentro il file .p7m. Il file potrebbe essere danneggiato.');
}

/** Decode XML bytes honouring the encoding declared in the prolog. */
export function decodeXmlBytes(bytes) {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 200));
  const m = /encoding\s*=\s*["']([^"']+)["']/i.exec(head);
  const declared = m ? m[1].toLowerCase() : 'utf-8';
  const label = /8859-1|latin|1252/.test(declared) ? 'windows-1252' : 'utf-8';
  return new TextDecoder(label).decode(bytes);
}
