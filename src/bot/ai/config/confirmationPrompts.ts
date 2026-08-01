export const CONFIRMATION_MODE =
  "You are Paperplane, a Discord music bot.\n" +
  "The user's request was already executed — you only send the confirmation text back.\n" +
  "Reply ONLY with the chat text itself: one short casual sentence, 2-6 words, in the user's language.\n" +
  "Output format: the reply text and nothing else. No quotes, no labels, no markdown, max one emoji.\n" +
  "Examples: 'Sip, di-pause ya ⏸️' / 'Lanjut! 🔊' / 'Udah, beres! 👋' / 'Oke, autoplay dimatikan.'";

const REGURGITATION_PATTERNS = [
  /^The user\b/i,
  /^The system\b/i,
  /^The context\b/i,
  /^I would\b/i,
  /^I'm (asked|supposed|here|a)\b/i,
  /^As (an? )?(AI|assistant|Paperplane)\b/i,
  /^You are\b/i,
  /^Your (reply|response|task|job)\b/i,
  /status summary/i,
  /^Based on\b/i,
  /^Given\b/i,
];

export function isRegurgitation(text: string): boolean {
  const t = (text || "").trim();
  if (!t) return true;
  return REGURGITATION_PATTERNS.some((p) => p.test(t));
}

export function normalizeConfirmation(text: string): string {
  const first = (text || "").split("\n")[0].trim();
  return first.length > 140 ? first.slice(0, 137) + "..." : first;
}

const POOLS: Record<string, string[]> = {
  queued: [
    "Siap! ${n} lagu udah masuk antrian 🎶",
    "Done — ${n} track masuk queue, enjoy! 🎧",
    "${n} lagu siap diputar. Selamat menikmati!",
  ],
  queueEmpty: [
    "Antrian kosong nih — mau dengerin apa? 😊",
    "Queue-nya masih kosong. Request lagu dulu yuk!",
    "Belum ada lagu di antrian. Minta satu, gas! 🎵",
  ],
  nothingPlaying: [
    "Belum ada yang diputar nih. Mau request? 🎵",
    "Lagi kosong — belum ada lagu yang jalan.",
    "Nothing playing right now. Ada request?",
  ],
  paused: [
    "Dipause dulu ya ⏸️",
    "Oke, dijeda dulu. Lanjut kapan-kapan!",
    "Paused — lagunya stay di situ.",
  ],
  resumed: [
    "Lanjut! 🔊",
    "Oke, diputar lagi. Gas!",
    "Resumed — lanjut nikmatin musiknya 🎶",
  ],
  alreadyPlaying: [
    "Lagi jalan kok, gas terus aja 🔊",
    "Musiknya udah muter — nggak perlu di-resume 😄",
    "Udah nyala kok, nikmatin aja!",
  ],
  alreadyPaused: [
    "Udah di-pause kok ⏸️",
    "Lagunya emang lagi dijeda — santai.",
    "Udah dipause dari tadi 😄",
  ],
  nothingToResume: [
    "Nggak ada yang di-pause — mau putar lagu? 🎵",
    "Lagi kosong nih, nggak ada yang bisa di-resume.",
    "Gak ada track yang dijeda. Request lagu dulu yuk!",
  ],
  stopped: [
    "Oke, musik dihentikan. See you next request! 👋",
    "Udah kuhentikan. Sampai request berikutnya!",
    "Stopped — beres dulu, sisanya aman.",
  ],
  cleared: [
    "Antrian udah dibersihkan ✅",
    "Queue cleared — fresh start!",
    "Beres, antrian dikosongin.",
  ],
  shuffleOn: [
    "Shuffle on — urutan lagu diacak! 🔀",
    "Mode acak nyala, siap-siap kejutan!",
    "Shuffle aktif — urutan gak bisa ditebak.",
  ],
  shuffleOff: [
    "Shuffle dimatikan ya — urutan balik normal.",
    "Shuffle off, urutan normal lagi.",
    "Oke, acak dimatiin.",
  ],
  loop: [
    "Loop: **${mode}** 🔁",
    "Mode loop diganti ke **${mode}**.",
    "Loop **${mode}** — gak akan kelewat.",
  ],
  autoplayOn: [
    "Autoplay nyala — rekomendasi bakal putar otomatis 🎧",
    "Autoplay aktif, lagu bakal lanjut sendiri!",
    "Auto-play on — gak akan ada hening.",
  ],
  autoplayOff: [
    "Autoplay dimatikan ya.",
    "Autoplay off — berhenti pas queue abis.",
    "Oke, autoplay nonaktif.",
  ],
  stayOn: [
    "Mode 24/7 nyala — bot bakal stay di VC 🛠️",
    "24/7 aktif, bot gak akan cabut!",
    "Stay mode on — diam di voice channel.",
  ],
  stayOff: [
    "Mode 24/7 dimatikan ya.",
    "24/7 off — bot bakal cabut kalo sepi.",
    "Oke, stay mode off.",
  ],
  volume: [
    "Volume sekarang **${vol}%** 🔊",
    "Volume di **${vol}%** sekarang.",
    "Suara di **${vol}%** — mantap.",
  ],
  recommend: [
    "Autoplay nyala — rekomendasi bakal muter kalo queue habis 🎶",
    "Rekomendasi aktif! Lagu bakal lanjut otomatis.",
    "Oke, autoplay buat rekomendasi dinyalain.",
  ],
};

export function fallbackPhrase(poolKey: string, vars: Record<string, string | number> = {}): string {
  const pool = POOLS[poolKey];
  if (!pool?.length) return "Done!";
  const tpl = pool[Math.floor(Math.random() * pool.length)];
  return tpl.replace(/\$\{(\w+)\}/g, (_m, k: string) => (vars[k] !== undefined ? String(vars[k]) : ""));
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise
      .then((v) => { clearTimeout(timer); resolve(v); })
      .catch(() => { clearTimeout(timer); resolve(null); });
  });
}
