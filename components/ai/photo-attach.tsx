"use client"

import { useRef } from "react"
import Image from "next/image"
import { ImagePlus, X } from "lucide-react"

/** Groq's vision model takes at most 5 images and 20MB per request. */
const MAX_IMAGES = 5
const MAX_BYTES = 4 * 1024 * 1024

/**
 * Raster formats only, verified against the vision model rather than assumed.
 * JPEG, PNG and WebP are accepted; SVG comes back as "invalid image data", so
 * an `image/*` filter would let owners attach a file the assistant can only
 * fail to read — and the failure is silent, degrading to a text-only answer.
 */
const ACCEPTED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"]

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

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList) return
    const incoming: PendingImage[] = []
    for (const file of Array.from(fileList)) {
      if (images.length + incoming.length >= MAX_IMAGES) {
        onError(`You can attach up to ${MAX_IMAGES} photos.`)
        break
      }
      if (!ACCEPTED_TYPES.includes(file.type.toLowerCase())) {
        onError(`${file.name} isn't a supported image — use a JPEG, PNG or WebP photo.`)
        continue
      }
      if (file.size > MAX_BYTES) {
        onError(`${file.name} is too large — 4MB max.`)
        continue
      }
      incoming.push({ id: `${file.name}-${file.lastModified}-${Math.random()}`, file, previewUrl: URL.createObjectURL(file) })
    }
    if (incoming.length > 0) onChange([...images, ...incoming])
    if (inputRef.current) inputRef.current.value = "" // let the same file be re-picked
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        aria-label="Attach a photo"
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
      >
        <ImagePlus className="h-5 w-5" />
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
