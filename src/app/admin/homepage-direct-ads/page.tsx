"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Film, Image as ImageIcon, Megaphone, Phone, RefreshCcw, Send } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AdminPageHeader,
  EmptyState,
  MetricCard,
  PaginatedCardList,
  SectionCard,
  StatusBadge,
} from "@/app/admin/_components/admin-primitives";

type HomepageDirectAd = {
  id: string;
  brandName: string;
  phone: string;
  email: string;
  writeup: string;
  link?: string;
  mediaType: "image" | "video";
  mediaUrl: string;
  durationDays: number;
  status: "active" | "inactive";
  createdAtMs: number;
  expiresAtMs: number;
};

function formatDate(value: number) {
  return value ? new Date(value).toLocaleString() : "Unknown";
}

export default function HomepageDirectAdsPage() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [ads, setAds] = useState<HomepageDirectAd[]>([]);
  const [brandName, setBrandName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [link, setLink] = useState("");
  const [durationDays, setDurationDays] = useState("7");
  const [writeup, setWriteup] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const loadAds = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/homepage-direct-ads", {
        credentials: "include",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Failed to load homepage ads");
      }
      setAds(result.ads || []);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to load homepage ads");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAds().catch(() => undefined);
  }, []);

  const stats = useMemo(() => {
    const now = Date.now();
    return {
      total: ads.length,
      active: ads.filter((ad) => ad.status === "active" && ad.expiresAtMs > now).length,
      expired: ads.filter((ad) => ad.expiresAtMs <= now).length,
    };
  }, [ads]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!brandName || !phone || !email || !writeup || !durationDays || !file) {
      toast.error("Please complete every required field");
      return;
    }

    const days = Number(durationDays);
    if (!days || days < 1) {
      toast.error("Duration must be at least 1 day");
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("brandName", brandName);
      formData.append("phone", phone);
      formData.append("email", email);
      formData.append("link", link);
      formData.append("writeup", writeup);
      formData.append("durationDays", String(days));
      formData.append("media", file);

      const response = await fetch("/api/admin/homepage-direct-ads", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Failed to upload homepage advert");
      }

      toast.success("Homepage advert uploaded");
      setBrandName("");
      setPhone("");
      setEmail("");
      setLink("");
      setDurationDays("7");
      setWriteup("");
      setFile(null);
      await loadAds();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to upload homepage advert");
    } finally {
      setSubmitting(false);
    }
  };

  const updateStatus = async (id: string, status: "active" | "inactive") => {
    try {
      const response = await fetch(`/api/admin/homepage-direct-ads/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Failed to update homepage advert");
      }

      setAds((current) =>
        current.map((ad) => (ad.id === id ? { ...ad, status } : ad))
      );
      toast.success(`Advert marked ${status}`);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to update homepage advert");
    }
  };

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow="Homepage adverts"
        title="Upload direct adverts"
        description="Manage the sliding homepage advert rail here. Uploaded adverts automatically stop showing once their duration expires."
        action={
          <Button
            variant="outline"
            className="rounded-full border-stone-300 bg-white"
            onClick={() => loadAds()}
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Total adverts" value={stats.total} hint="All uploads" icon={Megaphone} />
        <MetricCard label="Active now" value={stats.active} hint="Visible on homepage" icon={Megaphone} tone="emerald" />
        <MetricCard label="Expired" value={stats.expired} hint="Duration elapsed" icon={Megaphone} tone="amber" />
      </div>

      <SectionCard
        title="New homepage advert"
        description="Upload an image or video, attach the brand details, and set how many days the advert should stay live."
      >
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-stone-700">Brand name</label>
              <Input value={brandName} onChange={(event) => setBrandName(event.target.value)} className="bg-white" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-stone-700">Phone number</label>
              <Input value={phone} onChange={(event) => setPhone(event.target.value)} className="bg-white" />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-2 block text-sm font-medium text-stone-700">Email</label>
              <Input value={email} onChange={(event) => setEmail(event.target.value)} className="bg-white" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-stone-700">Link (optional)</label>
              <Input value={link} onChange={(event) => setLink(event.target.value)} className="bg-white" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-stone-700">Duration in days</label>
              <Input
                type="number"
                min={1}
                value={durationDays}
                onChange={(event) => setDurationDays(event.target.value)}
                className="bg-white"
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-stone-700">Short write-up</label>
            <Textarea
              value={writeup}
              onChange={(event) => setWriteup(event.target.value)}
              className="min-h-28 bg-white"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-stone-700">Media upload</label>
            <Input
              type="file"
              accept="image/*,video/*"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
              className="bg-white"
            />
            <p className="mt-2 text-xs text-stone-500">
              Upload either a landscape image or a short video for the homepage rail.
            </p>
          </div>

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={submitting}
              className="rounded-full bg-stone-900 text-white hover:bg-stone-800"
            >
              <Send className="h-4 w-4" />
              {submitting ? "Uploading..." : "Upload advert"}
            </Button>
          </div>
        </form>
      </SectionCard>

      <SectionCard
        title="Uploaded adverts"
        description="These are the items available for the homepage rail. Expired adverts remain here for history but stop rendering publicly."
      >
        {loading ? (
          <div className="h-48 animate-pulse rounded-3xl bg-stone-100" />
        ) : ads.length === 0 ? (
          <EmptyState
            title="No homepage adverts yet"
            description="Upload the first direct advert to make the homepage rail appear."
          />
        ) : (
          <PaginatedCardList
            items={ads}
            itemsPerPage={3}
            renderItem={(ad) => {
              const expired = ad.expiresAtMs <= Date.now();
              return (
                <div key={ad.id} className="rounded-3xl border border-stone-200 bg-white p-5">
                  <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
                    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-stone-100">
                      <div className="relative aspect-video">
                        {ad.mediaType === "video" ? (
                          <video
                            src={ad.mediaUrl}
                            className="h-full w-full object-cover"
                            muted
                            loop
                            playsInline
                          />
                        ) : (
                          <Image
                            src={ad.mediaUrl}
                            alt={ad.brandName}
                            fill
                            className="object-cover"
                          />
                        )}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-lg font-semibold text-stone-900">{ad.brandName}</p>
                        <StatusBadge label={ad.status} tone={ad.status === "active" ? "green" : "stone"} />
                        {expired ? <StatusBadge label="Expired" tone="amber" /> : null}
                        <StatusBadge
                          label={ad.mediaType === "video" ? "Video" : "Image"}
                          tone="blue"
                        />
                      </div>

                      <p className="text-sm leading-6 text-stone-600">{ad.writeup}</p>

                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-2xl bg-stone-50 p-3">
                          <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Phone</p>
                          <p className="mt-2 text-sm font-medium text-stone-900">{ad.phone}</p>
                        </div>
                        <div className="rounded-2xl bg-stone-50 p-3">
                          <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Email</p>
                          <p className="mt-2 text-sm font-medium text-stone-900">{ad.email}</p>
                        </div>
                        <div className="rounded-2xl bg-stone-50 p-3">
                          <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Starts</p>
                          <p className="mt-2 text-sm font-medium text-stone-900">{formatDate(ad.createdAtMs)}</p>
                        </div>
                        <div className="rounded-2xl bg-stone-50 p-3">
                          <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Expires</p>
                          <p className="mt-2 text-sm font-medium text-stone-900">{formatDate(ad.expiresAtMs)}</p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {ad.link ? (
                          <Button asChild variant="outline" className="rounded-full">
                            <a href={ad.link} target="_blank" rel="noreferrer">
                              <Phone className="h-4 w-4" />
                              Open link
                            </a>
                          </Button>
                        ) : null}
                        <Button
                          variant="outline"
                          className="rounded-full"
                          onClick={() => updateStatus(ad.id, ad.status === "active" ? "inactive" : "active")}
                        >
                          {ad.status === "active" ? (
                            <>
                              <ImageIcon className="h-4 w-4" />
                              Deactivate
                            </>
                          ) : (
                            <>
                              <Film className="h-4 w-4" />
                              Reactivate
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            }}
          />
        )}
      </SectionCard>
    </div>
  );
}
