/**
 * Pet10x — Consolidated mock data (SINGLE SOURCE).
 *
 * Every hardcoded dataset that used to live inline inside screen components now
 * lives here. Screens read this through the hooks in `./hooks` (the data-access
 * seam). In Phase 1 each hook body is swapped from "return this mock data" to a
 * Supabase query — screens never change.
 *
 * This is demo/seed data only; it mirrors the "Harbour View Tower" demo so the
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
    building: "Harbour View Tower",
    role: "pet-owner",
    roleLabel: "Pet Owner",
    description: "2 registered pets, 96% compliance",
    memberSince: "Jan 2025",
    plan: "Pet Plus",
    petCount: 2,
    onboarded: true,
    isSuperAdmin: false,
  },
  "building-manager": {
    id: "u3",
    name: "Rachel Torres",
    email: "rachel.torres@harbourview.com",
    avatar: "/avatars/rachel.jpg",
    unit: "Office",
    building: "Harbour View Tower",
    role: "building-manager",
    roleLabel: "Building Manager",
    description: "Strata Property Manager",
    memberSince: "Jun 2023",
    plan: "Enterprise",
    petCount: 0,
    onboarded: true,
    isSuperAdmin: false,
  },
}

/** Valid building codes for guest access → building name. */
export const VALID_BUILDING_CODES: Record<string, string> = {
  HVT2024: "Harbour View Tower",
  PARK10: "Parkside Residences",
  OAK999: "Oakwood Estates",
}

export const BUILDINGS: Building[] = [
  {
    id: 1,
    name: "Harbour View Tower",
    address: "1200 West Georgia St, Vancouver, BC V6E 4R2",
    code: "HVT2024",
    stats: {
      ownerComplianceScore: 96,
      buildingComplianceScore: 94,
      totalPets: 47,
      dogs: 32,
      cats: 15,
      esa: 4,
      serviceAnimals: 2,
      largeBreedExemptions: 3,
      riskScore: 23,
      openIncidents: 2,
      upcomingEvents: 3,
      nonCompliantUnits: 3,
      registered: 47,
      activeViolations: 5,
      pendingApprovals: 3,
    },
  },
]

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
    id: 1,
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
    id: 2,
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
    id: 3,
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

export const LOST_FOUND: LostFoundItem[] = [
  {
    id: 1,
    type: "lost",
    petName: "Charlie",
    species: "dog",
    breed: "French Bulldog",
    color: "Fawn with black mask",
    lastSeen: "Near lobby entrance",
    time: "3h ago",
    image: "/pets/lost-dog.jpg",
    reward: "$200",
    status: "active",
  },
  {
    id: 2,
    type: "found",
    petName: "Unknown Cat",
    species: "cat",
    breed: "Tabby Mix",
    color: "Orange striped",
    lastSeen: "P2 parking level",
    time: "1d ago",
    image: "/pets/found-cat.jpg",
    status: "active",
  },
]

export const EVENTS: CommunityEvent[] = [
  {
    id: 1,
    title: "Community Dog Walk",
    date: "Sat, Mar 1",
    time: "10:00 AM",
    location: "Building Courtyard",
    attendees: 14,
    maxAttendees: 25,
    category: "Social",
  },
  {
    id: 2,
    title: "Free Vaccination Clinic",
    date: "Wed, Mar 5",
    time: "2:00 PM",
    location: "Unit 101 (Event Room)",
    attendees: 23,
    maxAttendees: 30,
    category: "Health",
  },
  {
    id: 3,
    title: "Annual Pet Policy Review",
    date: "Sat, Mar 15",
    time: "7:00 PM",
    location: "Meeting Room A",
    attendees: 8,
    maxAttendees: 50,
    category: "Building",
  },
]

/* ================================================================== */
/* Services / providers                                               */
/* ================================================================== */

