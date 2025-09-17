"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import toast from "react-hot-toast"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { db, storage, auth } from "@/lib/firebase"
import { collection, addDoc, serverTimestamp } from "firebase/firestore"
import { ref, uploadBytes, getDownloadURL } from "firebase/storage"

// ✅ Validation schema
const formSchema = z.object({
  name: z.string().min(3, "Campaign name is too short"),
  budget: z.string().regex(/^\d+$/, "Enter a valid amount"),
  startDate: z.string().nonempty("Start date is required"),
  endDate: z.string().nonempty("End date is required"),
  description: z.string().min(10, "Description must be at least 10 characters"),
})

type FormData = z.infer<typeof formSchema>

export default function CreateCampaignPage() {
  const [loading, setLoading] = useState(false)
  const [image, setImage] = useState<File | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
  })

  const onSubmit = async (data: FormData) => {
    if (!image) {
      toast.error("Please upload a campaign banner")
      return
    }

    setLoading(true)
    try {
      const user = auth.currentUser
      if (!user) {
        toast.error("Not authenticated")
        return
      }

      // ✅ Upload banner to Firebase Storage
      const imageRef = ref(
        storage,
        `campaigns/${user.uid}/${Date.now()}_${image.name}`
      )
      await uploadBytes(imageRef, image)
      const imageUrl = await getDownloadURL(imageRef)

      // ✅ Save campaign to Firestore
      const campaignsRef = collection(db, "advertisers", user.uid, "campaigns")
      await addDoc(campaignsRef, {
        name: data.name,
        budget: parseInt(data.budget),
        startDate: data.startDate,
        endDate: data.endDate,
        description: data.description,
        imageUrl,
        status: "Active",
        createdAt: serverTimestamp(),
      })

      toast.success("Campaign created successfully!")
    } catch (err) {
      console.error(err)
      toast.error("Failed to create campaign")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <Card className="shadow-lg rounded-2xl border border-stone-200">
        <CardHeader>
          <CardTitle className="text-stone-800 text-2xl font-bold">
            Create Campaign
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Campaign Name */}
            <div>
              <Label className="text-stone-700">Campaign Name</Label>
              <Input
                type="text"
                placeholder="Enter campaign name"
                {...register("name")}
                className="mt-1"
              />
              {errors.name && (
                <p className="text-sm text-red-500 mt-1">
                  {errors.name.message}
                </p>
              )}
            </div>

            {/* Budget */}
            <div>
              <Label className="text-stone-700">Budget (₦)</Label>
              <Input
                type="number"
                placeholder="Enter budget"
                {...register("budget")}
                className="mt-1"
              />
              {errors.budget && (
                <p className="text-sm text-red-500 mt-1">
                  {errors.budget.message}
                </p>
              )}
            </div>

            {/* Dates */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label className="text-stone-700">Start Date</Label>
                <Input type="date" {...register("startDate")} />
                {errors.startDate && (
                  <p className="text-sm text-red-500 mt-1">
                    {errors.startDate.message}
                  </p>
                )}
              </div>
              <div>
                <Label className="text-stone-700">End Date</Label>
                <Input type="date" {...register("endDate")} />
                {errors.endDate && (
                  <p className="text-sm text-red-500 mt-1">
                    {errors.endDate.message}
                  </p>
                )}
              </div>
            </div>

            {/* Upload Image */}
            <div>
              <Label className="text-stone-700">Campaign Banner</Label>
              <Input
                type="file"
                accept="image/*"
                onChange={(e) =>
                  setImage(e.target.files ? e.target.files[0] : null)
                }
              />
              {image && (
                <p className="text-sm text-stone-600 mt-1">
                  Selected: {image.name}
                </p>
              )}
            </div>

            {/* Description */}
            <div>
              <Label className="text-stone-700">Description</Label>
              <Textarea
                rows={4}
                placeholder="Write campaign description..."
                {...register("description")}
                className="mt-1"
              />
              {errors.description && (
                <p className="text-sm text-red-500 mt-1">
                  {errors.description.message}
                </p>
              )}
            </div>

            {/* Submit */}
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-amber-500 text-stone-900 hover:bg-amber-600 font-semibold"
            >
              {loading ? "Creating..." : "Create Campaign"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
