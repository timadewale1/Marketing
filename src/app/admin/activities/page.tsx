"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import toast from "react-hot-toast";
import { Mail, Send, Sparkles } from "lucide-react";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AdminPageHeader,
  EmptyState,
  PaginatedCardList,
  SectionCard,
  StatusBadge,
} from "@/app/admin/_components/admin-primitives";

type Recipient = {
  id: string;
  role: "earner" | "advertiser";
  name: string;
  email: string;
  activated: boolean;
};

type Audience =
  | "all"
  | "earners"
  | "advertisers"
  | "unactivated_earners"
  | "unactivated_advertisers";

export default function AdminActivitiesPage() {
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [audience, setAudience] = useState<Audience>("all");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [earnersSnap, advertisersSnap] = await Promise.all([
          getDocs(collection(db, "earners")),
          getDocs(collection(db, "advertisers")),
        ]);

        const nextRecipients: Recipient[] = [
          ...earnersSnap.docs.map((doc) => {
            const data = doc.data();
            return {
              id: doc.id,
              role: "earner" as const,
              name: String(data.fullName || data.name || "Unnamed earner"),
              email: String(data.email || ""),
              activated: Boolean(data.activated),
            };
          }),
          ...advertisersSnap.docs.map((doc) => {
            const data = doc.data();
            return {
              id: doc.id,
              role: "advertiser" as const,
              name: String(data.name || data.companyName || "Unnamed advertiser"),
              email: String(data.email || ""),
              activated: Boolean(data.activated),
            };
          }),
        ].filter((recipient) => recipient.email);

        setRecipients(nextRecipients);
      } catch (error) {
        console.error("Failed to load admin activity recipients", error);
        toast.error("Failed to load recipients");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const filteredRecipients = useMemo(() => {
    return recipients.filter((recipient) => {
      if (audience === "all") return true;
      if (audience === "earners") return recipient.role === "earner";
      if (audience === "advertisers") return recipient.role === "advertiser";
      if (audience === "unactivated_earners") return recipient.role === "earner" && !recipient.activated;
      if (audience === "unactivated_advertisers") return recipient.role === "advertiser" && !recipient.activated;
      return true;
    });
  }, [audience, recipients]);

  const inactiveRecipients = filteredRecipients.filter((recipient) => !recipient.activated);

  const sendEmails = async (type: "activation_reminder" | "broadcast") => {
    try {
      setSending(true);
      const response = await fetch("/api/admin/activities/email", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          audience,
          subject,
          message,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to send emails");
      }

      if (!data.sent || data.sent === 0) {
        throw new Error(data.message || "No emails were sent");
      }

      toast.success(data.message || "Emails sent");
      if (type === "broadcast") {
        setSubject("");
        setMessage("");
      }
    } catch (error) {
      console.error("Admin activities email send failed", error);
      toast.error(error instanceof Error ? error.message : "Failed to send emails");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow="Admin activities"
        title="Email users from admin"
        description="Send activation reminders to non-activated accounts or broadcast updates to earners, advertisers, or everyone."
        action={
          <Button
            variant="outline"
            className="rounded-full border-stone-300 bg-white/80"
            onClick={() => window.location.reload()}
          >
            <Sparkles className="h-4 w-4" />
            Refresh recipients
          </Button>
        }
      />

      <SectionCard
        title="Audience"
        description="Pick who should receive reminders or updates before sending."
      >
        <div className="grid gap-4 md:grid-cols-[0.8fr_1fr_1fr]">
          <Select value={audience} onValueChange={(value) => setAudience(value as Audience)}>
            <SelectTrigger className="h-11 rounded-2xl border-stone-200 bg-white">
              <SelectValue placeholder="Choose audience" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All users</SelectItem>
              <SelectItem value="earners">Earners only</SelectItem>
              <SelectItem value="advertisers">Advertisers only</SelectItem>
              <SelectItem value="unactivated_earners">Unactivated earners</SelectItem>
              <SelectItem value="unactivated_advertisers">Unactivated advertisers</SelectItem>
            </SelectContent>
          </Select>
          <div className="rounded-2xl bg-stone-50 p-4 text-sm text-stone-700">
            <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Selected audience</p>
            <p className="mt-2 text-lg font-semibold text-stone-900">{filteredRecipients.length}</p>
          </div>
          <div className="rounded-2xl bg-stone-50 p-4 text-sm text-stone-700">
            <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Not activated</p>
            <p className="mt-2 text-lg font-semibold text-stone-900">{inactiveRecipients.length}</p>
          </div>
        </div>
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_1.05fr]">
        <SectionCard
          title="Activation reminders"
          description="Preview non-activated users and send the built-in activation reminder template."
          action={
            <Button
              className="rounded-full bg-stone-900 text-white hover:bg-stone-800"
              disabled={sending || inactiveRecipients.length === 0}
              onClick={() => sendEmails("activation_reminder")}
            >
              <Mail className="h-4 w-4" />
              Send reminders
            </Button>
          }
        >
          {loading ? (
            <div className="h-40 animate-pulse rounded-2xl bg-stone-100" />
          ) : inactiveRecipients.length === 0 ? (
            <EmptyState
              title="No inactive users in this audience"
              description="Everyone in the selected audience is already activated."
            />
          ) : (
            <PaginatedCardList
              items={inactiveRecipients}
              itemsPerPage={3}
              renderItem={(recipient) => (
                <div
                  key={recipient.id}
                  className="rounded-2xl border border-stone-200 bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-stone-900">{recipient.name}</p>
                      <p className="mt-1 text-sm text-stone-500">{recipient.email}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge
                        label={recipient.role === "earner" ? "Earner" : "Advertiser"}
                        tone={recipient.role === "earner" ? "amber" : "blue"}
                      />
                      <StatusBadge label="Not activated" tone="stone" />
                    </div>
                  </div>
                </div>
              )}
            />
          )}
        </SectionCard>

        <SectionCard
          title="Send update"
          description="Compose a custom email update to the selected audience."
          action={
            <Button
              className="rounded-full bg-stone-900 text-white hover:bg-stone-800"
              disabled={sending || !subject.trim() || !message.trim()}
              onClick={() => sendEmails("broadcast")}
            >
              <Send className="h-4 w-4" />
              Send update
            </Button>
          }
        >
          <div className="space-y-4">
            <div>
              <Input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Email subject"
                className="h-11 rounded-2xl border-stone-200 bg-white"
              />
            </div>
            <div>
              <Textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Write the message you want the selected audience to receive"
                className="min-h-[220px] rounded-2xl border-stone-200 bg-white"
              />
            </div>
            <p className="text-sm text-stone-500">
              This sends to {filteredRecipients.length} {audience === "all" ? "users" : audience.replace(/_/g, " ")}.
            </p>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
