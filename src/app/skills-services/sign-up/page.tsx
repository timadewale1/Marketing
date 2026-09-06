"use client";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import { BriefcaseBusiness, UserRound } from "lucide-react";
import toast from "react-hot-toast";

function SignUpForm() {
  const params = useSearchParams();
  const router = useRouter();
  const [type, setType] = useState(
    params?.get("type") === "customer" ? "customer" : "provider",
  );
  const [existingAccount, setExistingAccount] = useState(false);
  const [existingAccountFound, setExistingAccountFound] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    location: "",
    city: "",
    state: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (existingAccount && !existingAccountFound) {
      toast.error("Find your existing Pamba details before continuing.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/skills-services/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          accountType: type,
          linkExisting: existingAccount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      toast.success(data.message);
      if (!data.linked) router.push("/skills-services/sign-in");
      setLoading(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not create account",
      );
    } finally {
      setLoading(false);
    }
  };
  const lookupExistingAccount = async () => {
    if (!form.email)
      return toast.error("Enter your existing Pamba email first.");
    setLookupLoading(true);
    setExistingAccountFound(false);
    try {
      const response = await fetch("/api/skills-services/signup/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      setForm((current) => ({ ...current, ...data.profile }));
      setExistingAccountFound(true);
      toast.success(
        "Your Pamba details were found. Review and edit them below.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not find your account",
      );
    } finally {
      setLookupLoading(false);
    }
  };
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <div className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm sm:p-10">
        <p className="text-sm font-bold uppercase tracking-[.18em] text-amber-700">
          Join the directory
        </p>
        <h1 className="mt-2 text-3xl font-black">
          Create your service account
        </h1>
        <p className="mt-2 text-stone-600">
          Existing PAMBA users can sign in and complete onboarding with their
          current account.
        </p>
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={existingAccount}
              onChange={(event) => {
                setExistingAccount(event.target.checked);
                setExistingAccountFound(false);
              }}
              className="mt-1 h-4 w-4 accent-amber-500"
            />
            <span>
              <span className="block font-bold text-stone-900">
                I already have a Pamba account
              </span>
              <span className="mt-1 block text-sm text-stone-600">
                Use your existing verified email and profile details. You will
                not create another password.
              </span>
            </span>
          </label>
        </div>
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <button
            onClick={() => setType("provider")}
            className={`rounded-2xl border p-4 text-left ${type === "provider" ? "border-amber-400 bg-amber-50" : "border-stone-200"}`}
          >
            <BriefcaseBusiness className="text-amber-600" />
            <p className="mt-3 font-black">Service provider</p>
            <p className="mt-1 text-sm text-stone-600">
              List your skills and get discovered.
            </p>
          </button>
          <button
            onClick={() => setType("customer")}
            className={`rounded-2xl border p-4 text-left ${type === "customer" ? "border-amber-400 bg-amber-50" : "border-stone-200"}`}
          >
            <UserRound className="text-amber-600" />
            <p className="mt-3 font-black">Customer</p>
            <p className="mt-1 text-sm text-stone-600">
              Find and connect with professionals.
            </p>
          </button>
        </div>
        <form onSubmit={submit} className="mt-8 grid gap-4 sm:grid-cols-2">
          <input
            required
            placeholder="Full name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="rounded-xl border border-stone-300 px-4 py-3 outline-none focus:border-amber-500"
          />
          <input
            required
            type="tel"
            placeholder="Phone number"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="rounded-xl border border-stone-300 px-4 py-3 outline-none focus:border-amber-500"
          />
          <input
            required
            type="email"
            placeholder="Email address"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="rounded-xl border border-stone-300 px-4 py-3 outline-none focus:border-amber-500 sm:col-span-2"
          />
          {existingAccount ? (
            <>
              <button
                type="button"
                onClick={() => void lookupExistingAccount()}
                disabled={lookupLoading}
                className="rounded-xl border border-amber-300 px-5 py-3 font-bold text-amber-800 hover:bg-amber-50 sm:col-span-2"
              >
                {lookupLoading
                  ? "Finding your Pamba account..."
                  : "Find my existing Pamba details"}
              </button>
              {existingAccountFound && (
                <>
                  <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 sm:col-span-2">
                    Details found. You can edit them before requesting the
                    secure link.
                  </p>
                  {["location:Location", "city:City", "state:State"].map(
                    (field) => {
                      const [key, label] = field.split(":");
                      return (
                        <label
                          key={key}
                          className="text-sm font-bold text-stone-700"
                        >
                          {label}
                          <input
                            value={form[key]}
                            onChange={(event) =>
                              setForm({ ...form, [key]: event.target.value })
                            }
                            placeholder={`Enter ${label.toLowerCase()}`}
                            className="mt-2 w-full rounded-xl border border-stone-300 px-4 py-3 font-normal outline-none focus:border-amber-500"
                          />
                        </label>
                      );
                    },
                  )}
                </>
              )}
            </>
          ) : (
            <input
              required
              minLength={6}
              type="password"
              placeholder="Password (6+ characters)"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="rounded-xl border border-stone-300 px-4 py-3 outline-none focus:border-amber-500 sm:col-span-2"
            />
          )}
          <button
            disabled={loading}
            className="rounded-xl bg-amber-500 px-5 py-3 font-bold text-stone-900 hover:bg-amber-400 sm:col-span-2"
          >
            {loading
              ? "Processing..."
              : existingAccount
                ? "Send secure linking email"
                : "Create service account"}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-stone-600">
          Already have a PAMBA account?{" "}
          <Link
            href="/skills-services/sign-in"
            className="font-bold text-amber-700"
          >
            Sign in and link it
          </Link>
        </p>
      </div>
    </main>
  );
}
export default function SignUpPage() {
  return (
    <Suspense fallback={<main className="p-10 text-center">Loading...</main>}>
      <SignUpForm />
    </Suspense>
  );
}
