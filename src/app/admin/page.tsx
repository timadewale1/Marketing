"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  BellRing,
  Users,
  Wallet,
} from "lucide-react";
import { collection, getDocs, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import {
  AdminPageHeader,
  EmptyState,
  MetricCard,
  SectionCard,
  StatusBadge,
} from "@/app/admin/_components/admin-primitives";

type Submission = {
  id: string;
  campaignId: string;
  campaignTitle: string;
  status: string;
  createdAtMs: number;
};

type Withdrawal = {
  id: string;
  userId: string;
  amount: number;
  status: string;
  bankName: string;
  accountNumber: string;
};

type ContactMessage = {
  id: string;
  name: string;
  email: string;
  message: string;
  status: string;
  createdAtMs: number;
};

function toMillis(value: unknown) {
  if (!value) return 0;
  if (typeof value === "object" && value !== null && "seconds" in value) {
    return Number((value as { seconds?: number }).seconds || 0) * 1000;
  }
  if (value instanceof Date) return value.getTime();
  return 0;
}

function currency(amount: number) {
  return `₦${amount.toLocaleString()}`;
}

export default function Page() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalCampaigns: 0,
    pendingSubmissions: 0,
    pendingWithdrawals: 0,
    unreadMessages: 0,
    totalTrackedSpend: 0,
  });
  const [recentSubmissions, setRecentSubmissions] = useState<Submission[]>([]);
  const [recentWithdrawals, setRecentWithdrawals] = useState<Withdrawal[]>([]);
  const [recentMessages, setRecentMessages] = useState<ContactMessage[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [
          earnersSnap,
          advertisersSnap,
          campaignsSnap,
          pendingSubmissionsSnap,
          pendingWithdrawalsSnap,
          unreadMessagesSnap,
          advertiserTransactionsSnap,
        ] = await Promise.all([
          getDocs(collection(db, "earners")),
          getDocs(collection(db, "advertisers")),
          getDocs(collection(db, "campaigns")),
          getDocs(query(collection(db, "earnerSubmissions"), where("status", "==", "Pending"))),
          getDocs(query(collection(db, "earnerWithdrawals"), where("status", "==", "pending"))),
          getDocs(query(collection(db, "contactMessages"), where("status", "==", "unread"))),
          getDocs(query(collection(db, "advertiserTransactions"), where("type", "==", "campaign_payment"))),
        ]);

        const totalTrackedSpend = advertiserTransactionsSnap.docs.reduce((sum, docItem) => {
          const amount = Number(docItem.data().amount || 0);
          return sum + Math.abs(amount);
        }, 0);

        setStats({
          totalUsers: earnersSnap.size + advertisersSnap.size,
          totalCampaigns: campaignsSnap.size,
          pendingSubmissions: pendingSubmissionsSnap.size,
          pendingWithdrawals: pendingWithdrawalsSnap.size,
          unreadMessages: unreadMessagesSnap.size,
          totalTrackedSpend,
        });
      } finally {
        setLoading(false);
      }
    };

    const unsubmissions = onSnapshot(
      query(collection(db, "earnerSubmissions"), orderBy("createdAt", "desc"), limit(6)),
      (snap) => {
        setRecentSubmissions(
          snap.docs.map((docItem) => {
            const data = docItem.data();
            return {
              id: docItem.id,
              campaignId: String(data.campaignId || ""),
              campaignTitle: String(data.campaignTitle || ""),
              status: String(data.status || ""),
              createdAtMs: toMillis(data.createdAt),
            };
          })
        );
      }
    );

    const unsubWithdrawals = onSnapshot(
      query(collection(db, "earnerWithdrawals"), orderBy("createdAt", "desc"), limit(6)),
      (snap) => {
        setRecentWithdrawals(
          snap.docs.map((docItem) => {
            const data = docItem.data();
            return {
              id: docItem.id,
              userId: String(data.userId || ""),
              amount: Number(data.amount || 0),
              status: String(data.status || ""),
              bankName: String(data.bank?.bankName || ""),
              accountNumber: String(data.bank?.accountNumber || ""),
            };
          })
        );
      }
    );

    const unsubMessages = onSnapshot(
      query(collection(db, "contactMessages"), orderBy("createdAt", "desc"), limit(6)),
      (snap) => {
        setRecentMessages(
          snap.docs.map((docItem) => {
            const data = docItem.data();
            return {
              id: docItem.id,
              name: String(data.name || ""),
              email: String(data.email || ""),
              message: String(data.message || ""),
              status: String(data.status || ""),
              createdAtMs: toMillis(data.createdAt),
            };
          })
        );
      }
    );

    load();

    return () => {
      unsubmissions();
      unsubWithdrawals();
      unsubMessages();
    };
  }, []);

  const healthLabel = useMemo(() => {
    if (stats.pendingSubmissions + stats.pendingWithdrawals > 20) {
      return "High queue pressure";
    }
    if (stats.pendingSubmissions + stats.pendingWithdrawals > 0) {
      return "Moderate queue";
    }
    return "Queues are clear";
  }, [stats.pendingSubmissions, stats.pendingWithdrawals]);

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow="Operations"
        title="Admin dashboard"
        description="A cleaner command view of users, campaign volume, moderation queues, and support load."
        action={
          <Button
            variant="outline"
            className="rounded-full border-stone-300 bg-white/80"
            onClick={() => window.location.reload()}
          >
            Refresh dashboard
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Users"
          value={stats.totalUsers}
          hint="Earners and advertisers combined"
          icon={Users}
        />
        <MetricCard
          label="Campaigns"
          value={stats.totalCampaigns}
          hint="Visible in current collection"
          icon={BarChart3}
          tone="blue"
        />
        <MetricCard
          label="Pending moderation"
          value={stats.pendingSubmissions}
          hint={healthLabel}
          icon={BellRing}
          tone="amber"
        />
        <MetricCard
          label="Tracked spend"
          value={currency(stats.totalTrackedSpend)}
          hint={`${stats.pendingWithdrawals} pending withdrawals`}
          icon={Wallet}
          tone="emerald"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <SectionCard
          title="Operational shortcuts"
          description="Jump straight into the parts of admin that need action."
        >
          <div className="grid gap-3 md:grid-cols-2">
            <Link
              href="/admin/users"
              className="rounded-3xl border border-stone-200 bg-white p-5 transition hover:-translate-y-1 hover:border-amber-300 hover:shadow-sm"
            >
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-stone-500">
                User management
              </p>
              <p className="mt-3 text-xl font-semibold text-stone-900">
                Filter users by role and activation
              </p>
              <p className="mt-2 text-sm text-stone-600">
                Open advertiser and earner timelines with linked campaigns and proof history.
              </p>
            </Link>
            <Link
              href="/admin/campaigns"
              className="rounded-3xl border border-stone-200 bg-white p-5 transition hover:-translate-y-1 hover:border-amber-300 hover:shadow-sm"
            >
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-stone-500">
                Campaign review
              </p>
              <p className="mt-3 text-xl font-semibold text-stone-900">
                Inspect budgets, spend, and proof queues
              </p>
              <p className="mt-2 text-sm text-stone-600">
                Campaign detail pages now expose submissions and verification controls together.
              </p>
            </Link>
            <Link
              href="/admin/submissions"
              className="rounded-3xl border border-stone-200 bg-white p-5 transition hover:-translate-y-1 hover:border-amber-300 hover:shadow-sm"
            >
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-stone-500">
                Submission queue
              </p>
              <p className="mt-3 text-xl font-semibold text-stone-900">
                Clear pending proof faster
              </p>
              <p className="mt-2 text-sm text-stone-600">
                Review pending items from the main queue or drop into each campaign page.
              </p>
            </Link>
            <Link
              href="/admin/contact-messages"
              className="rounded-3xl border border-stone-200 bg-white p-5 transition hover:-translate-y-1 hover:border-amber-300 hover:shadow-sm"
            >
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-stone-500">
                Support inbox
              </p>
              <p className="mt-3 text-xl font-semibold text-stone-900">
                {stats.unreadMessages} unread messages
              </p>
              <p className="mt-2 text-sm text-stone-600">
                Keep the contact queue from piling up while moderation is running.
              </p>
            </Link>
          </div>
        </SectionCard>

        <SectionCard
          title="Queue snapshot"
          description="A quick sense of what needs attention right now."
        >
          <div className="space-y-3">
            <div className="rounded-2xl bg-stone-50 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-stone-500">
                Pending submissions
              </p>
              <p className="mt-2 text-2xl font-semibold text-stone-900">
                {stats.pendingSubmissions}
              </p>
            </div>
            <div className="rounded-2xl bg-stone-50 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-stone-500">
                Pending withdrawals
              </p>
              <p className="mt-2 text-2xl font-semibold text-stone-900">
                {stats.pendingWithdrawals}
              </p>
            </div>
            <div className="rounded-2xl bg-stone-50 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-stone-500">
                Unread contact messages
              </p>
              <p className="mt-2 text-2xl font-semibold text-stone-900">
                {stats.unreadMessages}
              </p>
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <SectionCard
          title="Recent submissions"
          description="Newest proof submissions entering review."
        >
          {loading ? (
            <div className="h-28 animate-pulse rounded-2xl bg-stone-100" />
          ) : recentSubmissions.length === 0 ? (
            <EmptyState
              title="No submissions yet"
              description="Nothing has entered the submission queue yet."
            />
          ) : (
            <div className="space-y-3">
              {recentSubmissions.map((submission) => (
                <Link
                  key={submission.id}
                  href={`/admin/campaigns/${submission.campaignId}`}
                  className="block rounded-2xl border border-stone-200 bg-white p-4 transition hover:border-amber-300 hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-stone-900">
                        {submission.campaignTitle || submission.campaignId}
                      </p>
                      <p className="mt-1 text-sm text-stone-500">
                        {submission.createdAtMs
                          ? new Date(submission.createdAtMs).toLocaleString()
                          : "Unknown date"}
                      </p>
                    </div>
                    <StatusBadge
                      label={submission.status}
                      tone={
                        submission.status === "Verified"
                          ? "green"
                          : submission.status === "Rejected"
                            ? "red"
                            : "amber"
                      }
                    />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Recent withdrawals"
          description="Latest payout requests coming from earners."
        >
          {recentWithdrawals.length === 0 ? (
            <EmptyState
              title="No withdrawals"
              description="No payout requests have been logged yet."
            />
          ) : (
            <div className="space-y-3">
              {recentWithdrawals.map((withdrawal) => (
                <Link
                  key={withdrawal.id}
                  href={`/admin/earners/${withdrawal.userId}`}
                  className="block rounded-2xl border border-stone-200 bg-white p-4 transition hover:border-amber-300 hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-stone-900">
                        {currency(withdrawal.amount)}
                      </p>
                      <p className="mt-1 text-sm text-stone-500">
                        {withdrawal.bankName} • {withdrawal.accountNumber}
                      </p>
                    </div>
                    <StatusBadge
                      label={withdrawal.status}
                      tone={
                        withdrawal.status.toLowerCase().includes("sent")
                          ? "green"
                          : withdrawal.status.toLowerCase().includes("reject")
                            ? "red"
                            : "amber"
                      }
                    />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Recent messages"
          description="Latest support and contact conversations."
        >
          {recentMessages.length === 0 ? (
            <EmptyState
              title="No messages"
              description="No contact messages have been received yet."
            />
          ) : (
            <div className="space-y-3">
              {recentMessages.map((message) => (
                <div
                  key={message.id}
                  className="rounded-2xl border border-stone-200 bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-stone-900">{message.name}</p>
                      <p className="mt-1 text-sm text-stone-500">{message.email}</p>
                      <p className="mt-2 line-clamp-2 text-sm text-stone-600">
                        {message.message}
                      </p>
                    </div>
                    <StatusBadge
                      label={message.status}
                      tone={message.status === "unread" ? "amber" : "green"}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
