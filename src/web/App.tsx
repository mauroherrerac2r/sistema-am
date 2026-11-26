import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { Login } from './Login';
import { Inicio } from './Inicio';
import { Analisis } from './Analisis';
import { Configuracion } from './Configuracion';
import { Sistema } from './Sistema';
import { Ventas } from './Ventas';
import { PaidMedia } from './PaidMedia';
import { Marca } from './marca';
import { cargarConfig } from './datos';
import { Contexto, Ctx } from './contexto';

const PAGINAS = [
  { id: 'inicio', titulo: 'Operación' },
  { id: 'pm', titulo: 'Paid Media' },
  { id: 'analisis', titulo: 'Análisis puntual' },
  { id: 'ventas', titulo: 'Ventas y ROAS' },
  { id: 'config', titulo: 'Clientes' },
  { id: 'sistema', titulo: 'Sistema' },
];

const leerLS = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const guardarLS = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };

export function App() {
  const [sesion, setSesion] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSesion(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSesion(s));
    return () => data.subscription.unsubscribe();
  }, []);
  if (sesion === undefined) return null;
  if (!sesion) return <Login />;
  return <Interna sesion={sesion} />;
}

function Interna({ sesion }: { sesion: Session }) {
  const [base, setBase] = useState<Awaited<ReturnType<typeof cargarConfig>> | null>(null);
  const [error, setError] = useState('');
  const [pagina, setPagina] = useState(() => location.hash.replace('#', '') || 'inicio');
  const [filtro, setFiltro] = useState(() => leerLS('filtroAM') || 'mios');

  const recargar = useCallback(async () => {
    try { setBase(await cargarConfig()); setError(''); } catch (e: any) { setError(e.message); }
  }, []);
  useEffect(() => { recargar(); }, [recargar]);
  useEffect(() => {
    const f = () => setPagina(location.hash.replace('#', '') || 'inicio');
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);

  const ctx: Ctx | null = useMemo(() => {
    if (!base) return null;
    const yo = base.perfiles.find((p) => p.id === sesion.user.id);
    if (!yo) return null;
    // Un cliente es "mío" si soy su AM o si soy PM de alguna de sus cuentas.
    const esMio = (c: { id: string; am_id: string | null }, id: string) => c.am_id === id || base.cuentasCfg.some((a) => a.client_id === c.id && a.pm_id === id);
    const tieneMios = base.clientes.some((c) => esMio(c, yo.id));
    const f = filtro === 'mios' && !tieneMios ? 'todos' : filtro;
    const visibles = base.clientes.filter((c) => c.activo && (f === 'todos' || esMio(c, f === 'mios' ? yo.id : f)));
    return { sesion, yo, ...base, visibles, metaPorId: new Map(base.cuentasMeta.map((m) => [m.id, m])), recargar };
  }, [base, filtro, sesion, recargar]);

  // Los PM arrancan en su panel cuando entran sin una sección elegida.
  useEffect(() => { if (ctx?.yo.rol === 'pm' && !location.hash) location.hash = 'pm'; }, [ctx?.yo.rol]);

  if (error) return <div className="centro"><p className="mal">No se pudieron cargar los datos: {error}</p></div>;
  if (!base) return <div className="centro muted">Cargando…</div>;
  if (!ctx) return <div className="centro"><p>Tu usuario no tiene permisos en el sistema. Pedile a un admin que te habilite.</p><button className="btn" onClick={() => supabase.auth.signOut()}>Salir</button></div>;

  const ams = ctx.perfiles;
  return (
    <Contexto.Provider value={ctx}>
      <div className="app">
        <header className="barra-sup">
          <Marca />
          <nav className="nav">
            {PAGINAS.filter((p) => p.id !== 'sistema' || ctx.yo.rol === 'admin').map((p) => (
              <a key={p.id} href={`#${p.id}`} className={pagina === p.id ? 'on' : ''}>{p.titulo}</a>
            ))}
          </nav>
          <span className="sp" />
          <select className="sel" value={filtro} aria-label="Clientes a mostrar" onChange={(e) => { setFiltro(e.target.value); guardarLS('filtroAM', e.target.value); }}>
            <option value="mios">Mis clientes</option>
            <option value="todos">Todos los clientes</option>
            {ams.filter((p) => p.id !== ctx.yo.id).map((p) => <option key={p.id} value={p.id}>De {p.nombre || p.email}</option>)}
          </select>
          <button className="btn" onClick={() => supabase.auth.signOut()}>Salir</button>
        </header>
        <main>
          {pagina === 'pm' ? <PaidMedia /> : pagina === 'analisis' ? <Analisis /> : pagina === 'ventas' ? <Ventas /> : pagina === 'config' ? <Configuracion /> : pagina === 'sistema' && ctx.yo.rol === 'admin' ? <Sistema /> : <Inicio />}
        </main>
      </div>
    </Contexto.Provider>
  );
}
