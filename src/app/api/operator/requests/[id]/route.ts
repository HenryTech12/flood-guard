import { z } from "zod";
import { error, handle, json, requireOperator } from "@/lib/api";
import { actorOf } from "@/lib/auth/session";
import { getSql } from "@/lib/db/client";
import { audit } from "@/lib/services/audit";
import { closeRequest, reassignRequest } from "@/lib/services/dispatch";
import { recomputeUrgency } from "@/lib/services/helpRequests";

export const dynamic = "force-dynamic";
const Body = z.object({
  action: z.enum(["reassign", "unassign", "cancel", "duplicate", "reveal", "rescore"]),
  volunteerId: z.string().uuid().nullish(),
  reason: z.string().max(200).nullish(),
});

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const s = await requireOperator();
  const { id } = await ctx.params;
  const b = Body.parse(await req.json());
  const sql = getSql();
  const actor = actorOf(s);
  switch (b.action) {
    case "reassign":
      if (!b.volunteerId) return error(400, "volunteerId required");
      await reassignRequest(sql, id, b.volunteerId, actor);
      break;
    case "unassign":
      await reassignRequest(sql, id, null, actor);
      break;
    case "cancel":
      await closeRequest(sql, id, "cancelled", b.reason ?? "Closed by operator", actor);
      break;
    case "duplicate":
      await closeRequest(sql, id, "duplicate", b.reason ?? "Duplicate", actor);
      break;
    case "rescore":
      await recomputeUrgency(sql, [id]);
      break;
    case "reveal": {
      // Unmasking a phone number is logged with the operator's identity.
      const [r] = await sql<{ phone: string }[]>`select phone from help_requests where id = ${id}`;
      if (!r) return error(404, "not found");
      await audit(sql, actor, "help_request", id, "phone_revealed");
      return json({ phone: r.phone });
    }
  }
  return json({ ok: true });
});
