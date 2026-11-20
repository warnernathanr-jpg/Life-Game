import { Building2, Coins, ListChecks, LockOpen } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

const HERO = {
  src: "/landing/hero.webp",
  alt: "LifeCity on a computer and a phone: a 3D city with homes, shops, a hospital, a stadium and cars on the roads, next to the Tasks screen with daily habits and coins to earn",
};
const SHOTS = [
  { src: "/landing/build.webp", alt: "The build menu open over the city, with homes to choose from and their prices", caption: "Spend the coins you earn on homes, shops, schools, parks and more." },
  { src: "/landing/tasks-goals.webp", alt: "Two phone screens: today's tasks with habit progress, and a goal broken into steps with a progress bar", caption: "Tasks, habits and goals pay coins and unlock new buildings." },
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
        <div className="mx-auto max-w-5xl">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-lg font-bold"><Building2 className="size-5" aria-hidden /> LifeCity</span>
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
          <Image src={HERO.src} alt={HERO.alt} width={2400} height={1440} priority sizes="(min-width: 1024px) 1024px, 100vw" className="mt-10 w-full rounded-2xl shadow-2xl" />
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
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          {SHOTS.map((s) => (
            <figure key={s.src}>
              <Image src={s.src} alt={s.alt} width={1600} height={1000} sizes="(min-width: 640px) 50vw, 100vw" className="w-full rounded-xl shadow-lg ring-1 ring-line" />
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
