/**
 * no-raw-colors — one palette, enforced (docs/superpowers/specs/2026-10-15-ui-system-design.md §3).
 *
 * Checks the string literals inside `className` attributes (and the
 * `*ClassName` slots), inside the arguments of `cn(`, `clsx(`, `cva(` (and
 * their siblings `cx(`, `twMerge(`, `twJoin(`), and inside constants and map
 * keys whose name says they hold classes (CLASS_NAME below). Every class is reduced to its utility (variants like `hover:` or
 * `dark:` and the `!` important mark are stripped) and, when that utility is
 * one that can take a colour (`bg-`, `text-`, `border-`, `ring-`, `shadow-`,
 * `from-`/`via-`/`to-`, `fill-`, `stroke-` …), its value must be one of:
 *
 *   - a palette token from app/globals.css (`primary`, `muted-foreground`,
 *     `success-soft` …), or `white` / `transparent` / `current` / `inherit`;
 *   - one of the explicit translucent overlays in ALLOWED_ALPHA below;
 *   - a value that is not a colour at all (`text-body`, `border-2`,
 *     `ring-offset-2`, `bg-cover`, `text-[13px]` …), each described by a
 *     positive pattern in NON_COLOUR.
 *
 * Positive grammar on purpose: the rule lists what is allowed, so a palette
 * colour (`text-orange-600`), a removed token (`bg-primary-strong`,
 * `text-accent`), an opacity tint (`bg-success/10`), an arbitrary colour
 * (`bg-[#FFF6E0]`) or a name nobody thought of all fail the same way —
 * without anyone having to enumerate them. Any class containing a hex, rgb(),
 * hsl(), oklch() or color-mix() literal fails wherever it appears.
 *
 * Out of scope by design: inline `style` colours (service- and user-chosen
 * colours are data, not palette) and CSS files.
 */

"use strict"

// Every colour name the theme exposes (`--color-*` in app/globals.css).
const TOKENS = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-hover",
  "primary-soft",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "border",
  "input",
  "ring",
  "success",
  "success-soft",
  "success-foreground",
  "warning",
  "warning-soft",
  "warning-foreground",
  "destructive",
  "destructive-soft",
  "destructive-foreground",
  "info",
  "info-soft",
  "info-foreground",
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
  // Not tokens, but not a palette choice either: white text on a primary or
  // danger fill, and the CSS keywords.
  "white",
  "transparent",
  "current",
  "inherit",
]
const TOKEN_SET = new Set(TOKENS)

// The only opacity modifiers on a colour, each a deliberate translucent layer
// (controller rulings in .superpowers/sdd/2026-10-15-ui-system/batch-rules.md).
// Making any of these opaque would change what shows through them.
const ALLOWED_ALPHA = new Set([
  // Modal / sheet backdrops and dark scrims over photos.
  "bg-black/40",
  "bg-black/50",
  // Light-on-dark tiles on the emergency band and hero imagery.
  "bg-white/10",
  "bg-white/15",
  // Sticky glass bands (headers, tab bars) that let content blur through.
  "bg-card/85",
  "bg-background/80",
])

// Utilities that can take a colour. Longest first so `ring-offset-` wins over
// `ring-` and `border-t-` over `border-`.
const COLOUR_PREFIXES = [
  "inset-shadow",
  "drop-shadow",
  "ring-offset",
  "inset-ring",
  "decoration",
  "border-x",
  "border-y",
  "border-t",
  "border-r",
  "border-b",
  "border-l",
  "border-s",
  "border-e",
  "outline",
  "divide",
  "border",
  "shadow",
  "stroke",
  "accent",
  "caret",
  "text",
  "ring",
  "from",
  "fill",
  "via",
  "bg",
  "to",
]

// An arbitrary value that is a length, never a colour.
const LENGTH = String.raw`\[-?\d*\.?\d+(px|rem|em|%|vh|vw|ch)?\]`
const SIDES = "t|tr|r|br|b|bl|l|tl"
const POSITIONS = "center|top|bottom|left|right|left-top|left-bottom|right-top|right-bottom|top-left|top-right|bottom-left|bottom-right"