export const SERVICE_PROVIDERS: ServiceProvider[] = [
  {
    id: 1,
    name: "Paws & Claws Veterinary",
    category: "Veterinary Clinic",
    rating: 4.9,
    reviews: 234,
    distance: "0.3 km",
    image: "/services/vet-clinic.jpg",
    priceRange: "$$",
    isOpen: true,
    featured: true,
    tags: ["Emergency", "24/7"],
  },
  {
    id: 2,
    name: "Bella's Mobile Grooming",
    category: "Grooming",
    rating: 4.8,
    reviews: 156,
    distance: "Comes to you",
    image: "/services/grooming.jpg",
    priceRange: "$",
    isOpen: true,
    featured: true,
    tags: ["Mobile", "Organic Products"],
  },
  {
    id: 3,
    name: "Happy Tails Dog Walking",
    category: "Dog Walking",
    rating: 4.7,
    reviews: 89,
    distance: "0.5 km",
    image: "/services/walking.jpg",
    priceRange: "$",
    isOpen: true,
    nextAvailable: "Today, 2 PM",
  },
  {
    id: 4,
    name: "Good Boy Academy",
    category: "Training",
    rating: 4.9,
    reviews: 312,
    distance: "1.2 km",
    image: "/services/training.jpg",
    priceRange: "$$",
    isOpen: false,
    nextAvailable: "Tomorrow, 9 AM",
  },
  {
    id: 5,
    name: "PetSmart Commercial Drive",
    category: "Pet Supplies",
    rating: 4.3,
    reviews: 445,
    distance: "0.8 km",
    image: "/services/supplies.jpg",
    priceRange: "$",
    isOpen: true,
    nextAvailable: null,
  },
  {
    id: 6,
    name: "Dr. Sarah's Mobile Vet",
    category: "Mobile Veterinary",
    rating: 4.9,
    reviews: 78,
    distance: "Comes to you",
    image: "/services/mobile-vet.jpg",
    priceRange: "$$$",
    isOpen: true,
    nextAvailable: "Wed, Mar 5",
  },
]

/* ================================================================== */
/* Notifications (alerts center)                                      */
/* ================================================================== */

