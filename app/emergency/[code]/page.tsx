"use client"

import { useState, useEffect } from "react"
import {
  AlertTriangle,
  Dog,
  Cat,
  Phone,
  Clock,
  Shield,
  ChevronDown,
  ChevronUp,
  Info,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useEmergencyDirectory } from "@/lib/data"

// 4 hour session token
const SESSION_HOURS = 4

export default function EmergencyPage() {
  const { data: buildingData } = useEmergencyDirectory()
  const [expandedFloor, setExpandedFloor] = useState<number | null>(null)
  const [timeRemaining, setTimeRemaining] = useState(SESSION_HOURS * 60 * 60) // seconds
  const [isExpired, setIsExpired] = useState(false)

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          setIsExpired(true)
          clearInterval(interval)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  }

  if (isExpired) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#1a1a1a] p-6">
        <div className="text-center">
          <AlertTriangle className="mx-auto h-12 w-12 text-[#FF453A]" />
          <h1 className="mt-4 text-[20px] font-bold text-white">Session Expired</h1>
          <p className="mt-2 text-[14px] text-[#8E8E8E]">
            This emergency access link has expired. Scan the QR code again or contact building management.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-[#1a1a1a]">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-[#333] bg-[#1a1a1a]/95 backdrop-blur-xl px-4 pt-safe">
        <div className="flex items-center justify-between py-3">
          <div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-[#FF453A]" />
              <h1 className="text-[17px] font-bold text-white">EMERGENCY PET INFO</h1>
            </div>
            <p className="mt-0.5 text-[12px] text-[#8E8E8E]">{buildingData.name}</p>
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-[#FF453A]/20 px-2.5 py-1">
            <Clock className="h-3 w-3 text-[#FF453A]" />
            <span className="text-[12px] font-mono font-bold text-[#FF453A]">
              {formatTime(timeRemaining)}
            </span>
          </div>
        </div>
      </header>

      <main className="px-4 pb-8">
        {/* Building Info */}
        <section className="mt-4 mb-4">
          <div className="rounded-xl border border-[#333] bg-[#2C2C2E] p-3">
            <p className="text-[14px] font-semibold text-white">{buildingData.name}</p>
            <p className="mt-0.5 text-[12px] text-[#8E8E8E]">{buildingData.address}</p>
          </div>
        </section>

        {/* Pet Summary */}
        <section className="mb-4">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-[#2C2C2E] border border-[#333] p-3 text-center">
              <p className="text-[22px] font-bold text-white">{buildingData.totalPets}</p>
              <p className="text-[10px] font-medium text-[#8E8E8E]">Total Pets</p>
            </div>
            <div className="rounded-xl bg-[#2C2C2E] border border-[#333] p-3 text-center">
              <div className="flex items-center justify-center gap-1">
                <Dog className="h-4 w-4 text-[#FD9340]" />
                <p className="text-[22px] font-bold text-white">{buildingData.dogs}</p>
              </div>
              <p className="text-[10px] font-medium text-[#8E8E8E]">Dogs</p>
            </div>
            <div className="rounded-xl bg-[#2C2C2E] border border-[#333] p-3 text-center">
              <div className="flex items-center justify-center gap-1">
                <Cat className="h-4 w-4 text-[#2FBFB8]" />
                <p className="text-[22px] font-bold text-white">{buildingData.cats}</p>
              </div>
              <p className="text-[10px] font-medium text-[#8E8E8E]">Cats</p>
            </div>
          </div>
        </section>

        {/* Disclaimer */}
        <section className="mb-4">
          <div className="flex gap-2 rounded-xl border border-[#FF453A]/30 bg-[#FF453A]/10 p-3">
            <Info className="h-4 w-4 mt-0.5 flex-shrink-0 text-[#FF453A]" />
            <p className="text-[11px] leading-relaxed text-[#FF9F8E]">
              Supplementary information only. Not a life-safety system. Pet presence based on last
              known status and may not reflect real-time location. Always follow standard fire/rescue protocols.
            </p>
          </div>
        </section>

        {/* Floor-by-Floor */}
        <section>
          <h2 className="mb-2.5 text-[15px] font-semibold text-white">Floor-by-Floor Pet Presence</h2>
          {buildingData.floors.length === 0 && (
            <div className="rounded-xl border border-dashed border-[#333] bg-[#2C2C2E] p-8 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#3A3A3C]">
                <Dog className="h-6 w-6 text-[#8E8E8E]" />
              </div>
              <h3 className="mt-4 text-[15px] font-semibold text-white">No pets registered yet</h3>
              <p className="mx-auto mt-1 max-w-[22rem] text-[12px] leading-relaxed text-[#8E8E8E]">
                No pets are registered for this building yet. Once residents add their pets, their floor and unit details will appear here for first responders.
              </p>
            </div>
          )}
          <div className="flex flex-col gap-2">
            {buildingData.floors.map((floor) => {
              const isOpen = expandedFloor === floor.floor
              const petCount = floor.units.reduce((sum, u) => sum + u.pets.length, 0)
              const hasWarning = floor.units.some((u) =>
                u.pets.some((p) => p.notes.toLowerCase().includes("caution") || p.notes.toLowerCase().includes("aggressive"))
              )
              return (
                <div key={floor.floor} className="rounded-xl border border-[#333] bg-[#2C2C2E] overflow-hidden">
                  <button
                    onClick={() => setExpandedFloor(isOpen ? null : floor.floor)}
                    className="flex w-full items-center gap-3 p-3 text-left active:bg-[#3A3A3C]"
                  >
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[#3A3A3C]">
                      <span className="text-[13px] font-bold text-white">{floor.floor}</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-[14px] font-semibold text-white">Floor {floor.floor}</p>
                      <p className="text-[11px] text-[#8E8E8E]">
                        {petCount} pet{petCount !== 1 ? "s" : ""} &middot; {floor.units.length} unit{floor.units.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                    {hasWarning && (
                      <Badge className="bg-[#FF453A]/20 text-[#FF453A] border-0 text-[9px]">
                        CAUTION
                      </Badge>
                    )}
                    {isOpen ? <ChevronUp className="h-4 w-4 text-[#8E8E8E]" /> : <ChevronDown className="h-4 w-4 text-[#8E8E8E]" />}
                  </button>

                  {isOpen && (
                    <div className="border-t border-[#333] px-3 pb-3 pt-2">
                      {floor.units.map((unit) => (
                        <div key={unit.unit} className="mb-2 last:mb-0">
                          <p className="mb-1.5 text-[11px] font-semibold text-[#8E8E8E]">UNIT {unit.unit}</p>
                          {unit.pets.map((pet, i) => {
                            const SpeciesIcon = pet.species === "dog" ? Dog : Cat
                            const isDangerous = pet.notes.toLowerCase().includes("caution") || pet.notes.toLowerCase().includes("aggressive")
                            return (
                              <div
                                key={i}
                                className={`mb-1.5 rounded-lg p-2.5 ${
                                  isDangerous ? "bg-[#FF453A]/10 border border-[#FF453A]/30" : "bg-[#3A3A3C]"
                                }`}
                              >
                                <div className="flex items-center gap-2 mb-1">
                                  <SpeciesIcon className={`h-4 w-4 ${pet.species === "dog" ? "text-[#FD9340]" : "text-[#2FBFB8]"}`} />
                                  <span className="text-[13px] font-semibold text-white">{pet.name}</span>
                                  {isDangerous && (
                                    <Badge className="bg-[#FF453A] text-white border-0 text-[9px]">
                                      CAUTION
                                    </Badge>
                                  )}
                                </div>
                                <p className={`text-[11px] leading-relaxed ${isDangerous ? "text-[#FF9F8E]" : "text-[#AEAEB2]"}`}>
                                  {pet.notes}
                                </p>
                                <div className="mt-1.5 flex items-center gap-1.5">
                                  <Phone className="h-3 w-3 text-[#0A84FF]" />
                                  <span className="text-[11px] font-medium text-[#0A84FF]">{pet.emergency}</span>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        {/* Footer */}
        <div className="mt-6 text-center">
          <p className="text-[10px] text-[#555]">Pet10x Emergency Access &middot; Park10x Services Inc.</p>
        </div>
      </main>
    </div>
  )
}
