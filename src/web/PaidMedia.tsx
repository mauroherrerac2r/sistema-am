// Panel de Paid Media: Operación · Análisis de cuenta · Creativos · Recomendaciones.
// El PM se asigna por cuenta publicitaria. Todos pueden ver todo: el filtro arranca en "mis cuentas".
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp, nombreCuenta } from './contexto';
import { Inicio } from './Inicio';
import { PMAnalisis } from './PMAnalisis';
import { PMCreativos } from './PMCreativos';
import { PMRecos } from './PMRecos';
import { diasCuenta, anunciosDiarios, estructuraCuentas, frecuencias7d, estadosRecos, briefsRecientes } from './datos';
import { evaluarDia, evaluarSemana, Dia, CfgCuenta } from './reglas';
import { armarCreativos, armarConjuntos, generarRecos, vigente, Creativo, Conjunto, Reco, CuentaPM, EstadoReco, AdDiario } from './reglasPM';
import { fechaEnZona, horaEnZona, sumarDias } from '../shared/fechas';
import { dinero } from './formato';
import { Aviso } from './ui';

const SUBS = [
  { id: 'operacion', titulo: 'Operación' },
  { id: 'analisis', titulo: 'Análisis de cuenta' },
  { id: 'creativos', titulo: 'Creativos' },
  { id: 'recos', titulo: 'Recomendaciones' },
];

export interface DatosPM {
  cuentas: CuentaPM[];
  dias: Dia[];
  diarios: AdDiario[];
  creativos: Creativo[];       // últimos 14 días
  conjuntos: Conjunto[];
  recos: Reco[];               // sin las ya tratadas
  estados: Map<string, EstadoReco>;
  hoy: string;
  recargarEstados: () => Promise<void>;
}

const leerLS = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const guardarLS = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };

export function PaidMedia() {
  const { yo, perfiles, cuentasCfg, clientes } = useApp();
  const pms = perfiles.filter((p) => p.rol === 'pm');
  const [sub, setSub] = useState(() => leerLS('pmSub') || 'operacion');
  const [filtro, setFiltro] = useState(() => leerLS('pmFiltro') || (yo.rol === 'pm' ? yo.id : 'todas'));
  const activos = useMemo(() => new Set(clientes.filter((c) => c.activo).map((c) => c.id)), [clientes]);

  const cfgs = useMemo(() => cuentasCfg.filter((c) => activos.has(c.client_id) && (
    filtro === 'todas' ? true : filtro === 'sin' ? !c.pm_id : c.pm_id === filtro)), [cuentasCfg, activos, filtro]);
  const soloCuentas = useMemo(() => new Set(cfgs.map((c) => c.ad_account_id)), [cfgs]);
  const datos = useDatosPM(cfgs, sub !== 'operacion');

  const cambiar = (v: string) => { setFiltro(v); guardarLS('pmFiltro', v); };
  const irA = (v: string) => { setSub(v); guardarLS('pmSub', v); window.scrollTo({ top: 0 }); };
  const sinPM = cuentasCfg.filter((c) => activos.has(c.client_id) && !c.pm_id).length;

  return (
    <div className="pila">
      <div className="fila pm-barra">
        <div className="tabs-sub" role="tablist" aria-label="Secciones de Paid Media">
          {SUBS.map((s) => <button key={s.id} role="tab" aria-selected={sub === s.id} className={`btn ${sub === s.id ? 'on' : ''}`} onClick={() => irA(s.id)}>{s.titulo}{s.id === 'recos' && datos.listo ? ` (${datos.recos.length})` : ''}</button>)}
        </div>
        <span className="sp" />
        <label className="en-linea">Cuentas de
          <select className="sel" value={filtro} onChange={(e) => cambiar(e.target.value)}>
            {yo.rol === 'pm' && <option value={yo.id}>Mis cuentas</option>}
            <option value="todas">Todos los PM</option>
            {pms.filter((p) => p.id !== yo.id).map((p) => <option key={p.id} value={p.id}>{p.nombre || p.email}</option>)}
            {sinPM > 0 && <option value="sin">Sin PM asignado ({sinPM})</option>}
          </select>
        </label>
      </div>
      {!pms.length && <Aviso>Todavía no hay usuarios con rol Paid Media. Se crean en Sistema → Usuarios, y cada cuenta se asigna a su PM en la pestaña Clientes.</Aviso>}
      {sub === 'operacion' && <Inicio soloCuentas={soloCuentas} />}
      {sub !== 'operacion' && (datos.error ? <Aviso tipo="error">{datos.error}</Aviso> : !datos.listo ? <p className="muted">Cargando datos de las cuentas…</p> : !cfgs.length ? <Aviso>No hay cuentas para este filtro.</Aviso> : (
        sub === 'analisis' ? <PMAnalisis d={datos} irRecos={() => irA('recos')} /> : sub === 'creativos' ? <PMCreativos d={datos} /> : <PMRecos d={datos} />
      ))}
    </div>
  );
}

