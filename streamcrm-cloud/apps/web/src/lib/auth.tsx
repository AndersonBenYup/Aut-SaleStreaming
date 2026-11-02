import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { ApiError, api, setCsrf, setOnUnauthorized } from './api';
import type { Session } from './types';

/** La sesión vive en react-query: null = sin sesión. */
export function useSession() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api<Session>('/auth/me');
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 60_000,
    retry: false,
  });
  useEffect(() => {
    if (q.data) setCsrf(q.data.csrfToken);
  }, [q.data]);
  useEffect(() => {
    setOnUnauthorized(() => qc.setQueryData(['me'], null));
  }, [qc]);
  return q;
}

/** Después de login/registro/cambio de negocio: guarda la nueva sesión y descarta los datos del negocio anterior. */
export function useSetSession() {
  const qc = useQueryClient();
  return (s: Session | null) => {
    if (s) setCsrf(s.csrfToken);
    qc.removeQueries({ predicate: (query) => query.queryKey[0] !== 'me' });
    qc.setQueryData(['me'], s);
  };
}

export function useMe(): Session {
  const { data } = useSession();
  if (!data) throw new Error('useMe fuera de una sesión');
  return data;
}

export const isOwner = (s: Session) => s.user.role === 'owner' || s.user.role === 'superadmin';
