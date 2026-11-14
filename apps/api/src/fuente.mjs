import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const path=new URL('../../../data/fuentes-excel/grupos.json',import.meta.url);
export function fuente(db,source=path){
  const raw=readFileSync(source,'utf8');const fingerprint=createHash('sha256').update(raw).digest('hex');
  const saved=db.prepare("SELECT valor FROM fuente_meta WHERE clave='sha256'").get();
  if(saved && saved.valor!==fingerprint && db.prepare('SELECT count(*) AS n FROM fuente_traslados').get().n)throw new Error('La fuente Excel cambió; revisa los traslados locales antes de continuar.');
  const data=JSON.parse(raw);
  for(const traslado of db.prepare('SELECT tipo,documento,destino FROM fuente_traslados').all()){
    const origen=data.grupos.find(g=>g.tipo===traslado.tipo && g.postulantes.some(p=>p.documento===traslado.documento));
    const destino=data.grupos[traslado.destino];
    if(!origen || !destino || destino.tipo!==traslado.tipo) throw new Error('Hay una asignación local incompatible con la fuente.');
    const pos=origen.postulantes.findIndex(p=>p.documento===traslado.documento);destino.postulantes.push(origen.postulantes.splice(pos,1)[0]);
  }
  for(const g of data.grupos) g.postulantes.sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
  return data;
}
export function resumen(db){const data=fuente(db);return {corte:data.corte,grupos:data.grupos.map(({postulantes,...g},indice)=>({...g,indice,total:postulantes.length}))};}
export function consultarFuente(db,dni,source=path){
  if(typeof dni!=='string'||!/^\d{8}$/.test(dni))throw new Error('Ingresa un DNI de 8 dígitos.');
  return fuente(db,source).grupos.filter(g=>g.postulantes.some(p=>p.documento===dni)).map(({postulantes,...g})=>g);
}
export function trasladar(db,input,source=path){
  if(!Number.isInteger(input.origen) || !Number.isInteger(input.destino) || input.origen===input.destino || !Array.isArray(input.documentos) || !input.documentos.length || input.documentos.length>500 || new Set(input.documentos).size!==input.documentos.length)throw new Error('Selecciona postulantes y otro grupo.');
  const grupos=fuente(db,source).grupos, origen=grupos[input.origen],destino=grupos[input.destino];
  if(!origen || !destino || origen.tipo!==destino.tipo || origen.programa!==destino.programa)throw new Error('El grupo de destino debe corresponder a la misma actividad y programa.');
  if(!input.documentos.every(d=>typeof d==='string' && origen.postulantes.some(p=>p.documento===d)))throw new Error('La lista cambió; vuelve a seleccionar los postulantes.');
  db.exec('BEGIN IMMEDIATE');try{
    db.prepare("INSERT INTO fuente_meta(clave,valor) VALUES ('sha256',?) ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor").run(createHash('sha256').update(readFileSync(source,'utf8')).digest('hex'));
    const save=db.prepare('INSERT INTO fuente_traslados(tipo,documento,destino) VALUES (?,?,?) ON CONFLICT(tipo,documento) DO UPDATE SET destino=excluded.destino');
    const audit=db.prepare('INSERT INTO fuente_movimientos(tipo,documento,origen,destino,fecha) VALUES (?,?,?,?,?)');
    for(const doc of input.documentos){save.run(origen.tipo,doc,input.destino);audit.run(origen.tipo,doc,input.origen,input.destino,new Date().toISOString());}
    db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
}
