export const now = () => Math.floor(Date.now() / 1000);
export function token() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
export async function digest(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}
export function cookie(request: Request, name: string) {
  return (request.headers.get("Cookie") || "").split(";")
    .map((s) => s.trim()).find((s) => s.startsWith(name + "="))?.slice(name.length + 1) || "";
}
export const validToken = (s: unknown): s is string => typeof s === "string" && /^[a-f0-9]{64}$/.test(s);
export const validCode = (s: unknown): s is string => typeof s === "string" && /^\d{6}$/.test(s);
export function sameOrigin(request: Request) {
  return request.headers.get("Origin") === new URL(request.url).origin;
}
export const sessionCookie = (name: string, value: string, seconds: number) =>
  `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${seconds}`;
