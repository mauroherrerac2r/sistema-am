// Identidad de la agencia: nombre del sistema y logo (claro y oscuro según el tema del equipo).
export const NOMBRE_SISTEMA = import.meta.env.VITE_NOMBRE_SISTEMA || 'Centro de Control';
export const AGENCIA = 'Clic2Ring';

export function Logo({ alto = 26 }: { alto?: number }) {
  return (
    <picture>
      <source srcSet="/logo-oscuro.png" media="(prefers-color-scheme: dark)" />
      <img src="/logo.png" alt={AGENCIA} height={alto} style={{ height: alto, width: 'auto', display: 'block' }} />
    </picture>
  );
}

export function Marca() {
  return (
    <a href="#inicio" className="marca" aria-label={`${NOMBRE_SISTEMA} · ${AGENCIA}`}>
      <Logo />
      <span className="marca-sep" aria-hidden="true" />
      <span className="marca-nombre">{NOMBRE_SISTEMA}</span>
    </a>
  );
}
