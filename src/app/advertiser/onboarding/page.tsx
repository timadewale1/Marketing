"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { auth, db, storage } from "@/lib/firebase"
import { doc, updateDoc } from "firebase/firestore"
import { ref, uploadBytes, getDownloadURL } from "firebase/storage"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import toast from "react-hot-toast"
import { useRouter } from "next/navigation"

// ✅ Validation schema
const formSchema = z.object({
  companyName: z.string().min(2, "Company name is required"),
  industry: z.string().min(2, "Industry is required"),
  website: z.string().url("Enter a valid website").optional(),
  companyBio: z.string().min(10, "Bio must be at least 10 characters"),
})

type FormData = z.infer<typeof formSchema>

// ✅ Industry list
const industries = [
  { value: "fashion", label: "Fashion" },
  { value: "tech", label: "Technology" },
  { value: "food", label: "Food & Beverage" },
  { value: "beauty", label: "Beauty & Skincare" },
  { value: "finance", label: "Finance" },
  { value: "education", label: "Education" },
  { value: "health", label: "Health & Wellness" },
  { value: "entertainment", label: "Entertainment" },
  { value: "real-estate", label: "Real Estate" },
]

export default function AdvertiserOnboarding() {
  const [loading, setLoading] = useState(false)
  const [logo, setLogo] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string>("")
  const router = useRouter()

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
  })

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      if (file.size > 2 * 1024 * 1024) {
        toast.error("Logo must be less than 2MB")
        return
      }
      setLogo(file)
      setLogoPreview(URL.createObjectURL(file))
    }
  }

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    try {
      const user = auth.currentUser
      if (!user) {
        toast.error("No logged in user")
        return
      }

      // ✅ Upload company logo
      let logoUrl = ""
      if (logo) {
        const storageRef = ref(storage, `advertisers/${user.uid}/logo.jpg`)
        await uploadBytes(storageRef, logo)
        logoUrl = await getDownloadURL(storageRef)
      }

      // ✅ Save onboarding details in Firestore
      const refDoc = doc(db, "advertisers", user.uid)
      await updateDoc(refDoc, {
        companyName: data.companyName,
        industry: data.industry,
        website: data.website || "",
        companyBio: data.companyBio,
        logo: logoUrl,
        onboarded: true,
      })

      toast.success("Onboarding completed 🎉")
      router.push("/advertiser")
    } catch (err) {
      console.error(err)
      toast.error("Failed to complete onboarding")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-stone-700 via-stone-800 to-stone-900 p-6">
      <div className="w-full max-w-3xl bg-white/10 backdrop-blur-xl rounded-2xl shadow-xl border border-white/20 p-8 space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-extrabold text-white">Advertiser Onboarding</h1>
          <p className="text-stone-300 mt-2">Set up your profile to start running campaigns 🚀</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Company Logo */}
          <div>
            <Label className="text-stone-200">Company Logo</Label>
            <Input type="file" accept="image/*" onChange={handleLogoUpload} />
            {logoPreview && (
              <img
                src={logoPreview}
                className="mt-3 h-20 w-20 rounded-full object-cover border-2 border-amber-500"
              />
            )}
          </div>

          {/* Company Name */}
          <div>
            <Label className="text-stone-200">Company Name</Label>
            <Input
              {...register("companyName")}
              placeholder="My Brand Ltd"
              className="bg-white/20 border-white/30 text-white"
            />
            {errors.companyName && (
              <p className="text-sm text-red-300 mt-1">{errors.companyName.message}</p>
            )}
          </div>

          {/* Industry Searchable Dropdown */}
          <div>
            <Label className="text-stone-200">Industry</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between bg-white/20 border-white/30 text-white"
                >
                  {watch("industry")
                    ? industries.find((ind) => ind.value === watch("industry"))?.label
                    : "Select industry"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0 bg-stone-800 text-white">
                <Command>
                  <CommandInput placeholder="Search industry..." className="text-white" />
                  <CommandList>
                    <CommandEmpty>No industry found.</CommandEmpty>
                    <CommandGroup>
                      {industries.map((ind) => (
                        <CommandItem
                          key={ind.value}
                          value={ind.value}
                          onSelect={() => setValue("industry", ind.value)}
                        >
                          {ind.label}
                        </CommandItem>
                      ))}
                      <CommandItem
                        key="other"
                        value="other"
                        onSelect={() => setValue("industry", "other")}
                      >
                        Other
                      </CommandItem>
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {errors.industry && (
              <p className="text-sm text-red-300 mt-1">{errors.industry.message}</p>
            )}
          </div>

          {/* Website */}
          <div>
            <Label className="text-stone-200">Website (optional)</Label>
            <Input
              {...register("website")}
              placeholder="https://mybrand.com"
              className="bg-white/20 border-white/30 text-white"
            />
            {errors.website && (
              <p className="text-sm text-red-300 mt-1">{errors.website.message}</p>
            )}
          </div>

          {/* Company Bio */}
          <div>
            <Label className="text-stone-200">Company Bio</Label>
            <Input
              {...register("companyBio")}
              placeholder="Tell us about your company"
              className="bg-white/20 border-white/30 text-white"
            />
            {errors.companyBio && (
              <p className="text-sm text-red-300 mt-1">{errors.companyBio.message}</p>
            )}
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 text-white font-semibold py-2 rounded-xl shadow-md"
          >
            {loading ? "Saving..." : "Finish Onboarding"}
          </Button>
        </form>
      </div>
    </div>
  )
}