// Values that make each colour-capable utility something other than a colour.
const NON_COLOUR = {
  text: new RegExp(
    "^(" +
      [
        "xs|sm|base|lg|xl|[2-9]xl", // Tailwind sizes
        "caption|meta|body|title|heading", // the type scale
        "left|center|right|justify|start|end",
        "wrap|nowrap|balance|pretty|ellipsis|clip",
        "shadow-(2xs|xs|sm|md|lg|none)",
        LENGTH,
        String.raw`\[length:[^\]]+\]`,
      ].join("|") +
      // A size may carry a line height: text-sm/6, text-sm/relaxed.
      String.raw`)(\/(\d+|none|tight|snug|normal|relaxed|loose|\[[\d.]+(px|rem)?\]))?$`,
  ),
  bg: new RegExp(
    "^(" +
      [
        "fixed|local|scroll|none|auto|cover|contain",
        "clip-(border|padding|content|text)",
        "origin-(border|padding|content)",
        "no-repeat|repeat|repeat-(x|y|round|space)",
        POSITIONS,
        "position-(" + POSITIONS + ")",
        "size-(auto|cover|contain)",
        `gradient-to-(${SIDES})`,
        `linear-to-(${SIDES})`,
        String.raw`linear-\d+`,
        "radial|conic",
        "blend-[a-z-]+",
        String.raw`\[url\([^)]*\)\]`,
      ].join("|") +
      ")$",
  ),
  border: new RegExp(
    "^(" +
      ["\\d+", "solid|dashed|dotted|double|hidden|none|collapse|separate", "spacing-\\d+", LENGTH].join("|") +
      ")$",
  ),
  divide: /^(x|y|(x|y)-\d+|(x|y)-reverse|solid|dashed|dotted|double|none)$/,
  outline: new RegExp(
    "^(" + ["\\d+", "none|hidden|solid|dashed|dotted|double", "offset-\\d+", "offset-" + LENGTH, LENGTH].join("|") + ")$",
  ),
  ring: new RegExp("^(\\d+|inset|" + LENGTH + ")$"),
  "ring-offset": new RegExp("^(\\d+|" + LENGTH + ")$"),
  "inset-ring": new RegExp("^(\\d+|" + LENGTH + ")$"),
  // Elevation: Tailwind's stock steps plus the two tokens (`shadow-card`,
  // `shadow-float`) defined over --elevation-* in app/globals.css.
  shadow: /^(2xs|xs|sm|md|lg|xl|2xl|none|inner|card|float)$/,
  "inset-shadow": /^(2xs|xs|sm|none)$/,
  "drop-shadow": /^(xs|sm|md|lg|xl|2xl|none)$/,
  from: new RegExp("^(\\d+%|" + LENGTH + ")$"),
  via: new RegExp("^(\\d+%|" + LENGTH + ")$"),
  to: new RegExp("^(\\d+%|" + LENGTH + ")$"),
  fill: /^none$/,
  stroke: /^(\d+|none)$/,
  accent: /^auto$/,
  caret: /^$/,
  decoration: /^(\d+|solid|double|dotted|dashed|wavy|auto|from-font|slice|clone)$/,
}

// `border-t`, `border-x` … share `border`'s non-colour values.
for (const side of ["x", "y", "t", "r", "b", "l", "s", "e"]) NON_COLOUR[`border-${side}`] = NON_COLOUR.border

