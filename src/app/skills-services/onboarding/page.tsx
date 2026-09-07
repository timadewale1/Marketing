"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { auth, storage } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { SERVICE_CATEGORIES, SERVICE_SKILLS } from "@/lib/service-marketplace";
import toast from "react-hot-toast";

type FormState = Record<string, string>;

function OnboardingForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [type, setType] = useState(
    params?.get("type") === "provider" ? "provider" : "customer",
  );
  const [form, setForm] = useState<FormState>({
    name: "",
    phone: "",
    location: "",
    city: "",
    state: "",
    bio: "",
    profileImageUrl: "",
    experience: "",
    availability: "",
    whatsapp: "",
    skills: "",
    services: "",
    categories: "",
  });
  const [loading, setLoading] = useState(true);
  const [portfolioFiles, setPortfolioFiles] = useState<File[]>([]);
  const [profileImageFile, setProfileImageFile] = useState<File | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace("/skills-services/sign-in");
        return;
      }
      user
        .getIdToken()
        .then((token) =>
          fetch("/api/skills-services/account", {
            headers: { Authorization: `Bearer ${token}` },
          }),
        )
        .then((response) => response?.json())
        .then((data) => {
          if (!data?.account) return;
          const account = data.account;
          setType(account.accountType);
          setForm((old) => ({
            ...old,
            ...account,
            skills: (account.skills || []).join(", "),
            services: (account.services || []).join(", "),
            categories: (account.categories || []).join(", "),
          }));
        })
        .catch(() => undefined)
        .finally(() => setLoading(false));
    });
    return () => unsubscribe();
  }, [router]);

  const update = (key: string, value: string) =>
    setForm((old) => ({ ...old, [key]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const token = await auth.currentUser?.getIdToken();
    if (!token) return router.push("/skills-services/sign-in");
    setLoading(true);
    const portfolio = await Promise.all(
      portfolioFiles.map(async (file) => {
        const storageRef = ref(
          storage,
          `service-portfolio/${auth.currentUser?.uid}/${Date.now()}-${file.name}`,
        );
        const snapshot = await uploadBytes(storageRef, file);
        return {
          url: await getDownloadURL(snapshot.ref),
          type: file.type.startsWith("video/") ? "video" : "image",
        };
      }),
    );
    let profileImageUrl = form.profileImageUrl || "";
    if (type === "provider" && profileImageFile) {
      const imageRef = ref(
        storage,
        `service-profile-images/${auth.currentUser?.uid}/${Date.now()}-${profileImageFile.name}`,
      );
      const snapshot = await uploadBytes(imageRef, profileImageFile);
      profileImageUrl = await getDownloadURL(snapshot.ref);
    }
    const payload = {
      ...form,
      profileImageUrl,
      accountType: type,
      skills: form.skills
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      services: form.services
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      categories: form.categories
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      portfolio,
    };
    const response = await fetch("/api/skills-services/account", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    setLoading(false);
    if (!response.ok)
      return toast.error(data.message || "Could not save profile");
    toast.success("Profile saved");
    router.push("/skills-services/dashboard");
  };

  if (loading)
    return <main className="p-12 text-center">Loading your profile...</main>;

  const fields = [
    "name:Full name",
    "phone:Phone",
    "location:Location",
    "city:City",
    "state:State",
    "whatsapp:WhatsApp link",
  ];
  return (
    <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <div className="mb-8">
        <p className="text-sm font-bold uppercase tracking-[.18em] text-amber-700">
          Onboarding
        </p>
        <h1 className="mt-2 text-3xl font-black">Tell people what you do</h1>
        <p className="mt-2 text-stone-600">
          Complete your profile so customers can make an informed decision.
          Rates stay between you and the customer.
        </p>
      </div>
      <form
        onSubmit={submit}
        className="grid gap-5 rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm sm:grid-cols-2 sm:p-8"
      >
        <div className="sm:col-span-2">
          <label className="text-sm font-bold">I am joining as</label>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setType("provider")}
              className={`rounded-full px-5 py-2 text-sm font-bold ${type === "provider" ? "bg-amber-500 text-stone-900" : "bg-stone-100 text-stone-600"}`}
            >
              Service provider
            </button>
            <button
              type="button"
              onClick={() => setType("customer")}
              className={`rounded-full px-5 py-2 text-sm font-bold ${type === "customer" ? "bg-amber-500 text-stone-900" : "bg-stone-100 text-stone-600"}`}
            >
              Customer
            </button>
          </div>
        </div>
        {fields.map((field) => {
          const [key, label] = field.split(":");
          return (
            <label key={key} className="text-sm font-bold">
              {label}
              <input
                required={key === "name" || key === "phone"}
                value={form[key] || ""}
                onChange={(event) => update(key, event.target.value)}
                className="mt-2 w-full rounded-xl border border-stone-300 px-4 py-3 font-normal outline-none focus:border-amber-500"
              />
            </label>
          );
        })}
        <label className="text-sm font-bold sm:col-span-2">
          About you
          <textarea
            value={form.bio || ""}
            onChange={(event) => update("bio", event.target.value)}
            rows={4}
            className="mt-2 w-full rounded-xl border border-stone-300 px-4 py-3 font-normal outline-none focus:border-amber-500"
          />
        </label>
        {type === "provider" && (
          <>
            <label className="text-sm font-bold sm:col-span-2">
              Profile picture or business logo
              <input
                type="file"
                accept="image/*"
                onChange={(event) => setProfileImageFile(event.target.files?.[0] || null)}
                className="mt-2 block w-full rounded-xl border border-stone-300 px-4 py-3 text-sm font-normal"
              />
              <span className="mt-1 block text-xs font-normal text-stone-500">
                Use a clear photo or logo. This image will appear on your public provider card.
              </span>
            </label>
            <label className="text-sm font-bold">
              Skills{" "}
              <span className="font-normal text-stone-500">
                (comma separated)
              </span>
              <input
                value={form.skills || ""}
                placeholder={SERVICE_SKILLS.slice(0, 2).join(", ")}
                onChange={(event) => update("skills", event.target.value)}
                className="mt-2 w-full rounded-xl border border-stone-300 px-4 py-3 font-normal outline-none focus:border-amber-500"
              />
            </label>
            <label className="text-sm font-bold">
              Categories{" "}
              <span className="font-normal text-stone-500">
                (comma separated)
              </span>
              <input
                value={form.categories || ""}
                placeholder={SERVICE_CATEGORIES[0]}
                onChange={(event) => update("categories", event.target.value)}
                className="mt-2 w-full rounded-xl border border-stone-300 px-4 py-3 font-normal outline-none focus:border-amber-500"
              />
            </label>
            <label className="text-sm font-bold">
              Services offered{" "}
              <span className="font-normal text-stone-500">
                (comma separated)
              </span>
              <input
                value={form.services || ""}
                onChange={(event) => update("services", event.target.value)}
                className="mt-2 w-full rounded-xl border border-stone-300 px-4 py-3 font-normal outline-none focus:border-amber-500"
              />
            </label>
            <label className="text-sm font-bold">
              Experience / past work
              <textarea
                value={form.experience || ""}
                onChange={(event) => update("experience", event.target.value)}
                rows={3}
                className="mt-2 w-full rounded-xl border border-stone-300 px-4 py-3 font-normal outline-none focus:border-amber-500"
              />
            </label>
            <label className="text-sm font-bold">
              Availability
              <input
                value={form.availability || ""}
                onChange={(event) => update("availability", event.target.value)}
                placeholder="Weekdays, weekends, remote..."
                className="mt-2 w-full rounded-xl border border-stone-300 px-4 py-3 font-normal outline-none focus:border-amber-500"
              />
            </label>
            <label className="text-sm font-bold sm:col-span-2">
              Past work images or videos
              <input
                type="file"
                accept="image/*,video/*"
                multiple
                onChange={(event) =>
                  setPortfolioFiles(
                    Array.from(event.target.files || []).slice(0, 8),
                  )
                }
                className="mt-2 block w-full rounded-xl border border-stone-300 px-4 py-3 text-sm font-normal"
              />
              <span className="mt-1 block text-xs font-normal text-stone-500">
                Upload up to 8 examples. Keep each file reasonably sized.
              </span>
            </label>
          </>
        )}
        <button
          disabled={loading}
          className="rounded-xl bg-amber-500 px-5 py-3 font-bold text-stone-900 hover:bg-amber-400 sm:col-span-2"
        >
          {loading ? "Saving..." : "Complete onboarding"}
        </button>
      </form>
    </main>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<main className="p-10 text-center">Loading...</main>}>
      <OnboardingForm />
    </Suspense>
  );
}
