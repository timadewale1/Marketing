"use client"

import { Card } from "@/components/ui/card"

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-200 via-gold-100 to-primary-300 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-center text-primary-800 mb-8">
          Terms of Service
        </h1>

        <Card className="p-8 space-y-6 bg-gradient-to-br from-gold-50 to-primary-100">
          <section>
            <h2 className="text-xl font-semibold text-primary-800 mb-3">1. Agreement to Terms</h2>
            <p className="text-primary-600">
                By accessing or using our platform, you agree to be bound by these terms and conditions. If you disagree with any part of these terms, you may not access our service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary-800 mb-3">2. Description of Service</h2>
            <p className="text-primary-600">
                We provide a platform connecting advertisers with users who can participate in marketing tasks for rewards. Users may earn money by completing tasks, while advertisers can reach their target audience effectively.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary-800 mb-3">3. User Responsibilities</h2>
            <div className="space-y-2 text-primary-600">
              <p>Users must:</p>
              <ul className="list-disc pl-6">
                <li>Provide accurate and truthful information</li>
                <li>Maintain only one active account</li>
                <li>Complete tasks honestly and as specified</li>
                <li>Not use automated methods or bots</li>
                <li>Not engage in fraudulent activities</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary-800 mb-3">4. Account Termination</h2>
            <p className="text-primary-600">
              We reserve the right to suspend or terminate accounts that violate these terms, engage in fraudulent activities, or abuse the platform. No refunds will be provided for terminated accounts.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary-800 mb-3">5. Payment Terms</h2>
            <div className="space-y-2 text-primary-600">
              <p>
                Payments are processed through secure third-party payment processors. We are not responsible for any issues with payment processing services.
              </p>
              <p>
                For earners:
              </p>
              <ul className="list-disc pl-6">
                <li>Minimum withdrawal amount is ₦1,000</li>
                <li>Withdrawals are processed to verified Nigerian bank accounts only</li>
                <li>We reserve the right to delay or reject suspicious withdrawal requests</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary-800 mb-3">6. Advertiser Terms</h2>
            <div className="space-y-2 text-primary-600">
              <p>Advertisers must:</p>
              <ul className="list-disc pl-6">
                <li>Provide accurate task information</li>
                <li>Not promote illegal or prohibited content</li>
                <li>Have proper rights to advertised content</li>
                <li>Accept our review and approval process</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary-800 mb-3">7. Limitation of Liability</h2>
            <div className="space-y-2 text-primary-600">
              <p>
                AllDaysJoy is provided &quot;as is&quot; without any warranties. We are not liable for:
              </p>
              <ul className="list-disc pl-6">
                <li>Service interruptions or technical issues</li>
                <li>Loss of earnings or opportunities</li>
                <li>Actions of other users</li>
                <li>Third-party payment processor issues</li>
                <li>Task performance or outcomes</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary-800 mb-3">8. Changes to Terms</h2>
            <p className="text-primary-600">
              We reserve the right to modify these terms at any time. Users will be notified of significant changes, and continued use of the platform constitutes acceptance of the new terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary-800 mb-3">9. Governing Law</h2>
            <p className="text-primary-600">
              These terms are governed by Nigerian law. Any disputes shall be subject to the exclusive jurisdiction of Nigerian courts.
            </p>
          </section>

          <div className="mt-8 text-sm text-primary-500">
            <p>Last updated: October 26, 2023</p>
            <p>For questions about these Terms, contact us at support@alldaysjoy.com</p>
          </div>
        </Card>
      </div>
    </div>
  )
}