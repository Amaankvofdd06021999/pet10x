"use client"

import { toast } from "sonner"
import { useOwnerBookings, computeEarnings, BOOKING_STATUS_LABEL } from "@/lib/data/bookings"
import { formatPrice } from "@/lib/data/business"
import { feeOwedCents, feePercentLabel } from "@/lib/data/fees"
import { toCsv, downloadCsv } from "@/lib/csv"
import { StatTile, SectionCard, Spinner, EmptyState } from "./business-ui"
import { Download, DollarSign } from "lucide-react"

export function EarningsTab({ businessId }: { businessId: string }) {
  const { data: bookings, isLoading } = useOwnerBookings(businessId)
  const e = computeEarnings(bookings)
  const ledger = bookings.filter((b) => ["completed", "paid"].includes(b.status))
  // The customer pays the business directly, so Pet10x's fee is something the
  // business owes, not something withheld — summed from the stored fees.
  const owed = feeOwedCents(bookings)
  // A business prices in one currency; its bookings carry it. CAD is the
  // column default when there are no bookings yet.
  const currency = bookings[0]?.currency ?? "cad"
  const money = (dollars: number) => formatPrice(Math.round(dollars * 100), currency)

  function exportCsv() {
    const rows = ledger.map((b) => ({
      date: b.scheduledFor ? new Date(b.scheduledFor).toLocaleDateString() : new Date(b.createdAt).toLocaleDateString(),
      customer: b.customerName,
      service: b.serviceName ?? "—",
      pet: b.petName ?? "—",
      status: BOOKING_STATUS_LABEL[b.status],
      gross: (b.amountCents / 100).toFixed(2),
      fee: (b.commissionCents / 100).toFixed(2),
      net: ((b.amountCents - b.commissionCents) / 100).toFixed(2),
    }))
    downloadCsv(
      "earnings.csv",
      toCsv(rows, [
        { key: "date", label: "Date" },
        { key: "customer", label: "Customer" },
        { key: "service", label: "Service" },
        { key: "pet", label: "Pet" },
        { key: "status", label: "Status" },
        { key: "gross", label: `Price (${currency.toUpperCase()})` },
        { key: "fee", label: `Pet10x fee (${currency.toUpperCase()})` },
        { key: "net", label: `You keep (${currency.toUpperCase()})` },
      ]),
    )
    toast.success("Earnings exported")
  }

  if (isLoading) return <Spinner />

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Gross collected" value={money(e.grossPaid)} sub={`${e.paidCount} paid booking${e.paidCount === 1 ? "" : "s"}`} />
        <StatTile label="Pet10x fee owed" value={formatPrice(owed, currency)} sub="Pet10x invoices this separately." tone="destructive" />
        <StatTile label="Net to you" value={money(e.netPaid)} sub={`after the ${feePercentLabel()} Pet10x fee`} tone="success" />
        <StatTile label="Pipeline" value={money(e.pipeline)} sub={`${e.completedAwaitingPayment} awaiting payment`} tone="accent" />
      </div>

      <SectionCard
        title="Per-booking ledger"
        action={
          ledger.length > 0 ? (
            <button
              onClick={exportCsv}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-white"
            >
              <Download className="h-3.5 w-3.5" /> Export CSV
            </button>
          ) : null
        }
      >
        {ledger.length === 0 ? (
          <EmptyState icon={<DollarSign className="h-8 w-8" />} title="No earnings yet" sub="Completed bookings show up here with the price, the Pet10x fee and what you keep." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-[11.5px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3 font-semibold">Date</th>
                  <th className="py-2 pr-3 font-semibold">Service</th>
                  <th className="py-2 pr-3 font-semibold">Customer</th>
                  <th className="py-2 pr-3 text-right font-semibold">Price</th>
                  <th className="py-2 pr-3 text-right font-semibold">Pet10x fee</th>
                  <th className="py-2 pr-3 text-right font-semibold">You keep</th>
                  <th className="py-2 text-right font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((b) => (
                  <tr key={b.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-3 text-muted-foreground">
                      {new Date(b.scheduledFor ?? b.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-2 pr-3 font-medium text-foreground">{b.serviceName ?? "—"}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{b.customerName}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatPrice(b.amountCents, b.currency)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-destructive">−{formatPrice(b.commissionCents, b.currency)}</td>
                    <td className="py-2 pr-3 text-right font-semibold tabular-nums text-success-strong">
                      {formatPrice(b.amountCents - b.commissionCents, b.currency)}
                    </td>
                    <td className="py-2 text-right">
                      <span
                        className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${b.status === "paid" ? "bg-success/15 text-success-strong" : "bg-warning/15 text-warning"}`}
                      >
                        {BOOKING_STATUS_LABEL[b.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  )
}
