import { Link, Navigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { BrandMark } from "@/components/chrome/BrandMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { capture } from "@/lib/analytics/posthog";
import { authClient } from "@/lib/authClient";

export function SignInRoute() {
  const { data: session, isPending } = authClient.useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (isPending) {
    return null;
  }

  if (session) {
    return <Navigate to="/" />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);

    const { error } = await authClient.signIn.email({
      email,
      password,
    });

    setSubmitting(false);

    if (error) {
      toast.error(error.message ?? "Sign in failed");
      return;
    }

    capture("signed_in", { origin: "client" });
  }

  return (
    <div className="flex flex-col gap-6 border border-rule bg-card p-8">
      <BrandMark />
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-extrabold tracking-[-0.03em]">Sign in</h1>
        <p className="text-sm text-muted-foreground">
          Welcome back to Tudu.
        </p>
      </div>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <div className="flex flex-col gap-2">
          <Label htmlFor="sign-in-email">Email</Label>
          <Input
            id="sign-in-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="sign-in-password">Password</Label>
          <Input
            id="sign-in-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Signing in..." : "Sign in"}
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        Need an account?{" "}
        <Link to="/sign-up" className="font-semibold text-foreground">
          Create account
        </Link>
      </p>
    </div>
  );
}
