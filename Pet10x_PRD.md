# Product Requirements Document (PRD)
## Pet10x - Intelligent Pet Registry & Community Management Platform

**Version:** 1.0  
**Date:** November 19, 2025  
**Product Owner:** [To be assigned]  
**Target Platform:** iOS (iPhone & iPad)  
**Initial Launch Market:** Canada (British Columbia focus)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Product Vision & Objectives](#2-product-vision--objectives)
3. [Market Analysis](#3-market-analysis)
4. [User Personas](#4-user-personas)
5. [Core Features & Requirements](#5-core-features--requirements)
6. [Apple HIG Compliance & Design Principles](#6-apple-hig-compliance--design-principles)
7. [Technical Architecture](#7-technical-architecture)
8. [Revenue Model](#8-revenue-model)
9. [Canadian Strata Bylaw Compliance](#9-canadian-strata-bylaw-compliance)
10. [App Store Review Guidelines Compliance](#10-app-store-review-guidelines-compliance)
11. [Success Metrics & KPIs](#11-success-metrics--kpis)
12. [Development Roadmap](#12-development-roadmap)
13. [Risk Analysis & Mitigation](#13-risk-analysis--mitigation)

---

## 1. Executive Summary

Pet10x is a comprehensive iOS application designed to revolutionize pet management in multi-unit residential buildings (condos, apartments, strata corporations) across Canada. The app serves as a digital pet registry, community platform, and emergency response tool that bridges pet owners, building management, first responders, municipal authorities, pet insurance providers, and service providers.

**Key Value Propositions:**
- **For Pet Owners:** Centralized pet information, community engagement, service discovery, insurance management
- **For Building Management:** Ultra-affordable compliance tracking ($1/pet/year), reduced liability, streamlined enforcement
- **For First Responders:** Critical pet location data during emergencies, instant building access via QR codes
- **For Municipal Authorities:** Digital licensing integration, increased compliance, reduced administrative burden
- **For Pet Insurance Providers:** Direct access to engaged pet owner market, streamlined policy management, digital claims
- **For Service Providers:** Targeted marketing channel to qualified pet owners
- **For SPCA/Rescues:** Free adoption listings, community engagement, responsible ownership promotion

**Revenue Projection (Year 1):** $1.85M CAD  
**Target User Base (Year 1):** 30,000 active pet owners, 1,500 buildings (750,000 registered pets)

---

## 2. Product Vision & Objectives

### 2.1 Vision Statement
"To create the safest, most connected pet-friendly residential communities through intelligent technology, empowering pet owners while protecting community interests and enhancing emergency response capabilities."

### 2.2 Primary Objectives

1. **Safety First:** Enable first responders to locate and rescue pets during emergencies
2. **Community Harmony:** Reduce pet-related conflicts through transparency and accountability
3. **Regulatory Compliance:** Automate strata bylaw, municipal licensing, and insurance requirements
4. **Ecosystem Building:** Create a thriving marketplace connecting all pet care stakeholders
5. **Data-Driven Management:** Provide actionable insights for buildings, municipalities, and associations
6. **Affordable Access:** Ultra-low pricing ($1/pet/year) to drive mass adoption

### 2.3 Success Criteria

- 50% adoption rate in targeted buildings within 12 months
- 90% user satisfaction rating
- 60% reduction in pet-related complaints for participating buildings
- $70 average revenue per building annually (ARPU)
- Partnership with 25+ municipal fire departments for QR code integration
- 10+ pet insurance provider partnerships
- 50+ strata association partnerships

---

## 3. Market Analysis

### 3.1 Market Opportunity

**Canadian Pet Ownership Statistics:**
- 60% of Canadian households own pets (Canadian Animal Health Institute, 2024)
- 41% own dogs, 38% own cats
- Pet industry worth $10.2B CAD annually in Canada
- 8.5M dogs and 8.3M cats registered across Canada

**Condominium Market (Primary Target):**
- 2.1M condominium units in Canada
- 68% in Ontario, British Columbia, Alberta
- British Columbia: ~450,000 strata units
- Average 35-45% pet ownership in multi-unit buildings

### 3.2 Competitive Landscape

**Direct Competitors:**
- PetDesk: Vet-focused, lacks building management integration
- Pawprint: Pet health records, no community features
- Nextdoor: General community, not pet-specific

**Competitive Advantages:**
1. **First-mover** in building-integrated pet registry
2. **Emergency response integration** (unique differentiator)
3. **Strata compliance automation** (addresses pain point)
4. **Hyperlocal focus** (building-level community)
5. **Multi-stakeholder platform** (owners, managers, services, responders)

### 3.3 Target Markets (Priority Order)

**Phase 1 (Year 1):**
1. British Columbia (Vancouver, Victoria, Burnaby)
2. Ontario (Toronto, Ottawa, Mississauga)

**Phase 2 (Year 2):**
3. Alberta (Calgary, Edmonton)
4. Quebec (Montreal, Quebec City)

---

## 4. User Personas

### 4.1 Primary Persona: Sarah - The Responsible Pet Owner

**Demographics:**
- Age: 32
- Occupation: Marketing Manager
- Lives in: 25-story condo, Vancouver
- Pets: 1 dog (Golden Retriever, "Max")

**Goals:**
- Ensure Max's safety in emergencies
- Find reliable pet services nearby
- Connect with other dog owners for playdates
- Comply with building pet rules

**Pain Points:**
- Confusion about building pet policies
- Difficulty finding pet sitters when traveling
- Concerns about Max's safety during fire
- Limited dog-friendly spaces in building

**Technology Profile:** iPhone 15 Pro, uses 15+ apps daily, comfortable with cloud services

---

### 4.2 Secondary Persona: Michael - Building Property Manager

**Demographics:**
- Age: 45
- Role: Strata Property Manager
- Manages: 3 buildings, 850 units total
- Experience: 12 years in property management

**Goals:**
- Enforce pet bylaws fairly and consistently
- Reduce pet-related complaints
- Maintain accurate pet records for insurance
- Provide fire department with pet location data

**Pain Points:**
- Outdated spreadsheet-based pet tracking
- Inconsistent license renewal enforcement
- Responding to nuisance complaints
- Emergency preparedness concerns

**Technology Profile:** iPad for work, prefers simple, reliable tools

---

### 4.3 Tertiary Persona: Captain Rodriguez - Fire Department First Responder

**Demographics:**
- Age: 38
- Role: Fire Captain, Vancouver Fire & Rescue
- Experience: 15 years

**Goals:**
- Quick access to building layouts and pet locations
- Reduce time spent searching for pets during evacuations
- Improve rescue success rates

**Pain Points:**
- No centralized pet location data
- Time wasted in dangerous conditions searching
- Emotional toll of failed pet rescues

**Technology Profile:** Department-issued smartphone, values simplicity and reliability

---

### 4.4 Quaternary Persona: Jennifer - Mobile Pet Groomer

**Demographics:**
- Age: 29
- Occupation: Mobile pet grooming business owner
- Service Area: Greater Vancouver
- Experience: 3 years

**Goals:**
- Acquire new clients efficiently
- Build recurring service relationships
- Reduce marketing costs
- Showcase work to targeted audience

**Pain Points:**
- High cost of Google/Facebook ads
- Difficulty reaching pet owners in multi-unit buildings
- Building access challenges

**Technology Profile:** iPhone for business, active on Instagram, uses Square for payments

---

## 5. Core Features & Requirements

### 5.1 Pet Profile Management (MVP - Must Have)

**5.1.1 Pet Information Database**

**User Stories:**
- As a pet owner, I want to create a comprehensive profile for my pet so that all important information is centralized
- As a building manager, I want to view all registered pets in my building to maintain accurate records

**Requirements:**
- Multi-pet support per household (up to 6 pets per account)
- Photo gallery (up to 10 photos per pet)
  - Primary profile photo
  - Additional photos for identification
  - Photo upload from Camera or Photo Library
  - Support for HEIC, JPEG, PNG formats
  - Maximum 10MB per photo
  - Automatic image compression and optimization

**Basic Information Fields:**
- Pet name (required, max 50 characters)
- Species (Dog, Cat, Bird, Small Mammal, Fish, Reptile, Other)
- Breed (searchable dropdown + custom entry)
- Age / Date of Birth
- Gender (Male, Female, Unknown)
- Weight (with unit selection: lbs/kg)
- Color/Markings (description field)
- Distinguishing features

**Medical & Safety Information:**
- Spayed/Neutered status
- Microchip number (with verification field)
- Microchip registry name
- Vaccination records
  - Vaccine type
  - Date administered
  - Expiry date
  - Veterinarian name
  - Document upload (PDF support)
- Known medical conditions
- Medications (current)
- Behavioral notes
- Dietary restrictions/allergies
- Special handling instructions (for emergencies)

**Licensing & Registration:**
- Municipal license number
- License expiry date
- License renewal reminder (push notification 30 days before)
- License document photo upload
- Building permit number (if applicable)
- Insurance information (for certain breeds)

**Emergency Contacts:**
- Primary owner contact (auto-filled from account)
- Secondary owner/guardian
  - Name, phone, email
  - Relationship
- Emergency pet sitter/caregiver
- Veterinarian contact
  - Clinic name
  - Phone number
  - Address
  - After-hours contact
- Backup vet (optional)

**Apple HIG Compliance:**
- Use iOS standard form components (UITextField, UITextView, UIDatePicker)
- Implement Smart Form Auto-fill for contact information
- Support Dynamic Type for accessibility
- Use SF Symbols for icons (paw.fill, heart.fill, etc.)
- Follow iOS photo picker best practices
- Implement Core Data for offline-first architecture

---

**5.1.2 Location & Residence Information**

**Requirements:**
- Building/Property name (from managed list)
- Unit/Suite number
- Floor number
- Building access instructions (for emergency responders)
- Parking spot number (if pet uses)
- Storage locker number (if pet supplies stored)
- GPS coordinates (auto-captured, used for emergency mapping)

**Apple HIG Compliance:**
- Use MKMapView for location display
- Implement Core Location with user permission
- Provide clear privacy messaging per Apple guidelines
- Show location access purpose in Info.plist

---

### 5.2 Building Pet Rules & Compliance (MVP - Must Have)

**5.2.1 Digital Bylaw Repository**

**User Stories:**
- As a building manager, I want to publish our pet bylaws so that all residents have easy access
- As a pet owner, I want to understand my building's pet rules to ensure compliance

**Requirements:**
- Building-specific rule sets
  - Number of pets allowed (by type)
  - Weight restrictions (if applicable)
  - Breed restrictions (with legal compliance notes)
  - Designated pet areas
  - Leash requirements
  - Quiet hours
  - Common area usage rules
  - Elevator etiquette
- Rule acceptance tracking
  - Digital signature/acknowledgment
  - Date of acceptance
  - Version tracking for bylaw changes
- Notification when bylaws are updated
- Searchable rule database
- FAQ section per building

**Strata Compliance:**
- Template aligned with BC Standard Bylaw 3(4)
- Support for grandfathering existing pets (Section 123 exemption)
- Service animal exemption handling
- Human Rights Code accommodation tracking

---

**5.2.2 Compliance Dashboard**

**Requirements (Building Manager View):**
- Pet registration completion rate
- License expiration tracking
- Vaccination compliance
- Bylaw violation history
- Outstanding fines
- Compliance trends over time
- Export reports (PDF, CSV)

**Requirements (Pet Owner View):**
- Personal compliance score
- Outstanding items (color-coded: red/yellow/green)
- Quick renewal actions
- Compliance badges/achievements

---

### 5.3 Community Features (MVP - Must Have)

**5.3.1 Lost & Found Bulletin Board**

**User Stories:**
- As a pet owner, I want to quickly post a lost pet alert so that my community can help find my pet
- As a resident, I want to report a found pet so that it can be reunited with its owner

**Requirements:**
- Lost pet posting
  - Auto-populate from pet profile
  - Last seen location (map integration)
  - Date/time last seen
  - Reward amount (optional)
  - Contact preferences
  - Share to social media
- Found pet reporting
  - Photo upload
  - Found location
  - Animal description
  - Temporary care information
- Search and filter
  - By species, color, location
  - Date range
  - Status (active, resolved)
- Status updates
  - "Still looking"
  - "Possible sighting"
  - "Found - safe"
- Proximity alerts (push notifications within 5km)
- Success stories archive

**Apple HIG Compliance:**
- Use iOS 18 Live Activities for active lost pet alerts
- Implement Dynamic Island updates for iPhone 14 Pro+
- Use UNUserNotificationCenter for alerts
- Follow privacy guidelines for location sharing

---

**5.3.2 Social Feed (Building-Specific)**

**Requirements:**
- Text posts (280 character limit for MVP)
- Photo/video sharing (up to 4 images per post)
- Pet tagging
- Reactions (like, helpful, celebrate)
- Comments (threaded, max 3 levels)
- Share functionality
- Content moderation
  - Report inappropriate content
  - Auto-flagging of certain keywords
  - Manager review queue
- Post categories
  - General
  - Question
  - Recommendation
  - Warning/Alert
  - Success Story

---

**5.3.3 Events & Activities**

**Requirements:**
- Event creation (building residents + managers)
- Event types
  - Dog walk/playdate
  - Pet training session
  - Vaccination clinic
  - Building pet meeting
  - Adoption event
- Event details
  - Title, description
  - Date/time
  - Location (on-site or external)
  - Maximum attendees
  - Cost (free or paid)
- RSVP management
- Waitlist functionality
- Calendar integration (Add to Apple Calendar)
- Event reminders (push notifications)
- Photo sharing post-event
- Recurring event support

**Apple HIG Compliance:**
- Use EventKit for calendar integration
- Implement standard iOS calendar UI patterns
- Support Apple Calendar sharing protocols

---

### 5.4 Nuisance Reporting & Resolution (MVP - Must Have)

**5.4.1 Incident Reporting System**

**User Stories:**
- As a resident, I want to report a pet-related issue so that it can be addressed by management
- As a building manager, I want to track and resolve pet complaints fairly and consistently

**Requirements:**
- Incident categories
  - Excessive barking/noise
  - Aggressive behavior
  - Off-leash in prohibited areas
  - Waste not cleaned
  - Prohibited area access
  - Other
- Report submission
  - Select offending pet (if known) or description
  - Date/time of incident
  - Location in building
  - Detailed description (required)
  - Photo/video evidence (up to 3 files)
  - Witness information (optional)
  - Anonymous reporting option
- Severity level (system-determined based on category)
- Report tracking
  - Status updates
  - Manager response/notes
  - Resolution timeline
  - Resolution outcome
- Appeal process (for pet owners)
- Dispute resolution workflow

**Manager Tools:**
- Incident dashboard
- Priority queue
- Response templates
- Warning letter generator
- Fine tracking and invoicing
- Pattern detection (repeat offenders)
- Reporting analytics

**Privacy & Fairness:**
- Anonymization of reporters (except to managers)
- Clear evidence requirements
- Right to respond for accused pet owners
- Timestamp and location verification
- Balanced presentation of both sides

**Apple HIG Compliance:**
- Use iOS photo/video picker
- Implement secure document storage
- Support Dark Mode for all reporting screens
- Use standard iOS alert/action sheet patterns

---

### 5.5 Pet Status & Location Tracking (MVP - Must Have)

**5.5.1 Real-Time Status Updates**

**User Stories:**
- As a first responder, I want to know which units have pets present during an emergency
- As a building manager, I want to understand pet presence patterns for facility planning

**Requirements:**
- Status types
  - Home (default)
  - Away - Out of Building
  - Away - On Vacation
  - At Veterinarian
  - At Daycare/Kennel
  - Other
- Status update methods
  - Manual toggle (quick access)
  - Scheduled status changes
  - Geofencing automation (optional, with permission)
  - Integration with calendar
- Status visibility levels
  - Private (emergency responders only)
  - Building management
  - Community (for social features)
- Status history (for managers)
- Batch status update (multiple pets)

**Geofencing Implementation:**
- Building boundary definition
- Automatic "Away" detection when leaving
- Automatic "Home" detection when returning
- Battery-efficient implementation
- User control and privacy settings

**Apple HIG Compliance:**
- Use Core Location's region monitoring
- Implement significant location change API for battery efficiency
- Request "Always Allow" location permission with clear justification
- Provide granular privacy controls
- Use WidgetKit for home screen status widget

---

### 5.6 First Responder Integration (MVP - Must Have)

**5.6.1 QR Code Emergency Access System**

**User Stories:**
- As a first responder, I want instant access to pet location data during an emergency
- As a fire chief, I want to ensure my crews can quickly identify pet locations without compromising security

**Requirements:**
- Unique QR code per building
- QR code placement
  - Fire panel location (lobby)
  - Stairwell entrances
  - Mechanical room
  - Security office
- Weatherproof, durable QR code production
- QR code scan functionality
  - No account required for first responders
  - Instant access to building pet map
  - Works offline (cached data)
- Emergency data payload
  - Floor plan overlay
  - Unit numbers with pets
  - Number of pets per unit
  - Species indicator
  - Special handling notes
  - Current pet status (home/away)
  - Emergency contact numbers

**Security Measures:**
- Time-limited access tokens (QR scan valid for 4 hours)
- Access logging
- Encrypted data transmission
- No personal owner information in emergency view
- Optional secondary authentication for extended access

---

**5.6.2 First Responder Dashboard**

**Requirements:**
- Building search (by address, name, ID)
- Quick scan results
  - Total pets in building (by species)
  - Current occupancy estimate
  - High-risk units (aggressive/nervous animals)
- Interactive building map
  - Color-coded units (pets present/absent)
  - Pin zoom to specific floors
  - Unit detail tap-through
- Incident logging
  - Record rescue attempts
  - Document animal status
  - Note any injuries or issues
- Offline mode
  - Pre-cache high-priority buildings
  - Emergency data sync when connectivity returns
- Training mode (for department familiarization)

**Partnership Requirements:**
- MOU with municipal fire departments
- Liability waiver integration
- Training materials for responders
- Regular data sync protocols
- 911 dispatch integration (future)

**Apple HIG Compliance:**
- Use Vision framework for QR code scanning
- Implement AVFoundation camera integration
- Support Portrait and Landscape orientations
- Use SFSymbols for emergency UI elements
- Follow iOS emergency app design patterns

---

### 5.7 Service Provider Marketplace (Phase 2 - Should Have)

**5.7.1 Service Directory**

**User Stories:**
- As a pet owner, I want to find trusted service providers in my area
- As a service provider, I want to reach pet owners in multi-unit buildings

**Service Categories:**
- Veterinary clinics
- Emergency vet services
- Mobile vets
- Groomers (mobile and in-shop)
- Dog walkers
- Pet sitters/boarding
- Pet trainers
- Pet supply stores
- Pet insurance
- Pet photography
- Pet waste removal services
- Pet taxi services

**Provider Profile Requirements:**
- Business name and logo
- Service description
- Service area (map-based)
- Pricing information
- Hours of operation
- Credentials/certifications
- Insurance information
- Photos of work/facility
- Customer reviews and ratings
- Response time SLA
- Booking integration
- Special offers/promotions

**Search & Discovery:**
- Filter by category, location, rating, price
- Sort by distance, rating, price, availability
- Favorite providers
- Request quote functionality
- Direct messaging
- Book appointment (in-app)

---

**5.7.2 Reviews & Ratings System**

**Requirements:**
- 5-star rating system
- Written reviews (50-500 characters)
- Photo uploads (service results)
- Verified customer badge (confirmed transactions)
- Response from business
- Helpful voting system
- Report inappropriate reviews
- Review moderation
- Business response templates

---

### 5.8 Advanced Features (Phase 3 - Nice to Have)

**5.8.1 Pet Health & Wellness Tracking**

- Vaccination reminders
- Medication schedule with reminders
- Weight tracking
- Vet appointment reminders
- Integration with vet EMR systems
- Health trends and insights
- Prescription refill reminders

**5.8.2 Activity & Exercise Tracking**

- Walk logging (manual or GPS-tracked)
- Exercise goals
- Activity challenges (building competitions)
- Leaderboards
- Integration with Apple Health
- Weather-based walk suggestions

**5.8.3 Pet Insurance Integration**

- Compare insurance plans
- Digital insurance card
- Claim submission
- Claim tracking
- Policy renewal reminders

**5.8.4 Breed-Specific Content**

- Care guides
- Training tips
- Health information
- Behavioral insights
- Breed communities

**5.8.5 Video Monitoring Integration**

- Integration with pet cameras (Furbo, Petcube)
- Check-in reminders
- Activity alerts

---

## 6. Apple HIG Compliance & Design Principles

### 6.1 Core Design Principles (Per Apple HIG)

**Clarity:**
- Use system fonts (SF Pro, SF Pro Rounded)
- Maintain clear visual hierarchy
- Use color purposefully
- Ensure legible text at all sizes
- Support Dynamic Type

**Deference:**
- Content-first approach
- Minimize chrome and ornamentation
- Let pet photos and important info take center stage
- Use subtle animations
- Respect user's attention

**Depth:**
- Use visual layers to convey hierarchy
- Implement smooth transitions
- Use translucency where appropriate
- Create spatial relationships with shadows and blur

### 6.2 Apple's UI Design Dos and Don'ts (Official Guidelines)

**Critical Requirements from Apple Developer Design Tips:**

**Formatting Content:**
- ✅ **DO:** Create layouts that fit device screens without horizontal scrolling
- ✅ **DO:** Use negative space, background shapes, colors, or separator lines to organize information
- ✅ **DO:** Align text, images, and buttons to show relationships
- ✅ **DO:** Place important information at top of screen (visual hierarchy)
- ❌ **DON'T:** Force users to zoom or scroll horizontally for primary content
- ❌ **DON'T:** Clutter screens with excessive information

**Touch Controls:**
- ✅ **DO:** Use UI elements designed for touch gestures (switches, sliders, buttons)
- ✅ **DO:** Provide immediate visual feedback for interactions
- ✅ **DO:** Use standard controls for their intended purpose:
  - Switches for binary settings (on/off)
  - Sliders for ranges (volume, brightness)
  - Segmented controls for 2-5 fixed choices
- ❌ **DON'T:** Rely solely on custom gestures for primary navigation

**Hit Targets:**
- ✅ **DO:** **Minimum 44x44 points** for all tappable elements
- ✅ **DO:** Provide adequate spacing between interactive components (minimum 8pt)
- ❌ **DON'T:** Use smaller touch targets even if visually they look fine

**Text Legibility:**
- ✅ **DO:** **Minimum 11pt font size** for readability
- ✅ **DO:** Ensure **4.5:1 contrast ratio minimum** for normal text (3:1 for 18pt+)
- ✅ **DO:** Increase line height and letter spacing for improved legibility
- ✅ **DO:** Support Dynamic Type for accessibility
- ✅ **DO:** Use San Francisco font family (iOS system font)
- ✅ **DO:** Avoid light font weights - prefer medium, semibold, or bold
- ❌ **DON'T:** Let text overlap
- ❌ **DON'T:** Use insufficient contrast between text and background
- ❌ **DON'T:** Use same color to indicate different things

**Safe Areas:**
- ✅ **DO:** Respect safe area insets for all devices
- ✅ **DO:** Account for notch, Dynamic Island, home indicator
- ✅ **DO:** Adjust layouts dynamically based on device and orientation

**Visual Hierarchy:**
- ✅ **DO:** Use size, weight, and color to indicate importance
- ✅ **DO:** Make primary actions prominent (e.g., blue filled buttons)
- ✅ **DO:** Use color consistently (blue = primary action, red = destructive)
- ✅ **DO:** Show where hidden information exists (disclosure indicators)
- ❌ **DON'T:** Make all elements equal visual weight

---

### 6.3 iOS-Specific Guidelines

**6.3.1 Navigation**

**Tab Bar Navigation (Primary):**
- Maximum 5 tabs
- Proposed tabs:
  1. Home (SF Symbol: house.fill)
  2. Community (SF Symbol: person.3.fill)
  3. Services (SF Symbol: bag.fill)
  4. Alerts (SF Symbol: bell.fill)
  5. Profile (SF Symbol: person.crop.circle.fill)

**Navigation Bar:**
- Large title style for primary screens
- Inline titles for detail screens
- Context-appropriate buttons (Edit, Add, Save, etc.)
- Back button with parent screen title

**Modal Presentations:**
- Use for focused tasks (create post, report incident)
- Provide clear dismiss options
- Sheet presentation style for contextual actions

---

**6.3.2 Layout & Spacing**

**Margins & Padding:**
- Standard margins: 16pt (leading/trailing)
- Section spacing: 24pt
- Element spacing: 8pt (small), 12pt (medium), 16pt (large)
- Card-based layouts with rounded corners (12pt radius)

**Safe Areas:**
- Respect all safe area insets
- Support iPhone notch/Dynamic Island
- Adapt for iPad multitasking
- Consider landscape orientations

**Grid System:**
- 8pt base grid
- Responsive breakpoints for iPad
- Consistent alignment

---

**6.3.3 Typography**

**System Font Usage:**
- Large Title: SF Pro 34pt (pet names, screen titles)
- Title 1: SF Pro 28pt (section headers)
- Title 2: SF Pro 22pt (subsection headers)
- Headline: SF Pro 17pt semibold (emphasized content)
- Body: SF Pro 17pt (standard content)
- Callout: SF Pro 16pt (secondary content)
- Footnote: SF Pro 13pt (metadata, timestamps)
- Caption: SF Pro 12pt (tertiary info)

**Critical Typography Guidelines:**
- **Minimum readable size: 11pt** (per Apple guidelines)
- **Avoid light font weights** - use medium (SF Pro Medium), semibold, or bold
- SF Pro is optimized for digital screens and should be default choice

**Dynamic Type Support:**
- Test all text at accessibility sizes
- Avoid truncation
- Use scalable layouts
- Support up to XXXL sizes

**Text Styling:**
- Use SF Symbols in line with text
- Maintain proper line spacing (1.2x minimum)
- Left-align text (RTL support for future)
- Avoid all-caps (except for emphasis)

---

**6.3.4 Color System**

**Complete Color Palette:**
Pet10x uses a comprehensive color system designed for accessibility, brand consistency, and Apple HIG compliance. See the complete **Pet10x Color System** documentation for full specifications.

**Primary Brand Colors:**
- Primary Orange: `#FD9340` (RGB: 253, 147, 64) - Main brand color, CTAs, buttons
- Primary Light: `#FFAB66` - Hover states, light backgrounds
- Primary Dark: `#E67E28` - Pressed states, text links (better contrast)
- Primary Subtle: `#FFF4EB` - Subtle backgrounds, cards

**Secondary Brand Colors:**
- Secondary Teal: `#2FBFB8` (RGB: 47, 191, 184) - Health/wellness features, secondary actions
- Secondary Light: `#5FD4CF` - Hover states
- Secondary Dark: `#1F9A95` - Pressed states
- Secondary Subtle: `#E8F8F7` - Light backgrounds for health sections

**Text Colors (Light Mode):**
- Primary: `#1F1F1F` (contrast: 18.2:1 ✅) - Headlines, body text
- Secondary: `#484444` (contrast: 9.75:1 ✅) - Supporting text, labels
- Tertiary: `#787878` (contrast: 4.54:1 ✅) - Timestamps, metadata
- Link: `#E67E28` (contrast: 4.14:1 ✅) - Interactive text, links

**Text Colors (Dark Mode):**
- Primary: `#F5F5F5`
- Secondary: `#B8B8B8`
- Tertiary: `#8E8E8E`
- Link: `#FFAB66`

**Semantic Colors:**
- Success: `#34C759` - Confirmations, healthy status, compliance
- Warning: `#FFCC00` - Expiring items, cautions, attention needed
- Error: `#FF3B30` - Errors, destructive actions, emergency alerts
- Info: `#007AFF` - Informational messages, tips, neutral notifications

**Background Colors (Light/Dark):**
- Base: `#FFFFFF` / `#000000`
- Secondary: `#F8F8F8` / `#1C1C1E`
- Tertiary: `#F0F0F0` / `#2C2C2E`
- Elevated: `#FFFFFF` / `#1C1C1E` (with shadow)

**Pet Type Colors:**
- Dog: `#A0522D` (Warm Brown)
- Cat: `#9B59B6` (Soft Purple)
- Bird: `#3498DB` (Sky Blue)
- Fish: `#1ABC9C` (Ocean Blue)
- Small Mammal: `#7CB342` (Earthy Green)
- Reptile: `#6B8E23` (Olive Green)

**Status Colors:**
- Home: `#34C759` (Green)
- Away: `#8E8E93` (Gray)
- At Vet: `#007AFF` (Blue)
- Emergency: `#FF3B30` (Red)
- On Vacation: `#FD9340` (Orange)

**Accessibility Requirements:**
- All text combinations meet WCAG 2.1 AA standards (4.5:1 for normal text, 3:1 for large text)
- Primary Orange (`#FD9340`) should only be used for large text (18pt+) on white backgrounds
- Use Primary Dark (`#E67E28`) for better contrast on small text
- All colors tested and approved for colorblind users
- Full dark mode support with adjusted luminance

**Implementation:**
```swift
// See Pet10x Color System documentation for complete SwiftUI implementation
extension Color {
    static let pet10xPrimary = Color(hex: "FD9340")
    static let pet10xPrimaryDark = Color(hex: "E67E28")
    static let pet10xSecondary = Color(hex: "2FBFB8")
    // ... (see full implementation in Color System doc)
}
```

**Reference Documents:**
- **Pet10x_Color_System.md** - Complete specifications, usage guidelines, accessibility
- **Pet10x_Color_Reference_Card.md** - Visual reference with swatches and examples

**Dark Mode Support:**
- All screens must support Dark Mode
- Use semantic color names
- Test contrast ratios (WCAG AA minimum)
- Avoid pure white/black
- Provide custom assets when needed

---

**6.3.5 Iconography**

**SF Symbols Usage:**
- Prefer SF Symbols over custom icons
- Use consistent weight (Medium for body, Semibold for emphasis)
- Maintain optical alignment
- Support multicolor and hierarchical rendering

**Pet-Specific Icons:**
- Dog: dog.fill
- Cat: cat.fill
- Bird: bird.fill
- Fish: fish.fill
- Emergency: alarm.fill
- Medical: cross.case.fill
- Location: mappin.and.ellipse
- Calendar: calendar
- Community: person.3.fill

**Custom Icons (when needed):**
- Vector format (SVG)
- Export at 1x, 2x, 3x
- Use 44x44pt minimum touch target
- Maintain visual consistency with SF Symbols

---

**6.3.6 Components**

**Lists:**
- Use UITableView for structured data
- **Critical:** "90% of mobile design is list design" - Apple emphasis
- **Three key decisions for every list:**
  1. **Text display:** Primary only, primary + secondary, or custom layout
  2. **Left side:** Icon, image, or nothing
  3. **Right side:** Chevron (navigation), detail button, checkmark, or custom
- **List styles:**
  - Inset grouped (default for most content)
  - Grouped (settings-style)
  - Plain (full-width rows)
- Implement swipe actions (delete, edit, share)
- Use disclosure indicators (chevron) for navigation
- Support pull-to-refresh
- Implement search bar when applicable
- **Text hierarchy in lists:**
  - Primary: 17pt regular (main content)
  - Secondary: 15pt or 12pt regular (supporting info)
  - Use lighter text color for hierarchy, not just size

**Forms:**
- Group related fields
- Use appropriate input types (email, phone, number)
- Provide inline validation
- Show clear error states
- Use picker wheels for selection
- Implement date pickers in-line or modal

**Cards:**
- Rounded corners (12pt)
- Subtle shadow for elevation
- Padding: 16pt
- Image aspect ratio: 16:9 or 4:3
- Support long-press for quick actions

**Buttons:**
- Primary: Filled button (blue background, white text)
- Secondary: Outlined button (blue border, blue text)
- Tertiary: Text button (blue text)
- Destructive: Red filled or text
- Minimum height: 44pt
- Corner radius: 8pt
- Use SF Symbols for icons

---

**6.3.7 Animations & Transitions**

**Motion Principles:**
- Duration: 0.2-0.4s for most transitions
- Easing: ease-in-out curves
- Purpose: clarify relationships, maintain context
- Respect "Reduce Motion" accessibility setting

**Transition Types:**
- Push/pop for hierarchical navigation
- Modal presentation for focused tasks
- Cross-dissolve for state changes
- Custom transitions for spatial relationships

---

**6.3.8 Gestures**

**Standard Gestures:**
- Tap: Primary actions
- Long press: Contextual menus
- Swipe: Navigation, list actions
- Pinch: Zoom (maps, images)
- Pan: Scrolling, dragging
- Edge swipe: Back navigation

**Context Menus (iOS 13+):**
- Implement on pet profiles, posts, services
- Include preview
- Provide 3-6 relevant actions
- Use SF Symbols for clarity

---

### 6.4 iPad-Specific Considerations

**Split View Support:**
- Maintain functionality at all sizes
- Use adaptive layouts
- Support drag and drop
- Optimize for landscape

**Pointer Support:**
- Implement hover effects
- Use standard pointer shapes
- Respect pointer interaction preferences

**Multitasking:**
- Support Slide Over and Split View
- Maintain state during size changes
- Test at all supported sizes

---

### 6.5 Accessibility (WCAG 2.1 AA Minimum)

**VoiceOver:**
- Meaningful labels for all interactive elements
- Group related elements logically
- Provide hints for complex interactions
- Support custom actions

**Dynamic Type:**
- All text must scale
- Layouts must adapt to larger text
- Test at all accessibility sizes
- Avoid fixed height containers

**Color & Contrast:**
- Minimum 4.5:1 for normal text
- Minimum 3:1 for large text (18pt+)
- Don't rely on color alone for meaning
- Support high contrast mode

**Motor Accessibility:**
- 44x44pt minimum touch targets
- Adequate spacing between interactive elements
- Support Switch Control
- Support AssistiveTouch

**Hearing Accessibility:**
- Captions for all video content
- Visual alternatives for audio alerts
- Support mono audio

**Cognitive Accessibility:**
- Clear, simple language
- Consistent navigation
- Reduce complexity where possible
- Provide clear error messages

---

### 6.6 Apple Design Resources & Tools

**Official Design Templates:**
Apple provides comprehensive design templates to ensure consistency with platform guidelines:

**Figma Resources:**
- iOS 17 UI Kit (download from Apple Developer)
- SF Symbols app for icon exploration
- App icon templates (1024x1024 with grid)
- Widget templates (small, medium, large)
- Sign in with Apple button assets

**Sketch Resources:**
- iOS design templates
- watchOS templates
- macOS templates
- Production templates for App Store assets

**Required Downloads:**
1. **SF Symbols App** - Browse and export system icons
2. **Apple Design Resources** - Comprehensive UI kits
3. **Xcode** - For testing designs on simulator
4. **SF Pro Font Family** - System font for mockups

**Design Specifications Resources:**
- iPhone screen sizes and safe areas reference
- Typography scale specifications  
- Color palette specifications
- Spacing and layout grid systems
- Component specifications (buttons, forms, lists)

**Recommended Process:**
1. Start with Apple's official templates
2. Customize for Pet10x brand (colors, specific components)
3. Test with Dynamic Type at all sizes
4. Validate in both Light and Dark modes
5. Test on actual devices (not just simulator)

**Key Takeaways for Pet10x Design:**
- **44x44pt minimum** for all interactive elements
- **11pt minimum** text size, prefer 12pt+ for body text
- **Avoid light font weights** - use SF Pro Medium, Semibold, or Bold
- **4.5:1 contrast minimum** for text readability
- **Use standard controls** (switches, sliders, segmented controls)
- **Respect safe areas** for all device types
- **Lists are fundamental** - master table view design patterns
- **Color consistency** - don't use same color for different meanings
- **Support Dynamic Type** and accessibility features
- **Test in both Dark and Light modes**

**Reference Links:**
- Apple Design Tips: https://developer.apple.com/design/tips/
- Human Interface Guidelines: https://developer.apple.com/design/human-interface-guidelines/
- Design Resources: https://developer.apple.com/design/resources/
- SF Symbols: https://developer.apple.com/sf-symbols/

---

## 7. Technical Architecture

### 7.1 Technology Stack

**Frontend:**
- Swift 5.9+
- SwiftUI (primary) + UIKit (where needed)
- Combine framework for reactive programming
- Core Data for local persistence
- CloudKit for iCloud sync

**Backend:**
- Node.js with Express
- PostgreSQL database
- Redis for caching
- AWS S3 for media storage
- AWS Lambda for serverless functions
- AWS API Gateway

**APIs & Services:**
- MapKit / Apple Maps
- Core Location
- CloudKit
- StoreKit 2 (in-app purchases)
- Push Notification Service
- Vision framework (QR scanning)
- EventKit (calendar integration)
- HealthKit (future integration)

**Authentication:**
- Sign in with Apple (required)
- Email/password (optional)
- Biometric authentication (Face ID / Touch ID)

**Analytics:**
- Apple App Analytics (privacy-focused)
- Custom analytics service (GDPR compliant)

**Crash Reporting:**
- Apple Crash Reports
- Sentry (supplemental)

---

### 7.2 Data Architecture

**User Data Model:**
```
User
├── Profile
│   ├── Name
│   ├── Email
│   ├── Phone
│   ├── Photo
│   ├── UserType (Owner, Manager, Responder, Service)
│   └── Preferences
├── Residence
│   ├── BuildingID (foreign key)
│   ├── UnitNumber
│   ├── FloorNumber
│   ├── MoveInDate
│   └── AccessNotes
└── Subscription
    ├── Plan
    ├── Status
    ├── StartDate
    └── ExpiryDate
```

**Pet Data Model:**
```
Pet
├── BasicInfo
│   ├── Name
│   ├── Species
│   ├── Breed
│   ├── DateOfBirth
│   ├── Gender
│   ├── Weight
│   └── Photos[]
├── Medical
│   ├── MicrochipNumber
│   ├── Vaccinations[]
│   ├── Medications[]
│   ├── Conditions[]
│   └── VetInfo
├── Licensing
│   ├── MunicipalLicense
│   ├── LicenseExpiry
│   └── BuildingPermit
├── EmergencyContacts[]
├── Status
│   ├── CurrentStatus
│   ├── LastUpdated
│   └── ScheduledChanges[]
└── BehaviorNotes
```

**Building Data Model:**
```
Building
├── Info
│   ├── Name
│   ├── Address
│   ├── TotalUnits
│   ├── Floors
│   └── PropertyManager
├── PetRules
│   ├── AllowedAnimals[]
│   ├── Restrictions
│   ├── DesignatedAreas
│   └── ByLawDocument
├── Amenities
│   ├── DogPark
│   ├── WashStation
│   └── OtherAmenities[]
├── EmergencyInfo
│   ├── QRCodeID
│   ├── FloorPlans[]
│   ├── EmergencyAccess
│   └── DepartmentContact
└── Residents[]
```

---

### 7.3 Security & Privacy

**Data Protection:**
- End-to-end encryption for sensitive data
- Encryption at rest (AES-256)
- Encryption in transit (TLS 1.3)
- Keychain storage for credentials
- Biometric authentication for sensitive actions

**Privacy Principles:**
- Minimize data collection
- Clear purpose for each data point
- User control over data sharing
- Transparent privacy policy
- Right to deletion (GDPR/PIPEDA compliant)
- Data portability

**App Store Privacy Nutrition Labels:**
- **Data Collected:**
  - Contact info (email, phone, name)
  - Location (precise, for geofencing)
  - Photos (pet images)
  - User-generated content (posts, reviews)
- **Data Linked to User:** All of the above
- **Data Not Collected:** 
  - Financial info (handled by Apple IAP)
  - Browsing history
  - Search history

**Permissions Requested:**
- Camera (pet photos, QR scanning)
- Photo Library (pet photos)
- Location (always, for geofencing) - optional
- Notifications (alerts, reminders)
- Calendar (event integration) - optional

**Permission Timing:**
- Request at point of use
- Explain clear benefit
- Provide graceful degradation if denied
- Allow permission changes in settings

---

### 7.4 Offline Functionality

**Offline-First Design:**
- Core features available offline
- Queue actions for sync
- Clear sync status indicators
- Conflict resolution strategy

**Cached Data:**
- Pet profiles
- Building information
- Recent community posts
- Service provider listings
- Emergency responder data

---

### 7.5 Performance Requirements

**App Size:**
- Target: < 50 MB download
- Use on-demand resources for optional features
- Optimize assets (WebP for photos, compressed videos)

**Launch Time:**
- Cold launch: < 2 seconds
- Warm launch: < 0.5 seconds

**Responsiveness:**
- UI interactions: < 100ms response
- Network requests: timeout after 10s
- Image loading: progressive enhancement

**Battery Efficiency:**
- Background location monitoring: < 5% battery per day
- Push notifications only
- Optimize networking (batch requests)

**Memory Management:**
- Maximum memory footprint: 200 MB
- Image caching with size limits
- Lazy loading for lists

---

## 8. Revenue Model

### 8.1 Multi-Tier Freemium Model

**Free Tier - "Pet Basic" (Forever Free)**

**Features Included:**
- Register up to 2 pets
- Basic pet profile (name, breed, photo)
- View building pet rules
- Emergency contact information
- Lost & found bulletin board (view only)
- Community feed (read-only)
- Service directory (limited to 10 listings)
- QR code emergency access (always free)

**Target:** Casual pet owners, single-pet households, trial users  
**Conversion Goal:** 25% to paid tiers within 90 days

---

**Premium Tier - "Pet Plus" - $4.99 CAD/month or $49.99/year**

**Additional Features:**
- Unlimited pet registrations
- Advanced pet profiles (medical history, vaccinations)
- Vaccination and license reminders
- Full community access (post, comment, react)
- Create lost & found posts
- Event creation and RSVP
- Report nuisance incidents (with evidence upload)
- Real-time pet status updates
- Custom pet badges and achievements
- Remove advertising
- Premium customer support
- Access to pet wellness content
- Service provider direct messaging
- Priority listing in lost & found

**Target:** Active pet owners, multi-pet households  
**Expected Adoption:** 40% of free users

---

**Building Manager Plan - $199 CAD/month or $1,999/year per building**

**Features Included:**
- All Premium features for personal pets
- Building administration dashboard
- Unlimited resident accounts
- Pet compliance tracking
- Automated license/vaccination reminders
- Incident management system
- Report generation and analytics
- Custom building rules and bylaws
- Resident communication tools
- First responder integration and QR codes
- Emergency broadcast capability
- Export data and reports
- API access for property management software integration
- Dedicated account manager
- Priority support (4-hour response)
- White-label option (+$99/month)

**Target:** Property managers, strata councils, HOAs  
**Sales Strategy:** Direct B2B sales, partnerships with property management companies

---

**Enterprise Plan - Custom Pricing (Starting $499 CAD/month)**

**For:** Property management companies managing multiple buildings

**Features:**
- All Building Manager features
- Multi-building management (unlimited)
- Consolidated reporting across portfolio
- Custom branding
- API access with higher rate limits
- Dedicated infrastructure
- SLA guarantee (99.9% uptime)
- Custom feature development
- Onboarding and training
- Dedicated success manager

**Target:** Large property management firms (100+ buildings)

---

### 8.2 Additional Revenue Streams

**8.2.1 Service Provider Listings (SaaS Model)**

**Basic Listing - FREE**
- Profile page
- Up to 5 photos
- Business hours
- Contact information
- Service area (basic)
- Up to 10 reviews

**Featured Listing - $49 CAD/month**
- Priority in search results
- Unlimited photos
- Featured badge
- Social media links
- Special offers section
- Booking calendar integration
- Unlimited reviews
- Analytics dashboard
- Lead notifications

**Premium Listing - $99 CAD/month**
- All Featured benefits
- Homepage featured rotation
- Sponsored posts in community feed (2 per month)
- Direct messaging to pet owners
- Promotional campaigns
- Verified badge
- Premium support
- Referral tracking

**Target:** 1,000 service providers by Year 2  
**Estimated Revenue (Year 2):** $600K annually

---

**8.2.2 Booking Commission**

- 8% commission on appointments booked through app
- Automatic payment processing via Stripe
- Payout to service providers (weekly)

**Estimated GMV Year 2:** $2.5M → **Revenue: $200K**

---

**8.2.3 Sponsored Content & Advertising**

**Native Advertising:**
- Sponsored posts in community feed
  - $200 per building per month
  - Clearly marked as "Sponsored"
  - Relevant to pet owners (food, supplies, insurance)
- Banner ads in service directory
  - $500/month for featured placement

**Brand Partnerships:**
- Pet food brands
- Pet insurance companies
- Pet supply retailers
- Veterinary chains

**Ad Principles:**
- Maximum 10% of screen time
- Never in emergency features
- Relevant and useful to users
- Clear labeling
- Respect user preferences

**Estimated Revenue (Year 2):** $150K annually

---

**8.2.4 Data & Insights (B2B)**

**Anonymized Market Research:**
- Pet demographic trends
- Service utilization patterns
- Geographic insights
- Breed popularity data

**Target Customers:**
- Pet industry market research firms
- Pet food/supply manufacturers
- Veterinary associations
- Urban planners

**Privacy-First Approach:**
- Fully anonymized and aggregated
- No personal identifiable information
- Opt-in only
- Transparent data usage policy

**Estimated Revenue (Year 2):** $75K annually

---

### 8.3 Pricing Optimization Strategy

**Promotional Pricing (Launch):**
- First 1,000 users: Lifetime "Founding Member" discount (50% off Premium forever)
- Buildings onboarded in first 3 months: 3 months free on Manager Plan
- Service providers: First month free on Featured listing

**Annual Discount:**
- Premium: 17% off (effectively 2 months free)
- Building Manager: 16% off
- Service Providers: 15% off annual pre-pay

**Bundle Offers:**
- Building Manager + Premium Personal: $219/month (save $30)
- Multiple service locations: 10% off per additional location

---

### 8.4 Financial Projections

**Year 1 Revenue Forecast:**

| Revenue Source | Units | Avg Price | Total Revenue |
|----------------|-------|-----------|---------------|
| Premium Subscriptions | 5,000 users | $50/year | $250,000 |
| Building Manager Plans | 75 buildings | $2,000/year | $150,000 |
| Service Provider Listings | 200 providers | $75/month avg | $180,000 |
| Booking Commissions | - | - | $50,000 |
| Advertising | - | - | $25,000 |
| **Total Year 1 Revenue** | | | **$655,000** |

**Year 2 Revenue Forecast:**

| Revenue Source | Units | Avg Price | Total Revenue |
|----------------|-------|-----------|---------------|
| Premium Subscriptions | 15,000 users | $50/year | $750,000 |
| Building Manager Plans | 250 buildings | $2,000/year | $500,000 |
| Enterprise Plans | 5 companies | $10,000/year | $50,000 |
| Service Provider Listings | 1,000 providers | $75/month avg | $900,000 |
| Booking Commissions | - | - | $200,000 |
| Advertising | - | - | $150,000 |
| Data Insights | - | - | $75,000 |
| **Total Year 2 Revenue** | | | **$2,625,000** |

**Year 3 Revenue Forecast:**

| Revenue Source | Units | Avg Price | Total Revenue |
|----------------|-------|-----------|---------------|
| Premium Subscriptions | 35,000 users | $50/year | $1,750,000 |
| Building Manager Plans | 600 buildings | $2,000/year | $1,200,000 |
| Enterprise Plans | 15 companies | $12,000/year | $180,000 |
| Service Provider Listings | 2,500 providers | $80/month avg | $2,400,000 |
| Booking Commissions | - | - | $500,000 |
| Advertising | - | - | $300,000 |
| Data Insights | - | - | $150,000 |
| **Total Year 3 Revenue** | | | **$6,480,000** |

---

### 8.5 Unit Economics

**Customer Acquisition Cost (CAC):**
- Premium Users: $15 (app store optimization, content marketing)
- Building Managers: $400 (direct sales, demos)
- Service Providers: $75 (digital marketing)

**Lifetime Value (LTV):**
- Premium Users: $150 (avg 3-year retention)
- Building Managers: $6,000 (avg 3-year retention)
- Service Providers: $2,700 (avg 3-year retention)

**LTV:CAC Ratio:**
- Premium Users: 10:1 ✓
- Building Managers: 15:1 ✓
- Service Providers: 36:1 ✓

**Target:** Maintain LTV:CAC > 3:1 across all segments

---

## 9. Canadian Strata Bylaw Compliance

### 9.1 British Columbia Strata Property Act Alignment

**9.1.1 Standard Bylaw 3(4) Compliance**

The app's building rule system is designed around BC's Standard Bylaw 3(4), which provides the default pet restrictions:

**Standard Allowances (Built into Templates):**
- One dog OR one cat
- Reasonable number of fish or small aquarium animals
- Reasonable number of small caged mammals
- Up to two caged birds

**App Implementation:**
- Pre-configured templates matching Standard Bylaws
- Easy customization for amended bylaws
- Visual indicator showing which bylaws apply
- Historical bylaw version tracking

---

**9.1.2 Section 123 - Grandfathering Provisions**

**Legal Requirement:**
If a strata corporation passes a new pet restriction bylaw, pets already living in units at the time the bylaw was passed may continue to reside there until their passing.

**App Implementation:**
- Date stamp when bylaw is enacted
- Automatic "grandfathered" status for pre-existing pets
- Clear visual indicator on pet profiles
- Manager dashboard showing grandfathered vs. compliant pets
- Restriction on replacing grandfathered pets with non-compliant pets
- Legacy pet expiration tracking (removes status when pet passes)

**User Flow:**
1. Building manager updates pet bylaw
2. System automatically identifies all registered pets
3. Pets registered before bylaw date receive "Grandfathered Status" badge
4. Notification sent to affected owners explaining their rights
5. New pets registered after date must comply with new rules

---

**9.1.3 Leashing Requirements**

**Standard Bylaw:** "Owners, tenants, occupants and visitors must ensure that all animals are leashed or otherwise secured when on common property or on land that is a common asset."

**App Implementation:**
- Building rules section displays leashing requirements
- Nuisance reporting includes "Off-leash violation" category
- Community reminders in feed
- Educational content about leash laws
- Map showing on-leash vs. off-leash designated areas

---

### 9.2 Guide Dog and Service Dog Act Compliance

**Legal Requirements (Effective January 18, 2016):**

**The app MUST:**
1. Exempt certified guide dogs and service dogs from all pet restrictions
2. Allow certified retired service dogs to remain with handlers
3. Distinguish between service animals and emotional support animals
4. Respect that certified dogs can access all strata premises regardless of bylaws

**App Implementation:**

**Service Animal Registration:**
- Dedicated "Service Animal" category during registration
- Certification upload (BC certification from accredited school)
- Automatic exemption from building pet limits
- Special badge on profile ("Certified Service Dog")
- Cannot be subject to nuisance reports (except extreme cases)

**Manager Tools:**
- Clear distinction between service animals and pets
- Human Rights Code accommodation workflow
- Documentation storage for certification
- Audit trail for exemption decisions

**Retirement Provisions:**
- "Retired Service Animal" status option
- Retained exemption status for life
- Documentation of service years

**Important Distinctions:**
- ❌ Emotional Support Animals: NOT automatically protected
- ❌ Therapy Animals: NOT automatically exempt
- ❌ Dogs in Training: Subject to rental/strata restrictions (unless specific certification)
- ✅ Certified Guide Dogs: Full protection
- ✅ Certified Service Dogs: Full protection
- ✅ Retired Certified Dogs: Full protection

---

### 9.3 Human Rights Code Accommodation

**Legal Requirement:**
Under BC's Human Rights Code, strata corporations have a duty to accommodate people with disabilities who require therapy or companion animals, even if not certified service animals.

**App Features:**

**Accommodation Request Workflow:**
1. Owner submits request for accommodation
2. Attach medical documentation
3. Describe disability and need for animal
4. Strata council reviews (with legal guidance recommended)
5. Decision logged with reasoning
6. Appeal process if denied

**Documentation:**
- Secure storage of medical information
- Privacy protection (encrypted)
- Access restricted to authorized council members
- Audit log of all access

**Education for Managers:**
- In-app guide on human rights obligations
- When to seek legal advice
- Balancing competing rights
- Undue hardship assessment

---

### 9.4 Municipal Licensing Integration

**Requirements Across Canadian Municipalities:**

**Dog Licensing (Required in most municipalities):**
- Annual renewal
- Proof of rabies vaccination
- Fee payment
- Registration number

**Cat Licensing (Varies by municipality):**
- Required in: Calgary, Toronto (areas), Winnipeg
- Optional in: Vancouver, Victoria
- Not required in many smaller municipalities

**App Implementation:**

**Municipal Database Integration:**
- Pre-load municipal requirements by address
- Display applicable license requirements
- Link to municipal registration portals
- Expiry date tracking
- Renewal reminders (30, 14, 7 days before)

**Verification Tools for Managers:**
- Scan or enter license numbers
- Cross-check with municipal database (API integration)
- Compliance dashboard showing unlicensed pets
- Bulk reminder sending

**Supported Municipalities (Phase 1):**
- Vancouver
- Burnaby
- Richmond
- Surrey
- Victoria
- Toronto
- Ottawa
- Calgary

---

### 9.5 Breed-Specific Legislation (BSL)

**Current Canadian Context:**
- Ontario banned breed-specific bans in 2020
- Montreal's pit bull ban lifted in 2018
- Most cities moving away from BSL

**App Approach:**
- **No breed discrimination in app features**
- Inform users of their rights
- Provide BSL education
- Support owners of restricted breeds
- Advocate for evidence-based policy

**Manager Guidance:**
- BSL bylaws may be legally problematic
- Recommend behavior-based rules instead
- Insurance considerations (separate from bylaws)
- Link to legal resources

---

### 9.6 Strata Bylaw Enforcement Tools

**9.6.1 Fine System Compliance**

**Legal Limits (Strata Property Regulation):**
- Bylaw violations: Maximum fine set by strata, typically $50-$200
- Rule violations: Maximum $50, maximum frequency every 7 days

**App Implementation:**
- Fine schedule configuration per building
- Automatic fine calculation based on violation type
- Cannot exceed maximums without override (logged)
- Payment tracking
- Invoice generation
- Collection history

**Progressive Enforcement:**
1. Verbal warning (logged)
2. Written warning (auto-generated letter)
3. First fine
4. Subsequent fines (if repeating)
5. Legal action referral (outside app)

---

**9.6.2 Dispute Resolution**

**Features:**
- Owner response to nuisance reports
- Evidence submission (photos, videos, witness statements)
- Mediation request
- Civil Resolution Tribunal (CRT) export package
- Timeline documentation

---

### 9.7 Privacy Compliance (PIPEDA)

**Personal Information Protection and Electronic Documents Act (PIPEDA):**

**App Compliance:**
- Clear privacy policy (plain language)
- Consent for collection, use, disclosure
- Limit collection to necessary data
- Secure storage and transmission
- Right to access personal information
- Right to correction
- Right to deletion (with limitations for legal obligations)
- Data breach notification procedures
- Cross-border data transfer disclosure

**Special Considerations for Strata Context:**
- Strata corporations are "organizations" under PIPEDA
- Pet information may be personal information
- Nuisance reports require careful handling
- Balance transparency with privacy

---

## 10. App Store Review Guidelines Compliance

### 10.1 Safety (Guideline 1)

**1.1 Objectionable Content**
- ✅ Community moderation for user-generated content
- ✅ Report inappropriate content functionality
- ✅ No adult content allowed
- ✅ Clear community guidelines

**1.2 User-Generated Content**
- ✅ Method for reporting offensive content
- ✅ Ability to block users
- ✅ Mechanism for removing violating content within 24 hours
- ✅ Clear Terms of Service
- ✅ Provide information to law enforcement if required

**1.3 Kids Category**
- N/A - App is not targeted at children

**1.4 Physical Harm**
- ✅ No features encouraging harm to animals or people
- ✅ Service provider vetting process
- ✅ Emergency features designed for safety

**1.5 Developer Information**
- ✅ Accurate developer contact information
- ✅ Responsive to user concerns
- ✅ Privacy policy URL

---

### 10.2 Performance (Guideline 2)

**2.1 App Completeness**
- ✅ Submit complete, functional builds
- ✅ Include demo account for App Review
  - Username: demo@pet10x.ca
  - Password: DemoReview2025!
  - Pre-populated with sample data
- ✅ Enable all backend services for review

**2.2 Beta Testing**
- ✅ Use TestFlight for beta distribution
- ✅ No external beta distribution

**2.3 Accurate Metadata**
- ✅ Accurate app description
- ✅ Screenshots represent actual app experience
- ✅ Accurate keywords
- ✅ Appropriate age rating

**2.4 Hardware Compatibility**
- ✅ Optimize for iPhone and iPad
- ✅ Support current and previous iOS versions
- ✅ Test on multiple device sizes

**2.5 Software Requirements**

**2.5.2 Minimum iOS Version:** iOS 16.0+
- Rationale: Access to latest SwiftUI features, Live Activities, Dynamic Island

**2.5.6 Safari/Web Views:**
- ✅ Use SFSafariViewController for external links
- ✅ No hidden redirects

**2.5.15 Notifications:**
- ✅ Request permission only when necessary
- ✅ Don't require notifications for app functionality
- ✅ Provide clear value proposition

---

### 10.3 Business (Guideline 3)

**3.1 Payments**

**3.1.1 In-App Purchase:**
- ✅ Use StoreKit 2 for all digital goods/services
- ✅ Premium subscription
- ✅ Auto-renewable subscriptions with clear terms
- ✅ Free tier available

**Subscription Details:**
- Product ID: pet10x.premium.monthly / pet10x.premium.annual
- Free trial: 14 days
- Clear cancellation terms
- Renewal reminder before charging

**3.1.2 Subscriptions:**
- ✅ Users can manage subscriptions in Settings
- ✅ Clear terms and renewal pricing
- ✅ Restore purchases functionality

**3.1.3 Other Purchase Methods:**
- Building Manager and Enterprise plans sold outside app (B2B)
- Service provider subscriptions handled via web portal
- Compliant with Apple's guidelines for B2B transactions

**3.2 Other Business Model Issues**

**3.2.1 Acceptable:**
- ✅ Service marketplace (connecting users with providers)
- ✅ Commission on bookings (8%)
- ✅ B2B SaaS for building managers

**3.2.2 Unacceptable:**
- ❌ No crypto/NFT features
- ❌ No gambling
- ❌ No scheme/scam content

---

### 10.4 Design (Guideline 4)

**4.1 Copycats**
- ✅ Original concept and design
- ✅ No copying competitor apps

**4.2 Minimum Functionality**
- ✅ Robust feature set beyond web wrapper
- ✅ Native iOS experience
- ✅ Offline functionality

**4.3 Spam**
- ✅ Single app with full feature set
- ✅ No duplicate apps

**4.4 Extensions**
- iOS 18 Widget (home screen)
- Lock Screen controls (pet status toggle)
- Share extension (share lost pet posts)

**4.5 Sites and Services**

**4.5.1 Sign in with Apple:**
- ✅ **Required** - App uses other third-party sign-in
- Prominent "Sign in with Apple" button
- Privacy-focused default option

**Additional Login Options:**
- Email/password
- Google Sign-In
- Facebook Login

**4.8 Login Services:**
- ✅ Sign in with Apple offered
- ✅ Equivalent features for all login methods

---

### 10.5 Legal (Guideline 5)

**5.1 Privacy**

**5.1.1 Data Collection and Storage:**
- ✅ Privacy policy clearly visible
- ✅ Request permission before accessing data
- ✅ Explain why data is needed
- ✅ Secure data transmission (TLS 1.3)
- ✅ Encrypted storage

**5.1.2 Data Use and Sharing:**
- ✅ Data only used as disclosed in privacy policy
- ✅ No third-party analytics without disclosure
- ✅ User control over data sharing
- ✅ Explicit consent for sensitive data

**5.1.3 Health and Health Research:**
- N/A - Not a health app (pet health tracking is supplementary)

**5.1.4 Kids Apps:**
- N/A - 17+ age rating

**5.1.5 Location Services:**
- ✅ Clear explanation of location use
- ✅ "Always Allow" only for geofencing (optional feature)
- ✅ Graceful degradation if permission denied

**App Privacy Report Compatible:**
- Declare all data collection
- Clear labels in App Store Connect

**Privacy Nutrition Labels:**

| Category | Data Type | Linked to User | Tracking |
|----------|-----------|----------------|----------|
| Contact Info | Email, Name, Phone | Yes | No |
| Location | Precise Location | Yes | No |
| Photos/Videos | Photos | Yes | No |
| User Content | Posts, Reviews | Yes | No |
| Identifiers | User ID | Yes | No |

**5.2 Intellectual Property**

**5.2.1 Generally:**
- ✅ Original content only
- ✅ Licensed third-party content where applicable
- ✅ Proper attribution

**5.3 Gaming, Gambling, and Lotteries:**
- N/A

**5.4 VPN Apps:**
- N/A

**5.5 Developer Code of Conduct:**
- ✅ Comply with all laws
- ✅ Honest marketing
- ✅ No manipulation of ratings/reviews

---

### 10.6 App Review Process Preparation

**10.6.1 Review Notes to Include:**

```
DEMO ACCOUNT:
Username: demo@pet10x.ca
Password: DemoReview2025!

The demo account includes:
- 2 pre-registered pets (1 dog, 1 cat)
- Sample building with pet bylaws
- Pre-populated community feed
- Sample service providers
- Test incident report

QR CODE TESTING:
A test QR code is available at [URL] for scanning the first responder emergency access feature. This demonstrates our unique safety feature.

LOCATION SERVICES:
The app requests "Always Allow" location permission for optional geofencing feature to auto-update pet status. This is clearly explained in-app and can be declined without losing functionality.

SUBSCRIPTION:
14-day free trial, then $4.99 CAD/month. Subscription management available in iOS Settings. Test subscription available (sandbox).

B2B PLANS:
Building Manager and Enterprise plans are sold via web portal outside the app, in compliance with Apple's B2B guidelines.

CANADIAN LAUNCH:
App is initially targeted at Canadian market, specifically British Columbia, to comply with local strata legislation.
```

**10.6.2 Assets Prepared:**

- App icon (1024x1024)
- iPhone screenshots (6.7", 6.5", 5.5")
- iPad screenshots (12.9", 11")
- App preview video (30 seconds, showcasing key features)
- Localized metadata (English initially, French planned)

---

## 11. Success Metrics & KPIs

### 11.1 User Acquisition Metrics

**Primary:**
- Total Downloads: 50,000 (Year 1)
- Active Users (MAU): 25,000 (Year 1)
- DAU/MAU Ratio: >35%

**Secondary:**
- App Store Conversion Rate: >25%
- Organic vs. Paid Acquisition: 60/40 target
- Install Cost (CPI): <$2.50
- Viral Coefficient: >0.5 (referrals per user)

---

### 11.2 Engagement Metrics

**Core Engagement:**
- Daily Active Users (DAU): 35% of MAU
- Weekly Active Users (WAU): 65% of MAU
- Session Length: 5-8 minutes average
- Sessions per Week: 4+

**Feature Usage:**
- Pet Profile Completion Rate: >85%
- Community Post Engagement: >25% of users per month
- Lost & Found Views: Within 2 hours of posting (emergency)
- Service Directory CTR: >15%

---

### 11.3 Revenue Metrics

**Conversion:**
- Free to Premium Conversion: 25% within 90 days
- Building Manager Adoption: 30% of targeted buildings
- Service Provider Onboarding: 50 providers per quarter

**Revenue:**
- Monthly Recurring Revenue (MRR): $55K by Month 12
- Average Revenue Per User (ARPU): $2.60/month by Year 1 end
- Customer Lifetime Value (LTV): $150 (Premium users)
- Churn Rate: <5% monthly for Premium, <3% for Building Managers

---

### 11.4 Product Health Metrics

**Quality:**
- App Store Rating: >4.5 stars
- Crash-Free Sessions: >99.5%
- App Load Time: <2 seconds (p95)
- Customer Support Response Time: <4 hours

**Retention:**
- D1 Retention: >70%
- D7 Retention: >50%
- D30 Retention: >35%
- 12-Month Retention: >25%

---

### 11.5 Community Health Metrics

**Safety:**
- Nuisance Report Resolution Time: <48 hours
- Successful Lost Pet Reunions: Track and celebrate
- Service Provider Response Rate: >85%
- Content Moderation Response Time: <2 hours

**Impact:**
- Building Complaint Reduction: 50% decrease in participating buildings
- Emergency Response Time: 20% faster pet rescue with app data
- License Compliance Improvement: 60% increase in licensed pets

---

### 11.6 First Responder Partnership Metrics

**Adoption:**
- Fire Departments Partnered: 15 by Year 1 end
- QR Codes Installed: 500 buildings by Year 2
- First Responder Training Sessions: 30 per year

**Efficacy:**
- QR Code Scan Rate During Drills: >90%
- Data Accuracy During Incidents: >95%
- Reported Time Savings: Average 8 minutes per incident

---

## 12. Development Roadmap

### 12.1 Phase 1: MVP Development (Months 1-6)

**Goals:** Launch functional app in BC market

**M1-M2: Foundation**
- Requirements finalization
- Technical architecture design
- UI/UX wireframes and design system
- Backend infrastructure setup
- Database schema design
- iOS project setup

**M3-M4: Core Features**
- User authentication (Sign in with Apple)
- Pet profile creation and management
- Building management system
- Basic community feed
- First responder QR code system
- Push notifications setup

**M5: Advanced Features**
- Nuisance reporting
- Lost & found bulletin
- Pet status tracking
- Service directory (basic)
- Geofencing implementation

**M6: Polish & Launch**
- Beta testing (TestFlight, 100 users)
- Bug fixes and optimization
- App Store assets and metadata
- Privacy policy and legal docs
- App Store submission
- **Launch Date: Month 6, Week 4**

---

### 12.2 Phase 2: Growth & Enhancement (Months 7-12)

**Goals:** Expand features, grow user base, achieve product-market fit

**M7-M8:**
- Community features expansion
  - Events and activities
  - Enhanced social features
  - Photo/video sharing
- Service provider marketplace enhancements
  - Booking integration
  - Review system
  - Featured listings
- Analytics dashboard v1

**M9-M10:**
- iPad optimization
- Building manager tool enhancements
- First responder mobile app (separate app for fire departments)
- Integration with property management software (Yardi, AppFolio)
- Advanced reporting

**M11-M12:**
- Seasonal features (holiday events, weather-based alerts)
- Pet health tracking features
- Vaccination reminder system
- Municipal licensing API integrations (Vancouver, Burnaby, Surrey)
- Customer feedback implementation

**Launch Markets:** Expand to Toronto and Calgary

---

### 12.3 Phase 3: Scale & Monetization (Year 2)

**Q1:**
- Service provider commission system launch
- Advertising platform launch (native ads)
- Referral program for users
- Corporate partnerships (pet food, insurance)

**Q2:**
- Activity tracking features
- Integration with pet cameras
- Advanced health analytics
- Vet clinic partnerships
- Pet insurance marketplace

**Q3:**
- AI-powered features
  - Breed identification from photos
  - Automated incident severity assessment
  - Predictive compliance alerts
- Expansion to Montreal and Ottawa
- French localization

**Q4:**
- Pet adoption platform integration
- Professional training content
- Breed-specific communities
- Video content library
- Year 2 feature backlog

---

### 12.4 Phase 4: Innovation & Expansion (Year 3+)

**Advanced Features:**
- AR features (visualize pet spaces, training guides)
- Machine learning for behavior prediction
- Smart home integration (pet doors, feeders, cameras)
- Blockchain pet medical records (exploration)
- Telehealth vet consultations

**Geographic Expansion:**
- USA expansion (California, New York, Texas)
- Adaptation to US HOA/condo laws
- International expansion (UK, Australia)

**Platform Expansion:**
- Android app
- Web application
- Apple Watch app
- Apple TV app (pet photos screensaver)

---

## 13. Risk Analysis & Mitigation

### 13.1 Technical Risks

**Risk: App Store Rejection**
- **Probability:** Medium
- **Impact:** High (delays launch)
- **Mitigation:**
  - Thorough review of guidelines before submission
  - Demo account with full feature access
  - Clear documentation of all features
  - Proactive communication with App Review team
  - Pre-submission consultation if possible

---

**Risk: Data Breach / Security Incident**
- **Probability:** Low
- **Impact:** Catastrophic
- **Mitigation:**
  - End-to-end encryption for sensitive data
  - Regular security audits
  - Penetration testing
  - Bug bounty program
  - Comprehensive incident response plan
  - Cyber insurance
  - SOC 2 Type II compliance (by Year 2)

---

**Risk: Scalability Issues**
- **Probability:** Medium
- **Impact:** Medium
- **Mitigation:**
  - Cloud-native architecture (auto-scaling)
  - Load testing before major launches
  - Database optimization
  - CDN for media assets
  - Performance monitoring (Datadog)

---

### 13.2 Legal & Regulatory Risks

**Risk: Strata Bylaw Misinterpretation**
- **Probability:** Medium
- **Impact:** Medium (user trust, liability)
- **Mitigation:**
  - Legal review of all bylaw-related features
  - Clear disclaimers (app provides tools, not legal advice)
  - Consultation with strata law experts
  - Regular updates to reflect legal changes
  - Liability insurance

---

**Risk: Privacy Violation (PIPEDA, GDPR)**
- **Probability:** Low
- **Impact:** High (fines, reputation damage)
- **Mitigation:**
  - Privacy by design approach
  - Regular privacy impact assessments
  - Clear, transparent privacy policy
  - User control over data
  - Data protection officer (DPO)
  - Privacy legal counsel on retainer

---

**Risk: Service Provider Liability**
- **Probability:** Medium
- **Impact:** Medium
- **Mitigation:**
  - Clear Terms of Service (platform only, not employer)
  - Vetting process for service providers
  - Insurance verification
  - User reviews and ratings
  - Report and block functionality
  - Hold harmless clauses

---

### 13.3 Business Risks

**Risk: Low User Adoption**
- **Probability:** Medium
- **Impact:** High (business viability)
- **Mitigation:**
  - Freemium model lowers barrier to entry
  - Building manager partnerships drive captive users
  - Viral features (lost & found, community)
  - Aggressive initial marketing
  - Pivot based on user feedback

---

**Risk: Building Manager Resistance**
- **Probability:** Medium
- **Impact:** High (key user segment)
- **Mitigation:**
  - Free trials and demos
  - White-glove onboarding
  - Clear ROI demonstration
  - Testimonials from early adopters
  - Integration with existing tools (property management software)
  - SPCA and humane society endorsements

---

**Risk: Competition from Established Players**
- **Probability:** Medium
- **Impact:** High
- **Mitigation:**
  - First-mover advantage in building-integrated space
  - Deep focus on Canadian market and strata compliance
  - Unique first responder integration
  - Strong community features
  - Patent emergency QR system (patent pending by Year 1)

---

**Risk: Revenue Shortfall**
- **Probability:** Medium
- **Impact:** High (runway, investor confidence)
- **Mitigation:**
  - Diversified revenue streams
  - Conservative financial projections
  - Flexible pricing experimentation
  - B2B focus (higher ARPU, lower churn)
  - Fundraising buffer (18-month runway minimum)

---

### 13.4 Operational Risks

**Risk: Key Team Member Departure**
- **Probability:** Low-Medium
- **Impact:** Medium
- **Mitigation:**
  - Competitive compensation and equity
  - Clear documentation and knowledge sharing
  - Cross-training team members
  - Strong company culture
  - Succession planning

---

**Risk: Natural Disaster Affecting Servers**
- **Probability:** Low
- **Impact:** High
- **Mitigation:**
  - Multi-region cloud deployment (AWS)
  - Automated backups (daily, retained 30 days)
  - Disaster recovery plan (RTO: 4 hours, RPO: 1 hour)
  - Regular DR drills

---

### 13.5 Reputational Risks

**Risk: Pet Harm Due to App Failure**
- **Probability:** Very Low
- **Impact:** Catastrophic
- **Mitigation:**
  - 99.9% uptime SLA
  - Redundant systems for emergency features
  - Clear disclaimer (app is supplementary tool)
  - Regular testing of critical paths
  - Professional liability insurance

---

**Risk: Community Toxicity**
- **Probability:** Medium
- **Impact:** Medium
- **Mitigation:**
  - Clear community guidelines
  - Proactive moderation
  - AI-assisted content filtering
  - Report and block features
  - Consequences for violations (warnings, bans)

---

## Appendices

### Appendix A: Glossary

- **Strata Corporation:** BC term for condominium corporation/HOA
- **Bylaw:** Rules governing the strata property
- **Common Property:** Shared areas of a strata building
- **Service Animal:** Trained animal that performs tasks for person with disability
- **Grandfathering:** Legal protection for existing pets when new restrictions enacted
- **QR Code:** Quick Response code used for emergency responder access
- **PIPEDA:** Personal Information Protection and Electronic Documents Act (Canadian privacy law)

---

### Appendix B: References

**Legal & Regulatory:**
- Strata Property Act (British Columbia)
- Strata Property Regulation, BC Reg. 43/2000
- Guide Dog and Service Dog Act (BC)
- Human Rights Code (BC)
- PIPEDA (Federal)
- Municipal bylaws (Vancouver, Toronto, Calgary, etc.)

**Apple Documentation:**
- Human Interface Guidelines (https://developer.apple.com/design/human-interface-guidelines/)
- App Store Review Guidelines (https://developer.apple.com/app-store/review/guidelines/)
- StoreKit 2 Documentation
- Core Location Best Practices
- Privacy Guidelines

**Industry Research:**
- Canadian Animal Health Institute pet ownership statistics
- CMHC condominium housing data
- Urban pet ownership trends

---

### Appendix C: Competitive Analysis Matrix

| Feature | Pet10x | PetDesk | Pawprint | Nextdoor |
|---------|--------|---------|----------|----------|
| Pet Registry | ✅ | ✅ | ✅ | ❌ |
| Building Integration | ✅ | ❌ | ❌ | ❌ |
| Emergency Response | ✅ | ❌ | ❌ | ❌ |
| Strata Compliance | ✅ | ❌ | ❌ | ❌ |
| Community Feed | ✅ | ❌ | ❌ | ✅ |
| Service Marketplace | ✅ | ✅ | ❌ | ✅ |
| Lost & Found | ✅ | ❌ | ❌ | ✅ |
| Pet Health Tracking | Planned | ✅ | ✅ | ❌ |
| Canadian Focus | ✅ | ❌ | ❌ | ✅ |

---

### Appendix D: User Stories Backlog (Beyond MVP)

**High Priority:**
1. As a pet owner, I want to receive medication reminders so I don't forget to give my pet their medicine
2. As a building manager, I want to send emergency broadcasts to all pet owners during evacuations
3. As a service provider, I want to offer special promotions to app users to attract new business
4. As a first responder, I want to see a building map with pet locations color-coded by species

**Medium Priority:**
5. As a pet owner, I want to track my dog's walks and exercise to ensure they're getting enough activity
6. As a building resident without pets, I want to filter community feed to hide pet-specific posts
7. As a property management company, I want consolidated reports across all my buildings
8. As a vet clinic, I want to send appointment reminders to my patients through the app

**Low Priority:**
9. As a pet owner, I want to create a memorial page for my deceased pet
10. As a dog owner, I want to find walking buddies based on my dog's temperament and schedule
11. As a building manager, I want AI to predict which pets might cause future issues based on patterns
12. As a pet owner, I want to share my pet's birthday and receive community congratulations

---

### Appendix E: Design System Specifications

**Note:** Complete color system specifications are available in separate documents:
- **Pet10x_Color_System.md** - Comprehensive color palette with usage guidelines, accessibility specifications, implementation code, and testing requirements
- **Pet10x_Color_Reference_Card.md** - Visual reference card with color swatches and examples

**Color Palette Summary:**
- Primary Blue: #007AFF (RGB: 0, 122, 255) *[Replaced with Orange #FD9340 in updated system]*
- Primary Blue Dark Mode: #0A84FF (RGB: 10, 132, 255)
- Accent Orange: #FF9500 (RGB: 255, 149, 0)
- Success Green: #34C759 (RGB: 52, 199, 89)
- Warning Yellow: #FFCC00 (RGB: 255, 204, 0)
- Error Red: #FF3B30 (RGB: 255, 59, 48)
- Neutral Gray: #8E8E93 (RGB: 142, 142, 147)

**Updated Brand Colors (Nov 2025):**
- Primary Brand: #FD9340 (Warm Orange) - Main brand color
- Primary Dark: #E67E28 - Better contrast for text
- Secondary Brand: #2FBFB8 (Teal) - Trust and wellness
- Text Primary: #1F1F1F - Main text
- Text Secondary: #484444 - Supporting text

**Typography Scale:**
- 34pt: Large Title
- 28pt: Title 1
- 22pt: Title 2
- 20pt: Title 3
- 17pt: Headline, Body
- 16pt: Callout
- 15pt: Subheadline
- 13pt: Footnote
- 12pt: Caption 1
- 11pt: Caption 2

**Spacing Scale:**
- 4pt: Extra small
- 8pt: Small
- 12pt: Medium
- 16pt: Large
- 24pt: Extra large
- 32pt: XXL
- 48pt: XXXL

**Corner Radius:**
- Small: 4pt (buttons, badges)
- Medium: 8pt (buttons, cards)
- Large: 12pt (cards, containers)
- Extra Large: 16pt (modals)

---

### Appendix F: Technical Dependencies

**iOS Frameworks:**
- SwiftUI
- UIKit
- Core Data
- CloudKit
- Core Location
- MapKit
- EventKit
- StoreKit 2
- UserNotifications
- Vision (QR scanning)
- AVFoundation (camera)
- Photos (photo library access)

**Third-Party Libraries:**
- Firebase (authentication, analytics)
- Stripe SDK (payment processing for services)
- Sentry (crash reporting)
- Kingfisher (image loading and caching)
- Alamofire (networking, if needed beyond URLSession)

**Backend Services:**
- AWS EC2 (compute)
- AWS RDS (PostgreSQL database)
- AWS S3 (media storage)
- AWS CloudFront (CDN)
- AWS Lambda (serverless functions)
- AWS SNS (push notifications)
- Redis (caching and session management)

---

## Document Control

**Version History:**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | Nov 19, 2025 | Product Team | Initial PRD |

**Approval:**

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Product Owner | [TBD] | | |
| Engineering Lead | [TBD] | | |
| Design Lead | [TBD] | | |
| Legal Counsel | [TBD] | | |
| CEO | [TBD] | | |

---

**Next Steps:**

1. Review and approve PRD
2. Secure funding/investment
3. Assemble development team
4. Begin Phase 1 development
5. Establish partnerships with fire departments
6. Engage legal counsel for strata compliance review
7. Create detailed technical specifications
8. Begin UI/UX design process

---

**Contact:**

For questions or feedback on this PRD, please contact:  
Product Team: [product@pet10x.ca](mailto:product@pet10x.ca)

---

*This document is confidential and proprietary to Pet10x Inc. Do not distribute without authorization.*
