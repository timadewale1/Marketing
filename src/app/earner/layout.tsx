"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { deleteField, doc, getDoc, updateDoc } from "firebase/firestore";
import { shouldAutoUnsuspendEarner } from "@/lib/earner-suspension";

export default function EarnerLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push('/auth/sign-in');
        return;
      }

      try {
        const earnerRef = doc(db, "earners", user.uid);
        const earnerSnap = await getDoc(earnerRef);
        if (earnerSnap.exists() && shouldAutoUnsuspendEarner(earnerSnap.data())) {
          await updateDoc(earnerRef, {
            status: "active",
            strikeCount: 0,
            suspensionReason: deleteField(),
            suspendedAt: deleteField(),
            suspensionReleaseAt: deleteField(),
            suspensionDurationDays: deleteField(),
            suspensionIndefinite: deleteField(),
            lastStrikeUpdatedAt: deleteField(),
          });
        }
      } catch (error) {
        console.error("Failed to auto-unsuspend earner on layout load", error);
      }
    });

    return () => unsubscribe();
  }, [router]);

  return <div className="min-w-0 overflow-x-hidden">{children}</div>;
}
