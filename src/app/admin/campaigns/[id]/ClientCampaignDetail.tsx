"use client";

import React, { useEffect, useState } from "react";
import { doc, getDoc, updateDoc, increment } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import toast from "react-hot-toast";

interface Props {
  id: string
}

type CampaignAdmin = {
  id?: string
  title?: string
  name?: string
  status?: string
  budget?: number
  reservedBudget?: number
  earnerPrice?: number
  costPerLead?: number
  description?: string
  proofInstructions?: string
  ownerId?: string
}

type Advertiser = {
  id?: string
  name?: string
  email?: string
}

export default function ClientCampaignDetail({ id }: Props) {
  const [loading, setLoading] = useState(true)
  const [campaign, setCampaign] = useState<CampaignAdmin | null>(null)
  const [advertiser, setAdvertiser] = useState<Advertiser | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const cRef = doc(db, "campaigns", id);
      const cSnap = await getDoc(cRef);
      if (!cSnap.exists()) {
        setCampaign(null)
        setLoading(false)
        return
      }
      const cData = cSnap.data() as CampaignAdmin
      setCampaign({ ...cData, id: cSnap.id })

      // fetch advertiser
      if (cData.ownerId) {
        const ownerId = String(cData.ownerId)
        const aSnap = await getDoc(doc(db, "advertisers", ownerId))
        if (aSnap.exists()) setAdvertiser({ ...(aSnap.data() as Advertiser), id: aSnap.id })
      }

      setLoading(false);
    };

    load();
  }, [id]);

  const setStatus = async (newStatus: string) => {
    try {
      const cRef = doc(db, "campaigns", id);
      await updateDoc(cRef, { status: newStatus });
      setCampaign((s) => (s ? { ...s, status: newStatus } : s));
      toast.success(`Campaign set to ${newStatus}`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to update campaign status");
    }
  };

  const deleteCampaign = async () => {
    try {
      if (!campaign) return;
      const cRef = doc(db, "campaigns", id);
      // mark deleted so other logic can handle refunds if needed
      await updateDoc(cRef, { status: "Deleted", deletedAt: new Date() });

      // decrement advertiser campaignsCreated if present
      if (campaign && (campaign as Record<string, unknown>).ownerId) {
        const ownerId = String((campaign as Record<string, unknown>).ownerId);
        const advRef = doc(db, "advertisers", ownerId);
        try {
          await updateDoc(advRef, { campaignsCreated: increment(-1) });
        } catch (e) {
          console.warn("Failed to decrement advertiser campaignsCreated", e);
        }
      }

      setCampaign((s) => (s ? { ...s, status: "Deleted" } : s));
      toast.success("Campaign marked deleted");
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete campaign");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (!campaign) return <div className="p-8">Campaign not found.</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{String(campaign.title || campaign.name)}</h1>
        <div className="flex gap-2">
          {campaign.status !== "Active" && (
            <Button onClick={() => setStatus("Active")} variant="outline">
              Activate
            </Button>
          )}
          {campaign.status === "Active" && (
            <Button onClick={() => setStatus("Paused")} variant="outline">
              Pause
            </Button>
          )}
          {campaign.status !== "Stopped" && (
            <Button onClick={() => setStatus("Stopped")} variant="outline">
              Stop
            </Button>
          )}
          <Button onClick={deleteCampaign} className="text-red-700">
            Delete
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="p-4">
          <h3 className="font-semibold">Overview</h3>
          <div className="mt-3 text-sm">
            <div>Status: {String(campaign.status)}</div>
            <div>
              Available: ₦{(Number(campaign.budget || 0) + Number(campaign.reservedBudget ?? 0)).toLocaleString()}
            </div>
            {Number(campaign.reservedBudget ?? 0) > 0 && (
              <div className="text-sm text-stone-600">Reserved: ₦{Number(campaign.reservedBudget ?? 0).toLocaleString()}</div>
            )}
            <div>Price per lead: ₦{Number(campaign.earnerPrice || campaign.costPerLead || 0).toLocaleString()}</div>
          </div>
        </Card>

        <Card className="p-4 lg:col-span-2">
          <h3 className="font-semibold">Advertiser</h3>
          <div className="mt-3">
            {advertiser ? (
              <div>
                <div className="font-medium">{String(advertiser.name || advertiser.email)}</div>
                <div className="text-sm text-stone-500">Email: {String(advertiser.email)}</div>
                <div className="mt-2">
                  <a href={`/admin/advertisers/${advertiser.id}`} className="text-amber-600 hover:underline">
                    View advertiser details
                  </a>
                </div>
              </div>
            ) : (
              <div className="text-stone-500">No advertiser data</div>
            )}
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <h3 className="font-semibold">Description & Instructions</h3>
        <div className="mt-3 text-sm">
          <div>{String(campaign.description || campaign.proofInstructions || "No description")}</div>
        </div>
      </Card>
    </div>
  );
}