"use client"

import { useEffect, useId, useMemo, useState } from "react"
import { toast } from "sonner"
import { Receipt, Plus } from "lucide-react"
import type { ClinicMembership } from "@/lib/data/clinic/context"
import {
  useInvoices, setInvoiceStatus, recordPayment, voidInvoice, usePaymentsSince, invoiceFromVisit,
  useBillableVisits, type Invoice,
} from "@/lib/data/clinic/shop"
import {
  invoiceStatusView, invoiceActions, invoicesForView, billingViewFor, isPartlyPaid, paymentProgress,
  remainingCents, paymentRows, paymentMethodLabel, liveInvoiceByVisit, convertedTotalNote, takenTodayCents,
  validatePayment, PAYMENT_METHODS, type BillingView, type InvoiceAction, type PaymentErrors, type PaymentMethodCode,
} from "@/lib/data/clinic/billing"
import { formatMoney, formatDateShort, dayBounds, todayISO } from "@/lib/data/clinic/time"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  SectionCard, Spinner, LoadError, EmptyState, Button, Pill, Modal, Field, TextInput,
  SegmentedTabs, Toolbar, StatTile,
} from "@/components/screens/shared/ui"

const ACTION_LABEL: Record<InvoiceAction, string> = {
  send: "Send",
  record_payment: "Record payment",
  settle: "Mark settled",
  convert: "Convert to invoice",
  void: "Void",
}

function StatusPill({ bill }: { bill: Invoice }) {
  const { label, tone } = invoiceStatusView(bill)
  return <Pill tone={tone}>{label}</Pill>
}

