"use client"

import { useEffect, useState, type ReactNode } from "react"
import { Bell, Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { SectionCard } from "@/components/ui/section-card"
import { StatTile } from "@/components/ui/stat-tile"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { NativeSelect } from "@/components/ui/select"
import { SegmentedTabs } from "@/components/ui/segmented-tabs"
import { EmptyState } from "@/components/ui/empty"
import { LoadError } from "@/components/ui/load-error"
import { SkeletonRows } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Modal } from "@/components/ui/dialog"

const TOKEN_GROUPS: Array<{ name: string; tokens: string[] }> = [
  { name: "Brand", tokens: ["primary", "primary-hover", "primary-soft", "primary-foreground"] },
  {
    name: "Neutrals",
    tokens: ["background", "card", "foreground", "muted-foreground", "border", "input", "muted"],
  },
  {
    name: "Status",
    tokens: [
      "success",
      "success-soft",
      "warning",
      "warning-soft",
      "destructive",
      "destructive-soft",
      "info",
      "info-soft",
    ],
  },
  { name: "Charts", tokens: ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"] },
  { name: "Focus", tokens: ["ring"] },
]

const BUTTON_VARIANTS = ["primary", "secondary", "quiet", "danger", "link"] as const
const BUTTON_SIZES = ["sm", "md", "lg"] as const
const BADGE_VARIANTS = ["neutral", "brand", "success", "warning", "danger", "info"] as const

// The exact classes Button puts on :focus-visible, applied statically so the
// focused look can be reviewed without a keyboard.
const FOCUSED = "ring-2 ring-foreground ring-offset-2 ring-offset-background"

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-heading font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  )
}

