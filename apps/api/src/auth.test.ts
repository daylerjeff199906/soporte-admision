import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cargarCredenciales, cargarSecreto, crearToken, iguales, usuarioDeToken } from './auth.ts';

test('el token de sesión valida firma y vencimiento', () => {
  const t = crearToken('admin', 'secreto', 1_000, 5_000);
  assert.equal(usuarioDeToken(t, 'secreto', 2_000), 'admin');
  assert.equal(usuarioDeToken(t, 'secreto', 6_001), null); // vencido
  assert.equal(usuarioDeToken(t, 'otro-secreto', 2_000), null); // firma distinta
  const [carga, firma] = t.split('.') as [string, string];
  const manipulada = Buffer.from(JSON.stringify({ u: 'root', e: 9e12 })).toString('base64url');
  assert.equal(usuarioDeToken(`${manipulada}.${firma}`, 'secreto', 2_000), null);
  assert.equal(usuarioDeToken(undefined, 'secreto'), null);
  assert.equal(usuarioDeToken('basura', 'secreto'), null);
  assert.ok(carga);
});

test('iguales compara sin importar la longitud', () => {
  assert.equal(iguales('abc', 'abc'), true);
  assert.equal(iguales('abc', 'abcd'), false);
});

test('las credenciales salen del entorno o se generan y persisten', () => {
  const dir = mkdtempSync(join(tmpdir(), 'admision-auth-')), archivo = join(dir, 'acceso-local.txt');
  try {
    assert.deepEqual(cargarCredenciales({ ADMIN_USER: 'soporte', ADMIN_PASSWORD: 'p4ss' }, archivo), { usuario: 'soporte', clave: 'p4ss', generada: false });
    const generada = cargarCredenciales({}, archivo);
    assert.equal(generada.usuario, 'admin');
    assert.match(generada.clave, /^[0-9a-f]{36}$/);
    assert.equal(cargarCredenciales({}, archivo).clave, generada.clave); // estable entre reinicios
    writeFileSync(archivo, 'claveantigua'); // formato anterior: solo la clave
    assert.equal(cargarCredenciales({}, archivo).clave, 'claveantigua');
    const archivoSecreto = join(dir, 'sesion.secret');
    const secreto = cargarSecreto({}, archivoSecreto);
    assert.equal(secreto, readFileSync(archivoSecreto, 'utf8').trim());
    assert.equal(cargarSecreto({ SESSION_SECRET: 'fijo' }, archivoSecreto), 'fijo');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
