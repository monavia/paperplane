const THAI_RE = /[\u0E00-\u0E7F]/;

export function hasThai(s: string): boolean {
  return THAI_RE.test(s);
}

const BRACKET_RE = /[「」『』〔〕【】《》〈〉]/g;
const CJK_PUNCT_RE = /[，。：！？；、（）]/g;

export function normalizeFullWidth(s: string): string {
  return s.normalize("NFKC").replace(BRACKET_RE, " ").replace(CJK_PUNCT_RE, " ").replace(/\s{2,}/g, " ").trim();
}

const THAI_MAP: Record<string, string> = {
  "ก": "k",
  "ข": "kh",
  "ฃ": "kh",
  "ค": "kh",
  "ฅ": "kh",
  "ฆ": "kh",
  "ง": "ng",
  "จ": "ch",
  "ฉ": "ch",
  "ช": "ch",
  "ซ": "s",
  "ฌ": "ch",
  "ญ": "y",
  "ฎ": "d",
  "ฏ": "t",
  "ฐ": "th",
  "ฑ": "th",
  "ฒ": "th",
  "ณ": "n",
  "ด": "d",
  "ต": "t",
  "ถ": "th",
  "ท": "th",
  "ธ": "th",
  "น": "n",
  "บ": "b",
  "ป": "p",
  "ผ": "ph",
  "ฝ": "f",
  "พ": "ph",
  "ฟ": "f",
  "ภ": "ph",
  "ม": "m",
  "ย": "y",
  "ร": "r",
  "ล": "l",
  "ว": "w",
  "ศ": "s",
  "ษ": "s",
  "ส": "s",
  "ห": "h",
  "ฬ": "l",
  "ฮ": "h",
  "ะ": "a",
  "ั": "a",
  "า": "a",
  "ำ": "am",
  "ิ": "i",
  "ี": "i",
  "ึ": "ue",
  "ื": "ue",
  "ุ": "u",
  "ู": "u",
  "เ": "e",
  "แ": "ae",
  "โ": "o",
  "ใ": "ai",
  "ไ": "ai",
  "ฤ": "ru",
  "ฦ": "lu",
};

const THAI_BLOCK_RE = /[\u0E00-\u0E7F]/;

function romanize(s: string, soft: boolean): string {
  let out = "";
  for (const ch of s) {
    if (ch in THAI_MAP) {
      let r = THAI_MAP[ch];
      if (soft && r === "kh") r = "k";
      if (soft && r === "ph") r = "p";
      if (soft && r === "th") r = "t";
      if (soft && ch === "ญ") r = "ch";
      if (soft && r === "ae") r = "a";
      out += r;
      continue;
    }
    // Keep non-Thai script (latin digits etc.) verbatim; drop unmapped Thai marks.
    if (!THAI_BLOCK_RE.test(ch)) out += ch;
  }
  return out;
}

// Thai names whose naive char-order romanization diverges from their accepted
// RTGS rendering (vowel-prefix order, silent ย์, final-consonant shifts).
// Full-name match only — used as an override for the generic romanizer.
const THAI_NAME_OVERRIDES: Record<string, string[]> = {
  "พระมหาไพรวัลย์": ["phramahaphraiwan", "pramahaphraiwan"],
};

export function toLatinCandidates(s: string): string[] {
  if (!hasThai(s)) return [s];
  const override = THAI_NAME_OVERRIDES[s.trim()];
  if (override) return [...override];
  const strict = romanize(s, false);
  const loose = romanize(s, true);
  const out: string[] = [strict];
  if (loose !== strict) out.push(loose);
  return out;
}

const NORM_RE = /[^a-z]/g;

function norm(s: string): string {
  return s.toLowerCase().replace(NORM_RE, "");
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

// Approximate equality for cross-script names (Thai vs romanized Latin).
// Used ONLY where a Thai term could otherwise never line-token-match its Latin rendering.
export function romanizedApproxEqual(a: string, b: string): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const longer = na.length >= nb.length ? na : nb;
  const shorter = na.length >= nb.length ? nb : na;
  if (shorter.length >= 5 && longer.includes(shorter)) return true;
  if (Math.abs(na.length - nb.length) > 2) return false;
  return levenshtein(na, nb) <= 2;
}