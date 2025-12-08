"use client"

import React, { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { auth } from "@/lib/firebase"
import { sendEmailVerification } from "firebase/auth"
import toast from "react-hot-toast"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export default function VerifyEmailPage() {
  const router = useRouter()
  const [sending, setSending] = useState(false)
  const [checking, setChecking] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)

  useEffect(() => {
    let mounted = true
    const checkVerified = async () => {
      try {
        setChecking(true)
        const user = auth.currentUser
        if (!user) {
          // If not logged in, direct to sign-in
          router.push('/auth/sign-in')
          return
        }
        // reload current user and check
        try { await user.reload() } catch { /* ignore */ }
        if (!mounted) return
        if (user.emailVerified) {
          toast.success('Email verified - redirecting to login')
          router.push('/auth/sign-in')
        }
      } finally {
        setChecking(false)
      }
    }

    // check immediately and then poll a few times
    checkVerified()
    const iv = setInterval(checkVerified, 5000)
    return () => { mounted = false; clearInterval(iv) }
  }, [router])

  const handleResend = async () => {
    const user = auth.currentUser
    if (!user) {
      toast.error('You must be signed in to resend verification')
      router.push('/auth/sign-in')
      return
    }
    if (resendCooldown > 0) return
    try {
      setSending(true)
      await sendEmailVerification(user)
      toast.success('Verification email sent - check your inbox or spam')
      // start 30s cooldown
      setResendCooldown(30)
    } catch (e) {
      console.error('resend verification error', e)
      toast.error('Failed to resend verification email')
    } finally {
      setSending(false)
    }
  }

  // Countdown effect for resend cooldown
  useEffect(() => {
    if (resendCooldown <= 0) return
    const id = setInterval(() => setResendCooldown((c) => Math.max(0, c - 1)), 1000)
    return () => clearInterval(id)
  }, [resendCooldown])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-stone-200 via-amber-100 to-stone-300 p-6">
      <div className="w-full max-w-md">
        <Card>
          <CardContent className="p-6 space-y-4 text-center">
            <h2 className="text-xl font-semibold">Verify your email</h2>
            <p className="text-sm text-stone-700">Didn&apos;t receive an email? Check your spam folder or click the button below to resend the verification email.</p>

            <div className="flex flex-col gap-3 pt-2">
              <Button onClick={handleResend} disabled={sending || resendCooldown > 0}>
                {sending ? 'Sending...' : resendCooldown > 0 ? `Resend (${resendCooldown}s)` : 'Resend verification email'}
              </Button>
              <Button variant="outline" onClick={() => router.push('/auth/sign-in')}>Already verified? Login</Button>
            </div>

            <div className="text-xs text-stone-500 mt-2">This page will redirect to login automatically when your email is verified.</div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
