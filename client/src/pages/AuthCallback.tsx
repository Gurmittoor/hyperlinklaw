import { useEffect, useState } from 'react';
import { useLocation } from "wouter";

export default function AuthCallback() {
  const [, setLocation] = useLocation();
  const [msg, setMsg] = useState('Finishing sign-in…');

  useEffect(() => {
    let mounted = true;

    const check = async (attempt = 1) => {
      try {
        const r = await fetch('/api/auth/user', { credentials: 'include' });
        if (r.ok) {
          const j = await r.json();
          if (j?.id) { // Check if user object exists (has an id property)
            if (!mounted) return;
            setMsg('Signed in. Redirecting…');
            setLocation('/', { replace: true }); // Navigate to main app
            return;
          }
        }
      } catch (e) {
        // ignore
      }
      if (!mounted) return;
      setMsg(`Waiting for session… (attempt ${attempt})`);
      setTimeout(() => check(attempt + 1), Math.min(2000, 250 * attempt));
    };

    check();
    return () => { mounted = false; };
  }, [setLocation]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="text-center">
        <div className="text-xl font-semibold mb-2">hyperlinklaw.com</div>
        <div className="text-muted-foreground">{msg}</div>
      </div>
    </div>
  );
}