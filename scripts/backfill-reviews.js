#!/usr/bin/env node
// One-off backfill: flips tactica_users/{uid}.reviewed = true for every uid
// that already has a 'review_submitted' action in tactica_actions. Run once
// after deploying the cross-device review-suppression flag so existing
// reviewers don't get re-prompted.
//
// Usage:
//   1. cd scripts && npm install
//   2. Download a service account key from Firebase Console
//      (Project settings → Service accounts → Generate new private key)
//      and save it as scripts/serviceAccount.json. DO NOT commit it.
//   3. node backfill-reviews.js [--dry-run]

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const SERVICE_ACCOUNT_PATH = path.join(__dirname, 'serviceAccount.json');
if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error('Missing service account at', SERVICE_ACCOUNT_PATH);
  console.error('Download from Firebase Console → Project settings → Service accounts.');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(require(SERVICE_ACCOUNT_PATH)),
});

const db = admin.firestore();
const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const tag = DRY_RUN ? '[dry-run] ' : '';
  console.log(`${tag}Scanning tactica_actions for review_submitted...`);

  const snap = await db.collection('tactica_actions')
    .where('action', '==', 'review_submitted')
    .get();
  console.log(`Found ${snap.size} review_submitted actions`);

  // For each uid, keep the EARLIEST timestamp (first submission)
  const reviewedByUid = new Map();
  snap.forEach(doc => {
    const d = doc.data();
    if (!d.uid) return;
    const ts = d.timestamp || Date.now();
    if (!reviewedByUid.has(d.uid) || reviewedByUid.get(d.uid) > ts) {
      reviewedByUid.set(d.uid, ts);
    }
  });

  console.log(`Unique users to backfill: ${reviewedByUid.size}`);
  if (DRY_RUN) {
    console.log('UIDs:', [...reviewedByUid.keys()].join('\n'));
    return;
  }

  let updated = 0;
  let alreadySet = 0;
  let missing = 0;

  // Process in chunks of 400 (under the 500-op batch limit)
  const uids = [...reviewedByUid.keys()];
  for (let i = 0; i < uids.length; i += 400) {
    const chunk = uids.slice(i, i + 400);
    const reads = await Promise.all(chunk.map(uid =>
      db.collection('tactica_users').doc(uid).get()
    ));

    const batch = db.batch();
    let opsInBatch = 0;
    chunk.forEach((uid, idx) => {
      const docSnap = reads[idx];
      if (!docSnap.exists) { missing++; return; }
      if (docSnap.data().reviewed === true) { alreadySet++; return; }
      batch.set(docSnap.ref, {
        reviewed: true,
        reviewedAt: reviewedByUid.get(uid),
      }, { merge: true });
      opsInBatch++;
      updated++;
    });
    if (opsInBatch > 0) await batch.commit();
    console.log(`  Chunk ${i / 400 + 1}: +${opsInBatch} updates`);
  }

  console.log(`\nDone.`);
  console.log(`  updated:      ${updated}`);
  console.log(`  already set:  ${alreadySet}`);
  console.log(`  user missing: ${missing}`);
}

main().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
