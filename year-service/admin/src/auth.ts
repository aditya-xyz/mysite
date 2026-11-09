import { createRemoteJWKSet, jwtVerify } from "jose";
export interface AuthConfig { ADMIN_EMAIL: string; ACCESS_TEAM_DOMAIN: string; ACCESS_AUD: string }
const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
export async function adminIdentity(request: Request, env: AuthConfig) {
  // There is deliberately no development bypass or trust in an unsigned email header.
  if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_TEAM_DOMAIN || "") ||
      !env.ACCESS_AUD || !env.ADMIN_EMAIL) return null;
  const assertion = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!assertion || assertion.length > 16384) return null;
  let keys = keySets.get(env.ACCESS_TEAM_DOMAIN);
  if (!keys) {
    keys = createRemoteJWKSet(new URL(env.ACCESS_TEAM_DOMAIN + "/cdn-cgi/access/certs"));
    keySets.set(env.ACCESS_TEAM_DOMAIN, keys);
  }
  try {
    const { payload } = await jwtVerify(assertion, keys, {
      issuer: env.ACCESS_TEAM_DOMAIN, audience: env.ACCESS_AUD, algorithms: ["RS256"],
      requiredClaims: ["sub", "email", "exp", "iat"]
    });
    return typeof payload.email === "string" && payload.email.toLowerCase() === env.ADMIN_EMAIL.toLowerCase()
      ? payload.email : null;
  } catch { return null; }
}
