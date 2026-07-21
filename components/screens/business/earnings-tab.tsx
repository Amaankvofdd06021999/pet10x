"use client"

import { toast } from "sonner"
import { useOwnerBookings, computeEarnings, COMMISSION_RATE, BOOKING_STATUS_LABEL } from "@/lib/data/bookings"
import { toCsv, downloadCsv } from "@/lib/data/portfolio"
import { StatTile, SectionCard, Spinner, EmptyState } from "./business-ui"
import { Download, DollarSign } from "lucide-react"

export function EarningsTab({ businessId }: { businessId: string }) {
  const { data: bookings, isLoading } = useOwnerBookings(businessId)
  const e = computeEarnings(bookings)
  const ledger = bookings.filter((b) => ["completed", "paid"].includes(b.status))

  function exportCsv() {
    const rows = ledger.map((b) => ({
      date: b.scheduledFor ? new Date(b.scheduledFor).toLocaleDateString() : new Date(b.createdAt).toLocaleDateString(),
      customer: b.customerName,
      service: b.serviceName ?? "—",
      pet: b.petName ?? "—",
      status: BOOKING_STATUS_LABEL[b.status],
      gross: b.amount.toFixed(2),
      fee: b.commission.toFixed(2),
      net: b.net.toFixed(2),
    }))
    downloadCsv(
      "earnings.csv",
      toCsv(rows, [
        { key: "date", label: "Date" },
        { key: "customer", label: "Customer" },
        { key: "service", label: "Service" },
        { key: "pet", label: "Pet" },
        { key: "status", label: "Status" },
        { key: "gross", label: "Gross ($)" },
        { key: "fee", label: "Platform fee ($)" },
        { key: "net", label: "Net to you ($)" },
      ]),
    )
    toast.success("Earnings exported")
  }

  if (isLoading) return <Spinner />

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Gross collected" value={`$${e.grossPaid.toFixed(2)}`} sub={`${e.paidCount} paid booking${e.paidCount === 1 ? "" : "s"}`} />
        <StatTile label="Platform fee" value={`$${e.commissionPaid.toFixed(2)}`} sub={`${Math.round(COMMISSION_RATE * 100)}% commission`} tone="destructive" />
        <StatTile label="Net to you" value={`$${e.netPaid.toFixed(2)}`} sub="after commission" tone="success" />
        <StatTile label="Pipeline" value={`$${e.pipeline.toFixed(2)}`} sub={`${e.completedAwaitingPayment} awaiting payment`} tone="accent" />
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
          <EmptyState icon={<DollarSign className="h-8 w-8" />} title="No earnings yet" sub="Completed bookings show up here with gross, fee and net." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-[11.5px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3 font-semibold">Date</th>
                  <th className="py-2 pr-3 font-semibold">Service</th>
                  <th className="py-2 pr-3 font-semibold">Customer</th>
                  <th className="py-2 pr-3 text-right font-semibold">Gross</th>
                  <th className="py-2 pr-3 text-right font-semibold">Fee</th>
                  <th className="py-2 pr-3 text-right font-semibold">Net</th>
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
                    <td className="py-2 pr-3 text-right tabular-nums">${b.amount.toFixed(2)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-destructive">−${b.commission.toFixed(2)}</td>
                    <td className="py-2 pr-3 text-right font-semibold tabular-nums text-success">${b.net.toFixed(2)}</td>
                    <td className="py-2 text-right">
                      <span
                        className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${b.status === "paid" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}
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

      <p className="px-1 text-[11.5px] text-muted-foreground">
        Payments are recorded in-app for this demo. Connecting a real payout account (Stripe Connect) is a separate
        integration — the ledger above is already the source of truth for what you are owed.
      </p>
    </div>
  )
}
