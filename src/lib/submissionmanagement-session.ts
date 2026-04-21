import crypto from "crypto"
import { cookies } from "next/headers"

const COOKIE_NAME = "submissionManagementSession"
const SESSION_EXPIRES_MS = 5 * 24 * 60 * 60 * 1000

function getSubmissionManagementSessionSecret() {
  return String(process.env.SUBMISSION_MANAGEMENT_SESSION_SECRET || "")
}

function getSubmissionManagementEmail() {
  return String(process.env.SUBMISSION_MANAGEMENT_EMAIL || "").trim().toLowerCase()
}

function getSubmissionManagementPassword() {
  return String(process.env.SUBMISSION_MANAGEMENT_PASSWORD || "").trim()
}

type SessionPayload = {
  scope: "submissionmanagement"
  email: string
  exp: number
}

function encodePayload(payload: SessionPayload) {
  const sessionSecret = getSubmissionManagementSessionSecret()
  if (!sessionSecret) {
    throw new Error("Submission management session secret is not configured")
  }
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url")
  const signature = crypto.createHmac("sha256", sessionSecret).update(body).digest("hex")
  return `${body}.${signature}`
}

function decodePayload(token: string): SessionPayload | null {
  const sessionSecret = getSubmissionManagementSessionSecret()
  if (!sessionSecret) return null
  const [body, signature] = token.split(".")
  if (!body || !signature) return null

  const expected = crypto.createHmac("sha256", sessionSecret).update(body).digest("hex")
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
  const configuredEmail = getSubmissionManagementEmail()
  const configuredPassword = getSubmissionManagementPassword()
  if (!configuredEmail || !configuredPassword) return false
  return email.trim().toLowerCase() === configuredEmail && password.trim() === configuredPassword
}

export function getSubmissionManagementConfig() {
  const email = getSubmissionManagementEmail()
  const password = getSubmissionManagementPassword()
  return {
    email,
    configured: Boolean(email && password && getSubmissionManagementSessionSecret()),
  }
}

export async function setSubmissionManagementSessionCookie() {
  const cookieStore = await cookies()
  const { email } = getSubmissionManagementConfig()
  const payload: SessionPayload = {
    scope: "submissionmanagement",
    email,
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

