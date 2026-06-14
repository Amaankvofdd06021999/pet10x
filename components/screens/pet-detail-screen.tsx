"use client"

import { useState } from "react"
import {
  ArrowLeft,
  MoreHorizontal,
  Shield,
  Heart,
  Syringe,
  FileText,
  Phone,
  MapPin,
  Calendar,
  Weight,
  Dna,
  Edit3,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ChevronRight,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import Image from "next/image"
import { usePet, type PetDocumentIconKey } from "@/lib/data"

type DetailTab = "overview" | "medical" | "documents" | "activity"

const VAX_STATUS_STYLES = {
  current: { label: "Current", color: "bg-success/10 text-success" },
  expiring: { label: "Expiring Soon", color: "bg-[#FFF9E6] text-[#B38F00]" },
  expired: { label: "Expired", color: "bg-destructive/10 text-destructive" },
}

const DOC_ICONS: Record<PetDocumentIconKey, typeof FileText> = {
  license: FileText,
  vaccination: Syringe,
  registration: Shield,
  microchip: Dna,
  insurance: Heart,
}

interface PetDetailScreenProps {
  onBack: () => void
}

export function PetDetailScreen({ onBack }: PetDetailScreenProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>("overview")
  const { data: pet } = usePet()

  if (!pet) return null

  const vaccinations = pet.vaccinations ?? []
  const emergencyContacts = pet.emergencyContacts ?? []
  const recentActivity = pet.activity ?? []
  const documents = pet.documents ?? []
  const medical = pet.medical

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Custom Nav */}
      <header className="sticky top-0 z-40 bg-card/80 backdrop-blur-xl pt-safe">
        <div className="flex h-11 items-center justify-between px-4">
          <button onClick={onBack} className="flex items-center gap-1 text-primary">
            <ArrowLeft className="h-5 w-5" />
            <span className="text-[17px]">Back</span>
          </button>
          <div className="flex items-center gap-2">
            <button className="p-2" aria-label="Edit pet">
              <Edit3 className="h-5 w-5 text-primary" />
            </button>
            <button className="p-2" aria-label="More options">
              <MoreHorizontal className="h-5 w-5 text-foreground" />
            </button>
          </div>
        </div>
      </header>

      <main className="ios-scroll flex-1 pb-24">
        {/* Hero */}
        <div className="relative h-64 w-full bg-muted">
          <Image src={pet.image} alt={pet.name} fill className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-transparent to-transparent" />
          <div className="absolute bottom-4 left-4 right-4">
            <div className="flex items-end justify-between">
              <div>
                <h1 className="text-[34px] font-bold text-foreground">{pet.name}</h1>
                <p className="text-[15px] text-muted-foreground">{pet.breed}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-success text-success-foreground border-0">
                  Home
                </Badge>
                <div className="flex items-center gap-1 rounded-full bg-card/80 px-3 py-1 backdrop-blur-sm">
                  <Shield className="h-3.5 w-3.5 text-success" />
                  <span className="text-[13px] font-semibold text-foreground">{pet.compliance}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="sticky top-[44px] z-30 bg-background px-4 py-3">
          <div className="flex rounded-xl bg-muted p-1">
            {(["overview", "medical", "documents", "activity"] as DetailTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 rounded-lg py-2 text-[13px] font-semibold capitalize transition-all ${
                  activeTab === tab
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        <div className="px-4">
          {/* Overview Tab */}
          {activeTab === "overview" && (
            <div className="flex flex-col gap-4">
              {/* Quick Info Grid */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { icon: Calendar, label: "Age", value: pet.age },
                  { icon: Weight, label: "Weight", value: pet.weight },
                  { icon: Dna, label: "Gender", value: `${pet.gender}, ${pet.neutered ? "Neutered" : "Intact"}` },
                  { icon: MapPin, label: "Microchip", value: (pet.microchip ?? "").slice(0, 6) + "..." },
                ].map((item) => {
                  const Icon = item.icon
                  return (
                    <div key={item.label} className="rounded-2xl border border-border bg-card p-3">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-primary" />
                        <span className="text-[12px] font-medium text-muted-foreground">{item.label}</span>
                      </div>
                      <p className="mt-1 text-[13px] font-semibold text-foreground">{item.value}</p>
                    </div>
                  )
                })}
              </div>

              {/* Status Card */}
              <div className="rounded-2xl border border-border bg-card p-4">
                <h3 className="text-[15px] font-semibold text-foreground">Pet Status</h3>
                <div className="mt-3 flex gap-2">
                  {["Home", "Away", "At Vet", "Vacation"].map((status) => (
                    <button
                      key={status}
                      className={`flex-1 rounded-xl py-2 text-[12px] font-semibold transition-all ${
                        status === "Home"
                          ? "bg-success text-success-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>

              {/* Emergency Contacts */}
              <div className="rounded-2xl border border-border bg-card overflow-hidden">
                <div className="px-4 py-3 border-b border-border">
                  <h3 className="text-[15px] font-semibold text-foreground">Emergency Contacts</h3>
                </div>
                {emergencyContacts.map((contact, idx) => (
                  <div
                    key={contact.role}
                    className={`flex items-center gap-3 px-4 py-3 ${
                      idx < emergencyContacts.length - 1 ? "border-b border-border" : ""
                    }`}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                      <Phone className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="text-[15px] font-medium text-foreground">{contact.name}</p>
                      <p className="text-[12px] text-muted-foreground">{contact.role}</p>
                    </div>
                    <span className="text-[13px] text-primary">{contact.phone}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Medical Tab */}
          {activeTab === "medical" && (
            <div className="flex flex-col gap-4">
              {/* Vaccination Status */}
              <div className="rounded-2xl border border-border bg-card overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <h3 className="text-[15px] font-semibold text-foreground">Vaccinations</h3>
                  <button className="text-[13px] font-medium text-primary">Add Record</button>
                </div>
                {vaccinations.map((vax, idx) => {
                  const statusStyle = VAX_STATUS_STYLES[vax.status]
                  return (
                    <div
                      key={vax.name}
                      className={`flex items-center gap-3 px-4 py-3 ${
                        idx < vaccinations.length - 1 ? "border-b border-border" : ""
                      }`}
                    >
                      <Syringe className={`h-5 w-5 ${vax.status === "expiring" ? "text-[#B38F00]" : "text-success"}`} />
                      <div className="flex-1">
                        <p className="text-[15px] font-medium text-foreground">{vax.name}</p>
                        <p className="text-[12px] text-muted-foreground">
                          Given: {vax.date} &middot; Expires: {vax.expiry}
                        </p>
                      </div>
                      <Badge className={`text-[10px] border-0 ${statusStyle.color}`}>
                        {statusStyle.label}
                      </Badge>
                    </div>
                  )
                })}
              </div>

              {/* Medical Info */}
              <div className="rounded-2xl border border-border bg-card p-4">
                <h3 className="text-[15px] font-semibold text-foreground">Medical Information</h3>
                <div className="mt-3 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] text-muted-foreground">Known Conditions</span>
                    <span className="text-[13px] text-foreground">{medical?.conditions ?? "None reported"}</span>
                  </div>
                  <div className="h-px bg-border" />
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] text-muted-foreground">Current Medications</span>
                    <span className="text-[13px] text-foreground">{medical?.medications ?? "None"}</span>
                  </div>
                  <div className="h-px bg-border" />
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] text-muted-foreground">Allergies</span>
                    <span className="text-[13px] text-foreground">{medical?.allergies ?? "None"}</span>
                  </div>
                  <div className="h-px bg-border" />
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-[13px] text-muted-foreground flex-shrink-0">Behavioral Notes</span>
                    <span className="text-[13px] text-foreground text-right">{medical?.behavioralNotes ?? "—"}</span>
                  </div>
                </div>
              </div>

              {/* Vet Info */}
              <div className="rounded-2xl border border-border bg-card p-4">
                <h3 className="text-[15px] font-semibold text-foreground">Veterinarian</h3>
                <div className="mt-3 flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10">
                    <Heart className="h-6 w-6 text-accent" />
                  </div>
                  <div className="flex-1">
                    <p className="text-[15px] font-medium text-foreground">{medical?.vetClinic ?? "—"}</p>
                    <p className="text-[12px] text-muted-foreground">
                      {medical ? `${medical.vetName} · ${medical.vetDistance}` : ""}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            </div>
          )}

          {/* Documents Tab */}
          {activeTab === "documents" && (
            <div className="flex flex-col gap-3">
              {documents.map((doc) => {
                const Icon = DOC_ICONS[doc.iconKey]
                const isExpiring = doc.status === "Expiring"
                return (
                  <button
                    key={doc.name}
                    className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-transform active:scale-[0.98]"
                  >
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${isExpiring ? "bg-[#FFF9E6]" : "bg-success/10"}`}>
                      <Icon className={`h-5 w-5 ${isExpiring ? "text-[#B38F00]" : "text-success"}`} />
                    </div>
                    <div className="flex-1">
                      <p className="text-[15px] font-medium text-foreground">{doc.name}</p>
                      <p className="text-[12px] text-muted-foreground">Expires: {doc.expiry}</p>
                    </div>
                    <Badge className={`text-[10px] border-0 ${isExpiring ? "bg-[#FFF9E6] text-[#B38F00]" : "bg-success/10 text-success"}`}>
                      {doc.status}
                    </Badge>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                )
              })}
            </div>
          )}

          {/* Activity Tab */}
          {activeTab === "activity" && (
            <div className="flex flex-col gap-0">
              {recentActivity.map((item, idx) => (
                <div key={idx} className="flex gap-3 pb-4">
                  <div className="flex flex-col items-center">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                      {item.type === "compliance" && <Shield className="h-4 w-4 text-primary" />}
                      {item.type === "status" && <CheckCircle2 className="h-4 w-4 text-success" />}
                      {item.type === "document" && <FileText className="h-4 w-4 text-info" />}
                    </div>
                    {idx < recentActivity.length - 1 && (
                      <div className="mt-1 h-full w-px bg-border" />
                    )}
                  </div>
                  <div className="flex-1 pb-2">
                    <p className="text-[14px] text-foreground">{item.text}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <span className="text-[12px] text-muted-foreground">{item.time}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
