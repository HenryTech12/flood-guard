import { redirect } from "next/navigation";
import CommandApp from "@/components/command/CommandApp";
import { getOperatorSession } from "@/lib/auth/session";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const metadata = { title: "Command map" };

export default async function CommandPage() {
  const s = await getOperatorSession();
  if (!s) redirect("/login?next=/command");
  return <CommandApp operatorName={s.name} demo={env.demoMode} />;
}
