import { SignedIn, SignedOut, SignIn } from "@clerk/clerk-react";
import { useGetHealthQuery } from "@tudu/store";

function AppContent() {
  const { data: health, isLoading, isError } = useGetHealthQuery();

  return (
    <div className="min-h-screen bg-background p-8">
      <h1 className="text-2xl font-bold text-foreground">Tudu</h1>
      <p className="mt-2 text-muted-foreground">
        {isLoading && "Checking server..."}
        {isError && "Server unreachable"}
        {health && `Server ${health.status} (v${health.version})`}
      </p>
    </div>
  );
}

export default function App() {
  return (
    <>
      <SignedOut>
        <div className="flex min-h-screen items-center justify-center bg-background">
          <SignIn routing="hash" />
        </div>
      </SignedOut>
      <SignedIn>
        <AppContent />
      </SignedIn>
    </>
  );
}