export const NOTIFICATIONS: AppNotification[] = [
  {
    id: 1,
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
    id: 2,
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
    id: 3,
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
    id: 4,
    category: "compliance",
    severity: "success",
    title: "License Renewed Successfully",
    body: "Luna's municipal license has been renewed until March 2027.",
    time: "2d ago",
    read: true,
    iconKey: "check",
  },
  {
    id: 5,
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
    id: 6,
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

export const RESIDENTS: Resident[] = [
  {
    id: 1,
    unit: "310",
    floor: 3,
    resident: "Emily Park",
    status: "compliant",
    pets: [{ name: "Whiskers", species: "cat", breed: "Tabby", weight: "10 lbs", compliant: true }],
    billing: { outstanding: 0, lastPayment: "Feb 1, 2026" },
    violations: [],
  },
  {
    id: 2,
    unit: "905",
    floor: 9,
    resident: "David Kim",
    status: "pending",
    pets: [{ name: "Rex", species: "dog", breed: "German Shepherd", weight: "85 lbs", compliant: false }],
    billing: { outstanding: 0, lastPayment: "Jan 15, 2026" },
    violations: [],
  },
  {
    id: 3,
    unit: "1201",
    floor: 12,
    resident: "Maria Santos",
    status: "non-compliant",
    pets: [{ name: "Bruno", species: "dog", breed: "Rottweiler", weight: "95 lbs", compliant: false }],
    billing: { outstanding: 250, lastPayment: "Dec 20, 2025" },
    violations: [{ type: "Aggressive behaviour report", date: "Feb 21, 2026", stage: "Investigation" }],
  },
  {
    id: 4,
    unit: "1402",
    floor: 14,
    resident: "Jennifer Lee",
    status: "pending",
    pets: [{ name: "Wilbur", species: "dog", breed: "Miniature Pig (ESA)", weight: "45 lbs", compliant: false }],
    billing: { outstanding: 0, lastPayment: "Feb 10, 2026" },
    violations: [],
  },
  {
    id: 5,
    unit: "1806",
    floor: 18,
    resident: "Tom Anderson",
    status: "compliant",
    pets: [
      { name: "Buddy", species: "dog", breed: "Labrador", weight: "70 lbs", compliant: true },
      { name: "Milo", species: "cat", breed: "Siamese", weight: "9 lbs", compliant: true },
    ],
    billing: { outstanding: 0, lastPayment: "Feb 5, 2026" },
    violations: [],
  },
  {
    id: 6,
    unit: "2104",
    floor: 21,
    resident: "Alex Nguyen",
    status: "non-compliant",
    pets: [{ name: "Rocky", species: "dog", breed: "Pitbull Mix", weight: "65 lbs", compliant: false }],
    billing: { outstanding: 150, lastPayment: "Jan 28, 2026" },
    violations: [
      { type: "Off-leash (1st)", date: "Jan 5, 2026", stage: "Verbal warning" },
      { type: "Off-leash (2nd)", date: "Jan 22, 2026", stage: "Written warning" },
      { type: "Off-leash (3rd)", date: "Feb 20, 2026", stage: "Fine issued" },
    ],
  },
  {
    id: 7,
    unit: "2208",
    floor: 22,
    resident: "Sarah Chen",
    status: "compliant",
    pets: [
      { name: "Max", species: "dog", breed: "Golden Retriever", weight: "72 lbs", compliant: true },
      { name: "Luna", species: "cat", breed: "British Shorthair", weight: "12 lbs", compliant: true },
    ],
    billing: { outstanding: 0, lastPayment: "Feb 14, 2026" },
    violations: [],
  },
]

/* ================================================================== */
/* Manager: approvals (registrations, accommodations, documents)      */
/* ================================================================== */

export const REGISTRATIONS: Registration[] = [
  {
    id: 1,
    unit: "905",
    resident: "David Kim",
    species: "dog",
    name: "Rex",
    breed: "German Shepherd",
    weight: "85 lbs",
    age: "3 years",
    submitted: "Feb 19, 2026",
    status: "pending",
    flags: ["Large breed — weight exemption required", "Requires liability insurance verification"],
    documents: { vaccination: true, license: true, insurance: false },
  },
  {
    id: 2,
    unit: "1503",
    resident: "Amy Wright",
    species: "cat",
    name: "Cleo",
    breed: "Persian",
    weight: "11 lbs",
    age: "2 years",
    submitted: "Feb 20, 2026",
    status: "pending",
    flags: [],
    documents: { vaccination: true, license: true, insurance: true },
  },
  {
    id: 3,
    unit: "607",
    resident: "Mike Chen",
    species: "dog",
    name: "Ziggy",
    breed: "French Bulldog",
    weight: "28 lbs",
    age: "1 year",
    submitted: "Feb 21, 2026",
    status: "pending",
    flags: ["Brachycephalic breed — noise note"],
    documents: { vaccination: true, license: false, insurance: true },
  },
]

export const ACCOMMODATIONS: AccommodationRequest[] = [
  {
    id: 1,
    unit: "1402",
    resident: "Jennifer Lee",
    type: "ESA",
    animal: "Miniature Pig — Wilbur",
    submitted: "Feb 12, 2026",
    status: "pending",
    documents: {
      letterFromProvider: true,
      providerLicense: true,
      animalDescription: true,
      vaccination: false,
    },
    legalNote:
      "Under Fair Housing Act, ESA accommodation cannot be unreasonably denied. Verify documentation authenticity only.",
  },
  {
    id: 2,
    unit: "820",
    resident: "Robert Garcia",
    type: "Service Animal",
    animal: "German Shepherd — Atlas",
    submitted: "Feb 18, 2026",
    status: "pending",
    documents: {
      letterFromProvider: true,
      providerLicense: true,
      animalDescription: true,
      vaccination: true,
    },
    legalNote:
      "Service animals are protected under ADA. You may only verify that the animal is required for a disability and what task it performs.",
  },
]

export const DOCUMENTS_REVIEW: DocumentReviewItem[] = [
  { id: 1, unit: "2208", resident: "Sarah Chen", pet: "Max", type: "Rabies vaccination", expiring: "Mar 8, 2026", status: "expiring" },
  { id: 2, unit: "310", resident: "Emily Park", pet: "Whiskers", type: "Municipal license", expiring: "Apr 1, 2026", status: "current" },
  { id: 3, unit: "1806", resident: "Tom Anderson", pet: "Buddy", type: "Liability insurance", expiring: "Feb 28, 2026", status: "expiring" },
  { id: 4, unit: "1806", resident: "Tom Anderson", pet: "Milo", type: "Vaccination record", expiring: "May 15, 2026", status: "current" },
]

/* ================================================================== */
/* Manager: violations                                                */
/* ================================================================== */

export const VIOLATIONS: Violation[] = [
  {
    id: 1,
    unit: "2104",
    resident: "Alex Nguyen",
    pet: "Rocky (Pitbull Mix)",
    type: "Off-leash violation",
    date: "Feb 20, 2026",
    stage: "fine-issued",
    stageLabel: "Fine Issued",
    amount: 150,
    paid: false,
    history: [
      { stage: "Verbal Warning", date: "Jan 5" },
      { stage: "Written Warning", date: "Jan 22" },
      { stage: "Fine ($150)", date: "Feb 20" },
    ],
    tab: "fines",
  },
  {
    id: 2,
    unit: "1201",
    resident: "Maria Santos",
    pet: "Bruno (Rottweiler)",
    type: "Aggressive behaviour",
    date: "Feb 21, 2026",
    stage: "investigation",
    stageLabel: "Under Investigation",
    amount: 0,
    paid: false,
    history: [{ stage: "Report Filed", date: "Feb 21" }],
    tab: "active",
  },
  {
    id: 3,
    unit: "1806",
    resident: "Tom Anderson",
    pet: "Buddy (Labrador)",
    type: "Noise complaint (barking)",
    date: "Feb 18, 2026",
    stage: "verbal-warning",
    stageLabel: "Verbal Warning",
    amount: 0,
    paid: false,
    history: [{ stage: "Verbal Warning", date: "Feb 18" }],
    tab: "warnings",
  },
  {
    id: 4,
    unit: "905",
    resident: "David Kim",
    pet: "Rex (German Shepherd)",
    type: "Unregistered pet",
    date: "Feb 15, 2026",
    stage: "written-warning",
    stageLabel: "Written Warning",
    amount: 0,
    paid: false,
    history: [
      { stage: "Verbal Warning", date: "Feb 1" },
      { stage: "Written Warning", date: "Feb 15" },
    ],
    tab: "warnings",
  },
  {
    id: 5,
    unit: "1402",
    resident: "Jennifer Lee",
    pet: "Wilbur (Miniature Pig)",
    type: "Unapproved animal type",
    date: "Feb 12, 2026",
    stage: "pending-review",
    stageLabel: "Pending Review",
    amount: 0,
    paid: false,
    history: [{ stage: "Report Filed", date: "Feb 12" }],
    tab: "active",
  },
  {
    id: 6,
    unit: "415",
    resident: "Chris Park",
    pet: "Daisy (Beagle)",
    type: "Waste cleanup violation",
    date: "Jan 28, 2026",
    stage: "fine-issued",
    stageLabel: "Fine Issued",
    amount: 75,
    paid: false,
    history: [
      { stage: "Verbal Warning", date: "Jan 10" },
      { stage: "Written Warning", date: "Jan 20" },
      { stage: "Fine ($75)", date: "Jan 28" },
    ],
    tab: "fines",
  },
]

export const RESOLVED_VIOLATIONS: ResolvedViolation[] = [
  { id: 101, unit: "607", type: "Noise complaint", resolved: "Feb 10, 2026", outcome: "Warning acknowledged" },
  { id: 102, unit: "1503", type: "Off-leash", resolved: "Feb 5, 2026", outcome: "Fine paid ($100)" },
  { id: 103, unit: "812", type: "Waste cleanup", resolved: "Jan 30, 2026", outcome: "Warning acknowledged" },
]

/* ================================================================== */
/* Manager: dashboard                                                 */
/* ================================================================== */

export const URGENT_ITEMS: UrgentItem[] = [
  {
    id: 1,
    title: "Aggressive Dog — Floor 12",
    body: "Unit 1201 resident reports aggressive behavior. Investigation required per bylaw 5.1.",
    severity: "critical",
    time: "45m ago",
  },
  {
    id: 2,
    title: "3rd Leash Violation — Unit 2104",
    body: "Escalation to formal written warning required. Previous verbal warnings on file.",
    severity: "high",
    time: "1h ago",
  },
]

export const MANAGER_RECENT_ACTIVITY: ManagerActivityEntry[] = [
  { id: 1, action: "Registration approved", detail: "Unit 310 — Cat", time: "2h ago", iconKey: "approval" },
  { id: 2, action: "Warning issued", detail: "Unit 2104 — Off-leash", time: "3h ago", iconKey: "gavel" },
  { id: 3, action: "Audit completed", detail: "Floors 1-10", time: "1d ago", iconKey: "file" },
  { id: 4, action: "ESA docs received", detail: "Unit 1402", time: "1d ago", iconKey: "file" },
  { id: 5, action: "Complaint filed", detail: "Noise — Floor 18", time: "2d ago", iconKey: "alert" },
]

/* ================================================================== */
/* Emergency directory (token-gated public view)                      */
/* ================================================================== */

export const EMERGENCY_DIRECTORY: EmergencyBuildingDirectory = {
  name: "Harbour View Tower",
  address: "1200 West Georgia St, Vancouver, BC V6E 4R2",
  totalPets: 47,
  dogs: 32,
  cats: 15,
  floors: [
    {
      floor: 3,
      units: [
        {
          unit: "310",
          pets: [
            { name: "Whiskers", species: "cat", notes: "Shy, hides under bed. Use carrier.", emergency: "Emily Park — 604-555-0101" },
          ],
        },
      ],
    },
    {
      floor: 9,
      units: [
        {
          unit: "905",
          pets: [
            { name: "Rex", species: "dog", notes: "Large breed (85 lbs). May be nervous. Approach slowly.", emergency: "David Kim — 604-555-0102" },
          ],
        },
      ],
    },
    {
      floor: 12,
      units: [
        {
          unit: "1201",
          pets: [
            { name: "Bruno", species: "dog", notes: "CAUTION: Aggressive behaviour on file. Do not approach without handler. Muzzle required.", emergency: "Maria Santos — 604-555-0103" },
          ],
        },
      ],
    },
    {
      floor: 14,
      units: [
        {
          unit: "1402",
          pets: [
            { name: "Wilbur", species: "dog", notes: "Miniature pig (ESA). Needs carrier. Sensitive to loud noises.", emergency: "Jennifer Lee — 604-555-0104" },
          ],
        },
      ],
    },
    {
      floor: 18,
      units: [
        {
          unit: "1806",
          pets: [
            { name: "Buddy", species: "dog", notes: "Friendly Labrador. Responds to commands. Leash on hook by door.", emergency: "Tom Anderson — 604-555-0105" },
            { name: "Milo", species: "cat", notes: "Siamese cat. Likely hiding in closet. Use carrier.", emergency: "Tom Anderson — 604-555-0105" },
          ],
        },
      ],
    },
    {
      floor: 21,
      units: [
        {
          unit: "2104",
          pets: [
            { name: "Rocky", species: "dog", notes: "Pitbull Mix (65 lbs). May be stressed. Approach calmly. Leash in kitchen drawer.", emergency: "Alex Nguyen — 604-555-0106" },
          ],
        },
      ],
    },
    {
      floor: 22,
      units: [
        {
          unit: "2208",
          pets: [
            { name: "Max", species: "dog", notes: "Golden Retriever. Very friendly. Will follow you. Leash by front door.", emergency: "Sarah Chen — 604-555-0107" },
            { name: "Luna", species: "cat", notes: "British Shorthair. Hides under bed when scared. Use carrier with blanket.", emergency: "Sarah Chen — 604-555-0107" },
          ],
        },
      ],
    },
  ],
}

/** Look up a building name from its public guest code. */
export function resolveBuildingCode(code: string): string | null {
  return VALID_BUILDING_CODES[code.trim().toUpperCase()] ?? null
}

/** The role keys that have a seeded demo user. */
export const DEMO_ROLES = Object.keys(MOCK_USERS) as (keyof typeof MOCK_USERS)[]
export type DemoRole = Extract<UserRole, "pet-owner" | "building-manager">
