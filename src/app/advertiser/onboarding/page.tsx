"use client"

import { useState, useEffect } from "react"
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
  companyName: z.string().min(2, "Business name is required"),
  industry: z.string().min(2, "Industry is required"),
  companyBio: z.string().min(10, "Bio must be at least 10 characters"),
  bankCode: z.string().min(2, "Select your bank"),
  accountNumber: z.string().regex(/^\d{10}$/, "Enter a valid 10-digit account number"),
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
  const [banks, setBanks] = useState<Array<{ name: string; code: string }>>([])
  const [open, setOpen] = useState(false)
  const [accountName, setAccountName] = useState("")
  // logo upload removed per request
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

  // Fetch Nigerian banks list for advertiser bank selection
  type PaystackBank = { name: string; code: string }
  useEffect(() => {
    const fetchBanks = async () => {
      try {
        const res = await fetch("https://api.paystack.co/bank?country=nigeria")
        const data = await res.json()
        if (data.status && data.data) {
          const dataBanks = data.data as PaystackBank[]
          setBanks(dataBanks.map((b) => ({ name: b.name, code: b.code })))
        }
      } catch (err) {
        console.error("Failed to fetch banks", err)
      }
    }
    fetchBanks()
  }, [])

  // verify bank account whenever inputs change
  const bankCode = watch("bankCode")
  const accountNumber = watch("accountNumber")
  useEffect(() => {
    const verify = async () => {
      if (accountNumber?.length === 10 && bankCode) {
        try {
          const res = await fetch("/api/verify-bank", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accountNumber, bankCode }),
          })
          const data = await res.json()
          if (data.status && data.data) {
            setAccountName(data.data.account_name || data.data.accountName || "")
          } else {
            setAccountName("")
          }
        } catch (err) {
          console.error("Bank verification failed", err)
          setAccountName("")
        }
      }
    }
    verify()
  }, [accountNumber, bankCode])

  // logo upload handler removed

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    try {
      const user = auth.currentUser
      if (!user) {
        toast.error("No logged in user")
        return
      }

      // ✅ Save onboarding details in Firestore (website & logo removed)
      const refDoc = doc(db, "advertisers", user.uid)
      await updateDoc(refDoc, {
        companyName: data.companyName,
        industry: data.industry,
        companyBio: data.companyBio,
        onboarded: true,
        // bank fields
        bank: {
          bankCode: data.bankCode,
          bankName: banks.find((b) => b.code === data.bankCode)?.name || "",
          accountNumber: data.accountNumber,
          accountName: accountName || null,
          verified: !!accountName,
        },
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
          <p className="text-stone-300 mt-2">Set up your profile to start creating tasks 🚀</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Business Name */}
          <div>
            <Label className="text-stone-200">Business Name</Label>
            <Input
              {...register("companyName")}
              placeholder="My Business Ltd"
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

          {/* Bank Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label className="text-stone-200">Bank</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between bg-white/20 border-white/30 text-white"
                  >
                    {watch("bankCode")
                      ? banks.find((ind) => ind.code === watch("bankCode"))?.name
                      : "Select bank"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0 bg-stone-800 text-white">
                  <div className="p-2 max-h-56 overflow-y-auto">
                    {banks.map((b) => (
                      <button
                        key={b.code}
                        className="w-full text-left p-2 hover:bg-stone-700 rounded"
                        type="button"
                        onClick={() => setValue("bankCode", b.code)}
                      >
                        {b.name}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              {errors.bankCode && (
                <p className="text-sm text-red-300 mt-1">{errors.bankCode.message}</p>
              )}
            </div>

            <div>
              <Label className="text-stone-200">Account Number</Label>
              <Input
                {...register("accountNumber")}
                placeholder="1234567890"
                className="bg-white/20 border-white/30 text-white"
              />
              {accountName && <p className="text-xs text-green-400 mt-1">Account: {accountName}</p>}
            </div>
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

