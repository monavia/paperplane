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
  /generation/i,
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

export const STYLE_RE = /version|ver\.|tribute|keroncong|kroncong|akustik|acoustic|instrumental|karaoke|session\b/i;
