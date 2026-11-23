"use client";
import { useState } from "react";
import { postJson } from "@/lib/client/live";

export default function LoginForm({ next, demo }: { next: string; demo: boolean }) {
  const [email, setEmail] = useState(demo ? "operator@floodguard.demo" : "");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="mt-4 space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        try {
          await postJson("/api/auth/login", { email, password });
          window.location.href = next;
        } catch (e) {
          setErr((e as Error).message);
          setBusy(false);
        }
      }}
    >
      <input className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
      <input className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" type="password" placeholder={demo ? "Password (demo: floodguard-demo)" : "Password"} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
      {err && <div className="text-sm text-red-700">{err}</div>}
      <button disabled={busy} className="w-full rounded-lg bg-sky-600 px-4 py-2 font-bold hover:bg-sky-500 disabled:opacity-50">
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
