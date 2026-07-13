class CommandInterpreter {
  interpret(input: any) {
    const lower = input.toLowerCase().trim();

    if (/^(?:help|bantuan)\b/i.test(lower)) return { type: "help" };
    if (/^(?:info)\b/i.test(lower)) return { type: "info" };
    if (/^(?:nowplaying|np|lagu sekarang|lagu ini)\b/i.test(lower)) return { type: "nowplaying" };
    if (/^(?:skip|lewati|lompati|lanjut|تخطي)\b/i.test(lower)) return { type: "skip" };
    if (/^(?:stop|berhenti|matikan|setop|إيقاف|قف)\b/i.test(lower)) return { type: "stop" };
    if (/^(?:pause|jeda|tahan|مؤقت|وقف)\b/i.test(lower)) return { type: "pause" };
    if (/^(?:resume|unpause|lanjutkan|mainkan lagi|استئناف|واصل)\b/i.test(lower)) return { type: "resume" };
    if (/^(?:queue|q|antrian|lagu apa|طابور)\b/i.test(lower)) return { type: "queue" };
    if (/^(?:autoplay|auto.?play|putar otomatis)\b/i.test(lower)) return { type: "autoplay" };
    if (/^(?:shuffle|acak)\b/i.test(lower)) return { type: "shuffle" };
    if (/^(?:loop|ulang)\b/i.test(lower)) return { type: "loop" };
    if (/^(?:volume|vol|suara)\b/i.test(lower)) return { type: "volume" };
    if (/^(?:ping)\b/i.test(lower)) return { type: "ping" };
    if (/^(?:247|24\/7)\b/i.test(lower)) return { type: "247" };
    if (/^(?:clear|hapus|bersihkan)\b/i.test(lower)) return { type: "clear" };
    if (/^(?:recommend|rekomendasi|rekomend)\b/i.test(lower)) return { type: "recommend" };

    const playPattern = /^(?:play|p|put on|play me|mainkan|putar|cari|شغل|شغِّل|دندن)\s+(?:lagu|أغنية|اغنية)?\s*(.+)/i;
    const playMatch = input.match(playPattern);
    if (playMatch) return { type: "play", query: playMatch[1].trim() };

    const correctionMatch = lower.match(/(?:bukan|salah|wrong|incorrect|هذا ليس|ليس)\s+(.+)/);
    if (correctionMatch && correctionMatch[1].trim()) return { type: "correct_playlist", keyword: correctionMatch[1].trim() };

    return { type: "chat" };
  }
}

export default CommandInterpreter;
