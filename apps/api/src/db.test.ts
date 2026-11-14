import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, crearEvento, asignar, asignarLote, consultarDni, importarAulas, crearActa } from './db.ts';
test('asignaciones respetan la capacidad y los cruces; el acta conserva una instantánea',()=>{
  const db=openDatabase(); const id=Number(crearEvento(db,{tipo:'Entrevista',fecha:'2026-12-01T09:00',aulaId:1}));
  asignar(db,{eventoId:id,postulanteId:1,evaluadorId:1});
  assert.throws(()=>asignar(db,{eventoId:id,postulanteId:1,evaluadorId:2}),/ya tiene/);
  const acta=Number(crearActa(db,id,'2026-II'));
  asignar(db,{eventoId:id,postulanteId:2,evaluadorId:2});
  asignar(db,{eventoId:id,postulanteId:3,evaluadorId:2});
  db.exec("INSERT INTO postulantes(id,nombre,programa) VALUES (4,'Cuarto Ejemplo','Programa')");
  assert.throws(()=>asignar(db,{eventoId:id,postulanteId:4,evaluadorId:1}),/capacidad/);
  assert.throws(()=>crearEvento(db,{tipo:'Evaluación',fecha:'2026-12-01T09:00',aulaId:1}),/ocupada/);
  assert.equal(JSON.parse((db.prepare('SELECT contenido FROM actas WHERE id=?').get(acta) as {contenido:string}).contenido).asignaciones.length,1);
  db.close();
});
test('sincroniza únicamente aulas disponibles para examen con capacidad y conserva los registros previos',()=>{
  const db=openDatabase();const snapshot={ambientes:[{codigo:'A-201',nombre:'Aula institucional',usos:['examen_admision'],estado:'disponible',capacidad:20},{codigo:'A-202',nombre:'Cerrada',usos:['examen_admision'],estado:'mantenimiento',capacidad:20}]};
  assert.equal(importarAulas(db,snapshot),1);assert.equal((db.prepare('SELECT count(*) AS n FROM aulas WHERE activa=1').get() as {n:number}).n,3);
  assert.throws(()=>importarAulas(db,{ambientes:[{}]}),/no es válido/);
  assert.equal((db.prepare("SELECT activa FROM aulas WHERE codigo='A-201'").get() as {activa:number}).activa,1);db.close();
});
test('la asignación masiva es atómica y la consulta devuelve solo la programación del DNI',()=>{
  const db=openDatabase();const eventoId=Number(crearEvento(db,{tipo:'Entrevista',fecha:'2026-12-02T09:00',aulaId:1}));
  assert.throws(()=>asignarLote(db,{eventoId,evaluadorId:1,postulantesIds:[1,999]}),/no existe/);
  assert.equal(consultarDni(db,'00000001').length,0);
  asignarLote(db,{eventoId,evaluadorId:1,postulantesIds:[1,2]});
  assert.equal(consultarDni(db,'00000001')[0]?.aula,'Aula 101');
  assert.equal(consultarDni(db,'00000003').length,0);
  assert.throws(()=>consultarDni(db,'123'),/8 dígitos/);
  db.close();
});
