/**
 * Pet10x — Consolidated mock data (SINGLE SOURCE).
 *
 * Every hardcoded dataset that used to live inline inside screen components now
 * lives here. Screens read this through the hooks in `./hooks` (the data-access
 * seam). In Phase 1 each hook body is swapped from "return this mock data" to a
 * Supabase query — screens never change.
 *
 * This is demo/seed data only; it mirrors the "Maple Court Residences" demo so the
 * UI looks identical to the current prototype. It also becomes the basis for the
 * Supabase `seed.sql` in Phase 1.
 *
 * NOTE: purely presentational config (color/style maps, tab definitions, menu
 * scaffolding, icon lists) intentionally stays in the components — it is view
 * concern, not data.
 */

import type {
  AccommodationRequest,
  AppNotification,
  AppUser,
  Building,
  CommunityEvent,
  CommunityPost,
  DocumentReviewItem,
  EmergencyBuildingDirectory,
  HomeAlert,
  LostFoundItem,
  ManagerActivityEntry,
  Pet,
  Registration,
  Resident,
  ResolvedViolation,
  ServiceProvider,
  UrgentItem,
  UserRole,
  Violation,
} from "./types"

/* ================================================================== */
/* Users & buildings                                                  */
/* ================================================================== */

export const MOCK_USERS: Record<"pet-owner" | "building-manager", AppUser> = {
  "pet-owner": {
    id: "u1",
    name: "Sarah Chen",
    email: "sarah.chen@email.com",
    avatar: "/avatars/sarah.jpg",
    unit: "2104",
    building: "Maple Court Residences",
    role: "pet-owner",
    roleLabel: "Pet Owner",
    description: "2 registered pets, 96% compliance",
    memberSince: "Jan 2025",
    plan: "Pet Plus",
    petCount: 2,
    onboarded: true,
    isSuperAdmin: false,
    isSuspended: false,
  },
  "building-manager": {
    id: "u3",
    name: "Rachel Torres",
    email: "rachel.torres@harbourview.com",
    avatar: "/avatars/rachel.jpg",
    unit: "Office",
    building: "Maple Court Residences",
    role: "building-manager",
    roleLabel: "Building Manager",
    description: "Strata Property Manager",
    memberSince: "Jun 2023",
    plan: "Enterprise",
    petCount: 0,
    onboarded: true,
    isSuperAdmin: false,
    isSuspended: false,
  },
}

/** Valid building codes for guest access → building name. */
export const VALID_BUILDING_CODES: Record<string, string> = {
  MCR2026: "Maple Court Residences",
}

/* ================================================================== */
/* Pets                                                               */
/* ================================================================== */

