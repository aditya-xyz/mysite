import {cookie, digest, now, sessionCookie, token, validCode, validToken} from './security.ts';
import {reserveSmsSend, type SmsBudgetEnv} from './sms-budget.ts';

const TEST_SESSION = '__Host-sms_test_session';
const INVITE_LIFETIME = 48 * 60 * 60;
const CHALLENGE_LIFETIME = 10 * 60;
const SEND_COOLDOWN = 60;
const MAX_SENDS = 2;
const MAX_CHECKS = 5;
const PHONE_COUNTRIES = [
  ['IN', /^\+91[6-9]\d{9}$/],
  ['NL', /^\+316\d{8}$/],
  ['US', /^\+1[2-9]\d{2}[2-9]\d{6}$/],
] as const;

export class SmsTestProblem extends Error {
  constructor(public status: number, message: string, public retryAfter?: number) { super(message); }
}

interface TestInvite {
  id: string;
  phone: string | null;
  country: typeof PHONE_COUNTRIES[number][0];
  phone_hint: string;
  expires_at: number;
  sent_at: number | null;
  sends: number;
  attempts: number;
  last_send_at: number;
  verified_at: number | null;
  verification_sid: string | null;
  challenge_expires_at: number;
}

export async function createSmsTest(db: D1Database, origin: string, value: unknown) {
  const phone = typeof value === 'string' ? value.replace(/[\s().-]/g, '') : '';
  const country = PHONE_COUNTRIES.find(([, pattern]) => pattern.test(phone))?.[0];
  if (!country) throw new SmsTestProblem(400, 'Use a mobile number starting with +1 (US), +91 (India), or +31 (Netherlands).');
  const raw = token(), id = crypto.randomUUID(), stamp = now(), expiresAt = stamp + INVITE_LIFETIME;
  const url = new URL('/sms-test/', origin);
  url.hash = raw;
  const created = await db.prepare(`INSERT INTO sms_test_invites (id,token_hash,phone,country,phone_hint,created_at,expires_at)
    SELECT ?1,?2,?3,?4,?5,?6,?7 WHERE NOT EXISTS (
      SELECT 1 FROM sms_test_invites WHERE phone=?3 AND expires_at>?6 AND revoked_at IS NULL AND verified_at IS NULL
    ) RETURNING id`).bind(id, await digest(raw), phone, country, phone.slice(-4), stamp, expiresAt).first();
  if (!created) throw new SmsTestProblem(409, 'This number already has an active test. Revoke it to generate a new link.');
  return {id, url: url.href, expiresAt};
}

export async function listSmsTests(db: D1Database) {
  const stamp = now();
  const {results} = await db.prepare(`SELECT id,country,phone_hint AS phoneHint,expires_at AS expiresAt,sends,
    CASE WHEN verified_at IS NOT NULL THEN 'Verified'
         WHEN revoked_at IS NOT NULL THEN 'Revoked'
         WHEN expires_at<=?1 THEN 'Expired'
         WHEN sent_at IS NOT NULL THEN 'Text requested'
         WHEN last_send_at>0 THEN 'Send attempted'
         WHEN redeemed_at IS NOT NULL THEN 'Link opened'
         ELSE 'Link created' END AS status
    FROM sms_test_invites WHERE expires_at>?2 ORDER BY created_at DESC LIMIT 50`)
    .bind(stamp, stamp - 7 * 86400).all();
  return {tests: results};
}

export async function revokeSmsTest(db: D1Database, id: string) {
  const stamp = now();
  const revoked = await db.prepare(`UPDATE sms_test_invites SET revoked_at=?2,phone=NULL,session_hash=NULL,verification_sid=NULL
    WHERE id=?1 AND expires_at>?2 AND revoked_at IS NULL AND verified_at IS NULL RETURNING id`).bind(id, stamp).first();
  if (!revoked) throw new SmsTestProblem(409, 'This test is already closed.');
  return {revoked: true};
}

