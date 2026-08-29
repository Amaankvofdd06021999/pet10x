"use client"

import { useState } from "react"
import { Receipt, Plus } from "lucide-react"
import type { ClinicMembership } from "@/lib/data/clinic/context"
import { useInvoices, setInvoiceStatus, invoiceFromVisit } from "@/lib/data/clinic/shop"
import { formatMoney, formatDateShort } from "@/lib/data/clinic/time"
import {
  SectionCard, Spinner, LoadError, EmptyState, Button, Pill,
  SegmentedTabs, Toolbar, StatTile,
} from "@/components/screens/shared/ui"

type View = "open" | "paid" | "estimates"

const STATUS_TONE: Record<string, "neutral" | "good" | "warn" | "bad" | "info"> = {
  draft: "neutral",
  sent: "warn",
  approved: "info",
  paid: "good",
  void: "neutral",
}

export function ClinicBillingScreen({ clinic }: { clinic: ClinicMembership }) {
  const invoices = useInvoices(clinic.businessId)
  const [view, setView] = useState<View>("open")
  const [busy, setBusy] = useState<string | null>(null)

  const rows = invoices.data.filter((i) => {
    if (view === "estimates") return i.kind === "estimate"
    if (view === "paid") return i.status === "paid"
    return i.kind === "invoice" && i.status !== "paid" && i.status !== "void"
  })

  const outstanding = invoices.data
    .filter((i) => i.kind === "invoice" && (i.status === "sent" || i.status === "approved"))
    .reduce((sum, i) => sum + i.totalCents - i.paidCents, 0)
  const takenToday = invoices.data
    .filter((i) => i.status === "paid" && i.issuedOn === new Date().toISOString().slice(0, 10))
    .reduce((sum, i) => sum + i.paidCents, 0)

  async function move(id: string, status: string) {
    setBusy(id)
    const res = await setInvoiceStatus(id, status)
    setBusy(null)
    if (res.error) window.alert(res.error)
    else invoices.refetch()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Outstanding" value={formatMoney(outstanding)} tone={outstanding > 0 ? "warn" : "good"} />
        <StatTile label="Taken today" value={formatMoney(takenToday)} tone="good" />
        <StatTile label="Open invoices" value={rows.filter((r) => r.kind === "invoice").length} />
        <StatTile label="Estimates" value={invoices.data.filter((i) => i.kind === "estimate").length} />
      </div>

      <Toolbar>
        <SegmentedTabs
          label="Billing views"
          active={view}
          onChange={setView}
          tabs={[
            { id: "open", label: "Open" },
            { id: "paid", label: "Paid" },
            { id: "estimates", label: "Estimates" },
          ]}
        />
      </Toolbar>

      {invoices.isLoading ? (
        <Spinner label="Loading billing" />
      ) : invoices.error ? (
        <LoadError message={invoices.error} onRetry={invoices.refetch} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Nothing here"
          detail="Invoices are built from what a visit actually recorded — open a visit and use its services."
          icon={<Receipt className="h-5 w-5" aria-hidden="true" />}
        />
      ) : (
        <SectionCard>
          <ul className="flex flex-col gap-2">
            {rows.map((i) => (
              <li key={i.id} className="rounded-xl border border-border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-[13.5px] font-semibold text-foreground">
                      {i.patientName} · {i.customerName}
                      <Pill tone={STATUS_TONE[i.status] ?? "neutral"}>{i.status}</Pill>
                      {i.kind === "estimate" && <Pill tone="info">Estimate</Pill>}
                      {i.ownerApprovedAt && <Pill tone="good">Owner approved</Pill>}
                    </p>
                    <p className="text-[12px] text-muted-foreground">
                      {formatDateShort(i.issuedOn ?? i.createdAt)} · {i.lines.length} line
                      {i.lines.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-semibold tabular-nums text-foreground">
                      {formatMoney(i.totalCents, i.currency)}
                    </span>
                    {i.status === "draft" && (
                      <Button size="sm" busy={busy === i.id} onClick={() => void move(i.id, "sent")}>
                        Send
                      </Button>
                    )}
                    {(i.status === "sent" || i.status === "approved") && (
                      <Button size="sm" busy={busy === i.id} onClick={() => void move(i.id, "paid")}>
                        Mark paid
                      </Button>
                    )}
                  </div>
                </div>
                {i.lines.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {i.lines.map((l) => (
                      <li key={l.id}>
                        <Pill tone="neutral">
                          {l.description} · {formatMoney(l.unitPriceCents)}
                        </Pill>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  )
}