// A literal colour anywhere in a class is always an error.
const COLOUR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?|oklch|oklab|lab|lch|hwb|color-mix)\(/

// Arbitrary properties (`[prop:value]`) that cannot paint a colour. Any other
// property — `[color:…]`, `[background-image:…]`, `[box-shadow:…]` — is a
// colour utility under another name. Custom properties (`[--x:…]`) only set a
// variable; COLOUR_LITERAL still catches a literal in one.
const NON_PAINT_PROPERTY = /^(--[a-z0-9-]+|background-size|background-position|background-repeat|mask-image|mask-size|mask-position|mask-repeat|scrollbar-width|scrollbar-gutter|transform|transition-property|will-change|clip-path|content)$/

// JSX attributes that hold classes.
const CLASS_ATTR = /^(class|className|[a-zA-Z]+ClassName)$/
// Constants and object keys that, by name, hold classes or class maps:
// `iconClass`, `toneClasses`, `LINK_CLASS`, `STATUS_STYLE`, `STAGE_TONES`.
// Lower-case `style` is left out on purpose — that is an inline style object,
// where a colour is data.
const CLASS_NAME = /([cC]lass(es|Name)?|CLASS(ES|NAME)?|_STYLES?|_TONES?)$/

// Callees whose arguments are class strings.
const CLASS_CALLEES = new Set(["cn", "clsx", "cva", "cx", "twMerge", "twJoin"])

/** Splits `dark:hover:bg-x` into its variants and utility, ignoring `:` inside [] and (). */
function utilityOf(cls) {
  let depth = 0
  let start = 0
  for (let i = 0; i < cls.length; i++) {
    const ch = cls[i]
    if (ch === "[" || ch === "(") depth++
    else if (ch === "]" || ch === ")") depth--
    else if (ch === ":" && depth === 0) start = i + 1
  }
  // Strip the important mark (either end) and a negative sign.
  return cls.slice(start).replace(/^!/, "").replace(/!$/, "").replace(/^-/, "")
}

/**
 * Returns null when the class is allowed, or a short reason when it is not.
 * Exported for the tests.
 */
function checkClass(cls) {
  const utility = utilityOf(cls)
  // Judged on the utility, not the variants: a variant like
  // `[&_[stroke='#ccc']]:` selects third-party markup by the colour it
  // ships with in order to repaint it with a token.
  if (COLOUR_LITERAL.test(utility)) return "a raw colour literal"
  const property = /^\[([a-z-][a-z0-9-]*):/.exec(utility)
  if (property) return NON_PAINT_PROPERTY.test(property[1]) ? null : "an arbitrary property that can paint a colour"
  let prefix = null
  for (const p of COLOUR_PREFIXES) {
    if (utility === p || utility.startsWith(p + "-")) {
      prefix = p
      break
    }
  }
  if (prefix === null) return null
  // A bare `border`, `ring`, `shadow`, `outline` is a width/style, not a colour.
  if (utility === prefix) return null

  const value = utility.slice(prefix.length + 1)
  if (NON_COLOUR[prefix] && NON_COLOUR[prefix].test(value)) return null

  const slash = value.indexOf("/")
  if (slash !== -1) {
    // `bg-black/40` and friends: only the listed overlays. The base must
    // still be a colour for the message to say "opacity".
    if (ALLOWED_ALPHA.has(`${prefix}-${value}`)) return null
    return "an opacity modifier on a colour (use a -soft token, a solid token, or an allowed overlay)"
  }
  if (TOKEN_SET.has(value)) return null
  return "not a palette token"
}

function report(context, node, text, { partialStart, partialEnd }) {
  const parts = text.split(/\s+/)
  parts.forEach((cls, i) => {
    if (!cls) return
    // In a template literal a class touching `${…}` is only half a class.
    if (i === 0 && partialStart) return
    if (i === parts.length - 1 && partialEnd) return
    const reason = checkClass(cls)
    if (reason) {
      context.report({ node, messageId: "raw", data: { cls, reason } })
    }
  })
}

/**
 * Walks an expression and checks every string that can end up as a class.
 * `seen` is shared per file so a `cn(…)` inside `className={…}` is checked once.
 */
function checkStrings(context, root, seen) {
  const visit = (node) => {
    if (!node || typeof node.type !== "string" || seen.has(node)) return
    seen.add(node)
    // Parts of an expression that never become a class: a comparison
    // (`variant === "text-only"`) and a ternary's test are booleans, a
    // computed key (`MAP["x"]`) is a lookup, and another function's arguments
    // are its own business (its result is not a literal we can read).
    if (node.type === "BinaryExpression") return
    if (node.type === "ConditionalExpression") {
      visit(node.consequent)
      visit(node.alternate)
      return
    }
    if (node.type === "MemberExpression") return
    if (node.type === "CallExpression" && !(node.callee.type === "Identifier" && CLASS_CALLEES.has(node.callee.name))) return
    if (node.type === "Literal" && typeof node.value === "string") {
      report(context, node, node.value, {})
      return
    }
    if (node.type === "TemplateLiteral") {
      node.quasis.forEach((q, i) => {
        const raw = q.value.cooked ?? q.value.raw
        report(context, q, raw, {
          partialStart: i > 0 && !/^\s/.test(raw),
          partialEnd: i < node.quasis.length - 1 && !/\s$/.test(raw),
        })
      })
      node.expressions.forEach(visit)
      return
    }
    for (const key of Object.keys(node)) {
      if (key === "parent" || key === "loc" || key === "range") continue
      const child = node[key]
      if (Array.isArray(child)) child.forEach(visit)
      else if (child && typeof child === "object") visit(child)
    }
  }
  visit(root)
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: { description: "Class strings use palette tokens only — no raw colours, palette names, removed tokens or opacity tints" },
    messages: {
      raw: "`{{cls}}` is {{reason}}. Use a token from app/globals.css (see eslint-rules/no-raw-colors.js).",
    },
    schema: [],
  },
  create(context) {
    const seen = new Set()
    return {
      // `className`, and the pieces' extra slots (`overlayClassName`,
      // `contentClassName` …).
      JSXAttribute(node) {
        const name = node.name && node.name.name
        if (typeof name === "string" && CLASS_ATTR.test(name) && node.value) checkStrings(context, node.value, seen)
      },
      // A class string kept in a constant or a status map (`const link = …`
      // is not caught, but `STATUS_STYLE`, `iconClass`, `toneClasses` are).
      VariableDeclarator(node) {
        if (node.id.type === "Identifier" && CLASS_NAME.test(node.id.name) && node.init) checkStrings(context, node.init, seen)
      },
      Property(node) {
        const key = node.key.type === "Identifier" ? node.key.name : typeof node.key.value === "string" ? node.key.value : null
        if (key && !node.computed && CLASS_NAME.test(key)) checkStrings(context, node.value, seen)
      },
      CallExpression(node) {
        if (node.callee.type === "Identifier" && CLASS_CALLEES.has(node.callee.name)) {
          node.arguments.forEach((arg) => checkStrings(context, arg, seen))
        }
      },
    }
  },
}

module.exports = rule
module.exports.checkClass = checkClass
module.exports.ALLOWED_ALPHA = ALLOWED_ALPHA
module.exports.TOKENS = TOKENS
