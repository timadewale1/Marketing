"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck, Search } from "lucide-react";
import { collection, doc, getDocs, orderBy, query, updateDoc } from "firebase/firestore";
import toast from "react-hot-toast";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AdminPageHeader,
  EmptyState,
  MetricCard,
  PaginatedCardList,
  SectionCard,
  StatusBadge,
} from "@/app/admin/_components/admin-primitives";

type AdminNotification = {
  id: string;
  title: string;
  body: string;
  link?: string;
  read: boolean;
  createdAtMs: number;
};

function toMillis(value: unknown) {
  if (!value) return 0;
  if (typeof value === "object" && value !== null && "seconds" in value) {
    return Number((value as { seconds?: number }).seconds || 0) * 1000;
  }
  return value instanceof Date ? value.getTime() : 0;
}

export default function AdminNotificationsPage() {
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const snap = await getDocs(query(collection(db, "adminNotifications"), orderBy("createdAt", "desc")));
      setNotifications(
        snap.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            title: String(data.title || ""),
            body: String(data.body || ""),
            link: data.link ? String(data.link) : undefined,
            read: Boolean(data.read),
            createdAtMs: toMillis(data.createdAt),
          };
        })
      );
      setLoading(false);
    };

    load().catch((error) => {
      console.error("Failed to load notifications", error);
      toast.error("Failed to load notifications");
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return notifications.filter((notification) => {
      if (!term) return true;
      return (
        notification.title.toLowerCase().includes(term) ||
        notification.body.toLowerCase().includes(term)
      );
    });
  }, [notifications, search]);

  const unreadCount = notifications.filter((notification) => !notification.read).length;

  const markRead = async (id: string) => {
    try {
      await updateDoc(doc(db, "adminNotifications", id), { read: true });
      setNotifications((current) =>
        current.map((notification) =>
          notification.id === id ? { ...notification, read: true } : notification
        )
      );
      toast.success("Marked as read");
    } catch (error) {
      console.error(error);
      toast.error("Failed to mark notification as read");
    }
  };

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow="Notification center"
        title="Admin notifications"
        description="Track campaign, submission, and system alerts from one paginated list."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <MetricCard label="Total" value={notifications.length} hint="All notifications" icon={Bell} />
        <MetricCard label="Unread" value={unreadCount} hint="Still needs attention" icon={Bell} tone="amber" />
        <MetricCard
          label="Read"
          value={notifications.length - unreadCount}
          hint="Already reviewed"
          icon={CheckCheck}
          tone="emerald"
        />
      </div>

      <SectionCard title="Search notifications" description="Search titles and message bodies.">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search notifications"
            className="h-11 rounded-2xl border-stone-200 bg-white pl-10"
          />
        </div>
      </SectionCard>

      <SectionCard
        title="Notification list"
        description={`${filtered.length} notification${filtered.length === 1 ? "" : "s"} matched the current search.`}
      >
        {loading ? (
          <div className="h-48 animate-pulse rounded-3xl bg-stone-100" />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No notifications"
            description="There are no notifications matching this search."
          />
        ) : (
          <PaginatedCardList
            items={filtered}
            itemsPerPage={3}
            renderItem={(notification) => (
              <div
                key={notification.id}
                className="rounded-3xl border border-stone-200 bg-white p-5"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/admin/notifications/${notification.id}`}
                        className="text-lg font-semibold text-stone-900 hover:text-amber-700"
                      >
                        {notification.title}
                      </Link>
                      <StatusBadge
                        label={notification.read ? "Read" : "Unread"}
                        tone={notification.read ? "stone" : "amber"}
                      />
                    </div>
                    <p className="text-sm leading-6 text-stone-600">{notification.body}</p>
                    <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                      {notification.createdAtMs
                        ? new Date(notification.createdAtMs).toLocaleString()
                        : "Unknown date"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!notification.read ? (
                      <Button
                        variant="outline"
                        className="rounded-full"
                        onClick={() => markRead(notification.id)}
                      >
                        Mark read
                      </Button>
                    ) : null}
                    {notification.link ? (
                      <Button asChild className="rounded-full bg-stone-900 text-white hover:bg-stone-800">
                        <Link href={notification.link}>Open target</Link>
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            )}
          />
        )}
      </SectionCard>
    </div>
  );
}
