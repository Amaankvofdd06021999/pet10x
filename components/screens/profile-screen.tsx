"use client"

import { useRef, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { usePets, useUnreadNotificationCount, useMyBuildingLink } from "@/lib/data"
import { exportMyData, deleteMyAccount, updateMyProfile, setMyUnit } from "@/lib/data/account"
import { toast } from "sonner"
import { IOSNavBar } from "@/components/ios-nav-bar"
import { PersonaSwitcher } from "@/components/persona-switcher"
import { PERSONA_LABEL } from "@/lib/rbac"
import { AddressCard } from "@/components/screens/profile/address-card"
import { NavBackButton } from "@/components/nav-back-button"
import {
  ChevronRight,
  Settings,
  Dog,
  Cat,
  Shield,
  FileText,
  CreditCard,
  HelpCircle,
  LogOut,
  Bell,
  Lock,
  Globe,
  Moon,
  Award,
  Building2,
  Heart,
  Star,
  Download,
  Trash2,
  Loader2,
  Camera,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import Image from "next/image"
import { Portal } from "@/components/ui/portal"

const MENU_SECTIONS = [
  {
    title: "My Pets",
    items: [
      { icon: Dog, label: "Pet Profiles" },
      { icon: Shield, label: "Compliance Status" },
      { icon: FileText, label: "Documents & Records" },
      { icon: Award, label: "Achievements" },
    ],
  },
  {
    title: "Building",
    items: [
      { icon: Building2, label: "Building Rules" },
      { icon: FileText, label: "Accommodation Requests" },
      { icon: Heart, label: "Favorite Services" },
    ],
  },
  {
    title: "Account",
    items: [
      { icon: CreditCard, label: "Subscription" },
      { icon: Bell, label: "Notification Settings" },
      { icon: Lock, label: "Privacy & Security" },
      { icon: Globe, label: "Language", detail: "English" },
      { icon: Moon, label: "Appearance", detail: "System" },
    ],
  },
  {
    title: "Support",
    items: [
      { icon: HelpCircle, label: "Help & FAQ" },
      { icon: Star, label: "Rate Pet10x" },
      { icon: FileText, label: "Terms & Privacy Policy" },
    ],
  },
]

interface ProfileScreenProps {
  onNavigate?: (screen: string) => void
}

export function ProfileScreen({ onNavigate }: ProfileScreenProps) {
  const { user, signOut, updateLocalUser, viewAs } = useAuth()
  const { data: pets } = usePets()
  const unreadCount = useUnreadNotificationCount()
  const [busy, setBusy] = useState<"export" | "delete" | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(user?.name ?? "")
  const [editAvatarFile, setEditAvatarFile] = useState<File | null>(null)
  const [editAvatarPreview, setEditAvatarPreview] = useState<string | null>(null)
  const [savingProfile, setSavingProfile] = useState(false)
  const avatarInput = useRef<HTMLInputElement>(null)

  function openEdit() {
    setEditName(user?.name ?? "")
    setEditAvatarFile(null)
    setEditAvatarPreview(null)
    setEditing(true)
  }

  function handleAvatarPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setEditAvatarFile(file)
    setEditAvatarPreview(URL.createObjectURL(file))
  }

  async function handleSaveProfile() {
    if (!editName.trim()) return toast.error("Name can't be empty")
    setSavingProfile(true)
    const { error, avatarUrl } = await updateMyProfile({
      fullName: editName.trim() !== user?.name ? editName.trim() : undefined,
      avatarFile: editAvatarFile ?? undefined,
    })
    setSavingProfile(false)
    if (error) return toast.error("Couldn't update profile", { description: error })
    updateLocalUser({ name: editName.trim(), ...(avatarUrl ? { avatar: avatarUrl } : {}) })
    toast.success("Profile updated")
    setEditing(false)
  }

  async function handleExport() {
    setBusy("export")
    const data = await exportMyData()
    setBusy(null)
    if (!data) return toast.error("Couldn't export your data.")
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `pet10x-data-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success("Your data was exported")
  }

  async function handleDelete() {
    setBusy("delete")
    const { error } = await deleteMyAccount()
    if (error) {
      setBusy(null)
      return toast.error("Couldn't delete account", { description: error })
    }
    toast.success("Account deleted")
    await signOut()
  }

  const handleItem = (label: string) => {
    if (label.includes("Pet Profiles")) onNavigate?.("home")
    else if (label.includes("Documents")) onNavigate?.("pet-detail")
    else if (label.includes("Favorite Services")) onNavigate?.("services")
    else if (label.includes("Compliance")) toast("Compliance status", { description: "View your pets' compliance — coming soon." })
    else if (label.includes("Subscription")) toast("Subscription", { description: "Manage your plan — coming soon." })
    else toast(label, { description: "Coming soon." })
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <IOSNavBar
        title="Profile"
        largeTitle={false}
        leftAction={<NavBackButton onClick={() => onNavigate?.("home")} />}
        rightAction={
          <button
            onClick={() => onNavigate?.("alerts")}
            className="relative p-2"
            aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
          >
            <Bell className="h-5 w-5 text-foreground" />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
        }
      />

      <main className="ios-scroll flex-1 px-4 pb-24">
        {/* Renders itself only for accounts granted more than one persona. */}
        <PersonaSwitcher className="mb-4 w-full" />

        {/* Profile Card */}
        <section className="mb-5">
          <button
            onClick={openEdit}
            className="w-full rounded-2xl border border-border bg-card p-4 text-left transition-colors active:bg-muted"
          >
            <div className="flex items-center gap-3">
              {/* An <Image> with src="" makes the browser re-request the whole
                  page. Accounts created by the signup flow have no avatar, so
                  fall back to an initial rather than rendering an empty src. */}
              <div className="relative flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
                {user?.avatar ? (
                  <Image src={user.avatar} alt={user.name ?? ""} fill className="object-cover" />
                ) : (
                  <span className="text-[18px] font-semibold text-muted-foreground">
                    {(user?.name ?? "?").slice(0, 1).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="truncate text-[17px] font-semibold text-foreground">{user?.name}</h2>
                {/* Built from whichever parts exist. Was "Unit {unit} · {building}"
                    unconditionally, which rendered "Unit 2104 ·" with a dangling
                    separator for anyone whose link is still pending, and a bare
                    "Unit  ·" for standalone owners. */}
                <p className="text-[12px] text-muted-foreground">
                  {user?.building || "Pet owner"}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <Badge className="bg-primary/10 text-primary border-0 text-[10px]">
                    {PERSONA_LABEL[viewAs]}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">Since {user?.memberSince}</span>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
            </div>
          </button>
        </section>

        {/* Unit — the resident's, not the pet's. Editable here because this is
            where it belongs: one person, one unit, however many pets. Tapping
            the "Unit number" gap on Home lands on this screen.

            Driven by useMyBuildingLink, NOT user.building: my_app_user() only
            reports a building once the link is APPROVED, so gating on it hid
            this row from everyone with a pending request — precisely the
            people the banner is telling to set their unit. */}
        {/* Home address — shown to everyone, but it is the only route a
            standalone owner has to discover their building is on Pet10x. */}
        <AddressCard onNavigate={onNavigate} />

        {/* Pet Quick View */}
        <section className="mb-5">
          <div className="flex gap-2.5">
            {pets.length === 0 && (
              <button
                onClick={() => onNavigate?.("add-pet")}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border bg-card p-3.5 text-[13px] font-semibold text-muted-foreground transition-transform active:scale-[0.98]"
              >
                + Add a pet
              </button>
            )}
            {pets.map((pet) => {
              const SpeciesIcon = pet.species === "dog" ? Dog : Cat
              return (
                <div
                  key={pet.name}
                  className="flex flex-1 items-center gap-2.5 rounded-2xl border border-border bg-card p-2.5"
                >
                  <div className="relative h-10 w-10 overflow-hidden rounded-xl bg-muted flex-shrink-0">
                    <Image src={pet.image} alt={pet.name} fill className="object-cover" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1">
                      <SpeciesIcon className="h-3 w-3 text-muted-foreground" />
                      <span className="text-[13px] font-semibold text-foreground">{pet.name}</span>
                    </div>
                    <span className="mt-0.5 block text-[10px] text-muted-foreground">{pet.breed || "Pet"}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* Menu Sections */}
        {MENU_SECTIONS.map((section) => (
          <section key={section.title} className="mb-5">
            <h3 className="mb-1.5 px-1 text-[11px] font-semibold uppercase text-muted-foreground">
              {section.title}
            </h3>
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              {section.items.map((item, idx) => {
                const Icon = item.icon
                return (
                  <button
                    key={item.label}
                    onClick={() => handleItem(item.label)}
                    className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors active:bg-muted ${
                      idx < section.items.length - 1 ? "border-b border-border" : ""
                    }`}
                  >
                    <Icon className="h-5 w-5 text-primary" />
                    <span className="flex-1 text-[14px] text-foreground">{item.label}</span>
                    {item.detail && <span className="text-[12px] text-muted-foreground">{item.detail}</span>}
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                )
              })}
            </div>
          </section>
        ))}

        {/* Privacy & data */}
        <section className="mb-5">
          <h3 className="mb-1.5 px-1 text-[11px] font-semibold uppercase text-muted-foreground">Privacy &amp; data</h3>
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <button
              onClick={handleExport}
              disabled={busy !== null}
              className="flex w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left transition-colors active:bg-muted disabled:opacity-60"
            >
              {busy === "export" ? (
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              ) : (
                <Download className="h-5 w-5 text-primary" />
              )}
              <span className="flex-1 text-[14px] text-foreground">Export my data</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={busy !== null}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors active:bg-muted disabled:opacity-60"
            >
              <Trash2 className="h-5 w-5 text-destructive" />
              <span className="flex-1 text-[14px] text-destructive">Delete account</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </section>

        {editing && (
          <Portal>
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6"
            onClick={() => !savingProfile && setEditing(false)}
          >
            <div className="w-full max-w-sm rounded-2xl bg-card p-5" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-[17px] font-semibold text-foreground">Edit profile</h3>

              <div className="mt-4 flex justify-center">
                <button
                  onClick={() => avatarInput.current?.click()}
                  className="group relative h-20 w-20 overflow-hidden rounded-full bg-muted"
                  aria-label="Change photo"
                >
                  {editAvatarPreview ?? user?.avatar ? (
                    <Image
                      src={(editAvatarPreview ?? user?.avatar) as string}
                      alt={user?.name ?? ""}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-[24px] font-semibold text-muted-foreground">
                      {(user?.name ?? "?").slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/30">
                    <Camera className="h-5 w-5 text-white opacity-0 transition-opacity group-hover:opacity-100" />
                  </span>
                </button>
                <input
                  ref={avatarInput}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarPick}
                  className="hidden"
                />
              </div>

              <div className="mt-4">
                <label htmlFor="edit-name" className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Name
                </label>
                <input
                  id="edit-name"
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-lg border border-border bg-card px-3.5 py-2.5 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="mt-5 flex gap-2">
                <button
                  onClick={() => setEditing(false)}
                  disabled={savingProfile}
                  className="flex-1 rounded-xl border border-border py-2.5 text-[14px] font-semibold text-foreground disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveProfile}
                  disabled={savingProfile}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-[14px] font-semibold text-primary-foreground disabled:opacity-60"
                >
                  {savingProfile && <Loader2 className="h-4 w-4 animate-spin" />} Save
                </button>
              </div>
            </div>
          </div>
          </Portal>
        )}

        {confirmDelete && (
          <Portal>
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6"
            onClick={() => busy === null && setConfirmDelete(false)}
          >
            <div className="w-full max-w-sm rounded-2xl bg-card p-5" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-[17px] font-semibold text-foreground">Delete your account?</h3>
              <p className="mt-1.5 text-[14px] leading-relaxed text-muted-foreground">
                This permanently deletes your profile, pets, documents and care history. This can&apos;t be undone.
              </p>
              <div className="mt-5 flex gap-2">
                <button
                  onClick={() => setConfirmDelete(false)}
                  disabled={busy !== null}
                  className="flex-1 rounded-xl border border-border py-2.5 text-[14px] font-semibold text-foreground disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={busy !== null}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-destructive py-2.5 text-[14px] font-semibold text-destructive-foreground disabled:opacity-60"
                >
                  {busy === "delete" && <Loader2 className="h-4 w-4 animate-spin" />} Delete
                </button>
              </div>
            </div>
          </div>
          </Portal>
        )}

        {/* Sign Out */}
        <section className="mb-5">
          <button
            onClick={signOut}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 transition-transform active:scale-[0.98]"
          >
            <LogOut className="h-5 w-5 text-destructive" />
            <span className="text-[14px] font-semibold text-destructive">Sign Out</span>
          </button>
        </section>

        <div className="mb-4 text-center">
          <p className="text-[11px] text-muted-foreground">Pet10x v1.0.0 &middot; Park10x Services Inc.</p>
        </div>
      </main>
    </div>
  )
}

