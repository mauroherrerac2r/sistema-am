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
- También podés recibir DOCUMENTOS DEL CLIENTE (ficha de contexto, transcripciones de reuniones, propuestas, reportes) y ANÁLISIS ANTERIORES. Usalos para entender acuerdos, objetivos y lo que ya se recomendó: si un análisis anterior recomendó algo, decí si los datos muestran que se hizo y qué pasó. Si un documento contradice a otro, priorizá el más reciente y la ficha de contexto. Citá el documento cuando una conclusión dependa de él.
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

export interface DocumentoIA { nombre: string; modificado: string; contenido: { tipo: 'texto'; texto: string } | { tipo: 'pdf'; base64: string }; recortado?: boolean }
export interface AnalisisPrevio { fecha: string; tipo: string; periodo: string; contenido: string }
export interface Extras { documentos?: DocumentoIA[]; anteriores?: AnalisisPrevio[] }

/** Arma el pedido con el contexto PRIMERO y los números después. */
export function armarPedido(entrada: Record<string, unknown>, contextoExtra: string | null, extras: Extras = {}): string {
  const { contexto_negocio, contexto_periodo, ...datos } = entrada as { contexto_negocio?: string | null; contexto_periodo?: string | null };
  const periodo = [contexto_periodo, contextoExtra].filter(Boolean).join('\n');
  const textos = (extras.documentos ?? []).filter((d) => d.contenido.tipo === 'texto');
  const pdfs = (extras.documentos ?? []).filter((d) => d.contenido.tipo === 'pdf');
  const partes = [
    '# Contexto cargado por el Account Manager (leelo primero)',
    `## Del negocio\n${contexto_negocio?.trim() || 'Sin contexto del negocio cargado.'}`,
    `## Del período\n${periodo.trim() || 'Sin contexto del período cargado.'}`,
  ];
  if (textos.length || pdfs.length) {
    partes.push('# Documentos del cliente (carpeta de Drive)');
    if (pdfs.length) partes.push(`Además se adjuntan como PDF: ${pdfs.map((d) => `"${d.nombre}"`).join(', ')}.`);
    for (const d of textos) partes.push(`## ${d.nombre} (modificado ${d.modificado.slice(0, 10)})${d.recortado ? ' [recortado]' : ''}\n${(d.contenido as { texto: string }).texto.trim()}`);
  }
  if (extras.anteriores?.length) {
    partes.push('# Análisis anteriores de este cliente (del más reciente al más viejo)');
    for (const a of extras.anteriores) partes.push(`## ${a.fecha.slice(0, 10)} · versión ${a.tipo} · período ${a.periodo}\n${a.contenido.trim()}`);
  }
  partes.push('# Datos del período', JSON.stringify(datos), 'Con todo ese contexto en mente, escribí el análisis.');
  return partes.join('\n\n');
}

export async function generarAnalisis(tipo: TipoAnalisis, entrada: Record<string, unknown>, contexto: string | null, extras: Extras = {}): Promise<ResultadoIA> {
  const client = new Anthropic(); // usa ANTHROPIC_API_KEY
  const stream = client.beta.messages.stream({
    model: MODELO,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high' },
    system: PROMPTS[tipo],
    messages: [{
      role: 'user',
      content: [
        ...(extras.documentos ?? []).flatMap((d) => (d.contenido.tipo === 'pdf'
          ? [{ type: 'document' as const, title: d.nombre, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: d.contenido.base64 } }]
          : [])),
        { type: 'text' as const, text: armarPedido(entrada, contexto, extras) },
      ],
    }],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === 'refusal') throw new Error('El modelo no generó el análisis (rechazo de seguridad). Probá de nuevo o revisá el contexto cargado.');
  const texto = msg.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n').trim();
  if (!texto) throw new Error(msg.stop_reason === 'max_tokens' ? 'El análisis quedó cortado por longitud.' : 'El modelo no devolvió texto.');
  return { texto, modelo: msg.model, tokens_entrada: msg.usage.input_tokens, tokens_salida: msg.usage.output_tokens };
}
