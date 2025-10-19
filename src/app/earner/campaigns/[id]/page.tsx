"use client";

import React, { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { auth, db, storage } from "@/lib/firebase";
import {
  doc,
  getDoc,
  addDoc,
  collection,
  serverTimestamp,
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
  title: string;
  category?: string;
  description?: string;
  bannerUrl?: string;
  costPerLead?: number;
  budget?: number;
  reward?: number;
  externalLink?: string;
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

  useEffect(() => {
    if (!id) return;
    (async () => {
      const snap = await getDoc(doc(db, "campaigns", id));
      if (!snap.exists()) {
        toast.error("Campaign not found");
        router.back();
        return;
      }
  const data = snap.data() as Campaign;
  setCampaign({ ...data, id: snap.id });
      setLoading(false);
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
    // basic validation depending on campaign type
    // Validate by category
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
      // social proof can be a link as well (optional)
    }

    setSubmitting(true);
    try {
      // upload file if present
      let proofUrl = "";
      if (file) {
        proofUrl = await uploadProofFile(file, user.uid);
      }

      // create submission document — admin will verify
      await addDoc(collection(db, "earnerSubmissions"), {
        userId: user.uid,
        campaignId: campaign.id,
        campaignTitle: campaign.title,
        category: campaign.category || null,
        note: note || null,
        socialHandle: socialHandle || null,
        proofUrl: proofUrl || linkProof || null,
        status: "Pending",
        createdAt: serverTimestamp(),
        earnerPrice: Math.round((campaign.costPerLead || 0) / 2),
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
    <div className="min-h-screen bg-gradient-to-br from-stone-200 via-amber-100 to-stone-300">
      <div className="px-6 py-8 max-w-3xl mx-auto">
        <PageLoader />
      </div>
    </div>
  );
  
  if (!campaign) return (
    <div className="min-h-screen bg-gradient-to-br from-stone-200 via-amber-100 to-stone-300">
      <div className="px-6 py-8 max-w-3xl mx-auto text-center">
        <p className="text-stone-600">Campaign not found</p>
      </div>
    </div>
  );

  // Calculate earner price as half of cost per lead
  const earnerPrice = Math.round((campaign.costPerLead || 0) / 2);

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-200 via-amber-100 to-stone-300">
      <div className="px-6 py-8 max-w-3xl mx-auto">
        <div className="mb-6 flex items-center gap-3">
          <Button variant="ghost" onClick={() => router.back()} className="hover:bg-white/20">
            <ArrowLeft size={16} className="mr-2" /> Back
          </Button>
          <h1 className="text-2xl font-semibold text-stone-800">{campaign.title}</h1>
        </div>

        <Card className="bg-white/80 backdrop-blur">
          <div className="relative h-48 w-full overflow-hidden rounded-t-lg">
            <div className="absolute inset-0 bg-stone-100">
              <Image
                src={campaign.bannerUrl || "/placeholders/default.jpg"}
                alt={campaign.title}
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
        <Card className="mt-6 p-6 bg-white/80 backdrop-blur">
          <h3 className="text-xl font-semibold mb-4 text-stone-800">How to participate</h3>
          <div className="space-y-3 text-stone-700">
            {campaign.description ? (
              <div className="p-3 bg-stone-50 rounded border border-stone-100">
                <div dangerouslySetInnerHTML={{ __html: campaign.description }} />
              </div>
            ) : (
              <>
                <p>Follow instructions below depending on campaign type. Provide proof so the advertiser can verify.</p>
                {campaign.category === "Survey" && (
                  <p className="p-3 bg-stone-50 rounded border border-stone-100">
                    Open the survey link and complete it. Paste the completion link or screenshot link as proof below.
                  </p>
                )}
                {campaign.category === "Video" && (
                  <p className="p-3 bg-stone-50 rounded border border-stone-100">
                    Record the requested short video and upload it as proof. (Max file size depends on storage)
                  </p>
                )}
                {campaign.category === "Picture" && (
                  <p className="p-3 bg-stone-50 rounded border border-stone-100">
                    Take a photo as instructed and upload it as proof.
                  </p>
                )}
                {campaign.category === "Third-Party Task" && (
                  <p className="p-3 bg-stone-50 rounded border border-stone-100">
                    Complete external task and provide completion link or screenshot link as proof.
                  </p>
                )}
              </>
            )}
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
            
            {(campaign.category === "Survey" || campaign.category === "Third-Party Task") && (
              <div>
                <label className="text-sm font-medium text-stone-700">Proof Link</label>
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
                <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-stone-300 border-dashed rounded-lg">
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
                      <p className="pl-1">or drag and drop</p>
                    </div>
                    <p className="text-xs text-stone-500">Image or video files</p>
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
                {submitting ? "Submitting..." : `Submit Participation — ₦${earnerPrice}`}
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
    </div>
  );
}
