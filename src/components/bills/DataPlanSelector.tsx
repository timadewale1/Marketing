"use client"

import React, { useMemo, useState } from 'react'
import { ChevronDown, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'

export type DataPlan = {
  code: string
  name: string
  amount: number
}

type PlanGroup = {
  type: 'Daily' | 'Weekly' | 'Monthly'
  plans: DataPlan[]
}

export function groupDataPlans(plans: DataPlan[]): PlanGroup[] {
  const grouped: Record<string, DataPlan[]> = { Daily: [], Weekly: [], Monthly: [] }

  plans.forEach(p => {
    const name = p.name.toLowerCase()
    // improved keyword matching to capture variations like "7days", "30 day", "weekly", etc.
    if (name.includes('daily') || name.includes('day') || /\b\d+[- ]?day(s)?\b/.test(name)) {
      grouped.Daily.push(p)
    } else if (name.includes('weekly') || name.includes('week') || /\b\d+[- ]?week(s)?\b/.test(name)) {
      grouped.Weekly.push(p)
    } else if (name.includes('monthly') || name.includes('month') || /\b\d+[- ]?month(s)?\b/.test(name)) {
      grouped.Monthly.push(p)
    } else {
      // default to Monthly if unclear
      grouped.Monthly.push(p)
    }
  })

  return Object.entries(grouped)
    .filter(([_, plans]) => plans.length > 0)
    .map(([type, plans]) => ({ type: type as 'Daily' | 'Weekly' | 'Monthly', plans }))
}

type DataPlanSelectorProps = {
  plans: DataPlan[]
  selectedCode: string
  onSelect: (code: string, amount: number) => void
}

export default function DataPlanSelector({ plans, selectedCode, onSelect }: DataPlanSelectorProps) {
  const [openGroup, setOpenGroup] = useState<'Daily' | 'Weekly' | 'Monthly' | null>('Monthly')
  const groups = useMemo(() => groupDataPlans(plans), [plans])
  const selected = plans.find(p => p.code === selectedCode)

  return (
    <div className="space-y-2">
      {groups.map((group) => (
        <div key={group.type} className="border border-stone-200 rounded-lg overflow-hidden bg-white">
          <button
            onClick={() => setOpenGroup(openGroup === group.type ? null : group.type)}
            className="w-full p-4 flex items-center justify-between hover:bg-amber-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-600" />
              <span className="font-semibold text-stone-900">{group.type} Plans</span>
              <span className="text-xs bg-stone-100 text-stone-600 px-2 py-1 rounded">{group.plans.length}</span>
            </div>
            <ChevronDown
              className={`w-5 h-5 text-stone-600 transition-transform ${
                openGroup === group.type ? 'rotate-180' : ''
              }`}
            />
          </button>

          {openGroup === group.type && (
            <div className="border-t border-stone-200 divide-y divide-stone-100">
              {group.plans.map((plan) => (
                <button
                  key={plan.code}
                  onClick={() => {
                    onSelect(plan.code, plan.amount)
                    setOpenGroup(null)
                  }}
                  className={`w-full p-4 text-left flex items-center justify-between hover:bg-amber-50 transition-colors ${
                    selectedCode === plan.code ? 'bg-amber-50' : ''
                  }`}
                >
                  <div className="flex-1">
                    <p className="font-medium text-stone-900">{plan.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-amber-600">₦{plan.amount.toLocaleString()}</p>
                    {selectedCode === plan.code && (
                      <p className="text-xs text-green-600 font-medium">Selected</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
