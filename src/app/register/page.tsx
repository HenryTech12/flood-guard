import Link from "next/link";
import RegisterForm from "./RegisterForm";

export const metadata = { title: "Register a household" };

export default function RegisterPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/" className="text-sm text-slate-400 hover:text-white">
        ← FloodGuard
      </Link>
      <h1 className="mt-2 text-3xl font-black">Register a household</h1>
      <p className="mt-1 text-slate-400">Get flood warnings in your language. Households with elderly, disabled, pregnant, sick people or small children are warned first and prioritised for rescue.</p>
      <p className="mt-1 text-sm text-slate-500">No smartphone? Dial the USSD code and choose “5. Register household”.</p>
      <div className="mt-6">
        <RegisterForm />
      </div>
    </main>
  );
}
