import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { z } from "zod";
import { error, handle, json } from "@/lib/api";
import { cookieOpts, OP_COOKIE, signToken } from "@/lib/auth/session";
import { getSql } from "@/lib/db/client";
import { audit } from "@/lib/services/audit";

export const dynamic = "force-dynamic";
const Body = z.object({ email: z.string().email(), password: z.string().min(1) });

export const POST = handle(async (req: Request) => {
  const { email, password } = Body.parse(await req.json());
  const sql = getSql();
  const [u] = await sql<{ id: string; name: string; role: "operator" | "admin"; password_hash: string }[]>`
    select id, name, role, password_hash from app_users where lower(email) = lower(${email})`;
  if (!u || !bcrypt.compareSync(password, u.password_hash)) return error(401, "Wrong email or password");
  const token = await signToken({ sub: u.id, role: u.role, name: u.name });
  (await cookies()).set(OP_COOKIE, token, cookieOpts(12 * 3600));
  await audit(sql, `${u.role}:${u.id}`, "app_user", u.id, "login");
  return json({ ok: true, name: u.name, role: u.role });
});
