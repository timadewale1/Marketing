"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { auth, db } from "@/lib/firebase"
import { signInWithEmailAndPassword } from "firebase/auth"
import { doc, getDoc, updateDoc } from "firebase/firestore"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Eye, EyeOff } from "lucide-react"
import toast from "react-hot-toast"
import { useRouter } from "next/navigation"

// ✅ Validation schema
const formSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(6, "Password required"),
})

type FormData = z.infer<typeof formSchema>

function getFirebaseLoginErrorMessage(code?: string) {
  switch (code) {
    case "auth/invalid-email":
      return "That email address is not valid."
    case "auth/user-not-found":
      return "No account was found with that email."
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "The email or password you entered is incorrect."
    case "auth/user-disabled":
      return "This account has been disabled. Please contact support."
    case "auth/too-many-requests":
      return "Too many login attempts. Please wait a bit and try again."
    case "auth/network-request-failed":
      return "Network error while signing in. Check your connection and try again."
    default:
      return "We could not sign you in right now. Please try again."
  }
}

export default function SignInPage() {
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const router = useRouter()

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
      // ✅ Attempt login
      const cred = await signInWithEmailAndPassword(
        auth,
        data.email,
        data.password
      ).catch((err) => {
        toast.error(getFirebaseLoginErrorMessage(err.code))
        throw err
      })

      // ✅ Email verification check
      if (!cred.user.emailVerified) {
        toast.error("Please verify your email before logging in")
        setLoading(false)
        return
      }

      // ✅ Figure out the user's role and onboarding status
      let role: "advertiser" | "earner" | "marketer" | null = null
      const collections = ["advertisers", "earners", "marketers"]
      let onboarded = false

      for (const coll of collections) {
        const docRef = doc(db, coll, cred.user.uid)
        const snap = await getDoc(docRef)
        if (snap.exists()) {
          role = coll.slice(0, -1) as "advertiser" | "earner" | "marketer"

          // ✅ Update verified field
          if (!snap.data().verified) {
            await updateDoc(docRef, { verified: true })
          }

          // ✅ Check onboarding status
          onboarded = snap.data().onboarded || false
          break
        }
      }

      if (!role) {
        toast.error("User role not found. Contact support.")
        setLoading(false)
        return
      }

      // ✅ Redirect based on onboarding status
      toast.success("Login successful 🎉")
      if (!onboarded) {
        router.push(`/${role}/onboarding`)
      } else {
        router.push(`/${role}`)
      }
    } catch (err) {
      console.error("Login error:", err)
      if (!(typeof err === "object" && err && "code" in err)) {
        toast.error("We could not sign you in right now. Please try again.")
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-stone-700 via-stone-800 to-stone-900 p-6">
      <div className="w-full max-w-md bg-white/10 backdrop-blur-xl rounded-2xl shadow-xl border border-white/20 p-8">
        {/* Heading */}
        <div className="text-center mb-6">
          <h1 className="text-3xl font-extrabold text-white">Welcome Back</h1>
          <p className="text-stone-300 mt-2">Sign in to continue</p>
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

          {/* Password */}
          <div>
            <Label className="text-stone-200">Password</Label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                {...register("password")}
                placeholder="••••••••"
                className="bg-white/20 border-white/30 text-white placeholder:text-stone-400 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2.5 text-stone-300 hover:text-white"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {errors.password && (
              <p className="text-sm text-red-300 mt-1">
                {errors.password.message}
              </p>
            )}
          </div>

          {/* Submit */}
          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-stone-600 via-stone-700 to-stone-800 text-white font-semibold py-2 rounded-xl shadow-md hover:opacity-90 transition"
          >
            {loading ? "Signing In..." : "Sign In"}
          </Button>
        </form>

        {/* Footer */}
        <div className="text-center mt-4">
          <p className="text-stone-400 text-sm">
            Forgot password?{" "}
            <a
              href="/auth/forgot-password"
              className="text-amber-400 hover:underline"
            >
              Reset it
            </a>
          </p>
        </div>
        <div className="text-center mt-4">
          <p className="text-stone-400 text-sm">
            Don&apos;t have an Account?{" "}
            <a href="/auth/sign-up" className="text-amber-400 hover:underline">
              Sign Up
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
