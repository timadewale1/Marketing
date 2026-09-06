import { NextResponse } from "next/server";
import { initFirebaseAdmin } from "@/lib/firebaseAdmin";
import { buildCustomFirebaseActionLink } from "@/lib/firebase-action-links";
import {
  sendServiceAccountLinkEmail,
  sendVerificationEmail,
} from "@/lib/mailer";
import crypto from "node:crypto";

export async function POST(req: Request) {
  let uid = "";
  try {
    const body = await req.json();
    const name = String(body.name || "").trim(),
      email = String(body.email || "")
        .trim()
        .toLowerCase(),
      phone = String(body.phone || "").trim(),
      password = String(body.password || "");
    const accountType =
      body.accountType === "customer" ? "customer" : "provider";
    const linkExisting = body.linkExisting === true;
    if (!name || !email || !phone || (!linkExisting && password.length < 6))
      return NextResponse.json(
        { success: false, message: "Complete all required fields" },
        { status: 400 },
      );
    const { admin, dbAdmin } = await initFirebaseAdmin();
    if (!admin || !dbAdmin)
      return NextResponse.json(
        { success: false, message: "Service unavailable" },
        { status: 500 },
      );

    if (linkExisting) {
      let existingUser;
      try {
        existingUser = await admin.auth().getUserByEmail(email);
      } catch (error) {
        if ((error as { code?: string }).code === "auth/user-not-found") {
          return NextResponse.json(
            {
              success: false,
              message: "No existing Pamba account was found for this email.",
            },
            { status: 404 },
          );
        }
        throw error;
      }

      if (!existingUser.emailVerified) {
        const firebaseLink = await admin
          .auth()
          .generateEmailVerificationLink(email, {
            url: `${process.env.NEXT_PUBLIC_APP_URL || "https://www.pambaadverts.com"}/skills-services/sign-up?verified=1`,
            handleCodeInApp: false,
          });
        await sendVerificationEmail({
          email,
          name,
          verificationUrl: buildCustomFirebaseActionLink(
            firebaseLink,
            "verifyEmail",
            "/skills-services/sign-up?verified=1",
          ),
        });
        return NextResponse.json(
          {
            success: false,
            message:
              "Your existing Pamba email is not verified. We sent you a verification email; verify it, then return to link your account.",
          },
          { status: 400 },
        );
      }

      const existingServiceAccount = await dbAdmin
        .collection("serviceAccounts")
        .doc(existingUser.uid)
        .get();
      if (existingServiceAccount.exists) {
        return NextResponse.json(
          {
            success: false,
            message:
              "This Pamba account already has a Skills & Services account.",
          },
          { status: 409 },
        );
      }

      const token = crypto.randomBytes(32).toString("hex");
      await dbAdmin
        .collection("serviceLinkRequests")
        .doc(token)
        .set({
          uid: existingUser.uid,
          email,
          accountType,
          profile: {
            name,
            email,
            phone,
            location: String(body.location || "").trim(),
            city: String(body.city || "").trim(),
            state: String(body.state || "").trim(),
          },
          used: false,
          expiresAt: admin.firestore.Timestamp.fromMillis(
            Date.now() + 30 * 60 * 1000,
          ),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

      try {
        await sendServiceAccountLinkEmail({
          email,
          name,
          linkUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://www.pambaadverts.com"}/skills-services/link?token=${token}`,
        });
      } catch (error) {
        console.error(
          "[skills-services/signup] link email delivery failed",
          error,
        );
        await dbAdmin
          .collection("serviceLinkRequests")
          .doc(token)
          .delete()
          .catch(() => undefined);
        return NextResponse.json(
          {
            success: false,
            message:
              "We could not send the linking email because email delivery is not configured. Please contact the administrator.",
          },
          { status: 503 },
        );
      }

      return NextResponse.json({
        success: true,
        linked: true,
        message:
          "A confirmation link has been sent to your existing Pamba email.",
      });
    }
    try {
      await admin.auth().getUserByEmail(email);
      return NextResponse.json(
        {
          success: false,
          message:
            "Email already registered. Use service sign in or link your existing account.",
        },
        { status: 409 },
      );
    } catch (error) {
      if ((error as { code?: string }).code !== "auth/user-not-found")
        throw error;
    }
    const user = await admin
      .auth()
      .createUser({ displayName: name, email, password });
    uid = user.uid;
    await dbAdmin.collection("serviceAccounts").doc(uid).set({
      accountType,
      name,
      email,
      phone,
      onboardingComplete: false,
      activationPaid: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    const link = await admin.auth().generateEmailVerificationLink(email, {
      url: `${process.env.NEXT_PUBLIC_APP_URL || "https://www.pambaadverts.com"}/skills-services/sign-in?verified=1`,
      handleCodeInApp: false,
    });
    await sendVerificationEmail({
      email,
      name,
      verificationUrl: buildCustomFirebaseActionLink(
        link,
        "verifyEmail",
        "/skills-services/sign-in?verified=1",
      ),
    });
    return NextResponse.json({
      success: true,
      message: "Account created. Verify your email before signing in.",
    });
  } catch (error) {
    if (uid) {
      const { admin, dbAdmin } = await initFirebaseAdmin();
      await dbAdmin
        ?.collection("serviceAccounts")
        .doc(uid)
        .delete()
        .catch(() => undefined);
      await admin
        ?.auth()
        .deleteUser(uid)
        .catch(() => undefined);
    }
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error ? error.message : "Could not create account",
      },
      { status: 500 },
    );
  }
}
