import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"
import noRawColors from "./eslint-rules/no-raw-colors.js"

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Every data hook (lib/data/*) clears its error and raises isLoading at
      // the top of the fetch effect, before awaiting; the cascade this rule
      // warns about is one extra render per fetch, by design. Kept visible.
      "react-hooks/set-state-in-effect": "warn",
      // "Overdue", "waited 12 min", "booked in the last 30 days" read the
      // clock while rendering on purpose — a render that is a few seconds
      // stale is the intended behaviour, not a purity bug. Kept visible.
      "react-hooks/purity": "warn",
    },
  },
  {
    // One palette (docs/superpowers/specs/2026-10-15-ui-system-design.md §3):
    // class strings name tokens from app/globals.css, never raw colours,
    // palette names, removed tokens or opacity tints. The allow-list lives in
    // the rule.
    files: ["**/*.{js,jsx,ts,tsx,mjs}"],
    plugins: { pet10x: { rules: { "no-raw-colors": noRawColors } } },
    rules: { "pet10x/no-raw-colors": "error" },
  },
  globalIgnores([".next/**", "node_modules/**", "supabase/**", "backups/**", "public/**", "next-env.d.ts"]),
])
