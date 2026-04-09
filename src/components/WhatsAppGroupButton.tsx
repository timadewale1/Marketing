"use client";

import { Users } from "lucide-react";

export const WHATSAPP_GROUP_URL = "https://chat.whatsapp.com/HxvnJo7OpA24IPPKkAZqxp?mode=gi_t";

type WhatsAppGroupButtonProps = {
  url?: string;
  ariaLabel?: string;
};

export default function WhatsAppGroupButton({
  url = WHATSAPP_GROUP_URL,
  ariaLabel = "Join our WhatsApp group",
}: WhatsAppGroupButtonProps) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 right-6 z-50 bg-green-500 hover:bg-green-600 text-white p-4 rounded-full shadow-lg transition-all duration-300 hover:scale-110 hover:shadow-xl animate-pulse"
      aria-label={ariaLabel}
    >
      <Users size={40} />
    </a>
  );
}
