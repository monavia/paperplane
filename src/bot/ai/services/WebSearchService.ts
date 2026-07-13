import Logger from "../../core/utils/Logger";

interface SearchResult {
  title: string; url: string; snippet: string;
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&#x2F;/g, "/").trim();
}

function extractDdgResults(html: string): SearchResult[] {
  const results: SearchResult[] = [];
  const blocks = html.split(`class="result__body"`);
  for (let i = 1; i < blocks.length && results.length < 5; i++) {
    const block = blocks[i];
    const urlMatch = block.match(/uddg=(https?[^"&]+)/);
    const titleMatch = block.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/);
    const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
    if (urlMatch) {
      results.push({
        url: decodeURIComponent(urlMatch[1]),
        title: titleMatch ? stripHtml(titleMatch[1]) : "No title",
        snippet: snippetMatch ? stripHtml(snippetMatch[1]) : "No description",
      });
    }
  }
  return results;
}

async function searchDdg(query: string): Promise<SearchResult[] | null> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 10000);
  try {
    const r = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      signal: c.signal,
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    });
    clearTimeout(t);
    if (!r.ok) return null;
    const results = extractDdgResults(await r.text());
    return results.length ? results : null;
  } catch { clearTimeout(t); return null; }
}

export async function searchWeb(query: string): Promise<string> {
  const results = await searchDdg(query);
  if (!results) return "No search results found.";
  return results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`).join("\n\n");
}
