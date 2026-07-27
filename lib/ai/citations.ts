import "server-only"

import type { ExecutedTool } from "./provider"
import { groundingDomains } from "./router"

/**
 * Pet10x — citations.
 *
 * Compound reports what it actually read in `executed_tools`. We map that into
 * link cards rendered under the answer. Nothing from either publisher is copied
 * into our database: this is retrieval-and-link, which is what keeps the
 * feature clear of both sites' terms.
 */

export interface Citation {
  title: string
  url: string
  /** Display label for the publisher, derived from the host. */
  source: string
}

const SOURCE_LABELS: Record<string, string> = {
  "veterinarypartner.vin.com": "VIN Veterinary Partner",
  "vin.com": "VIN Veterinary Partner",
  "merckvetmanual.com": "Merck Veterinary Manual",
  "msdvetmanual.com": "MSD Veterinary Manual",
}

/**
 * Extracts citations from the tools Compound ran.
 *
 * Results are filtered to the pinned domains. Compound occasionally reaches
 * beyond `include_domains`, and an answer that cites a random blog under a
 * "cited from veterinary references" banner is worse than one that cites
 * nothing — so anything off-domain is dropped rather than shown.
 */
export function extractCitations(executedTools: ExecutedTool[]): Citation[] {
  const allowed = groundingDomains()
  const out: Citation[] = []
  const seen = new Set<string>()

  for (const tool of executedTools) {
    for (const result of collectResults(tool)) {
      if (!result.url) continue
      let host: string
      try {
        host = new URL(result.url).hostname.replace(/^www\./, "")
      } catch {
        continue
      }
      if (!allowed.some((d) => host === d || host.endsWith(`.${d}`))) continue
      if (seen.has(result.url)) continue
      seen.add(result.url)
      out.push({
        title: cleanTitle(result.title) || sourceLabel(host),
        url: result.url,
        source: sourceLabel(host),
      })
    }
  }
  return out.slice(0, 6)
}

/**
 * Groq has shipped search results under a few shapes across versions —
 * a typed `search_results.results` array, and a JSON string in `output`.
 * Both are read so a format change degrades to no citations, never a crash.
 */
function collectResults(tool: ExecutedTool): { title?: string; url?: string }[] {
  const structured = tool.search_results?.results
  if (Array.isArray(structured) && structured.length > 0) return structured

  if (typeof tool.output === "string" && tool.output.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(tool.output) as {
        results?: { title?: string; url?: string }[]
        search_results?: { results?: { title?: string; url?: string }[] }
      }
      return parsed.results ?? parsed.search_results?.results ?? []
    } catch {
      return []
    }
  }
  return []
}

function sourceLabel(host: string): string {
  if (SOURCE_LABELS[host]) return SOURCE_LABELS[host]
  const match = Object.keys(SOURCE_LABELS).find((d) => host.endsWith(`.${d}`))
  return match ? SOURCE_LABELS[match] : host
}

function cleanTitle(title?: string): string {
  if (!title) return ""
  // Publishers suffix their own name; the source label already carries it.
  return title
    .replace(/\s*[|\-–]\s*(VIN|Veterinary Partner|Merck Veterinary Manual|MSD Veterinary Manual).*$/i, "")
    .trim()
    .slice(0, 120)
}
