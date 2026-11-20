import type { Metadata } from "next";
import { Suspense } from "react";
import { CityLoader } from "./load";

export const metadata: Metadata = { title: "City · Life City" };

async function CityPageContent({ searchParams }: { searchParams: PageProps<"/city">["searchParams"] }) {
  const { place } = await searchParams;
  return <CityLoader place={typeof place === "string" ? place : undefined} />;
}

export default function CityPage({ searchParams }: PageProps<"/city">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading your city…</p>}>
      <CityPageContent searchParams={searchParams} />
    </Suspense>
  );
}