export async function cleanSmsTests(db: D1Database) {
  const stamp = now();
  await db.batch([
    db.prepare(`UPDATE sms_test_invites SET phone=NULL,session_hash=NULL,verification_sid=NULL
      WHERE expires_at<=?1 AND (phone IS NOT NULL OR session_hash IS NOT NULL OR verification_sid IS NOT NULL)`).bind(stamp),
    db.prepare('DELETE FROM sms_test_invites WHERE expires_at<=?1').bind(stamp - 7 * 86400),
  ]);
}

function state(invite: TestInvite, stamp = now()) {
  return {
    phoneHint: invite.phone_hint,
    country: invite.country,
    verified: invite.verified_at !== null,
    codePending: invite.challenge_expires_at > stamp && invite.attempts < MAX_CHECKS,
    sendsRemaining: MAX_SENDS - invite.sends,
    attemptLimitReached: invite.attempts >= MAX_CHECKS,
    sendRetryAfter: Math.max(0, invite.last_send_at + SEND_COOLDOWN - stamp),
  };
}

async function testSession(request: Request, db: D1Database) {
  const raw = cookie(request, TEST_SESSION);
  const invite = validToken(raw) ? await db.prepare(`SELECT * FROM sms_test_invites
    WHERE session_hash=?1 AND expires_at>?2 AND revoked_at IS NULL`).bind(await digest(raw), now()).first<TestInvite>() : null;
  if (!invite) throw new SmsTestProblem(401, 'Enter an unused test invite code to continue.');
  return invite;
}

type SmsTestEnv = SmsBudgetEnv & {SMS_ENABLED: string};
type VerifyApi = (resource: 'Verifications' | 'VerificationCheck', params: Record<string, string>) =>
  Promise<{status?: string; sid?: string}>;

