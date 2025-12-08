"use client"

import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { auth, db } from "@/lib/firebase"
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
} from "firebase/auth"
import {
  doc,
  getDocs,
  query,
  where,
  collection,
  setDoc,
} from "firebase/firestore"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select"
import { Eye, EyeOff } from "lucide-react"
import toast from "react-hot-toast"
import { useRouter, useSearchParams } from "next/navigation"

// Validation schema
const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email"),
  phone: z
    .string()
    .regex(/^\d{10,15}$/, "Enter a valid phone number (10-15 digits)"),
  password: z.string().min(5, "Password must be at least 5 characters"),
  action: z.enum(["advertiser", "earner"], {
    message: "Please select what you want to do",
  }),
  acceptTerms: z.boolean().refine((val) => val === true, {
    message: "You must accept the Terms of Service",
  }),
  acceptPrivacy: z.boolean().refine((val) => val === true, {
    message: "You must accept the Privacy Policy",
  }),
})

type FormData = z.infer<typeof formSchema>

export function SignUpForm() {
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [passwordStrength, setPasswordStrength] = useState(0)
  const router = useRouter()
  const searchParams = useSearchParams()
  const referralId = searchParams.get("ref")

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { action: "earner", acceptTerms: false, acceptPrivacy: false },
  })

  const passwordValue = watch("password")

  // Live password strength meter
  const calcStrength = (password: string) => {
    // Only measure basic length for strength (requirement: >=5 chars)
    return password.length >= 5 ? 1 : 0
  }

  useEffect(() => {
    setPasswordStrength(calcStrength(passwordValue || ""))
  }, [passwordValue])

  // Check if email or phone already exists
  const checkUnique = async (email: string, phone: string) => {
    const collections = ["advertisers", "earners"]
    for (const coll of collections) {
      const emailQ = query(collection(db, coll), where("email", "==", email))
      const phoneQ = query(collection(db, coll), where("phone", "==", phone))
      const emailSnap = await getDocs(emailQ)
      const phoneSnap = await getDocs(phoneQ)
      if (!emailSnap.empty || !phoneSnap.empty) return false
    }
    return true
  }

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    try {
      const unique = await checkUnique(data.email, data.phone)
      if (!unique) {
        toast.error("Email or phone already exists")
        setLoading(false)
        return
      }

      const cred = await createUserWithEmailAndPassword(auth, data.email, data.password).catch(
        (err) => {
          let msg = "Signup failed. Try again"
          if (err.code === "auth/email-already-in-use") msg = "This email is already registered"
          if (err.code === "auth/invalid-email") msg = "Invalid email format"
          if (err.code === "auth/weak-password") msg = "Password is too weak, please use a stronger one"
          toast.error(msg)
          throw err
        }
      )

      await sendEmailVerification(cred.user)

      try {
        const refDoc = doc(db, data.action + "s", cred.user.uid)
        await setDoc(refDoc, {
          name: data.name,
          email: data.email,
          phone: data.phone,
          createdAt: new Date(),
          verified: false,
          onboarded: false,
          referredBy: referralId || null,
        })

        if (referralId) {
          await setDoc(doc(db, "referrals", `${referralId}_${cred.user.uid}`), {
            referrerId: referralId,
            referredId: cred.user.uid,
            email: data.email,
            name: data.name,
            amount: 1000,
            status: "pending",
            createdAt: new Date(),
          })
        }

        toast.success("Signup successful! Please verify your email.")
        // Redirect user to the verify-email page so they can resend/check verification
        setTimeout(() => router.push("/auth/verify-email"), 800)
      } catch (firestoreErr) {
        console.error("Firestore error:", firestoreErr)
        await cred.user.delete()
        toast.error("Signup failed while saving data. Please try again.")
      }
    } catch (err) {
      console.error("Signup error:", err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-stone-700 via-stone-800 to-stone-900 p-6">
      <div className="w-full max-w-lg bg-white/10 backdrop-blur-xl rounded-2xl shadow-xl border border-white/20 p-8 animate-fadeIn">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-extrabold text-white">Create Your Account</h1>
          <p className="text-stone-300 mt-2">Join us and start your journey 🚀</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div>
            <Label className="text-stone-200">Name</Label>
            <Input {...register("name")} placeholder="John Doe" className="bg-white/20 border-white/30 text-white placeholder:text-stone-400" />
            {errors.name && <p className="text-sm text-red-300 mt-1">{errors.name.message}</p>}
          </div>

          <div>
            <Label className="text-stone-200">Email</Label>
            <Input type="email" {...register("email")} placeholder="you@example.com" className="bg-white/20 border-white/30 text-white placeholder:text-stone-400" />
            {errors.email && <p className="text-sm text-red-300 mt-1">{errors.email.message}</p>}
          </div>

          <div>
            <Label className="text-stone-200">Phone</Label>
            <Input {...register("phone")} placeholder="08123456789" className="bg-white/20 border-white/30 text-white placeholder:text-stone-400" />
            {errors.phone && <p className="text-sm text-red-300 mt-1">{errors.phone.message}</p>}
          </div>

          <div>
            <Label className="text-stone-200">Password</Label>
            <div className="relative">
              <Input type={showPassword ? "text" : "password"} {...register("password")} placeholder="••••••••" className="bg-white/20 border-white/30 text-white placeholder:text-stone-400 pr-10" />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-2.5 text-stone-300 hover:text-white">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </div>
            {errors.password && <p className="text-sm text-red-300 mt-1">{errors.password.message}</p>}
            <div className="mt-2">
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div style={{ width: `${passwordStrength ? 100 : 0}%` }} className={`h-full ${passwordStrength ? "bg-green-400" : "bg-red-500"}`} />
              </div>
              <p className="text-xs text-stone-300 mt-1">Password: {passwordStrength ? 'OK' : 'too short'}</p>
            </div>
            <p className="text-stone-400 text-sm">Password must be at least 5 characters long.</p>
          </div>

          <div>
            <Label className="text-stone-200">What do you want to do?</Label>
            <Select onValueChange={(val) => setValue("action", val as "advertiser" | "earner")} defaultValue="earner">
              <SelectTrigger className="bg-white/20 border-white/30 text-white">
                <SelectValue placeholder="Choose an option" />
              </SelectTrigger>
              <SelectContent className="bg-stone-700 text-white">
                <SelectItem value="advertiser">Create Tasks</SelectItem>
                <SelectItem value="earner">earn by performing tasks</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <input type="checkbox" {...register("acceptTerms")} className="mt-1" />
              <label className="text-sm text-stone-300">I agree to the <a href="/terms" target="_blank" className="text-yellow-400 hover:text-yellow-300 underline">Terms of Service</a></label>
            </div>
            {errors.acceptTerms && <p className="text-sm text-red-300 mt-1">{errors.acceptTerms.message}</p>}

            <div className="flex items-start gap-2">
              <input type="checkbox" {...register("acceptPrivacy")} className="mt-1" />
              <label className="text-sm text-stone-300">I agree to the <a href="/privacy" target="_blank" className="text-yellow-400 hover:text-yellow-300 underline">Privacy Policy</a></label>
            </div>
            {errors.acceptPrivacy && <p className="text-sm text-red-300 mt-1">{errors.acceptPrivacy.message}</p>}
          </div>

          <Button type="submit" className="w-full bg-yellow-500 hover:bg-yellow-400 text-stone-900 font-semibold" disabled={loading}>{loading ? "Creating account..." : "Create Account"}</Button>
        </form>
        <div className="text-center mt-4">
          <p className="text-stone-400 text-sm">
            Already Have an account?{" "}
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