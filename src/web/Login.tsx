import { FormEvent, useState } from 'react';
import { supabase } from './supabase';

export function Login() {
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const entrar = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: clave });
    if (error) setError(motivo(error.message));
  };
  return (
    <form className="login" onSubmit={entrar}>
      <h1>Sistema AM</h1>
      <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
      <label>Contraseña<input type="password" value={clave} onChange={(e) => setClave(e.target.value)} required /></label>
      {error && <p className="mal">{error}</p>}
      <button className="btn primario" type="submit">Entrar</button>
    </form>
  );
}

/** Traduce el error de Supabase a algo accionable, sin ocultar la causa. */
function motivo(m: string) {
  const t = m.toLowerCase();
  if (t.includes('invalid login credentials')) return 'Email o contraseña incorrectos.';
  if (t.includes('email not confirmed')) return 'El usuario no está confirmado: en Supabase > Authentication > Users, confirmalo o volvé a crearlo con "Auto Confirm User".';
  if (t.includes('email logins are disabled') || t.includes('provider is not enabled')) return 'El ingreso con email está desactivado en Supabase > Authentication > Providers > Email.';
  if (t.includes('invalid api key') || t.includes('no api key')) return 'La clave de Supabase cargada en Netlify (VITE_SUPABASE_ANON_KEY) no es válida.';
  if (t.includes('failed to fetch') || t.includes('network')) return 'No se pudo conectar con Supabase: revisá VITE_SUPABASE_URL en Netlify.';
  return `No se pudo ingresar: ${m}`;
}
