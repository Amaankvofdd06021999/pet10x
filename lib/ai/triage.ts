import "server-only"

import { groqComplete } from "./provider"
import { modelFor } from "./router"

/**
 * Pet10x — the safety floor.
 *
 * An emergency must never depend on a language model choosing to treat it as
 * one. Everything in RED_FLAGS is matched in code and short-circuits before any
 * model writes prose; the classifier below only catches phrasings the patterns
 * miss, and it can escalate but never de-escalate a pattern hit.
 *
 * If you are tempted to trim this file for schedule: this is the one failure
 * mode in the product with real consequences.
 */

export type TriageLevel = "emergency" | "urgent" | "routine"

interface RedFlag {
  /** Stable id, logged with the message so the rule that fired is auditable. */
  id: string
  /** Shown on the emergency card so the owner knows what we reacted to. */
  label: string
  pattern: RegExp
}

/**
 * Written as "symptom OR toxin, near a pet noun or a first-person report".
 * Deliberately over-triggering: a false emergency costs a phone call, a missed
 * one costs an animal.
 */
export const RED_FLAGS: RedFlag[] = [
  {
    id: "bloat_gdv",
    label: "Possible bloat / GDV",
    // "trying to be sick but nothing is coming up" is how owners actually
    // describe unproductive retching — the classifier bake-off caught this
    // phrasing slipping through as merely urgent.
    pattern:
      /\b(bloat(ed|ing)?|gdv|gastric dilat|distended (abdomen|belly|stomach)|swollen (abdomen|belly|stomach)|hard (belly|abdomen)|unproductive retch|retching (but )?nothing|dry heav|(trying|tries|trying) to (be sick|vomit|throw up)[\s\S]{0,40}nothing|gagging[\s\S]{0,40}nothing)/i,
  },
  {
    id: "seizure",
    label: "Seizure activity",
    pattern: /\b(seizur|seizing|convuls|fitting|epilep|paddling|tremor(s|ing)? (all over|uncontroll))/i,
  },
  {
    id: "collapse",
    label: "Collapse or unresponsiveness",
    pattern:
      /\b(collaps|unconscious|unresponsive|won'?t wake|not waking|passed out|fainted|limp and (cold|unresponsive)|pale gums|white gums|blue gums)/i,
  },
  {
    id: "breathing",
    label: "Laboured breathing",
    pattern:
      /\b(can'?t breathe|cannot breathe|not breathing|labou?red breathing|struggling to breathe|trouble breathing|difficulty breathing|gasping|choking|open[- ]mouth breathing|blue tongue|respiratory distress)/i,
  },
  {
    id: "toxin",
    label: "Possible poisoning",
    pattern:
      /\b(ate|eaten|ingest(ed)?|swallow(ed)?|licked|got into|chewed|drank)\b[\s\S]{0,80}\b(chocolate|cocoa|xylitol|birch sugar|sugar[- ]free gum|grape|raisin|sultana|currant|lil(y|ies)|antifreeze|ethylene glycol|coolant|rodenticide|rat poison|mouse poison|slug bait|metaldehyde|snail bait|ibuprofen|advil|acetaminophen|tylenol|paracetamol|naproxen|aleve|aspirin|marijuana|cannabis|thc|edible|weed|onion|garlic|macadamia|alcohol|nicotine|vape|batter(y|ies)|permethrin|amphetamine|adderall|antidepressant|sleeping pill|caffeine pill|mushroom|sago palm|cycad|play ?doh|silica gel|fertili[sz]er|d[- ]?con)/i,
  },
  {
    id: "toxin_generic",
    label: "Possible poisoning",
    pattern: /\b(poison(ed|ing)?|toxic (dose|amount)|overdos|got into (my|the) (meds|medication|pills))/i,
  },
  {
    id: "urinary_blockage",
    label: "Possible urinary blockage",
    pattern:
      /\b(strain(ing)? to (pee|urinat)|can'?t (pee|urinat)|cannot (pee|urinat)|not (peeing|urinating)|blocked (cat|tom)|nothing com(es|ing) out|in and out of the litter|crying in the litter|urinary (blockage|obstruction)|no urine)/i,
  },
  {
    id: "heatstroke",
    label: "Possible heatstroke",
    pattern:
      /\b(heat ?stroke|heat exhaustion|overheat|left in (the|a) (hot )?car|too hot and (panting|collaps)|body temp(erature)? (of )?(10[567]|4[12]))/i,
  },
  {
    id: "bleeding",
    label: "Uncontrolled bleeding",
    pattern:
      /\b(bleeding (heavily|badly|a lot|non ?stop|won'?t stop)|won'?t stop bleeding|h(a)?emorrhag|blood (everywhere|pouring|gushing)|deep (cut|wound|gash)|hit by (a )?car|deep laceration|impaled)/i,
  },
  {
    id: "dystocia",
    label: "Difficult labour",
    // Durations arrive as digits or as words ("pushing for over two hours").
    pattern:
      /\b(in labou?r|whelp(ing)?|queening|giving birth|pushing for (over |more than )?(\d|one|two|three|four|five|six|an? )|stuck (puppy|kitten)|dystocia|contractions? for)/i,
  },
  {
    id: "eye_trauma",
    label: "Eye injury",
    // "eye is bulging", "eye has popped" — the verb rarely abuts the noun.
    pattern:
      /\b(eye\b[\s\S]{0,20}\b(popped|bulging|out of (its |the )?socket|injur|trauma|punctur)|proptos|scratched (his|her|its|my dog'?s|my cat'?s) eye|something in (his|her|its) eye|cloudy painful eye)/i,
  },
  {
    id: "envenomation",
    label: "Bite or sting",
    // Both voices, and the species list must be shared between them.
    pattern:
      /\b((snake|rattlesnake|copperhead|adder|spider|black widow|brown recluse|scorpion) bit|bitten by (a |an )?(snake|rattlesnake|copperhead|adder|spider|black widow|brown recluse|scorpion)|bee sting[\s\S]{0,40}(swell|face|throat)|swollen (face|muzzle|throat)|anaphyla)/i,
  },
  {
    id: "bloat_vomit_blood",
    label: "Blood in vomit or stool",
    pattern: /\b(vomiting blood|blood in (his|her|its|the) (vomit|stool|poop|diarrhea|diarrhoea)|bloody diarrh|black tarry stool|mel(a)?ena|h(a)?ematemesis)/i,
  },
]

export interface TriageResult {
  level: TriageLevel
  /** Populated only for pattern hits — the emergency card names what fired. */
  flags: { id: string; label: string }[]
  /** True when code decided, false when the classifier did. Logged for audit. */
  deterministic: boolean
  /** The classifier never answered; only the patterns cleared this message. */
  classifierFailed?: boolean
}

/** Pure, synchronous, no network. The authority on emergencies. */
export function matchRedFlags(text: string): { id: string; label: string }[] {
  const hits: { id: string; label: string }[] = []
  const seen = new Set<string>()
  for (const flag of RED_FLAGS) {
    if (flag.pattern.test(text) && !seen.has(flag.label)) {
      seen.add(flag.label)
      hits.push({ id: flag.id, label: flag.label })
    }
  }
  return hits
}

const CLASSIFIER_PROMPT = `You are a veterinary triage classifier for a pet owner app. Read the owner's message and reply with ONLY a JSON object: {"level":"emergency"|"urgent"|"routine"}.

emergency — the animal needs a veterinarian right now: collapse, seizure, difficulty breathing, suspected poisoning or toxin ingestion, bloat, straining to urinate without producing urine, uncontrolled bleeding, heatstroke, trauma, difficult labour, eye injury, snake or spider bite, blood in vomit or stool.
urgent — should be seen within a day or two: persistent vomiting or diarrhoea, limping that is not improving, a wound that is not bleeding heavily, refusing food for more than a day, a painful ear or eye, a lump that changed.
routine — general information, nutrition, behaviour, preventive care, questions about the pet's own records, or anything not describing a current problem.

When uncertain between two levels, choose the more serious one. Reply with the JSON object and nothing else.`

/**
 * Full triage: patterns first, then the classifier as a net for phrasings the
 * patterns miss. The classifier may raise the level, never lower it, and a
 * classifier failure degrades to the pattern verdict rather than to an error —
 * triage being unavailable must not stop the owner getting an answer.
 */
export async function triage(message: string, signal?: AbortSignal): Promise<TriageResult> {
  const flags = matchRedFlags(message)
  if (flags.length > 0) return { level: "emergency", flags, deterministic: true }

  try {
    const { content } = await groqComplete(
      {
        model: modelFor("red_flag"),
        messages: [
          { role: "system", content: CLASSIFIER_PROMPT },
          { role: "user", content: message.slice(0, 4000) },
        ],
        temperature: 0,
        // Generous on purpose. A reasoning model spends tokens thinking before
        // it writes, so a tight cap yields truncated JSON and a 400 — which is
        // exactly how this classifier sat dead and silent in an earlier build.
        // The configured model answers in ~8 tokens, so the headroom is free.
        max_completion_tokens: 200,
        response_format: { type: "json_object" },
      },
      signal,
    )
    const parsed = JSON.parse(content) as { level?: string }
    if (parsed.level === "emergency") return { level: "emergency", flags: [], deterministic: false }
    if (parsed.level === "urgent") return { level: "urgent", flags: [], deterministic: false }
    if (parsed.level === "routine") return { level: "routine", flags: [], deterministic: false }
    throw new Error(`classifier returned an unknown level: ${String(parsed.level)}`)
  } catch (err) {
    // The patterns already cleared this message, so routine is the honest
    // verdict — but `deterministic: false` records that the second opinion was
    // never obtained, rather than claiming code decided it.
    console.error("[ai] triage classifier unavailable — pattern verdict stands", err)
    return { level: "routine", flags: [], deterministic: false, classifierFailed: true }
  }
}
