# Evaluaciones y entrevistas de admisión

Aplicación local para consultar la programación del proceso 2026-II, generar fichas de prueba y trasladar grupos de postulantes. La fuente actual son los archivos Excel de examen y entrevistas del corte del 13/11/2026 a las 13:12. **No es una consulta en vivo a SIGAE.**

## Acceso local

Requiere Node.js 24 y pnpm 11. Desde esta carpeta:

```powershell
corepack pnpm install
corepack pnpm dev:api
```

En otra terminal:

```powershell
corepack pnpm dev:web
```

Abrir http://127.0.0.1:4350 e ingresar la clave que la API genera en `data/acceso-local.txt`. La consulta de programación por DNI está en http://127.0.0.1:4350/consulta/. Ambas rutas son locales y no son accesibles por internet. Las fichas se abren en el navegador y se imprimen o guardan como PDF; no constituyen actas oficiales.

## Fuentes y protección

`data/fuentes-excel/originales.json` conserva las hojas de ambos Excel, las filas, fórmulas y metadatos de origen; incluye información personal y de contacto. `grupos.json` es la proyección para consulta, sin correo ni celular. Ambos archivos y la base SQLite están excluidos de Git en `data/`; no copiarlos a una carpeta pública ni compartirlos sin autorización. Los Excel originales no se modifican.

Para regenerar los archivos locales desde las copias de Descargas, ejecutar `python tools/importar_excel.py` con `openpyxl` instalado. Los traslados se guardan por separado en SQLite. Si cambia la fuente, la aplicación bloquea su lectura mientras existan traslados hasta que se revisen; no se aplican ciegamente a otra versión.

Las asignaciones masivas solo trasladan personas entre grupos de la misma actividad y programa en esta copia. No modifican SIGAE ni los Excel. El usuario debe verificar horarios y aforo; los archivos de origen no proporcionan duración, capacidad institucional ni docente para todos los grupos.

## Aulas institucionales

La Intranet administra los ambientes vinculados a SIGAE. La sincronización opcional usa `GET /interno/v1/ambientes`; se requieren `INTRANET_URL` e `INTRANET_SERVICE_KEY` para el consumidor `admision` en el entorno de la API. No se ha comprobado la conexión real. El catálogo excluye aulas exclusivas de examen no incorporadas a Intranet. No se verifican reservas de Intranet o SIGAE y no debe inferirse disponibilidad institucional.

## Límites antes de publicar

La API escucha solo en `127.0.0.1`, y no arranca con `NODE_ENV=production`. La clave protege el listado local, pero **no sustituye usuarios individuales, permisos institucionales ni auditoría de seguridad**. El DNI se puede adivinar; antes de publicar la consulta con datos reales se requiere verificar la identidad y acordar controles contra consultas masivas y exposición de datos. La fecha del corte no se actualiza sola.

Verificación: `corepack pnpm test` y `corepack pnpm build`. Las pruebas usan bases en memoria y datos sintéticos; los JSON reales se generan localmente con los Excel.
