import { Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { ReactNode } from 'react';

const SKIP_AUTH = import.meta.env.VITE_SKIP_AUTH === 'true';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();

  if (SKIP_AUTH) return <>{children}</>;
  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
