import { GuardyFooter, GuardyHeader } from "@/components/guardy/Shell";

export const metadata = { title: "Privacy" };

const SECTIONS: [string, React.ReactNode][] = [
  [
    "Who we are",
    <>
      FloodGuard is a flood early-warning and rescue coordination service run
      with the State Emergency Management Agency (SEMA). This notice explains,
      in plain language, how we handle your personal data under the Nigeria Data
      Protection Act 2023 (NDPA).
    </>,
  ],
  [
    "What we collect — and only this",
    <ul key="collect" className="list-disc space-y-1 pl-5">
      <li>
        <b>If you register:</b> your phone number, name, optional email address,
        preferred language, area, and — only if you agree — your home location;
        the type and number of people in your household who need extra help;
        family phone numbers (and optional emails) to tell when you are safe.
        Emails are sent through our email provider (Brevo) only for these
        warnings and safety messages.
      </li>
      <li>
        <b>If you ask for help:</b> your phone number, your message, how many
        people are with you, and the location you give (home, a landmark, or
        your area).
      </li>
      <li>
        <b>If you report flooding:</b> the report, its location and optional
        photo and phone number.
      </li>
      <li>
        <b>If you volunteer:</b> your name, phone, vehicle type, and your live
        location <b>only while you are on an active rescue job</b>.
      </li>
    </ul>,
  ],
  [
    "Why (purpose limitation)",
    <>
      We use this data only to (1) warn you about floods, (2) find and rescue
      people, (3) tell your family you are safe, and (4) plan shelters. We do
      not sell it, use it for advertising, credit scoring or anything else.
    </>,
  ],
  [
    "Legal basis",
    <>
      Your consent (registration, location, family contacts), and protecting
      vital interests — someone&apos;s life — when you ask for help. You can ask
      for help without registering; we never block a help request.
    </>,
  ],
  [
    "No background tracking",
    <>
      We never track residents. Volunteers&apos; phones share location only
      between accepting a job and finishing it. Phone numbers are masked on the
      operations dashboard; only the volunteer assigned to you sees your full
      number, and any operator who unmasks a number is recorded in an audit log.
    </>,
  ],
  [
    "Your rights",
    <ul key="rights" className="list-disc space-y-1 pl-5">
      <li>
        SMS <b>STOP</b> to stop alerts, <b>START</b> to restart.
      </li>
      <li>
        SMS <b>DELETE</b> to erase your registration, household and family
        details immediately.
      </li>
      <li>Ask SEMA for a copy of your data or to correct it.</li>
      <li>
        Complain to the Nigeria Data Protection Commission (NDPC) if you are
        unhappy with how we handle your data.
      </li>
    </ul>,
  ],
  [
    "How long we keep it",
    <>
      Registration data: until you delete it or 24 months without activity. Help
      requests and rescue records: kept for 12 months for after-action review
      and audit, then anonymised. Volunteer location history: 30 days.
    </>,
  ],
  [
    "Security",
    <>
      Data is encrypted in transit, stored in a database with row-level
      security, and only accessible to logged-in SEMA operators with a role that
      needs it. All status changes are logged.
    </>,
  ],
];

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-stone-50">
      <GuardyHeader mode="page" />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="mt-2 text-3xl font-black">Privacy notice</h1>
        <p className="mt-1 text-slate-600">
          Short version: we use your data only to warn you and to save lives.
          You can delete it any time by sending DELETE.
        </p>
        <div className="mt-6 space-y-6">
          {SECTIONS.map(([h, body]) => (
            <section key={h}>
              <h2 className="text-lg font-bold">{h}</h2>
              <div className="mt-1 text-slate-700">{body}</div>
            </section>
          ))}
        </div>
        <p className="mt-8 text-xs text-slate-500">
          Demo deployment: all people, phone numbers and messages shown are
          fictional. This notice is a draft for review by SEMA&apos;s Data
          Protection Officer.
        </p>
      </main>
      <GuardyFooter />
    </div>
  );
}
