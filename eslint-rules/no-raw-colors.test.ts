import { describe, it } from "vitest"
import { RuleTester } from "eslint"
import rule from "./no-raw-colors.js"

// RuleTester drives its own describe/it; hand it vitest's.
RuleTester.describe = describe
RuleTester.it = it
RuleTester.itOnly = it.only

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
})

const jsx = (cls: string) => `<div className="${cls}" />`
const fails = (code: string, count = 1) => ({ code, errors: Array.from({ length: count }, () => ({ messageId: "raw" as const })) })

tester.run("no-raw-colors", rule, {
  valid: [
    // Tokens on every colour utility.
    jsx("bg-primary text-primary-foreground hover:bg-primary-hover"),
    jsx("bg-card text-foreground border border-border"),
    jsx("bg-success-soft text-foreground"),
    jsx("text-muted-foreground fill-current stroke-border"),
    jsx("ring-2 ring-foreground ring-offset-2 ring-offset-background"),
    jsx("from-primary-soft via-transparent to-background"),
    jsx("divide-y divide-border border-t-transparent"),
    jsx("accent-primary caret-transparent text-white bg-transparent"),
    // Non-colour values on colour-capable utilities.
    jsx("text-body text-caption text-[13px] text-sm/relaxed text-center text-balance"),
    jsx("border-2 border-dashed border-l-4 border-b-0 border-[1.5px] border-collapse"),
    jsx("shadow-card shadow-float shadow-sm shadow-none outline-none outline-hidden outline-offset-2"),
    jsx("bg-cover bg-center bg-no-repeat bg-gradient-to-t bg-linear-to-b"),
    // The allowed overlays.
    jsx("bg-black/40 bg-black/50 bg-white/10 bg-white/15 bg-card/85 supports-[backdrop-filter]:bg-background/80"),
    // Near-opaque glass for sticky headers and menus over scrolling content.
    jsx("sticky top-0 bg-background/95 backdrop-blur-xl"),
    // Variants and the important mark are stripped before checking.
    jsx("dark:hover:bg-muted focus-visible:!ring-foreground data-[state=open]:bg-muted *:[svg]:text-destructive"),
    // Not class strings: comparisons, lookups, other calls.
    `<div className={cn(variant === "text-only" && "px-2", MAP["bg-x"], f("text-orange-600"))} />`,
    // A class half-built at a `+` join is not judged; whole classes either side pass.
    `<div className={"bg-" + tone + "-soft text-foreground " + extra} />`,
    `cn("p-2 " + (open ? "bg-muted" : "bg-card"))`,
    // cva's variant names are keys, not classes.
    `cva("x", { variants: { variant: { "text-only": "px-2" } } })`,
    // Mask stops take lengths, percentages and black.
    jsx("mask-b-from-50% mask-linear-to-black"),
    // A class half-built in a template literal is not judged.
    "<div className={`bg-${tone}-soft text-foreground`} />",
    // Strings outside className / cn are not class strings.
    `const label = "text-orange-600"`,
    // Inline style objects carry data colours (service and user choices).
    `const style = { color: "#FD9340" }; <div style={{ background: "#fff" }} />`,
    // Arbitrary properties that cannot paint: a mask, a size, a custom property.
    jsx("[mask-image:radial-gradient(ellipse_72%_55%_at_50%_0%,black_20%,transparent_72%)] [background-size:64px_64px] [--cell-size:--spacing(8)]"),
    // A recharts attribute selector names the colour it repaints.
    jsx("[&_.recharts-dot[stroke='#fff']]:stroke-transparent"),
    `cva("inline-flex", { variants: { variant: { primary: "bg-primary", "icon-sm": "size-8" } } })`,
  ],
  invalid: [
    // The brief's five.
    fails(jsx("bg-[#FFF6E0]")),
    fails(jsx("text-orange-600")),
    fails(jsx("bg-success/10")),
    fails(jsx("bg-primary-strong")),
    fails(jsx("text-accent")),
    // The rest of the removed tokens.
    fails(jsx("text-primary-text hover:bg-primary-strong-hover text-warning-strong text-success-strong bg-accent"), 5),
    // Palette names anywhere, including on shadows and rings.
    fails(jsx("ring-red-400 shadow-orange-500/20 border-stone-200 from-amber-50"), 4),
    // Opacity tints that are not on the list, including on allowed tokens.
    fails(jsx("bg-muted/50 border-border/60 text-foreground/80 ring-ring/50 bg-black/70 via-background/40"), 6),
    // Literal colours in any form, inside any class.
    fails(jsx("shadow-[0_8px_28px_-18px_rgba(0,0,0,0.28)] bg-[hsl(var(--x))] [color:#fff]"), 3),
    // Arbitrary properties that paint are colours by another name.
    fails(jsx("[background-image:radial-gradient(60rem_40rem_at_50%_-10%,var(--color-info)/8%,transparent)] [color:var(--x)] [box-shadow:0_0_0_1px_black]"), 3),
    // Arbitrary variable colours.
    fails(jsx("bg-(--color-bg) border-[var(--x)]"), 2),
    // cn / clsx / cva arguments, including conditionals and object keys.
    fails(`cn("px-2", ok ? "bg-info/10" : "bg-card", { "text-red-500": bad })`, 2),
    fails(`clsx(["bg-teal-500"])`),
    fails(`cva("bg-accent", { variants: { tone: { warn: "text-amber-800" } } })`, 2),
    // Template literals in className.
    fails("<div className={`p-2 ${x} bg-primary/10 ${y}`} />"),
    // The pieces' extra class slots, class constants and status maps.
    fails(`<Modal overlayClassName="bg-black/70" />`),
    fails(`const STATUS_STYLE = { open: "bg-info/10", done: "bg-success-soft" }`),
    fails(`const toneClasses = ["text-success-strong"]`),
    fails(`const x = { iconClass: "text-teal-500" }`),
    // String concatenation is read on both sides of every `+`.
    fails(`<div className={"text-orange-600 " + x} />`),
    fails(`cn("p-2 " + "bg-red-500")`),
    fails(`<div className={x + " bg-info/10 " + y} />`),
    // Maps named for colours and tones are read too.
    fails(`const STATUS_COLOR = { open: "text-teal-600" }`),
    fails(`const toneMap = { warn: "bg-warning/10" }`),
    // A mask stop is a colour slot like any other.
    fails(jsx("mask-b-from-red-500")),
    // A cn inside className is reported once, not twice.
    fails(`<div className={cn("bg-accent")} />`),
  ],
})
