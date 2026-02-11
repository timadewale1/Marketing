"use client"

import { useState } from 'react'
import { Card } from "@/components/ui/card"

type FAQItem = {
  question: string
  answer: string
}

const faqs: FAQItem[] = [
  {
    question: "Is PAMBA an investment platform?",
    answer: "No. PAMBA does not offer investments, interest, or guaranteed returns."
  },
  {
    question: "How do I withdraw my earnings?",
    answer: "Earnings can be withdrawn directly to your bank account or used to pay bills through your wallet."
  },
  {
    question: "Is my money safe?",
    answer: "Yes. All payments are processed through licensed and regulated payment partners."
  },
  {
    question: "What can I advertise on PAMBA?",
    answer: "Products, services, websites, social media pages, apps, videos, and online platforms."
  },
  {
    question: "Do I get real engagement?",
    answer: "Yes. Tasks are completed by real users within the PAMBA community."
  },
  {
    question: "How do I pay for ads?",
    answer: "You fund your wallet and create tasks. Payments are handled securely via our payment partners."
  },
  {
    question: "Are there content restrictions?",
    answer: "Yes. Illegal, misleading, or prohibited content is not allowed."
  },
  {
    question: "What is PAMBA?",
    answer: "PAMBA is a platform that connects advertisers with users who can earn rewards by engaging with advertisements and completing simple tasks like watching videos, filling surveys, or engaging with social media content."
  },
  {
    question: "How do I earn on PAMBA?",
    answer: "You can earn by participating in available tasks. Each task has specific actions like watching videos, completing surveys, or social media engagement. Once you complete the task and provide proof, you'll receive rewards in your wallet."
  },
  {
    question: "How do I create an advertising task?",
    answer: "Sign up as an advertiser, verify your account, and click 'Create Task'. Choose your task type, set your budget, add necessary media or links, and complete the payment. Your task will be reviewed and activated once approved."
  },
  {
    question: "What are the payment methods?",
    answer: "We accept payments through Monnify for all transactions. Withdrawals are processed to verified Nigerian bank accounts."
  },
  {
    question: "How long does task approval take?",
    answer: "Most tasks are reviewed and approved within 24-48 hours. We check for compliance with our guidelines and ensure all required information is provided."
  },
  {
    question: "What is the minimum withdrawal amount?",
    answer: "The minimum withdrawal amount is ₦1,000. Withdrawals are processed to verified Nigerian bank accounts only."
  },
  {
    question: "How are earnings calculated?",
    answer: "Earnings are based on the cost-per-lead (CPL) set for each task. Different task types have different CPL rates. Your earnings are credited immediately after your submission is verified."
  },
  {
    question: "Is my personal information secure?",
    answer: "Yes, we take data security seriously. We use industry-standard encryption and security measures to protect your personal information. We never share your data with third parties without your consent."
  },
  {
    question: "What happens if my task submission is rejected?",
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