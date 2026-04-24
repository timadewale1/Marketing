import { NextRequest, NextResponse } from 'next/server'
import * as api from '@/services/vtpass/serviceApi'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type') || ''
    const parentCode = searchParams.get('parentCode') || ''

    if (!type) {
      return NextResponse.json({ ok: false, message: 'type required' }, { status: 400 })
    }

    let optionPath:
      | 'engine-capacity'
      | 'color'
      | 'state'
      | 'brand'
      | `model/${string}`
      | `lga/${string}`

    if (type === 'engine-capacity' || type === 'color' || type === 'state' || type === 'brand') {
      optionPath = type
    } else if (type === 'model') {
      if (!parentCode) {
        return NextResponse.json({ ok: false, message: 'parentCode required' }, { status: 400 })
      }
      optionPath = `model/${encodeURIComponent(parentCode)}`
    } else if (type === 'lga') {
      if (!parentCode) {
        return NextResponse.json({ ok: false, message: 'parentCode required' }, { status: 400 })
      }
      optionPath = `lga/${encodeURIComponent(parentCode)}`
    } else {
      return NextResponse.json({ ok: false, message: 'unsupported type' }, { status: 400 })
    }

    const result = await api.getInsuranceOptions(optionPath)
    return NextResponse.json({ ok: true, result })
  } catch (err) {
    console.error('bills options error', err)
    return NextResponse.json(
      { ok: false, message: 'Unable to load insurance options right now. Please try again shortly.' },
      { status: 502 }
    )
  }
}
