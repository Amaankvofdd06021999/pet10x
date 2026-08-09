"use client"

import { useCallback, useEffect, useState } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import type { Species } from "./types"

/**
 * Curated affiliate products.
 *
 * Manual rather than a marketplace feed: an Associates account needs approval
 * and carries sales thresholds, and curating means a building is never shown a
 * product nobody vetted. Admin-managed; RLS allows read to anyone signed in
 * and write to admins only.
 */

export interface ShopItem {
  id: string
  title: string
  description: string | null
  imageUrl: string | null
  /** Display guide, not a synced price — merchants change theirs and we do not poll. */
  priceLabel: string | null
  currency: string
  affiliateUrl: string
  merchant: string | null
  category: string | null
  /** Empty means "suits any pet". */
  species: string[]
}

export interface ShopResult {
  data: ShopItem[]
  isLoading: boolean
  error: string | null
  refetch: () => void
}

/**
 * @param forSpecies When given, only items tagged for that species (or tagged
 *   for none, which means universal). Passing it avoids showing an aquarium
 *   filter to someone with only a dog.
 */
export function useShopItems(forSpecies?: Species | null): ShopResult {
  const [data, setData] = useState<ShopItem[]>([])
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setLoading(false)
      return
    }
    const { data: rows, error: err } = await supabase
      .from("shop_items")
      .select("*")
      .eq("is_active", true)
      .order("sort_order")
      .order("title")

    if (err) {
      setError(err.message)
      setData([])
    } else {
      const mapped: ShopItem[] = (rows ?? []).map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        imageUrl: r.image_url,
        priceLabel: r.price_label,
        currency: r.currency,
        affiliateUrl: r.affiliate_url,
        merchant: r.merchant,
        category: r.category,
        species: r.species ?? [],
      }))
      // Filtered client-side: the catalogue is small and an overlaps query
      // would still need the "empty means universal" case handled here.
      setData(
        forSpecies ? mapped.filter((i) => i.species.length === 0 || i.species.includes(forSpecies)) : mapped,
      )
      setError(null)
    }
    setLoading(false)
  }, [forSpecies])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { data, isLoading, error, refetch }
}

/**
 * Defence in depth on the outbound link.
 *
 * The database already rejects anything that is not http(s), but this value
 * ends up in an href and the check costs nothing — a javascript: URL reaching
 * a link is stored XSS, and relying on a single layer for that is thin.
 */
export function safeAffiliateUrl(url: string): string | null {
  try {
    const u = new URL(url)
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null
  } catch {
    return null
  }
}
