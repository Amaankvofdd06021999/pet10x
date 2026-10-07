import type { MetadataRoute } from "next"

/**
 * The web app manifest. Its practical job is push on iOS: Safari delivers web
 * push only to a site added to the Home Screen, and "Add to Home Screen" reads
 * its name, icons and start page from here. Colours match `viewport` in
 * app/layout.tsx and the brand orange used in the emails.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pet10x — Pet Governance & Community",
    short_name: "Pet10x",
    description: "Pet governance, risk management & community for multi-unit residential buildings.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: "#FD9340",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  }
}
