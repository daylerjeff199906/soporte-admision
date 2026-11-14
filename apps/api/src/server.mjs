import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openDatabase, datos, crearEvento, asignar, asignarLote, consultarDni, importarAulas, crearActa } from './db.mjs';
import { renderActa } from './acta.mjs';
import { fuente, resumen, consultarFuente, trasladar } from './fuente.mjs';

if (process.env.NODE_ENV === 'production') throw new Error('Este laboratorio solo admite datos de ejemplo y no puede ejecutarse en producción.');
const directory=fileURLToPath(new URL('../../../data/', import.meta.url));
mkdirSync(directory,{recursive:true});
const db=openDatabase(directory+'programacion.sqlite',false);
const accessFile=directory+'acceso-local.txt';
if(!existsSync(accessFile))writeFileSync(accessFile,randomBytes(24).toString('hex'),{mode:0o600});
const access=readFileSync(accessFile,'utf8').trim();
const same=(a,b)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length && timingSafeEqual(x,y);};
const attempts=new Map();
function limit(key,max){const now=Date.now(), entry=attempts.get(key);if(!entry||entry.reset<=now){attempts.set(key,{n:1,reset:now+60_000});return false;}return ++entry.n>max;}
const origin='http://127.0.0.1:4350';
createServer(async (req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.headers.host!=='127.0.0.1:4351'){res.writeHead(403).end();return;}
  const url=new URL(req.url ?? '/', 'http://127.0.0.1:4351');
  if (req.headers.origin && req.headers.origin!==origin) {res.writeHead(403).end();return;}
  if (req.headers.origin===origin) {res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Access-Control-Allow-Credentials','true');res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');}
  if (req.method==='OPTIONS') {res.writeHead(204).end();return;}
  const json=(code, value)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
  try {
    if(req.method==='POST' && url.pathname==='/api/sesion'){
      if(req.headers.origin!==origin || !req.headers['content-type']?.startsWith('application/json'))return json(403,{error:'Origen no permitido.'});
      if(limit('sesion',8))return json(429,{error:'Demasiados intentos. Espera un minuto.'});
      let body='';for await(const chunk of req){body+=chunk;if(body.length>1024)return json(413,{error:'Solicitud demasiado grande.'});}
      let input;try{input=JSON.parse(body);}catch{return json(400,{error:'Datos inválidos.'});}
      if(typeof input?.clave!=='string' || !same(input.clave,access))return json(401,{error:'Clave incorrecta.'});
      res.setHeader('Set-Cookie',`admision_local=${access}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);return json(200,{ok:true});
    }
    const authorized=(req.headers.cookie??'').split(';').some(c=>{const [k,v]=c.trim().split('=');return k==='admision_local' && typeof v==='string' && same(v,access);});
    if(!authorized && url.pathname!=='/api/consulta')return json(401,{error:'Acceso local requerido.'});
    if(req.method==='GET' && url.pathname==='/api/fuente')return json(200,resumen(db));
    const groupMatch=/^\/api\/grupos\/(\d+)$/.exec(url.pathname);
    if(req.method==='GET' && groupMatch){const grupo=fuente(db).grupos[Number(groupMatch[1])];return grupo?json(200,grupo):json(404,{error:'Grupo no encontrado.'});}
    const fichaMatch=/^\/api\/fichas\/(\d+)$/.exec(url.pathname);
    if(req.method==='GET' && fichaMatch){
      const id=Number(fichaMatch[1]);const grupo=fuente(db).grupos[id];if(!grupo)return json(404,{error:'Grupo no encontrado.'});
      const date=(grupo.fecha??grupo.instrucciones).match(/(\d{2})\/(\d{2})\/(\d{4})/);
      const evento={tipo:grupo.tipo==='examen'?'Evaluación':'Entrevista',fecha:date?`${date[3]}-${date[2]}-${date[1]}T00:00`:'0000-00-00T00:00',aula:grupo.aula,capacidad:'No indicada'};
      const asignaciones=grupo.postulantes.map(p=>({postulante:p.nombre,dni:p.documento}));
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; img-src data:"});
      return res.end(renderActa({id:id+1,contenido:JSON.stringify({evento,asignaciones,convocatoria:'2026-II'})}));
    }
    if(req.method==='GET' && url.pathname==='/api/datos') return json(200,datos(db));
    const match=/^\/api\/actas\/(\d+)$/.exec(url.pathname);
    if(req.method==='GET' && match){
      const acta=db.prepare('SELECT * FROM actas WHERE id=?').get(Number(match[1]));
      if(!acta) return json(404,{error:'Acta no encontrada.'});
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; img-src data:"});
      return res.end(renderActa(acta));
    }
    if(req.method==='POST' && ['/api/eventos','/api/asignaciones','/api/asignaciones-lote','/api/trasladar','/api/consulta','/api/sincronizar-aulas','/api/actas'].includes(url.pathname)){
      if(req.headers.origin!==origin || !req.headers['content-type']?.startsWith('application/json')) return json(403,{error:'Origen no permitido.'});
      let body=''; for await (const chunk of req) {body+=chunk;if(body.length>8192) return json(413,{error:'Solicitud demasiado grande.'});}
      let input;try{input=JSON.parse(body);}catch{return json(400,{error:'Datos inválidos.'});}
      if (!input || typeof input!=='object' || Array.isArray(input)) return json(400,{error:'Datos inválidos.'});
      if(url.pathname==='/api/consulta'){if(limit('consulta',10))return json(429,{error:'Demasiadas consultas. Espera un minuto.'});return json(200,{actividades:consultarFuente(db,input.dni)});}
      if(url.pathname==='/api/trasladar'){trasladar(db,input);return json(200,{ok:true});}
      if(url.pathname==='/api/sincronizar-aulas'){
        if(!process.env.INTRANET_URL || !process.env.INTRANET_SERVICE_KEY) return json(503,{error:'Catálogo institucional no configurado. Se muestran aulas de ejemplo.'});
        let response;try{response=await fetch(new URL('/interno/v1/ambientes',process.env.INTRANET_URL),{headers:{'X-Service-Name':'admision','X-Service-Key':process.env.INTRANET_SERVICE_KEY},redirect:'error',signal:AbortSignal.timeout(5000)});}catch{return json(503,{error:'No se pudo consultar el catálogo institucional.'});}
        if(!response.ok)return json(503,{error:'El catálogo institucional rechazó la consulta o no está disponible.'});
        return json(200,{importadas:importarAulas(db,await response.json())});
      }
      const id=url.pathname==='/api/eventos'?crearEvento(db,input):url.pathname==='/api/asignaciones'?asignar(db,input):url.pathname==='/api/asignaciones-lote'?asignarLote(db,input):crearActa(db,input.eventoId,input.convocatoria);
      return json(201,{id: id===undefined?null:Number(id)});
    }
    json(404,{error:'Ruta no encontrada.'});
  } catch(error) {json(400,{error:error instanceof Error ? error.message : 'No se pudo completar la operación.'});}
}).listen(4351,'127.0.0.1',()=>console.log('API de prueba: http://127.0.0.1:4351'));
