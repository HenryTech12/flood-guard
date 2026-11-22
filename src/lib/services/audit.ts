import type { Db } from "../db/client";

export async function audit(
  db: Db,
  actor: string,
  entity: string,
  entityId: string,
  action: string,
  from?: string | null,
  to?: string | null,
  details?: Record<string, unknown> | null,
) {
  await db`insert into audit_log (actor, entity, entity_id, action, from_value, to_value, details)
           values (${actor}, ${entity}, ${entityId}, ${action}, ${from ?? null}, ${to ?? null}, ${details ? JSON.stringify(details) : null}::text::jsonb)`;
}
