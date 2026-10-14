"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Receipt, Plus } from "lucide-react"
import type { ClinicMembership } from "@/lib/data/clinic/context"
import {
  useInvoices, setInvoiceStatus, invoiceFromVisit, useBillableVisits, type Invoice,
} from "@/lib/data/clinic/shop"
import {
  invoiceStatusLabel, INVOICE_STATUS_TONE, invoiceActions, invoicesForView, billingViewFor,
  invoicedVisitIds, takenTodayCents, validatePayment, PAYMENT_METHODS,
  type BillingView, type InvoiceAction, type PaymentErrors, type PaymentMethod, type InvoiceStatus,
} from "@/lib/data/clinic/billing"
import { formatMoney, formatDateShort } from "@/lib/data/clinic/time"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  SectionCard, Spinner, LoadError, EmptyState, Button, Pill, Modal, Field, TextInput, Select,
  SegmentedTabs, Toolbar, StatTile,
} from "@/components/screens/shared/ui"

const ACTION_LABEL: Record<InvoiceAction, string> = {
  send: "Send",
  record_payment: "Record payment",
  convert: "Convert to invoice",
  void: "Void",
}

function StatusPill({ status }: { status: string }) {
  const tone = INVOICE_STATUS_TONE[status as InvoiceStatus] ?? "neutral"
  return <Pill tone={tone}>{invoiceStatusLabel(status)}</Pill>
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
  const [reviewing, setReviewing] = useState<{ bill: Invoice; paidCents: number; method: PaymentMethod } | null>(null)
  const [voiding, setVoiding] = useState<Invoice | null>(null)
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

  const invoiced = useMemo(() => invoicedVisitIds(invoices.data), [invoices.data])
  const rows = invoicesForView(invoices.data, view)
  const outstanding = invoices.data
    .filter((i) => i.kind === "invoice" && (i.status === "sent" || i.status === "approved"))
    .reduce((sum, i) => sum + i.totalCents - i.paidCents, 0)
  const takenToday = takenTodayCents(invoices.data, new Date(), clinic.timezone)
  const openBill = openId ? invoices.data.find((i) => i.id === openId) ?? null : null

  const actionsFor = (i: Invoice) =>
    // An estimate with no visit has nothing to convert from, so it reads as already invoiced.
    invoiceActions(i, { invoiced: i.visitId === null || invoiced.has(i.visitId) })

  async function run(bill: Invoice, action: InvoiceAction) {
    // The sheet (a Modal, z-[100]) would sit above the confirmation dialog
    // (z-50), so it closes before payment or voiding asks anything.
    if (action === "record_payment" || action === "void") setOpenId(null)
    if (action === "record_payment") return setPaying(bill)
    if (action === "void") return setVoiding(bill)
    setBusy(bill.id)
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
    setOpenId(null)
    setWant(res.invoiceId ?? null)
    invoices.refetch()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Outstanding" value={formatMoney(outstanding)} tone={outstanding > 0 ? "warn" : "good"} />
        <StatTile label="Taken today" value={formatMoney(takenToday)} tone="good" />
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
                      <StatusPill status={i.status} />
                      {i.kind === "estimate" && <Pill tone="info">Estimate</Pill>}
                      {i.ownerApprovedAt && <Pill tone="good">Owner approved</Pill>}
                    </p>
                    <p className="text-[12px] text-muted-foreground">
                      {formatDateShort(i.issuedOn ?? i.createdAt)} · {i.lines.length} line
                      {i.lines.length === 1 ? "" : "s"}
                      {i.status === "paid" && i.paidCents < i.totalCents ? ` · ${formatMoney(i.paidCents, i.currency)} received` : ""}
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
                <StatusPill status={openBill.status} />
                {openBill.ownerApprovedAt && <Pill tone="good">Owner approved</Pill>}
                {openBill.issuedOn ? `Sent ${formatDateShort(openBill.issuedOn)}` : `Created ${formatDateShort(openBill.createdAt)}`}
              </p>
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
              {openBill.status === "paid" && (
                <p className="text-[12.5px] text-muted-foreground">
                  {formatMoney(openBill.paidCents, openBill.currency)} received.
                </p>
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
          onReview={(paidCents, method) => {
            setReviewing({ bill: paying, paidCents, method })
            setPaying(null)
          }}
        />
      )}

      <ConfirmDialog
        open={reviewing !== null}
        onOpenChange={(open) => {
          if (!open) setReviewing(null)
        }}
        title={reviewing ? `Record ${formatMoney(reviewing.paidCents, reviewing.bill.currency)} by ${reviewing.method}?` : "Record payment?"}
        description={
          reviewing
            ? reviewing.paidCents < reviewing.bill.totalCents
              ? `The invoice is marked paid with ${formatMoney(reviewing.paidCents, reviewing.bill.currency)} of ${formatMoney(reviewing.bill.totalCents, reviewing.bill.currency)} received. The rest isn't tracked after this.`
              : `${reviewing.bill.customerName}'s invoice is marked paid in full.`
            : ""
        }
        confirmLabel="Record payment"
        onConfirm={async () => {
          const r = reviewing
          if (!r) return { error: null }
          const res = await setInvoiceStatus(r.bill.id, "paid", r.paidCents, r.method)
          invoices.refetch()
          if (res.error) return { error: res.error }
          toast.success("Payment recorded")
          return { error: null }
        }}
      />

      <ConfirmDialog
        open={voiding !== null}
        onOpenChange={(open) => {
          if (!open) setVoiding(null)
        }}
        title={`Void this ${voiding?.kind === "estimate" ? "estimate" : "invoice"}?`}
        description="It stays on record, but it can't be sent, approved or paid again. This can't be undone."
        confirmLabel="Void"
        tone="danger"
        onConfirm={async () => {
          const bill = voiding
          if (!bill) return { error: null }
          const res = await setInvoiceStatus(bill.id, "void")
          if (res.error) return { error: res.error }
          toast.success(bill.kind === "estimate" ? "Estimate voided" : "Invoice voided")
          invoices.refetch()
          return { error: null }
        }}
      />
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

/** Amount and method. Checking happens here; the confirmation is the parent's. */
function PaymentModal({
  bill, onClose, onReview,
}: {
  bill: Invoice
  onClose: () => void
  onReview: (paidCents: number, method: PaymentMethod) => void
}) {
  const [amount, setAmount] = useState((bill.totalCents / 100).toFixed(2))
  const [method, setMethod] = useState("")
  const [errors, setErrors] = useState<PaymentErrors>({})

  function review() {
    const checked = validatePayment({ amount, method, totalCents: bill.totalCents })
    if (!checked.ok) return setErrors(checked.errors)
    onReview(checked.value.paidCents, checked.value.method)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Record payment"
      description={`${bill.patientName} · ${bill.customerName} · ${formatMoney(bill.totalCents, bill.currency)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={review}>Continue</Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Amount received (dollars)" required error={errors.amount}>
          {(p) => <TextInput {...p} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />}
        </Field>
        <Field label="How they paid" required error={errors.method}>
          {(p) => (
            <Select {...p} value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="" disabled>
                Choose…
              </option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          )}
        </Field>
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
  invoiced: Set<string>
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
