import { describe, it, expect, beforeAll } from 'vitest';
import { idDeLink, firmarEstado, verificarEstado, priorizar, ArchivoDrive } from '../src/server/google';
import { armarPedido } from '../src/server/ia';

beforeAll(() => { process.env.SYNC_SECRET = 'secreto-de-prueba'; });

describe('links de Google', () => {
  it('carpeta, documento, sheet con gid e ID suelto', () => {
    expect(idDeLink('https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp?usp=sharing')).toEqual({ id: '1AbCdEfGhIjKlMnOp', gid: null });
    expect(idDeLink('https://docs.google.com/spreadsheets/d/1Coee1YPl8ZR8jA0znsS-GM6CdPdMJtURPB8UmKfIMZE/edit?gid=746103798#gid=746103798')).toEqual({ id: '1Coee1YPl8ZR8jA0znsS-GM6CdPdMJtURPB8UmKfIMZE', gid: '746103798' });
    expect(idDeLink('1Coee1YPl8ZR8jA0znsS')?.id).toBe('1Coee1YPl8ZR8jA0znsS');
    expect(idDeLink('hola')).toBeNull();
  });
});

describe('estado firmado de la conexión', () => {
  it('acepta el propio, rechaza alterado o vencido', () => {
    const e = firmarEstado('u1', 1_000_000);
    expect(verificarEstado(e, 1_000_000 + 60_000)).toBe('u1');
    expect(verificarEstado(e.replace('u1', 'u2'), 1_000_000)).toBeNull();
    expect(verificarEstado(e, 1_000_000 + 11 * 60_000)).toBeNull();
  });
});

describe('prioridad de documentos', () => {
  const a = (nombre: string, tipo: string, modificado: string): ArchivoDrive => ({ id: nombre, nombre, tipo, modificado, tamano: 10, link: '' });
  it('ficha de contexto primero, luego lo más reciente; descarta lo ilegible', () => {
    const r = priorizar([
      a('Transcripción reunión 20/11', 'application/vnd.google-apps.document', '2026-11-20T10:00:00Z'),
      a('Ficha de contexto NSG', 'application/vnd.google-apps.document', '2026-10-01T10:00:00Z'),
      a('Video.mp4', 'video/mp4', '2026-11-22T10:00:00Z'),
      a('Propuesta.pdf', 'application/pdf', '2026-11-21T10:00:00Z'),
    ]);
    expect(r.map((x) => x.nombre)).toEqual(['Ficha de contexto NSG', 'Propuesta.pdf', 'Transcripción reunión 20/11']);
  });
});

describe('pedido con documentos y memoria', () => {
  it('orden: contexto AM → documentos → análisis anteriores → datos', () => {
    const p = armarPedido({ contexto_negocio: 'NEGOCIO', totales: { roas: 1 } }, null, {
      documentos: [{ nombre: 'Ficha', modificado: '2026-11-01T00:00:00Z', contenido: { tipo: 'texto', texto: 'FICHA' } }, { nombre: 'Propuesta.pdf', modificado: '2026-11-02T00:00:00Z', contenido: { tipo: 'pdf', base64: 'x' } }],
      anteriores: [{ fecha: '2026-11-10T00:00:00Z', tipo: 'paid', periodo: '2026-11-01 al 2026-11-09', contenido: 'PAUSAR ANUNCIO 9' }],
    });
    const pos = ['NEGOCIO', 'FICHA', 'PAUSAR ANUNCIO 9', '"totales"'].map((t) => p.indexOf(t));
    expect(pos.every((v, i) => v >= 0 && (i === 0 || v > pos[i - 1]))).toBe(true);
    expect(p).toContain('"Propuesta.pdf"');
    expect(p).not.toContain('"x"');
  });
});