export function ClinicBillingScreen({
  clinic,
  openInvoiceId = null,
  onOpened,
}: {
  clinic: ClinicMembership
  /** A bill just created elsewhere (a visit card, Today's check-out) to open on arrival. */
  openInvoiceId?: string | null
  onOpened?: () => void
}) {
  const invoices = useInvoices(clinic.businessId)
  const [view, setView] = useState<BillingView>("open")
  const [busy, setBusy] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [newOpen, setNewOpen] = useState(false)
  const [paying, setPaying] = useState<Invoice | null>(null)
  const [reviewing, setReviewing] = useState<{ bill: Invoice; amountCents: number; method: PaymentMethodCode } | null>(null)
  const [voiding, setVoiding] = useState<Invoice | null>(null)
  // The draft a Convert to invoice just made, and the approved estimate's
  // total to compare it with before it is sent.
  const [converted, setConverted] = useState<{ invoiceId: string; estimateTotalCents: number } | null>(null)
  // A bill to open as soon as it appears in the list — one just created here,
  // or handed over by the shell (this screen mounts fresh on every visit, so
  // the prop is read once). The list only holds a new bill after its refetch
  // lands, so this is checked on each render rather than once.
  const [want, setWant] = useState<string | null>(openInvoiceId)
  useEffect(() => {
    if (openInvoiceId) onOpened?.()
  }, [openInvoiceId, onOpened])
  if (want) {
    const bill = invoices.data.find((i) => i.id === want)
    if (bill) {
      setWant(null)
      setView(billingViewFor(bill))
      setOpenId(bill.id)
    }
  }

  const invoiced = useMemo(() => liveInvoiceByVisit(invoices.data), [invoices.data])
  const rows = invoicesForView(invoices.data, view)
  const outstanding = invoices.data
    .filter((i) => i.kind === "invoice" && (i.status === "sent" || i.status === "approved"))
    .reduce((sum, i) => sum + remainingCents(i), 0)
  // Today's payments, read from the start of the practice's day; the helper
  // re-checks each one's day in the practice's zone. The string changes at
  // the practice's midnight, which refetches.
  const todayStart = dayBounds(todayISO(new Date(), clinic.timezone), clinic.timezone).from
  const payments = usePaymentsSince(clinic.businessId, todayStart)
  const takenToday = takenTodayCents(payments.data, new Date(), clinic.timezone)
  const openBill = openId ? invoices.data.find((i) => i.id === openId) ?? null : null

  const actionsFor = (i: Invoice) =>
    // An estimate with no visit has nothing to convert from, so it reads as already invoiced.
    invoiceActions(i, { invoiced: i.visitId === null || invoiced.has(i.visitId) })

  // A payment or a void changes both the bills and today's takings.
  function refetchMoney() {
    invoices.refetch()
    payments.refetch()
  }

  async function run(bill: Invoice, action: InvoiceAction) {
    // One dialog at a time: the invoice sheet closes before payment or
    // voiding asks anything, so the question is never stacked over it.
    if (action === "record_payment" || action === "void") setOpenId(null)
    if (action === "record_payment") return setPaying(bill)
    if (action === "void") return setVoiding(bill)
    setBusy(bill.id)
    if (action === "settle") {
      // Nothing is owed (a $0 bill): a payment of 0 is the RPC's one way to
      // close it as paid. No money changed hands, so no payment row is made.
      const res = await recordPayment(bill.id, 0, "other", bill.currency)
      setBusy(null)
      if (res.error) return toast.error(res.error)
      toast.success("Invoice settled")
      refetchMoney()
      return
    }
    if (action === "send") {
      const res = await setInvoiceStatus(bill.id, "sent")
      setBusy(null)
      if (res.error) return toast.error(res.error)
      toast.success(`${bill.kind === "estimate" ? "Estimate" : "Invoice"} sent to ${bill.customerName}`)
      return invoices.refetch()
    }
    // convert: the approved estimate's visit becomes an invoice draft.
    const res = await invoiceFromVisit(bill.visitId as string, "invoice")
    setBusy(null)
    if (res.error && !res.invoiceId) return toast.error(res.error)
    if (res.error) toast.error(res.error)
    else toast.success("Invoice created from the estimate")
    if (res.invoiceId) setConverted({ invoiceId: res.invoiceId, estimateTotalCents: bill.totalCents })
    setOpenId(null)
    setWant(res.invoiceId ?? null)
    invoices.refetch()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Outstanding" value={formatMoney(outstanding)} tone={outstanding > 0 ? "warn" : "good"} />
        <TakenTodayTile
          cents={takenToday}
          loading={payments.isLoading && payments.data.length === 0}
          failed={payments.error !== null}
          onRetry={payments.refetch}
        />
        <StatTile label="Open invoices" value={invoicesForView(invoices.data, "open").length} />
        <StatTile label="Estimates" value={invoicesForView(invoices.data, "estimates").length} />
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
        <div className="ml-auto">
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" /> New invoice
          </Button>
        </div>
      </Toolbar>

      {invoices.isLoading && invoices.data.length === 0 ? (
        <Spinner label="Loading billing" />
      ) : invoices.error ? (
        <LoadError message={invoices.error} onRetry={invoices.refetch} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Nothing here"
          detail="Bills are built from what a visit recorded. Use New invoice, or Create invoice on a visit."
          icon={<Receipt className="h-5 w-5" aria-hidden="true" />}
        />
      ) : (
        <SectionCard>
          <ul className="flex flex-col gap-2">
            {rows.map((i) => (
              <li key={i.id} className="rounded-xl border border-border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setOpenId(i.id)}
                    className="min-w-0 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                  >
                    <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold text-foreground">
                      {i.patientName} · {i.customerName}
                      <StatusPill bill={i} />
                      {i.kind === "estimate" && <Pill tone="info">Estimate</Pill>}
                      {i.ownerApprovedAt && <Pill tone="good">Owner approved</Pill>}
                    </p>
                    <p className="text-[12px] text-muted-foreground">
                      {formatDateShort(i.issuedOn ?? i.createdAt)} · {i.lines.length} line
                      {i.lines.length === 1 ? "" : "s"}
                      {isPartlyPaid(i) ? ` · ${formatMoney(i.paidCents, i.currency)} paid, ${formatMoney(remainingCents(i), i.currency)} left` : ""}
                    </p>
                  </button>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] font-semibold tabular-nums text-foreground">
                      {formatMoney(i.totalCents, i.currency)}
                    </span>
                    <BillActions actions={actionsFor(i)} busy={busy === i.id} onRun={(a) => void run(i, a)} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {openId && (
        <Modal
          open
          onClose={() => setOpenId(null)}
          title={
            openBill
              ? `${openBill.kind === "estimate" ? "Estimate" : "Invoice"}${openBill.number ? ` ${openBill.number}` : ""} · ${openBill.patientName}`
              : "Opening"
          }
          description={openBill ? openBill.customerName : undefined}
          footer={
            openBill ? (
              <BillActions
                actions={actionsFor(openBill)}
                busy={busy === openBill.id}
                onRun={(a) => void run(openBill, a)}
              />
            ) : undefined
          }
        >
          {!openBill ? (
            <Spinner label="Opening the bill" />
          ) : (
            <div className="flex flex-col gap-3">
              <p className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground">
                <StatusPill bill={openBill} />
                {openBill.ownerApprovedAt && <Pill tone="good">Owner approved</Pill>}
                {openBill.issuedOn ? `Sent ${formatDateShort(openBill.issuedOn)}` : `Created ${formatDateShort(openBill.createdAt)}`}
              </p>
              {(() => {
                const note =
                  converted?.invoiceId === openBill.id && openBill.status === "draft"
                    ? convertedTotalNote(converted.estimateTotalCents, openBill.totalCents, openBill.currency)
                    : null
                return note ? (
                  <p role="status" className="rounded-lg bg-warning/10 px-2.5 py-1.5 text-[12.5px] font-medium text-warning-strong">
                    {note}
                  </p>
                ) : null
              })()}
              {openBill.lines.length === 0 ? (
                <p className="text-[12.5px] text-muted-foreground">No lines on this bill.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
                  {openBill.lines.map((l) => (
                    <li key={l.id} className="flex items-center justify-between gap-2 px-3 py-2 text-[13px]">
                      <span className="text-foreground">
                        {l.description}
                        {l.quantity !== 1 ? ` × ${l.quantity}` : ""}
                      </span>
                      <span className="tabular-nums text-foreground">
                        {formatMoney(Math.round(l.quantity * l.unitPriceCents), openBill.currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="flex items-center justify-between text-[14px] font-semibold text-foreground">
                <span>Total</span>
                <span className="tabular-nums">{formatMoney(openBill.totalCents, openBill.currency)}</span>
              </p>
              {isPartlyPaid(openBill) && (
                <p className="text-[12.5px] text-muted-foreground">{paymentProgress(openBill)}</p>
              )}
              {openBill.payments.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-[12px] font-semibold text-foreground">Payments</p>
                  <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
                    {paymentRows(openBill.payments, clinic.timezone, openBill.currency).map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2 text-[13px]">
                        <span className="text-foreground">
                          {p.date} · {p.method}
                        </span>
                        <span className="tabular-nums text-foreground">{p.amount}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {openBill.status === "declined" && (
                <p className="text-[12.5px] text-muted-foreground">
                  The owner declined this estimate. Write a new one if the plan changes.
                </p>
              )}
              {openBill.status === "draft" && (
                <p className="text-[12.5px] text-muted-foreground">
                  Only you can see a draft. Send it and the owner gets it in their app.
                </p>
              )}
            </div>
          )}
        </Modal>
      )}

      {newOpen && (
        <NewInvoiceModal
          businessId={clinic.businessId}
          invoiced={invoiced}
          onClose={() => setNewOpen(false)}
          onCreated={(id) => {
            setNewOpen(false)
            setWant(id)
            invoices.refetch()
          }}
        />
      )}

      {paying && (
        <PaymentModal
          key={paying.id}
          bill={paying}
          onClose={() => setPaying(null)}
          onReview={(amountCents, method) => {
            setReviewing({ bill: paying, amountCents, method })
            setPaying(null)
          }}
        />
      )}

      <ConfirmDialog
        open={reviewing !== null}
        onOpenChange={(open) => {
          if (!open) setReviewing(null)
        }}
        title={
          reviewing
            ? `Record ${formatMoney(reviewing.amountCents, reviewing.bill.currency)} by ${paymentMethodLabel(reviewing.method)}?`
            : "Record payment?"
        }
        description={
          reviewing
            ? reviewing.amountCents < remainingCents(reviewing.bill)
              ? `${formatMoney(remainingCents(reviewing.bill) - reviewing.amountCents, reviewing.bill.currency)} will still be owed on ${reviewing.bill.customerName}'s invoice.`
              : `${reviewing.bill.customerName}'s invoice is marked paid in full.`
            : ""
        }
        confirmLabel="Record payment"
        onConfirm={async () => {
          const r = reviewing
          if (!r) return { error: null }
          const res = await recordPayment(r.bill.id, r.amountCents, r.method, r.bill.currency)
          refetchMoney()
          if (res.error) return { error: res.error }
          toast.success(res.status === "paid" ? "Payment recorded. The invoice is paid." : "Payment recorded")
          return { error: null }
        }}
      />

      <ConfirmDialog
        open={voiding !== null}
        onOpenChange={(open) => {
          if (!open) setVoiding(null)
        }}
        title={`Void this ${voiding?.kind === "estimate" ? "estimate" : "invoice"}?`}
        description={
          <>
            It stays on record, but it can&apos;t be sent, approved or paid again. This can&apos;t be undone. The
            owner sees this reason if the bill already reached them.
            {voiding && voiding.paidCents > 0 ? " Payments already recorded stay on the bill." : ""}
          </>
        }
        reason={{
          label: "Reason",
          required: true,
          placeholder: "For example, billed to the wrong visit",
          requiredMessage: "Add a reason for voiding it.",
        }}
        confirmLabel="Void"
        tone="danger"
        onConfirm={async (reason) => {
          const bill = voiding
          if (!bill || !reason) return { error: null }
          const res = await voidInvoice(bill.id, reason)
          refetchMoney()
          if (res.error) return { error: res.error }
          toast.success(bill.kind === "estimate" ? "Estimate voided" : "Invoice voided")
          return { error: null }
        }}
      />
    </div>
  )
}

/**
 * Taken today, which must never show a confident $0 when the read behind it
 * failed: "—" with Couldn't load and Retry, and "…" while it loads. StatTile
 * takes only a string hint, so this tile is its own markup in the same style.
 */
function TakenTodayTile({
  cents, loading, failed, onRetry,
}: {
  cents: number
  loading: boolean
  failed: boolean
  onRetry: () => void
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 text-left">
      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">Taken today</p>
      <p className="mt-1 text-[26px] font-semibold leading-none tabular-nums text-success-strong">
        {failed ? "—" : loading ? "…" : formatMoney(cents)}
      </p>
      {failed ? (
        <p role="alert" className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-destructive">
          Couldn&apos;t load
          <button
            type="button"
            onClick={onRetry}
            className="rounded font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            Retry
          </button>
        </p>
      ) : null}
      <p className="mt-1 text-[12px] text-muted-foreground">
        Payments on voided bills aren&apos;t counted.
      </p>
    </div>
  )
}

function BillActions({
  actions, busy, onRun,
}: {
  actions: InvoiceAction[]
  busy: boolean
  onRun: (a: InvoiceAction) => void
}) {
  if (actions.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {actions.map((a) => (
        <Button
          key={a}
          size="sm"
          variant={a === "void" ? "ghost" : "primary"}
          busy={busy && a !== "void"}
          disabled={busy}
          onClick={() => onRun(a)}
        >
          {ACTION_LABEL[a]}
        </Button>
      ))}
    </div>
  )
}

/**
 * Amount and method for one payment — part of what is owed or all of it.
 * Checking happens here; the confirmation is the parent's.
 */
function PaymentModal({
  bill, onClose, onReview,
}: {
  bill: Invoice
  onClose: () => void
  onReview: (amountCents: number, method: PaymentMethodCode) => void
}) {
  const remaining = remainingCents(bill)
  const [amount, setAmount] = useState((remaining / 100).toFixed(2))
  const [method, setMethod] = useState("")
  const [errors, setErrors] = useState<PaymentErrors>({})
  const methodLabelId = useId()

  function review() {
    const checked = validatePayment({ amount, method, remainingCents: remaining, currency: bill.currency })
    if (!checked.ok) return setErrors(checked.errors)
    onReview(checked.value.amountCents, checked.value.method)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Record payment"
      description={`${bill.patientName} · ${bill.customerName}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={review}>Continue</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-[13px] font-medium tabular-nums text-foreground">{paymentProgress(bill)}</p>
        <Field label="Amount received (dollars)" required error={errors.amount}>
          {(p) => <TextInput {...p} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />}
        </Field>
        <div className="flex flex-col gap-1">
          <p id={methodLabelId} className="text-[12px] font-semibold text-foreground">
            How they paid<span className="ml-0.5 text-destructive">*</span>
          </p>
          <div role="group" aria-labelledby={methodLabelId} className="flex flex-wrap gap-1.5">
            {PAYMENT_METHODS.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={method === m}
                onClick={() => setMethod(m)}
                className={`rounded-full border px-3 py-1.5 text-[13px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
                  method === m
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground hover:bg-muted"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          {errors.method && (
            <p role="alert" className="text-[11.5px] font-medium text-destructive">
              {errors.method}
            </p>
          )}
        </div>
      </div>
    </Modal>
  )
}

/**
 * "New invoice": pick a recent visit that recorded services. Bills are only
 * ever built from a visit (invoiceFromVisit), so there is no blank invoice.
 */
function NewInvoiceModal({
  businessId, invoiced, onClose, onCreated,
}: {
  businessId: string
  invoiced: Map<string, string>
  onClose: () => void
  onCreated: (invoiceId: string) => void
}) {
  const visits = useBillableVisits(businessId)
  const [kind, setKind] = useState<"invoice" | "estimate">("invoice")
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // A visit already invoiced is left off the invoice list; an estimate can
  // still be written for it.
  const list = visits.data.filter((v) => kind === "estimate" || !invoiced.has(v.id))

  async function create(visitId: string) {
    setBusy(visitId)
    setError(null)
    const res = await invoiceFromVisit(visitId, kind)
    setBusy(null)
    if (!res.invoiceId) return setError(res.error ?? "Couldn't create it. Try again.")
    if (res.error) toast.error(res.error)
    onCreated(res.invoiceId)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={kind === "estimate" ? "New estimate" : "New invoice"}
      description="Choose a visit from the last 60 days. Its services become the lines."
      wide
    >
      <div className="flex flex-col gap-3">
        <SegmentedTabs
          label="Bill type"
          active={kind}
          onChange={setKind}
          tabs={[
            { id: "invoice", label: "Invoice" },
            { id: "estimate", label: "Estimate" },
          ]}
        />
        {visits.isLoading ? (
          <Spinner label="Finding visits" />
        ) : visits.error ? (
          <LoadError message={visits.error} onRetry={visits.refetch} />
        ) : list.length === 0 ? (
          <EmptyState
            title="No visits to bill"
            detail="Record a visit and add its services from the patient's chart, then bill it here."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {list.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3">
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold text-foreground">
                    {v.patientName} · {v.customerName}
                  </p>
                  <p className="text-[12px] text-muted-foreground">
                    {v.reason ?? "Visit"} · {formatDateShort(v.visitedOn)} · {v.serviceCount} service
                    {v.serviceCount === 1 ? "" : "s"} · {formatMoney(v.totalCents)}
                  </p>
                </div>
                <Button size="sm" busy={busy === v.id} disabled={busy !== null} onClick={() => void create(v.id)}>
                  {kind === "estimate" ? "Create estimate" : "Create invoice"}
                </Button>
              </li>
            ))}
          </ul>
        )}
        {error && <p role="alert" className="text-[12px] text-destructive">{error}</p>}
      </div>
    </Modal>
  )
}
