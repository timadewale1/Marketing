"use client";

import React, { useState } from "react";
import { auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import toast from "react-hot-toast";

export default function EarnerActivatePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const startActivation = async () => {
    setLoading(true);
    try {
      const user = auth.currentUser;
      if (!user) {
        toast.error("Please sign in to activate your account");
        router.push('/auth/sign-in');
        return;
      }

      const res = await fetch('/api/earner/init-activation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.uid }),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.message || 'Failed to start activation');
        return;
      }

      // Open Paystack payment page
      window.open(data.authorization_url, '_blank');
      toast.success('Payment window opened. After paying, you will be redirected to confirm.');
      // Optionally navigate to a waiting/confirm page
      router.push('/earner/activate/callback');
    } catch (err) {
      console.error(err);
      toast.error('Activation initialization failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="max-w-lg w-full p-8 bg-white rounded-lg shadow">
        <h1 className="text-xl font-bold mb-4">Activate your earner account</h1>
        <p className="mb-6">Pay ₦2,000 activation fee to start participating in campaigns.</p>
        <Button onClick={startActivation} disabled={loading} className="w-full">
          {loading ? 'Starting...' : 'Pay ₦2,000 to Activate'}
        </Button>
      </div>
    </div>
  );
}
