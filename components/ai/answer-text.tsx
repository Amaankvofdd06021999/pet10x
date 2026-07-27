"use client"

import { Fragment, type ReactNode } from "react"

/**
 * Pet10x — assistant answer rendering.
 *
 * `groq/compound` writes markdown whatever the system prompt asks of it —
 * bold labels, bullet lists, the occasional heading. Rendering the raw string
 * showed owners literal `**asterisks**`, so this turns the subset Compound
 * actually emits into real elements.
 *
 * Deliberately hand-rolled rather than a markdown dependency: the input is a
 * language model's output, so the safe move is to build React nodes from a
 * known-small grammar and drop anything unrecognised. Nothing here can inject
 * HTML — there is no dangerouslySetInnerHTML.
 */

interface Block {
  kind: "paragraph" | "heading" | "bullets" | "numbers"
  lines: string[]
}

export function AnswerText({ text, className = "" }: { text: string; className?: string }) {
  const blocks = parseBlocks(text)

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {blocks.map((block, i) => {
        if (block.kind === "heading") {
          return (
            <p key={i} className="text-[14px] font-semibold leading-relaxed text-foreground">
              <Inline text={block.lines[0]} />
            </p>
          )
        }
        if (block.kind === "bullets" || block.kind === "numbers") {
          const List = block.kind === "bullets" ? "ul" : "ol"
          return (
            <List
              key={i}
              className={`flex flex-col gap-1 pl-4 text-[14px] leading-relaxed text-foreground ${
                block.kind === "bullets" ? "list-disc" : "list-decimal"
              }`}
            >
              {block.lines.map((line, j) => (
                <li key={j} className="pl-0.5">
                  <Inline text={line} />
                </li>
              ))}
            </List>
          )
        }
        return (
          <p key={i} className="text-[14px] leading-relaxed text-foreground">
            <Inline text={block.lines.join(" ")} />
          </p>
        )
      })}
    </div>
  )
}

/** Groups raw lines into paragraphs, headings and lists. */
function parseBlocks(text: string): Block[] {
  const blocks: Block[] = []
  let current: Block | null = null

  const flush = () => {
    if (current) blocks.push(current)
    current = null
  }

  for (const raw of text.split("\n")) {
    const line = raw.trim()

    if (!line) {
      flush()
      continue
    }

    const heading = /^#{1,6}\s+(.*)$/.exec(line)
    if (heading) {
      flush()
      blocks.push({ kind: "heading", lines: [heading[1]] })
      continue
    }

    // A lone bolded line reads as a heading — Compound's usual section label.
    const boldOnly = /^\*\*(.+?)\*\*:?$/.exec(line)
    if (boldOnly) {
      flush()
      blocks.push({ kind: "heading", lines: [boldOnly[1]] })
      continue
    }

    const bullet = /^[-*•]\s+(.*)$/.exec(line)
    if (bullet) {
      if (current?.kind !== "bullets") {
        flush()
        current = { kind: "bullets", lines: [] }
      }
      current.lines.push(bullet[1])
      continue
    }

    const numbered = /^\d+[.)]\s+(.*)$/.exec(line)
    if (numbered) {
      if (current?.kind !== "numbers") {
        flush()
        current = { kind: "numbers", lines: [] }
      }
      current.lines.push(numbered[1])
      continue
    }

    if (current?.kind !== "paragraph") {
      flush()
      current = { kind: "paragraph", lines: [] }
    }
    current.lines.push(line)
  }

  flush()
  return blocks
}

/**
 * Inline emphasis. `**bold**` and `_italic_` only — the rest of markdown is
 * left as written rather than half-supported.
 */
function Inline({ text }: { text: string }): ReactNode {
  const parts: ReactNode[] = []
  const pattern = /\*\*(.+?)\*\*|__(.+?)__|(?<![\w*])[*_](?![\s*_])(.+?)(?<![\s*_])[*_](?![\w*])/g
  let last = 0
  let match: RegExpExecArray | null
  let key = 0

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push(<Fragment key={key++}>{text.slice(last, match.index)}</Fragment>)
    const bold = match[1] ?? match[2]
    if (bold !== undefined) {
      parts.push(
        <strong key={key++} className="font-semibold">
          {bold}
        </strong>,
      )
    } else {
      parts.push(<em key={key++}>{match[3]}</em>)
    }
    last = match.index + match[0].length
  }

  if (last < text.length) parts.push(<Fragment key={key++}>{text.slice(last)}</Fragment>)
  return <>{parts}</>
}
