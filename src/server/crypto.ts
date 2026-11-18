import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// AES-256-GCM. Formato guardado: v1:<iv base64>:<tag base64>:<datos base64>
const VERSION = 'v1';

function clave(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error('Falta TOKEN_ENCRYPTION_KEY');
  const k = Buffer.from(raw, 'base64');
  if (k.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY tiene que ser 32 bytes en base64');
  return k;
}

export function cifrar(texto: string, key: Buffer = clave()): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const datos = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return [VERSION, iv.toString('base64'), c.getAuthTag().toString('base64'), datos.toString('base64')].join(':');
}

export function descifrar(guardado: string, key: Buffer = clave()): string {
  const [v, iv, tag, datos] = guardado.split(':');
  if (v !== VERSION || !iv || !tag || !datos) throw new Error('Token cifrado con formato desconocido');
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(datos, 'base64')), d.final()]).toString('utf8');
}
