import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { StyleGuide } from "./style-guide"

export const metadata: Metadata = {
  title: "Style guide — Pet10x",
  robots: { index: false, follow: false },
}

/**
 * Every token and shared piece on one screen, for reviewing the UI system
 * before screens move onto it. Development only: a production build 404s.
 */
export default function StyleGuidePage() {
  if (process.env.NODE_ENV === "production") notFound()
  return <StyleGuide />
}
