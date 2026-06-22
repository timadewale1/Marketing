"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function VendorCreateTaskRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/advertiser/create-campaign");
  }, [router]);

  return (
    <div className="min-h-[40vh] flex items-center justify-center text-sm text-stone-600">
      Opening task creation...
    </div>
  );
}
