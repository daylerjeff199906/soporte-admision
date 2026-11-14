"""Conserva las hojas originales y prepara grupos de consulta sin deducir horas ni docentes."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import openpyxl

ROOT = Path(__file__).resolve().parents[1]
DOWNLOADS = Path(os.environ.get('EXCEL_DIR') or Path.home() / 'Downloads')
FILES = [('entrevistas', 'Entrevistas_Admision_2026-II.xlsx'), ('examen', 'Examen_aulas_Admision_2026-II.xlsx')]

def value(v):
    return v.isoformat() if isinstance(v, (datetime.datetime, datetime.date, datetime.time)) else v

def read(path, kind):
    workbook = openpyxl.load_workbook(path, read_only=True, data_only=False)
    hojas = [{'nombre': sheet.title, 'filas': [[value(cell) for cell in row] for row in sheet.iter_rows(values_only=True)]} for sheet in workbook]
    resumen = hojas[0]['filas']
    summary = {}
    for row in resumen[5:]:
        if kind == 'entrevistas' and len(row) >= 7 and row[6] in workbook.sheetnames:
            summary[row[6]] = {'fecha': row[0], 'programa': row[1], 'grupo': row[2], 'aula_espera': row[3], 'aula': row[4]}
        elif kind == 'examen' and len(row) >= 5 and row[4] in workbook.sheetnames:
            summary[row[4]] = {'programa': row[0], 'sede': row[1], 'aula': row[2]}
    groups = []
    for sheet in hojas[1:]:
        if sheet['nombre'] not in summary:
            raise ValueError(f"La hoja {sheet['nombre']} no figura en el resumen")
        rows = []
        for row in sheet['filas'][4:]:
            if len(row) >= 3 and isinstance(row[0], (int, float)) and row[1] is not None and row[2]:
                doc = str(row[1]).strip()
                if not doc.isdigit() or len(doc) != 8:
                    raise ValueError(f'Documento no válido en {sheet["nombre"]}, fila {row[0]}')
                rows.append({'documento': doc, 'nombre': str(row[2]).strip()})
        groups.append({'tipo': kind, 'hoja': sheet['nombre'], **summary[sheet['nombre']], 'instrucciones': sheet['filas'][1][0], 'postulantes': rows})
    docs=[p['documento'] for g in groups for p in g['postulantes']]
    if len(docs) != len(set(docs)):
        raise ValueError('Hay documentos duplicados dentro del mismo archivo')
    return {'archivo':path.name, 'sha256':hashlib.sha256(path.read_bytes()).hexdigest(), 'hojas':hojas}, groups

def main():
    directory = Path(os.environ.get('DATA_DIR') or ROOT / 'data') / 'fuentes-excel'
    directory.mkdir(parents=True, exist_ok=True)
    fuentes, grupos = [], []
    for kind, name in FILES:
        source, entries = read(DOWNLOADS / name, kind)
        fuentes.append(source)
        grupos.extend(entries)
    (directory / 'originales.json').write_text(json.dumps({'fuentes':fuentes}, ensure_ascii=False, indent=2),encoding='utf-8')
    (directory / 'grupos.json').write_text(json.dumps({'corte':'2026-11-13T16:56:00-05:00','grupos':grupos}, ensure_ascii=False, indent=2),encoding='utf-8')
    for kind, _ in FILES:
        current=[g for g in grupos if g['tipo']==kind]
        print(f'{kind}: {len(current)} grupos; {sum(len(g["postulantes"]) for g in current)} registros')

if __name__ == '__main__':
    main()
