import { Building2, Coins, ListChecks, LockOpen } from "lucide-react";
import Link from "next/link";

const STEPS = [
  { Icon: ListChecks, title: "Do your tasks", text: "Daily habits, weekly routines and one-off to-dos across health, work, knowledge and personal life." },
  { Icon: Coins, title: "Earn coins", text: "Easy tasks pay 10, medium 25, hard 50, epic 100. Focus sessions and habit milestones pay too." },
  { Icon: Building2, title: "Build your city", text: "Spend coins on homes, shops, industry and services. Save up to buy more land." },
  { Icon: LockOpen, title: "Unlock by living well", text: "Every check-off earns Health, Work, Knowledge or Personal points. Parks unlock with health, schools with knowledge, offices with work. A balanced life builds a balanced city." },
];

export default function Home() {
  return (
    <main className="flex-1">
      <section className="bg-gradient-to-b from-header to-accent-soft px-4 pt-6 pb-16 text-white">
        <div className="mx-auto max-w-4xl">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-lg font-bold"><Building2 className="size-5" aria-hidden /> Life City</span>
            <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-white/10">Sign in</Link>
          </div>
          <h1 className="mt-12 max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
            Get things done. Watch your city grow.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-white/80">
            A personal dashboard for your tasks and habits, with a city-building game powered by your progress.
          </p>
          <Link href="/signup" className="mt-8 inline-flex min-h-12 items-center rounded-lg bg-coin px-6 font-semibold text-on-coin shadow hover:brightness-110">
            Start your city: it&apos;s free
          </Link>
        </div>
      </section>
      <section className="mx-auto -mt-8 grid max-w-4xl gap-4 px-4 pb-16 sm:grid-cols-2">
        {STEPS.map((s) => (
          <div key={s.title} className="card">
            <s.Icon className="size-8 text-accent-text" aria-hidden />
            <h2 className="mt-2 font-semibold">{s.title}</h2>
            <p className="mt-1 text-sm text-muted">{s.text}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
