import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderActa} from './acta.ts';
test('pagina las fichas y escapa los datos al generar el acta',()=>{
  const evento={tipo:'Evaluación',fecha:'2026-11-15T09:00',aula:'Aula <1>',capacidad:27};
  const asignaciones=Array.from({length:27},(_,i:number)=>({postulante:`Ejemplo ${i+1}`,dni:'00000001',evaluador:'Docente'}));
  const html=renderActa({id:1,contenido:JSON.stringify({evento,asignaciones})});
  assert.equal((html.match(/class="sheet"/g)||[]).length,2);
  assert.match(html,/Aula &lt;1&gt;/);assert.match(html,/Ejemplo 27/);assert.match(html,/Firma del presidente/);assert.doesNotMatch(html,/BORRADOR|SIN VALIDEZ/);
});
