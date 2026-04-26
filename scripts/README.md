# Tactica admin scripts

One-off Node scripts that talk to Firestore via the Admin SDK.

## Setup (one-time)

1. `cd scripts && npm install`
2. In Firebase Console → Project settings → Service accounts → Generate new private key.
   Save the downloaded JSON as `scripts/serviceAccount.json`. **Do not commit it** — already in `.gitignore`.

## Scripts

### `backfill-reviews.js`

Flips `tactica_users/{uid}.reviewed = true` for every user that already has a
`review_submitted` action in `tactica_actions`. Run once after deploying the
cross-device review-suppression flag so existing reviewers don't get re-prompted.

```
node backfill-reviews.js --dry-run    # preview affected uids
node backfill-reviews.js              # apply
```

Idempotent — running it twice is safe (skips users already flagged).
