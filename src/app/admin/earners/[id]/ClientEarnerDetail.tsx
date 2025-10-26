"use client";

import React, { useEffect, useState } from "react";
import { doc, getDoc, collection, query, where, getDocs, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import toast from "react-hot-toast";

interface Tx { id: string; type?: string; amount?: number; status?: string }
interface Wd { id: string; amount?: number; status?: string }
interface Sub { id: string; campaignId?: string; campaignTitle?: string }
interface Camp { id: string; title?: string; status?: string }

interface Props {
  id: string;
}

export default function ClientEarnerDetail({ id }: Props) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<Record<string, unknown> | null>(null);
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [withdrawals, setWithdrawals] = useState<Wd[]>([]);
  const [campaignsParticipated, setCampaignsParticipated] = useState<Camp[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const uRef = doc(db, "earners", id);
      const uSnap = await getDoc(uRef);
      if (!uSnap.exists()) {
        setUser(null);
        setLoading(false);
        return;
      }
      setUser({ id: uSnap.id, ...(uSnap.data() as Record<string, unknown>) });

      const txSnap = await getDocs(query(collection(db, "earnerTransactions"), where("userId", "==", id)));
      setTransactions(txSnap.docs.map((d) => ({ ...(d.data() as Tx), id: d.id })) as Tx[]);

      const wSnap = await getDocs(query(collection(db, "earnerWithdrawals"), where("userId", "==", id)));
      setWithdrawals(wSnap.docs.map((d) => ({ ...(d.data() as Wd), id: d.id })) as Wd[]);

      const sSnap = await getDocs(query(collection(db, "earnerSubmissions"), where("userId", "==", id)));
      const submissionsData = sSnap.docs.map((d) => ({ ...(d.data() as Sub), id: d.id })) as Sub[];
      const campaignIds = Array.from(new Set(submissionsData.map((s) => (s as Sub).campaignId).filter(Boolean)));
      if (campaignIds.length > 0) {
        const campaignsData: Camp[] = [];
        for (const cid of campaignIds) {
          const cSnap = await getDoc(doc(db, "campaigns", String(cid)));
          if (cSnap.exists()) campaignsData.push({ ...(cSnap.data() as Camp), id: cSnap.id });
        }
        setCampaignsParticipated(campaignsData);
      }

      setLoading(false);
    };

    load();
  }, [id]);

  const handleUpdateStatus = async (newStatus: string) => {
    try {
      await updateDoc(doc(db, "earners", id), { status: newStatus });
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

  if (!user) return <div className="p-8">Earner not found.</div>;

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
              <h4 className="font-medium">Earnings & Transactions</h4>
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
              <h4 className="font-medium">Withdrawals</h4>
              <div className="text-sm mt-2">
                {withdrawals.length === 0 ? (
                  <div className="text-stone-500">No withdrawals</div>
                ) : (
                  <ul className="list-disc pl-5">
                    {withdrawals.map((w) => (
                      <li key={w.id}>₦{(w.amount || 0).toLocaleString()} — {w.status}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div>
              <h4 className="font-medium">Campaigns participated</h4>
              <div className="mt-2">
                {campaignsParticipated.length === 0 ? (
                  <div className="text-stone-500">No campaigns found</div>
                ) : (
                  <ul className="list-disc pl-5">
                    {campaignsParticipated.map((c) => (
                      <li key={c.id}>
                        <a href={`/admin/campaigns/${c.id}`} className="text-amber-600 hover:underline">{c.title}</a>
                        {" — "}<span className="text-sm text-stone-500">{c.status}</span>
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