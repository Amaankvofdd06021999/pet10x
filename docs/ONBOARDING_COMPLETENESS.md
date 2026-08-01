# Onboarding & resident completeness

## The problem, measured

Onboarding captured a building-link request and nothing else — welcome, code,
done. A manager approving someone received a name. Production on 2026-08-01:

| | |
| --- | --- |
| Owners with no phone | **25 / 25** |
| Pets with no emergency contact | **42 / 43** |
| Pets with no documents | 17 / 43 |
| Pets with no unit | 8 / 43 |
| Pets with no vaccination record | 4 / 43 |

Every one of those is a direct consequence: the app never asked.

## Principles

**The building decides what is mandatory.** `buildings.pet_rules` already
carries `require_rabies`, `require_core_vaccines`, `require_license`,
`require_insurance`, `require_spay_neuter`, and `computeCompliance` already
reads them. Onboarding asks for what *that* building enforces, so a standalone
owner is asked for almost nothing and a strict building asks for everything.

**Unit is mandatory regardless.** It is not compliance, it is identification —
without it a manager cannot place a resident or their pets against a unit.

**Phone is not asked for.** `profiles.email` is populated from the auth account
for every user, so a contact channel already exists; demanding a second one at
registration costs completion rate for no capability the manager does not
already have.

**Skipping is allowed; forgetting is not.** A hard gate on document upload
loses the person signing up at 9pm without a vaccination certificate to hand —
and locks them out of the very screens that would help them comply.
Incompleteness is instead a first-class state that both sides can see, and
that a manager can act on.

## What is asked, and why

| Item | Source | Required when | Why a manager needs it |
| --- | --- | --- | --- |
| Unit | `resident_links.unit_id` | Always, if linked | Places the resident and their pets |
| Pet name / species / breed | `pets` | Always | Nothing else attaches without a pet |
| Rabies | `pet_vaccinations` | `pet_rules.require_rabies` | Compliance percentage |
| Core vaccines | `pet_vaccinations` | `pet_rules.require_core_vaccines` | Compliance percentage |
| Municipal licence | `pet_documents` | `pet_rules.require_license` | Compliance percentage |
| Liability insurance | `pet_documents` | `pet_rules.require_insurance` | Compliance percentage |
| Spayed / neutered | `pets.neutered` | `pet_rules.require_spay_neuter` | Compliance percentage |
| Emergency contact | `pet_emergency_contacts` | Always | `/emergency/[code]` is blank without it — the page a stranger scans when they find a loose pet |

## The chase loop

`registration_status` already contains **`info_requested`**, unused. The loop
uses it rather than inventing a parallel state:

1. A resident's gaps are derived, never stored — one function, both roles, so
   the two views cannot disagree.
2. Manager sees an **Incomplete** filter in Residents listing exactly what each
   person is missing.
3. One tap sets `info_requested` and sends the resident a notification **and an
   email** (Resend is already wired for invites) naming the missing items.
4. The resident sees a persistent card on Home listing the same items, each
   deep-linking to the screen that fixes it.
5. It clears itself as they fill it. Nothing to mark resolved.

## Deliberately not done

- **No new tables.** Gaps are derived from data that already exists. A stored
  completeness score would drift the moment anything changed.
- **No SMS.** It needs a provider, a number, and per-message cost — and phone
  numbers we do not have yet, which is the problem being solved.
- **No hard gate.** See the principle above.
