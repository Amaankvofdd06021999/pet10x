# Product Requirements Document (PRD)
## Pet10x — Pet Governance, Risk & Community Platform for Multi-Unit Residential Buildings

**Version:** 2.0  
**Date:** February 21, 2026  
**Product Owner:** Amaan — AI Product Design Manager, Happening  
**Target Platform:** iOS (iPhone & iPad)  
**Initial Launch Market:** Canada (British Columbia focus)  
**Parent Company:** Park10x Services Inc.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Product Vision & Objectives](#2-product-vision--objectives)
3. [Legal Foundation & Strategic Positioning](#3-legal-foundation--strategic-positioning)
4. [Market Analysis](#4-market-analysis)
5. [User Personas](#5-user-personas)
6. [Core Features & Requirements](#6-core-features--requirements)
7. [Apple HIG Compliance & Design System](#7-apple-hig-compliance--design-system)
8. [Technical Architecture](#8-technical-architecture)
9. [Revenue Model](#9-revenue-model)
10. [Canadian Strata & Regulatory Framework](#10-canadian-strata--regulatory-framework)
11. [App Store Review Guidelines Compliance](#11-app-store-review-guidelines-compliance)
12. [Success Metrics & KPIs](#12-success-metrics--kpis)
13. [Development Roadmap](#13-development-roadmap)
14. [Risk Analysis & Mitigation](#14-risk-analysis--mitigation)
15. [Pass10x Integration Strategy](#15-pass10x-integration-strategy)
16. [Appendices](#appendices)

---

## 1. Executive Summary

Pet10x is a native iOS application that provides multi-unit residential buildings (condos, strata corporations, apartments, HOAs) with a digital governance, risk management, and community platform for pet-related operations. It replaces spreadsheet-based tracking, paper-based bylaw enforcement, and ad hoc complaint systems with a centralized digital layer designed for how strata corporations actually operate.

### 1.1 What Pet10x Is

Pet10x is a **governance and risk platform**, not a compliance or legal mandate tool. The BC Strata Property Act does not require pet registries, emergency responder pet databases, or centralized pet information systems. What the Act does is empower strata corporations to regulate animals through bylaws — and then provides no operational tools to enforce them. That gap is the product opportunity.

Pet10x digitizes the operational side of strata pet management: bylaw enforcement, accommodation documentation, incident tracking, risk scoring, insurance documentation, and community engagement.

### 1.2 Key Value Propositions

**For Strata Councils & Property Managers:**
- Digital bylaw enforcement engine with audit trails
- Grandfathering tracking (Section 123 compliance)
- Human rights accommodation workflow and documentation
- Risk scoring and insurance documentation for liability defense
- Incident management with CRT-ready evidence packaging
- Progressive enforcement system (warnings → fines → escalation)

**For Pet Owners:**
- Centralized pet profiles and documentation
- Transparent access to building-specific pet rules
- Community engagement with neighbors
- Service provider discovery and booking
- Digital record of compliance and good standing

**For Insurance & Risk Stakeholders:**
- Pet inventory with vaccination and behavior records
- Incident documentation and claims support
- Risk scoring per unit and per building
- Aggregate data for underwriting decisions

**For Service Providers:**
- Targeted access to pet owners in multi-unit buildings
- Booking and review infrastructure
- Cross-sell opportunity with Pass10x visitor management

### 1.3 Strategic Differentiator: Pass10x Integration

Pet10x is purpose-built as a companion product to Pass10x, Park10x's existing visitor parking management system. This creates cross-sell leverage that no competitor can replicate: visitor pet management, short-term rental pet tracking, temporary pet approvals, and building-wide operational integration.

### 1.4 Financial Summary

| Metric | Year 1 | Year 2 | Year 3 |
|--------|--------|--------|--------|
| Total Revenue (CAD) | $655,000 | $2,625,000 | $6,480,000 |
| Active Pet Owners | 15,000 | 35,000 | 75,000 |
| Buildings Onboarded | 75 | 250 | 600 |
| Premium Conversion Rate | 25% | 30% | 35% |

---

## 2. Product Vision & Objectives

### 2.1 Vision Statement

"To be the operational backbone for pet governance in multi-unit residential buildings — reducing liability exposure, streamlining bylaw enforcement, and building connected pet-friendly communities."

### 2.2 Primary Objectives

1. **Risk Reduction:** Provide strata corporations with defensible documentation of pet governance decisions, reducing liability in dog bite incidents, insurance claims, and CRT disputes
2. **Governance Automation:** Digitize bylaw enforcement, fine tracking, progressive discipline, and accommodation workflows that stratas are already legally required to handle fairly
3. **Community Harmony:** Reduce pet-related complaints through transparency, accountability, and structured resolution processes
4. **Ecosystem Building:** Create a marketplace connecting pet owners with vetted service providers, generating durable recurring revenue
5. **Data Infrastructure:** Build the data layer that insurers, property managers, and strata councils need for informed decision-making
6. **Pass10x Synergy:** Create cross-sell revenue and operational integration with Park10x's existing customer base

### 2.3 Success Criteria (12-Month)

- 50% adoption rate in targeted buildings within 12 months
- 90% user satisfaction rating (NPS > 50)
- 50% reduction in unresolved pet-related complaints for participating buildings
- $70 average revenue per building annually
- 10+ insurance broker partnerships
- 50+ strata management company partnerships
- 30% of Pass10x buildings cross-sold to Pet10x

### 2.4 What We Explicitly Do Not Claim

Pet10x does not position itself as:
- Legally required by the Strata Property Act
- A life-safety or emergency response system
- Compliance software mandated by statute
- A tool that first responders are obligated to use

These claims are not grounded in the legislation, would fail in B2B sales cycles, and create asymmetric liability risk. If a fire occurs and a pet dies after reliance on our system, the legal exposure is unnecessary and indefensible.

---

## 3. Legal Foundation & Strategic Positioning

### 3.1 The Actual Legal Landscape

The BC Strata Property Act treats pets as an **occupancy and nuisance issue**, not a life-safety issue. There is no statutory obligation on strata corporations to maintain pet registries, provide emergency responder access to pet data, or centralize pet information for fire or rescue purposes.

**Section 119 — Use of Strata Lots and Common Property**
This is the main authority allowing a strata to regulate pets. Owners and tenants must comply with bylaws, which may restrict or regulate use of strata lots and common property, including pet-related rules. There is no mention of emergency responder access to animal data.

**Section 123 — Grandfathering Provisions**
The only direct statutory section focused on pets. When new bylaws restrict pets, existing pets are protected and cannot be removed retroactively. Service and guide animals are exempt from all restrictions. This section has no link to emergency data, first responders, or centralized databases.

**Schedule of Standard Bylaws — Section 3(4)**
This is where most strata pet governance actually sits. Default rules permit one dog or one cat, small animals, and require leashing in common property. Strata may amend these bylaws to restrict number, type, or size; ban pets; require registration; or enforce control in common areas. **Pet registration exists only if a strata adopts it. There is no province-wide obligation.**

**Enforcement Provisions (Sections 130, 131, 135)**
Strata corporations can fine owners for pet violations, issue continuing fines for ongoing contraventions, and must follow procedural fairness (notice, hearing, then fine). These sections are the strongest commercial anchor for a SaaS platform.

### 3.2 The Human Rights Overlay

The real regulatory tension is not in the Strata Property Act — it is in disability accommodation. Service animals and support animals override strata bylaws. Human rights tribunals force accommodation even where bylaws prohibit animals. Stratas consistently struggle with verification, documentation, privacy, and fraudulent claims. Pet10x targets this underserved and legally complex pain point.

### 3.3 The Risk & Liability Opportunity

Strata corporations face liability exposure in:
- Dog bites and aggressive animal incidents
- Insurance claims and premium disputes
- Nuisance enforcement and CRT proceedings
- Municipal bylaw enforcement actions
- Duty of care arguments from occupants

None of this is mandated by the Act. But insurers and risk advisors increasingly push documentation. A building that cannot demonstrate pet inventory, vaccination tracking, aggressive animal reporting, and enforcement audit trails is exposed. This is where future regulation will likely emerge, and where the commercial opportunity is strongest.

### 3.4 Defensible Positioning

| Positioning | Status |
|-------------|--------|
| Risk reduction and liability defense | ✅ Strong — grounded in real exposure |
| Insurance leverage and premium reduction | ✅ Strong — insurers want data |
| Governance and bylaw enforcement automation | ✅ Strong — maps to actual strata obligations |
| Accommodation and human rights documentation | ✅ Strong — underserved, legally complex |
| Emergency readiness and safety planning | ⚠️ Supplementary — framed as optional value-add, not mandate |
| Statutory compliance requirement | ❌ Do not use — will be challenged and fail |
| First responder legal obligation | ❌ Do not use — not grounded in statute |

---

## 4. Market Analysis

### 4.1 Market Opportunity

**Canadian Pet Ownership:**
- 60% of Canadian households own pets (Canadian Animal Health Institute, 2024)
- 41% own dogs, 38% own cats
- Pet industry worth $10.2B CAD annually
- 8.5M dogs and 8.3M cats across Canada

**Multi-Unit Residential (Primary Target):**
- 2.1M condominium units in Canada
- 68% concentrated in Ontario, British Columbia, Alberta
- British Columbia: ~450,000 strata units
- 35-45% pet ownership in multi-unit buildings
- Average building spends $2,000-$5,000/year on pet-related governance costs (complaints, enforcement, legal)

**Strata Management Industry:**
- ~3,200 strata corporations in Metro Vancouver alone
- Growing professionalization driving SaaS adoption
- Insurance premiums rising 15-25% annually, driving demand for risk documentation

### 4.2 Competitive Landscape

| Feature | Pet10x | PetDesk | Pawprint | Nextdoor |
|---------|--------|---------|----------|----------|
| Pet Registry | ✅ | ✅ | ✅ | ❌ |
| Building/Strata Integration | ✅ | ❌ | ❌ | ❌ |
| Bylaw Enforcement Tools | ✅ | ❌ | ❌ | ❌ |
| Accommodation Workflow | ✅ | ❌ | ❌ | ❌ |
| Risk Scoring & Insurance | ✅ | ❌ | ❌ | ❌ |
| Incident/CRT Documentation | ✅ | ❌ | ❌ | ❌ |
| Community Feed | ✅ | ❌ | ❌ | ✅ |
| Service Marketplace | ✅ | ✅ | ❌ | ✅ |
| Lost & Found | ✅ | ❌ | ❌ | ✅ |
| Pass10x Integration | ✅ | ❌ | ❌ | ❌ |
| Canadian Strata Focus | ✅ | ❌ | ❌ | Partial |

**Competitive Advantages:**
1. **Strata governance integration** — no competitor operates at building operational level
2. **Pass10x cross-sell** — existing building relationships and distribution channel
3. **Human rights accommodation workflow** — legally complex, underserved
4. **Risk and insurance data layer** — durable B2B revenue
5. **Canadian-first regulatory focus** — deep alignment with BC strata law

### 4.3 Target Markets (Priority Order)

**Phase 1 — Year 1:**
1. British Columbia (Vancouver, Burnaby, Victoria, Surrey, Richmond)
2. Ontario (Toronto, Ottawa, Mississauga)

**Phase 2 — Year 2:**
3. Alberta (Calgary, Edmonton)
4. Quebec (Montreal, Quebec City)

---

## 5. User Personas

### 5.1 Primary Persona: Rachel — Strata Property Manager

**Demographics:** Age 42, manages 4 buildings (1,200 units), 15 years in property management

**Goals:**
- Enforce pet bylaws fairly and consistently with audit trails
- Reduce time spent on pet-related complaints and disputes
- Document accommodation requests properly to avoid CRT liability
- Provide insurance-ready pet records for building portfolio

**Pain Points:**
- Outdated spreadsheet-based pet tracking with no version control
- Inconsistent enforcement leading to CRT challenges
- Accommodation requests lacking proper documentation workflow
- No centralized evidence packaging when disputes escalate

**Technology Profile:** iPad for work, uses Yardi for property management, prefers reliable over flashy

**Why Pet10x:** "I need a system that creates audit trails I can defend at the CRT. Spreadsheets won't cut it when a tribunal asks for my enforcement history."

---

### 5.2 Secondary Persona: Sarah — Responsible Pet Owner

**Demographics:** Age 32, lives in 25-story Vancouver condo, 1 dog (Golden Retriever "Max")

**Goals:**
- Understand and comply with building pet rules
- Connect with other dog owners in building
- Find reliable pet services nearby
- Maintain good standing with building management

**Pain Points:**
- Confusion about building pet policies (scattered across PDFs and emails)
- Difficulty finding vetted pet sitters when traveling
- Limited visibility into what constitutes a violation
- No way to proactively demonstrate compliance

**Technology Profile:** iPhone 15 Pro, comfortable with apps, uses 15+ apps daily

**Why Pet10x:** "I want to know exactly what the rules are and show my building I'm a responsible owner."

---

### 5.3 Tertiary Persona: David — Strata Council President

**Demographics:** Age 55, owns unit in 8-story building, serves as volunteer council president

**Goals:**
- Reduce insurance premiums for the strata corporation
- Handle accommodation requests without getting sued
- Document everything in case disputes go to CRT
- Minimize personal liability as a council member

**Pain Points:**
- No training on human rights obligations for service animals
- Fear of making wrong decision on accommodation requests
- Difficulty proving fair and consistent enforcement
- Insurance broker asking for pet risk documentation council doesn't have

**Why Pet10x:** "Our insurance premiums went up 20% last year. I need to show the insurer we're managing pet risk properly."

---

### 5.4 Quaternary Persona: Jennifer — Mobile Pet Groomer

**Demographics:** Age 29, runs mobile grooming business, serves Greater Vancouver

**Goals:**
- Acquire new clients efficiently from multi-unit buildings
- Build recurring service relationships
- Reduce marketing costs vs. Google/Facebook ads
- Showcase work to targeted audience

**Pain Points:**
- High cost of digital advertising with low conversion
- Difficulty reaching pet owners in specific buildings
- Building access challenges for mobile service providers

**Technology Profile:** iPhone for business, active on Instagram, uses Square

**Why Pet10x:** "Most of my clients live in condos. Being listed where they already manage their pets is way better than Instagram ads."

---

## 6. Core Features & Requirements

### 6.1 Pet Profile Management (MVP — Must Have)

#### 6.1.1 Pet Information Database

**User Stories:**
- As a pet owner, I want to create a comprehensive profile for my pet so that all important information is centralized and my building can verify compliance
- As a building manager, I want to view all registered pets in my building to maintain accurate records and generate insurance documentation

**Requirements:**
- Multi-pet support per household (up to 6 pets per account)
- Photo gallery (up to 10 photos per pet)
  - Primary profile photo (required)
  - Additional photos for identification
  - Photo upload from Camera or Photo Library
  - Support for HEIC, JPEG, PNG formats
  - Maximum 10MB per photo, auto-compressed
- **Basic Information Fields:**
  - Pet name (required, max 50 characters)
  - Species (Dog, Cat, Bird, Small Mammal, Fish, Reptile, Other)
  - Breed (searchable dropdown + custom entry)
  - Age / Date of Birth
  - Gender (Male, Female, Unknown)
  - Weight (with unit selection: lbs/kg)
  - Color/Markings description
  - Distinguishing features
- **Medical & Safety Information:**
  - Spayed/Neutered status
  - Microchip number (with verification field) and registry name
  - Vaccination records (vaccine type, date, expiry, vet name, PDF upload)
  - Known medical conditions
  - Current medications
  - Behavioral notes (including aggression indicators)
  - Dietary restrictions/allergies
  - Special handling instructions
- **Licensing & Registration:**
  - Municipal license number and expiry date
  - License renewal reminder (push notification at 30, 14, 7 days)
  - License document photo upload
  - Building permit/approval reference number
  - Insurance information (for specific breeds where required)
- **Emergency Contacts:**
  - Primary owner (auto-filled from account)
  - Secondary guardian (name, phone, email, relationship)
  - Emergency pet sitter/caregiver
  - Veterinarian (clinic name, phone, address, after-hours contact)
  - Backup vet (optional)

#### 6.1.2 Location & Residence Information

**Requirements:**
- Building/Property name (from managed list or manual entry)
- Unit/Suite number and floor number
- Building access instructions
- Parking spot number (if applicable)
- Storage locker number (if pet supplies stored)

**Apple HIG Compliance:**
- iOS standard form components (UITextField, UITextView, UIDatePicker)
- Smart Form Auto-fill for contact information
- Dynamic Type for accessibility
- SF Symbols for icons (pawprint.fill, heart.fill, etc.)
- iOS photo picker best practices
- Core Data for offline-first architecture

---

### 6.2 Building Governance & Bylaw Enforcement (MVP — Must Have)

This is the core commercial engine. Every feature maps directly to operations stratas are already performing (poorly, with spreadsheets).

#### 6.2.1 Digital Bylaw Repository

**User Stories:**
- As a building manager, I want to publish our pet bylaws digitally so all residents have easy access and I can track acknowledgment
- As a pet owner, I want to understand my building's pet rules to ensure compliance

**Requirements:**
- Building-specific rule sets:
  - Number of pets allowed (by type)
  - Weight restrictions (if applicable)
  - Breed restrictions (with legal risk notes)
  - Designated pet areas (map integration)
  - Leash requirements
  - Quiet hours
  - Common area usage rules
  - Elevator etiquette
- Rule acceptance tracking:
  - Digital acknowledgment with timestamp
  - Version tracking for bylaw changes
  - Notification when bylaws are updated
- Pre-configured templates aligned with BC Standard Bylaw 3(4)
- Support for grandfathering existing pets (Section 123)
- Service animal exemption handling
- Human Rights Code accommodation tracking
- Searchable rule database with FAQ section per building

#### 6.2.2 Compliance Dashboard

**Building Manager View:**
- Pet registration completion rate
- License expiration tracking (red/yellow/green)
- Vaccination compliance rates
- Bylaw violation history with trends
- Outstanding fines and payment status
- Grandfathered pets vs. compliant pets breakdown
- Export reports (PDF, CSV) for CRT, insurance, and council meetings

**Pet Owner View:**
- Personal compliance score
- Outstanding items (color-coded)
- Quick renewal actions
- Compliance badges/achievements
- Good standing certificate (downloadable)

#### 6.2.3 Fine & Enforcement System

**Legal Compliance (Strata Property Regulation):**
- Fine schedule configuration per building
- Automatic fine calculation based on violation type
- Cannot exceed regulatory maximums without logged override
- Payment tracking and invoice generation
- Collection history

**Progressive Enforcement Workflow:**
1. Verbal warning (logged with timestamp)
2. Written warning (auto-generated letter)
3. First fine (with procedural fairness: notice + hearing opportunity)
4. Subsequent fines (if continuing contravention — Section 131)
5. Legal action referral (outside app, documented)

**Procedural Fairness (Section 135 Compliance):**
- Automated notice of complaint sent to pet owner
- Hearing request workflow with scheduling
- Decision documentation with reasoning
- Appeal process tracking
- Full audit trail for CRT defense

---

### 6.3 Accommodation & Human Rights Workflow (MVP — Must Have)

This is a major differentiator. No competing product addresses this legally complex, high-liability area.

#### 6.3.1 Accommodation Request System

**User Stories:**
- As a pet owner with a disability, I want to submit an accommodation request with supporting documentation so my strata can review it properly
- As a strata council member, I want a structured workflow for reviewing accommodation requests so we make defensible decisions

**Accommodation Request Flow:**
1. Owner submits request through app
2. Attach medical documentation (encrypted upload)
3. Describe disability and need for animal
4. System categorizes: Certified Service Animal → Auto-approve; Emotional Support Animal → Council Review; Therapy Animal → Council Review
5. Council reviews with in-app legal guidance
6. Decision logged with reasoning and supporting documentation
7. Appeal process if denied
8. All records encrypted and access-logged

**Service Animal Categories:**
- ✅ Certified Guide Dogs — Full automatic protection (Guide Dog and Service Dog Act)
- ✅ Certified Service Dogs — Full automatic protection
- ✅ Retired Certified Dogs — Full protection for life
- ⚠️ Emotional Support Animals — Not automatically protected, requires accommodation review
- ⚠️ Therapy Animals — Not automatically exempt, requires accommodation review
- ⚠️ Dogs in Training — Subject to strata restrictions unless specifically certified

**Manager Tools:**
- Clear distinction between service animals and pets in all views
- Legal guidance cards at each decision point
- Documentation storage for certifications (encrypted)
- Audit trail for all exemption decisions
- When to seek legal advice alerts
- Undue hardship assessment templates

**Privacy & Security:**
- Encrypted storage of all medical information
- Access restricted to authorized council members only
- Audit log of every access event
- PIPEDA-compliant data handling
- Separate data retention policy for medical records

---

### 6.4 Incident Reporting & Resolution (MVP — Must Have)

#### 6.4.1 Nuisance Reporting System

**User Stories:**
- As a resident, I want to report a pet-related issue so management can address it fairly
- As a building manager, I want to track and resolve pet complaints with evidence that holds up at the CRT

**Incident Categories:**
- Excessive barking/noise
- Aggressive behavior (flagged as high-priority)
- Off-leash in prohibited areas
- Waste not cleaned
- Prohibited area access
- Unauthorized pet (exceeds bylaw limits)
- Other

**Report Submission:**
- Select offending pet (if known) or describe animal
- Date/time of incident
- Location in building
- Detailed description (required, min 50 characters)
- Photo/video evidence (up to 3 files)
- Witness information (optional)
- Anonymous reporting option

**Manager Tools:**
- Incident dashboard with priority queue
- Response templates aligned with progressive enforcement
- Warning letter generator (customizable)
- Fine tracking and invoicing
- Pattern detection (repeat offenders flagged)
- Reporting analytics with trends
- CRT evidence export package

**Due Process:**
- Anonymization of reporters (except to authorized managers)
- Right to respond for accused pet owners
- Timestamp and location verification
- Balanced presentation of both sides
- Clear evidence requirements

#### 6.4.2 Dispute Resolution & CRT Preparation

**Features:**
- Owner response to nuisance reports
- Counter-evidence submission (photos, videos, witness statements)
- Mediation request workflow
- CRT Export Package:
  - Complete incident timeline
  - All communications
  - Evidence files
  - Bylaw versions in effect
  - Enforcement history
  - Accommodation records (if applicable)
  - Procedural fairness documentation
- Settlement documentation and tracking

---

### 6.5 Community Features (MVP — Must Have)

#### 6.5.1 Lost & Found Bulletin Board

**Requirements:**
- Lost pet posting (auto-populate from pet profile)
  - Last seen location (map integration)
  - Date/time last seen
  - Reward amount (optional)
  - Contact preferences
  - Share to social media
- Found pet reporting (photo upload, location, description)
- Search and filter (species, color, location, date, status)
- Status updates ("Still looking", "Possible sighting", "Found — safe")
- Proximity alerts (push notifications within 5km)
- Success stories archive

**Apple HIG Compliance:**
- iOS 18 Live Activities for active lost pet alerts
- Dynamic Island updates for iPhone 14 Pro+
- UNUserNotificationCenter for push alerts

#### 6.5.2 Social Feed (Building-Specific)

**Requirements:**
- Text posts (280 character limit for MVP)
- Photo/video sharing (up to 4 images per post)
- Pet tagging and reactions (like, helpful, celebrate)
- Comments (threaded, max 3 levels)
- Content moderation (report, auto-flagging, manager review queue)
- Post categories: General, Question, Recommendation, Warning/Alert, Success Story

#### 6.5.3 Events & Activities

**Requirements:**
- Event creation by residents and managers
- Event types: Dog walk/playdate, training session, vaccination clinic, building pet meeting, adoption event
- Event details: Title, description, date/time, location, max attendees, cost
- RSVP management with waitlist
- Calendar integration (EventKit for Apple Calendar)
- Event reminders and recurring event support
- Post-event photo sharing

---

### 6.6 Pet Status Tracking (MVP — Must Have)

#### 6.6.1 Real-Time Status Updates

**User Stories:**
- As a building manager, I want to understand pet presence patterns for facility planning and incident context
- As a pet owner, I want to easily update my pet's status for building records

**Status Types:**
- Home (default)
- Away — Out of Building
- Away — On Vacation
- At Veterinarian
- At Daycare/Kennel
- Other

**Status Update Methods:**
- Manual toggle (quick access from home screen widget)
- Scheduled status changes
- Geofencing automation (optional, with explicit permission)

**Status Visibility Levels:**
- Private (manager view only)
- Building management + authorized personnel
- Community (for social features)

**Geofencing (Optional Feature):**
- Building boundary definition
- Automatic "Away"/"Home" detection
- Battery-efficient implementation (significant location change API)
- User control and privacy settings
- Request "Always Allow" with clear justification per Apple guidelines

---

### 6.7 Risk Scoring & Insurance Integration (MVP — Must Have)

This is a core B2B value driver. Insurance underwriting is the commercial anchor for recurring revenue.

#### 6.7.1 Building Risk Score

**Risk Factors:**
- Number and type of pets
- Breed risk profile (based on insurance industry data, not BSL)
- Vaccination compliance rate
- Incident history and severity
- Accommodation documentation completeness
- Bylaw enforcement consistency

**Outputs:**
- Building-level risk score (1-100)
- Risk trend over time
- Actionable recommendations to improve score
- Insurance-ready risk summary report (PDF)
- Comparative benchmarking against similar buildings

#### 6.7.2 Insurance Documentation Package

**Features:**
- Pet inventory with vaccination status
- Incident history with resolution documentation
- Aggressive animal reporting and actions taken
- Accommodation records (redacted for privacy)
- Enforcement audit trail
- Annual risk summary for insurance renewal
- Digital export for brokers and underwriters

---

### 6.8 Emergency Readiness (Phase 2 — Should Have)

Emergency readiness is positioned as a **supplementary value-add**, not a core compliance or mandate feature. It is clearly disclaimed as a supplementary tool that does not create or imply any life-safety guarantee.

#### 6.8.1 Building Pet Summary for Emergency Context

**Requirements:**
- Summary view: Total pets by species per building
- Unit-level pet presence indicator (based on status)
- Special handling notes (aggressive, nervous, requires carrier)
- Owner emergency contact information

**Access & Security:**
- Accessible only to authorized building management
- Optional QR code for building-level summary (time-limited tokens, 4-hour expiry)
- All access logged
- Encrypted data transmission
- No personal owner information in summary view
- Clear disclaimer: "Supplementary information only. Not a life-safety system."

**Partnership Approach:**
- Frame as risk management documentation, not responder obligation
- Offer as value-add to insurance and safety planning conversations
- No MOUs that imply safety guarantees
- No claims of rescue time reduction or rescue success rates

---

### 6.9 Service Provider Marketplace (Phase 2 — Should Have)

#### 6.9.1 Service Directory

**Categories:**
Veterinary clinics, emergency vets, mobile vets, groomers, dog walkers, pet sitters/boarding, trainers, pet supply stores, pet insurance, pet photography, pet waste removal, pet taxi services

**Provider Profile:**
Business name/logo, service description, service area (map), pricing, hours, credentials, insurance verification, photos, customer reviews/ratings, response time SLA, booking integration, special offers

**Search & Discovery:**
Filter by category, location, rating, price. Sort by distance, rating, availability. Favorite providers, request quote, direct messaging, in-app booking.

#### 6.9.2 Reviews & Ratings

- 5-star rating system
- Written reviews (50-500 characters) with photo uploads
- Verified customer badge
- Business response capability
- Helpful voting and report functionality
- Moderation system

---

### 6.10 Advanced Features (Phase 3 — Nice to Have)

- **Pet Health & Wellness:** Vaccination reminders, medication schedules, weight tracking, vet appointment reminders, health trends
- **Activity Tracking:** Walk logging (GPS), exercise goals, building competitions, Apple Health integration
- **Pet Insurance Marketplace:** Compare plans, digital insurance card, claim submission and tracking
- **Breed-Specific Content:** Care guides, training tips, health information, breed communities
- **AI Features:** Breed identification from photos, automated incident severity assessment, predictive compliance alerts

---

## 7. Apple HIG Compliance & Design System

### 7.1 Core Design Principles

**Clarity:** System fonts (SF Pro, SF Pro Rounded), clear visual hierarchy, purposeful color use, legible text at all sizes, full Dynamic Type support.

**Deference:** Content-first approach, minimal chrome, pet photos and important info take center stage, subtle animations, respect user attention.

**Depth:** Visual layers to convey hierarchy, smooth transitions, translucency where appropriate, spatial relationships with shadows and blur.

### 7.2 Navigation Architecture

**Tab Bar (5 tabs):**
1. Home — `house.fill`
2. Community — `person.3.fill`
3. Services — `bag.fill`
4. Alerts — `bell.fill`
5. Profile — `person.crop.circle.fill`

**Navigation Bar:** Large title style for primary screens, inline titles for details, context-appropriate actions, back button with parent title.

**Modal Presentations:** Sheet style for focused tasks (create post, report incident, submit accommodation request).

### 7.3 Layout & Spacing

- Standard margins: 16pt (leading/trailing)
- Section spacing: 24pt
- Element spacing: 8pt (small), 12pt (medium), 16pt (large)
- Card layouts: 12pt corner radius
- 8pt base grid system
- Full safe area inset respect (notch, Dynamic Island, home indicator)

### 7.4 Typography

| Style | Font | Size | Usage |
|-------|------|------|-------|
| Large Title | SF Pro | 34pt | Pet names, screen titles |
| Title 1 | SF Pro | 28pt | Section headers |
| Title 2 | SF Pro | 22pt | Subsection headers |
| Headline | SF Pro Semibold | 17pt | Emphasized content |
| Body | SF Pro | 17pt | Standard content |
| Callout | SF Pro | 16pt | Secondary content |
| Subheadline | SF Pro | 15pt | Supporting text |
| Footnote | SF Pro | 13pt | Metadata, timestamps |
| Caption 1 | SF Pro | 12pt | Tertiary info |
| Caption 2 | SF Pro | 11pt | Minimum readable size |

**Critical Rules:**
- Minimum readable size: 11pt (per Apple guidelines)
- Avoid light font weights — use Medium, Semibold, or Bold
- Support Dynamic Type at all accessibility sizes
- Maintain 1.2x minimum line spacing

### 7.5 Color System

Pet10x uses a comprehensive color system designed for accessibility, brand consistency, and Apple HIG compliance. Full specifications are in separate reference documents: **Pet10x_Color_System.md** and **Pet10x_Color_Reference_Card.md**.

#### Primary Brand Colors

| Token | Hex | RGB | Usage |
|-------|-----|-----|-------|
| Primary (Main) | `#FD9340` | 253, 147, 64 | Primary CTAs, buttons, brand moments |
| Primary Light | `#FFAB66` | 255, 171, 102 | Hover states, light backgrounds |
| Primary Dark | `#E67E28` | 230, 126, 40 | Pressed states, text links (better contrast) |
| Primary Subtle | `#FFF4EB` | 255, 244, 235 | Subtle backgrounds, cards |

#### Secondary Brand Colors

| Token | Hex | RGB | Usage |
|-------|-----|-----|-------|
| Secondary (Teal) | `#2FBFB8` | 47, 191, 184 | Health/wellness features, secondary actions |
| Secondary Light | `#5FD4CF` | 95, 212, 207 | Hover states |
| Secondary Dark | `#1F9A95` | 31, 154, 149 | Pressed states |
| Secondary Subtle | `#E8F8F7` | 232, 248, 247 | Light backgrounds for health sections |

#### Text Colors

**Light Mode:**
| Token | Hex | Contrast | Usage |
|-------|-----|----------|-------|
| Primary | `#1F1F1F` | 18.2:1 ✅ | Headlines, body text |
| Secondary | `#484444` | 9.75:1 ✅ | Supporting text, labels |
| Tertiary | `#787878` | 4.54:1 ✅ | Timestamps, metadata |
| Link | `#E67E28` | 4.14:1 ✅ | Interactive text, links |

**Dark Mode:** Primary `#F5F5F5`, Secondary `#B8B8B8`, Tertiary `#8E8E8E`, Link `#FFAB66`

#### Semantic Colors

| Token | Hex | Usage |
|-------|-----|-------|
| Success | `#34C759` | Confirmations, healthy status, compliance (bg: `#E8F8ED`) |
| Warning | `#FFCC00` | Expiring items, cautions (bg: `#FFF9E6`) |
| Error | `#FF3B30` | Errors, destructive actions, urgent alerts (bg: `#FFEFEE`) |
| Info | `#007AFF` | Informational messages, tips (bg: `#E6F2FF`) |

#### Background Colors

| Level | Light | Dark |
|-------|-------|------|
| Base | `#FFFFFF` | `#000000` |
| Secondary | `#F8F8F8` | `#1C1C1E` |
| Tertiary | `#F0F0F0` | `#2C2C2E` |
| Elevated | `#FFFFFF` + shadow | `#1C1C1E` + shadow |

#### Pet Type Colors

| Type | Hex | Name |
|------|-----|------|
| Dog | `#A0522D` | Warm Brown |
| Cat | `#9B59B6` | Soft Purple |
| Bird | `#3498DB` | Sky Blue |
| Fish | `#1ABC9C` | Ocean Blue |
| Small Mammal | `#7CB342` | Earthy Green |
| Reptile | `#6B8E23` | Olive Green |

#### Status Colors

| Status | Hex | Color |
|--------|-----|-------|
| Home | `#34C759` | Green |
| Away | `#8E8E93` | Gray |
| At Vet | `#007AFF` | Blue |
| Emergency | `#FF3B30` | Red |
| On Vacation | `#FD9340` | Orange |

#### Borders & Separators

| Element | Light | Dark |
|---------|-------|------|
| Divider | `#E5E5E5` | `#38383A` |
| Border Default | `#D1D1D6` | `#48484A` |
| Border Focus | `#FD9340` | `#FFAB66` |
| Border Error | `#FF3B30` | `#FF453A` |

#### Accessibility Requirements

- All text combinations meet WCAG 2.1 AA (4.5:1 normal text, 3:1 for 18pt+)
- Primary Orange (`#FD9340`) only for large text (18pt+) on white backgrounds
- Use Primary Dark (`#E67E28`) for small text
- All colors tested for colorblind users
- Full dark mode support
- Never rely on color alone for meaning

### 7.6 Iconography

**SF Symbols (preferred):** dog.fill, cat.fill, bird.fill, fish.fill, alarm.fill, cross.case.fill, mappin.and.ellipse, calendar, person.3.fill, exclamationmark.shield.fill, doc.text.fill

**Custom Icons:** Vector (SVG), export 1x/2x/3x, 44x44pt minimum touch target, consistent with SF Symbols style.

### 7.7 Components

**Lists (90% of mobile design):**
Three decisions per list: (1) text display, (2) left side content, (3) right side action. Inset grouped as default style. Swipe actions, disclosure indicators, pull-to-refresh, search bar.

**Forms:** Grouped related fields, appropriate input types, inline validation, clear error states, picker wheels, in-line date pickers.

**Cards:** 12pt corners, subtle shadow, 16pt padding, support long-press for quick actions.

**Buttons:** Primary (filled `#FD9340`, white text), Secondary (outlined), Tertiary (text only), Destructive (red). Minimum 44pt height, 8pt corner radius.

### 7.8 Touch & Accessibility

- **44x44pt minimum** for all tappable elements
- **8pt minimum** spacing between interactive elements
- **VoiceOver:** Meaningful labels, logical grouping, custom actions
- **Dynamic Type:** All text scales, layouts adapt, tested at all sizes
- **Motor:** Switch Control and AssistiveTouch support
- **Reduce Motion:** Respect accessibility setting

---

## 8. Technical Architecture

### 8.1 Technology Stack

**Frontend:**
- Swift 5.9+
- SwiftUI (primary) + UIKit (where needed)
- Combine framework for reactive programming
- Core Data for local persistence
- CloudKit for iCloud sync

**Backend:**
- Node.js with Express
- PostgreSQL database
- Redis for caching and session management
- AWS S3 for media storage
- AWS Lambda for serverless functions
- AWS API Gateway

**APIs & Services:**
MapKit, Core Location, CloudKit, StoreKit 2, Push Notification Service, Vision framework (QR scanning), EventKit, HealthKit (future)

**Authentication:**
- Sign in with Apple (required, primary)
- Email/password (optional)
- Biometric (Face ID / Touch ID)
- Google Sign-In, Facebook Login (optional)

**Analytics:** Apple App Analytics (privacy-focused), custom analytics (GDPR/PIPEDA compliant)

**Crash Reporting:** Apple Crash Reports + Sentry

### 8.2 Data Architecture

```
User
├── Profile (Name, Email, Phone, Photo, UserType, Preferences)
├── Residence (BuildingID, UnitNumber, Floor, MoveInDate, AccessNotes)
└── Subscription (Plan, Status, StartDate, ExpiryDate)

Pet
├── BasicInfo (Name, Species, Breed, DOB, Gender, Weight, Photos[])
├── Medical (Microchip, Vaccinations[], Medications[], Conditions[], VetInfo)
├── Licensing (MunicipalLicense, LicenseExpiry, BuildingPermit)
├── EmergencyContacts[]
├── Status (CurrentStatus, LastUpdated, ScheduledChanges[])
├── BehaviorNotes
├── RiskProfile (AggressionIndicators, IncidentHistory[], RiskScore)
└── AccommodationStatus (Type, Certification, ExemptionDate, Documentation[])

Building
├── Info (Name, Address, TotalUnits, Floors, PropertyManager)
├── PetRules (AllowedAnimals[], Restrictions, DesignatedAreas, ByLawVersions[])
├── Governance (Incidents[], Fines[], Accommodations[], EnforcementHistory[])
├── RiskProfile (BuildingRiskScore, InsuranceDocuments[], TrendData)
├── Amenities (DogPark, WashStation, OtherAmenities[])
└── Residents[]

Incident
├── ReportInfo (Category, Severity, DateTime, Location, Description)
├── Evidence (Photos[], Videos[], WitnessStatements[])
├── Resolution (Status, ManagerNotes, Actions[], Timeline)
├── Enforcement (Warnings[], Fines[], Appeals[])
└── CRTPackage (ExportDate, DocumentBundle)
```

### 8.3 Security & Privacy

**Data Protection:**
- End-to-end encryption for sensitive data (medical, accommodation records)
- Encryption at rest (AES-256)
- Encryption in transit (TLS 1.3)
- Keychain storage for credentials
- Biometric authentication for sensitive actions

**Privacy Principles (PIPEDA Compliance):**
- Minimize data collection
- Clear purpose for each data point
- User control over data sharing
- Transparent privacy policy
- Right to access, correction, and deletion
- Data breach notification procedures
- Cross-border data transfer disclosure

**App Store Privacy Nutrition Labels:**
- Data Collected: Contact info, location (precise, for geofencing), photos, user-generated content
- Data Linked to User: All of the above
- Data Not Collected: Financial info (handled by Apple IAP), browsing history, search history

### 8.4 Offline Functionality

- Core features available offline (pet profiles, building rules, cached data)
- Queue actions for sync when connectivity returns
- Clear sync status indicators
- Conflict resolution strategy (last-write-wins with manual override for conflicts)

### 8.5 Performance Requirements

| Metric | Target |
|--------|--------|
| App Download Size | < 50 MB |
| Cold Launch | < 2 seconds |
| Warm Launch | < 0.5 seconds |
| UI Interaction Response | < 100ms |
| Network Timeout | 10 seconds |
| Background Location Battery | < 5% per day |
| Memory Footprint | < 200 MB |
| Crash-Free Sessions | > 99.5% |

---

## 9. Revenue Model

### 9.1 Multi-Tier Subscription Model

#### Free Tier — "Pet Basic" (Forever Free)

- Register up to 2 pets with basic profile
- View building pet rules
- Emergency contact information
- Lost & found bulletin board (view only)
- Community feed (read-only)
- Service directory (limited to 10 listings)

**Target:** Casual pet owners, single-pet households, trial users
**Conversion Goal:** 25% to paid within 90 days

#### Premium Tier — "Pet Plus" — $4.99 CAD/month or $49.99/year

- Unlimited pet registrations
- Advanced pet profiles (medical history, vaccinations)
- Vaccination and license reminders
- Full community access (post, comment, react)
- Create lost & found posts
- Event creation and RSVP
- Report nuisance incidents (with evidence upload)
- Real-time pet status updates
- Custom pet badges and achievements
- Ad-free experience
- Premium customer support
- Pet wellness content
- Service provider direct messaging
- Priority lost & found listing

**Target:** Active pet owners, multi-pet households
**Expected Adoption:** 40% of engaged free users

#### Building Manager Plan — $199 CAD/month or $1,999/year per building

- All Premium features for personal pets
- Building administration dashboard
- Unlimited resident accounts
- Pet compliance tracking with audit trails
- Automated license/vaccination reminders
- Incident management system with CRT export
- **Accommodation request workflow**
- **Risk scoring and insurance documentation**
- Report generation and analytics
- Custom building rules and bylaws
- Resident communication tools
- Emergency readiness summary (supplementary)
- Export data and reports (PDF, CSV)
- API access for property management software integration
- Dedicated account manager
- Priority support (4-hour response)
- White-label option (+$99/month)

**Target:** Property managers, strata councils
**Sales Strategy:** Direct B2B, property management partnerships, Pass10x cross-sell

#### Enterprise Plan — Custom Pricing (Starting $499 CAD/month)

- All Building Manager features
- Multi-building management (unlimited)
- Consolidated portfolio reporting
- Custom branding
- API access with higher rate limits
- Dedicated infrastructure
- 99.9% uptime SLA
- Custom feature development
- Onboarding, training, dedicated success manager

**Target:** Large property management firms (100+ buildings)

### 9.2 Additional Revenue Streams

**Service Provider Listings:**
- Basic (free): Profile, 5 photos, hours, contact, 10 reviews
- Featured ($49/month): Priority search, unlimited photos, badge, booking calendar, analytics
- Premium ($99/month): All Featured + homepage rotation, sponsored posts (2/month), direct messaging, verified badge

**Booking Commission:** 8% on appointments booked through app (Stripe processing, weekly payouts)

**Sponsored Content:** Native ads in community feed ($200/building/month), banner ads in directory ($500/month). Never in governance or emergency features.

**Data & Insights (B2B):** Anonymized pet demographic trends, service utilization patterns, geographic insights. Fully anonymized, aggregated, opt-in only.

### 9.3 Financial Projections

| Revenue Source | Year 1 | Year 2 | Year 3 |
|----------------|--------|--------|--------|
| Premium Subscriptions | $250,000 | $750,000 | $1,750,000 |
| Building Manager Plans | $150,000 | $500,000 | $1,200,000 |
| Enterprise Plans | — | $50,000 | $180,000 |
| Service Provider Listings | $180,000 | $900,000 | $2,400,000 |
| Booking Commissions | $50,000 | $200,000 | $500,000 |
| Advertising | $25,000 | $150,000 | $300,000 |
| Data Insights | — | $75,000 | $150,000 |
| **Total** | **$655,000** | **$2,625,000** | **$6,480,000** |

### 9.4 Unit Economics

| Segment | CAC | LTV (3yr) | LTV:CAC |
|---------|-----|-----------|---------|
| Premium Users | $15 | $150 | 10:1 |
| Building Managers | $400 | $6,000 | 15:1 |
| Service Providers | $75 | $2,700 | 36:1 |

---

## 10. Canadian Strata & Regulatory Framework

### 10.1 BC Strata Property Act Implementation

**Standard Bylaw 3(4) — Pre-configured Templates:**
- One dog OR one cat (default)
- Reasonable number of fish or small aquarium animals
- Reasonable number of small caged mammals
- Up to two caged birds
- Easy customization for amended bylaws
- Historical bylaw version tracking

**Section 123 — Grandfathering System:**
- Date stamp when bylaw enacted
- Automatic "grandfathered" status for pre-existing pets
- Clear visual badge on pet profiles
- Restriction on replacing grandfathered pets with non-compliant ones
- Legacy expiration tracking

**Section 135 — Procedural Fairness:**
- Notice of complaint sent to pet owner
- Hearing opportunity before fine
- Decision documentation
- Appeal process
- Full audit trail

**Leashing Requirements (Standard Bylaw):**
- Building rules display leashing requirements
- "Off-leash violation" incident category
- Map showing designated on/off-leash areas

### 10.2 Guide Dog and Service Dog Act (BC)

- Automatic exemption for certified guide and service dogs
- Certification upload and verification
- Cannot be subject to standard nuisance reports
- Retired service dog status with retained exemption
- "Certified Service Dog" badge on profile

### 10.3 Municipal Licensing Integration

**Phase 1 Municipalities:** Vancouver, Burnaby, Richmond, Surrey, Victoria, Toronto, Ottawa, Calgary

**Features:**
- Pre-load municipal requirements by address
- Display applicable license requirements
- Link to municipal registration portals
- Expiry tracking with renewal reminders (30, 14, 7 days)
- Manager compliance dashboard for unlicensed pets

### 10.4 Breed-Specific Legislation Approach

- No breed discrimination in app features
- Inform users of their rights
- Recommend behavior-based rules to managers
- Insurance considerations kept separate from bylaw enforcement
- Educational content about BSL trends (most jurisdictions moving away)

### 10.5 PIPEDA Privacy Compliance

- Clear privacy policy in plain language
- Consent for all collection, use, disclosure
- Minimize collection to necessary data only
- Right to access, correction, and deletion
- Data breach notification procedures
- Cross-border data transfer disclosure
- Special handling for accommodation medical records (encrypted, access-logged)

### 10.6 Legal Disclaimers

The app must include clear disclaimers:
- Pet10x is a governance and management tool, not legal advice
- Pet10x is not a life-safety system and creates no safety guarantee
- Pet10x does not replace professional legal counsel for strata disputes
- Building managers should consult legal counsel for complex accommodation decisions
- Emergency readiness features are supplementary information only

---

## 11. App Store Review Guidelines Compliance

### 11.1 Safety (Guideline 1)
- ✅ Community moderation for UGC with report/block functionality
- ✅ Content removal within 24 hours, clear TOS
- ✅ No features encouraging harm to animals or people
- ✅ Service provider vetting process

### 11.2 Performance (Guideline 2)
- ✅ Complete builds with demo account (demo@pet10x.ca / DemoReview2025!)
- ✅ TestFlight for beta distribution
- ✅ Accurate metadata and screenshots
- ✅ iPhone and iPad optimized
- ✅ iOS 16.0+ minimum

### 11.3 Business (Guideline 3)
- ✅ StoreKit 2 for all in-app purchases
- ✅ Auto-renewable subscriptions with clear terms
- ✅ 14-day free trial, subscription management in Settings
- ✅ B2B plans sold outside app (compliant with Apple B2B guidelines)
- ✅ 8% booking commission via Stripe

### 11.4 Design (Guideline 4)
- ✅ Original concept and native iOS experience
- ✅ Sign in with Apple (required, prominent)
- ✅ iOS 18 Widget, Lock Screen controls, Share extension

### 11.5 Legal (Guideline 5)
- ✅ Privacy policy, permission requests at point of use
- ✅ "Always Allow" location only for optional geofencing
- ✅ All data usage disclosed in privacy nutrition labels
- ✅ PIPEDA compliant

### 11.6 Review Notes Template

```
DEMO ACCOUNT:
Username: demo@pet10x.ca
Password: DemoReview2025!
Pre-populated: 2 pets, sample building, community feed, service providers, test incident

LOCATION SERVICES:
Optional geofencing for pet status auto-update. Clearly explained in-app,
declined without losing functionality.

SUBSCRIPTION:
14-day free trial, then $4.99 CAD/month. Manage in iOS Settings.
Sandbox test subscription available.

B2B PLANS:
Building Manager and Enterprise plans sold via web portal.

MARKET:
Initially targeted at Canadian market (British Columbia strata legislation).
```

---

## 12. Success Metrics & KPIs

### 12.1 User Acquisition

| Metric | Year 1 Target |
|--------|---------------|
| Total Downloads | 50,000 |
| Monthly Active Users | 25,000 |
| DAU/MAU Ratio | > 35% |
| App Store Conversion | > 25% |
| Install Cost (CPI) | < $2.50 |
| Viral Coefficient | > 0.5 |

### 12.2 Engagement

| Metric | Target |
|--------|--------|
| Session Length | 5-8 min average |
| Sessions/Week | 4+ |
| Pet Profile Completion | > 85% |
| Community Engagement | > 25% of users/month |
| Service Directory CTR | > 15% |

### 12.3 Revenue

| Metric | Year 1 Target |
|--------|---------------|
| Free → Premium Conversion | 25% within 90 days |
| Building Manager Adoption | 30% of targeted buildings |
| MRR by Month 12 | $55K |
| ARPU | $2.60/month |
| Premium Churn | < 5% monthly |
| Building Manager Churn | < 3% monthly |

### 12.4 Product Health

| Metric | Target |
|--------|--------|
| App Store Rating | > 4.5 stars |
| Crash-Free Sessions | > 99.5% |
| P95 Load Time | < 2 seconds |
| Support Response Time | < 4 hours |
| D1 Retention | > 70% |
| D7 Retention | > 50% |
| D30 Retention | > 35% |

### 12.5 Governance Impact

| Metric | Target |
|--------|--------|
| Complaint Resolution Time | < 48 hours |
| Building Complaint Reduction | 50% decrease |
| License Compliance Improvement | 60% increase |
| CRT Export Usage | Track and report |
| Insurance Documentation Completion | > 75% of managed buildings |

---

## 13. Development Roadmap

### 13.1 Phase 1: MVP (Months 1-6)

**Goal:** Launch functional governance + community app in BC market

**M1-M2 — Foundation:**
- Requirements finalization and legal review
- Technical architecture and database schema
- UI/UX wireframes and design system in Figma
- Backend infrastructure setup (AWS)
- iOS project setup (SwiftUI)

**M3-M4 — Core Features:**
- User authentication (Sign in with Apple)
- Pet profile creation and management
- Building management system with bylaw repository
- Governance dashboard (compliance tracking)
- Accommodation request workflow
- Incident reporting system
- Progressive enforcement engine
- Push notifications

**M5 — Community & Status:**
- Community social feed (building-specific)
- Lost & found bulletin board
- Pet status tracking
- Basic service directory
- Geofencing (optional)

**M6 — Polish & Launch:**
- Beta testing (TestFlight, 100-200 users from Pass10x buildings)
- Bug fixes and performance optimization
- App Store assets and metadata
- Privacy policy and legal disclaimers
- CRT export package functionality
- **Launch: Month 6, Week 4**

### 13.2 Phase 2: Growth (Months 7-12)

**Goal:** Expand features, grow user base, establish B2B revenue

**M7-M8:**
- Risk scoring and insurance documentation package
- Events and activities features
- Enhanced social features (photo/video sharing)
- Service marketplace with booking and reviews
- Analytics dashboard v1

**M9-M10:**
- iPad optimization
- Emergency readiness summary (supplementary)
- Property management software integration (Yardi, AppFolio)
- Advanced reporting and CRT export enhancements
- Pass10x integration (visitor pet management)

**M11-M12:**
- Pet health tracking and vaccination reminders
- Municipal licensing API integrations
- Seasonal features and weather-based alerts
- Expand to Toronto and Calgary markets

### 13.3 Phase 3: Scale (Year 2)

**Q1:** Service provider commission system, advertising platform, referral program, corporate partnerships
**Q2:** Activity tracking, pet camera integration, vet clinic partnerships, insurance marketplace
**Q3:** AI features (breed ID, severity assessment, predictive alerts), Montreal/Ottawa expansion, French localization
**Q4:** Adoption platform integration, professional content, breed communities

### 13.4 Phase 4: Innovation (Year 3+)

- AR features, ML behavior prediction, smart home integration
- US expansion (California, New York, Texas) with HOA/condo law adaptation
- Android app, web application, Apple Watch companion
- Telehealth vet consultations
- Enterprise analytics and benchmarking platform

---

## 14. Risk Analysis & Mitigation

### 14.1 Technical Risks

**App Store Rejection** — Medium probability, High impact
Mitigation: Thorough guideline review, demo account, proactive App Review communication, pre-submission consultation

**Data Breach** — Low probability, Catastrophic impact
Mitigation: E2E encryption, security audits, penetration testing, bug bounty, incident response plan, cyber insurance, SOC 2 Type II by Year 2

**Scalability Issues** — Medium probability, Medium impact
Mitigation: Cloud-native auto-scaling, load testing, database optimization, CDN, performance monitoring

### 14.2 Legal & Regulatory Risks

**Strata Bylaw Misinterpretation** — Medium probability, Medium impact
Mitigation: Legal review of all governance features, clear disclaimers (tools not legal advice), strata law expert consultation, liability insurance

**PIPEDA Privacy Violation** — Low probability, High impact
Mitigation: Privacy by design, regular PIAs, transparent policy, user control, DPO, privacy counsel on retainer

**Accommodation Decision Liability** — Medium probability, High impact
Mitigation: App provides workflow and guidance only, never makes accommodation decisions. Clear disclaimers that legal counsel should be consulted. Audit trails protect both strata and owners.

**Emergency Feature Reliance** — Low probability, Catastrophic impact
Mitigation: Emergency readiness features clearly disclaimed as supplementary. No claims of rescue time reduction. No safety guarantees. Professional liability insurance. Feature positioned as risk documentation, not life-safety.

### 14.3 Business Risks

**Low Adoption** — Medium probability, High impact
Mitigation: Freemium model, Pass10x cross-sell pipeline, building manager partnerships, viral community features, aggressive initial marketing

**Building Manager Resistance** — Medium probability, High impact
Mitigation: Free trials, white-glove onboarding, ROI demonstration (insurance premium reduction, CRT defense), Pass10x relationship leverage, SPCA endorsements

**Competition** — Medium probability, High impact
Mitigation: First-mover in building governance, Canadian strata focus, Pass10x integration moat, accommodation workflow IP

**Revenue Shortfall** — Medium probability, High impact
Mitigation: Diversified streams, conservative projections, B2B focus (higher ARPU, lower churn), 18-month runway minimum

### 14.4 Operational Risks

**Key Person Departure** — Low-Medium probability, Medium impact
Mitigation: Competitive compensation, documentation, cross-training, succession planning

**Server Disaster** — Low probability, High impact
Mitigation: Multi-region AWS, daily automated backups (30-day retention), DR plan (RTO: 4hr, RPO: 1hr), regular DR drills

### 14.5 Reputational Risks

**Community Toxicity** — Medium probability, Medium impact
Mitigation: Community guidelines, proactive moderation, AI-assisted filtering, report/block, consequences

**Pet Harm Attributed to App** — Very Low probability, Catastrophic impact
Mitigation: 99.9% uptime SLA, clear disclaimer (supplementary tool), no safety guarantees, professional liability insurance

---

## 15. Pass10x Integration Strategy

### 15.1 Cross-Sell Opportunity

Pass10x (visitor parking management) is already deployed in multi-unit buildings across BC. This creates a direct distribution channel for Pet10x:

- **Existing Relationships:** Property managers already use and trust Park10x products
- **Combined Value Proposition:** "Manage visitors AND pets from one provider"
- **Bundled Pricing:** Discount for buildings using both products
- **Shared Infrastructure:** Single building profile, shared user authentication

### 15.2 Integration Features (Phase 2)

- **Visitor Pet Management:** When a visitor registers through Pass10x, they can flag if they're bringing a pet. Building rules automatically displayed.
- **Short-Term Rental Pets:** Airbnb/short-term guests can register temporary pets through Pass10x integration.
- **Temporary Pet Approvals:** Building managers can issue time-limited pet approvals for visitors through combined dashboard.
- **Incident Cross-Reference:** Visitor-related pet incidents linked to Pass10x visitor records for complete documentation.

### 15.3 Revenue Impact

- Target: 30% of Pass10x buildings adopt Pet10x within 12 months
- Estimated additional 100+ buildings from cross-sell by Year 2
- Reduced CAC for cross-sold buildings (estimated 60% lower than cold acquisition)

---

## Appendices

### Appendix A: Glossary

- **Strata Corporation:** BC term for condominium corporation/HOA
- **Bylaw:** Rules governing the strata property
- **Common Property:** Shared areas of a strata building
- **Service Animal:** Trained animal that performs tasks for person with disability
- **Grandfathering:** Legal protection for existing pets when new restrictions enacted
- **CRT:** Civil Resolution Tribunal — BC's online dispute resolution body
- **PIPEDA:** Personal Information Protection and Electronic Documents Act
- **BSL:** Breed-Specific Legislation
- **Progressive Enforcement:** Staged discipline from warning to fine to escalation
- **Accommodation:** Human rights obligation to adjust policies for disability

### Appendix B: References

**Legal & Regulatory:**
- Strata Property Act (British Columbia)
- Strata Property Regulation, BC Reg. 43/2000
- Guide Dog and Service Dog Act (BC)
- Human Rights Code (BC)
- PIPEDA (Federal)
- Municipal bylaws (Vancouver, Toronto, Calgary, etc.)
- CRT decisions on strata pet disputes

**Apple Documentation:**
- Human Interface Guidelines: https://developer.apple.com/design/human-interface-guidelines/
- App Store Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- StoreKit 2 Documentation
- Core Location Best Practices
- Privacy Guidelines

**Design System Documents:**
- Pet10x_Color_System.md — Complete specifications, accessibility, implementation code
- Pet10x_Color_Reference_Card.md — Visual reference with swatches and examples

### Appendix C: Technical Dependencies

**iOS Frameworks:** SwiftUI, UIKit, Core Data, CloudKit, Core Location, MapKit, EventKit, StoreKit 2, UserNotifications, Vision, AVFoundation, Photos

**Third-Party Libraries:** Firebase (auth, analytics), Stripe SDK, Sentry, Kingfisher, Alamofire (if needed)

**Backend Services:** AWS EC2, RDS (PostgreSQL), S3, CloudFront, Lambda, SNS, Redis

### Appendix D: User Stories Backlog (Beyond MVP)

**High Priority:**
1. Medication reminders for pet owners
2. Emergency broadcasts to all pet owners during building emergencies
3. Service provider promotional offers
4. Building-level pet map with species color coding

**Medium Priority:**
5. Dog walk and exercise tracking
6. Non-pet-owner community feed filtering
7. Consolidated reports across multiple buildings
8. Vet clinic appointment reminders through app

**Low Priority:**
9. Memorial pages for deceased pets
10. Walking buddy matching by temperament and schedule
11. AI-powered pattern detection for potential issues
12. Pet birthday celebrations in community

---

## Document Control

**Version History:**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | Nov 19, 2025 | Product Team | Initial PRD |
| 2.0 | Feb 21, 2026 | Amaan (AI Product Design Manager) | Complete repositioning from compliance to governance/risk platform. Corrected legal foundation based on Strata Property Act analysis. Downgraded emergency features to Phase 2 supplementary. Added accommodation workflow as MVP. Added risk scoring and insurance integration. Added Pass10x integration strategy. Updated disclaimers and positioning. |

---

**Next Steps:**
1. Legal counsel review of PRD positioning and disclaimers
2. Pass10x integration technical feasibility assessment
3. Insurance broker partnership development
4. Strata management company pilot recruitment (3-5 buildings)
5. Begin Phase 1 development
6. UI/UX design process using color system and HIG specifications

---

*This document is confidential and proprietary to Pet10x / Park10x Services Inc. Do not distribute without authorization.*

**Contact:** product@pet10x.ca
