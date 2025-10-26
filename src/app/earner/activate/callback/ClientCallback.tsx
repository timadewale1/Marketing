"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";

type Props = {
  reference?: string;
};

export default function ClientCallback({ reference }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (reference) {
      (async () => {
        setLoading(true);
        try {
          const res = await fetch('/api/earner/activate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reference }),
          });
          const data = await res.json();
          if (data.success) {
            toast.success('Activation completed');
            setDone(true);
            setTimeout(() => router.push('/earner'), 1500);
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
    }
  }, [reference, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="max-w-lg w-full p-8 bg-white rounded-lg shadow text-center">
        <h1 className="text-xl font-bold mb-4">Activation confirmation</h1>
        {loading ? (
          <p>Verifying payment...</p>
        ) : done ? (
          <p>Activation successful. Redirecting...</p>
        ) : (
          <>
            <p className="mb-4">If you have completed payment, click below to verify and activate your account.</p>
            <Button onClick={async () => {
              if (!reference) return toast.error('No reference provided');
              setLoading(true);
              try {
                const res = await fetch('/api/earner/activate', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ reference }),
                });
                const data = await res.json();
                if (data.success) {
                  toast.success('Activation completed');
                  setDone(true);
                  setTimeout(() => router.push('/earner'), 1500);
                } else {
                  toast.error(data.message || 'Activation verification failed');
                }
              } catch (err) {
                console.error(err);
                toast.error('Activation verification failed');
              } finally { setLoading(false); }
            }}>{loading ? 'Verifying...' : 'Verify Activation'}</Button>
          </>
        )}
      </div>
    </div>
  );
}