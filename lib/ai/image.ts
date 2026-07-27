"use client"

/**
 * Pet10x — preparing a photo for the assistant.
 *
 * Two problems, one answer. iPhones shoot HEIC, which Groq's vision model
 * rejects outright (verified: `image/heic` and `image/heif` both fail), and a
 * modern phone photo is 3–12MB and 4000px wide, which is far more than the
 * model needs and slow to upload on mobile data.
 *
 * So everything is decoded and re-encoded as a right-sized JPEG before it ever
 * reaches storage. That converts HEIC as a side effect of the same pass, and it
 * means the preview thumbnail renders on browsers that cannot display HEIC.
 */

/** Long edge, in pixels. Comfortably past what the vision model resolves. */
const MAX_EDGE = 1600
const JPEG_QUALITY = 0.85

/** What we let a picker hand us. HEIC is included so iPhone files are pickable. */
export const PICKER_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"

/** What may reach Groq. HEIC is deliberately absent — it is converted first. */
const UPLOADABLE = ["image/jpeg", "image/png", "image/webp"]

/** Generous: this is the ceiling on the *original*, before we shrink it. */
const MAX_SOURCE_BYTES = 25 * 1024 * 1024
/** Anything already small and in a good format skips re-encoding entirely. */
const PASSTHROUGH_BYTES = 1024 * 1024

function isHeic(file: File): boolean {
  const type = file.type.toLowerCase()
  if (type === "image/heic" || type === "image/heif") return true
  // Some browsers hand over an empty MIME type for HEIC picked from Files.
  return !type && /\.hei[cf]$/i.test(file.name)
}

function looksLikeImage(file: File): boolean {
  return file.type.toLowerCase().startsWith("image/") || isHeic(file)
}

export interface PreparedImage {
  file: File
  error: string | null
}

/**
 * Normalises one picked file into something the model can actually read.
 *
 * Conversion happens in the browser via `createImageBitmap`, which uses the
 * platform's own decoders — so HEIC works wherever the OS understands it,
 * which is precisely the Apple devices that produce HEIC in the first place.
 * Anywhere it can't be decoded the owner gets a plain instruction rather than
 * a silent failure later in the vision hop.
 */
export async function prepareChatImage(file: File): Promise<PreparedImage> {
  if (!looksLikeImage(file)) {
    return { file, error: `${file.name} isn't an image — attach a photo instead.` }
  }
  if (file.size > MAX_SOURCE_BYTES) {
    return { file, error: `${file.name} is too large — ${Math.round(MAX_SOURCE_BYTES / 1024 / 1024)}MB max.` }
  }

  const alreadyFine = UPLOADABLE.includes(file.type.toLowerCase()) && file.size <= PASSTHROUGH_BYTES
  if (alreadyFine) return { file, error: null }

  try {
    const converted = await toJpeg(file)
    return { file: converted, error: null }
  } catch {
    if (isHeic(file)) {
      return {
        file,
        error: "This browser can't read HEIC photos. In iPhone Settings → Camera → Formats, choose “Most Compatible”, or attach a JPEG.",
      }
    }
    // A readable format we somehow failed to re-encode: send the original
    // rather than blocking the owner, provided the model can accept it.
    if (UPLOADABLE.includes(file.type.toLowerCase()) && file.size <= MAX_SOURCE_BYTES) {
      return { file, error: null }
    }
    return { file, error: `Couldn't prepare ${file.name} — try a different photo.` }
  }
}

/** Decode → scale to fit MAX_EDGE → re-encode as JPEG. */
async function toJpeg(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("canvas unavailable")
    // Photos of a rash or a label are the point; flatten onto white so a
    // transparent PNG doesn't become a black rectangle in JPEG.
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(bitmap, 0, 0, width, height)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    )
    if (!blob) throw new Error("encode failed")

    return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.jpg`, {
      type: "image/jpeg",
      lastModified: file.lastModified,
    })
  } finally {
    bitmap.close()
  }
}
