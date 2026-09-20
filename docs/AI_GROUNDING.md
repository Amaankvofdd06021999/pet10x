# Why the assistant's answers are not grounded

**Status as of 2026-09-19: grounding is OFF.** Answers carry no citations. This
is a tier constraint, not a bug, and it is one environment variable to reverse.

## What grounding was

`AI_MODEL_VET_QA` pointed at `groq/compound-mini`. Compound is the only Groq
model family with built-in web search. It searched the domains pinned in
`AI_GROUNDING_DOMAINS` (VIN's Veterinary Partner and the Merck Veterinary
Manual), reported what it read in `executed_tools`, and `lib/ai/citations.ts`
turned that into the "Veterinary references" list under each answer. Nothing was
ever ingested from either site — they are read live at answer time, which is what
keeps the feature clear of both publishers' terms.

## Why it stopped working

Compound feeds every page it fetches back through its own model. Groq answers
**413 `request_too_large`** when a single request exceeds the account's
tokens-per-minute budget, and on the free tier (70K TPM for compound) the fetched
pages breach it by themselves.

Measured 2026-09-19, eight ordinary owner questions, one attempt each:

| | |
|---|---|
| Answered at all | **1 / 8** |
| Answered *with citations* | **0 / 8** |

That is not flakiness to retry around. The route already retried once and both
attempts failed, so the owner got an error instead of an answer.

Things that do **not** help, all tested:

- narrowing `include_domains` to a single domain — still 413
- removing `search_settings` entirely — still 413
- `search_settings.max_results` — accepted and silently ignored
- `groq/compound` instead of `compound-mini` — still 413

The payload is compound's own. We have no knob on it.

## What runs instead

`openai/gpt-oss-120b`, which has no web search, so it answers from its own
weights. Consequences, all deliberate:

- **The prompt changed.** `vetQaSystemPrompt` no longer carries the "you MUST
  search and cite" mandate. Telling a model with no search tool that it must cite
  does not produce a citation, it produces an invented one — the worst possible
  failure on a pet-health screen. The ungrounded branch states there is no
  internet access and forbids naming any source. Asked point-blank which page of
  the Merck manual it read, the model answers that it cannot browse.
- **The status line changed**, from "Checking veterinary references…" to
  "Thinking about your question…", because the first sentence was untrue.
- **The empty-state copy changed.** It used to promise "Answers cite the
  veterinary references they came from."
- **`CitationList` is unchanged** — it renders nothing on an empty list, so it
  simply does not appear.

## The token budget is tighter now

Plain models allow **8K TPM** against compound's 70K, and 413 is reachable
through conversation length alone. `MAX_HISTORY_TURNS` went 12 → 6 and the answer
cap 1200 → 900 (`MAX_ANSWER_TOKENS`). Measured on a worst case — full dossier,
maximum history, long answers:

| | prompt tokens | total | headroom |
|---|---|---|---|
| old (12 turns / 1200) | 6,109 | ~7,300 with a full answer | ~8% |
| new (6 turns / 900) | 3,475 | 3,825 | 4,175 |

**Raise those two constants only together with the tier.**

## Turning grounding back on

On a paid Groq tier, set:

```
AI_MODEL_VET_QA=groq/compound-mini
```

`isGroundingAvailable()` in `lib/ai/router.ts` keys off the model ID, so the
grounded prompt, the `search_settings` on the request and the "Checking
veterinary references…" status all switch back on together. Then re-run the
eight-question check above before believing it — the tier is the variable, and
only measurement settles it.

## If citations are needed without a paid tier

Do the retrieval ourselves rather than letting compound do it: search, fetch,
trim to a few short snippets, and pass those to a plain model. That puts payload
size under our control and makes the citation list ours rather than scraped from
`executed_tools`. It needs a search API — Groq's own error messages show compound
uses Tavily underneath, which has its own free tier. This is real work, not a
config change, and it is not currently built.