export async function smsTestRoute(request: Request, path: string, env: SmsTestEnv,
  readBody: () => Promise<Record<string, unknown>>, verifyApi: VerifyApi) {
  const action = path.slice('/api/sms-test/'.length), db = env.DB;
  if (action === 'status' && request.method === 'GET') return Response.json(state(await testSession(request, db)));
  if (!['preview', 'open', 'send', 'verify'].includes(action) || request.method !== 'POST') {
    throw new SmsTestProblem(404, 'Test action not found.');
  }
  const data = await readBody(), stamp = now();
  if (action === 'preview' || action === 'open') {
    if (!validToken(data?.token)) throw new SmsTestProblem(400, 'Enter the test invite code you were sent.');
    const tokenHash = await digest(data.token);
    if (action === 'preview') {
      const invite = await db.prepare(`SELECT * FROM sms_test_invites
        WHERE token_hash=?1 AND expires_at>?2 AND redeemed_at IS NULL AND revoked_at IS NULL`)
        .bind(tokenHash, stamp).first<TestInvite>();
      if (!invite) throw new SmsTestProblem(401, 'This test invite was already used, expired, or revoked.');
      return Response.json(state(invite, stamp));
    }
    const session = token();
    const invite = await db.prepare(`UPDATE sms_test_invites SET redeemed_at=?1,session_hash=?2
      WHERE token_hash=?3 AND expires_at>?1 AND redeemed_at IS NULL AND revoked_at IS NULL RETURNING *`)
      .bind(stamp, await digest(session), tokenHash).first<TestInvite>();
    if (!invite) throw new SmsTestProblem(401, 'This test invite was already used, expired, or revoked.');
    return Response.json(state(invite, stamp), {
      headers: {'Set-Cookie': sessionCookie(TEST_SESSION, session, invite.expires_at - stamp)},
    });
  }

  const invite = await testSession(request, db);
  if (invite.verified_at !== null || !invite.phone) throw new SmsTestProblem(409, 'This test is already complete.');
  if (action === 'send') {
    if (env.SMS_ENABLED !== 'true') throw new SmsTestProblem(503, 'Text verification is temporarily unavailable.');
    if (invite.sends >= MAX_SENDS || invite.attempts >= MAX_CHECKS) {
      throw new SmsTestProblem(429, 'This test has reached its attempt limit. Ask for a fresh test invite.');
    }
    const retryAfter = invite.last_send_at + SEND_COOLDOWN - stamp;
    if (retryAfter > 0) throw new SmsTestProblem(429, 'Please wait a minute between texts.', retryAfter);
    // Avoid interrupting an existing scrapbook verification on the same Verify service.
    const pendingGuest = await db.prepare('SELECT id FROM invites WHERE phone=?1 AND last_sent_at>?2 LIMIT 1')
      .bind(invite.phone, stamp - CHALLENGE_LIFETIME).first();
    if (pendingGuest) throw new SmsTestProblem(409, 'A scrapbook text was recently requested for this number. Please try the test again in ten minutes.');

    const reserved = await db.prepare(`UPDATE sms_test_invites SET last_send_at=?2,sends=sends+1
      WHERE id=?1 AND expires_at>?2 AND revoked_at IS NULL AND verified_at IS NULL
        AND last_send_at<=?3 AND sends<?4 AND attempts<?5 RETURNING id`)
      .bind(invite.id, stamp, stamp - SEND_COOLDOWN, MAX_SENDS, MAX_CHECKS).first();
    if (!reserved) throw new SmsTestProblem(409, 'A request is already in progress or this test closed. Refresh and try again.');
    await reserveSmsSend(env);
    const result = await verifyApi('Verifications', {To: invite.phone, Channel: 'sms'});
    if (result.status !== 'pending' || !result.sid || !/^VE[a-f0-9]{32}$/i.test(result.sid)) {
      throw new SmsTestProblem(503, 'The text request could not be confirmed. Please try again shortly.');
    }
    const sent = await db.prepare(`UPDATE sms_test_invites SET sent_at=?2,verification_sid=?3,challenge_expires_at=?4
      WHERE id=?1 AND last_send_at=?2 AND revoked_at IS NULL AND verified_at IS NULL AND expires_at>?5 RETURNING *`)
      .bind(invite.id, stamp, result.sid, stamp + CHALLENGE_LIFETIME, now()).first<TestInvite>();
    if (!sent) throw new SmsTestProblem(409, 'This test has closed.');
    return Response.json(state(sent));
  }

  if (!validCode(data?.code)) throw new SmsTestProblem(400, 'Enter the six-digit code from your text.');
  const claim = await db.prepare(`UPDATE sms_test_invites SET attempts=attempts+1
    WHERE id=?1 AND attempts<?3 AND challenge_expires_at>?2 AND expires_at>?2
      AND verification_sid IS NOT NULL AND revoked_at IS NULL AND verified_at IS NULL RETURNING verification_sid`)
    .bind(invite.id, stamp, MAX_CHECKS).first<{verification_sid: string}>();
  if (!claim) throw new SmsTestProblem(429, 'There is no usable text code. Request another text or ask for a new test invite.');
  const result = await verifyApi('VerificationCheck', {VerificationSid: claim.verification_sid, Code: data.code});
  if (result.status !== 'approved') throw new SmsTestProblem(400, 'That code didn’t match. Please try again.');
  const verified = await db.prepare(`UPDATE sms_test_invites SET verified_at=?2,phone=NULL,verification_sid=NULL,challenge_expires_at=0
    WHERE id=?1 AND verification_sid=?3 AND challenge_expires_at>?2 AND expires_at>?2
      AND revoked_at IS NULL AND verified_at IS NULL RETURNING *`)
    .bind(invite.id, now(), claim.verification_sid).first<TestInvite>();
  if (!verified) throw new SmsTestProblem(409, 'This test has already closed. Refresh to see its status.');
  return Response.json(state(verified));
}
