"use client"

import { AuthProvider, useAuth } from "@/lib/auth-context"
import { SignInScreen } from "@/components/screens/sign-in-screen"
import { redirect } from "next/navigation"
import { Loader2, PawPrint } from "lucide-react"

function LoginContent() {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 animate-in fade-in duration-300">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-primary/20">
          <PawPrint className="h-6 w-6 text-primary-foreground" strokeWidth={2.5} />
        </span>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (isAuthenticated) {
    redirect("/app")
  }

  return (
    <div className="mx-auto w-full max-w-md animate-in fade-in duration-300">
      <SignInScreen />
    </div>
  )
}

export default function LoginPage() {
  return (
    <AuthProvider>
      <LoginContent />
    </AuthProvider>
  )
}
