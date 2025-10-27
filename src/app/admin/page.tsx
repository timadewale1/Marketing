"use client";

import React, { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, where, orderBy, limit, getDocs } from "firebase/firestore";
import { Card } from "@/components/ui/card";
import {
  BarChart3,
  Users,
  DollarSign,
  ActivitySquare,
  TrendingUp,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
  import { LucideIcon } from "lucide-react";


export default function Page() {
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalCampaigns: 0,
    totalEarnings: 0,
    pendingWithdrawals: 0,
    pendingSubmissions: 0,
  });

  interface Submission {
    id: string;
    campaignId?: string;
    campaignTitle: string;
    status: string;
    createdAt: { seconds: number };
  }

  interface Withdrawal {
    id: string;
    amount: number;
    status: string;
    userId?: string;
    bank: {
      bankName: string;
      accountNumber: string;
      accountName?: string;
    };
  }

  const [recentSubmissions, setRecentSubmissions] = useState<Submission[]>([]);
  const [recentWithdrawals, setRecentWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch statistics
    const fetchStats = async () => {
      try {
        // Users count
        const usersSnap = await getDocs(collection(db, "earners"));
        const advertisersSnap = await getDocs(collection(db, "advertisers"));
        const totalUsers = usersSnap.size + advertisersSnap.size;

        // Campaigns count
        const campaignsSnap = await getDocs(collection(db, "campaigns"));
        const totalCampaigns = campaignsSnap.size;

        // Total earnings calculation
        // Get total amount paid by advertisers for campaigns and take 50%
        const campaignEarnings = campaignsSnap.docs.reduce((sum, doc) => {
          const data = doc.data();
          // Only include campaign if it has a payment reference (meaning payment was successful)
          if (data.paymentRef) {
            return sum + (data.budget || 0) / 2;  // Platform takes 50% of all campaign payments
          }
          return sum;
        }, 0);

        // Add activation fees
        const activatedEarnersSnap = await getDocs(
          query(collection(db, "earners"), where("activated", "==", true))
        );
        
        let activationEarnings = 0;
        const ACTIVATION_FEE = 2000; // ₦2000 activation fee

        for (const doc of activatedEarnersSnap.docs) {
          const earnerData = doc.data();
          // If referred, platform keeps half of activation fee (₦1000)
          // If not referred, platform keeps full activation fee (₦2000)
          if (earnerData.referredBy) {
            activationEarnings += ACTIVATION_FEE / 2;
          } else {
            activationEarnings += ACTIVATION_FEE;
          }
        }

        const totalEarnings = campaignEarnings + activationEarnings;

        // Pending withdrawals
        const withdrawalsSnap = await getDocs(
          query(collection(db, "earnerWithdrawals"), where("status", "==", "pending"))
        );
        const pendingWithdrawals = withdrawalsSnap.size;

        // Pending submissions
        const submissionsSnap = await getDocs(
          query(collection(db, "earnerSubmissions"), where("status", "==", "Pending"))
        );
        const pendingSubmissions = submissionsSnap.size;

        setStats({
          totalUsers,
          totalCampaigns,
          totalEarnings,
          pendingWithdrawals,
          pendingSubmissions,
        });
      } catch (error) {
        console.error("Error fetching stats:", error);
      }
    };

    // Fetch recent submissions
    const unsubSubmissions = onSnapshot(
      query(
        collection(db, "earnerSubmissions"),
        orderBy("createdAt", "desc"),
        limit(5)
      ),
      (snap) => {
        setRecentSubmissions(
          snap.docs.map((doc) => {
            const data = doc.data();
            return {
              id: doc.id,
              campaignId: data.campaignId || "",
              campaignTitle: data.campaignTitle || "",
              status: data.status || "",
              createdAt: data.createdAt || { seconds: Date.now() / 1000 }
            };
          })
        );
      }
    );

    // Fetch recent withdrawals
    const unsubWithdrawals = onSnapshot(
      query(
        collection(db, "earnerWithdrawals"),
        orderBy("createdAt", "desc"),
        limit(5)
      ),
      (snap) => {
        setRecentWithdrawals(
          snap.docs.map((doc) => {
            const data = doc.data();
            return {
              id: doc.id,
              userId: data.userId || "",
              amount: data.amount || 0,
              status: data.status || "",
              bank: {
                bankName: data.bank?.bankName || "",
                accountNumber: data.bank?.accountNumber || "",
                accountName: data.bank?.accountName || ""
              }
            };
          })
        );
      }
    );

    fetchStats();
    setLoading(false);

    return () => {
      unsubSubmissions();
      unsubWithdrawals();
    };
  }, []);

  const StatCard = ({
    title,
    value,
    icon: Icon,
    change,
    changeType = "positive",
  }: {
    title: string;
    value: string | number;
    icon: LucideIcon;
    change?: string;
    changeType?: "positive" | "negative" | "neutral";
  }) => (
    <Card className="p-6 flex items-start justify-between">
      <div>
        <p className="text-sm font-medium text-stone-600">{title}</p>
        <p className="text-2xl font-bold text-stone-900 mt-2">{value}</p>
        {change && (
          <p
            className={`text-xs mt-2 ${
              changeType === "positive"
                ? "text-green-600"
                : changeType === "negative"
                ? "text-red-600"
                : "text-stone-600"
            }`}
          >
            {change}
          </p>
        )}
      </div>
      <div className="bg-amber-100 p-3 rounded-lg">
        <Icon className="w-6 h-6 text-amber-600" />
      </div>
    </Card>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-stone-800">Dashboard Overview</h1>
        <div className="flex gap-4">
          <Button
            variant="outline"
            onClick={() => window.location.reload()}
            className="flex items-center gap-2"
          >
            <Clock size={16} /> Refresh Data
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <StatCard
          title="Total Users"
          value={stats.totalUsers}
          icon={Users}
          change="+12% from last month"
          changeType="positive"
        />
        <StatCard
          title="Total Campaigns"
          value={stats.totalCampaigns}
          icon={BarChart3}
          change="+5 this week"
          changeType="positive"
        />
        <StatCard
          title="Total Earnings"
          value={`₦${stats.totalEarnings.toLocaleString()}`}
          icon={DollarSign}
          change="+15% this month"
          changeType="positive"
        />
        <StatCard
          title="Pending Withdrawals"
          value={stats.pendingWithdrawals}
          icon={ActivitySquare}
          change="Requires attention"
          changeType={stats.pendingWithdrawals > 10 ? "negative" : "neutral"}
        />
        <StatCard
          title="Pending Submissions"
          value={stats.pendingSubmissions}
          icon={TrendingUp}
          change="Needs review"
          changeType={stats.pendingSubmissions > 20 ? "negative" : "neutral"}
        />
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Submissions */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-stone-800">
              Recent Submissions
            </h2>
            <Link href="/admin/submissions">
              <Button variant="ghost" className="text-amber-600">
                View All
              </Button>
            </Link>
          </div>
          <div className="space-y-4">
            {recentSubmissions.map((sub) => (
              <div
                key={sub.id}
                className="flex items-center justify-between py-3 border-b last:border-0"
              >
                <div>
                  <p className="font-medium text-stone-800">
                    <a href={`/admin/campaigns/${sub.campaignId}`} className="hover:underline">
                      {sub.campaignTitle}
                    </a>
                  </p>
                  <p className="text-sm text-stone-500">
                    {new Date(sub.createdAt?.seconds * 1000).toLocaleString()}
                  </p>
                </div>
                <span
                  className={`px-2 py-1 text-xs rounded-full font-medium ${
                    sub.status === "Verified"
                      ? "bg-green-100 text-green-700"
                      : sub.status === "Rejected"
                      ? "bg-red-100 text-red-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {sub.status}
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* Recent Withdrawals */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-stone-800">
              Recent Withdrawals
            </h2>
            <Link href="/admin/withdrawals">
              <Button variant="ghost" className="text-amber-600">
                View All
              </Button>
            </Link>
          </div>
          <div className="space-y-4">
            {recentWithdrawals.map((withdrawal) => (
              <div
                key={withdrawal.id}
                className="flex items-center justify-between py-3 border-b last:border-0"
              >
                  <div>
                    <p className="font-medium text-stone-800">₦{withdrawal.amount?.toLocaleString()}</p>
                    <p className="text-sm text-stone-500">
                      {withdrawal.bank?.bankName} • {withdrawal.bank?.accountNumber}
                    </p>
                    <div>
                      <a href={`/admin/earners/${withdrawal.userId}`} className="text-amber-600 hover:underline">
                        View earner
                      </a>
                    </div>
                  </div>
                <span
                  className={`px-2 py-1 text-xs rounded-full font-medium ${
                    withdrawal.status === "sent"
                      ? "bg-green-100 text-green-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {withdrawal.status}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
