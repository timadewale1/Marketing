"use client"

import { useState } from 'react'
import { Card } from "@/components/ui/card"

type FAQItem = {
  question: string
  answer: string
}

const faqs: FAQItem[] = [
  {
    question: "What is Blessed Token?",
    answer: "Blessed Token is a platform that connects advertisers with users who can earn rewards by engaging with advertisements and completing simple tasks like watching videos, filling surveys, or engaging with social media content."
  },
  {
    question: "How do I earn on Blessed Token?",
    answer: "You can earn by participating in available campaigns. Each campaign has specific tasks like watching videos, completing surveys, or social media engagement. Once you complete the task and provide proof, you'll receive tokens in your wallet."
  },
  {
    question: "How do I create an advertising campaign?",
    answer: "Sign up as an advertiser, verify your account, and click 'Create Campaign'. Choose your campaign type, set your budget, upload necessary media, and complete the payment. Your campaign will be reviewed and activated once approved."
  },
  {
    question: "What are the payment methods?",
    answer: "We currently accept payments through Paystack for advertisers funding campaigns. For earners, withdrawals are processed to verified Nigerian bank accounts."
  },
  {
    question: "How long does campaign approval take?",
    answer: "Most campaigns are reviewed and approved within 24-48 hours. We check for compliance with our guidelines and ensure all required information is provided."
  },
  {
    question: "What is the minimum withdrawal amount?",
    answer: "The minimum withdrawal amount is ₦1,000. Withdrawals are processed to verified Nigerian bank accounts only."
  },
  {
    question: "How are earnings calculated?",
    answer: "Earnings are based on the cost-per-lead (CPL) set for each campaign. Different campaign types have different CPL rates. Your earnings are credited immediately after your submission is verified."
  },
  {
    question: "Is my personal information secure?",
    answer: "Yes, we take data security seriously. We use industry-standard encryption and security measures to protect your personal information. We never share your data with third parties without your consent."
  },
  {
    question: "What happens if my campaign submission is rejected?",
    answer: "If your submission is rejected, you'll receive a notification explaining why. Common reasons include incomplete tasks or insufficient proof. You can try again with proper proof."
  },
  {
    question: "Can I have multiple accounts?",
    answer: "No, multiple accounts are not allowed. We have systems in place to detect duplicate accounts, and any user found operating multiple accounts will be suspended."
  }
]

export default function FAQPage() {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-200 via-amber-100 to-stone-300 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-center text-stone-800 mb-8">
          Frequently Asked Questions
        </h1>
        <div className="space-y-4">
          {faqs.map((faq, index) => (
            <Card
              key={index}
              className={`p-4 cursor-pointer transition-all duration-200 ${
                expandedIndex === index
                  ? 'bg-gradient-to-br from-amber-50 to-stone-100'
                  : 'hover:bg-gradient-to-br hover:from-amber-50 hover:to-stone-100'
              }`}
              onClick={() =>
                setExpandedIndex(expandedIndex === index ? null : index)
              }
            >
              <div className="flex justify-between items-start">
                <h3 className="text-lg font-medium text-stone-800">
                  {faq.question}
                </h3>
                <span className="text-2xl text-amber-600">
                  {expandedIndex === index ? '−' : '+'}
                </span>
              </div>
              {expandedIndex === index && (
                <p className="mt-3 text-stone-600">{faq.answer}</p>
              )}
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}