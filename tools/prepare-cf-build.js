#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const targets = [".next", ".open-next"];

for (const target of targets) {
  const fullPath = path.join(ROOT, target);
  if (!fs.existsSync(fullPath)) continue;
  try {
    fs.rmSync(fullPath, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 500,
    });
    console.log(`[cf-build] removed ${target}`);
  } catch (error) {
    console.error(`[cf-build] failed to remove ${target}`, error);
    throw error;
  }
}
