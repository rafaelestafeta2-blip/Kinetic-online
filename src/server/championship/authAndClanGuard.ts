import crypto from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { DecodedIdToken, getAuth } from 'firebase-admin/auth';
import firebaseConfig from '../../../firebase-applet-config.json';
import { SignedMatchLobbyTokenPayload } from './types';

if (!getApps().length) {
  initializeApp({
    projectId: firebaseConfig.projectId,
  });
}

const adminAuth = getAuth();

// Runtime cryptographic fallback for match lobby tokens if env var is not configured
const RUNTIME_TOKEN_SECRET =
  process.env.CHAMPIONSHIP_TOKEN_SECRET?.trim() ||
  process.env.MATCH_INTEGRITY_SECRET?.trim() ||
  crypto.randomBytes(32).toString('hex');

const ORGANIZER_ADMIN_EMAILS = new Set<string>(
  [
    'rafadeveloper92@gmail.com',
    ...(process.env.CHAMPIONSHIP_ADMIN_EMAILS || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  ].map((e) => e.toLowerCase())
);

export interface VerifiedAuthUser {
  uid: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  isAdmin: boolean;
  rawIdToken: string;
}

export async function verifyBearerFirebaseUser(
  authHeader: string | undefined
): Promise<VerifiedAuthUser | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const rawToken = authHeader.slice('Bearer '.length).trim();
  if (!rawToken || rawToken.length < 20) {
    return null;
  }
  try {
    const decoded: DecodedIdToken = await adminAuth.verifyIdToken(rawToken);
    const email = (decoded.email || '').trim().toLowerCase();
    const emailVerified = Boolean(decoded.email_verified);
    const isAdmin = Boolean(email && emailVerified && ORGANIZER_ADMIN_EMAILS.has(email));
    return {
      uid: decoded.uid,
      email,
      emailVerified,
      displayName: String(decoded.name || email.split('@')[0] || 'OPERADOR').slice(0, 32),
      isAdmin,
      rawIdToken: rawToken,
    };
  } catch {
    return null;
  }
}

export interface VerifiedFirestoreClanMember {
  uid: string;
  callsign: string;
  avatarDataUrl: string;
  role: string;
}

export interface VerifiedFirestoreClan {
  clanId: string;
  name: string;
  tag: string;
  emblemId: string;
  ownerUid: string;
  ownerCallsign: string;
  memberUids: string[];
  members: Record<string, VerifiedFirestoreClanMember>;
}

interface FirestoreRestValue {
  stringValue?: string;
  integerValue?: string;
  doubleValue?: number;
  booleanValue?: boolean;
  arrayValue?: { values?: FirestoreRestValue[] };
  mapValue?: { fields?: Record<string, FirestoreRestValue> };
}

function readFsString(v?: FirestoreRestValue, fallback = ''): string {
  return typeof v?.stringValue === 'string' ? v.stringValue : fallback;
}

/**
 * Authoritatively fetches a Clan document from Cloud Firestore using the caller's
 * verified Firebase ID Token (passing hardened Firestore security rules without needing IAM).
 */
export async function fetchVerifiedClanFromFirestore(
  clanId: string,
  callerIdToken: string
): Promise<VerifiedFirestoreClan | null> {
  const cleanId = clanId.trim().toLowerCase();
  if (!cleanId || !/^[a-z0-9_-]{3,24}$/.test(cleanId)) {
    return null;
  }
  if (!callerIdToken) {
    return null;
  }

  const projectId = firebaseConfig.projectId;
  const databaseId = firebaseConfig.firestoreDatabaseId || '(default)';
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    projectId
  )}/databases/${encodeURIComponent(databaseId)}/documents/clans/${encodeURIComponent(cleanId)}`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${callerIdToken}`,
        Accept: 'application/json',
      },
    });

    if (!res.ok) return null;

    const docJson = (await res.json()) as {
      fields?: Record<string, FirestoreRestValue>;
    };
    const fields = docJson?.fields;
    if (!fields) return null;

    const ownerUid = readFsString(fields.ownerUid);
    const name = readFsString(fields.name);
    const tag = readFsString(fields.tag);
    if (!ownerUid || !name) return null;

    const memberUids: string[] = [];
    const uidValues = fields.memberUids?.arrayValue?.values || [];
    for (const entry of uidValues) {
      if (entry.stringValue) memberUids.push(entry.stringValue);
    }

    const members: Record<string, VerifiedFirestoreClanMember> = {};
    const memberMapFields = fields.members?.mapValue?.fields || {};
    for (const [mUid, mVal] of Object.entries(memberMapFields)) {
      const mf = mVal.mapValue?.fields;
      if (!mf) continue;
      members[mUid] = {
        uid: readFsString(mf.uid, mUid),
        callsign: readFsString(mf.callsign, 'OPERADOR').slice(0, 32),
        avatarDataUrl: readFsString(mf.avatarDataUrl, '').slice(0, 45000),
        role: readFsString(mf.role, 'MEMBER'),
      };
      if (!memberUids.includes(mUid)) {
        memberUids.push(mUid);
      }
    }

    return {
      clanId: readFsString(fields.clanId, cleanId),
      name: name.slice(0, 48),
      tag: tag.slice(0, 6).toUpperCase(),
      emblemId: readFsString(fields.emblemId, 'alpha_wolf').slice(0, 32),
      ownerUid,
      ownerCallsign: readFsString(fields.ownerCallsign, 'LÍDER').slice(0, 32),
      memberUids,
      members,
    };
  } catch {
    return null;
  }
}

