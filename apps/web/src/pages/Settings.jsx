import { LogOut } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import { Button, Card, PageHeader } from '../components/ui.jsx';
import { supabase } from '../lib/supabase.js';

export default function Settings() {
  const { session } = useAuth();
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader title="Settings" />
      <Card as="section" className="p-5" aria-labelledby="theme-heading">
        <h2 id="theme-heading" className="text-lg font-bold">
          Appearance
        </h2>
        <p className="mt-1 text-sm text-muted">
          System follows your device. The choice is saved in this browser only.
        </p>
        <ThemeToggle variant="menu" className="mt-3" />
      </Card>
      <Card as="section" className="p-5" aria-labelledby="account-heading">
        <h2 id="account-heading" className="text-lg font-bold">
          Account
        </h2>
        <label className="mt-3 flex flex-col gap-1 text-sm font-medium">
          Email
          <input
            readOnly
            value={session?.user?.email ?? ''}
            className="rounded-lg border border-line bg-surface-2 p-2 text-fg"
          />
        </label>
        <Button variant="secondary" onClick={() => supabase.auth.signOut()} className="mt-4">
          <LogOut size={16} aria-hidden="true" /> Sign out
        </Button>
      </Card>
      <Card as="section" className="p-5" aria-labelledby="privacy-heading">
        <h2 id="privacy-heading" className="text-lg font-bold">
          Privacy and limits
        </h2>
        <p className="mt-2 text-sm text-muted">
          Your shipments and documents are visible only to your account. Use synthetic documents
          only. Results are possible inconsistencies that require manual verification. They are not
          legal or customs advice, and AI pre-cleared does not mean any authority approved a
          shipment.
        </p>
      </Card>
    </div>
  );
}
