import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase} from './db.mjs';
import {fuente,trasladar,consultarFuente} from './fuente.mjs';
test('los traslados masivos conservan los datos originales y se reflejan en la consulta',()=>{
  const directory=mkdtempSync(join(tmpdir(),'admision-test-')),source=join(directory,'grupos.json');
  const groups=[{tipo:'examen',programa:'Programa de prueba',aula:'1',postulantes:[{documento:'00000001',nombre:'Ejemplo A'},{documento:'00000002',nombre:'Ejemplo B'}]},{tipo:'examen',programa:'Programa de prueba',aula:'2',postulantes:[]}];
  writeFileSync(source,JSON.stringify({grupos:groups}));const db=openDatabase();
  try {
    assert.throws(()=>trasladar(db,{origen:0,destino:1,documentos:['00000001','99999999']},source),/lista cambió/);
    assert.equal(db.prepare('SELECT count(*) AS n FROM fuente_traslados').get().n,0);
    trasladar(db,{origen:0,destino:1,documentos:['00000001','00000002']},source);
    assert.equal(fuente(db,source).grupos[1].postulantes.length,2);
    assert.ok(consultarFuente(db,'00000001',source).some(g=>g.aula==='2'));
    assert.equal(db.prepare('SELECT count(*) AS n FROM fuente_movimientos').get().n,2);
  } finally {db.close();rmSync(directory,{recursive:true,force:true});}
});
