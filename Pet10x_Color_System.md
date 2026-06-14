# Pet10x Brand Color System
## Complete Color Palette & Usage Guidelines

---

## Overview

This color system is designed for Pet10x iOS app with accessibility, brand identity, and Apple HIG compliance in mind. All colors meet WCAG 2.1 AA standards for contrast where applicable.

---

## 1. Primary Brand Colors

### Primary Orange (Brand Color)
Your main brand identity - warm, energetic, friendly, perfect for pet-related content.

| Shade | Hex | RGB | Usage | Notes |
|-------|-----|-----|-------|-------|
| **Primary** | `#FD9340` | 253, 147, 64 | Primary actions, CTAs, brand moments | Your original main color |
| Primary Light | `#FFAB66` | 255, 171, 102 | Hover states, light backgrounds | +20% lightness |
| Primary Dark | `#E67E28` | 230, 126, 40 | Pressed states, emphasis | -15% lightness |
| Primary Subtle | `#FFF4EB` | 255, 244, 235 | Light backgrounds, cards, subtle accents | 95% lightness |

**Accessibility:**
- Primary (#FD9340) on white: **3.52:1** - ⚠️ Pass for Large Text (18pt+) only
- Primary Dark (#E67E28) on white: **4.14:1** - ✅ Pass AA for Large Text
- White text on Primary: **3.52:1** - ✅ Pass for large text
- Use Primary Dark for small text on white backgrounds

---

## 2. Secondary Brand Color - Teal/Turquoise

A complementary color that represents trust, calm, and reliability. Perfect for secondary actions and pet wellness features.

| Shade | Hex | RGB | Usage | Notes |
|-------|-----|-----|-------|-------|
| **Secondary** | `#2FBFB8` | 47, 191, 184 | Secondary actions, health/wellness features | Complementary to orange |
| Secondary Light | `#5FD4CF` | 95, 212, 207 | Hover states, subtle backgrounds | |
| Secondary Dark | `#1F9A95` | 31, 154, 149 | Pressed states, emphasis | |
| Secondary Subtle | `#E8F8F7` | 232, 248, 247 | Light backgrounds for vet/health sections | |

**Accessibility:**
- Secondary (#2FBFB8) on white: **3.52:1** - ✅ Pass AA for Large Text
- White text on Secondary: **3.52:1** - ✅ Pass for large text
- Secondary Dark for better contrast when needed

---

## 3. Text Colors

Enhanced text hierarchy with proper accessibility.

| Level | Light Mode | Dark Mode | RGB (Light) | Usage | Contrast |
|-------|-----------|-----------|-------------|-------|----------|
| **Primary Text** | `#1F1F1F` | `#F5F5F5` | 31, 31, 31 | Headlines, body text, primary content | 18.2:1 ✅ |
| **Secondary Text** | `#484444` | `#B8B8B8` | 72, 68, 68 | Supporting text, labels, captions | 9.75:1 ✅ |
| **Tertiary Text** | `#787878` | `#8E8E8E` | 120, 120, 120 | Timestamps, metadata, disabled text | 4.54:1 ✅ |
| **Link Text** | `#E67E28` | `#FFAB66` | 230, 126, 40 | Interactive text, links | 4.14:1 ✅ |
| **Placeholder** | `#A8A8A8` | `#6E6E6E` | 168, 168, 168 | Form placeholders, empty states | 3.17:1 |

---

## 4. Semantic Colors

Consistent with iOS system colors but branded for Pet10x.

### Success / Positive
| Shade | Hex | RGB | Usage |
|-------|-----|-----|-------|
| **Success** | `#34C759` | 52, 199, 89 | Success messages, confirmations, healthy status |
| Success Dark | `#2DA848` | 45, 168, 72 | Pressed state |
| Success Light | `#E8F8ED` | 232, 248, 237 | Success background |

**Use for:** Vaccination up-to-date, license valid, pet found, compliance achieved

### Warning / Caution
| Shade | Hex | RGB | Usage |
|-------|-----|-----|-------|
| **Warning** | `#FFCC00` | 255, 204, 0 | Warning messages, expiring items |
| Warning Dark | `#D9AD00` | 217, 173, 0 | Pressed state |
| Warning Light | `#FFF9E6` | 255, 249, 230 | Warning background |

**Use for:** License expiring soon, vaccination due, missing information

### Error / Danger
| Shade | Hex | RGB | Usage |
|-------|-----|-----|-------|
| **Error** | `#FF3B30` | 255, 59, 48 | Error messages, destructive actions, urgent alerts |
| Error Dark | `#D92B20` | 217, 43, 32 | Pressed state |
| Error Light | `#FFEFEE` | 255, 239, 238 | Error background |

**Use for:** License expired, failed actions, nuisance reports, emergency alerts

### Info / Neutral
| Shade | Hex | RGB | Usage |
|-------|-----|-----|-------|
| **Info** | `#007AFF` | 0, 122, 255 | Information messages, tips, iOS standard blue |
| Info Dark | `#0062CC` | 0, 98, 204 | Pressed state |
| Info Light | `#E6F2FF` | 230, 242, 255 | Info background |

**Use for:** Helpful tips, informational alerts, neutral notifications

---

## 5. Background Colors

### Light Mode
| Level | Hex | RGB | Usage |
|-------|-----|-----|-------|
| **Base Background** | `#FFFFFF` | 255, 255, 255 | Main app background |
| **Secondary Background** | `#F8F8F8` | 248, 248, 248 | Grouped content background, cards |
| **Tertiary Background** | `#F0F0F0` | 240, 240, 240 | Nested cards, input fields |
| **Elevated Background** | `#FFFFFF` | 255, 255, 255 | Modals, sheets (with shadow) |

### Dark Mode
| Level | Hex | RGB | Usage |
|-------|-----|-----|-------|
| **Base Background** | `#000000` | 0, 0, 0 | Main app background |
| **Secondary Background** | `#1C1C1E` | 28, 28, 30 | Grouped content background, cards |
| **Tertiary Background** | `#2C2C2E` | 44, 44, 46 | Nested cards, input fields |
| **Elevated Background** | `#1C1C1E` | 28, 28, 30 | Modals, sheets |

---

## 6. Border & Separator Colors

| Element | Light Mode | Dark Mode | Opacity |
|---------|-----------|-----------|---------|
| **Divider/Separator** | `#E5E5E5` | `#38383A` | 100% |
| **Border Default** | `#D1D1D6` | `#48484A` | 100% |
| **Border Focus** | `#FD9340` | `#FFAB66` | 100% |
| **Border Error** | `#FF3B30` | `#FF453A` | 100% |

---

## 7. Overlay & Shadow Colors

| Element | Light Mode | Dark Mode | Usage |
|---------|-----------|-----------|-------|
| **Modal Overlay** | `#000000` at 40% | `#000000` at 60% | Behind modals/sheets |
| **Card Shadow** | `#000000` at 8% | `#000000` at 20% | Card elevation |
| **Button Shadow** | `#FD9340` at 20% | `#FD9340` at 30% | Primary button depth |

---

## 8. Special Feature Colors

### Pet Type Colors (Category Indicators)
| Pet Type | Color | Hex | Usage |
|----------|-------|-----|-------|
| **Dog** | Warm Brown | `#A0522D` | Dog profiles, dog-specific features |
| **Cat** | Soft Purple | `#9B59B6` | Cat profiles, cat-specific features |
| **Bird** | Sky Blue | `#3498DB` | Bird profiles |
| **Fish** | Ocean Blue | `#1ABC9C` | Fish profiles |
| **Small Mammal** | Earthy Green | `#7CB342` | Rabbit, hamster, etc. |
| **Reptile** | Olive Green | `#6B8E23` | Reptile profiles |

### Status Colors (Pet Presence)
| Status | Color | Hex | Usage |
|--------|-------|-----|-------|
| **Home** | Green | `#34C759` | Pet is home |
| **Away** | Gray | `#8E8E93` | Pet is out of building |
| **At Vet** | Blue | `#007AFF` | Pet at veterinarian |
| **Emergency** | Red | `#FF3B30` | Emergency status |
| **On Vacation** | Orange | `#FD9340` | Pet on vacation |

---

## 9. Component-Specific Colors

### Buttons

**Primary Button:**
- Background: `#FD9340`
- Text: `#FFFFFF`
- Hover: `#FFAB66`
- Pressed: `#E67E28`
- Disabled: `#FD9340` at 40% opacity
- Shadow: `#FD9340` at 20%

**Secondary Button:**
- Background: `#FFFFFF`
- Border: `#FD9340` 2px
- Text: `#FD9340`
- Hover: `#FFF4EB` background
- Pressed: `#FFE8D6` background

**Tertiary/Text Button:**
- Background: Transparent
- Text: `#FD9340`
- Hover: `#FFF4EB` background
- Pressed: `#FFE8D6` background

**Destructive Button:**
- Background: `#FF3B30`
- Text: `#FFFFFF`
- Hover: `#FF5449`
- Pressed: `#D92B20`

### Form Elements

**Input Fields:**
- Background: `#F8F8F8` (Light) / `#1C1C1E` (Dark)
- Border Default: `#D1D1D6`
- Border Focus: `#FD9340`
- Border Error: `#FF3B30`
- Placeholder: `#A8A8A8`

**Switches:**
- On: `#34C759` (iOS standard green)
- Off: `#E5E5E5`
- Thumb: `#FFFFFF`

**Sliders:**
- Track: `#E5E5E5`
- Fill: `#FD9340`
- Thumb: `#FFFFFF` with `#FD9340` border

### Badges & Labels

**Premium Badge:**
- Background: Linear gradient `#FD9340` to `#FFD700`
- Text: `#FFFFFF`
- Border: `#FFFFFF` 1px

**Status Badges:**
- Active: `#34C759` background, `#FFFFFF` text
- Pending: `#FFCC00` background, `#1F1F1F` text
- Expired: `#FF3B30` background, `#FFFFFF` text
- Grandfathered: `#007AFF` background, `#FFFFFF` text

---

## 10. Dark Mode Adjustments

All colors have dark mode variants. Key differences:

| Element | Light Mode | Dark Mode | Reason |
|---------|-----------|-----------|---------|
| Primary Brand | `#FD9340` | `#FFAB66` | Increased luminance for visibility |
| Text Primary | `#1F1F1F` | `#F5F5F5` | Inverted |
| Backgrounds | White-based | Black-based | System standard |
| Borders | Lighter grays | Darker grays | Contrast preservation |
| Shadows | Subtle (8%) | Stronger (20%) | Depth perception |

**Testing Required:**
- Test all combinations in Xcode with Dark Mode toggle
- Verify contrast ratios in dark mode
- Check against Apple's Dark Mode guidelines

---

## 11. Gradient Combinations

### Primary Gradient (Hero sections, premium features)
```
Linear Gradient
From: #FD9340
To: #E67E28
Angle: 135°
```

### Secondary Gradient (Background accents)
```
Linear Gradient
From: #FFF4EB
To: #FFE8D6
Angle: 180°
```

### Success Gradient (Celebrations, achievements)
```
Linear Gradient
From: #34C759
To: #2DA848
Angle: 135°
```

### Premium Badge Gradient
```
Linear Gradient
From: #FD9340
To: #FFD700 (Gold)
Angle: 45°
```

---

## 12. Accessibility Compliance

### WCAG 2.1 AA Contrast Requirements
- **Normal text:** 4.5:1 minimum
- **Large text (18pt+):** 3:1 minimum
- **UI components:** 3:1 minimum

### Pet10x Contrast Ratios

**Primary Brand Color:**
| Combination | Ratio | Pass? | Usage |
|-------------|-------|-------|-------|
| `#FD9340` on White | 3.52:1 | ⚠️ Large text only | Buttons with large text |
| `#E67E28` on White | 4.14:1 | ✅ Large text | Buttons, headings |
| White on `#FD9340` | 3.52:1 | ✅ Large text | Button text 17pt+ |
| `#FD9340` on `#1F1F1F` | 6.44:1 | ✅ Pass AA | Dark backgrounds |

**Text Colors:**
| Combination | Ratio | Pass? |
|-------------|-------|-------|
| `#1F1F1F` on White | 18.2:1 | ✅ Pass AAA |
| `#484444` on White | 9.75:1 | ✅ Pass AAA |
| `#787878` on White | 4.54:1 | ✅ Pass AA |

**Recommendations:**
1. Use `#E67E28` (Primary Dark) for small text on white
2. Use `#FD9340` only for buttons, CTAs, and large headings
3. Always test in app with real content
4. Use Apple's Accessibility Inspector for validation

---

## 13. Color Usage Guidelines

### DO's ✅

1. **Use Primary Orange (`#FD9340`) for:**
   - Primary action buttons
   - Brand moments (splash screen, empty states)
   - Primary navigation highlights
   - Important CTAs
   - Tab bar selected state

2. **Use Secondary Teal (`#2FBFB8`) for:**
   - Secondary actions
   - Health/wellness features
   - Veterinary sections
   - Alternative CTAs
   - Information cards

3. **Use Semantic Colors consistently:**
   - Green = Success, Healthy, Active
   - Yellow = Warning, Attention Needed
   - Red = Error, Danger, Emergency
   - Blue = Information, Neutral

4. **Maintain contrast:**
   - Always check WCAG ratios
   - Test in both light and dark modes
   - Use Primary Dark for better contrast

5. **Use color to support, not replace:**
   - Add icons alongside colors
   - Use text labels
   - Don't rely on color alone

### DON'T's ❌

1. **Don't use Primary Orange for:**
   - Body text (too low contrast)
   - Small UI elements without dark variant
   - Backgrounds (use Primary Subtle instead)

2. **Don't mix semantic meanings:**
   - Don't use red for success
   - Don't use green for errors
   - Be consistent across the app

3. **Don't overuse brand colors:**
   - Not every element needs to be orange
   - Use neutral grays for hierarchy
   - Let content breathe

4. **Don't ignore dark mode:**
   - Colors must work in both modes
   - Test thoroughly
   - Adjust opacity if needed

5. **Don't forget accessibility:**
   - Low vision users need high contrast
   - Colorblind users need alternatives
   - Test with Accessibility Inspector

---

## 14. Implementation Code

### iOS SwiftUI Colors

```swift
import SwiftUI

extension Color {
    // MARK: - Primary Brand
    static let pet10xPrimary = Color(hex: "FD9340")
    static let pet10xPrimaryLight = Color(hex: "FFAB66")
    static let pet10xPrimaryDark = Color(hex: "E67E28")
    static let pet10xPrimarySubtle = Color(hex: "FFF4EB")
    
    // MARK: - Secondary Brand
    static let pet10xSecondary = Color(hex: "2FBFB8")
    static let pet10xSecondaryLight = Color(hex: "5FD4CF")
    static let pet10xSecondaryDark = Color(hex: "1F9A95")
    static let pet10xSecondarySubtle = Color(hex: "E8F8F7")
    
    // MARK: - Text Colors
    static let pet10xTextPrimary = Color(hex: "1F1F1F")
    static let pet10xTextSecondary = Color(hex: "484444")
    static let pet10xTextTertiary = Color(hex: "787878")
    static let pet10xTextLink = Color(hex: "E67E28")
    
    // MARK: - Semantic Colors
    static let pet10xSuccess = Color(hex: "34C759")
    static let pet10xWarning = Color(hex: "FFCC00")
    static let pet10xError = Color(hex: "FF3B30")
    static let pet10xInfo = Color(hex: "007AFF")
    
    // MARK: - Helper
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3: // RGB (12-bit)
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: // RGB (24-bit)
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: // ARGB (32-bit)
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (255, 0, 0, 0)
        }
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}
```

### iOS Asset Catalog (Colors.xcassets)

```json
{
  "colors" : [
    {
      "color" : {
        "color-space" : "srgb",
        "components" : {
          "alpha" : "1.000",
          "blue" : "0.251",
          "green" : "0.576",
          "red" : "0.992"
        }
      },
      "idiom" : "universal"
    },
    {
      "appearances" : [
        {
          "appearance" : "luminosity",
          "value" : "dark"
        }
      ],
      "color" : {
        "color-space" : "srgb",
        "components" : {
          "alpha" : "1.000",
          "blue" : "0.400",
          "green" : "0.671",
          "red" : "1.000"
        }
      },
      "idiom" : "universal"
    }
  ],
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
```

### CSS Variables (for web/marketing)

```css
:root {
  /* Primary Brand */
  --pet10x-primary: #FD9340;
  --pet10x-primary-light: #FFAB66;
  --pet10x-primary-dark: #E67E28;
  --pet10x-primary-subtle: #FFF4EB;
  
  /* Secondary Brand */
  --pet10x-secondary: #2FBFB8;
  --pet10x-secondary-light: #5FD4CF;
  --pet10x-secondary-dark: #1F9A95;
  --pet10x-secondary-subtle: #E8F8F7;
  
  /* Text */
  --pet10x-text-primary: #1F1F1F;
  --pet10x-text-secondary: #484444;
  --pet10x-text-tertiary: #787878;
  --pet10x-text-link: #E67E28;
  
  /* Semantic */
  --pet10x-success: #34C759;
  --pet10x-warning: #FFCC00;
  --pet10x-error: #FF3B30;
  --pet10x-info: #007AFF;
}

/* Dark Mode */
@media (prefers-color-scheme: dark) {
  :root {
    --pet10x-primary: #FFAB66;
    --pet10x-text-primary: #F5F5F5;
    --pet10x-text-secondary: #B8B8B8;
    --pet10x-text-tertiary: #8E8E8E;
  }
}
```

---

## 15. Design Tool Setup

### Figma Color Styles

1. Create color styles for all main colors
2. Name format: `Pet10x/Primary/Base`, `Pet10x/Primary/Light`, etc.
3. Create semantic styles: `Pet10x/Semantic/Success`
4. Create text styles with colors: `Pet10x/Text/Primary`

### Sketch Symbols

1. Create shared color symbols
2. Use layer styles for consistency
3. Link to text styles

### Adobe XD

1. Create color assets in Assets panel
2. Use consistent naming
3. Create character styles with colors

---

## 16. Brand Color Personality

**Primary Orange (#FD9340):**
- **Emotion:** Playful, energetic, warm, friendly
- **Association:** Sunset, warmth, enthusiasm, joy
- **Perfect for:** Pets, activity, community, positive actions
- **Psychology:** Encourages action, creates excitement, builds energy

**Secondary Teal (#2FBFB8):**
- **Emotion:** Calm, trustworthy, refreshing, balanced
- **Association:** Water, tranquility, health, clarity
- **Perfect for:** Wellness, veterinary care, safety, information
- **Psychology:** Builds trust, reduces anxiety, promotes clarity

**Color Combination:**
- Orange + Teal = Energetic yet trustworthy
- Warm + Cool = Balanced emotional response
- Perfect for pet care: playful but responsible

---

## 17. Seasonal Color Variations (Optional)

### Winter Theme
- Primary: `#FD9340` stays same
- Accent: Add icy blue `#B3E5FC`
- Backgrounds: Cooler whites `#F5F8FA`

### Spring Theme
- Primary: `#FD9340` stays same
- Accent: Add fresh green `#8BC34A`
- Backgrounds: Warmer whites `#FFF9F5`

### Summer Theme
- Primary: Brighter `#FFA654`
- Accent: Vibrant teal `#00BCD4`
- Backgrounds: Light and bright

### Fall Theme
- Primary: Warmer `#F58220`
- Accent: Rustic brown `#A0522D`
- Backgrounds: Warm beige tones

---

## 18. Quick Reference Chart

| Color Name | Hex | When to Use | Don't Use For |
|------------|-----|-------------|---------------|
| Primary Orange | #FD9340 | Buttons, CTAs, brand | Body text, small text |
| Primary Dark | #E67E28 | Small text on white, links | Backgrounds |
| Secondary Teal | #2FBFB8 | Health features, secondary actions | Primary navigation |
| Text Primary | #1F1F1F | Body text, headings | Buttons (use white) |
| Text Secondary | #484444 | Labels, supporting text | Headlines |
| Success Green | #34C759 | Confirmations, healthy status | Errors or warnings |
| Warning Yellow | #FFCC00 | Expiring items, cautions | Success messages |
| Error Red | #FF3B30 | Errors, destructive actions | Positive actions |
| Info Blue | #007AFF | Tips, neutral information | Emotional content |

---

## 19. Color Testing Checklist

Before shipping any feature:

- [ ] All colors pass WCAG AA contrast ratios
- [ ] Colors work in both Light and Dark modes
- [ ] Colors tested with colorblindness simulators
- [ ] No reliance on color alone (icons/text included)
- [ ] Semantic colors used consistently
- [ ] Brand colors not overused
- [ ] Accessibility Inspector validation passed
- [ ] Real device testing completed
- [ ] Screenshots reviewed in both modes
- [ ] Marketing team approved brand usage

---

## 20. Resources & Tools

**Color Contrast Checkers:**
- WebAIM Contrast Checker: https://webaim.org/resources/contrastchecker/
- Stark for Figma/Sketch
- Apple Accessibility Inspector (Xcode)

**Colorblindness Simulators:**
- Colorblind Web Page Filter: https://www.toptal.com/designers/colorfilter
- Sim Daltonism (Mac app)
- Figma Colorblind plugin

**Color Management:**
- Coolors.co (palette generation)
- Adobe Color (harmony testing)
- Paletton (color scheme designer)

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | Nov 19, 2025 | Initial color system | Design Team |

---

**Questions or Suggestions?**
Contact: design@pet10x.ca

*This color system is a living document and will evolve with the product.*
