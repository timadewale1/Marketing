'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#18181b', color: '#fafaf9' }}>
        <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
          <div style={{ maxWidth: 560, width: '100%', background: '#27272a', borderRadius: 24, padding: 32, border: '1px solid #3f3f46' }}>
            <h1 style={{ margin: 0, fontSize: 32 }}>Something went wrong</h1>
            <p style={{ marginTop: 12, color: '#d4d4d8', lineHeight: 1.6 }}>
              We hit an unexpected error. Please try again.
            </p>
            <button
              onClick={() => reset()}
              style={{
                marginTop: 20,
                border: 0,
                borderRadius: 999,
                padding: '12px 18px',
                background: '#f59e0b',
                color: '#111827',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
            <p style={{ marginTop: 16, fontSize: 12, color: '#a1a1aa' }}>{error.message}</p>
          </div>
        </main>
      </body>
    </html>
  )
}
