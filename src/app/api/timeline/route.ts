import { handle, json, requireOperator } from "@/lib/api";
import { getSql } from "@/lib/db/client";
import { buildTimeline } from "@/lib/services/state";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  await requireOperator();
  return json(await buildTimeline(getSql()), { headers: { "Cache-Control": "no-store" } });
});
