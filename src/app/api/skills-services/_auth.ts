import { initFirebaseAdmin } from "@/lib/firebaseAdmin";

export async function requireServiceUser(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Unauthorized");
  const { admin, dbAdmin } = await initFirebaseAdmin();
  if (!admin || !dbAdmin) throw new Error("Firebase admin unavailable");
  const decoded = await admin.auth().verifyIdToken(token);
  return {
    admin,
    dbAdmin,
    uid: decoded.uid,
    email: String(decoded.email || ""),
  };
}
