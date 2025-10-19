"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageLoader } from "@/components/ui/loader";

interface Bank {
  bankName: string;
  bankCode: string;
  accountNumber: string;
  accountName: string;
  verified: boolean;
}

interface PaystackBank {
  name: string;
  code: string;
  active: boolean;
  country: string;
  currency: string;
  type: string;
  id: number;
}

export default function BankPage() {
  const router = useRouter();
  const [bank, setBank] = useState<Bank | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [banks, setBanks] = useState<Array<{ name: string; code: string; }>>([]);
  const [selectedBank, setSelectedBank] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Fetch banks from Paystack on mount
  useEffect(() => {
    const fetchBanks = async () => {
      try {
        const res = await fetch("https://api.paystack.co/bank", {
          headers: {
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_PAYSTACK_SECRET_KEY}`,
          },
        });
        const data = await res.json();
        if (data.status && data.data) {
          setBanks(data.data.map((b: PaystackBank) => ({
            name: b.name,
            code: b.code,
          })));
        }
      } catch (err) {
        console.error("Failed to fetch banks:", err);
        toast.error("Could not load banks list");
      }
    };
    fetchBanks();
  }, []);

  // Get current bank details
  useEffect(() => {
    const u = auth.currentUser;
    if (!u) {
      router.push('/auth/sign-in');
      return;
    }
    (async () => {
      const snap = await getDoc(doc(db, "earners", u.uid));
      if (snap.exists()) {
        const d = snap.data();
        setBank(d.bank || null);
      }
      setLoading(false);
    })();
  }, [router]);

  // Verify bank account with Paystack
  useEffect(() => {
    const verifyAccount = async () => {
      if (accountNumber?.length === 10 && selectedBank) {
        setVerifying(true);
        setAccountName("");
        try {
          const res = await fetch(
            "https://api.paystack.co/bank/resolve?" +
            new URLSearchParams({
              account_number: accountNumber,
              bank_code: selectedBank,
            }), {
              headers: {
                Authorization: `Bearer ${process.env.NEXT_PUBLIC_PAYSTACK_SECRET_KEY}`,
              },
            }
          );
          const data = await res.json();
          if (data.status) {
            setAccountName(data.data.account_name);
          } else {
            toast.error("Could not verify account");
          }
        } catch (err) {
          console.error("Account verification failed:", err);
          toast.error("Account verification failed");
        } finally {
          setVerifying(false);
        }
      }
    };
    verifyAccount();
  }, [accountNumber, selectedBank]);

  const updateBankDetails = async () => {
    const u = auth.currentUser;
    if (!u) return toast.error("Login required");
    if (!selectedBank || !accountNumber || !accountName) {
      return toast.error("Please verify bank account first");
    }

    setSubmitting(true);
    try {
      const bankData = {
        bankName: banks.find(b => b.code === selectedBank)?.name || "",
        bankCode: selectedBank,
        accountNumber,
        accountName,
        verified: true,
        updatedAt: serverTimestamp(),
      };

      await updateDoc(doc(db, "earners", u.uid), {
        bank: bankData,
      });

      toast.success("Bank details updated successfully");
      // Reset form
      setSelectedBank("");
      setAccountNumber("");
      setAccountName("");
    } catch (err) {
      console.error(err);
      toast.error("Failed to update bank details");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-200 via-amber-100 to-stone-300">
      <div className="px-6 py-8 max-w-3xl mx-auto">
        <div className="mb-6 flex items-center gap-3">
          <Button variant="ghost" onClick={() => router.back()} className="hover:bg-white/20">
            <ArrowLeft size={16} className="mr-2" /> Back
          </Button>
          <h1 className="text-2xl font-semibold text-stone-800">Bank Account</h1>
        </div>

        {loading ? (
          <PageLoader />
        ) : (
          <>
            <Card className="bg-white/80 backdrop-blur p-6 mb-6">
              <h2 className="text-lg font-semibold text-stone-800 mb-4">Current Account</h2>
              {bank ? (
                <div className="space-y-2">
                  <div>
                    <div className="text-sm text-stone-600">Account Name</div>
                    <div className="font-medium text-stone-800">{bank.accountName}</div>
                  </div>
                  <div>
                    <div className="text-sm text-stone-600">Bank Details</div>
                    <div className="font-medium text-stone-800">{bank.bankName} • {bank.accountNumber}</div>
                  </div>
                  <div className="pt-2">
                    <span className="inline-block px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-full">
                      Verified
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-stone-600">No bank account on file.</div>
              )}
            </Card>

            <Card className="bg-white/80 backdrop-blur p-6">
              <h2 className="text-lg font-semibold text-stone-800 mb-4">
                {bank ? 'Update Bank Account' : 'Add Bank Account'}
              </h2>
              
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-stone-700">Select Bank</label>
                  <Select
                    onValueChange={setSelectedBank}
                    value={selectedBank}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Choose your bank" />
                    </SelectTrigger>
                    <SelectContent className="bg-white shadow-lg rounded max-h-64 overflow-auto">
                      {banks.map((b, idx) => (
                        <SelectItem key={b.code + '-' + idx} value={b.code} className="py-3 px-4 hover:bg-amber-50 cursor-pointer bg-white">
                          <span className="font-medium text-stone-800">{b.name}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium text-stone-700">Account Number</label>
                  <Input
                    placeholder="Enter 10-digit account number"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    maxLength={10}
                    className="mt-1"
                  />
                </div>

                {verifying && (
                  <div className="flex items-center gap-2 text-amber-600">
                    <PageLoader />
                    <span>Verifying account...</span>
                  </div>
                )}

                {accountName && (
                  <div className="p-3 bg-green-50 border border-green-100 rounded-lg">
                    <div className="text-sm text-green-800">Verified Account Name</div>
                    <div className="font-medium text-green-900">{accountName}</div>
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                  <Button
                    onClick={updateBankDetails}
                    disabled={submitting || !accountName}
                    className="flex-1 bg-amber-500 hover:bg-amber-600 text-stone-900 font-medium"
                  >
                    {submitting ? "Updating..." : "Update Bank Account"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedBank("");
                      setAccountNumber("");
                      setAccountName("");
                    }}
                    className="hover:bg-stone-100"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
