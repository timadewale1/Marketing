"use client"

import { useState } from "react"
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
import { useRouter } from "next/navigation"

// ✅ Validation schema
const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email"),
  phone: z
    .string()
    .regex(/^\d{10,15}$/, "Enter a valid phone number (10-15 digits)"),
  password: z
    .string()
    .min(8, "Must be 8+ characters")
    .regex(/[A-Z]/, "Must include an uppercase letter")
    .regex(/[a-z]/, "Must include a lowercase letter")
    .regex(/\d/, "Must include a number")
    .regex(/[@$!%*?&]/, "Must include a special character"),
  action: z.enum(["advertiser", "earner", "marketer"], {
    message: "Please select what you want to do", // <-- use 'message' instead of 'required_error'
  }),
});


type FormData = z.infer<typeof formSchema>

export default function SignUpPage() {
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [passwordStrength, setPasswordStrength] = useState(0)
  const router = useRouter()

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { action: "earner" },
  })

  const passwordValue = watch("password")

  // ✅ Live password strength meter
  const calcStrength = (password: string) => {
    let score = 0
    if (password.length >= 8) score++
    if (/[A-Z]/.test(password)) score++
    if (/[a-z]/.test(password)) score++
    if (/\d/.test(password)) score++
    if (/[@$!%*?&]/.test(password)) score++
    return score
  }

  // ✅ Check if email or phone already exists
  const checkUnique = async (email: string, phone: string) => {
    const collections = ["advertisers", "earners", "marketers"]
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
      // ✅ Step 1: Check uniqueness
      const unique = await checkUnique(data.email, data.phone)
      if (!unique) {
        toast.error("Email or phone already exists")
        setLoading(false)
        return
      }

      // ✅ Step 2: Create Auth user
      const cred = await createUserWithEmailAndPassword(
        auth,
        data.email,
        data.password
      ).catch((err) => {
        let msg = "Signup failed. Try again"
        if (err.code === "auth/email-already-in-use")
          msg = "This email is already registered"
        if (err.code === "auth/invalid-email") msg = "Invalid email format"
        if (err.code === "auth/weak-password")
          msg = "Password is too weak, please use a stronger one"
        toast.error(msg)
        throw err
      })

      // ✅ Step 3: Send verification email
      await sendEmailVerification(cred.user)

      try {
        // ✅ Step 4: Save profile in Firestore
        const ref = doc(db, data.action + "s", cred.user.uid)
        await setDoc(ref, {
          name: data.name,
          email: data.email,
          phone: data.phone,
          createdAt: new Date(),
          verified: false, // will update after email verification
        })

        // ✅ Step 5: Show success + redirect
        toast.success("Signup successful! Please verify your email.")
        setTimeout(() => router.push("/auth/sign-in"), 2000)
      } catch (firestoreErr) {
        console.error("Firestore error:", firestoreErr)
        await cred.user.delete() // rollback
        toast.error("Signup failed while saving data. Please try again.")
      }
    } catch (err) {
      console.error("Signup error:", err)
    } finally {
      setLoading(false)
    }
  }

  // update password strength dynamically
  if (passwordValue) {
    const strength = calcStrength(passwordValue)
    if (strength !== passwordStrength) setPasswordStrength(strength)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-stone-700 via-stone-800 to-stone-900 p-6">
      <div className="w-full max-w-lg bg-white/10 backdrop-blur-xl rounded-2xl shadow-xl border border-white/20 p-8 animate-fadeIn">
        {/* Heading */}
        <div className="text-center mb-6">
          <h1 className="text-3xl font-extrabold text-white">
            Create Your Account
          </h1>
          <p className="text-stone-300 mt-2">
            Join us and start your journey 🚀
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Name */}
          <div>
            <Label className="text-stone-200">Name</Label>
            <Input
              {...register("name")}
              placeholder="John Doe"
              className="bg-white/20 border-white/30 text-white placeholder:text-stone-400"
            />
            {errors.name && (
              <p className="text-sm text-red-300 mt-1">{errors.name.message}</p>
            )}
          </div>

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
              <p className="text-sm text-red-300 mt-1">
                {errors.email.message}
              </p>
            )}
          </div>

          {/* Phone */}
          <div>
            <Label className="text-stone-200">Phone</Label>
            <Input
              {...register("phone")}
              placeholder="08123456789"
              className="bg-white/20 border-white/30 text-white placeholder:text-stone-400"
            />
            {errors.phone && (
              <p className="text-sm text-red-300 mt-1">
                {errors.phone.message}
              </p>
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
            {/* Strength bar */}
            {passwordValue && (
              <div className="mt-2 h-2 w-full bg-stone-700 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    passwordStrength <= 2
                      ? "bg-red-500 w-2/5"
                      : passwordStrength === 3
                      ? "bg-yellow-500 w-3/5"
                      : "bg-green-500 w-full"
                  }`}
                />
              </div>
            )}
          </div>

          {/* What do you want to do? */}
          <div>
            <Label className="text-stone-200">What do you want to do?</Label>
           <Select
  onValueChange={(val) => setValue("action", val as "advertiser" | "earner" | "marketer")}
  defaultValue="earner"
>

              <SelectTrigger className="bg-white/20 border-white/30 text-white">
                <SelectValue placeholder="Choose an option" />
              </SelectTrigger>
              <SelectContent className="bg-stone-700 text-white">
                <SelectItem value="advertiser">Advertise my products</SelectItem>
                <SelectItem value="earner">Earn by promoting</SelectItem>
                <SelectItem value="marketer">
                  Connect advertisers to the platform
                </SelectItem>
              </SelectContent>
            </Select>
            {errors.action && (
              <p className="text-sm text-red-300 mt-1">
                {errors.action.message}
              </p>
            )}
          </div>

          {/* Submit */}
          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-stone-600 via-stone-700 to-stone-800 text-white font-semibold py-2 rounded-xl shadow-md hover:opacity-90 transition"
          >
            {loading ? "Creating Account..." : "Sign Up"}
          </Button>
        </form>
        <div className="text-center mt-4">
          <p className="text-stone-400 text-sm">
            Already have an Account?{" "}
            <a
              href="/auth/sign-in"
              className="text-amber-400 hover:underline"
            >
              Login
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
