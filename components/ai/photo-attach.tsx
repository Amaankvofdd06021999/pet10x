"use client"

import { useRef, useState } from "react"
import Image from "next/image"
import { ImagePlus, Loader2, X } from "lucide-react"
import { PICKER_ACCEPT, prepareChatImage } from "@/lib/ai/image"

/** Groq's vision model takes at most 5 images and 20MB per request. */
const MAX_IMAGES = 5

export interface PendingImage {
  id: string
  file: File
  previewUrl: string
}

interface PhotoAttachProps {
  images: PendingImage[]
  onChange: (images: PendingImage[]) => void
  onError: (message: string) => void
  disabled?: boolean
}

/** The composer's attach button. Uploading happens on send, not on pick. */
export function PhotoAttachButton({ images, onChange, onError, disabled }: PhotoAttachProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [preparing, setPreparing] = useState(false)

  /**
   * Photos are normalised at pick time, not at send time — a 12MP HEIC becomes
   * a right-sized JPEG here. Doing it now means the thumbnail renders even on
   * browsers that can't display HEIC, and send stays fast.
   */
  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList) return
    const room = MAX_IMAGES - images.length
    if (room <= 0) {
      onError(`You can attach up to ${MAX_IMAGES} photos.`)
      return
    }
    const picked = Array.from(fileList)
    if (picked.length > room) onError(`You can attach up to ${MAX_IMAGES} photos.`)

    setPreparing(true)
    const incoming: PendingImage[] = []
    for (const original of picked.slice(0, room)) {
      const { file, error } = await prepareChatImage(original)
      if (error) {
        onError(error)
        continue
      }
      incoming.push({
        id: `${file.name}-${file.lastModified}-${Math.random()}`,
        file,
        previewUrl: URL.createObjectURL(file),
      })
    }
    setPreparing(false)

    if (incoming.length > 0) onChange([...images, ...incoming])
    if (inputRef.current) inputRef.current.value = "" // let the same file be re-picked
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={PICKER_ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || preparing}
        aria-label="Attach a photo"
        aria-busy={preparing}
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
      >
        {preparing ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
      </button>
    </>
  )
}

/** Thumbnail strip above the composer. */
export function PhotoAttachPreview({ images, onChange }: Pick<PhotoAttachProps, "images" | "onChange">) {
  if (images.length === 0) return null

  const remove = (id: string) => {
    const target = images.find((i) => i.id === id)
    if (target) URL.revokeObjectURL(target.previewUrl)
    onChange(images.filter((i) => i.id !== id))
  }

  return (
    <div className="flex flex-wrap gap-2 px-1 pb-2">
      {images.map((image) => (
        <div key={image.id} className="relative h-16 w-16 overflow-hidden rounded-xl border border-border bg-muted">
          <Image src={image.previewUrl} alt="" fill className="object-cover" unoptimized />
          <button
            type="button"
            onClick={() => remove(image.id)}
            aria-label="Remove photo"
            className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-foreground/70 text-background"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  )
}
