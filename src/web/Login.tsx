import { FormEvent, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { Logo, NOMBRE_SISTEMA } from './marca';

const DOMINIO = import.meta.env.VITE_DOMINIO_GOOGLE || 'picallex.com';

export function Login() {
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [conEmail, setConEmail] = useState(false);

  // Si Google devolvió un error en la URL (por ejemplo, usuario no dado de alta), mostrarlo.
  useEffect(() => {
    const p = new URLSearchParams(location.hash.replace(/^#/, '') || location.search);
    const desc = p.get('error_description');
    if (desc) {
      setError(motivo(desc));
      history.replaceState(null, '', location.pathname);
    }
  }, []);

  const google = async () => {
    setError('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: location.origin, queryParams: { hd: DOMINIO, prompt: 'select_account' } },
    });
    if (error) setError(motivo(error.message));
  };

  const entrar = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: clave });
    if (error) setError(motivo(error.message));
  };

  return (
    <div className="login">
      <Logo alto={34} />
      <h1>{NOMBRE_SISTEMA}</h1>
      <button className="btn primario google" onClick={google}>Entrar con Google</button>
      <p className="nota">Con tu cuenta @{DOMINIO}. Si es tu primer ingreso y no te deja, pedile a un admin que te dé de alta.</p>
      {error && <p className="mal">{error}</p>}
      {!conEmail ? (
        <button className="enlace" onClick={() => setConEmail(true)}>Entrar con email y contraseña</button>
      ) : (
        <form onSubmit={entrar} className="login-email">
          <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label>Contraseña<input type="password" value={clave} onChange={(e) => setClave(e.target.value)} required /></label>
          <button className="btn" type="submit">Entrar</button>
        </form>
      )}
    </div>
  );
}

/** Traduce el error de Supabase a algo accionable, sin ocultar la causa. */
function motivo(m: string) {
  const t = m.toLowerCase();
  if (t.includes('signups not allowed') || t.includes('signup is disabled') || t.includes('user not found')) return 'Tu cuenta de Google todavía no está dada de alta en el sistema. Pedile a un admin que te cree el usuario con este mismo email.';
  if (t.includes('provider is not enabled') || t.includes('unsupported provider')) return 'El ingreso con Google todavía no está activado en Supabase.';
  if (t.includes('invalid login credentials')) return 'Email o contraseña incorrectos.';
  if (t.includes('email not confirmed')) return 'El usuario no está confirmado: en Supabase > Authentication > Users, confirmalo o volvé a crearlo con "Auto Confirm User".';
  if (t.includes('email logins are disabled')) return 'El ingreso con email está desactivado en Supabase > Authentication > Providers > Email.';
  if (t.includes('invalid api key') || t.includes('no api key')) return 'La clave de Supabase cargada en Netlify (VITE_SUPABASE_ANON_KEY) no es válida.';
  if (t.includes('failed to fetch') || t.includes('network')) return 'No se pudo conectar con Supabase: revisá VITE_SUPABASE_URL en Netlify.';
  return `No se pudo ingresar: ${m}`;
}