export const PETS: Pet[] = [
  {
    id: "1",
    ownerId: "u1",
    name: "Max",
    species: "dog",
    breed: "Golden Retriever",
    status: "home",
    image: "/pets/dog1.jpg",
    compliance: 92,
    dob: "March 15, 2022",
    age: "3 years, 11 months",
    gender: "Male",
    weight: "32 kg (70.5 lbs)",
    color: "Golden",
    microchip: "985141004567890",
    neutered: true,
    medical: {
      conditions: "None reported",
      medications: "None",
      allergies: "Chicken",
      behavioralNotes: "Friendly, good with other dogs",
      vetClinic: "Paws & Claws Veterinary",
      vetName: "Dr. Emily Wong",
      vetDistance: "0.3 km",
    },
    vaccinations: [
      { name: "Rabies", date: "Mar 8, 2025", expiry: "Mar 8, 2026", status: "expiring" },
      { name: "DHPP", date: "Jan 15, 2026", expiry: "Jan 15, 2027", status: "current" },
      { name: "Bordetella", date: "Nov 10, 2025", expiry: "Nov 10, 2026", status: "current" },
      { name: "Lyme", date: "Jun 1, 2025", expiry: "Jun 1, 2026", status: "current" },
    ],
    emergencyContacts: [
      { role: "Primary Owner", name: "Sarah Chen", phone: "+1 (604) 555-0123" },
      { role: "Secondary Guardian", name: "Mike Chen", phone: "+1 (604) 555-0456" },
      { role: "Veterinarian", name: "Paws & Claws Clinic", phone: "+1 (604) 555-0789" },
    ],
    documents: [
      { name: "Municipal License", status: "Valid", expiry: "Dec 2026", iconKey: "license" },
      { name: "Rabies Certificate", status: "Expiring", expiry: "Mar 2026", iconKey: "vaccination" },
      { name: "Building Registration", status: "Approved", expiry: "N/A", iconKey: "registration" },
      { name: "Microchip Registration", status: "Active", expiry: "Lifetime", iconKey: "microchip" },
      { name: "Insurance Certificate", status: "Valid", expiry: "Jun 2026", iconKey: "insurance" },
    ],
    activity: [
      { type: "compliance", text: "Vaccination reminder sent for Rabies", time: "2h ago" },
      { type: "status", text: "Status changed to Home", time: "1d ago" },
      { type: "document", text: "License document uploaded", time: "3d ago" },
      { type: "compliance", text: "Annual wellness check completed", time: "1w ago" },
    ],
    careRoutine: [
      { id: "max-c1", label: "Morning meal", detail: "1.5 cups kibble", time: "7:30 AM", kind: "meal" },
      { id: "max-c2", label: "Heartworm tablet", detail: "1 tablet · monthly", time: "8:00 AM", kind: "medication" },
      { id: "max-c3", label: "Fresh water", detail: "Refill bowl", time: "All day", kind: "water" },
      { id: "max-c4", label: "Afternoon walk", detail: "30 minutes", time: "5:30 PM", kind: "walk" },
      { id: "max-c5", label: "Evening meal", detail: "1.5 cups kibble", time: "6:30 PM", kind: "meal" },
    ],
    feeding: [
      { id: "max-f1", name: "Breakfast", time: "7:30 AM", portion: "1.5 cups", food: "Royal Canin Adult" },
      { id: "max-f2", name: "Dinner", time: "6:30 PM", portion: "1.5 cups", food: "Royal Canin Adult" },
    ],
    medications: [
      { id: "max-m1", name: "Heartworm Prevention", dosage: "1 tablet", frequency: "Monthly", nextDue: "Mar 1, 2026", reminder: true },
      { id: "max-m2", name: "Joint Supplement", dosage: "1 chew", frequency: "Daily", nextDue: "Today", reminder: true },
    ],
  },
  {
    id: "2",
    ownerId: "u1",
    name: "Luna",
    species: "cat",
    breed: "British Shorthair",
    status: "at-vet",
    image: "/pets/cat1.jpg",
    compliance: 100,
    dob: "August 2, 2023",
    age: "2 years, 6 months",
    gender: "Female",
    weight: "12 lbs",
    color: "Blue-grey",
    microchip: "985141004511223",
    neutered: true,
    medical: {
      conditions: "None reported",
      medications: "None",
      allergies: "None",
      behavioralNotes: "Shy with strangers, hides when scared",
      vetClinic: "Paws & Claws Veterinary",
      vetName: "Dr. Emily Wong",
      vetDistance: "0.3 km",
    },
    vaccinations: [
      { name: "Rabies", date: "Jan 10, 2026", expiry: "Jan 10, 2027", status: "current" },
      { name: "FVRCP", date: "Jan 10, 2026", expiry: "Jan 10, 2027", status: "current" },
    ],
    emergencyContacts: [
      { role: "Primary Owner", name: "Sarah Chen", phone: "+1 (604) 555-0123" },
      { role: "Veterinarian", name: "Paws & Claws Clinic", phone: "+1 (604) 555-0789" },
    ],
    documents: [
      { name: "Municipal License", status: "Valid", expiry: "Mar 2027", iconKey: "license" },
      { name: "Rabies Certificate", status: "Valid", expiry: "Jan 2027", iconKey: "vaccination" },
      { name: "Building Registration", status: "Approved", expiry: "N/A", iconKey: "registration" },
    ],
    activity: [
      { type: "status", text: "Status changed to At Vet", time: "4h ago" },
      { type: "compliance", text: "Municipal license renewed until March 2027", time: "2d ago" },
    ],
    careRoutine: [
      { id: "luna-c1", label: "Morning meal", detail: "1/2 cup wet food", time: "8:00 AM", kind: "meal" },
      { id: "luna-c2", label: "Fresh water", detail: "Refill fountain", time: "All day", kind: "water" },
      { id: "luna-c3", label: "Litter check", detail: "Scoop & refresh", time: "Twice daily", kind: "other" },
      { id: "luna-c4", label: "Evening meal", detail: "1/2 cup wet food", time: "6:00 PM", kind: "meal" },
    ],
    feeding: [
      { id: "luna-f1", name: "Breakfast", time: "8:00 AM", portion: "1/2 cup", food: "Fancy Feast Wet" },
      { id: "luna-f2", name: "Dinner", time: "6:00 PM", portion: "1/2 cup", food: "Fancy Feast Wet" },
    ],
    medications: [],
  },
]

/* ================================================================== */
/* Owner home: recent activity alerts                                 */
/* ================================================================== */

