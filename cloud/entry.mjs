import { readFileSync } from 'node:fs';
import { CloudStore } from './storage.mjs';
import { createCloudHandler } from './backend.mjs';

const origin = process.env.SITE_ORIGIN || `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
const challenge = JSON.parse(readFileSync(new URL('../challenge/challenge.json', import.meta.url)));
const gecko = readFileSync(new URL('../challenge/code.txt', import.meta.url), 'utf8');
export default createCloudHandler({ store: new CloudStore(), challenge, gecko, origin,
  secret: process.env.SESSION_SECRET, reviewerKey: process.env.REVIEWER_KEY, endsAt: process.env.CHALLENGE_ENDS_AT });
