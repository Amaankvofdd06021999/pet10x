"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowLeft, ArrowUp, MessageSquarePlus, Square } from "lucide-react"
import { toast } from "sonner"
import { IOSNavBar } from "@/components/ios-nav-bar"
import { MessageBubble } from "@/components/ai/message-bubble"
import { PetContextSwitcher } from "@/components/ai/pet-context-switcher"
import { ConsentDialog } from "@/components/ai/consent-dialog"
import { PhotoAttachButton, PhotoAttachPreview, type PendingImage } from "@/components/ai/photo-attach"
import { usePets } from "@/lib/data"
import {
  loadConversation,
  sendChatMessage,
  uploadChatImages,
  useAiConsent,
  type ChatTurn,
} from "@/lib/ai/client"

const STARTERS = [
  "What should I watch for as my pet gets older?",
  "Is this food a good choice for my pet?",
  "How often should my pet see a vet?",
  "What are early signs of dental disease?",
]

interface AiChatScreenProps {
  onBack: () => void
  /** Pre-selects the pet when entered from a pet's own screen. */
  petId?: string
  /** Resumes an existing thread. */
  conversationId?: string
}

export function AiChatScreen({ onBack, petId, conversationId: initialConversationId }: AiChatScreenProps) {
  const { data: pets } = usePets()
  const consent = useAiConsent()

  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [input, setInput] = useState("")
  const [images, setImages] = useState<PendingImage[]>([])
  const [selectedPetId, setSelectedPetId] = useState<string | null>(petId ?? null)
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId ?? null)
  const [isSending, setSending] = useState(false)
  const [showConsent, setShowConsent] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  /**
   * Default to the owner's first pet so the very first question already has a
   * chart behind it, rather than answering generically.
   *
   * Applied exactly once. `null` is a legitimate choice — it is what "General
   * question" means — so this must not treat it as "not chosen yet", or picking
   * general immediately snaps back to the first pet and the option is dead.
   */
  const didDefaultPet = useRef(false)
  useEffect(() => {
    if (didDefaultPet.current) return
    if (petId || initialConversationId) {
      didDefaultPet.current = true
      return
    }
    if (pets.length > 0) {
      setSelectedPetId(pets[0].id)
      didDefaultPet.current = true
    }
  }, [pets, petId, initialConversationId])

  useEffect(() => {
    if (!consent.isLoading && !consent.hasConsented) setShowConsent(true)
  }, [consent.isLoading, consent.hasConsented])

  // Resume a thread.
  useEffect(() => {
    if (!initialConversationId) return
    let cancelled = false
    void loadConversation(initialConversationId).then((result) => {
      if (cancelled || !result) return
      // A resumed thread carries its own pet — including none, for a thread
      // that was asked generally.
      didDefaultPet.current = true
      setSelectedPetId(result.conversation.petId)
      setTurns(
        result.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          imagePaths: m.imagePaths,
          citations: m.citations,
          triageLevel: m.triageLevel,
        })),
      )
    })
    return () => {
      cancelled = true
    }
  }, [initialConversationId])

  // Pin to the newest turn as tokens arrive.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [turns])

  useEffect(() => () => abortRef.current?.abort(), [])

  const updateLastAssistant = useCallback((patch: (turn: ChatTurn) => ChatTurn) => {
    setTurns((prev) => {
      const next = [...prev]
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i].role === "assistant") {
          next[i] = patch(next[i])
          break
        }
      }
      return next
    })
  }, [])

  const handleSend = useCallback(
    async (override?: string) => {
      const text = (override ?? input).trim()
      if ((!text && images.length === 0) || isSending) return

      if (!consent.hasConsented) {
        setShowConsent(true)
        return
      }

      setSending(true)
      setInput("")

      // Photos need a pet to hang off — pet-media paths are keyed by pet id.
      let uploadedPaths: string[] = []
      if (images.length > 0) {
        const target = selectedPetId ?? pets[0]?.id
        if (!target) {
          toast.error("Add a pet before attaching photos.")
          setSending(false)
          return
        }
        const { paths, error } = await uploadChatImages(
          target,
          images.map((i) => i.file),
        )
        if (error) {
          toast.error(error)
          setSending(false)
          return
        }
        uploadedPaths = paths
        for (const image of images) URL.revokeObjectURL(image.previewUrl)
        setImages([])
      }

      const userTurn: ChatTurn = {
        id: `local-${Date.now()}`,
        role: "user",
        content: text,
        imagePaths: uploadedPaths,
        citations: [],
        triageLevel: null,
      }
      const assistantTurn: ChatTurn = {
        id: `local-${Date.now()}-a`,
        role: "assistant",
        content: "",
        imagePaths: [],
        citations: [],
        triageLevel: null,
        streaming: true,
      }
      setTurns((prev) => [...prev, userTurn, assistantTurn])

      const controller = new AbortController()
      abortRef.current = controller

      try {
        await sendChatMessage({
          message: text,
          petId: selectedPetId,
          conversationId,
          imagePaths: uploadedPaths,
          signal: controller.signal,
          onEvent: (event) => {
            switch (event.type) {
              case "meta":
                setConversationId(event.conversationId)
                updateLastAssistant((t) => ({ ...t, triageLevel: event.triage }))
                break
              case "status":
                updateLastAssistant((t) => ({ ...t, status: event.text }))
                break
              case "delta":
                updateLastAssistant((t) => ({ ...t, content: t.content + event.text, status: undefined }))
                break
              case "citations":
                updateLastAssistant((t) => ({ ...t, citations: event.citations }))
                break
              case "emergency":
                updateLastAssistant((t) => ({ ...t, emergency: event.card, streaming: false }))
                break
              case "done":
                updateLastAssistant((t) => ({ ...t, streaming: false, status: undefined }))
                break
              case "error":
                if (event.message === "consent_required") {
                  setShowConsent(true)
                  setTurns((prev) => prev.slice(0, -2))
                } else {
                  updateLastAssistant((t) => ({ ...t, streaming: false, status: undefined, error: event.message }))
                }
                break
            }
          },
        })
      } catch (err) {
        // An aborted send is the owner pressing stop, not a failure.
        if ((err as Error)?.name !== "AbortError") {
          updateLastAssistant((t) => ({
            ...t,
            streaming: false,
            status: undefined,
            error: "The assistant couldn't answer just now.",
          }))
        } else {
          updateLastAssistant((t) => ({ ...t, streaming: false, status: undefined }))
        }
      } finally {
        abortRef.current = null
        setSending(false)
      }
    },
    [input, images, isSending, consent.hasConsented, selectedPetId, conversationId, pets, updateLastAssistant],
  )

  const handleNewThread = () => {
    abortRef.current?.abort()
    setTurns([])
    setConversationId(null)
    setInput("")
  }

  const selectedPet = pets.find((p) => p.id === selectedPetId) ?? null

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <IOSNavBar
        title="Ask Pet10x"
        largeTitle={false}
        leftAction={
          <button onClick={onBack} className="-ml-2 flex items-center gap-0.5 p-2 text-primary" aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </button>
        }
        rightAction={
          <button
            onClick={handleNewThread}
            className="p-2 text-primary disabled:opacity-40"
            disabled={turns.length === 0}
            aria-label="New conversation"
          >
            <MessageSquarePlus className="h-5 w-5" />
          </button>
        }
      />

      {pets.length > 1 && (
        <div className="border-b border-border bg-background px-4 pb-2.5">
          <PetContextSwitcher pets={pets} selectedPetId={selectedPetId} onSelect={setSelectedPetId} />
        </div>
      )}

      <div ref={scrollRef} className="ios-scroll flex-1 overflow-y-auto px-4 pb-4 pt-4">
        {turns.length === 0 ? (
          <EmptyState petName={selectedPet?.name ?? null} onPick={(q) => void handleSend(q)} disabled={isSending} />
        ) : (
          <div className="flex flex-col gap-4">
            {turns.map((turn) => (
              <MessageBubble key={turn.id} turn={turn} />
            ))}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="sticky bottom-0 border-t border-border bg-card/95 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2.5 backdrop-blur-xl md:pb-3">
        <PhotoAttachPreview images={images} onChange={setImages} />

        <div className="flex items-end gap-1.5">
          <PhotoAttachButton
            images={images}
            onChange={setImages}
            onError={(m) => toast.error(m)}
            disabled={isSending}
          />

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              const el = e.target
              el.style.height = "auto"
              el.style.height = `${Math.min(el.scrollHeight, 140)}px`
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                void handleSend()
              }
            }}
            rows={1}
            placeholder={selectedPet ? `Ask about ${selectedPet.name}…` : "Ask about your pet…"}
            className="max-h-[140px] min-h-[38px] flex-1 resize-none rounded-2xl border border-border bg-background px-3.5 py-2 text-[14px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50"
          />

          {isSending ? (
            <button
              onClick={() => abortRef.current?.abort()}
              aria-label="Stop"
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-muted text-foreground"
            >
              <Square className="h-4 w-4" fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={() => void handleSend()}
              disabled={!input.trim() && images.length === 0}
              aria-label="Send"
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform active:scale-95 disabled:opacity-30"
            >
              <ArrowUp className="h-5 w-5" strokeWidth={2.5} />
            </button>
          )}
        </div>

        {/* Persistent, not per-message — the composer says it every time. */}
        <p className="mt-1.5 px-1 text-center text-[10px] leading-relaxed text-muted-foreground">
          Information only, not veterinary advice. In an emergency, call your vet.
        </p>
      </div>

      <ConsentDialog
        open={showConsent}
        // The dialog is fully controlled, so accepting has to close it here —
        // recording consent alone leaves it open on screen.
        onAccept={async () => {
          const ok = await consent.accept()
          if (ok) setShowConsent(false)
          return ok
        }}
        // Declining is the only path that leaves the assistant. A failed save
        // is not a decline: it keeps the dialog open so the owner can retry.
        onDecline={() => {
          setShowConsent(false)
          onBack()
        }}
      />
    </div>
  )
}

function EmptyState({
  petName,
  onPick,
  disabled,
}: {
  petName: string | null
  onPick: (question: string) => void
  disabled: boolean
}) {
  return (
    <div className="flex flex-col items-center pt-8 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-[26px]">🐾</span>
      <h2 className="mt-3 text-[18px] font-semibold text-foreground">
        {petName ? `Ask about ${petName}` : "Ask about your pet"}
      </h2>
      <p className="mt-1 max-w-[22rem] text-[13px] leading-relaxed text-muted-foreground">
        {petName
          ? `I can see ${petName}'s chart — vaccinations, medications and care log — and I'll cite the veterinary references I read.`
          : "Questions about food, behaviour, or preventive care. Answers cite the veterinary references they came from."}
      </p>

      <div className="mt-5 flex w-full max-w-md flex-col gap-2">
        {STARTERS.map((starter) => (
          <button
            key={starter}
            onClick={() => onPick(starter)}
            disabled={disabled}
            className="rounded-2xl border border-border bg-card px-3.5 py-2.5 text-left text-[13px] text-foreground transition-colors hover:border-primary/40 disabled:opacity-50"
          >
            {starter}
          </button>
        ))}
      </div>
    </div>
  )
}
