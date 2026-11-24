import { getRegion } from "../../../config/regions";
import { GuardyFooter, GuardyHeader } from "@/components/guardy/Shell";
import { NIGERIAN_CITIES } from "@/lib/core/weatherRisk";
import CitizenPortal from "./CitizenPortal";

export const dynamic = "force-dynamic";
export const metadata = { title: "Citizen Portal" };

export default function CitizenPage() {
  const region = getRegion();
  const city = NIGERIAN_CITIES.find((c) => c.name === region.name)?.name ?? "Lagos";
  return (
    <div className="min-h-screen bg-stone-50">
      <GuardyHeader mode="citizen" />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <CitizenPortal regionCity={city} />
      </main>
      <GuardyFooter />
    </div>
  );
}
