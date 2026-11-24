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
      <input className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
      <input className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500" type="password" placeholder={demo ? "Password (demo: floodguard-demo)" : "Password"} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
      {err && <div className="text-sm text-red-700">{err}</div>}
      <button disabled={busy} className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 px-6 py-3 font-bold text-white shadow-lg transition-all hover:from-blue-700 hover:to-cyan-700 disabled:opacity-50">
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
