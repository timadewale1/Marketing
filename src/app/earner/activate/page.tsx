"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

// This page previously started a redirect-based activation flow. We now use inline Paystack modals.
export default function EarnerActivatePage() {
  const router = useRouter();

  useEffect(() => {
    toast('Activation now happens inline. Use the Activate button on your dashboard.', { icon: 'ℹ️' });
    const t = setTimeout(() => router.replace('/earner'), 1500);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="max-w-lg w-full p-8 bg-white rounded-lg shadow text-center">
        <h1 className="text-xl font-bold mb-4">Activation moved inline</h1>
        <p className="mb-4">The activation flow now opens an inline Paystack modal from your dashboard. You will be redirected back shortly.</p>
        <p className="text-sm text-stone-500">If you were redirected here from Paystack, the activation callback is handled automatically.</p>
      </div>
    </div>
  );
}
