import { Link, Navigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { BrandMark } from "@/components/chrome/BrandMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/authClient";

export function SignUpRoute() {
  const { data: session, isPending } = authClient.useSession();
  const [name, setName] = useState("");
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

    const { error } = await authClient.signUp.email({
      name,
      email,
      password,
    });

    setSubmitting(false);

    if (error) {
      toast.error(error.message ?? "Sign up failed");
    }
  }

  return (
    <div className="flex flex-col gap-6 border border-rule bg-card p-8">
      <BrandMark />
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-extrabold tracking-[-0.03em]">
          Create account
        </h1>
        <p className="text-sm text-muted-foreground">
          Start planning your day in Tudu.
        </p>
      </div>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <div className="flex flex-col gap-2">
          <Label htmlFor="sign-up-name">Name</Label>
          <Input
            id="sign-up-name"
            type="text"
            autoComplete="name"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="sign-up-email">Email</Label>
          <Input
            id="sign-up-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="sign-up-password">Password</Label>
          <Input
            id="sign-up-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Creating account..." : "Create account"}
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link to="/sign-in" className="font-semibold text-foreground">
          Sign in
        </Link>
      </p>
    </div>
  );
}
