import { NextResponse } from "next/server"

export async function POST(req: Request) {
  return NextResponse.json(
    { error: "Dedicated wallet accounts are not available. Use Monnify wallet funding." },
    { status: 410 },
  )
}
