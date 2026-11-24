// Signed-cookie sessions (HS256 JWT via jose).
//   fg_op   operator/admin session (email + password)
//   fg_vol  volunteer session (phone + OTP)
//   fg_demo demo key unlocked (grants operator access while DEMO_MODE=true)
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { env } from "../env";

export type Role = "operator" | "admin" | "volunteer";
export interface Session {
  sub: string;
  role: Role;
  name: string;
  volunteerId?: string;
  demo?: boolean;
}

export const OP_COOKIE = "fg_op";
export const VOL_COOKIE = "fg_vol";
export const DEMO_COOKIE = "fg_demo";

const key = () => new TextEncoder().encode(env.authSecret);

export async function signToken(payload: Record<string, unknown>, ttl = "12h") {
  return new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(ttl).sign(key());
}

export async function verifyToken<T>(token: string | undefined): Promise<T | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    return payload as T;
  } catch {
    return null;
  }
}

export const cookieOpts = (maxAgeSec: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production" && env.publicBaseUrl.startsWith("https"),
  path: "/",
  maxAge: maxAgeSec,
});

export async function hasDemoAccess(): Promise<boolean> {
  if (!env.demoMode) return false;
  const jar = await cookies();
  const t = await verifyToken<{ demo?: boolean }>(jar.get(DEMO_COOKIE)?.value);
  return !!t?.demo;
}

/** Operator session, or demo access (treated as an operator) in demo mode. */
export async function getOperatorSession(): Promise<Session | null> {
  const jar = await cookies();
  const s = await verifyToken<Session>(jar.get(OP_COOKIE)?.value);
  if (s && (s.role === "operator" || s.role === "admin")) return s;
  if (await hasDemoAccess()) return { sub: "demo", role: "operator", name: "Demo operator", demo: true };
  return null;
}

export async function getVolunteerSession(): Promise<Session | null> {
  const jar = await cookies();
  const s = await verifyToken<Session>(jar.get(VOL_COOKIE)?.value);
  return s && s.role === "volunteer" && s.volunteerId ? s : null;
}

export function actorOf(s: Session) {
  return s.demo ? "operator:demo" : `${s.role}:${s.sub}`;
}
