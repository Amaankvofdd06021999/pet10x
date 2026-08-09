"use client"

import { useRef, useState } from "react"
import Image from "next/image"
import { toast } from "sonner"
import { Camera, Loader2, Trash2 } from "lucide-react"
import { usePetPhotos, addPetPhoto, deletePetPhoto } from "@/lib/data"

/**
 * A pet's photos.
 *
 * The app stored exactly one image per pet on `pets.image_url`, so a second
 * photo replaced the first. That column stays as the avatar — every card, list
 * and the emergency page read it — and this is the album beside it. The first
 * photo uploaded is mirrored into the avatar, and deleting the avatar promotes
 * the next one rather than leaving a broken reference.
 */
export function PetPhotoGallery({ petId }: { petId: string }) {
  const { data: photos, isLoading, refetch } = usePetPhotos(petId)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    setBusy(true)
    // Sequential, not Promise.all: each upload also reads the current count to
    // decide the sort order and whether it becomes the avatar, and racing them
    // would give several photos the same position.
    let failed = 0
    for (const f of files) {
      const { error } = await addPetPhoto(petId, f)
      if (error) failed += 1
    }
    setBusy(false)
    if (input.current) input.current.value = ""
    if (failed > 0) toast.error(`${failed} photo${failed === 1 ? "" : "s"} couldn't be uploaded`)
    else toast.success(files.length === 1 ? "Photo added" : `${files.length} photos added`)
    refetch()
  }

  async function remove(id: string) {
    const { error } = await deletePetPhoto(id)
    if (error) return toast.error("Couldn't remove", { description: error })
    toast("Photo removed")
    refetch()
  }

  return (
    <section className="mb-5">
      <div className="mb-2.5 flex items-center justify-between">
        <h3 className="text-[15px] font-semibold text-foreground">Photos</h3>
        <button
          onClick={() => input.current?.click()}
          disabled={busy}
          className="flex items-center gap-1.5 text-[13px] font-semibold text-primary disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />} Add
        </button>
      </div>

      <input ref={input} type="file" accept="image/*" multiple onChange={pick} className="hidden" aria-hidden />

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : photos.length === 0 ? (
        <button
          onClick={() => input.current?.click()}
          className="flex w-full flex-col items-center gap-1 rounded-2xl border border-dashed border-border bg-card px-4 py-8"
        >
          <Camera className="h-6 w-6 text-muted-foreground" />
          <span className="text-[13px] font-semibold text-foreground">Add photos</span>
          <span className="text-[12px] text-muted-foreground">The first becomes their profile picture</span>
        </button>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p, i) => (
            <div key={p.id} className="relative aspect-square overflow-hidden rounded-xl bg-muted">
              {p.url ? (
                <Image src={p.url} alt={p.caption ?? ""} fill className="object-cover" unoptimized />
              ) : (
                <span className="flex h-full w-full items-center justify-center">
                  <Camera className="h-5 w-5 text-muted-foreground" />
                </span>
              )}
              {i === 0 && (
                <span className="absolute left-1 top-1 rounded-full bg-foreground/70 px-1.5 py-0.5 text-[9px] font-semibold text-background">
                  Profile
                </span>
              )}
              <button
                onClick={() => remove(p.id)}
                aria-label="Remove photo"
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-foreground/70 text-background"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
