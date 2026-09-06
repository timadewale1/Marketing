"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function LinkAccount() {
  const params = useSearchParams();
  const [message, setMessage] = useState("Confirming your account link...");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const token = params?.get("token") || "";
    if (!token) {
      setMessage("This account link is invalid or has expired.");
      return;
    }
    fetch("/api/skills-services/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then((response) => response.json().then((data) => ({ response, data })))
      .then(({ response, data }) => {
        if (!response.ok || !data.success) throw new Error(data.message);
        setSuccess(true);
        setMessage(data.message);
      })
      .catch((error) =>
        setMessage(
          error instanceof Error
            ? error.message
            : "Could not complete account linking.",
        ),
      );
  }, [params]);

  return (
    <main className="mx-auto max-w-md px-4 py-20">
      <div className="rounded-[2rem] border border-stone-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-bold uppercase tracking-[.18em] text-amber-700">
          PAMBA Skills & Services
        </p>
        <h1 className="mt-3 text-2xl font-black">
          {success ? "Account linked" : "Account confirmation"}
        </h1>
        <p className="mt-3 text-stone-600">{message}</p>
        {success && (
          <Link
            href="/skills-services/sign-in"
            className="mt-6 inline-block rounded-xl bg-amber-500 px-5 py-3 font-bold text-stone-900"
          >
            Continue to sign in
          </Link>
        )}
      </div>
    </main>
  );
}

export default function LinkPage() {
  return (
    <Suspense fallback={<main className="p-10 text-center">Loading...</main>}>
      <LinkAccount />
    </Suspense>
  );
}
