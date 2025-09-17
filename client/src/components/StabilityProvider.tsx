import React, { useEffect, ReactNode } from 'react';

interface StabilityProviderProps {
  children: ReactNode;
}

export default function StabilityProvider({ children }: StabilityProviderProps) {
  useEffect(() => {
    // Handle uncaught errors gracefully
    const handleError = (event: ErrorEvent) => {
      console.error('Uncaught error:', event.error);
      event.preventDefault();
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('Unhandled promise rejection:', event.reason);
      event.preventDefault();
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  return <>{children}</>;
}