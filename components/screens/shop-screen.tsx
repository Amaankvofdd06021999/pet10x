"use client"

import { useState } from "react"
import Image from "next/image"
import { IOSNavBar } from "@/components/ios-nav-bar"
import { NavBackButton } from "@/components/nav-back-button"
import { usePets } from "@/lib/data"
import { useShopItems, safeAffiliateUrl } from "@/lib/data/shop"
import { ExternalLink, Loader2, ShoppingBag } from "lucide-react"

/**
 * Curated pet products, each linking out to a merchant.
 *
 * Filtered to the species the household actually owns — an aquarium filter is
 * noise to someone with one dog. Items tagged for no species are universal and
 * always shown.
 */
export function ShopScreen({ onNavigate }: { onNavigate?: (screen: string) => void }) {
  const { data: pets } = usePets()
  const { data: items, isLoading } = useShopItems()
  const [category, setCategory] = useState<string>("all")

  const owned = new Set(pets.map((p) => p.species))
  const relevant = items.filter((i) => i.species.length === 0 || i.species.some((s) => owned.has(s as never)))

  const categories = ["all", ...Array.from(new Set(relevant.map((i) => i.category).filter(Boolean) as string[]))]
  const shown = category === "all" ? relevant : relevant.filter((i) => i.category === category)

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <IOSNavBar title="Shop" largeTitle={false} leftAction={<NavBackButton onClick={() => onNavigate?.("home")} />} />

      <main className="ios-scroll flex-1 px-4 pb-24 pt-2">
        {categories.length > 2 && (
          <div className="no-scrollbar mb-4 flex gap-1.5 overflow-x-auto">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`flex-shrink-0 rounded-full px-3 py-1.5 text-[12.5px] font-semibold capitalize transition-colors ${
                  category === c ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : shown.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
            <ShoppingBag className="mx-auto h-7 w-7 text-muted-foreground" />
            <p className="mt-2 text-[15px] font-semibold text-foreground">Nothing here yet</p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              We&apos;re still picking products worth recommending. Check back soon.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              {shown.map((item) => {
                const href = safeAffiliateUrl(item.affiliateUrl)
                if (!href) return null
                return (
                  <a
                    key={item.id}
                    href={href}
                    target="_blank"
                    // noreferrer as well as noopener: the destination is a
                    // commercial third party and does not need our URL.
                    rel="noopener noreferrer nofollow sponsored"
                    className="flex flex-col overflow-hidden rounded-2xl card-interactive transition-transform active:scale-[0.98]"
                  >
                    <div className="relative aspect-square w-full bg-muted">
                      {item.imageUrl ? (
                        <Image src={item.imageUrl} alt="" fill className="object-cover" unoptimized />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center">
                          <ShoppingBag className="h-7 w-7 text-muted-foreground" />
                        </span>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col p-3">
                      <p className="line-clamp-2 text-[13.5px] font-semibold leading-snug text-foreground">
                        {item.title}
                      </p>
                      {item.merchant && (
                        <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{item.merchant}</p>
                      )}
                      <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                        <span className="text-[13px] font-bold text-primary">{item.priceLabel ?? "View"}</span>
                        <ExternalLink className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                      </div>
                    </div>
                  </a>
                )
              })}
            </div>

            {/* Required, not decorative: recommending products for commission
                without saying so is the kind of thing that gets an app pulled,
                and prices are not synced so they must not read as live. */}
            <p className="mt-5 text-center text-[11px] leading-relaxed text-muted-foreground">
              Pet10x may earn a commission on purchases made through these links, at no extra cost to you.
              Prices are a guide — the merchant&apos;s checkout is the real one.
            </p>
          </>
        )}
      </main>
    </div>
  )
}