export function StyleGuide() {
  const [dark, setDark] = useState(false)
  const [tab, setTab] = useState<"all" | "open" | "closed">("all")
  const [modalOpen, setModalOpen] = useState(false)

  // On <html>, not a wrapper, so portalled layers (the Modal) follow too.
  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle("dark", dark)
    root.setAttribute("data-theme", dark ? "dark" : "light")
    return () => {
      root.classList.remove("dark")
      root.removeAttribute("data-theme")
    }
  }, [dark])

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-10 bg-background px-4 py-8 text-foreground">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-heading font-semibold">Pet10x style guide</h1>
          <p className="text-meta text-muted-foreground">
            Development only. Every token and shared piece, in light and dark.
          </p>
        </div>
        <Button variant="secondary" onClick={() => setDark((d) => !d)} aria-pressed={dark}>
          {dark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
          {dark ? "Light mode" : "Dark mode"}
        </Button>
      </header>

      <Section title="Tokens">
        {TOKEN_GROUPS.map((g) => (
          <div key={g.name} className="flex flex-col gap-2">
            <h3 className="text-title font-semibold">{g.name}</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {g.tokens.map((t) => (
                <div key={t} className="overflow-hidden rounded-md border border-border bg-card">
                  <div className="h-14 border-b border-border" style={{ background: `var(--${t})` }} />
                  <p className="px-2 py-1.5 font-mono text-caption">--{t}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </Section>

      <Section title="Type scale">
        <div className="flex flex-col gap-1">
          <p className="text-heading font-semibold">Heading 22 — Your building</p>
          <p className="text-title font-semibold">Title 17 — Pets on file</p>
          <p className="text-body">Body 15 — Biscuit is due for a rabies booster next month.</p>
          <p className="text-meta text-muted-foreground">Meta 13 — Updated 2 hours ago</p>
          <p className="text-caption text-muted-foreground">Caption 12 — Unit 1204</p>
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-col gap-4">
          {BUTTON_VARIANTS.map((v) => (
            <div key={v} className="flex flex-wrap items-center gap-3">
              <span className="w-20 font-mono text-caption text-muted-foreground">{v}</span>
              {BUTTON_SIZES.map((s) => (
                <Button key={s} variant={v} size={s}>
                  {s}
                </Button>
              ))}
              <Button variant={v} className={FOCUSED}>
                Focused
              </Button>
              <Button variant={v} loading>
                Saving
              </Button>
              <Button variant={v} disabled>
                Disabled
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3">
            <span className="w-20 font-mono text-caption text-muted-foreground">icon</span>
            <Button>
              <Bell aria-hidden="true" />
              With icon
            </Button>
          </div>
          <p className="text-meta text-muted-foreground">
            Press Tab to move through the buttons and check the real focus ring matches the “Focused” column.
          </p>
        </div>
      </Section>

      <Section title="Badges">
        <div className="flex flex-wrap items-center gap-2">
          {BADGE_VARIANTS.map((v) => (
            <Badge key={v} variant={v}>
              {v}
            </Badge>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {BADGE_VARIANTS.map((v) => (
            <Badge key={v} variant={v} dot>
              {v}
            </Badge>
          ))}
        </div>
      </Section>

      <Section title="Cards">
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Card</CardTitle>
              <CardDescription>The shadcn card, on the shared radius and border.</CardDescription>
            </CardHeader>
            <CardContent className="text-body">Card body text.</CardContent>
          </Card>
          <SectionCard
            title="Section card"
            subtitle="A titled panel with actions"
            actions={<Button size="sm" variant="secondary">Action</Button>}
          >
            <p className="text-body">Section body text.</p>
          </SectionCard>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <StatTile label="Default" value={128} hint="All pets" />
          <StatTile label="Good" value={96} tone="good" hint="Vaccines current" />
          <StatTile label="Warn" value={12} tone="warn" hint="Due soon" />
          <StatTile label="Bad" value={3} tone="bad" hint="Overdue" />
          <StatTile label="Info" value={7} tone="info" hint="New this week" />
          <StatTile label="Accent" value={42} tone="accent" hint="Tappable" onClick={() => {}} />
        </div>
      </Section>

      <Section title="Inputs">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Pet name" hint="As it appears on the licence" required>
            {(p) => <Input {...p} placeholder="Biscuit" />}
          </Field>
          <Field label="Unit" error="Enter your unit number">
            {(p) => <Input {...p} placeholder="1204" />}
          </Field>
          <Field label="Species">
            {(p) => (
              <NativeSelect {...p} defaultValue="dog">
                <option value="dog">Dog</option>
                <option value="cat">Cat</option>
                <option value="other">Other</option>
              </NativeSelect>
            )}
          </Field>
          <Field label="Notes">{(p) => <Textarea {...p} placeholder="Anything the manager should know" />}</Field>
          <Field label="Disabled">{(p) => <Input {...p} disabled value="Read only" readOnly />}</Field>
        </div>
      </Section>

      <Section title="Tabs">
        <SegmentedTabs
          label="Example tabs"
          active={tab}
          onChange={setTab}
          tabs={[
            { id: "all", label: "All", count: 24 },
            { id: "open", label: "Open", count: 5 },
            { id: "closed", label: "Closed" },
          ]}
        />
      </Section>

      <Section title="States">
        <div className="grid gap-4 md:grid-cols-2">
          <EmptyState
            title="No pets yet"
            detail="Add your first pet to see vaccines and reminders here."
            action={<Button size="sm">Add a pet</Button>}
          />
          <div className="flex flex-col gap-4">
            <LoadError message="Check your connection and try again." onRetry={() => {}} />
            <SkeletonRows rows={2} />
            <Spinner label="Loading pets" />
          </div>
        </div>
      </Section>

      <Section title="Dialog">
        <div>
          <Button variant="secondary" onClick={() => setModalOpen(true)}>
            Open modal
          </Button>
        </div>
        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title="Snooze reminder"
          description="We will remind you again later."
          footer={
            <>
              <Button variant="secondary" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => setModalOpen(false)}>Snooze</Button>
            </>
          }
        >
          <Field label="Until">{(p) => <Input {...p} type="time" defaultValue="18:00" />}</Field>
        </Modal>
      </Section>
    </main>
  )
}
