"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

// This component handles any lingering Paystack redirects by checking for reference/trxref in URL
export default function ClientCallback() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Attempt to read reference from query parameters
    let refToUse: string | null = null;
    try {
      const params = new URLSearchParams(window.location.search);
      refToUse = params.get('reference') || params.get('trxref') || null;
    } catch {
      refToUse = null;
    }

    if (refToUse) {
      (async () => {
        setLoading(true);
        try {
          const res = await fetch('/api/earner/activate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reference: refToUse }),
          });
          const data = await res.json();
          if (data.success) {
            toast.success('Activation completed');
            setTimeout(() => router.push('/earner'), 1200);
          } else {
            toast.error(data.message || 'Activation verification failed');
          }
        } catch (err) {
          console.error(err);
          toast.error('Activation verification failed');
        } finally {
          setLoading(false);
        }
      })();
    } else {
      // No reference — redirect back to dashboard after a moment
      setTimeout(() => router.replace('/earner'), 1200);
    }
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="max-w-lg w-full p-8 bg-white rounded-lg shadow text-center">
        {loading ? <p>Verifying activation...</p> : <p>Checking activation status — you will be redirected shortly.</p>}
      </div>
    </div>
  );
}