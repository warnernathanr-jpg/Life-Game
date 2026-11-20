import { Building2, Coins, ListChecks, LockOpen } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

const SHOTS = [
  { src: "/landing/city-overview.webp", alt: "A 3D city with homes, shops, a hospital, a factory, parks, ponds and cars driving on the roads", caption: "Your city grows as you get things done. Citizens drive to work, school and the park." },
  { src: "/landing/city-build.webp", alt: "The build menu open over the city, showing homes to choose from", caption: "Pick what to build and place it where you like." },
  { src: "/landing/city-layer.webp", alt: "The city tinted green to red by land value", caption: "Map layers show traffic, pollution, safety, schools and land value." },
];

const STEPS = [
  { Icon: ListChecks, title: "Do your tasks", text: "Daily habits, weekly routines and one-off to-dos across health, work, knowledge and personal life." },
  { Icon: Coins, title: "Earn coins", text: "Every task you check off earns coins. Bigger tasks pay more, and focus sessions, goals and habit milestones pay too." },
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
      <section className="mx-auto max-w-5xl px-4 pb-20" aria-labelledby="shots-h">
        <h2 id="shots-h" className="text-2xl font-bold sm:text-3xl">See what you can build</h2>
        <p className="mt-1 text-muted">Screens from a sample city.</p>
        <figure className="mt-6">
          <Image src={SHOTS[0].src} alt={SHOTS[0].alt} width={1280} height={800} className="w-full rounded-2xl shadow-xl ring-1 ring-line" />
          <figcaption className="mt-2 text-sm text-muted">{SHOTS[0].caption}</figcaption>
        </figure>
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {SHOTS.slice(1).map((s) => (
            <figure key={s.src}>
              <Image src={s.src} alt={s.alt} width={1280} height={800} className="w-full rounded-xl shadow-lg ring-1 ring-line" />
              <figcaption className="mt-2 text-sm text-muted">{s.caption}</figcaption>
            </figure>
          ))}
        </div>
        <div className="mt-10 text-center">
          <Link href="/signup" className="inline-flex min-h-12 items-center rounded-lg bg-coin px-6 font-semibold text-on-coin shadow hover:brightness-110">
            Start your city: it&apos;s free
          </Link>
        </div>
      </section>
    </main>
  );
}
