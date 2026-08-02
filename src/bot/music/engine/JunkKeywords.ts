export const CLICKBAIT_PATTERNS = [
  /jangan\s+(di\s+)?(play|nonton|skip|putar)/i,
  /mau\s+menangis/i,
  /bikin\s+(nangis|menangis)/i,
  /don'?t\s+(cry|watch|skip)/i,
  /warning/i,
  /galau/i,
  /sakit\s+hati/i,
  /sedih\s+banget/i,
  /\bshaun\s+the\s+sheep\b/i,
];

export const EVENT_PATTERNS = [
  /wedding/i,
  /anniversary/i,
  /dies\s*natalis/i,
  /happy\s*party/i,
  /paguron/i,
  /brothehood/i,
  /community/i,
  /senenan/i,
  /pernikahan/i,
  /khitanan/i,
  /syukuran/i,
  /panaga/i,
  /\bsmk\s*n\b/i,
  /\bsmp\s*n\b/i,
  /\bsma\s*n\b/i,
];

export const REUPLOAD_RE = /kembar\s+campursari|mp3\s+download|full\s+album|lagu\s+galau\s+terbaru/i;

export const POST_OFFICIAL_RE = /\(\s*official\s*(?:music\s*video|mv|live\s*music)\s*\)\s*[)\s-]*[a-z]{3,}/i;

export const AUTHOR_OFFICIAL_RE = /official\s*(?:mv|music\s*video)/i;

export const STYLE_RE = /version|ver\.|tribute|keroncong|kroncong|akustik|acoustic|instrumental|karaoke|session\b|\blive\b|\bkonser\b|\bconcert\b|\bunplugged\b|ไลฟ์|라이브|ライブ|คอนเสิร์ต|演唱会/i;

// gaya/seni non-Latin (KR/CN/JP/AR/TH) — weight 1 (soft): bantu turunkan ranking remix/cover/live
export const STYLE_ML_RE = /(?:翻唱|伴奏|卡拉OK|커버|리믹스|노래방|라이브|カバー|リミックス|ライブ|カラオケ|ريمكس|كاريوكي|คัฟเวอร์|รีมิกซ์|คาราโอเกะ)/i;

// versi instrumen — nama instrumen HANYA di dalam kurung (hindari false positive "Piano Man"/"Solo"),
// plus kata non-Latin instrumental yang tidak ambigu (演奏/纯音乐/연주/บรรเลง)
export const INSTRUMENT_RE = /\((?:[^()]*\b(?:violin|piano|guitar|sax(?:ophone)?|cello|flute|harp|ukulele|kalimba|recorder|trumpet|banjo|mandolin|solo)\b[^()]*)\)|演奏|纯音乐|연주|บรรเลง/i;

// live/konser/concert markers (EN/ID + TH/KR/JP/CN) — deprioritize live/concert uploads
export const LIVE_RE = /\b(?:live|konser|concert|unplugged|mtv|session|performance)\b|คอนเสิร์ต|สด|ไลฟ์|콘서트|라이브|コンサート|ライブ|演唱会|直播|现场/i;

// 1 hit = berat (weight 3, langsung block di autoplay): reupload lyrics + frasa editorial/news-channel
export const HARD_JUNK_RE = /(?:^|[^\w])(?:lyrics?|lirik|가사|歌词|歌詞|字幕|中字|자막|كلمات|เนื้อเพลง|बोल|lời bài hát|vietsub|kan\/rom\/eng|engsub)(?:[^\w]|$)|facts?\s+(?:about|of|on|behind)\b|you\s+should\s+know|everything\s+about|behind\s+the\s+scenes|documentary|explained|top\s+\d+|interview\b|podcast|lecture|seminar|audiobook|뉴스|팩트|순위|사연|新闻|故事|解说|盘点|排名|ニュース|解説|ランキング|まとめ|事実|أخبار|قصة|حقائق|شرح|ข่าว|เรื่องราว/i;

// ringan (weight 1): butuh kombinasi biar block — hindari false positive (How to Save a Life, Story of My Life, #Beautiful)
export const SOFT_JUNK_RE = /#[\p{L}\p{N}_]{3,}|how\s+to\b|story\s+of\b|news\b|update\b|review\b|reaction\b|ranking\b|recap\b|teaser\b|trailer\b|controversy\b|episode\b|season\b|\d+\s*(?:화|회|集|話)|حلقة\s*\d+|ตอน(?:\s*ที่)?\s*\d+/iu;
