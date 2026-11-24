// Análisis con Claude sobre el cruce ventas CRM × Meta. Corre solo en el servidor.
import Anthropic from '@anthropic-ai/sdk';

export type TipoAnalisis = 'cliente' | 'paid';

export const MODELO = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';

const BASE = `Sos un consultor senior de performance en una agencia de generación de leads con Meta Ads.
Recibís en JSON el cruce entre la inversión de Meta y las ventas que registra el CRM del cliente, atribuidas por ID de anuncio.

Reglas:
- Usá solo los números del JSON. No inventes cifras, benchmarks de industria ni causas que los datos no muestren; cuando algo sea una hipótesis, decilo como hipótesis.
- Los montos están en la moneda indicada en "moneda". Escribí números en formato es-AR (1.234,56).
- "roas" = monto vendido / inversión. "roas_cobrado" = monto cobrado / inversión. "cierre_pct" = órdenes / leads del CRM.
- Tené en cuenta las limitaciones que aparecen en "hallazgos" (ventas sin cargar, montos por cobrar, anuncios fuera de las cuentas) y nombralas cuando cambien la lectura.
- Antes de los datos recibís el CONTEXTO que cargó el Account Manager: el del negocio (estable) y el del período. Es tu punto de partida: usalo para interpretar los números (qué cuenta como venta, ciclos de venta, cambios operativos, prioridades) y para decidir qué destacar. Si los datos contradicen el contexto, señalalo con respeto.
- Si hay "roas_objetivo", evaluá cada sede, campaña y anuncio contra ese objetivo (no solo contra ROAS 1).
- Escribí en español neutro, directo, sin relleno ni frases motivacionales. Markdown simple: títulos con ##, viñetas con -, negritas con **. Podés usar tablas markdown chicas.`;

const PROMPTS: Record<TipoAnalisis, string> = {
  cliente: `${BASE}

Destinatario: el CLIENTE (dueño o gerente del negocio), no un especialista en publicidad.
- Lenguaje de negocio: ventas, retorno de la inversión, costo por venta. Evitá siglas técnicas o explicalas en una frase (por ejemplo "retorno: por cada US$1 invertido volvieron US$1,30").
- No menciones IDs de anuncios ni detalles de configuración de campañas.
- Si hay sedes con leads y sin ventas registradas, planteá con tacto que hace falta confirmar la carga de ventas en el CRM para medir bien.
Estructura:
## Resumen del período (3 a 4 líneas con los números clave)
## Qué funcionó
## Qué hay que mejorar
## Próximos pasos (lo que hará la agencia y lo que necesitamos del cliente)
Extensión: entre 250 y 450 palabras.`,
  paid: `${BASE}

Destinatario: el equipo de PAID MEDIA que opera las campañas.
- Concreto y accionable: cada recomendación con el anuncio o campaña (nombre e ID), el número que la justifica y la acción.
- Priorizá por impacto en monto vendido y en eficiencia (ROAS, costo por orden), no por volumen de leads.
- Señalá problemas de medición (leads CRM vs resultados Meta, anuncios fuera de cuentas, ventas sin cargar) antes de recomendar cortes fuertes de presupuesto.
Estructura:
## Lectura general (5 líneas máximo)
## Escalar (anuncios o campañas con mejor retorno y evidencia suficiente)
## Pausar o recortar (gasto sin ventas o con retorno muy por debajo del promedio)
## Testear (hipótesis concretas: creativos, audiencias, sedes)
## Medición y datos (qué corregir para confiar en el número)
Extensión: entre 350 y 650 palabras.`,
};

export interface ResultadoIA { texto: string; modelo: string; tokens_entrada: number; tokens_salida: number }

/** Arma el pedido con el contexto PRIMERO y los números después. */
export function armarPedido(entrada: Record<string, unknown>, contextoExtra: string | null): string {
  const { contexto_negocio, contexto_periodo, ...datos } = entrada as { contexto_negocio?: string | null; contexto_periodo?: string | null };
  const periodo = [contexto_periodo, contextoExtra].filter(Boolean).join('\n');
  return [
    '# Contexto cargado por el Account Manager (leelo primero)',
    `## Del negocio\n${contexto_negocio?.trim() || 'Sin contexto del negocio cargado.'}`,
    `## Del período\n${periodo.trim() || 'Sin contexto del período cargado.'}`,
    '# Datos del período',
    JSON.stringify(datos),
    'Con ese contexto en mente, escribí el análisis.',
  ].join('\n\n');
}

export async function generarAnalisis(tipo: TipoAnalisis, entrada: Record<string, unknown>, contexto: string | null): Promise<ResultadoIA> {
  const client = new Anthropic(); // usa ANTHROPIC_API_KEY
  const stream = client.beta.messages.stream({
    model: MODELO,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high' },
    system: PROMPTS[tipo],
    messages: [{ role: 'user', content: armarPedido(entrada, contexto) }],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === 'refusal') throw new Error('El modelo no generó el análisis (rechazo de seguridad). Probá de nuevo o revisá el contexto cargado.');
  const texto = msg.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n').trim();
  if (!texto) throw new Error(msg.stop_reason === 'max_tokens' ? 'El análisis quedó cortado por longitud.' : 'El modelo no devolvió texto.');
  return { texto, modelo: msg.model, tokens_entrada: msg.usage.input_tokens, tokens_salida: msg.usage.output_tokens };
}
