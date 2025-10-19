"use client"

import { Suspense } from "react"
import { SignUpForm } from "./components/sign-up-form"

export default function SignUpPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen">Loading...</div>}>
      <SignUpForm />
    </Suspense>
  )
}
