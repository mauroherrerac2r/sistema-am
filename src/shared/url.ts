/**
 * Deja solo https://xxxx.supabase.co aunque se haya copiado la URL del API REST
 * (https://xxxx.supabase.co/rest/v1/), con espacios o con barra final.
 */
export function urlBase(url: string | undefined): string {
  const t = (url || '').trim();
  try { return new URL(t).origin; } catch { return t; }
}
