"use client";

import { MessageCircle } from "lucide-react";

export default function WhatsAppChatButton() {
  return (
    <a
      href="https://wa.me/message/LVWEYWZSTQBQI1"
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 left-6 z-50 bg-green-500 hover:bg-green-600 text-white p-4 rounded-full shadow-lg transition-all duration-300 hover:scale-110 hover:shadow-xl animate-pulse"
      aria-label="Chat with us on WhatsApp"
    >
      <MessageCircle size={24} />
    </a>
  );
}