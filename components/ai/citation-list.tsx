"use client"

import { ExternalLink } from "lucide-react"
import type { Citation } from "@/lib/ai/types"

/**
 * Link cards under an answer.
 *
 * These are links out, never excerpts — both publishers are copyrighted and
 * prohibit reproduction, so the owner clicks through to read the source.
 */
export function CitationList({ citations }: { citations: Citation[] }) {
  if (citations.length === 0) return null

  return (
    <div className="mt-2.5">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Veterinary references
      </p>
      <div className="flex flex-col gap-1.5">
        {citations.map((citation) => (
          <a
            key={citation.url}
            href={citation.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-2 rounded-xl card-interactive p-2.5 transition-colors hover:shadow-float"
          >
            <ExternalLink className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-accent" />
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2 text-[12px] font-medium leading-snug text-foreground">{citation.title}</span>
              <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{citation.source}</span>
            </span>
          </a>
        ))}
      </div>
    </div>
  )
}
