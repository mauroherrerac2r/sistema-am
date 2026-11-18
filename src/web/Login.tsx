import { FormEvent, useState } from 'react';
import { supabase } from './supabase';

export function Login() {
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const entrar = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password: clave });
    if (error) setError('Email o contraseña incorrectos.');
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
