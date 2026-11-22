"use client";
// A basic-phone simulator that talks to the REAL webhooks (/api/webhooks/sms and /ussd),
// so judges can "send HELP" live without a shortcode.
import { useCallback, useEffect, useRef, useState } from "react";

interface ThreadItem {
  id: string;
  dir: "in" | "out";
  channel: string;
  body: string;
  audioUrl?: string | null;
  purpose?: string;
  at: string;
}
interface Preset {
  phone: string;
  label: string;
}

const quickMessages = (landmark: string) => ["HELP 3 people roof", "help us water dey rise", "SAFE", `WATER knee ${landmark}`, `ROAD blocked ${landmark}`, "SHELTER"];

export default function PhoneSim({ presets, ussdCode, shortcode, exampleLandmark }: { presets: Preset[]; ussdCode: string; shortcode: string; exampleLandmark: string }) {
  const QUICK = quickMessages(exampleLandmark);
  const [phone, setPhone] = useState(presets[0].phone);
  const [custom, setCustom] = useState("");
  const [mode, setMode] = useState<"sms" | "ussd">("sms");
  const [thread, setThread] = useState<ThreadItem[]>([]);
  const [resident, setResident] = useState<{ name: string | null; preferred_language: string; zone: string | null } | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  // USSD
  const [ussd, setUssd] = useState<{ session: string; path: string[]; screen: string; done: boolean } | null>(null);
  const [ussdInput, setUssdInput] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const active = phone === "custom" ? custom : phone;

  const load = useCallback(async () => {
    if (!active) return;
    const r = await fetch(`/api/sim/inbox?phone=${encodeURIComponent(active)}`, { cache: "no-store" });
    if (!r.ok) return;
    const d = await r.json();
    setThread(d.thread);
    setResident(d.resident);
  }, [active]);

  useEffect(() => {
    void load();
    const t = setInterval(load, 1500);
    return () => clearInterval(t);
  }, [load]);
  // Scroll only the phone's message list (scrollIntoView would also scroll the page/parent frame).
  useEffect(() => {
    const list = bottom.current?.parentElement;
    if (list) list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
  }, [thread.length]);

  const sendSms = async (body: string) => {
    if (!body.trim() || !active) return;
    setSending(true);
    const form = new URLSearchParams({ from: active, to: shortcode, text: body, id: `sim-${crypto.randomUUID()}`, date: new Date().toISOString() });
    await fetch("/api/webhooks/sms", { method: "POST", headers: { "x-floodguard-sim": "1", "Content-Type": "application/x-www-form-urlencoded" }, body: form }).catch(() => {});
    setText("");
    setSending(false);
    void load();
  };

  const ussdSend = async (path: string[], session: string) => {
    const form = new URLSearchParams({ sessionId: session, serviceCode: ussdCode, phoneNumber: active, text: path.join("*") });
    const res = await fetch("/api/webhooks/ussd", { method: "POST", headers: { "x-floodguard-sim": "1", "Content-Type": "application/x-www-form-urlencoded" }, body: form });
    const body = await res.text();
    setUssd({ session, path, screen: body.replace(/^(CON|END)\s?/, ""), done: body.startsWith("END") });
    setUssdInput("");
    if (body.startsWith("END")) void load();
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex w-full max-w-sm flex-wrap items-center gap-2">
        <select data-testid="sim-phone" value={phone} onChange={(e) => (setPhone(e.target.value), setUssd(null))} className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-sm">
          {presets.map((p) => (
            <option key={p.phone} value={p.phone}>
              {p.label}
            </option>
          ))}
          <option value="custom">Other number…</option>
        </select>
        {phone === "custom" && <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="+2348…" className="w-36 rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-sm" />}
      </div>
      <div className="text-center text-xs text-slate-400">
        {resident ? `${resident.name} · ${resident.zone ?? "?"} · prefers ${resident.preferred_language.toUpperCase()}` : "Unregistered number"}
      </div>

      {/* phone body */}
      <div className="w-[320px] rounded-[42px] border-4 border-slate-700 bg-gradient-to-b from-slate-800 to-slate-900 p-5 shadow-2xl">
        <div className="mb-2 text-center text-[11px] font-bold tracking-[0.3em] text-slate-500">FLOODPHONE 1100</div>
        <div className="flex h-[360px] flex-col overflow-hidden rounded-lg border-2 border-slate-950 bg-[#b8c9a3] font-mono text-[13px] text-slate-900 shadow-inner">
          <div className="flex justify-between bg-[#a5b78f] px-2 py-0.5 text-[10px]">
            <span>▂▄▆ MTN</span>
            <span>{mode === "sms" ? "Messages" : "USSD"}</span>
            <span>▮▮▮</span>
          </div>
          {mode === "sms" ? (
            <div className="flex-1 space-y-1.5 overflow-y-auto p-2" data-testid="sim-thread">
              {thread.length === 0 && <div className="mt-10 text-center opacity-60">No messages</div>}
              {thread.map((m) => (
                <div key={m.id} className={`max-w-[88%] rounded px-2 py-1 leading-snug ${m.dir === "out" ? "ml-auto bg-slate-900/80 text-[#d9e8c4]" : "bg-[#dfe9d2]"}`}>
                  {m.channel === "voice" ? (
                    <div>
                      <b>📞 Incoming voice alert</b>
                      <div className="text-[11px] opacity-80">{m.body}</div>
                      {m.audioUrl && <audio src={m.audioUrl} controls className="mt-1 h-6 w-full" onError={(e) => (e.currentTarget.style.display = "none")} />}
                    </div>
                  ) : (
                    m.body
                  )}
                  <div className="text-right text-[9px] opacity-50">{new Date(m.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                </div>
              ))}
              <div ref={bottom} />
            </div>
          ) : (
            <div className="flex flex-1 flex-col p-2" data-testid="sim-ussd">
              {!ussd ? (
                <div className="m-auto text-center">
                  <div className="text-lg font-bold">{ussdCode}</div>
                  <button onClick={() => void ussdSend([], `sim-${crypto.randomUUID()}`)} className="mt-3 rounded bg-green-700 px-4 py-1 font-bold text-white" data-testid="ussd-dial">
                    📞 Dial
                  </button>
                </div>
              ) : (
                <>
                  <pre className="flex-1 whitespace-pre-wrap font-mono text-[13px] leading-snug" data-testid="ussd-screen">
                    {ussd.screen}
                  </pre>
                  {ussd.done ? (
                    <button onClick={() => setUssd(null)} className="rounded bg-slate-800 py-1 font-bold text-white">
                      OK
                    </button>
                  ) : (
                    <form
                      className="flex gap-1"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (ussdInput.trim()) void ussdSend([...ussd.path, ussdInput.trim()], ussd.session);
                      }}
                    >
                      <input data-testid="ussd-input" autoFocus value={ussdInput} onChange={(e) => setUssdInput(e.target.value)} className="min-w-0 flex-1 rounded border border-slate-700 bg-[#dfe9d2] px-1" />
                      <button className="rounded bg-slate-800 px-2 font-bold text-white">Send</button>
                      <button type="button" onClick={() => setUssd(null)} className="rounded bg-red-800 px-2 font-bold text-white">
                        ✕
                      </button>
                    </form>
                  )}
                </>
              )}
            </div>
          )}
        </div>
        {mode === "sms" && (
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void sendSms(text);
            }}
          >
            <input data-testid="sim-input" value={text} onChange={(e) => setText(e.target.value)} placeholder={`SMS to ${shortcode}`} className="min-w-0 flex-1 rounded-lg bg-slate-950 px-3 py-2 text-sm" />
            <button data-testid="sim-send" disabled={sending} className="rounded-lg bg-green-600 px-3 font-bold">
              Send
            </button>
          </form>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button onClick={() => setMode("sms")} className={`rounded-full py-2 text-sm font-bold ${mode === "sms" ? "bg-sky-600" : "bg-slate-700"}`}>
            ✉ SMS
          </button>
          <button onClick={() => setMode("ussd")} className={`rounded-full py-2 text-sm font-bold ${mode === "ussd" ? "bg-sky-600" : "bg-slate-700"}`} data-testid="mode-ussd">
            # USSD
          </button>
        </div>
      </div>

      {mode === "sms" && (
        <div className="flex max-w-sm flex-wrap justify-center gap-2">
          {QUICK.map((q) => (
            <button key={q} onClick={() => void sendSms(q)} className="rounded-full border border-slate-700 px-3 py-1 text-xs hover:bg-slate-800">
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
