import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Sign in · Life City" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <>
      <h1 className="mb-4 text-lg font-semibold">Sign in</h1>
      <Suspense>
        <LinkNotice searchParams={searchParams} />
      </Suspense>
      <AuthForm mode="login" />
    </>
  );
}

async function LinkNotice({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const { error } = await searchParams;
  if (error !== "link_invalid") return null;
  return (
    <p role="alert" className="mb-4 rounded-lg bg-coin-soft px-3 py-2 text-sm text-ink">
      That link didn&apos;t work or has expired. Sign in below.
    </p>
  );
}
