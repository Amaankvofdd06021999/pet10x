/**
 * The Services and prices editor's form rules.
 *
 * An appointment type is a service with two differences from the
 * business_services form (`validateServiceInput`, Task 5.2): the calendar
 * needs a duration, so it is required here (appointment_types.duration_min is
 * not null, 5–600), and a blank price means "not set yet" — stored as 0 and
 * shown as "Price on request", which is what seed_business_defaults writes.
 * Everything else is that validator, so the two forms cannot drift.
 */

import {
  validateServiceInput, SERVICE_MINUTES_MIN, SERVICE_MINUTES_MAX, type ServiceErrors,
} from "@/lib/data/fees"
import { formatMoney } from "./time"

export type AppointmentTypeInput = { name: string; duration: string; price: string }
export type AppointmentTypeValue = { name: string; durationMin: number; priceCents: number }

export function validateAppointmentType(
  input: AppointmentTypeInput,
): { ok: true; value: AppointmentTypeValue } | { ok: false; errors: ServiceErrors } {
  const res = validateServiceInput({
    name: input.name,
    duration: input.duration,
    price: input.price.trim() === "" ? "0" : input.price,
  })
  const errors: ServiceErrors = res.ok ? {} : { ...res.errors }
  const durationMissing = input.duration.trim() === ""
  if (durationMissing) {
    errors.duration = `Enter whole minutes from ${SERVICE_MINUTES_MIN} to ${SERVICE_MINUTES_MAX}.`
  }
  if (!res.ok || durationMissing || res.value.durationMin === null) return { ok: false, errors }
  return {
    ok: true,
    value: { name: res.value.name, durationMin: res.value.durationMin, priceCents: res.value.priceCents },
  }
}

/** price_cents 0 is "no price set", never "free". */
export function typePriceLabel(priceCents: number): string {
  return priceCents === 0 ? "Price on request" : formatMoney(priceCents)
}
