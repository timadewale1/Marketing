"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import toast from "react-hot-toast";
import { NIGERIAN_BANKS } from "@/lib/banks";

type Bank = {
  bankName: string;
  bankCode: string;
  accountNumber: string;
  accountName: string;
  verified?: boolean;
};

export default function CustomerBankPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedBank, setSelectedBank] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [verifying, setVerifying] = useState(false);

  const sortedBanks = useMemo(
    () => [...NIGERIAN_BANKS].sort((a, b) => a.name.localeCompare(b.name)),
    []
  );

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      router.push("/auth/sign-in?marketplace=1");
      return;
    }
    void (async () => {
      try {
        const idToken = await user.getIdToken();
        const res = await fetch("/api/customer/profile", {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const data = await res.json().catch(() => ({})) as { success?: boolean; profile?: { bank?: Bank } };
        if (res.ok && data.success && data.profile?.bank) {
          setSelectedBank(String(data.profile.bank.bankCode || ""));
          setAccountNumber(String(data.profile.bank.accountNumber || ""));
          setAccountName(String(data.profile.bank.accountName || ""));
        }
      } catch (error) {
        console.warn("Customer bank preload failed", error);
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  useEffect(() => {
    if (accountNumber.length !== 10 || !selectedBank) return;
    void (async () => {
      setVerifying(true);
      try {
        const res = await fetch("/api/verify-bank", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountNumber, bankCode: selectedBank }),
        });
        const payload = await res.json().catch(() => ({})) as { success?: boolean; accountName?: string };
        if (res.ok && payload.success && payload.accountName) {
          setAccountName(payload.accountName);
        }
      } catch {
        // ignore
      } finally {
        setVerifying(false);
      }
    })();
  }, [accountNumber, selectedBank]);

  const save = async () => {
    if (!selectedBank || accountNumber.length !== 10 || !accountName.trim()) {
      toast.error("Please complete and verify your bank details.");
      return;
    }
    const user = auth.currentUser;
    if (!user) return;
    setSaving(true);
    try {
      const idToken = await user.getIdToken();
      const bankName = sortedBanks.find((bank) => bank.code === selectedBank)?.name || "";
      const res = await fetch("/api/customer/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          bankName,
          bankCode: selectedBank,
          accountNumber,
          accountName,
        }),
      });
      const payload = await res.json().catch(() => ({})) as { success?: boolean; message?: string };
      if (!res.ok || !payload.success) throw new Error(payload.message || "Could not save bank details");
      toast.success("Bank details saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save bank details");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-stone-900">Bank Details</h1>
      <Card className="rounded-2xl border-stone-200 bg-white p-5">
        {loading ? (
          <p className="text-sm text-stone-600">Loading bank details...</p>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-700">Bank</label>
              <select
                className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm"
                value={selectedBank}
                onChange={(e) => setSelectedBank(e.target.value)}
              >
                <option value="">Select bank</option>
                {sortedBanks.map((bank) => (
                  <option key={bank.code} value={bank.code}>{bank.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-700">Account number</label>
              <Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="0123456789" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-700">Account name</label>
              <Input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder={verifying ? "Verifying..." : "Account name"} />
            </div>
            <Button onClick={() => void save()} disabled={saving || verifying} className="rounded-full bg-cyan-700 hover:bg-cyan-600">
              {saving ? "Saving..." : "Save bank details"}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
