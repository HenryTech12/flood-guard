import type { Metadata } from "next";
import { getRegion } from "../../../config/regions";
import { env } from "@/lib/env";
import VolunteerApp from "./VolunteerApp";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Volunteer", manifest: "/manifest.webmanifest" };

export default function VolunteerPage() {
  return <VolunteerApp demo={env.demoMode} demoPhone={getRegion().demoVolunteerPhone} />;
}
