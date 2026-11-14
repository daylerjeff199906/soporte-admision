import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consultarSigae } from './sigae.ts';

const json = (valor: unknown, status = 200) => new Response(JSON.stringify(valor), { status });

test('combina persona y ficha activa de la convocatoria; ignora fotos que no son https', async () => {
  const urls: string[] = [];
  const fetcher = async (url: string) => {
    urls.push(url);
    if (url.includes('person/person/')) return json({ results: [{ uuid: 'u-1', document_number: '11111111', names: 'ANA', last_name1: 'PEREZ', last_name2: 'LOPEZ', photo: 'https://archivos.example/foto.jpg' }] });
    return json([{ is_active: true }]);
  };
  const perfil = await consultarSigae('11111111', fetcher);
  assert.deepEqual(perfil, { nombre: 'PEREZ LOPEZ ANA', foto: 'https://archivos.example/foto.jpg', activo: true });
  assert.match(urls[1] ?? '', /person_uuid=u-1&promotion_convocatory__convocatory__uuid=/);

  const sinHttps = await consultarSigae('22222222', async url => url.includes('person/person/')
    ? json({ results: [{ uuid: 'u-2', document_number: '22222222', names: 'LUIS', last_name1: 'GOMEZ', last_name2: '', photo: 'http://inseguro/foto.jpg' }] })
    : json([]));
  assert.deepEqual(sinHttps, { nombre: 'GOMEZ LUIS', foto: null, activo: false });
});

test('devuelve null si la persona no existe o SIGAE falla, sin cachear el fallo', async () => {
  assert.equal(await consultarSigae('33333333', async () => json({ results: [] })), null);
  let llamadas = 0;
  assert.equal(await consultarSigae('44444444', async () => { llamadas++; throw new Error('caído'); }), null);
  assert.equal(await consultarSigae('44444444', async () => { llamadas++; return json({ results: [] }); }), null);
  assert.equal(llamadas, 2);
});