export const HOME_RECENT_ALERTS: HomeAlert[] = [
  {
    id: 1,
    type: "warning",
    title: "Vaccination Expiring",
    body: "Max's rabies vaccination expires in 14 days",
    time: "2h ago",
  },
  {
    id: 2,
    type: "info",
    title: "Building Pet Meeting",
    body: "Annual pet policy review — March 15 at 7 PM",
    time: "5h ago",
  },
  {
    id: 3,
    type: "success",
    title: "Compliance Updated",
    body: "Luna's municipal license has been renewed",
    time: "1d ago",
  },
]

/* ================================================================== */
/* Community: feed, lost & found, events                              */
/* ================================================================== */

export const COMMUNITY_POSTS: CommunityPost[] = [
  {
    id: "1",

    author: "Sarah Chen",
    avatar: "/avatars/sarah.jpg",
    unit: "2104",
    time: "2h ago",
    category: "General",
    content:
      "Max just passed his advanced obedience training! So proud of this good boy. He's been working so hard these past few weeks.",
    image: "/posts/dog-training.jpg",
    likes: 24,
    comments: 8,
    liked: true,
  },
  {
    id: "2",

    author: "Mike Johnson",
    avatar: "/avatars/mike.jpg",
    unit: "1508",
    time: "5h ago",
    category: "Recommendation",
    content:
      "Can anyone recommend a good mobile groomer that comes to the building? Bella needs a trim before summer.",
    likes: 7,
    comments: 12,
    liked: false,
  },
  {
    id: "3",

    author: "Building Management",
    avatar: "/avatars/building.jpg",
    unit: "Office",
    time: "1d ago",
    category: "Warning",
    content:
      "Reminder: All dogs must be leashed in common areas at all times. We've had recent reports of off-leash dogs in the lobby. Please be respectful of all residents.",
    likes: 31,
    comments: 5,
    liked: false,
  },
]

/* ================================================================== */
/* Services / providers                                               */
/* ================================================================== */

/* ================================================================== */
/* Notifications (alerts center)                                      */
/* ================================================================== */

export const NOTIFICATIONS: AppNotification[] = [
  {
    id: "1",

    category: "compliance",
    severity: "warning",
    title: "Vaccination Expiring Soon",
    body: "Max's rabies vaccination expires on March 8, 2026. Schedule an appointment to stay compliant.",
    time: "2h ago",
    read: false,
    actionLabel: "Renew Now",
    iconKey: "syringe",
  },
  {
    id: "2",

    category: "incident",
    severity: "error",
    title: "New Incident Report Filed",
    body: "A noise complaint has been filed regarding Unit 2104. You have 7 days to respond.",
    time: "5h ago",
    read: false,
    actionLabel: "View & Respond",
    iconKey: "alert",
  },
  {
    id: "3",

    category: "building",
    severity: "info",
    title: "Bylaw Update: Common Area Rules",
    body: "Building management has updated pet rules for the rooftop terrace. Please review.",
    time: "1d ago",
    read: false,
    actionLabel: "Review Changes",
    iconKey: "file",
  },
  {
    id: "4",

    category: "compliance",
    severity: "success",
    title: "License Renewed Successfully",
    body: "Luna's municipal license has been renewed until March 2027.",
    time: "2d ago",
    read: true,
    iconKey: "check",
  },
  {
    id: "5",

    category: "building",
    severity: "info",
    title: "Community Dog Walk This Saturday",
    body: "Join fellow pet owners for a group walk starting from the lobby at 10 AM.",
    time: "3d ago",
    read: true,
    actionLabel: "RSVP",
    iconKey: "calendar",
  },
  {
    id: "6",

    category: "incident",
    severity: "success",
    title: "Incident Resolved",
    body: "The off-leash report from Feb 10 has been resolved. No further action required.",
    time: "5d ago",
    read: true,
    iconKey: "shield",
  },
]

/* ================================================================== */
/* Manager: residents                                                 */
/* ================================================================== */

/* ================================================================== */
/* Manager: approvals (registrations, accommodations, documents)      */
/* ================================================================== */

/* ================================================================== */
/* Manager: violations                                                */
/* ================================================================== */

/* ================================================================== */
/* Manager: dashboard                                                 */
/* ================================================================== */

/* ================================================================== */
/* Emergency directory (token-gated public view)                      */
/* ================================================================== */

/** Look up a building name from its public guest code. */
export function resolveBuildingCode(code: string): string | null {
  return VALID_BUILDING_CODES[code.trim().toUpperCase()] ?? null
}

/** The role keys that have a seeded demo user. */
export const DEMO_ROLES = Object.keys(MOCK_USERS) as (keyof typeof MOCK_USERS)[]
export type DemoRole = Extract<UserRole, "pet-owner" | "building-manager">
