import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { Login } from './Login';
import { Estado } from './Estado';

export function App() {
  const [sesion, setSesion] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSesion(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSesion(s));
    return () => data.subscription.unsubscribe();
  }, []);
  if (sesion === undefined) return null;
  if (!sesion) return <Login />;
  return (
    <div className="app">
      <header className="barra">
        <strong>Sistema AM</strong>
        <span className="sp" />
        <span className="muted">{sesion.user.email}</span>
        <button className="btn" onClick={() => supabase.auth.signOut()}>Salir</button>
      </header>
      <main><Estado sesion={sesion} /></main>
    </div>
  );
}
