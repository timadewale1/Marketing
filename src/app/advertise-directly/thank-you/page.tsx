import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export default function ThankYouPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-100 via-amber-100 to-stone-200 py-24">
      <div className="container mx-auto px-4 max-w-2xl">
        <Card className="p-8 text-center">
          <h1 className="text-2xl font-semibold mb-4">Thanks — we&apos;ve received your request</h1>
          <p className="text-stone-700 mb-6">Our team will review your request and reach out within 1 business day.</p>
          <div className="flex justify-center">
            <Button asChild className="bg-amber-500 hover:bg-amber-600 text-stone-900">
              <Link href="/">Back to home</Link>
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
