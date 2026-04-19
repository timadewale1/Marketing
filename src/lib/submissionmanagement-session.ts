import crypto from "crypto"
import { cookies } from "next/headers"

const COOKIE_NAME = "submissionManagementSession"
const SESSION_EXPIRES_MS = 5 * 24 * 60 * 60 * 1000
const LOGIN_EMAIL = process.env.SUBMISSION_MANAGEMENT_EMAIL || ""
const LOGIN_PASSWORD = process.env.SUBMISSION_MANAGEMENT_PASSWORD || ""
const SESSION_SECRET = process.env.SUBMISSION_MANAGEMENT_SESSION_SECRET || ""

type SessionPayload = {
  scope: "submissionmanagement"
  email: string
  exp: number
}

function encodePayload(payload: SessionPayload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url")
  const signature = crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("hex")
  return `${body}.${signature}`
}

function decodePayload(token: string): SessionPayload | null {
  const [body, signature] = token.split(".")
  if (!body || !signature) return null

  const expected = crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("hex")
  if (expected !== signature) return null

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload
    if (payload.scope !== "submissionmanagement") return null
    if (!payload.exp || payload.exp <= Date.now()) return null
    return payload
  } catch {
    return null
  }
}

export function validateSubmissionManagementCredentials(email: string, password: string) {
  return email.trim().toLowerCase() === LOGIN_EMAIL && password === LOGIN_PASSWORD
}

export async function setSubmissionManagementSessionCookie() {
  const cookieStore = await cookies()
  const payload: SessionPayload = {
    scope: "submissionmanagement",
    email: LOGIN_EMAIL,
    exp: Date.now() + SESSION_EXPIRES_MS,
  }

  cookieStore.set({
    name: COOKIE_NAME,
    value: encodePayload(payload),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_EXPIRES_MS / 1000,
  })
}

export async function clearSubmissionManagementSessionCookie() {
  const cookieStore = await cookies()
  cookieStore.set({
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  })
}

export async function requireSubmissionManagementSession() {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) {
    throw new Error("Unauthorized")
  }

  const payload = decodePayload(token)
  if (!payload) {
    throw new Error("Unauthorized")
  }

  return payload
}

export const SUBMISSION_MANAGEMENT_EMAIL = LOGIN_EMAIL

