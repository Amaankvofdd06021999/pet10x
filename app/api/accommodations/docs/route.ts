import { NextResponse } from "next/server"
import { getSupabaseServerClient } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

/**
 * Record an uploaded accommodation document, and remove one.
 *
 * WHY THIS ROUTE EXISTS AND THE BROWSER DOES NOT CALL THE RPC DIRECTLY.
 * 20260827000004 leaves `accommodation-docs` with exactly ONE policy, a SELECT.
 * A client session therefore cannot delete a storage object, and two ordinary
 * things a resident does require exactly that:
 *
 *   * replacing a document — the unique index on (request_id, kind) means the
 *     row is overwritten, and the object the old row pointed at is now
 *     unreferenced;
 *   * removing one before submitting.
 *
 * Without this route both leave the doctor's letter in the bucket with nothing
 * pointing at it. The daily sweep would eventually take it, but "eventually"
 * is the wrong answer to "I deleted that".
 *
 * The RPC still does the authorising. This route calls it through the CALLER'S
 * OWN SESSION, not the admin client, so `auth.uid()` inside
 * `record_accommodation_document` is the resident and every check in it applies
 * unchanged. The service role is used for one thing only: deleting the bytes
 * the RPC has just told us are unreferenced.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const KINDS = new Set(["esa_letter", "provider_license", "vaccination", "other"] as const)
type Kind = "esa_letter" | "provider_license" | "vaccination" | "other"

/** Record a file that has just been PUT to a signed URL. */
export async function POST(request: Request) {
  const supabase = await getSupabaseServerClient()
  if (!supabase) return NextResponse.json({ ok: false, error: "Not configured." }, { status: 503 })
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 })

  const body = (await request.json().catch(() => null)) as {
    requestId?: string
    kind?: string
    path?: string
    label?: string
    mime?: string
    size?: number
  } | null

  if (!body?.requestId || !body.kind || !body.path) {
    return NextResponse.json({ ok: false, error: "requestId, kind and path are required." }, { status: 400 })
  }
  if (!UUID.test(body.requestId) || !KINDS.has(body.kind as Kind)) {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 })
  }

  const { data, error } = await supabase.rpc("record_accommodation_document", {
    p_request: body.requestId,
    p_kind: body.kind as Kind,
    p_path: body.path,
    // These three carry SQL defaults of null, so `undefined` lets the default
    // apply. The generated Args type renders a defaulted parameter as optional
    // and non-nullable, and passing an explicit `null` through it is a type
    // error rather than the no-op it looks like.
    p_label: body.label ?? undefined,
    p_mime: body.mime ?? undefined,
    p_size: typeof body.size === "number" ? Math.trunc(body.size) : undefined,
  })
  if (error) return NextResponse.json({ ok: false, error: "Couldn't save that document." }, { status: 502 })

  const result = data as unknown as { ok?: boolean; error?: string; document_id?: string; replaced_path?: string | null }
  if (!result?.ok) {
    return NextResponse.json({ ok: false, error: result?.error ?? "unknown" }, { status: result?.error === "forbidden" ? 403 : 400 })
  }

  // The superseded object, if the replacement landed on a different path.
  // Failure here is deliberately NOT an error to the caller: the row is
  // correct, the new file is in place, and the sweep is the backstop for the
  // orphan. Telling the resident their upload failed because a cleanup did
  // would be a false statement about what happened.
  if (result.replaced_path) {
    try {
      await getSupabaseAdmin().storage.from("accommodation-docs").remove([result.replaced_path])
    } catch {
      /* swept later */
    }
  }

  return NextResponse.json({ ok: true, documentId: result.document_id })
}

/** Remove a document the resident attached, row and object together. */
export async function DELETE(request: Request) {
  const supabase = await getSupabaseServerClient()
  if (!supabase) return NextResponse.json({ ok: false, error: "Not configured." }, { status: 503 })
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 })

  const body = (await request.json().catch(() => null)) as { documentId?: string } | null
  if (!body?.documentId || !UUID.test(body.documentId)) {
    return NextResponse.json({ ok: false, error: "documentId is required." }, { status: 400 })
  }

  // Read it through the CALLER'S session, so accomdoc_select decides what they
  // can see, and then delete through it too, so accomdoc_delete decides what
  // they may remove — the owning resident, before a decision. The service role
  // never chooses the row; it only removes the bytes of a row RLS has let go.
  const { data: doc } = await supabase
    .from("accommodation_documents")
    .select("id, storage_path")
    .eq("id", body.documentId)
    .maybeSingle()
  if (!doc) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 })

  const { error: delError, count } = await supabase
    .from("accommodation_documents")
    .delete({ count: "exact" })
    .eq("id", body.documentId)
  if (delError) return NextResponse.json({ ok: false, error: "Couldn't remove that document." }, { status: 502 })
  // RLS filters rather than raises: a delete the policy refuses matches zero
  // rows and returns no error. Treating that as success would tell the
  // resident their letter is gone while it is still on a manager's checklist.
  if (!count) {
    return NextResponse.json({ ok: false, error: "That document can no longer be removed." }, { status: 403 })
  }

  if (doc.storage_path) {
    try {
      await getSupabaseAdmin().storage.from("accommodation-docs").remove([doc.storage_path])
    } catch {
      /* swept later */
    }
  }
  return NextResponse.json({ ok: true })
}
