"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { FirebaseError } from "firebase/app"
import {
  applyActionCode,
  checkActionCode,
  confirmPasswordReset,
  verifyPasswordResetCode,
} from "firebase/auth"
import { auth } from "@/lib/firebase"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type ActionStatus = "loading" | "success" | "error" | "ready"

function getActionErrorMessage(error: unknown) {
  const code = error instanceof FirebaseError ? error.code : undefined
  switch (code) {
    case "auth/expired-action-code":
      return "This link has expired. Please request a new one."
    case "auth/invalid-action-code":
      return "This link is invalid or has already been used."
    case "auth/user-disabled":
      return "This account is disabled. Please contact support."
    case "auth/weak-password":
      return "Choose a stronger password with at least 6 characters."
    default:
      return "We could not complete this request. Please try again."
  }
}

export default function ClientAuthActionPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const mode = searchParams.get("mode")
  const oobCode = searchParams.get("oobCode")
  const continueUrl = searchParams.get("continueUrl")

  const [status, setStatus] = useState<ActionStatus>("loading")
  const [message, setMessage] = useState("Checking your secure link...")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const destination = useMemo(() => {
    if (continueUrl) return continueUrl
    return "/auth/sign-in"
  }, [continueUrl])

  useEffect(() => {
    let mounted = true

    const run = async () => {
      if (!mode || !oobCode) {
        if (!mounted) return
        setStatus("error")
        setMessage("This action link is incomplete. Please request a fresh email.")
        return
      }

      try {
        if (mode === "verifyEmail") {
          await checkActionCode(auth, oobCode)
          await applyActionCode(auth, oobCode)
          if (!mounted) return
          setStatus("success")
          setMessage("Your email has been verified. You can now sign in to your Pamba account.")
          return
        }

        if (mode === "resetPassword") {
          const verifiedEmail = await verifyPasswordResetCode(auth, oobCode)
          if (!mounted) return
          setEmail(verifiedEmail)
          setStatus("ready")
          setMessage("Create a new password for your account.")
          return
        }

        if (!mounted) return
        setStatus("error")
        setMessage("This action type is not supported.")
      } catch (error) {
        if (!mounted) return
        setStatus("error")
        setMessage(getActionErrorMessage(error))
      }
    }

    void run()
    return () => {
      mounted = false
    }
  }, [mode, oobCode])

  const handlePasswordReset = async () => {
    if (!oobCode) {
      setStatus("error")
      setMessage("This reset link is incomplete. Please request a fresh email.")
      return
    }

    if (password.length < 6) {
      setStatus("error")
      setMessage("Choose a stronger password with at least 6 characters.")
      return
    }

    if (password !== confirmPassword) {
      setStatus("error")
      setMessage("The passwords do not match.")
      return
    }

    try {
      setSubmitting(true)
      setStatus("loading")
      setMessage("Updating your password...")
      await confirmPasswordReset(auth, oobCode, password)
      setStatus("success")
      setMessage("Your password has been reset successfully. You can sign in with your new password now.")
    } catch (error) {
      setStatus("error")
      setMessage(getActionErrorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#fef3c7,transparent_35%),linear-gradient(135deg,#1c1917,#292524_45%,#44403c)] px-6 py-16 text-stone-100">
      <div className="mx-auto flex max-w-4xl flex-col gap-8 lg:flex-row lg:items-center">
        <div className="max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.34em] text-amber-300">Pamba Account Center</p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight text-white">
            {mode === "resetPassword" ? "Secure your account and get back in quickly." : "Your email confirmation should feel like part of Pamba."}
          </h1>
          <p className="mt-4 text-sm leading-7 text-stone-300">
            We handle your account actions right here in the app now, so you get a smoother, branded confirmation flow instead of a generic provider page.
          </p>
        </div>

        <Card className="w-full max-w-xl border-white/10 bg-white/95 text-stone-900 shadow-2xl">
          <CardContent className="p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-700">
              {mode === "resetPassword" ? "Password reset" : "Email verification"}
            </p>
            <h2 className="mt-3 text-3xl font-semibold text-stone-900">
              {status === "success"
                ? "All set"
                : status === "error"
                  ? "Action needed"
                  : mode === "resetPassword"
                    ? "Reset your password"
                    : "Confirm your email"}
            </h2>
            <p className="mt-3 text-sm leading-6 text-stone-600">{message}</p>

            {status === "ready" && mode === "resetPassword" && (
              <div className="mt-6 space-y-4">
                <div>
                  <Label className="text-stone-700">Account email</Label>
                  <Input value={email} disabled className="mt-2 bg-stone-100 text-stone-600" />
                </div>
                <div>
                  <Label className="text-stone-700">New password</Label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="mt-2"
                    placeholder="Enter a strong new password"
                  />
                </div>
                <div>
                  <Label className="text-stone-700">Confirm password</Label>
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className="mt-2"
                    placeholder="Repeat your new password"
                  />
                </div>
                <Button
                  className="w-full bg-amber-500 text-stone-900 hover:bg-amber-400"
                  onClick={handlePasswordReset}
                  disabled={submitting}
                >
                  {submitting ? "Updating password..." : "Save new password"}
                </Button>
              </div>
            )}

            {(status === "success" || status === "error") && (
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Button
                  className="bg-stone-900 text-white hover:bg-stone-800"
                  onClick={() => {
                    if (destination.startsWith("http")) {
                      window.location.href = destination
                    } else {
                      router.push(destination)
                    }
                  }}
                >
                  Continue
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/auth/sign-in">Go to sign in</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
