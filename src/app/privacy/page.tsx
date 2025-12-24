"use client"

import { Card } from "@/components/ui/card"

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-100 via-gold-100 to-primary-200 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-center text-primary-800 mb-8">
          Privacy Policy
        </h1>

        <Card className="p-8 space-y-6 bg-gradient-to-br from-gold-50 to-primary-100">
          <section>
            <h2 className="text-xl font-semibold text-primary-800 mb-3">1. Introduction</h2>
            <p className="text-primary-600">
              This Privacy Policy explains how PAMBA (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) collects, uses, and protects your personal information. By using our service, you agree to the collection and use of information in accordance with this policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary-800 mb-3">2. Information We Collect</h2>
            <div className="space-y-2 text-primary-600">
              <p>We collect the following types of information:</p>
              <ul className="list-disc pl-6">
                <li>Name and contact information</li>
                <li>Email address</li>
                <li>Bank account details (for withdrawals)</li>
                <li>Device and browser information</li>
                <li>Usage data and activity logs</li>
                <li>Task participation data</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary-800 mb-3">3. How We Use Your Information</h2>
            <div className="space-y-2 text-primary-600">
              <p>We use your information to:</p>
              <ul className="list-disc pl-6">
                <li>Provide and maintain our service</li>
                <li>Process payments and withdrawals</li>
                <li>Verify task participation</li>
                <li>Prevent fraud and abuse</li>
                <li>Communicate with you about our service</li>
                <li>Improve our platform</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary-800 mb-3">4. Information Sharing</h2>
            <div className="space-y-2 text-primary-600">
              <p>We may share your information with:</p>
              <ul className="list-disc pl-6">
                <li>Payment processors (for transaction processing)</li>
                <li>Advertisers (limited task participation data)</li>
                <li>Service providers (hosting, analytics, etc.)</li>
                <li>Law enforcement (when legally required)</li>
              </ul>
              <p>
                We do not sell your personal information to third parties.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary-800 mb-3">5. Data Security</h2>
            <p className="text-primary-600">
              We implement appropriate security measures to protect your data. However, no method of transmission over the internet is 100% secure. We cannot guarantee absolute security of your data.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary-800 mb-3">6. Cookies and Tracking</h2>
            <p className="text-primary-600">
              We use cookies and similar tracking technologies to collect usage data and maintain your session. You can control cookie settings through your browser preferences.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary-800 mb-3">7. Your Rights</h2>
            <div className="space-y-2 text-primary-600">
              <p>You have the right to:</p>
              <ul className="list-disc pl-6">
                <li>Access your personal data</li>
                <li>Correct inaccurate data</li>
                <li>Request deletion of your data</li>
                <li>Object to data processing</li>
                <li>Export your data</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary-800 mb-3">8. Data Retention</h2>
            <p className="text-primary-600">
              We retain your information for as long as your account is active or as needed to provide services. We may retain certain data as required by law or for legitimate business purposes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary-800 mb-3">9. Children&quot;s Privacy</h2>
            <p className="text-primary-600">
              Our service is not intended for use by children under 18. We do not knowingly collect information from children under 18.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary-800 mb-3">10. Changes to Privacy Policy</h2>
            <p className="text-primary-600">
              We may update this policy periodically. We will notify you of significant changes by posting the new policy on this page.
            </p>
          </section>

          <div className="mt-8 text-sm text-primary-500">
            <p>Last updated: October 26, 2023</p>
            <p>For privacy-related questions, contact us at privacy@pamba.com</p>
          </div>
        </Card>
      </div>
    </div>
  )
}