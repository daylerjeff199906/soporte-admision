# Evaluaciones y entrevistas de admisión

Aplicación local para consultar la programación del proceso 2026-II, generar fichas de prueba y trasladar grupos de postulantes. La fuente actual son los archivos Excel de examen y entrevistas del corte del 13/11/2026 a las 16:56. **No es una consulta en vivo a SIGAE.**

## Acceso local con Docker (recomendado)

Solo requiere Docker. Todo el código es TypeScript (API ejecutada directamente por Node 24, web con Astro).

1. Copia `.env.example` a `.env` y define `ADMIN_USER` y `ADMIN_PASSWORD` (acceso al panel interno). Copia `Entrevistas_Admision_2026-II.xlsx` y `Examen_aulas_Admision_2026-II.xlsx` en `data/entrada/`. Ambos (`.env` y `data/`) están excluidos de Git.
2. Genera los datos de consulta (una vez, o cuando cambien los Excel):

```powershell
docker compose run --rm importar
```

3. Levanta la API y la web:

```powershell
docker compose up -d --build
```

4. Abre http://127.0.0.1:4350/consulta/ (consulta por DNI) o http://127.0.0.1:4350 (panel interno; inicia sesión con `ADMIN_USER` y `ADMIN_PASSWORD` de tu `.env`; si no defines contraseña, se genera una en `data/acceso-local.txt`). Para detener: `docker compose down`.

Solo el servicio web se publica, y únicamente en `127.0.0.1:4350`; la API es interna y nginx le reenvía `/api`. Las rutas son locales y no son accesibles por internet. Las actas se abren en el navegador y se imprimen o guardan como PDF.

## Desarrollo sin Docker

Requiere Node.js 22.18+ (24 recomendado) y pnpm 11. En dos terminales:

```powershell
corepack pnpm install
corepack pnpm dev:api
corepack pnpm dev:web
```

`corepack pnpm typecheck` ejecuta `tsc` (API) y `astro check` (web). El servidor de desarrollo de la web reenvía `/api` a la API local.

## Fuentes y protección

`data/fuentes-excel/originales.json` conserva las hojas de ambos Excel, las filas, fórmulas y metadatos de origen; incluye información personal y de contacto. `grupos.json` es la proyección para consulta, sin correo ni celular. Ambos archivos y la base SQLite están excluidos de Git en `data/`; no copiarlos a una carpeta pública ni compartirlos sin autorización. Los Excel originales no se modifican.

Para regenerar los archivos locales desde las copias de Descargas, ejecutar `docker compose run --rm importar` (o `python tools/importar_excel.py` con `openpyxl`, indicando `EXCEL_DIR`). Los traslados se guardan por separado en SQLite. Si cambia la fuente, la aplicación bloquea su lectura mientras existan traslados hasta que se revisen; no se aplican ciegamente a otra versión.

Las asignaciones masivas solo trasladan personas entre grupos de la misma actividad y programa en esta copia. No modifican SIGAE ni los Excel. El usuario debe verificar horarios y aforo; los archivos de origen no proporcionan duración, capacidad institucional ni docente para todos los grupos.

## Datos del postulante desde SIGAE

La consulta por DNI complementa el Excel con SIGAE (`SIGAE_API_URL`, por defecto https://api.postgradounap.edu.pe/; `SIGAE_CONVOCATORIA`, por defecto la admisión 2026-II): nombre y foto desde `person/person/?document_number=`, y si tiene una ficha activa en la convocatoria desde `admission/applicantfile/?person_uuid=…&promotion_convocatory__convocatory__uuid=…`. El servicio `academic/` es de estudiantes matriculados y no se usa. Si SIGAE no responde, la consulta sigue funcionando con los datos del Excel (sin foto). El aula y la fecha siguen saliendo del Excel.

## Aulas institucionales

La Intranet administra los ambientes vinculados a SIGAE. La sincronización opcional usa `GET /interno/v1/ambientes`; se requieren `INTRANET_URL` e `INTRANET_SERVICE_KEY` para el consumidor `admision` en el entorno de la API. No se ha comprobado la conexión real. El catálogo excluye aulas exclusivas de examen no incorporadas a Intranet. No se verifican reservas de Intranet o SIGAE y no debe inferirse disponibilidad institucional.

## Límites antes de publicar

La API escucha solo en `127.0.0.1`, y no arranca con `NODE_ENV=production`. El panel usa un único usuario y contraseña (sesión firmada de 8 horas), pero **no sustituye usuarios individuales, permisos institucionales ni auditoría de seguridad**. El DNI se puede adivinar; antes de publicar la consulta con datos reales se requiere verificar la identidad y acordar controles contra consultas masivas y exposición de datos. La fecha del corte no se actualiza sola.

Verificación: `corepack pnpm test` y `corepack pnpm build`. Las pruebas usan bases en memoria y datos sintéticos; los JSON reales se generan localmente con los Excel.
