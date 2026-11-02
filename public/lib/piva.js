// Italian VAT number (partita IVA) checksum, as defined for the 11-digit code.

export function isValidPartitaIva(value) {
  const s = String(value || '').replace(/^IT/i, '').replace(/\s+/g, '');
  if (!/^\d{11}$/.test(s)) return false;
  if (/^0{11}$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    let d = s.charCodeAt(i) - 48;
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  const check = (10 - (sum % 10)) % 10;
  return check === s.charCodeAt(10) - 48;
}
