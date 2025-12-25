import "./globals.css"
import { Toaster } from "react-hot-toast"
import PwaInstaller from "@/components/PwaInstaller"

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#f59e0b" />
        {/* Use link tags in head instead of an img to avoid invalid HTML nesting */}
        <link rel="icon" href="/Pamba-phone.png" sizes="192x192" />
        <link rel="apple-touch-icon" href="/Pamba-phone.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        {/* Open Graph / Twitter metadata for link previews and install UX */}
        <meta property="og:site_name" content="PAMBA" />
        <meta property="og:title" content="PAMBA" />
        <meta property="og:description" content="PAMBA — Earn rewards by participating in marketing campaigns" />
        <meta property="og:image" content="/Pamba.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="PAMBA" />
        <meta name="twitter:description" content="PAMBA — Earn rewards by participating in marketing campaigns" />
        <meta name="twitter:image" content="/Pamba.png" />
      </head>
      <body>
        <PwaInstaller />
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: "#1C1917", // stone-900
              color: "#fff",
              borderRadius: "0.5rem",
              padding: "0.75rem 1rem",
            },
            success: {
              iconTheme: {
                primary: "#22c55e", // green-500
                secondary: "#fff",
              },
            },
            error: {
              iconTheme: {
                primary: "#ef4444", // red-500
                secondary: "#fff",
              },
            },
          }}
        />
      </body>
    </html>
  )
}
