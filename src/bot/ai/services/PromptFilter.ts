const blockedPatterns = [
  /\b(skripsi|tesis|disertasi|thesis|dissertation)\b.*\b(buat|bantu|tulis|kerjakan|selesaikan|buatkan|tolong|help|make|write|do|complete)\b/i,
  /\b(buat|bantu|tulis|kerjakan|buatkan)\b.*\b(skripsi|tesis|disertasi|makalah|jurnal|paper|artikel|essay|esai|artikel)\b/i,
  /\b(tugas|pr|homework|assignment)\b.*\b(sekolah|kuliah|matematika|fisika|kimia|biologi|sejarah|ekonomi)\b/i,
  /\b(bantu|tolong|help)\b.*\b(tugas|pr|homework|assignment|soal)\b/i,
  /\b(kerjakan|jawab|solve|answer)\b.*\b(soal|question|pertanyaan)\b/i,
  /\b(buat|tulis|buatkan|write|create|buatin|bikinin)\b.*\b(kode|code|program|aplikasi|fungsi|function|script|bot)\b/i,
  /\b(bantu|tolong|help)\b.*\b(coding|ngoding|program|programming|code|debug|error)\b/i,
  /\b(debug|fix|perbaiki|betulin)\b.*\b(kode|code|program|error|bug)\b/i,
  /\b(buatkan|buatin|bikinin|tuliskan)\b.*\b(api|endpoint|server|database|bot|module|plugin)\b/i,
  /\b(write|create|make|do|complete)\b.*\b(code|program|script|function|app|application)\b.*\b(for|in|using)\b/i,
  /\b(help|can you).*(homework|assignment|project|task|essay)\b/i,
  /\b(selesaikan|hitung|calculate|solve)\b.*\b(persamaan|equation|integral|turunan|derivative|matrix|kalkulus|calculus)\b/i,
  /\b(buat|tulis|buatkan)\b.*\b(cv|resume|curriculum vitae|surat lamaran|cover letter)\b/i,
];

const allowedContext = [
  /\b(putar|play|search|cari|lagu|musik|song|music|judul|title|artist|genre|band|album|penyanyi|penyany)\b.*\b(code|program|skripsi|tugas)\b/i,
  /\b(code|kode|program|skripsi|tugas)\b.*\b(lagu|musik|song|playlist|album|denger|dengar|nyanyi|nyany)\b/i,
  /\b(lagu|musik|song|playlist|music)\b/i,
  /\b(nyanyi|denger|dengar|recommend|rekomendasi|rekomend)\b/i,
  /\b(putar|play|lantun|mainkan|nyanyiin|nyanyiin)\b/i,
];

export type FilterResult = {
  blocked: boolean;
  reason?: string;
};

export function checkPrompt(prompt: string): FilterResult {
  const normalized = prompt.toLowerCase();

  for (const pattern of blockedPatterns) {
    if (pattern.test(normalized)) {
      return { blocked: true, reason: "Sorry, I can't help with academic work, coding, or homework." };
    }
  }

  for (const allow of allowedContext) {
    if (allow.test(normalized)) return { blocked: false };
  }

  return { blocked: false };
}
