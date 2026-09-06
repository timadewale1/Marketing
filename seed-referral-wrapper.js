#!/usr/bin/env node

/**
 * Wrapper to extract Firebase credentials and run seed script
 */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf-8');

// Extract FIREBASE_SERVICE_ACCOUNT_KEY more carefully
const match = envContent.match(/^FIREBASE_SERVICE_ACCOUNT_KEY=(.+)$/m);
if (!match) {
  console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY not found in .env');
  process.exit(1);
}

const jsonStr = match[1];

// Write to temp file
const tempDir = path.join(__dirname, '.tmp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir);
}

const credFile = path.join(tempDir, 'firebase-creds.json');
fs.writeFileSync(credFile, jsonStr);

// Set environment variable
process.env.GOOGLE_APPLICATION_CREDENTIALS = credFile;

// Now run the actual seed script
const { spawn } = require('child_process');
const child = spawn('node', [path.join(__dirname, 'seed-referral-with-creds.js'), ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code) => {
  // Clean up
  try {
    fs.unlinkSync(credFile);
    fs.rmdirSync(tempDir);
  } catch (e) {
    // ignore
  }
  process.exit(code);
});