/**
 * Signs a short-lived HMAC-SHA256 token granting a verified roster member access
 * to a specific Championship Match private lobby.
 */
export function signMatchLobbyToken(
  payload: Omit<SignedMatchLobbyTokenPayload, 'nonce' | 'iat' | 'exp'>,
  ttlSeconds = 300
): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const fullPayload: SignedMatchLobbyTokenPayload = {
    ...payload,
    nonce: crypto.randomBytes(12).toString('hex'),
    iat: nowSec,
    exp: nowSec + ttlSeconds,
  };
  const bodyB64 = Buffer.from(JSON.stringify(fullPayload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', RUNTIME_TOKEN_SECRET)
    .update(bodyB64)
    .digest('base64url');
  return `${bodyB64}.${sig}`;
}

export function verifyMatchLobbyToken(
  token: string
): SignedMatchLobbyTokenPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [bodyB64, sigB64] = parts;
  if (!bodyB64 || !sigB64) return null;

  const expectedSig = crypto
    .createHmac('sha256', RUNTIME_TOKEN_SECRET)
    .update(bodyB64)
    .digest('base64url');

  const sigBuf = Buffer.from(sigB64, 'utf8');
  const expBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(bodyB64, 'base64url').toString('utf8')
    ) as SignedMatchLobbyTokenPayload;
    const nowSec = Math.floor(Date.now() / 1000);
    if (!parsed || typeof parsed.exp !== 'number' || parsed.exp < nowSec) {
      return null;
    }
    if (!parsed.matchId || !parsed.uid || !parsed.registrationId) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Verifies Stripe Webhook `Stripe-Signature` header (`t=timestamp,v1=hex`) using
 * constant-time HMAC-SHA256 comparison and a 5-minute replay tolerance window.
 */
export function verifyStripeWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  webhookSecret: string
): { valid: boolean; reason?: string } {
  if (!signatureHeader || !webhookSecret) {
    return { valid: false, reason: 'missing_signature_or_secret' };
  }

  const pairs = signatureHeader.split(',').map((part) => part.trim());
  let timestamp = '';
  const v1Signatures: string[] = [];

  for (const pair of pairs) {
    const [k, v] = pair.split('=');
    if (k === 't' && v) timestamp = v;
    if (k === 'v1' && v) v1Signatures.push(v);
  }

  if (!timestamp || v1Signatures.length === 0) {
    return { valid: false, reason: 'malformed_signature_header' };
  }

  const tsSec = Number(timestamp);
  const nowSec = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(tsSec) || Math.abs(nowSec - tsSec) > 300) {
    return { valid: false, reason: 'timestamp_outside_tolerance' };
  }

  const signedPayload = `${timestamp}.${rawBody.toString('utf8')}`;
  const expectedHex = crypto
    .createHmac('sha256', webhookSecret)
    .update(signedPayload, 'utf8')
    .digest('hex');
  const expectedBuf = Buffer.from(expectedHex, 'hex');

  for (const candidate of v1Signatures) {
    try {
      const candBuf = Buffer.from(candidate, 'hex');
      if (
        candBuf.length === expectedBuf.length &&
        crypto.timingSafeEqual(candBuf, expectedBuf)
      ) {
        return { valid: true };
      }
    } catch {
      // ignore invalid hex
    }
  }

  return { valid: false, reason: 'signature_mismatch' };
}
