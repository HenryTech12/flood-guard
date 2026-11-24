"use client";
// Live data: fetch a JSON endpoint and refetch whenever the server says something changed.
// Transport, in order of preference:
//   1. Supabase Realtime broadcast (if NEXT_PUBLIC_SUPABASE_URL/ANON_KEY are set)
//   2. Server-sent events from /api/stream
//   3. Polling (always on as a safety net)
import { useCallback, useEffect, useRef, useState } from "react";

export type Transport = "realtime" | "sse" | "polling" | "connecting";

export function useLiveJson<T>(url: string | null, { pollMs = 5000, enabled = true }: { pollMs?: number; enabled?: boolean } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [transport, setTransport] = useState<Transport>("connecting");
  const [updatedAt, setUpdatedAt] = useState<number>(0);
  const inflight = useRef(false);
  const again = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchNow = useCallback(async () => {
    if (!url || !enabled) return;
    if (inflight.current) {
      again.current = true;
      return;
    }
    inflight.current = true;
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.status === 401) {
        setError("unauthorized");
      } else if (!res.ok) {
        setError(`HTTP ${res.status}`);
      } else {
        setData((await res.json()) as T);
        setError(null);
        setUpdatedAt(Date.now());
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      inflight.current = false;
      if (again.current) {
        again.current = false;
        void fetchNow();
      }
    }
  }, [url, enabled]);

  const refetch = useCallback(() => {
    if (timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      void fetchNow();
    }, 120);
  }, [fetchNow]);

  useEffect(() => {
    if (!url || !enabled) return;
    void fetchNow();
    let closed = false;
    let es: EventSource | null = null;
    let cleanupRealtime: (() => void) | null = null;

    const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supaKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const startSse = () => {
      if (closed || typeof EventSource === "undefined") return setTransport("polling");
      es = new EventSource("/api/stream");
      es.addEventListener("hello", () => setTransport("sse"));
      es.addEventListener("change", () => refetch());
      es.onerror = () => setTransport("polling");
    };

    if (supaUrl && supaKey) {
      import("@supabase/supabase-js")
        .then(({ createClient }) => {
          if (closed) return;
          const client = createClient(supaUrl, supaKey, { auth: { persistSession: false } });
          const ch = client
            .channel("floodguard")
            .on("broadcast", { event: "change" }, () => refetch())
            .subscribe((status) => {
              if (status === "SUBSCRIBED") setTransport("realtime");
              else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") startSse();
            });
          cleanupRealtime = () => void client.removeChannel(ch);
        })
        .catch(startSse);
    } else startSse();

    const poll = setInterval(() => void fetchNow(), pollMs);
    const onVis = () => document.visibilityState === "visible" && void fetchNow();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      closed = true;
      clearInterval(poll);
      es?.close();
      cleanupRealtime?.();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [url, enabled, pollMs, fetchNow, refetch]);

  return { data, error, transport, updatedAt, refetch: fetchNow };
}

/** Keep the server's time-based work moving while this page is open. */
export function useHeartbeat(ms = 5000, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const beat = () => void fetch("/api/tick", { method: "POST", headers: { "x-floodguard-page": "1" } }).catch(() => {});
    beat();
    const t = setInterval(beat, ms);
    return () => clearInterval(t);
  }, [ms, enabled]);
}

export async function postJson<T = unknown>(url: string, body: unknown = {}): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}

/** Re-render every `ms` (for live "waiting 3 min" counters). */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "—";
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
