'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

const MAINTENANCE_ENABLED = process.env.NEXT_PUBLIC_MAINTENANCE_MODE === 'true'

// Pages that should NOT show maintenance mode
const EXCLUDED_PATHS = [
  '/admin',
  '/submissionmanagement',
  '/auth/sign-in',
  '/auth/sign-up',
  '/auth/forgot-password',
  '/auth/verify-email',
  '/contact',
  '/privacy',
  '/terms',
  '/faq',
  '/',
  '/advertise-directly',
]

function isExcludedPath(pathname: string): boolean {
  return EXCLUDED_PATHS.some(path => pathname.startsWith(path))
}

export function MaintenanceMode() {
  const pathname = usePathname()
  const [showMaintenance, setShowMaintenance] = useState(false)

  useEffect(() => {
    // Only show if maintenance is enabled and we're on a protected (non-excluded) page
    if (pathname && MAINTENANCE_ENABLED && !isExcludedPath(pathname)) {
      setShowMaintenance(true)
    } else {
      setShowMaintenance(false)
    }
  }, [pathname])

  if (!showMaintenance) {
    return null
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full mx-4">
        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 bg-yellow-100 rounded-full flex items-center justify-center">
              <svg
                className="w-8 h-8 text-yellow-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4v.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
          </div>
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-center text-gray-900 mb-2">
          We Are Sorry
        </h1>

        {/* Subtitle */}
        <p className="text-center text-gray-600 text-sm mb-6">
          We are currently experiencing server downtime issues
        </p>

        {/* Main Message */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <p className="text-gray-700 text-center text-sm">
            We sincerely apologize for the inconvenience. Our team is working hard to restore
            service. We will be back shortly.
          </p>
        </div>

        {/* Security Message */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <div className="flex items-start">
            <svg
              className="w-5 h-5 text-green-600 mt-0.5 mr-3 flex-shrink-0"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <div>
              <p className="text-sm font-medium text-green-800 mb-1">Your Funds Are Safe</p>
              <p className="text-sm text-green-700">
                Your earning balance and wallet funding balance are secure and will be available once we are back online.
              </p>
            </div>
          </div>
        </div>

        {/* Status Indicator */}
        <div className="flex justify-center items-center gap-2">
          <div className="flex gap-1">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
          </div>
          <span className="text-xs text-gray-500 ml-2">Maintenance in progress</span>
        </div>
      </div>
    </div>
  )
}
