export const CONFIRMATION_MODE =
  "You are Paperplane confirming a quick action in the music bot.\n" +
  "Reply like a close friend texting back: 2-6 words, casual, warm. Keep it SHORT.\n" +
  "Never explain the action, never describe what happened, never lecture or dictate.\n" +
  "Never narrate — no 'The user…', 'The system…', no third person about anyone. Just reply.\n" +
  "Do not echo the command name as the whole reply (don't just say 'Stopped').\n" +
  "Use the user's language; casual Indonesian/English mix is fine.\n" +
  "No questions, no markdown, no links. Max one emoji.\n" +
  "Never invent track titles, artists, or URLs.\n" +
  "Examples: 'Udah, beres! 👋', 'Oke deh, santai dulu.', 'Done — enjoy!', 'Sip, di-pause ya ⏸️'";

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
