import { Link } from '@tanstack/react-router';
import { EmptyState, Logo, Sheet } from '@tudu/ui';

/** A placeholder until chunk 01 brings sign in and the shell. */
export function HomePage() {
  return (
    <main className="scroll-page tp-root" style={{ display: 'grid', placeItems: 'center', padding: 24 }}>
      <Sheet label="Tudu" style={{ width: 'min(560px, 100%)', padding: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Logo size={28} wordmark />
        </div>
        <EmptyState title="Nothing here yet." mark={false}>
          Sign in and the day page arrive with chunk 01. Until then, the <Link to="/kit">kit page</Link> shows
          every piece.
        </EmptyState>
      </Sheet>
    </main>
  );
}
