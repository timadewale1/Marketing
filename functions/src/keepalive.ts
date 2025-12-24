import * as functions from 'firebase-functions'

// Analyzer-friendly minimal HTTP function to help deployment static analysis
export const keepAlive = functions.https.onRequest((req, res) => {
  res.status(200).send('keepAlive OK')
})
