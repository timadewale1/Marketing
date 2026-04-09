import { Suspense } from "react"
import ClientAuthActionPage from "./ClientAuthActionPage"

export default function AuthActionPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[radial-gradient(circle_at_top,#fef3c7,transparent_35%),linear-gradient(135deg,#1c1917,#292524_45%,#44403c)] px-6 py-16 text-stone-100">
          <div className="mx-auto max-w-3xl rounded-3xl border border-white/10 bg-white/10 p-10 text-center backdrop-blur">
            <p className="text-sm uppercase tracking-[0.3em] text-amber-300">Pamba Account Center</p>
            <h1 className="mt-4 text-3xl font-semibold text-white">Preparing your secure action...</h1>
          </div>
        </div>
      }
    >
      <ClientAuthActionPage />
    </Suspense>
  )
}
