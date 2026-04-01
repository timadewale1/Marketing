"use client";

import { Users } from "lucide-react";

export const WHATSAPP_GROUP_URL = "https://chat.whatsapp.com/FcYJkb4LLpF0NboOxUEJeJ?mode=gi_t";

export default function WhatsAppGroupButton() {
  return (
    <a
      href={WHATSAPP_GROUP_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 right-6 z-50 bg-green-500 hover:bg-green-600 text-white p-4 rounded-full shadow-lg transition-all duration-300 hover:scale-110 hover:shadow-xl animate-pulse"
      aria-label="Join our WhatsApp group"
    >
      <Users size={40} />
    </a>
  );
}
