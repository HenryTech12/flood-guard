"use client";
// Emergency Report (Guardy design): auto-detected location, type of emergency, comments and
// an optional voice message. Improvements: optional phone + people count so rescuers can call
// and size the boat; the report becomes a ranked FloodGuard help request with a reference
// number, rescue dispatch and nearest-centre notification. Audio is stored server-side.
import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle, MapPin, Mic, Send, Square } from "lucide-react";
import { NEED_TYPES } from "@/lib/core/needs";

interface Result {
  ref: string;
  locationName: string;
  centers: { name: string; type: string; distanceKm: number }[];
  smsReplies: boolean;
}

const MAX_SECONDS = 120;

export default function EmergencyForm({ onSubmitted }: { onSubmitted?: () => void }) {
  const [form, setForm] = useState({ name: "", phone: "", people: "", type: NEED_TYPES[0] as string, comments: "" });
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const getLocation = () => {
    setGettingLocation(true);
    setError("");
    if (!("geolocation" in navigator)) {
      setError("Geolocation is not supported by your browser");
      setGettingLocation(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocation({ latitude: p.coords.latitude, longitude: p.coords.longitude });
        setGettingLocation(false);
        setSuccess("Location detected automatically!");
        setTimeout(() => setSuccess(""), 3000);
      },
      (e) => {
        setError(`Could not detect location: ${e.message}. Allow location access, or SMS HELP with a landmark instead.`);
        setGettingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };
  useEffect(() => {
    getLocation();
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  const stopRecording = () => {
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
    setIsRecording(false);
    if (timer.current) clearInterval(timer.current);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m));
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
      recorder.current = mr;
      chunks.current = [];
      mr.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
      mr.onstop = () => {
        const blob = new Blob(chunks.current, { type: (mr.mimeType || "audio/webm").split(";")[0] });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start(1000);
      setIsRecording(true);
      setSeconds(0);
      setError("");
      timer.current = setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= MAX_SECONDS) stopRecording();
          return s + 1;
        });
      }, 1000);
    } catch {
      setError("Microphone access denied. Please allow microphone access.");
    }
  };

  const clearRecording = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!location) return setError("Please wait for location detection or detect your location again");
    if (!form.name.trim()) return setError("Please enter your name");
    setLoading(true);
    try {
      const fd = new FormData();
      fd.set("name", form.name.trim());
      if (form.phone.trim()) fd.set("phone", form.phone.trim());
      if (form.people) fd.set("people", form.people);
      fd.set("type_of_need", form.type);
      if (form.comments.trim()) fd.set("comments", form.comments.trim());
      fd.set("latitude", String(location.latitude));
      fd.set("longitude", String(location.longitude));
      if (audioBlob) fd.set("audio", audioBlob, `voice.${audioBlob.type.includes("mp4") ? "m4a" : "webm"}`);
      const res = await fetch("/api/reports", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed to submit report");
      setResult({ ref: d.data.ref, locationName: d.data.locationName, centers: d.nearbyCenters, smsReplies: d.smsReplies });
      setSuccess(`Emergency report ${d.data.ref} submitted! ${d.nearbyCenters.length} nearby centre${d.nearbyCenters.length === 1 ? " has" : "s have"} been notified.`);
      setForm({ name: "", phone: "", people: "", type: NEED_TYPES[0], comments: "" });
      clearRecording();
      onSubmitted?.();
    } catch (err) {
      setError((err as Error).message.replace(/^[\w.]+: /, "") || "Failed to submit report. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const input = "w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500";
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow" data-testid="emergency-form">
      <div className="mb-6 flex items-center">
        <div className="mr-3 rounded-lg bg-red-100 p-2">
          <AlertCircle className="h-6 w-6 text-red-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Emergency Report</h2>
          <p className="text-sm text-gray-600">Submit by form or voice</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-start rounded border-l-4 border-red-500 bg-red-50 p-4 text-sm text-red-800" role="alert">
          <AlertCircle className="mr-2 mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="mb-4 rounded border-l-4 border-green-500 bg-green-50 p-4 text-sm text-green-800" data-testid="report-success">
          <div className="flex items-start">
            <CheckCircle className="mr-2 mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{success}</span>
          </div>
          {result && (
            <div className="mt-2 space-y-1 pl-6 text-xs">
              <p>📍 {result.locationName}</p>
              {result.centers.map((c) => (
                <p key={c.name}>
                  {c.type === "hospital" ? "🏥" : "⛺"} {c.name} — {c.distanceKm} km
                </p>
              ))}
              <p>{result.smsReplies ? "Updates will come to your phone by SMS." : "Add your phone next time so rescuers can call you."}</p>
            </div>
          )}
        </div>
      )}

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700" htmlFor="er-name">
            Your Name
          </label>
          <input id="er-name" type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} placeholder="Enter your name" required />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="mb-2 block text-sm font-medium text-gray-700" htmlFor="er-phone">
              Phone <span className="font-normal text-gray-400">(so rescuers can call)</span>
            </label>
            <input id="er-phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={input} placeholder="+234…" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700" htmlFor="er-people">
              People
            </label>
            <input id="er-people" type="number" min={1} max={500} value={form.people} onChange={(e) => setForm({ ...form, people: e.target.value })} className={input} placeholder="1" />
          </div>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700" htmlFor="er-type">
            Type of Emergency
          </label>
          <select id="er-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className={`${input} bg-white`}>
            {NEED_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700" htmlFor="er-comments">
            Additional Comments
          </label>
          <textarea id="er-comments" value={form.comments} onChange={(e) => setForm({ ...form, comments: e.target.value })} className={input} placeholder="Describe your situation..." rows={3} />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="block text-sm font-medium text-gray-700">Voice Recording (Optional)</label>
            {audioBlob && (
              <button type="button" onClick={clearRecording} className="text-xs font-medium text-red-600 hover:text-red-800">
                Clear Recording
              </button>
            )}
          </div>
          {!audioBlob ? (
            <button
              type="button"
              onClick={isRecording ? stopRecording : startRecording}
              data-testid="record"
              className={`flex w-full items-center justify-center rounded-lg px-4 py-3 font-medium transition-colors ${isRecording ? "bg-red-600 text-white hover:bg-red-700" : "bg-blue-600 text-white hover:bg-blue-700"}`}
            >
              {isRecording ? (
                <>
                  <Square className="mr-2 h-5 w-5" /> Stop Recording ({seconds}s)
                </>
              ) : (
                <>
                  <Mic className="mr-2 h-5 w-5" /> Start Voice Recording
                </>
              )}
            </button>
          ) : (
            <div className="rounded-lg border-2 border-green-500 bg-green-50 p-4" data-testid="recording-saved">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-green-800">Recording saved</span>
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <audio src={audioUrl} controls className="w-full" />
            </div>
          )}
          {isRecording && (
            <div className="mt-2 flex items-center text-sm text-red-600">
              <div className="mr-2 h-2 w-2 animate-pulse rounded-full bg-red-600" />
              Recording... Speak clearly (max {MAX_SECONDS / 60} min)
            </div>
          )}
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">Location {location && "(Auto-detected)"}</label>
          <button
            type="button"
            onClick={getLocation}
            disabled={gettingLocation}
            data-testid="er-location"
            className={`flex w-full items-center justify-center rounded-lg px-4 py-3 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${location ? "border-2 border-green-500 bg-green-50 text-green-700" : "border-2 border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100"}`}
          >
            {location ? (
              <>
                <CheckCircle className="mr-2 h-5 w-5" /> Location Detected
              </>
            ) : (
              <>
                <MapPin className="mr-2 h-5 w-5" /> {gettingLocation ? "Detecting Location..." : "Refresh Location"}
              </>
            )}
          </button>
          {location && (
            <p className="mt-1 text-center text-xs text-gray-500">
              {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
            </p>
          )}
        </div>

        <button type="submit" disabled={loading || !location || isRecording} data-testid="er-submit" className="flex w-full items-center justify-center rounded-lg bg-red-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50">
          <Send className="mr-2 h-5 w-5" />
          {loading ? "Submitting..." : "Submit Emergency Report"}
        </button>
        <p className="text-center text-xs text-gray-500">No data? SMS HELP to the shortcode — it works on any phone.</p>
      </form>
    </div>
  );
}
