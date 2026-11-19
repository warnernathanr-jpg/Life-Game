import type { Metadata } from "next";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Create an account · Life City" };

export default function SignupPage() {
  return (
    <>
      <h1 className="mb-1 text-lg font-semibold">Start your city</h1>
      <p className="mb-4 text-sm text-muted">You get 100 coins to begin. Finish tasks to earn more.</p>
      <AuthForm mode="signup" />
    </>
  );
}
