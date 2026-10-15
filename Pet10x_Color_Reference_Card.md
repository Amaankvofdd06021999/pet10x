# Pet10x Colour Reference Card

The single source of truth is `app/globals.css`. This card mirrors it; if the
two ever disagree, the CSS wins. Design rationale lives in
`docs/superpowers/specs/2026-10-15-ui-system-design.md` §1.

## The rules

1. **Text is never orange.** All text is `foreground` (headings, values) or
   `muted-foreground` (body, meta, hints). White text appears only on a
   `primary` or `destructive` fill.
2. **Orange is for surfaces that carry meaning, not words:** buttons, icons,
   indicators (the active-tab underline, a dot) and the soft highlight.
3. **Each status colour has two strengths:** the solid (fills, icons, dots)
   and `-soft` (the tinted background under a badge or banner, always with
   `foreground` text). No opacity tints (`bg-x/10`) — use `-soft`.
4. **No teal.** Selected states and icons are orange; tags are info blue.
5. **Links** are marked by weight and a chevron, not colour.

## Light

| Group | Token | Value | Use |
|---|---|---|---|
| Brand | `--primary` | `#FD9340` | Primary buttons, icons, indicators, focus ring |
| | `--primary-hover` | `color-mix(in oklab, #FD9340, black 8%)` | Primary button hover |
| | `--primary-soft` | `#FFF1E6` | Brand badge, soft highlight, icon tile |
| | `--primary-foreground` | `#FFFFFF` | Text on a primary fill (bold) |
| Neutrals | `--background` | `#F8F9FD` | Page ground |
| | `--card` | `#FFFFFF` | Every raised surface |
| | `--foreground` | `#2C2E30` | Headings, values, all primary text |
| | `--muted-foreground` | `#646569` | Body, meta, helper text |
| | `--border` | `#E9EAF2` | Hairlines, card borders |
| | `--input` | `#E1E2EC` | Field borders |
| | `--muted` | `#EDEEF6` | Neutral badge, hover surface, skeleton |
| Status | `--success` / `--success-soft` | `#1E9E62` / `#E6F5EE` | Done, current, approved |
| | `--warning` / `--warning-soft` | `#F0A81E` / `#FFF6E0` | Due soon, pending, investigating |
| | `--destructive` / `--destructive-soft` | `#D93A2B` / `#FDECEA` | Danger actions and errors only |
| | `--info` / `--info-soft` | `#2555C7` / `#E9EEFA` | Tags, informational notes |
| Charts | `--chart-1..5` | primary, success, info, warning, destructive | Series colours, in that order |
| Focus | `--ring` | `#FD9340` | Field focus ring |

Primary buttons take a **dark** focus ring (`ring-foreground`, offset 2px):
an orange ring on an orange button would be invisible.

Known trade-off: white bold text on `#FD9340` is about 2.2:1, below WCAG AA.
It was chosen deliberately; because every button reads `--primary`, changing
it later is one line.

## Dark

Same names, the existing dark ground. Soft backgrounds are dark tints so the
light `foreground` text on them stays readable (asserted in
`lib/contrast.test.ts`).

| Token | Value |
|---|---|
| `--background` / `--card` | `#131417` / `#1C1D21` |
| `--foreground` / `--muted-foreground` | `#F2F3F5` / `#9B9CA3` |
| `--border` / `--input` / `--muted` | `#2E2F35` / `#35363D` / `#26272C` |
| `--primary` / `--primary-soft` / `--primary-foreground` | `#FD9340` / `#3A2616` / `#FFFFFF` |
| `--success` / `--success-soft` | `#3FBF83` / `#12301F` |
| `--warning` / `--warning-soft` | `#FFC94D` / `#352A0F` |
| `--destructive` / `--destructive-soft` | `#F1584A` / `#3A1715` |
| `--info` / `--info-soft` | `#6E92F2` / `#18213D` |
| `--ring` | `#FD9340` |

## Type and radius

| Token | Size | | Token | Radius |
|---|---|---|---|---|
| `text-caption` | 12px | | `rounded-sm` | 8px |
| `text-meta` | 13px | | `rounded-md` | 12px |
| `text-body` | 15px | | `rounded-lg` | 16px |
| `text-title` | 17px | | `rounded-full` | pill |
| `text-heading` | 22px | | | |

## Retired

`#B85A12`, `#A9520F`, `#A04E0F` (the brown "strong" oranges), `#2FBFB8`
(teal), `#96660A`, `#147A4A`, and the hard-coded yellows `#FFF9E6`,
`#FFFBEF`, `#B38F00` (all now `warning-soft`, `#FFF6E0`, with dark text). The old
token names `--primary-strong`, `--primary-strong-hover`, `--primary-text`,
`--accent`, `--warning-strong` and `--success-strong` are gone, as are
opacity tints on colours (`bg-success/10` and friends).

## Enforced

`eslint-rules/no-raw-colors.js` fails lint on any class that names a colour
outside this card: hex/rgb/hsl, Tailwind palette names (`orange-600`), the
retired tokens, and opacity modifiers on colours. The only translucent
colours allowed are the overlays `bg-black/40`, `bg-black/50` (backdrops,
scrims), `bg-white/10`, `bg-white/15` (light tiles on a dark band),
`bg-card/85`, `bg-background/80` (sticky glass bars), and `bg-background/95` (near-opaque glass for headers and menus over scrolling content).
