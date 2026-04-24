"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import toast from "react-hot-toast";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import {
  AdminPageHeader,
  EmptyState,
  SectionCard,
  StatusBadge,
} from "@/app/admin/_components/admin-primitives";

type Notification = {
  id: string;
  title: string;
  body: string;
  read: boolean;
  link?: string;
};

export default function NotificationDetail() {
  const params = useParams<{ id: string | string[] }>();
  const id = params?.id;
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState<Notification | null>(null);

  useEffect(() => {
    const load = async () => {
      const docId = Array.isArray(id) ? id[0] : id;
      if (!docId) return;
      try {
        const snap = await getDoc(doc(db, "adminNotifications", docId));
        if (!snap.exists()) {
          setNotification(null);
          return;
        }
        const data = snap.data();
        setNotification({
          id: snap.id,
          title: String(data.title || ""),
          body: String(data.body || ""),
          read: Boolean(data.read),
          link: data.link ? String(data.link) : undefined,
        });
      } catch (error) {
        console.error(error);
        toast.error("Failed to load notification");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const markRead = async () => {
    if (!notification) return;
    try {
      await updateDoc(doc(db, "adminNotifications", notification.id), { read: true });
      setNotification({ ...notification, read: true });
      toast.success("Notification marked as read");
    } catch (error) {
      console.error(error);
      toast.error("Failed to update notification");
    }
  };

  if (loading) {
    return <div className="h-48 animate-pulse rounded-3xl bg-stone-100" />;
  }

  if (!notification) {
    return (
      <div className="space-y-6">
        <AdminPageHeader
          eyebrow="Notification detail"
          title="Notification not found"
          description="This admin notification could not be located."
        />
        <EmptyState
          title="Missing notification"
          description="It may have been removed or the link may be incorrect."
          href="/admin/notifications"
          cta="Back to notifications"
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow="Notification detail"
        title={notification.title}
        description="Inspect the full message and jump to the linked destination if one exists."
        action={
          <Button variant="outline" className="rounded-full" onClick={() => router.back()}>
            Back
          </Button>
        }
      />

      <div className="flex gap-2">
        <StatusBadge label={notification.read ? "Read" : "Unread"} tone={notification.read ? "stone" : "amber"} />
      </div>

      <SectionCard title="Message" description="The full notification body is shown below.">
        <p className="text-sm leading-7 text-stone-700">{notification.body}</p>
        <div className="mt-6 flex flex-wrap gap-2">
          {!notification.read ? (
            <Button className="rounded-full bg-stone-900 text-white hover:bg-stone-800" onClick={markRead}>
              Mark as read
            </Button>
          ) : null}
          {notification.link ? (
            <Button asChild variant="outline" className="rounded-full">
              <Link href={notification.link}>Open linked page</Link>
            </Button>
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}
