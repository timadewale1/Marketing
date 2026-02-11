"use client";

import React, { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { auth, db, storage } from "@/lib/firebase";
import {
  doc,
  getDoc,
  getDocs,
  addDoc,
  collection,
  query,
  where,
  serverTimestamp,
  runTransaction,
  increment,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PaymentSelector } from '@/components/payment-selector'
import { ArrowLeft } from "lucide-react";
import toast from "react-hot-toast";
import { PageLoader } from "@/components/ui/loader";
import Image from "next/image";

type Campaign = {
  id: string;
  title?: string;
  category?: string;
  description?: string;
  bannerUrl?: string;
  costPerLead?: number;
  budget?: number;
  reward?: number;
  externalLink?: string;
  videoUrl?: string;
  mediaUrl?: string; // Single media URL
  mediaUrls?: string[]; // Legacy: multiple media URLs
  productImages?: string[]; // Product images for "Share my Product" category
  status?: string;
  dailyLimit?: number;
  locationRequirements?: string;
  ageRequirements?: string;
  goal?: string;
  advertiserName?: string;
  ownerId?: string;
};

// Firestore document payload for campaigns (no id)
type CampaignData = Omit<Campaign, "id">;

// Minimal shape of an earner document used in this file
type EarnerData = {
  activated?: boolean;
};

export default function CampaignDetailPage() {
  const router = useRouter();
  const path = usePathname();
  const id = path.split("/").pop() || "";

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);

  // participation fields
  const [note, setNote] = useState("");
  const [socialHandle, setSocialHandle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showActivationPaymentSelector, setShowActivationPaymentSelector] = useState(false);

  // Helper function to validate data sync
  const validateDataSync = async (userId: string, campaignId: string) => {
    const campaignRef = doc(db, "campaigns", campaignId);
    const earnerRef = doc(db, "earners", userId);
    const [campaignSnap, earnerSnap] = await Promise.all([
      getDoc(campaignRef),
      getDoc(earnerRef),
    ]);

    if (!campaignSnap.exists() || !earnerSnap.exists()) {
      return false;
    }

    const campaignData = campaignSnap.data() as CampaignData;
    const earner = earnerSnap.data() as EarnerData;

    // Check if user is activated
    if (!earner?.activated) {
      return false;
    }

    // Check if campaign is active and has budget
    if (campaignData?.status !== "Active" || (campaignData?.budget || 0) < (campaignData?.costPerLead || 0)) {
      return false;
    }

    // Check daily limits
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // First check if user has submitted this campaign at all
    // Avoid composite-index queries by querying by userId only and filtering client-side
    const userSubmissionsQuery = query(
      collection(db, "earnerSubmissions"),
      where("userId", "==", userId)
    );
    const userSubmissionsSnap = await getDocs(userSubmissionsQuery);
    const hasSubmittedForCampaign = userSubmissionsSnap.docs.some((d) => {
      const dd = d.data() as unknown
      const campaignField = (dd as { campaignId?: unknown }).campaignId
      return String(campaignField ?? '') === String(campaignId)
    })
    if (hasSubmittedForCampaign) {
      // User has already submitted this campaign
      return false;
    }

    // Then check daily limits separately
    // Check daily limits: query by userId and filter createdAt client-side to avoid index requirements
    const dailyByUserQuery = query(collection(db, "earnerSubmissions"), where("userId", "==", userId))
    const dailyByUserSnap = await getDocs(dailyByUserQuery)
    const todayTime = today.getTime()
    const submissionsToday = dailyByUserSnap.docs.filter((d) => {
      const dd = d.data() as unknown
      const createdAt = (dd as { createdAt?: unknown }).createdAt
      if (!createdAt) return false
      // createdAt could be Firestore Timestamp, JS Date, or object with seconds
      const maybeWithToDate = createdAt as { toDate?: () => Date }
      if (maybeWithToDate.toDate && typeof maybeWithToDate.toDate === 'function') {
        return maybeWithToDate.toDate().getTime() >= todayTime
      }
      const maybeSeconds = createdAt as { seconds?: number }
      if (maybeSeconds && typeof maybeSeconds.seconds === 'number') {
        return (maybeSeconds.seconds * 1000) >= todayTime
      }
      const parsed = Date.parse(String(createdAt))
      if (!isNaN(parsed)) return parsed >= todayTime
      return false
    }).length
    if (submissionsToday >= (campaignData?.dailyLimit || Infinity)) {
      return false
    }

    return true;
  };

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "campaigns", id));
        if (!snap.exists()) {
          toast.error("Task not found");
          router.back();
          return;
        }
        const data = snap.data() as Campaign;
        setCampaign({ ...data, id: snap.id });
      } catch (err) {
        console.error(err);
        toast.error("Failed to load task");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, router]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
  };

  const uploadProofFile = async (file: File, uid: string) => {
    const storageRef = ref(storage, `earnerSubmissions/${uid}/${Date.now()}-${file.name}`);
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);
    return url;
  };

  // Open payment selector with Monnify only (Paystack disabled)
  const handleActivation = async () => {
    setShowActivationPaymentSelector(true)
  }

  const submitParticipation = async () => {
    const user = auth.currentUser;
    if (!user) return toast.error("You must be logged in to participate");
    if (!campaign) return;

    // Check activation status
    const earnerDoc = await getDoc(doc(db, "earners", user.uid));
    if (!earnerDoc.exists()) return toast.error("Earner profile not found");
    const earnerData = earnerDoc.data() as EarnerData;
    if (!earnerData?.activated) {
      handleActivation(); // Open Monnify modal for activation (Paystack disabled)
      return;
    }

    console.log("Checking previous submissions...");
    // Check if user has already participated (avoid composite-index queries)
    try {
      const userSubQ = query(collection(db, "earnerSubmissions"), where("userId", "==", user.uid))
      const userSubs = await getDocs(userSubQ)
      const already = userSubs.docs.some((d) => {
        const dd = d.data() as Record<string, unknown>
        return String(dd['campaignId'] || '') === String(campaign.id)
      })
      if (already) {
        console.log("Found existing submission")
        toast.error("You have already participated in this task")
        return
      }
    } catch (queryError) {
      console.error("Error checking submissions:", queryError)
      toast.error("Error checking previous submissions")
      return
    }

  // basic validation depending on task type
  // Always require a screenshot for proof
    if (!file) {
      return toast.error("Please attach a screenshot as proof of completion");
    }

  // For social tasks, also require the social handle
    if ([
      "Instagram Follow",
      "Instagram Like", 
      "Instagram Share",
      "Twitter Follow",
      "Twitter Retweet",
      "Facebook Like", 
      "Facebook Share",
      "TikTok Follow",
      "TikTok Like",
      "TikTok Share",
      "YouTube Subscribe",
      "YouTube Like",
      "YouTube Comment"
    ].includes(campaign.category || "")) {
      if (!socialHandle || socialHandle.trim().length < 3) {
        return toast.error("Please provide your social handle for verification");
      }
    }

    setSubmitting(true);
    try {
      // Log current state
      console.log("Starting submission with file:", file?.name);
      
      const isValid = await validateDataSync(user.uid, campaign.id);
      if (!isValid) {
        console.log("Data sync validation failed");
        toast.error("Unable to submit - please check task status and your limits");
        return;
      }

      let proofUrl = "";
      if (file) {
        console.log("Uploading proof file...");
        try {
          proofUrl = await uploadProofFile(file, user.uid);
          console.log("File uploaded successfully:", proofUrl);
        } catch (uploadErr) {
          console.error("File upload error:", uploadErr);
          toast.error("Failed to upload proof file. Please try again.");
          return;
        }
      }

  console.log("Checking task status...");
  const campaignSnap = await getDoc(doc(db, "campaigns", campaign.id));
      if (!campaignSnap.exists()) {
        console.log("Task not found");
        toast.error("Task not found or has been removed");
        return;
      }
      const campaignData = campaignSnap.data() as CampaignData;
      if (campaignData?.status !== "Active") {
        toast.error("This task is no longer active");
        return;
      }
      if ((campaignData?.budget || 0) < (campaignData?.costPerLead || 0)) {
        toast.error("Task budget has been depleted");
        return;
      }

      const userSubsSnap = await getDocs(
  query(
    collection(db, "earnerSubmissions"),
    where("userId", "==", user.uid)
  )
);

const today = new Date();
today.setHours(0, 0, 0, 0);
const todayTime = today.getTime();

const todayCount = userSubsSnap.docs.filter((d) => {
  const createdAt = d.data().createdAt;
  if (!createdAt) return false;

  if (createdAt.toDate) {
    return createdAt.toDate().getTime() >= todayTime;
  }

  if (createdAt.seconds) {
    return createdAt.seconds * 1000 >= todayTime;
  }

  return false;
}).length;

if (todayCount >= (campaignData?.dailyLimit || Infinity)) {
  toast.error("You've reached the daily submission limit");
  return;
}

      console.log("Creating submission document...");
      try {
        const submissionData = {
          userId: user.uid,
          campaignId: campaign.id,
          campaignTitle: campaign.title || null,
          advertiserName: campaignData?.advertiserName || null,
          advertiserId: campaignData?.ownerId || null,
          category: campaign.category || null,
          note: note || null,
          socialHandle: socialHandle || null,
          proofUrl: proofUrl || null,
          status: "Pending",
          createdAt: serverTimestamp(),
          earnerPrice: (campaign.category === "Video") ? 150 : Math.round((campaign.costPerLead || 0) / 2),
          // reservedAmount will be set within a transaction to reserve campaign funds
          reservedAmount: 0,
          reviewedAt: null,
          reviewedBy: null,
          rejectionReason: null,
        };
        // Create submission and reserve campaign funds atomically
        const submissionsCol = collection(db, "earnerSubmissions");
        const newSubRef = doc(submissionsCol);
        const fullAmount = submissionData.earnerPrice * 2;

        try {
          await runTransaction(db, async (t) => {
            const campaignRef = doc(db, "campaigns", campaign.id);
            const cSnap = await t.get(campaignRef);
            if (!cSnap.exists()) throw new Error('Task not found during reservation');
            const cData = cSnap.data() as CampaignData;
            const available = Number(cData.budget || 0);
            if (available < fullAmount) throw new Error('Insufficient campaign budget to reserve funds');

            // decrement available budget and increment reservedBudget
            t.update(campaignRef, {
              budget: increment(-fullAmount),
              reservedBudget: increment(fullAmount),
            });

            // set reservedAmount on the submission
            t.set(newSubRef, {
              ...submissionData,
              reservedAmount: fullAmount,
              createdAt: serverTimestamp(),
            });
          });
          console.log('Submission created with reservation');
        } catch (txErr) {
          console.error('Reservation transaction failed', txErr);
          throw txErr;
        }

        // Notify admin of new submission
        try {
          await addDoc(collection(db, "adminNotifications"), {
            type: 'submission_created',
            title: 'New task submission',
            body: `${submissionData.campaignTitle || 'A campaign'} has a new submission from ${user.uid}`,
            link: `/admin/submissions`,
            userId: user.uid,
            submissionId: newSubRef.id,
            campaignId: submissionData.campaignId,
            read: false,
            createdAt: serverTimestamp(),
          })
        } catch (noteErr) {
          console.error('Failed to notify admin of submission:', noteErr)
        }

        toast.success("Submission sent. Awaiting review.");
        router.push("/earner/campaigns/done");
      } catch (submitError) {
        console.error("Error creating submission:", submitError);
        throw submitError; // Re-throw to be caught by outer catch block
      }
    } catch (err) {
      console.error("Submission error details:", err);
      if (err instanceof Error) {
        toast.error(`Failed to submit: ${err.message}`);
      } else {
        toast.error("Failed to submit participation");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-stone-200 via-amber-100 to-stone-300">
      <div className="px-6 py-8 max-w-3xl mx-auto">
        <PageLoader />
      </div>
    </div>
  );

  if (!campaign) return (
    <div className="min-h-screen bg-gradient-to-br from-stone-200 via-amber-100 to-stone-300">
      <div className="px-6 py-8 max-w-3xl mx-auto text-center">
  <p className="text-stone-700">Task not found</p>
      </div>
    </div>
  );

  const earnerPrice = campaign.category === "Video" ? 150 : Math.round((campaign.costPerLead || 0) / 2);

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-200 via-amber-100 to-stone-300">
      <div className="px-6 py-8 max-w-3xl mx-auto">
        <div className="mb-6 flex items-center gap-3">
          <Button variant="ghost" onClick={() => router.back()} className="hover:bg-white/20">
            <ArrowLeft size={16} className="mr-2" /> Back
          </Button>
          <h1 className="text-2xl font-semibold text-stone-800">{campaign.title}</h1>
        </div>

        <Card className="bg-white/70 backdrop-blur border-none shadow-md hover:shadow-lg transition-all">
          <div className="relative h-48 w-full overflow-hidden rounded-t-lg">
            <div className="absolute inset-0 bg-stone-100">
              <Image
                src={campaign.bannerUrl || "/placeholders/default.jpg"}
                alt={campaign.title || "Task banner"}
                fill
                className="object-cover"
              />
            </div>
            <div className="absolute top-3 right-3">
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-white/90 text-stone-800">
                {campaign.category}
              </span>
            </div>
          </div>
          <div className="p-6">
            <p className="text-stone-700">{campaign.description}</p>
            <div className="mt-4 p-4 bg-amber-50 rounded-lg border border-amber-100">
              <div className="text-sm font-medium text-stone-600">You earn per lead</div>
              <div className="text-2xl font-bold text-amber-600">₦{earnerPrice.toLocaleString()}</div>
            </div>
          </div>
        </Card>

        {/* Instructions & proof */}
        <Card className="mt-6 p-6 bg-white/70 backdrop-blur border-none shadow-md hover:shadow-lg transition-all">
          <h3 className="text-xl font-semibold mb-4 text-stone-800">How to participate</h3>
          <div className="space-y-3 text-stone-700">
            {/* Campaign Resources */}
            {(campaign.videoUrl || campaign.externalLink || campaign.mediaUrl || (campaign.mediaUrls?.length ?? 0) > 0) && (
              <div className="mb-4 p-3 bg-amber-50 rounded border border-amber-100">
                <h4 className="text-lg font-medium mb-2">Task Resources:</h4>
                
                {/* Video content */}
                {campaign.videoUrl && (
                  <div className="mb-3">
                    <h5 className="text-sm font-medium mb-2">Task Video</h5>
                    {campaign.videoUrl.includes('youtube.com') || campaign.videoUrl.includes('youtu.be') ? (
                      <div className="space-y-3">
                        {(() => {
                          const getYouTubeVideoId = (url: string) => {
                            const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
                            const match = url.match(regExp);
                            return (match && match[2].length === 11) ? match[2] : null;
                          };
                          
                          const videoId = getYouTubeVideoId(campaign.videoUrl);
                          return videoId ? (
                            <iframe
                              src={`https://www.youtube.com/embed/${videoId}`}
                              className="w-full aspect-video rounded-lg"
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              allowFullScreen
                            />
                          ) : null;
                        })()}
                        <div className="p-3 bg-white/50 rounded-lg border border-amber-100">
                          <p className="text-stone-700 mb-2">Video URL:</p>
                          <a 
                            href={campaign.videoUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-amber-600 hover:underline break-all"
                          >
                            {campaign.videoUrl}
                          </a>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="p-3 bg-white/50 rounded-lg border border-amber-100">
                          <p className="text-stone-700 mb-2">Video URL:</p>
                          <a 
                            href={campaign.videoUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-amber-600 hover:underline break-all"
                          >
                            {campaign.videoUrl}
                          </a>
                        </div>
                        <div className="text-sm text-stone-600 bg-amber-50 p-3 rounded-lg">
                          Click the link above to watch the video in a new tab
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* External/Product Links */}
                {campaign.externalLink && (
                  <div className="mb-3">
                    <h5 className="text-sm font-medium mb-2">
                      {campaign.category === 'Advertise Product' ? 'Product Link' : 'Task Link'}
                    </h5>
                    <a
                      href={campaign.externalLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-600 hover:underline break-all"
                    >
                      {campaign.externalLink}
                    </a>
                  </div>
                )}

                {/* Media URL from newer campaigns */}
                {campaign.mediaUrl && (
                  <div className="mb-3">
                    <h5 className="text-sm font-medium mb-2">Task Media</h5>
                    <div className="aspect-square relative overflow-hidden rounded max-w-md mx-auto">
                      {(() => {
                        const url = campaign.mediaUrl || '';
                        const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
                        // If it's a YouTube link, render an iframe embed instead of an image
                        if (isYouTube) {
                          const getYouTubeVideoId = (u: string) => {
                            const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
                            const match = u.match(regExp);
                            return (match && match[2].length === 11) ? match[2] : null;
                          };
                          const vid = getYouTubeVideoId(url);
                          return vid ? (
                            <iframe
                              src={`https://www.youtube.com/embed/${vid}`}
                              className="w-full h-full rounded-lg"
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              allowFullScreen
                            />
                          ) : (
                            <a href={url} target="_blank" rel="noopener noreferrer" className="text-amber-600 break-all">{url}</a>
                          );
                        }

                        // If it looks like an image URL, render with next/image
                        try {
                          const u = new URL(url);
                          const pathname = u.pathname || '';
                          const ext = pathname.split('.').pop()?.toLowerCase() || '';
                          if (['jpg','jpeg','png','webp','gif','bmp','svg'].includes(ext)) {
                            return (
                              <Image src={url} alt="Task media" fill className="object-contain" />
                            );
                          }
                        } catch {
                          // ignore invalid URL and fallthrough
                        }

                        // Fallback: show a clickable link
                        return (
                          <a href={url} target="_blank" rel="noopener noreferrer" className="text-amber-600 break-all">{url}</a>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {/* Legacy media URLs */}
                {(campaign.mediaUrls?.length ?? 0) > 0 && (
                  <div>
                    <h5 className="text-sm font-medium mb-2">Additional Resources</h5>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {(campaign.mediaUrls || []).map((url, i) => (
                        <div key={i} className="aspect-square relative overflow-hidden rounded">
                          <Image
                            src={url}
                            alt={`Resource ${i + 1}`}
                            fill
                            className="object-cover"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Product Images for "Share my Product" category */}
                {(campaign.productImages?.length ?? 0) > 0 && (
                  <div className="mt-6 p-4 bg-white/80 rounded-lg border border-amber-100">
                    <h5 className="text-sm font-medium mb-4 text-stone-800">Product Images</h5>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      {(campaign.productImages || []).map((imgUrl, idx) => (
                        <div key={idx} className="space-y-2">
                          <div className="aspect-square relative overflow-hidden rounded-lg border border-stone-200">
                            <Image
                              src={imgUrl}
                              alt={`Product ${idx + 1}`}
                              fill
                              className="object-cover hover:scale-105 transition-transform"
                            />
                          </div>
                          <a
                            href={imgUrl}
                            download
                            target="_blank"
                            rel="noreferrer"
                            className="block text-xs text-center text-amber-600 hover:text-amber-700 font-medium"
                          >
                            Download
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Task Instructions */}
            {campaign.description ? (
              <div className="p-3 bg-amber-50 rounded border border-amber-100">
                <div className="prose max-w-none">
                  <h4 className="text-lg font-medium mb-2 text-stone-800">Instructions from Advertiser:</h4>
                  <div className="whitespace-pre-wrap text-stone-700">{campaign.description}</div>
                </div>
              </div>
            ) : (
              <>
                <p className="text-stone-700">Follow the instructions below to complete the task and provide proof for verification.</p>
                <div className="p-3 bg-amber-50 rounded border border-amber-100 space-y-3">
                  <p className="font-medium text-stone-800">Required for all tasks:</p>
                  <ul className="list-disc pl-4 text-stone-700 space-y-2">
                    <li>Complete the task as instructed</li>
                    <li>Take a clear screenshot showing proof of completion</li>
                    <li>Upload the screenshot using the form below</li>
                  </ul>
                  {["Instagram Follow", "Instagram Like", "Instagram Share",
                    "Twitter Follow", "Twitter Retweet", "Facebook Like",
                    "Facebook Share", "TikTok Follow", "TikTok Like",
                    "TikTok Share", "YouTube Subscribe", "YouTube Like",
                    "YouTube Comment"].includes(campaign.category || "") && (
                    <div className="mt-4">
                      <p className="font-medium text-stone-800">For social media tasks:</p>
                      <p className="text-stone-700">Also provide your social media handle for verification</p>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Views requirement for status shares (Instagram/WhatsApp) */}
            {[
              "Instagram Share",
              "WhatsApp Status",
              "Whatsapp Status",
              "WhatsApp status",
            ].includes(campaign.category || "") && (
              <div className="mt-4 p-3 bg-amber-50 rounded border border-amber-100">
                <p className="text-sm text-stone-700">
                  for any task that is stated for you to share via whatsapp status or instagram status, ensure that you have up to 50 views before taking the proof screenshot and submitting; if not it will not be approved as completed
                </p>
              </div>
            )}

              {/* General requirement for share or product tasks */}
              {(() => {
                const cat = (campaign.category || '').toLowerCase()
                if (cat.includes('share') || cat.includes('product') || cat.includes('link')) {
                  return (
                    <div className="mt-4 p-3 bg-amber-50 rounded border border-amber-100">
                      <p className="text-sm text-stone-700">Any task that has to do with sharing links or product must have up to 50 views on wherever it is shared to before submission of proof or it will not be approved.</p>
                    </div>
                  )
                }
                return null
              })()}
          </div>

          <div className="mt-6 space-y-4">
            <div>
              <label className="text-sm font-medium text-stone-700">Note for advertiser (optional)</label>
              <Textarea
                placeholder="Any additional information you want to share..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="mt-1"
              />
            </div>

            {/* Always show upload field for proof (required for all tasks) */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-stone-700">Upload proof screenshot</label>
              <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-amber-300 border-dashed rounded-lg">
                <div className="space-y-1 text-center">
                  <div className="text-sm text-stone-600">
                    <label htmlFor="proof-screenshot-upload" className="relative cursor-pointer bg-stone-50 rounded-md font-medium text-amber-600 hover:text-amber-500 px-3 py-1">
                      <span>Upload screenshot</span>
                      <input
                        id="proof-screenshot-upload"
                        type="file"
                        accept="image/*,video/*"
                        onChange={handleFileSelect}
                        className="sr-only"
                      />
                    </label>
                    <p className="pl-1 text-stone-600">or drag and drop</p>
                  </div>
                  <p className="text-xs text-stone-500">A clear screenshot or image of completion</p>
                  {file && <p className="text-sm text-amber-600">{file.name}</p>}
                </div>
              </div>
            </div>

            {[
              "Instagram Follow",
              "Instagram Like",
              "Instagram Share",
              "Twitter Follow",
              "Twitter Retweet",
              "Facebook Like",
              "Facebook Share",
              "TikTok Follow",
              "TikTok Like",
              "TikTok Share",
              "YouTube Subscribe",
              "YouTube Like",
              "YouTube Comment",
            ].includes(campaign.category || "") && (
              <div>
                <label className="text-sm font-medium text-stone-700">Your social handle</label>
                <Input
                  placeholder="e.g. @yourhandle or https://..."
                  value={socialHandle}
                  onChange={(e) => setSocialHandle(e.target.value)}
                  className="mt-1"
                />
                <p className="text-xs text-stone-500 mt-1">We may ask for a link or screenshot as proof.</p>
              </div>
            )}

            {(campaign.category === "Video" || campaign.category === "Picture") && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-stone-700">Upload proof file</label>
                <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-amber-300 border-dashed rounded-lg">
                  <div className="space-y-1 text-center">
                    <div className="text-sm text-stone-600">
                      <label htmlFor="file-upload" className="relative cursor-pointer bg-white rounded-md font-medium text-amber-600 hover:text-amber-500">
                        <span>Upload a file</span>
                        <input
                          id="file-upload"
                          type="file"
                          accept="image/*,video/*"
                          onChange={handleFileSelect}
                          className="sr-only"
                        />
                      </label>
                      <p className="pl-1 text-stone-600">or drag and drop</p>
                    </div>
                    <p className="text-xs text-stone-500">Image or video files</p>
                    {file && <p className="text-sm text-amber-600">{file.name}</p>}
                  </div>
                </div>
              </div>
            )}

              {[
                "Instagram Follow",
                "Instagram Like",
                "Instagram Share",
                "Twitter Follow",
                "Twitter Retweet",
                "Facebook Like",
                "Facebook Share",
                "TikTok Follow",
                "TikTok Like",
                "TikTok Share",
                "YouTube Subscribe",
                "YouTube Like",
                "YouTube Comment",
              ].includes(campaign.category || "") && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-stone-700">Upload proof screenshot</label>
                  <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-amber-300 border-dashed rounded-lg">
                    <div className="space-y-1 text-center">
                      <div className="text-sm text-stone-600">
                        <label htmlFor="social-screenshot-upload" className="relative cursor-pointer bg-stone-50 rounded-md font-medium text-amber-600 hover:text-amber-500 px-3 py-1">
                          <span>Upload screenshot</span>
                          <input
                            id="social-screenshot-upload"
                            type="file"
                            accept="image/*,video/*"
                            onChange={handleFileSelect}
                            className="sr-only"
                          />
                        </label>
                        <p className="pl-1 text-stone-600">or drag and drop</p>
                      </div>
                      <p className="text-xs text-stone-500">Screenshot showing your social handle and proof of task completion</p>
                      {file && <p className="text-sm text-amber-600">{file.name}</p>}
                    </div>
                  </div>
                </div>
              )}

            <div className="flex gap-3 pt-4">
              <Button
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-stone-900 font-medium h-12"
                onClick={submitParticipation}
                disabled={submitting}
              >
                {submitting ? "Submitting..." : `Submit Participation - ₦${earnerPrice}`}
              </Button>
              <Button
                variant="outline"
                onClick={() => router.push("/earner/campaigns")}
                className="hover:bg-stone-100"
              >
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      </div>
        {showActivationPaymentSelector && (
          <PaymentSelector
            open={showActivationPaymentSelector}
            amount={2000}
            email={auth.currentUser?.email || undefined}
            fullName={auth.currentUser?.displayName || 'Earner'}
            description="Earner Account Activation"
            onClose={() => setShowActivationPaymentSelector(false)}
            onPaymentSuccess={async (reference: string, provider: 'paystack' | 'monnify') => {
              setShowActivationPaymentSelector(false)
              try {
                const res = await fetch('/api/earner/activate', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ reference, userId: auth.currentUser?.uid, provider }),
                })
                if (res.ok) {
                  toast.success('Account activated successfully!')
                  await submitParticipation()
                } else {
                  const data = await res.json().catch(() => ({}))
                  toast.error(data?.message || 'Activation verification failed')
                }
              } catch (err) {
                console.error('Activation error', err)
                toast.error('Activation failed')
              }
            }}
          />
        )}
    </div>
  );
}
