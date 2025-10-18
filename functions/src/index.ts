// // functions/src/index.ts
// import * as functions from "firebase-functions";
// import * as admin from "firebase-admin";
// import * as sgMail from "@sendgrid/mail";

// admin.initializeApp();
// sgMail.setApiKey(functions.config().sendgrid.key); // Set in Firebase config

// // Trigger for new proof submissions
// export const notifyNewProof = functions.firestore
//   .document("earnerSubmissions/{submissionId}")
//   .onCreate(async (snap, context) => {
//     const data = snap.data();
//     const msg = {
//       to: "timadewale1@gmail.com",
//       from: "noreply@yourdomain.com",
//       subject: "New Proof Submission",
//       text: `New proof submitted for campaign: ${data.campaignTitle}\nUser: ${data.userId}\nProof: ${data.proofUrl}`,
//     };
//     await sgMail.send(msg);
//     return null;
//   });

// // Trigger for new withdrawal requests
// export const notifyNewWithdrawal = functions.firestore
//   .document("earnerWithdrawals/{withdrawalId}")
//   .onCreate(async (snap, context) => {
//     const data = snap.data();
//     const msg = {
//       to: "timadewale1@gmail.com",
//       from: "noreply@yourdomain.com",
//       subject: "New Withdrawal Request",
//       text: `New withdrawal request: ₦${data.amount}\nUser: ${data.userId}\nBank: ${data.bank?.bankName} - ${data.bank?.accountNumber}`,
//     };
//     await sgMail.send(msg);
//     return null;
//   });