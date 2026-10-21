/** Careful U.S. state detection: full names anywhere, 2-letter codes only when unambiguous. */
export const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
  DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

const EXTRA_NAMES: Array<[RegExp, string]> = [
  [/\bwashington,?\s*d\.?\s?c\.?\b/i, 'DC'],
  [/\bd\.c\.(?=\s|$|[,.!?])/i, 'DC'],
  [/\bnew york city\b|\bnyc\b/i, 'NY'],
];

/** Codes that are also common English words or abbreviations; only accepted in UPPERCASE with location context. */
const AMBIGUOUS = new Set(['IN', 'ME', 'OR', 'OK', 'OH', 'HI', 'DE', 'LA', 'PA', 'CO', 'AL', 'MA', 'MO', 'ID', 'MS', 'MI', 'NE', 'AR', 'IL', 'GA', 'WA', 'VA', 'MD', 'SC', 'ND', 'UT', 'MT', 'CT', 'IA', 'KS', 'NC']);

export function stateName(code: string): string {
  return STATE_NAMES[code.toUpperCase()] || code;
}

export function normalizeStateInput(value?: string | null): string | undefined {
  if (!value) return undefined;
  const v = String(value).trim();
  if (/^[A-Za-z]{2}$/.test(v) && STATE_NAMES[v.toUpperCase()]) return v.toUpperCase();
  return detectState(v);
}

export function detectState(text: string): string | undefined {
  if (!text) return undefined;
  for (const [re, code] of EXTRA_NAMES) if (re.test(text)) return code;
  // Longest names first so "West Virginia" wins over "Virginia".
  const names = Object.entries(STATE_NAMES).sort((a, b) => b[1].length - a[1].length);
  const lower = text.toLowerCase();
  for (const [code, name] of names) {
    const re = new RegExp(`\\b${name.toLowerCase().replace(/ /g, '\\s+')}\\b`);
    const m = re.exec(lower);
    if (!m) continue;
    if (code === 'WA' && /^\s*,?\s*d\.?\s?c\b/.test(lower.slice(m.index + m[0].length))) return 'DC';
    if (code === 'VA' && /west\s+$/.test(lower.slice(0, m.index))) continue;
    return code;
  }
  // Two-letter codes.
  const re = /(^|[\s,(])([A-Za-z]{2})(?=$|[\s,.!?)])/g;
  let m: RegExpExecArray | null;
  const tokens: Array<{ raw: string; index: number }> = [];
  while ((m = re.exec(text))) tokens.push({ raw: m[2], index: m.index + m[1].length });
  for (const { raw, index } of tokens) {
    const code = raw.toUpperCase();
    if (!STATE_NAMES[code]) continue;
    const before = text.slice(0, index);
    const after = text.slice(index + 2);
    const context = /(,\s*|\bin\s+|\bstate of\s+|\bfrom\s+|\bnear\s+)$/i.test(before) || /^\s*(\d{5})?\s*[.!?]?\s*$/.test(after);
    const isUpper = raw === code;
    if (AMBIGUOUS.has(code)) {
      if (isUpper && context && !/^\s*$/.test(before)) return code;
      continue;
    }
    if (isUpper || context) return code;
  }
  return undefined;
}
