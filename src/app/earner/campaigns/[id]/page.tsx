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
  DocumentData,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  mediaUrls?: string[];
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
  const [linkProof, setLinkProof] = useState("");
  const [socialHandle, setSocialHandle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
    const dailySubmissionsQuery = query(
      collection(db, "earnerSubmissions"),
      where("userId", "==", userId),
      where("campaignId", "==", campaignId),
      where("createdAt", ">=", today)
    );
    const dailySubmissionsSnap = await getDocs(dailySubmissionsQuery);
    if (dailySubmissionsSnap.size >= (campaignData?.dailyLimit || Infinity)) {
      return false;
    }

    return true;
  };

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "campaigns", id));
        if (!snap.exists()) {
          toast.error("Campaign not found");
          router.back();
          return;
        }
        const data = snap.data() as Campaign;
        setCampaign({ ...data, id: snap.id });
      } catch (err) {
        console.error(err);
        toast.error("Failed to load campaign");
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

  const submitParticipation = async () => {
    const user = auth.currentUser;
    if (!user) return toast.error("You must be logged in to participate");
    if (!campaign) return;

    // Check activation status
    const earnerDoc = await getDoc(doc(db, "earners", user.uid));
    if (!earnerDoc.exists()) return toast.error("Earner profile not found");
    const earnerData = earnerDoc.data() as EarnerData;
    if (!earnerData?.activated) {
      toast.error("You need to activate your account to participate");
      router.push("/earner/activate");
      return;
    }

    // Check if user has already participated
    const submissionsRef = collection(db, "earnerSubmissions");
    const q = query(submissionsRef,
      where("userId", "==", user.uid),
      where("campaignId", "==", campaign.id)
    );
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      toast.error("You have already participated in this campaign");
      return;
    }

    // basic validation depending on campaign type
    const mediaCats = ["Video", "Picture"];
    const linkCats = ["Survey", "Third-Party Task", "App Download"];
    const socialCats = [
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
    ];

    if (mediaCats.includes(campaign.category || "")) {
      if (!file) return toast.error("Attach an image/video proof file");
    } else if (linkCats.includes(campaign.category || "")) {
      if (!linkProof || linkProof.trim().length < 5) return toast.error("Provide a link proof");
    } else if (socialCats.includes(campaign.category || "")) {
      if (!socialHandle || socialHandle.trim().length < 3) return toast.error("Provide your social handle for verification");
    }

    setSubmitting(true);
    try {
      const isValid = await validateDataSync(user.uid, campaign.id);
      if (!isValid) {
        toast.error("Unable to submit - please check campaign status and your limits");
        return;
      }

      let proofUrl = "";
      if (file) proofUrl = await uploadProofFile(file, user.uid);

      const campaignSnap = await getDoc(doc(db, "campaigns", campaign.id));
      if (!campaignSnap.exists()) {
        toast.error("Campaign not found or has been removed");
        return;
      }
      const campaignData = campaignSnap.data() as CampaignData;
      if (campaignData?.status !== "Active") {
        toast.error("This campaign is no longer active");
        return;
      }
      if ((campaignData?.budget || 0) < (campaignData?.costPerLead || 0)) {
        toast.error("Campaign budget has been depleted");
        return;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todaySubmissionsQuery = query(
        collection(db, "earnerSubmissions"),
        where("userId", "==", user.uid),
        where("createdAt", ">=", today)
      );
      const todaySubmissionsSnap = await getDocs(todaySubmissionsQuery);
      if (todaySubmissionsSnap.size >= (campaignData?.dailyLimit || Infinity)) {
        toast.error("You've reached the daily submission limit");
        return;
      }

      await addDoc(collection(db, "earnerSubmissions"), {
        userId: user.uid,
        campaignId: campaign.id,
        campaignTitle: campaign.title || null,
        advertiserName: campaignData?.advertiserName || null,
        advertiserId: campaignData?.ownerId || null,
        category: campaign.category || null,
        note: note || null,
        socialHandle: socialHandle || null,
        proofUrl: proofUrl || linkProof || null,
        status: "Pending",
        createdAt: serverTimestamp(),
        earnerPrice: Math.round((campaign.costPerLead || 0) / 2),
        reviewedAt: null,
        reviewedBy: null,
        rejectionReason: null,
      });

      toast.success("Submission sent. Awaiting review.");
      router.push("/earner/campaigns/done");
    } catch (err) {
      console.error(err);
      toast.error("Failed to submit participation");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-primary-200 via-gold-100 to-primary-300">
      <div className="px-6 py-8 max-w-3xl mx-auto">
        <PageLoader />
      </div>
    </div>
  );

  if (!campaign) return (
    <div className="min-h-screen bg-gradient-to-br from-primary-200 via-gold-100 to-primary-300">
      <div className="px-6 py-8 max-w-3xl mx-auto text-center">
        <p className="text-primary-700">Campaign not found</p>
      </div>
    </div>
  );

  const earnerPrice = Math.round((campaign.costPerLead || 0) / 2);

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-200 via-gold-100 to-primary-300">
      <div className="px-6 py-8 max-w-3xl mx-auto">
        <div className="mb-6 flex items-center gap-3">
          <Button variant="ghost" onClick={() => router.back()} className="hover:bg-white/20">
            <ArrowLeft size={16} className="mr-2" /> Back
          </Button>
          <h1 className="text-2xl font-semibold text-primary-800">{campaign.title}</h1>
        </div>

        <Card className="bg-white/80 backdrop-blur">
          <div className="relative h-48 w-full overflow-hidden rounded-t-lg">
            <div className="absolute inset-0 bg-primary-100">
              <Image
                src={campaign.bannerUrl || "/placeholders/default.jpg"}
                alt={campaign.title || "Campaign banner"}
                fill
                className="object-cover"
              />
            </div>
            <div className="absolute top-3 right-3">
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-white/90 text-primary-800">
                {campaign.category}
              </span>
            </div>
          </div>
          <div className="p-6">
            <p className="text-primary-700">{campaign.description}</p>
            <div className="mt-4 p-4 bg-gold-50 rounded-lg border border-gold-100">
              <div className="text-sm font-medium text-primary-600">You earn per lead</div>
              <div className="text-2xl font-bold text-gold-600">₦{earnerPrice.toLocaleString()}</div>
            </div>
          </div>
        </Card>

        {/* Instructions & proof */}
        <Card className="mt-6 p-6 bg-white/80 backdrop-blur">
          <h3 className="text-xl font-semibold mb-4 text-primary-800">How to participate</h3>
          <div className="space-y-3 text-primary-700">
            {/* Campaign Resources */}
            {(campaign.videoUrl || campaign.externalLink || (campaign.mediaUrls?.length ?? 0) > 0) && (
              <div className="mb-4 p-3 bg-primary-50 rounded border border-primary-100">
                <h4 className="text-lg font-medium mb-2">Campaign Resources:</h4>
                {campaign.videoUrl && (
                  <div className="mb-3">
                    <h5 className="text-sm font-medium mb-2">Campaign Video</h5>
                    <div className="aspect-video relative">
                      <video
                        src={campaign.videoUrl}
                        controls
                        className="w-full h-full rounded"
                        poster={campaign.bannerUrl || undefined}
                      >
                        Your browser does not support the video tag.
                      </video>
                    </div>
                  </div>
                )}
                {campaign.externalLink && (
                  <div className="mb-3">
                    <h5 className="text-sm font-medium mb-2">Campaign Link</h5>
                    <a
                      href={campaign.externalLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gold-600 hover:underline break-all"
                    >
                      {campaign.externalLink}
                    </a>
                  </div>
                )}
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
              </div>
            )}

            {/* Campaign Instructions */}
            {campaign.description ? (
              <div className="p-3 bg-primary-50 rounded border border-primary-100">
                <div className="prose max-w-none">
                  <h4 className="text-lg font-medium mb-2 text-primary-800">Instructions from Advertiser:</h4>
                  <div className="whitespace-pre-wrap text-primary-700">{campaign.description}</div>
                </div>
              </div>
            ) : (
              <>
                <p className="text-primary-700">Follow instructions below depending on campaign type. Provide proof so the advertiser can verify.</p>
                {campaign.category === "Survey" && (
                  <p className="p-3 bg-primary-50 rounded border border-primary-100">
                    Open the survey link and complete it. Paste the completion link or screenshot link as proof below.
                  </p>
                )}
                {campaign.category === "Video" && (
                  <p className="p-3 bg-primary-50 rounded border border-primary-100">
                    Record the requested short video and upload it as proof. (Max file size depends on storage)
                  </p>
                )}
                {campaign.category === "Picture" && (
                  <p className="p-3 bg-primary-50 rounded border border-primary-100">
                    Take a photo as instructed and upload it as proof.
                  </p>
                )}
                {campaign.category === "Third-Party Task" && (
                  <p className="p-3 bg-primary-50 rounded border border-primary-100">
                    Complete external task and provide completion link or screenshot link as proof.
                  </p>
                )}
              </>
            )}
          </div>

          <div className="mt-6 space-y-4">
            <div>
              <label className="text-sm font-medium text-primary-700">Note for advertiser (optional)</label>
              <Textarea
                placeholder="Any additional information you want to share..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="mt-1"
              />
            </div>

            {(campaign.category === "Survey" || campaign.category === "Third-Party Task") && (
              <div>
                <label className="text-sm font-medium text-primary-700">Proof Link</label>
                <Input
                  placeholder="Paste link to completed task..."
                  value={linkProof}
                  onChange={(e) => setLinkProof(e.target.value)}
                  className="mt-1"
                />
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
              <div>
                <label className="text-sm font-medium text-primary-700">Your social handle</label>
                <Input
                  placeholder="e.g. @yourhandle or https://..."
                  value={socialHandle}
                  onChange={(e) => setSocialHandle(e.target.value)}
                  className="mt-1"
                />
                <p className="text-xs text-primary-500 mt-1">We may ask for a link or screenshot as proof.</p>
              </div>
            )}

            {(campaign.category === "Video" || campaign.category === "Picture") && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-primary-700">Upload proof file</label>
                <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-primary-300 border-dashed rounded-lg">
                  <div className="space-y-1 text-center">
                    <div className="text-sm text-primary-600">
                      <label htmlFor="file-upload" className="relative cursor-pointer bg-white rounded-md font-medium text-gold-600 hover:text-gold-500">
                        <span>Upload a file</span>
                        <input
                          id="file-upload"
                          type="file"
                          accept="image/*,video/*"
                          onChange={handleFileSelect}
                          className="sr-only"
                        />
                      </label>
                      <p className="pl-1 text-primary-600">or drag and drop</p>
                    </div>
                    <p className="text-xs text-primary-500">Image or video files</p>
                    {file && <p className="text-sm text-gold-600">{file.name}</p>}
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <Button
                className="flex-1 bg-gold-500 hover:bg-gold-600 text-primary-900 font-medium h-12"
                onClick={submitParticipation}
                disabled={submitting}
              >
                {submitting ? "Submitting..." : `Submit Participation — ₦${earnerPrice}`}
              </Button>
              <Button
                variant="outline"
                onClick={() => router.push("/earner/campaigns")}
                className="hover:bg-primary-100"
              >
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
