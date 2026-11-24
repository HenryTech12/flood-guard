import { redirect } from "next/navigation";
import { GuardyFooter, GuardyHeader } from "@/components/guardy/Shell";
import { getOperatorSession } from "@/lib/auth/session";
import AuthorityDashboard from "./AuthorityDashboard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Authority Dashboard" };

export default async function AuthorityPage() {
  const s = await getOperatorSession();
  if (!s) redirect("/login?next=/authority");
  return (
    <div className="min-h-screen bg-stone-50">
      <GuardyHeader mode="authority" subtitle={`Authority Dashboard · ${s.name}`} />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <AuthorityDashboard />
      </main>
      <GuardyFooter />
    </div>
  );
}
