"use client";

import { useState } from "react";
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import toast from "react-hot-toast";
import { AdminPageHeader, EmptyState, SectionCard } from "@/app/admin/_components/admin-primitives";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowDown,
  ArrowUp,
  RefreshCw,
  Search,
  Wallet,
} from "lucide-react";

const normalizeEmail = (value: string) => String(value || "").trim().toLowerCase();
const formatCurrency = (value: number) => `₦${value.toLocaleString()}`;

type FunderUser = {
  id: string;
  role: "earner" | "advertiser";
  email: string;
  name: string;
  status: string;
  activated: boolean;
  verified: boolean;
  balance: number;
  totalSpent: number;
  totalEarned: number;
};

type BalanceAction = "fund" | "decrease";

export default function FunderUsersPage() {
  const [email, setEmail] = useState("");
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [user, setUser] = useState<FunderUser | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeAction, setActiveAction] = useState<BalanceAction>("fund");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSearch = async () => {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      setSearchError("Please enter an email address.");
      setUser(null);
      return;
    }

    setLoadingSearch(true);
    setSearchError(null);
    setUser(null);

    try {
      const [earnerSnap, advertiserSnap] = await Promise.all([
        getDocs(query(collection(db, "earners"), where("email", "==", normalizedEmail), limit(1))),
        getDocs(query(collection(db, "advertisers"), where("email", "==", normalizedEmail), limit(1))),
      ]);

      const advertiserDoc = advertiserSnap.docs[0];
      const earnerDoc = earnerSnap.docs[0];
      const foundDoc = advertiserDoc || earnerDoc;

      if (!foundDoc) {
        setSearchError("No earner or advertiser account was found for that email.");
        return;
      }

      const data = foundDoc.data() as Record<string, unknown>;
      const role = advertiserDoc ? "advertiser" : "earner";
      const balance = Number(data.balance || data.walletBalance || 0);
      setUser({
        id: foundDoc.id,
        role,
        email: String(data.email || normalizedEmail),
        name: String(data.name || data.companyName || data.businessName || data.fullName || data.email || "Unnamed user"),
        status: String(data.status || "unknown"),
        activated: Boolean(data.activated),
        verified: Boolean(data.verified),
        balance,
        totalSpent: Number(data.totalSpent || 0),
        totalEarned: Number(data.totalEarned || 0),
      });
    } catch (error) {
      console.error("Funder users search failed", error);
      toast.error("Unable to search for the user. Please try again.");
    } finally {
      setLoadingSearch(false);
    }
  };

  const openActionDialog = (action: BalanceAction) => {
    setActiveAction(action);
    setAmount("");
    setDialogOpen(true);
  };

  const handleAdjustBalance = async () => {
    if (!user) return;

    const numericAmount = Number(amount.replace(/,/g, ""));
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      toast.error("Enter a valid positive amount.");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/admin/funder-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user.email,
          action: activeAction,
          amount: numericAmount,
        }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result?.message || "Failed to update balance");
      }

      setUser((current) =>
        current
          ? {
              ...current,
              balance:
                activeAction === "fund"
                  ? current.balance + numericAmount
                  : current.balance - numericAmount,
            }
          : current
      );
      toast.success(
        activeAction === "fund"
          ? "Balance funded successfully."
          : "Balance decreased successfully."
      );
      setDialogOpen(false);
    } catch (error) {
      console.error("Balance adjustment failed", error);
      toast.error("Failed to update user balance.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow="Admin control"
        title="Funder users"
        description="Search by email, review the selected earner or advertiser, and adjust wallet balances safely from one place."
      />

      <SectionCard
        title="Lookup user by email"
        description="Find the earner or advertiser account and load their wallet balance for adjustment."
        action={
          <Button
            variant="outline"
            className="rounded-full"
            onClick={() => {
              setEmail("");
              setUser(null);
              setSearchError(null);
            }}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Clear
          </Button>
        }
      >
        <div className="grid gap-4 sm:grid-cols-[1.6fr_0.9fr]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <Input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Enter user email"
              className="h-12 rounded-2xl border-stone-200 bg-white pl-11"
            />
          </div>
          <Button
            className="h-12 rounded-2xl"
            onClick={handleSearch}
            disabled={loadingSearch}
          >
            {loadingSearch ? "Searching..." : "Search user"}
          </Button>
        </div>
        {searchError ? (
          <p className="mt-3 text-sm text-rose-600">{searchError}</p>
        ) : null}
      </SectionCard>

      {user ? (
        <div className="grid gap-6 xl:grid-cols-[1.25fr_0.85fr]">
          <Card className="p-6">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <p className="text-sm font-medium uppercase tracking-[0.25em] text-stone-500">
                  {user.role === "advertiser" ? "Advertiser account" : "Earner account"}
                </p>
                <h2 className="text-2xl font-semibold text-stone-900">{user.name}</h2>
                <p className="text-sm text-stone-600">{user.email}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="rounded-3xl bg-stone-100 px-4 py-3 text-sm font-semibold text-stone-700">
                  {user.status}
                </div>
                {user.activated ? (
                  <div className="rounded-3xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                    Activated
                  </div>
                ) : null}
                {user.verified ? (
                  <div className="rounded-3xl bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-700">
                    Verified
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <div className="rounded-3xl bg-stone-50 p-5">
                <p className="text-sm uppercase tracking-[0.2em] text-stone-500">Balance</p>
                <p className="mt-3 text-3xl font-semibold text-stone-900">{formatCurrency(user.balance)}</p>
              </div>
              <div className="rounded-3xl bg-stone-50 p-5">
                <p className="text-sm uppercase tracking-[0.2em] text-stone-500">Lifetime totals</p>
                <p className="mt-3 text-sm text-stone-700">
                  Spent: {formatCurrency(user.totalSpent)}
                </p>
                <p className="mt-2 text-sm text-stone-700">
                  Earned: {formatCurrency(user.totalEarned)}
                </p>
              </div>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <div className="rounded-3xl border border-stone-200 bg-white p-5">
                <p className="text-sm text-stone-500">User ID</p>
                <p className="mt-2 text-sm font-medium text-stone-900 break-all">{user.id}</p>
              </div>
              <div className="rounded-3xl border border-stone-200 bg-white p-5">
                <p className="text-sm text-stone-500">Role</p>
                <p className="mt-2 text-sm font-medium text-stone-900 capitalize">{user.role}</p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-3 rounded-3xl bg-amber-50 p-4 text-stone-900">
              <Wallet className="h-6 w-6 text-amber-700" />
              <div>
                <p className="text-sm font-semibold">Wallet balance actions</p>
                <p className="text-sm text-stone-600">Choose fund or decrease to adjust the selected account balance.</p>
              </div>
            </div>

            <div className="mt-6 grid gap-3">
              <Button
                className="h-12 rounded-2xl"
                onClick={() => openActionDialog("fund")}
              >
                <ArrowUp className="mr-2 h-4 w-4" />
                Fund user
              </Button>
              <Button
                variant="outline"
                className="h-12 rounded-2xl"
                onClick={() => openActionDialog("decrease")}
              >
                <ArrowDown className="mr-2 h-4 w-4" />
                Decrease balance
              </Button>
            </div>
          </Card>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>
                  {activeAction === "fund" ? "Fund user balance" : "Decrease user balance"}
                </DialogTitle>
                <DialogDescription>
                  {activeAction === "fund"
                    ? "Enter the amount to add to the user wallet balance."
                    : "Enter the amount to deduct from the user wallet balance."}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-5 pt-4">
                <div className="rounded-3xl bg-stone-50 p-4 text-sm text-stone-700">
                  <p className="font-medium">Selected user</p>
                  <p className="mt-2 text-sm text-stone-600">{user.name}</p>
                  <p className="mt-1 text-sm text-stone-600">{user.email}</p>
                  <p className="mt-3 text-sm text-stone-700">Current balance: {formatCurrency(user.balance)}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-stone-700">Amount (NGN)</label>
                  <Input
                    type="number"
                    min="0"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="Enter amount"
                    className="mt-2 h-12 rounded-2xl border-stone-200 bg-white"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button disabled={submitting} onClick={handleAdjustBalance}>
                  {submitting
                    ? "Saving..."
                    : activeAction === "fund"
                      ? "Fund balance"
                      : "Decrease balance"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      ) : (
        <EmptyState
          title="Search to load a user"
          description="Enter an earner or advertiser email to display wallet and account details before making balance changes."
        />
      )}
    </div>
  );
}
