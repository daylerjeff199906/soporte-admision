import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consultarSigae, estadoSigae } from './sigae.ts';

const json = (valor: unknown, status = 200) => new Response(JSON.stringify(valor), { status });

test('combina persona y ficha activa de la convocatoria; ignora fotos que no son https', async () => {
  const urls: string[] = [];
  const fetcher = async (url: string) => {
    urls.push(url);
    if (url.includes('person/person/')) return json({ results: [{ uuid: 'u-1', document_number: '11111111', names: 'ANA', last_name1: 'PEREZ', last_name2: 'LOPEZ', photo: 'https://archivos.example/foto.jpg' }] });
    return json([{ is_active: true }]);
  };
  const perfil = await consultarSigae('11111111', fetcher);
  assert.deepEqual(perfil, { nombre: 'PEREZ LOPEZ ANA', foto: 'https://archivos.example/foto.jpg', inscrito: true, activo: true });
  assert.match(urls[1] ?? '', /person_uuid=u-1&promotion_convocatory__convocatory__uuid=/);

  const sinHttps = await consultarSigae('22222222', async url => url.includes('person/person/')
    ? json({ results: [{ uuid: 'u-2', document_number: '22222222', names: 'LUIS', last_name1: 'GOMEZ', last_name2: '', photo: 'http://inseguro/foto.jpg' }] })
    : json([]));
  assert.deepEqual(sinHttps, { nombre: 'GOMEZ LUIS', foto: null, inscrito: false, activo: false });
});

test('si la persona no existe no es un fallo: figura como no inscrita', async () => {
  const perfil = await consultarSigae('33333333', async () => json({ results: [] }));
  assert.deepEqual(perfil, { nombre: '', foto: null, inscrito: false, activo: false });
});

test('devuelve null si SIGAE falla, sin cachear el fallo', async () => {
  let llamadas = 0;
  assert.equal(await consultarSigae('44444444', async () => { llamadas++; throw new Error('caído'); }), null);
  assert.equal((await consultarSigae('44444444', async () => { llamadas++; return json({ results: [] }); }))?.inscrito, false);
  assert.equal(llamadas, 2);
});

test('estadoSigae: verificado y activo, inactivo con observación, o no encontrado', () => {
  assert.deepEqual(estadoSigae({ nombre: 'A', foto: null, inscrito: true, activo: true }), { verificado: true, activo: true, observacion: null });
  const inactivo = estadoSigae({ nombre: 'A', foto: null, inscrito: true, activo: false });
  assert.equal(inactivo.verificado, true);
  assert.equal(inactivo.activo, false);
  assert.match(inactivo.observacion ?? '', /figura como inactivo.*verificación posterior/);
  const ausente = estadoSigae({ nombre: '', foto: null, inscrito: false, activo: false });
  assert.equal(ausente.verificado, false);
  assert.match(ausente.observacion ?? '', /No encontramos/);
});
