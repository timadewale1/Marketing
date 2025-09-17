"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { auth } from "@/lib/firebase"
import { sendPasswordResetEmail } from "firebase/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import toast from "react-hot-toast"

// ✅ Validation schema
const formSchema = z.object({
  email: z.string().email("Invalid email"),
})

type FormData = z.infer<typeof formSchema>

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
  })

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    try {
      await sendPasswordResetEmail(auth, data.email)
      toast.success("If this email exists, a reset link has been sent")
    } catch (err: any) {
      console.error(err)
      let msg = "Failed to send reset link"
      if (err.code === "auth/invalid-email") msg = "Invalid email address"
      if (err.code === "auth/user-not-found") msg = "No account found with this email"
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-stone-700 via-stone-800 to-stone-900 p-6">
      <div className="w-full max-w-md bg-white/10 backdrop-blur-xl rounded-2xl shadow-xl border border-white/20 p-8">
        {/* Heading */}
        <div className="text-center mb-6">
          <h1 className="text-3xl font-extrabold text-white">Reset Password</h1>
          <p className="text-stone-300 mt-2">
            Enter your email to get a reset link
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Email */}
          <div>
            <Label className="text-stone-200">Email</Label>
            <Input
              type="email"
              {...register("email")}
              placeholder="you@example.com"
              className="bg-white/20 border-white/30 text-white placeholder:text-stone-400"
            />
            {errors.email && (
              <p className="text-sm text-red-300 mt-1">{errors.email.message}</p>
            )}
          </div>

          {/* Submit */}
          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-stone-600 via-stone-700 to-stone-800 text-white font-semibold py-2 rounded-xl shadow-md hover:opacity-90 transition"
          >
            {loading ? "Sending..." : "Send Reset Link"}
          </Button>
        </form>

        {/* Footer */}
        <div className="text-center mt-4">
          <p className="text-stone-400 text-sm">
            Remembered your password?{" "}
            <a
              href="/auth/sign-in"
              className="text-amber-400 hover:underline"
            >
              Sign in
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
