# Roles, personas and who sees what

## The bug, and what it actually was

Building alerts addressed to managers appeared in a pet owner's feed.

It was **not** an RLS hole. Every policy is correctly scoped, and every
notification row was correctly addressed — owners held only `assistant`/`care`
kinds, managers only `building`.

The cause was two things meeting:

1. `amaankvofdd@gmail.com` had `role = 'pet_owner'` **and**
   `is_super_admin = true`. `profiles.role` and `profiles.is_super_admin` are
   independent columns and nothing stops them disagreeing.
2. `useNotifications` selected with **no `WHERE`**, relying on RLS to narrow
   the result. The policy is
   `profile_id = auth.uid() OR is_admin()` — so for that account it returned
   every user's notifications.

Measured on production before the fix, impersonating that account:

| | rows returned |
| --- | --- |
| notifications | **20** (all of them, 4 addressed to managers) |
| violations | **12** |
| resident_links | **28** |
| profiles | **41** |
| pets | **46** |

## Principle: RLS is a floor, not a WHERE clause

A query must ask for the rows it wants. RLS then guarantees it cannot get
more. Reading with no filter and trusting RLS to narrow is correct only for
unprivileged accounts, and silently wrong for every privileged one — which is
the exact case least likely to be tested.

`useNotifications` now filters on `profile_id` explicitly. The audit that found
it also cleared the four other unfiltered reads (`business_services`,
`business_reviews`, `businesses`, `billing_plans` — all public catalogue data,
correctly public).

## Personas

`profiles.role` holds one value, so it cannot describe a manager who owns a
dog, or an admin who is also a resident. The grants that decide this already
exist as rows:

| Persona | Granted by |
| --- | --- |
| Pet owner | every account |
| Building manager | ≥ 1 row in `building_managers` |
| Strata portfolio | ≥ 2 buildings in `building_managers` |
| Admin | `profiles.is_super_admin` |
| Business | `profiles.role = 'business'` |

`public.my_personas()` reports them, computed under SECURITY DEFINER so a
browser cannot claim one it was never granted.

**A persona is a view, not a permission.** Switching changes which surface
renders and which scope queries ask for. It grants nothing: RLS is unchanged
and unreachable from the client. An admin wearing the pet-owner persona still
*could* read everything at the database level — the app simply stops asking.

### Switching

- The switcher renders only when more than one persona was granted, so a plain
  signup never sees a control implying access it does not have. Being granted
  is the only way to gain an option.
- The choice is remembered per profile id, never globally — two accounts on one
  device must not inherit each other's view.
- A remembered choice is re-validated against current grants on every load, so
  access revoked elsewhere cannot survive in localStorage.
- Managers of several buildings also get an active-building picker; that is
  what makes someone "strata".

## Alerts tabs

Previously a fixed six. A pet owner was offered Compliance, Incidents and
Building; a manager was offered Care and Assistant. Both sets contained dead
ends.

Tabs are now derived from the categories actually present in the viewer's own
notifications. This beats a role→tab map because it cannot drift: add a
notification kind, or send an existing one to a new audience, and the tab
appears for exactly the people who receive it.

## Verified

Impersonated in SQL (`set local role authenticated` + `request.jwt.claims`):

| Account | `is_admin()` | RLS allows | App asks for | Manager alerts shown |
| --- | --- | --- | --- | --- |
| Plain pet owner | false | 2 | 2 | 0 |
| Building manager | false | 2 | 2 | 0 |
| Pet owner + admin flag | true | 20 | 3 | **0** |

The privileged account still *may* read 20 — that is what the admin grant
means, and removing it is a policy decision, not a bug fix. What changed is
that the app no longer dumps them into a pet owner's alerts.

## Outstanding

- **`profiles.role` and `is_super_admin` can still disagree.** Personas make
  the app resilient to it, but the incoherent row remains. Decide whether
  `amaankvofdd@gmail.com` should keep the admin grant.
- **`useBuildingPets` is unscoped.** For a manager RLS limits it correctly; for
  an admin it returns every building's pets. The strata portfolio screens rely
  on the multi-building behaviour, so narrowing it needs its own pass.
