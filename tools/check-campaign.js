/* eslint-disable @typescript-eslint/no-require-imports */
const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

function loadServiceAccount() {
  const candidates = [
    "serviceAccountKey.json",
    "serviceAccountKey.json.json",
    "serviceAccountKey.json.txt",
  ];

  for (const candidate of candidates) {
    const fullPath = path.join(process.cwd(), candidate);
    if (fs.existsSync(fullPath)) {
      return JSON.parse(fs.readFileSync(fullPath, "utf8"));
    }
  }

  throw new Error("No Firebase service account file found in project root.");
}

async function run() {
  const campaignId = process.argv[2];
  if (!campaignId) {
    throw new Error("Usage: node tools/check-campaign.js <campaignId>");
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(loadServiceAccount()),
    });
  }

  const db = admin.firestore();
  const campaignSnap = await db.collection("campaigns").doc(campaignId).get();

  const relatedQueries = [
    ["earnerSubmissions", "campaignId"],
    ["advertiserTransactions", "campaignId"],
    ["advertiserTransactions", "reference"],
    ["adminNotifications", "campaignId"],
    ["adminLogs", "taskId"],
  ];

  const related = {};
  for (const [collectionName, field] of relatedQueries) {
    const snap = await db
      .collection(collectionName)
      .where(field, "==", campaignId)
      .limit(25)
      .get();

    related[`${collectionName}.${field}`] = snap.docs.map((doc) => ({
      id: doc.id,
      data: doc.data(),
    }));
  }

  console.log(
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        campaignId,
        campaign: campaignSnap.exists
          ? { id: campaignSnap.id, data: campaignSnap.data() }
          : null,
        related,
      },
      null,
      2
    )
  );
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
