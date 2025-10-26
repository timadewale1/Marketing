"use client";

import React, { useEffect, useState } from "react";
import { doc, getDoc, collection, query, where, getDocs, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import toast from "react-hot-toast";

interface Tx { id: string; type?: string; amount?: number; status?: string }
interface Camp { id: string; title?: string; status?: string; budget?: number }

import { use } from "react";

export default function AdvertiserAdminDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<Record<string, unknown> | null>(null);
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [campaignsCreated, setCampaignsCreated] = useState<Camp[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const uRef = doc(db, "advertisers", id);
      const uSnap = await getDoc(uRef);
      if (!uSnap.exists()) {
        setUser(null);
        setLoading(false);
        return;
      }
      setUser({ id: uSnap.id, ...(uSnap.data() as Record<string, unknown>) });

      const txSnap = await getDocs(query(collection(db, "advertiserTransactions"), where("userId", "==", id)));
      setTransactions(txSnap.docs.map((d) => ({ ...(d.data() as Tx), id: d.id })) as Tx[]);

      const cSnap = await getDocs(query(collection(db, "campaigns"), where("ownerId", "==", id)));
      setCampaignsCreated(cSnap.docs.map((d) => ({ ...(d.data() as Camp), id: d.id })) as Camp[]);

      setLoading(false);
    };

    load();
  }, [id]);

  const handleUpdateStatus = async (newStatus: string) => {
    try {
      await updateDoc(doc(db, "advertisers", id), { status: newStatus });
      setUser((u) => (u ? { ...u, status: newStatus } : u));
      toast.success(`User status set to ${newStatus}`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to update status");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (!user) return <div className="p-8">Advertiser not found.</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{String(user.name || user.email)}</h1>
        <div className="flex gap-2">
          <Button onClick={() => handleUpdateStatus("suspended")} variant="outline">Suspend</Button>
          <Button onClick={() => handleUpdateStatus("active")}>Activate</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="p-4">
          <h3 className="font-semibold">Profile</h3>
          <div className="mt-3 text-sm">
            <div>Email: {String(user.email)}</div>
            <div>Status: {String(user.status)}</div>
            <div>Balance: ₦{Number((user as Record<string, unknown>)['balance'] || 0).toLocaleString()}</div>
          </div>
        </Card>

        <Card className="p-4 lg:col-span-2">
          <h3 className="font-semibold">Activity</h3>
          <div className="mt-3 space-y-4">
            <div>
              <h4 className="font-medium">Transactions</h4>
              <div className="text-sm mt-2">
                {transactions.length === 0 ? (
                  <div className="text-stone-500">No transactions</div>
                ) : (
                  <ul className="list-disc pl-5">
                    {transactions.map((t) => (
                      <li key={t.id}>{t.type} — ₦{(t.amount || 0).toLocaleString()} — {t.status}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div>
              <h4 className="font-medium">Campaigns created</h4>
              <div className="mt-2">
                {campaignsCreated.length === 0 ? (
                  <div className="text-stone-500">No campaigns found</div>
                ) : (
                  <ul className="list-disc pl-5">
                    {campaignsCreated.map((c) => (
                      <li key={c.id}>
                        <a href={`/admin/campaigns/${c.id}`} className="text-amber-600 hover:underline">{c.title}</a>
                        {" — "}<span className="text-sm text-stone-500">₦{Number(c.budget || 0).toLocaleString()} — {c.status}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
