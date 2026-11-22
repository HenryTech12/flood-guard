import Link from "next/link";
import { getRegion } from "../../../config/regions";
import ReportForm from "./ReportForm";

export const metadata = { title: "Report flooding" };

export default function ReportPage() {
  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <Link href="/" className="text-sm text-slate-400 hover:text-white">
        ← FloodGuard
      </Link>
      <h1 className="mt-2 text-3xl font-black">Report flooding</h1>
      <p className="mt-1 text-slate-400">Your report helps rescuers and improves the flood map. On a basic phone, SMS e.g. “WATER knee {getRegion().exampleLandmark}”.</p>
      <div className="mt-6">
        <ReportForm />
      </div>
    </main>
  );
}
