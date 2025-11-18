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
        <link rel="icon" href="/icons/icon-192.svg" sizes="192x192" />
        <link rel="apple-touch-icon" href="/icons/icon-192.svg" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
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
