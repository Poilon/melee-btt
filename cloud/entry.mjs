import { readFileSync } from 'node:fs';
import { CloudStore } from './storage.mjs';
import { createHostedHandler } from './challenges.mjs';
import {generateChallenge} from '../src/challenge.mjs';

const worldsCatalog = JSON.parse(readFileSync(new URL('./worlds-catalog.json', import.meta.url)));
const origin = process.env.SITE_ORIGIN || `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
const challenge = JSON.parse(readFileSync(new URL('../challenge/challenge.json', import.meta.url)));
const gecko = readFileSync(new URL('../challenge/code.txt', import.meta.url), 'utf8');
export default createHostedHandler({ store: new CloudStore(), fallback:{manifest:challenge,gecko}, generate:generateChallenge, origin,
  secret: process.env.SESSION_SECRET, reviewerKey: process.env.REVIEWER_KEY, worldsCatalog, gameAccountsOnly: true, endsAt: process.env.CHALLENGE_ENDS_AT });
