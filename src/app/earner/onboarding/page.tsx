"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { auth, db, storage } from "@/lib/firebase"
import { doc, updateDoc, collection, query, where, getDocs, addDoc, serverTimestamp, increment } from "firebase/firestore"
import { initFirebaseAdmin } from '@/lib/firebaseAdmin'
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

const formSchema = z.object({
  fullName: z.string().min(2, "Full name is required"),
  gender: z.enum(["Male", "Female"], { message: "Please select gender" }),
  dob: z.string().min(1, "Date of birth is required"),
  bio: z.string().min(10, "Bio must be at least 10 characters"),
  skills: z.string().min(3, "Please list at least one skill"),
  preferredCampaigns: z.string().min(3, "Enter preferred campaign types"),
  bankCode: z.string().min(2, "Select your bank"),
  accountNumber: z
    .string()
    .regex(/^\d{10}$/, "Enter a valid 10-digit account number"),
})

type FormData = z.infer<typeof formSchema>

export default function EarnerOnboarding() {
  const [loading, setLoading] = useState(false)
  const [banks, setBanks] = useState<{ name: string; code: string }[]>([])
  const [profilePic, setProfilePic] = useState<File | null>(null)
  const [profilePreview, setProfilePreview] = useState<string>("")
  const [accountName, setAccountName] = useState<string>("")
  const [open, setOpen] = useState(false)
  const [verifying, setVerifying] = useState(false)
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

  const accountNumber = watch("accountNumber")
  const bankCode = watch("bankCode")

  // ✅ Fetch Nigerian banks from Paystack
  useEffect(() => {
    const fetchBanks = async () => {
      try {
        const res = await fetch("https://api.paystack.co/bank?country=nigeria", {
          headers: {
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_PAYSTACK_KEY}`,
          },
        })
        const data = await res.json()
        if (data.status) setBanks(data.data)
      } catch (err) {
        console.error("Failed to fetch banks", err)
      }
    }
    fetchBanks()
  }, [])

  // ✅ Verify bank account whenever inputs change
  useEffect(() => {
    const verifyBank = async () => {
      if (accountNumber?.length === 10 && bankCode) {
        setVerifying(true)
        try {
          const res = await fetch("/api/verify-bank", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accountNumber, bankCode }),
          })
          const data = await res.json()
          if (data.status) {
            setAccountName(data.data.account_name)
            toast.success(`Account Verified: ${data.data.account_name}`)
          } else {
            setAccountName("")
            toast.error("Bank verification failed")
          }
        } catch (err) {
          console.error("Verification error", err)
          toast.error("Unable to verify bank account")
        } finally {
          setVerifying(false)
        }
      }
    }
    verifyBank()
  }, [accountNumber, bankCode])

  const handleProfilePic = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      if (file.size > 2 * 1024 * 1024) {
        toast.error("Profile picture must be less than 2MB")
        return
      }
      setProfilePic(file)
      setProfilePreview(URL.createObjectURL(file))
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

      // ✅ Upload profile pic
      let profilePicUrl = ""
      if (profilePic) {
        const storageRef = ref(storage, `earners/${user.uid}/profile.jpg`)
        await uploadBytes(storageRef, profilePic)
        profilePicUrl = await getDownloadURL(storageRef)
      }

      // ✅ Create Paystack Wallet
interface WalletData {
  wallet: {
    account_number: string;
    bank: { name: string };
  };
  customer: {
    customer_code: string;
  };
  isTest?: boolean;
}
let walletData: WalletData

if (process.env.NEXT_PUBLIC_ENV === "dev") {
  // 🔹 Fake wallet for dev mode
  walletData = {
    wallet: {
      account_number: "1234567890",
      bank: { name: "Test Bank" },
    },
    customer: {
      customer_code: "CUS_TEST123",
    },
  }
  console.log("⚡ Using fake wallet in dev mode:", walletData)
} else {
  // 🔹 Real wallet creation on Paystack
  const walletRes = await fetch("/api/create-wallet", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: user.email,
      name: data.fullName,
      phone: user.phoneNumber,
    }),
  })
  walletData = await walletRes.json()
  if (!walletData.wallet) throw new Error("Wallet creation failed")
}



const refDoc = doc(db, "earners", user.uid)
await updateDoc(refDoc, {
  fullName: data.fullName,
  gender: data.gender,
  dob: data.dob,
  bio: data.bio,
  skills: data.skills,
  preferredCampaigns: data.preferredCampaigns,
  bankCode: data.bankCode,
  bankName: banks.find((b) => b.code === data.bankCode)?.name || "",
  accountNumber: data.accountNumber,
  accountName: accountName,
  profilePic: profilePicUrl,
  onboarded: true,
  wallet: {
  account_number: walletData.wallet.account_number,
  bank: walletData.wallet.bank.name,
  customer_code: walletData.customer.customer_code,
  isTest: walletData.isTest, // comes directly from API
},

})

      // ✅ Handle referrals: if someone referred this user at signup, mark referral completed and credit referrer
      try {
        const q = query(collection(db, "referrals"), where("referredId", "==", user.uid), where("status", "==", "pending"));
        const snaps = await getDocs(q);
        const { admin, dbAdmin } = await initFirebaseAdmin();
        for (const docSnap of snaps.docs) {
          const r = docSnap.data();
          const bonus = Number(r.amount || 0);
          const referrerId = r.referrerId;
          // Prevent duplicate payout: check if already completed
          if (r.status === "completed") continue;
          // mark referral as completed
          await updateDoc(doc(db, "referrals", docSnap.id), { status: "completed", completedAt: serverTimestamp() });
          // credit referrer (if exists)
          if (referrerId && bonus > 0) {
            if (dbAdmin && admin) {
              // Use admin SDK for transaction and balance increment
              const adminDb = dbAdmin as import('firebase-admin').firestore.Firestore;
              await adminDb.collection("earnerTransactions").add({
                userId: referrerId,
                type: "referral_bonus",
                amount: bonus,
                status: "completed",
                note: `Referral bonus for referring ${user.uid}`,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
              });
              await adminDb.collection("earners").doc(referrerId).update({ balance: admin.firestore.FieldValue.increment(bonus) });
            } else {
              // Fallback to client SDK
              await addDoc(collection(db, "earnerTransactions"), {
                userId: referrerId,
                type: "referral_bonus",
                amount: bonus,
                status: "completed",
                note: `Referral bonus for referring ${user.uid}`,
                createdAt: serverTimestamp(),
              });
              await updateDoc(doc(db, "earners", referrerId), { balance: increment(bonus) });
            }
          }
        }
      } catch (refErr) {
        console.error("Referral finalization failed:", refErr);
      }

      toast.success("Onboarding completed 🎉")
      router.push("/earner")
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
          <h1 className="text-3xl font-extrabold text-white">Complete Your Profile</h1>
          <p className="text-stone-300 mt-2">Fill in your details to start earning 🎯</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Profile Picture */}
          <div>
            <Label className="text-stone-200">Profile Picture</Label>
            <Input type="file" accept="image/*" onChange={handleProfilePic} />
            {profilePreview && (
              <div className="mt-3 h-20 w-20 rounded-full overflow-hidden border-2 border-amber-500 relative">
                <Image src={profilePreview} alt="Profile preview" width={80} height={80} className="object-cover" />
              </div>
            )}
          </div>

          {/* Full Name */}
          <div>
            <Label className="text-stone-200">Full Name</Label>
            <Input {...register("fullName")} placeholder="John Doe" className="bg-white/20 border-white/30 text-white" />
            {errors.fullName && <p className="text-sm text-red-300 mt-1">{errors.fullName.message}</p>}
          </div>

          {/* Gender & DOB */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label className="text-stone-200">Gender</Label>
              <select
                {...register("gender")}
                className="w-full bg-white/20 border-white/30 text-white rounded-md px-3 py-2"
              >
                <option value="" className="bg-stone-700 rounded-md">Select gender</option>
                <option value="Male" className="bg-stone-700 rounded-md">Male</option>
                <option value="Female" className="bg-stone-700 rounded-md">Female</option>
              </select>
              {errors.gender && <p className="text-sm text-red-300 mt-1">{errors.gender.message}</p>}
            </div>
            <div>
              <Label className="text-stone-200">Date of Birth</Label>
              <Input type="date" {...register("dob")} className="bg-white/20 border-white/30 text-white" />
              {errors.dob && <p className="text-sm text-red-300 mt-1">{errors.dob.message}</p>}
            </div>
          </div>

          {/* Bio */}
          <div>
            <Label className="text-stone-200">Short Bio</Label>
            <Input {...register("bio")} placeholder="Tell us about yourself" className="bg-white/20 border-white/30 text-white" />
          </div>

          {/* Skills */}
          <div>
            <Label className="text-stone-200">Skills</Label>
            <Input {...register("skills")} placeholder="E.g. social media, writing" className="bg-white/20 border-white/30 text-white" />
          </div>

          {/* Preferred Campaigns */}
          <div>
            <Label className="text-stone-200">Preferred Campaigns</Label>
            <Input {...register("preferredCampaigns")} placeholder="E.g. video, survey, affiliate links" className="bg-white/20 border-white/30 text-white" />
          </div>

          {/* Bank Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label className="text-stone-200">Bank</Label>
              <Popover open={open} onOpenChange={setOpen}>
  <PopoverTrigger asChild>
    <Button
      variant="outline"
      role="combobox"
      className="w-full justify-between bg-white/20 border-white/30 text-white"
    >
      {bankCode
        ? banks.find((b) => b.code === bankCode)?.name
        : "Select bank"}
    </Button>
  </PopoverTrigger>
  <PopoverContent
    align="start"
    side="bottom"
    className="w-[300px] max-h-80 overflow-hidden bg-stone-700 text-white p-0 rounded-lg shadow-lg"
  >
    <Command>
      <CommandInput
        placeholder="Search bank..."
        className="text-white placeholder:text-stone-400"
      />
      <CommandList className="max-h-72 overflow-y-auto">
        <CommandEmpty>No bank found.</CommandEmpty>
        <CommandGroup>
          {banks.map((bank, idx) => (
            <CommandItem
              key={`${bank.code}-${bank.name}-${idx}`}
              onSelect={() => {
                setValue("bankCode", bank.code)
                setOpen(false) // ✅ closes dropdown
              }}
            >
              {bank.name}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
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
              {verifying && <p className="text-xs text-amber-400 mt-1">Verifying...</p>}
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
