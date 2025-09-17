import "./globals.css"
import { Toaster } from "react-hot-toast"

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
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
