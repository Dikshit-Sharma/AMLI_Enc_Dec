#!/usr/bin/env node
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
if (admin.apps.length === 0) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

async function main() {
  const seedPath = path.join(__dirname, '../../scripts/bsa_seed.json');
  const entries = JSON.parse(fs.readFileSync(seedPath, 'utf8'));

  const existingSnap = await db.collection('bsa').get();
  const existingApis = new Set();
  existingSnap.forEach(doc => existingApis.add(doc.data().api));

  let created = 0, skipped = 0;

  for (const entry of entries) {
    if (existingApis.has(entry.api)) {
      console.log(`SKIP (exists): ${entry.api}`);
      skipped++;
      continue;
    }
    await db.collection('bsa').add({
      api: entry.api,
      consumers: entry.consumers,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`CREATED: ${entry.api} (${entry.consumers.length} consumers)`);
    created++;
  }

  console.log(`\nDone. Created: ${created}, Skipped: ${skipped}`);
}

main().catch(err => { console.error(err); process.exit(1); });
