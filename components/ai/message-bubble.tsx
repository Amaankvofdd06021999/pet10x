"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { Loader2, PawPrint, ShieldAlert } from "lucide-react"
import { petFileSignedUrls } from "@/lib/supabase/storage"
import { AnswerText } from "./answer-text"
import { CitationList } from "./citation-list"
import { EmergencyCard } from "./emergency-card"
import type { ChatTurn } from "@/lib/ai/client"

const DISCLAIMER = "Pet10x gives general information, not veterinary advice. For anything urgent, call your vet."

export function MessageBubble({ turn }: { turn: ChatTurn }) {
  if (turn.role === "user") return <UserBubble turn={turn} />
  return <AssistantBubble turn={turn} />
}

function UserBubble({ turn }: { turn: ChatTurn }) {
  const urls = useSignedUrls(turn.imagePaths)

  return (
    <div className="flex justify-end">
      <div className="max-w-[85%]">
        {urls.length > 0 && (
          <div className="mb-1.5 flex flex-wrap justify-end gap-1.5">
            {urls.map((url) => (
              <div key={url} className="relative h-28 w-28 overflow-hidden rounded-xl bg-muted">
                <Image src={url} alt="Attached photo" fill className="object-cover" unoptimized />
              </div>
            ))}
          </div>
        )}
        {turn.content && (
          <div className="rounded-2xl rounded-br-md bg-primary-strong px-3.5 py-2.5">
            <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-primary-strong-foreground">{turn.content}</p>
          </div>
        )}
      </div>
    </div>
  )
}

function AssistantBubble({ turn }: { turn: ChatTurn }) {
  // An emergency renders as a card and nothing else — no prose to soften it.
  if (turn.emergency) {
    return (
      <div className="flex gap-2.5">
        <Avatar emergency />
        <div className="min-w-0 flex-1">
          <EmergencyCard card={turn.emergency} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-2.5">
      <Avatar />
      <div className="min-w-0 flex-1">
        <div className="rounded-2xl rounded-tl-md card-raised px-3.5 py-2.5">
          {turn.error ? (
            <p className="text-[14px] leading-relaxed text-destructive">{turn.error}</p>
          ) : turn.content ? (
            // Compound writes markdown regardless of what the prompt asks, so
            // the answer is parsed rather than printed raw.
            <AnswerText text={turn.content} />
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {/* Compound fetches live sources mid-answer, so name the wait. */}
              <span className="text-[13px]">{turn.status ?? "Thinking…"}</span>
            </div>
          )}

          {turn.content && !turn.streaming && !turn.error && (
            <p className="mt-2 border-t border-border pt-2 text-[10px] leading-relaxed text-muted-foreground">
              {DISCLAIMER}
            </p>
          )}
        </div>

        <CitationList citations={turn.citations} />
      </div>
    </div>
  )
}

function Avatar({ emergency = false }: { emergency?: boolean }) {
  return (
    <span
      className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
        emergency ? "bg-destructive" : "bg-accent"
      }`}
    >
      {emergency ? (
        <ShieldAlert className="h-4 w-4 text-destructive-foreground" />
      ) : (
        <PawPrint className="h-4 w-4 text-accent-foreground" strokeWidth={2.5} />
      )}
    </span>
  )
}

/** pet-media is private, so attachments render through short-lived signed URLs. */
function useSignedUrls(paths: string[]): string[] {
  const [urls, setUrls] = useState<string[]>([])

  useEffect(() => {
    if (paths.length === 0) {
      setUrls([])
      return
    }
    let cancelled = false
    void petFileSignedUrls(paths).then((map) => {
      if (!cancelled) setUrls(paths.map((p) => map[p]).filter(Boolean))
    })
    return () => {
      cancelled = true
    }
  }, [paths])

  return urls
}
