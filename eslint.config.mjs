import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"

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
  globalIgnores([".next/**", "node_modules/**", "supabase/**", "backups/**", "public/**", "next-env.d.ts"]),
])
