import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {exportJWK, generateKeyPair, SignJWT} from 'jose';
import {Miniflare, convertV4MiniflareOptions} from 'miniflare';
import {digest, now} from '../src/security.ts';

test('one-time SMS test links remain isolated from scrapbook access', async () => {
  const studio = 'https://admin.test', sandbox = 'https://sms.test', scrapbook = 'https://scrapbook.test';
  const issuer = 'https://test-team.cloudflareaccess.com', audience = 'test-audience', email = 'owner@example.com';
  const {privateKey, publicKey} = await generateKeyPair('RS256', {extractable: true});
  const jwk = {...await exportJWK(publicKey), kid: 'test', alg: 'RS256', use: 'sig'};
  const jwt = await new SignJWT({email}).setProtectedHeader({alg: 'RS256', kid: 'test'}).setSubject('admin')
    .setIssuer(issuer).setAudience(audience).setIssuedAt().setExpirationTime('5m').sign(privateKey);
  const serviceSid = 'VA' + 'a'.repeat(32), verificationSid = 'VE' + 'b'.repeat(32);
  const sent: string[] = [];
  const india = '+919876543210', netherlands = '+31612345678', us = '+14155550123';
  const mf = new Miniflare(convertV4MiniflareOptions({workers: [{
    name: 'admin', modules: true, routes: ['admin.test/*'], compatibilityDate: '2026-08-06',
    scriptPath: '.wrangler/admin-test-bundle/index.js', d1Databases: {DB: 'shared'},
    bindings: {ADMIN_EMAIL: email, ACCESS_TEAM_DOMAIN: issuer, ACCESS_AUD: audience, SMS_TEST_ORIGIN: sandbox},
    outboundService: async (request: Request) => {
      assert.equal(request.url, issuer + '/cdn-cgi/access/certs');
      return Response.json({keys: [jwk]});
    },
    serviceBindings: {ASSETS: async (request: Request) => new Response(new URL(request.url).pathname)},
  }, {
    name: 'guest', modules: true, routes: ['sms.test/*', 'scrapbook.test/*'],
    compatibilityDate: '2026-08-06', scriptPath: '.wrangler/test-bundle/index.js', d1Databases: {DB: 'shared'},
    bindings: {SMS_TEST_ORIGIN: sandbox, SMS_ENABLED: 'true', SMS_DAILY_LIMIT: '3',
      TWILIO_API_KEY_SID: 'SK' + 'c'.repeat(32), TWILIO_API_KEY_SECRET: 'stub', TWILIO_VERIFY_SERVICE_SID: serviceSid},
    outboundService: async (request: Request) => {
      const params = new URLSearchParams(await request.text());
      const service = 'https://verify.twilio.com/v2/Services/' + serviceSid;
      if (request.url === service + '/Verifications') {
        assert.equal(params.get('Channel'), 'sms');
        sent.push(params.get('To') || '');
        return Response.json({status: 'pending', sid: verificationSid});
      }
      assert.equal(request.url, service + '/VerificationCheck');
      assert.equal(params.get('VerificationSid'), verificationSid);
      assert.equal(params.has('To'), false);
      return Response.json({status: params.get('Code') === '123456' ? 'approved' : 'pending'});
    },
    serviceBindings: {ASSETS: async (request: Request) => new Response(new URL(request.url).pathname)},
  }]}));
  try {
    const db = await mf.getD1Database('DB', 'guest');
    for (const file of ['0001_invites.sql', '0031_sms_send_usage.sql', '0042_sms_test_invites.sql']) {
      await db.exec((await readFile('migrations/' + file, 'utf8')).replace(/\n/g, ' '));
    }
    const existingToken = 'e'.repeat(64), existingSession = 'f'.repeat(64), stamp = now();
    await db.prepare(`INSERT INTO sms_test_invites
      (id,token_hash,session_hash,phone,country,phone_hint,created_at,expires_at,redeemed_at,sends,attempts)
      VALUES ('existing',?1,?2,'+31612345679','NL','5679',?3,?4,?3,1,2)`)
      .bind(await digest(existingToken), await digest(existingSession), stamp, stamp + 3600).run();
    const existingBefore = await db.prepare("SELECT * FROM sms_test_invites WHERE id='existing'").first();
    await db.exec((await readFile('migrations/0043_us_sms_test_invites.sql', 'utf8')).replace(/\n/g, ' '));
    assert.ok(existingBefore);
    assert.deepEqual(await db.prepare("SELECT * FROM sms_test_invites WHERE id='existing'").first(), existingBefore);
    const req = (origin: string, path: string, data?: unknown, extra?: Record<string, string>) =>
      mf.dispatchFetch(origin + path, {
        method: data === undefined ? 'GET' : 'POST',
        headers: {Origin: origin, 'Content-Type': 'application/json', ...extra},
        ...(data === undefined ? {} : {body: JSON.stringify(data)}),
      });
    const admin = (path: string, data?: unknown) => req(studio, '/api/sms-tests' + path, data, {'Cf-Access-Jwt-Assertion': jwt});
    const guest = (path: string, data?: unknown, session = '') => req(sandbox, '/api/sms-test/' + path, data, {Cookie: session});
    async function invite(phone: string) {
      const response = await admin('', {phone});
      assert.equal(response.status, 201);
      return await response.json() as {id: string; url: string; expiresAt: number};
    }
    const linkCode = (link: {url: string}) => new URL(link.url).hash.slice(1);

    assert.equal((await req(studio, '/sms-tests/')).status, 401);
    assert.equal((await req(studio, '/api/sms-tests', {phone: india})).status, 401);
    assert.equal((await req(sandbox, '/sms-test/')).status, 200);
    assert.equal((await req(sandbox, '/api/journal')).status, 404);
    assert.equal((await req(scrapbook, '/sms-test/')).status, 404);
    assert.equal((await req(scrapbook, '/api/sms-test/status')).status, 404);
    assert.equal((await admin('', {phone: '+442079460123'})).status, 400);
    assert.equal((await admin('', {phone: '+14150550123'})).status, 400);
    assert.equal((await guest('send', {})).status, 401);
    const carriedOver = await guest('status', undefined, '__Host-sms_test_session=' + existingSession);
    assert.equal(carriedOver.status, 200);
    assert.equal((await carriedOver.json() as {country: string}).country, 'NL');

    const indiaInvite = await invite('+91 98765 43210');
    assert.match(indiaInvite.url, /^https:\/\/sms\.test\/sms-test\/#([a-f0-9]{64})$/);
    assert.equal((await admin('', {phone: india})).status, 409);
    for (let attempt = 0; attempt < 2; attempt++) {
      const preview = await guest('preview', {token: linkCode(indiaInvite)});
      assert.equal(preview.status, 200);
      assert.equal(preview.headers.has('Set-Cookie'), false);
      const previewBody = await preview.text();
      assert.match(previewBody, /"phoneHint":"3210"/);
      assert.ok(!previewBody.includes(india));
    }
    assert.equal(await db.prepare('SELECT redeemed_at FROM sms_test_invites WHERE id=?').bind(indiaInvite.id).first('redeemed_at'), null);
    assert.deepEqual(sent, []);
    const opened = await Promise.all([guest('open', {token: linkCode(indiaInvite)}), guest('open', {token: linkCode(indiaInvite)})]);
    assert.deepEqual(opened.map(response => response.status).sort(), [200, 401]);
    const wrongBrowser = await guest('preview', {token: linkCode(indiaInvite)}, '__Host-sms_test_session=' + existingSession);
    assert.equal(wrongBrowser.status, 401);
    assert.match(await wrongBrowser.text(), /started in another browser or window/);
    const indiaSession = opened.find(response => response.ok)!.headers.get('Set-Cookie')!;
    assert.match(indiaSession, /^__Host-sms_test_session=.*HttpOnly; Secure; SameSite=Strict/);
    const cookie = indiaSession.split(';')[0];
    assert.equal((await guest('status', undefined, cookie)).status, 200);
    assert.equal((await guest('verify', {code: '123456'}, cookie)).status, 429);
    assert.equal((await req(sandbox, '/api/sms-test/send', {}, {Cookie: cookie, Origin: 'https://other.test'})).status, 403);

    const send = await guest('send', {phone: '+31699999999'}, cookie);
    assert.equal(send.status, 200);
    assert.equal((await guest('preview', {token: linkCode(indiaInvite)})).status, 401);
    const resumed = await guest('preview', {token: linkCode(indiaInvite)}, cookie);
    assert.equal(resumed.status, 200);
    assert.equal(resumed.headers.has('Set-Cookie'), false);
    assert.match(await resumed.text(), /"codePending":true.*"sendsRemaining":1.*"resumed":true/);
    assert.equal((await guest('open', {token: linkCode(indiaInvite)}, cookie)).status, 401);
    assert.equal((await guest('send', {}, cookie)).status, 429);
    assert.equal((await guest('verify', {code: '000000'}, cookie)).status, 400);
    const verified = await guest('verify', {code: '123456'}, cookie);
    assert.equal(verified.status, 200);
    assert.equal(verified.headers.has('Set-Cookie'), false);
    assert.equal((await verified.json() as {verified: boolean}).verified, true);
    assert.equal((await guest('verify', {code: '123456'}, cookie)).status, 409);
    assert.equal((await req(scrapbook, '/api/journal', undefined, {Cookie: cookie})).status, 401);
    assert.equal((await req(scrapbook, '/api/verify', {code: '123456'}, {Cookie: cookie})).status, 401);
    assert.equal((await db.prepare('SELECT count(*) AS n FROM sessions').first<{n: number}>())?.n, 0);
    assert.equal(await db.prepare('SELECT phone FROM sms_test_invites WHERE id=?').bind(indiaInvite.id).first('phone'), null);

    const usInvite = await invite('+1 (415) 555-0123');
    const usOpened = await guest('open', {token: linkCode(usInvite)});
    assert.equal(usOpened.status, 200);
    assert.equal((await usOpened.json() as {country: string}).country, 'US');
    const usCookie = usOpened.headers.get('Set-Cookie')!.split(';')[0];
    assert.equal((await guest('send', {}, usCookie)).status, 200);
    const usVerified = await guest('verify', {code: '123456'}, usCookie);
    assert.equal(usVerified.status, 200);
    assert.equal((await usVerified.json() as {verified: boolean}).verified, true);

    const dutchInvite = await invite(netherlands);
    const dutchCookie = (await guest('open', {token: linkCode(dutchInvite)})).headers.get('Set-Cookie')!.split(';')[0];
    assert.equal((await guest('send', {}, dutchCookie)).status, 200);
    await db.prepare('UPDATE sms_test_invites SET last_send_at=0 WHERE id=?').bind(dutchInvite.id).run();
    const counters=()=>db.prepare('SELECT sends,last_send_at FROM sms_test_invites WHERE phone=?').bind(netherlands).first();
    const beforeBudgetRejection=await counters();
    assert.equal((await guest('send', {}, dutchCookie)).status, 429, 'All three countries share the production SMS budget');
    assert.deepEqual(await counters(),beforeBudgetRejection,'A blocked global budget does not consume the link’s allowance or cooldown');
    assert.deepEqual(sent, [india, us, netherlands]);
    assert.equal((await admin('/' + dutchInvite.id + '/revoke', {})).status, 200);
    assert.equal((await guest('status', undefined, dutchCookie)).status, 401);
    const expired = await invite(netherlands);
    await db.prepare('UPDATE sms_test_invites SET expires_at=? WHERE id=?').bind(now() - 1, expired.id).run();
    assert.equal((await guest('open', {token: linkCode(expired)})).status, 401);
    const history = await (await admin('')).text();
    assert.match(history, /Verified/);
    assert.match(history, /Revoked/);
    assert.match(history, /"country":"US"/);
    assert.ok(!history.includes(india) && !history.includes(netherlands) && !history.includes(us) && !history.includes(linkCode(indiaInvite)));
  } finally {
    await mf.dispose();
  }
});