function useDatosPM(cfgs: CfgCuenta[], activo: boolean): DatosPM & { listo: boolean; error: string } {
  const { metaPorId } = useApp();
  const ids = useMemo(() => cfgs.map((c) => c.ad_account_id), [cfgs]);
  const clientesIds = useMemo(() => [...new Set(cfgs.map((c) => c.client_id))], [cfgs]);
  const hoy = fechaEnZona('America/Argentina/Buenos_Aires');
  const [crudo, setCrudo] = useState<any>(null);
  const [estadosLista, setEstadosLista] = useState<EstadoReco[]>([]);
  const [error, setError] = useState('');

  const recargarEstados = useCallback(async () => { setEstadosLista(await estadosRecos(ids)); }, [ids]);
  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    setCrudo(null); setError('');
    (async () => {
      try {
        const [dias, diarios, est, f7, estados, briefs] = await Promise.all([
          diasCuenta(ids, sumarDias(hoy, -57)), anunciosDiarios(ids, sumarDias(hoy, -28)), estructuraCuentas(ids), frecuencias7d(ids),
          estadosRecos(ids), briefsRecientes(clientesIds, sumarDias(hoy, -14) + 'T00:00:00Z'),
        ]);
        if (vivo) { setCrudo({ dias, diarios, est, f7, briefs }); setEstadosLista(estados); }
      } catch (e: any) { if (vivo) setError(e.message); }
    })();
    return () => { vivo = false; };
  }, [ids, clientesIds, activo, hoy]);

  return useMemo(() => {
    const vacio = { cuentas: [], dias: [], diarios: [], creativos: [], conjuntos: [], recos: [], estados: new Map(), hoy, recargarEstados, listo: false, error };
    if (!crudo) return vacio;
    const porCuenta = new Map<string, Dia[]>();
    (crudo.dias as Dia[]).forEach((d) => porCuenta.set(d.ad_account_id, [...(porCuenta.get(d.ad_account_id) || []), d]));
    const cuentas: CuentaPM[] = cfgs.map((cfg) => {
      const meta = metaPorId.get(cfg.ad_account_id), zona = meta?.zona_horaria ?? null;
      const filas = porCuenta.get(cfg.ad_account_id) || [];
      return { cfg, meta, nombre: nombreCuenta(cfg, meta), moneda: meta?.moneda ?? null,
        dia: evaluarDia(cfg, filas.find((d) => d.fecha === fechaEnZona(zona, 0)), horaEnZona(zona), false),
        sem: evaluarSemana(cfg, meta, filas, fechaEnZona(zona, -1)) };
    });
    const fechas14 = Array.from({ length: 14 }, (_, i) => sumarDias(hoy, -14 + i));
    const diarios14 = (crudo.diarios as AdDiario[]).filter((d) => d.fecha >= fechas14[0]);
    const cfgPorCuenta = new Map(cfgs.map((c) => [c.ad_account_id, c]));
    const f7 = new Map<string, number | null>([...(crudo.f7 as Map<string, { frecuencia: number | null }>)].map(([k, v]) => [k, v.frecuencia]));
    const creativos = armarCreativos(diarios14, crudo.est.ads, crudo.est.adsets, crudo.est.campanas, cfgPorCuenta, f7, fechas14, hoy);
    const conjuntos = armarConjuntos(creativos, crudo.est.adsets, crudo.est.campanas);
    const estados = vigente(estadosLista, hoy);
    const recos = generarRecos(cuentas, creativos, conjuntos, crudo.briefs, dinero).filter((r) => !estados.has(r.clave));
    return { cuentas, dias: crudo.dias, diarios: crudo.diarios, creativos, conjuntos, recos, estados, hoy, recargarEstados, listo: true, error, est: crudo.est } as any;
  }, [crudo, cfgs, metaPorId, estadosLista, hoy, recargarEstados, error]);
}
