# GeoBitácora — Tablas PostgreSQL

## Sobre el proyecto
 
GeoBitácora es un formulario web (`index.html` + `app.js`) para que geólogos registren observaciones de campo (estación, ubicación GPS, muestra, hallazgo, hasta 5 fotos) directamente desde el sitio. Al enviarse, el formulario dispara un flujo de n8n que valida los datos, los clasifica y calcula su prioridad automáticamente, los guarda en PostgreSQL, sube la evidencia fotográfica a Google Drive, la indexa en una hoja de Google Sheets y notifica por Gmail al geólogo (y, si la prioridad es alta o crítica, también envía una alerta aparte). Este README documenta la parte de PostgreSQL de ese flujo.

## `historial_registros`

| Columna | Tipo | No nulo | Por defecto |
|---|---|---|---|
| `id` | `bigserial` | Sí | `nextval('historial_registros_id_seq'::regclass)` |
| `registro_id` | `varchar(50)` | No | — |
| `fecha` | `timestamptz` | Sí | `now()` |
| `evento` | `varchar(100)` | Sí | — |
| `detalle` | `text` | No | — |
| `responsable` | `varchar(160)` | No | — |

CREATE TABLE historial_registros (
    id            bigserial     NOT NULL DEFAULT nextval('historial_registros_id_seq'::regclass),
    registro_id   varchar(50),
    fecha         timestamptz   NOT NULL DEFAULT now(),
    evento        varchar(100)  NOT NULL,
    detalle       text,
    responsable   varchar(160)
);

## `registros_geologicos`

| Columna | Tipo | No nulo | Por defecto |
|---|---|---|---|
| `id` | `varchar(50)` | Sí | — |
| `creado_en` | `timestamptz` | Sí | `now()` |
| `fecha_campo` | `date` | Sí | — |
| `proyecto` | `varchar(160)` | Sí | — |
| `estacion` | `varchar(80)` | Sí | — |
| `geologo_nombre` | `varchar(160)` | Sí | — |
| `geologo_email` | `varchar(254)` | Sí | — |
| `tipo_estudio` | `varchar(30)` | Sí | — |
| `clasificacion` | `varchar(100)` | Sí | — |
| `prioridad` | `varchar(10)` | Sí | — |
| `estado` | `varchar(40)` | Sí | `'registrado'::character varying` |
| `latitud` | `numeric(10,7)` | No | — |
| `longitud` | `numeric(10,7)` | No | — |
| `elevacion_m` | `numeric(10,2)` | No | — |
| `codigo_muestra` | `varchar(80)` | No | — |
| `material` | `varchar(120)` | No | — |
| `resultado_preliminar` | `text` | No | — |
| `descripcion` | `text` | Sí | — |
| `riesgo_observado` | `text` | No | — |
| `recomendacion` | `text` | No | — |
| `evidencia_cantidad` | `int2` | Sí | `0` |
| `evidencia_url` | `text` | No | — |

CREATE TABLE registros_geologicos (
    id                    varchar(50)   NOT NULL,
    creado_en             timestamptz   NOT NULL DEFAULT now(),
    fecha_campo           date          NOT NULL,
    proyecto              varchar(160)  NOT NULL,
    estacion              varchar(80)   NOT NULL,
    geologo_nombre        varchar(160)  NOT NULL,
    geologo_email         varchar(254)  NOT NULL,
    tipo_estudio          varchar(30)   NOT NULL,
    clasificacion         varchar(100)  NOT NULL,
    prioridad             varchar(10)   NOT NULL,
    estado                varchar(40)   NOT NULL DEFAULT 'registrado'::character varying,
    latitud               numeric(10,7),
    longitud              numeric(10,7),
    elevacion_m           numeric(10,2),
    codigo_muestra        varchar(80),
    material              varchar(120),
    resultado_preliminar  text,
    descripcion           text          NOT NULL,
    riesgo_observado      text,
    recomendacion         text,
    evidencia_cantidad    int2          NOT NULL DEFAULT 0,
    evidencia_url         text
);

## Flujo de trabajo (n8n)
 
Esto sí sale directamente del archivo `GeoBitácora — Registro y clasificación de campo.json` que subiste, node por node:
 
1. **Webhook - recibir registro** — `POST /webhook-test/libreta-geologica`, recibe el `FormData` que envía `app.js` (campos + hasta 5 fotos).
2. **Validar y normalizar** (nodo Code) — revisa que estén `proyecto`, `estacion`, `fecha_campo`, `geologo_nombre`, `geologo_email`, `tipo_estudio`, `descripcion`; si falta alguno, lanza error. Genera el `id` con la fórmula `GEO-<AAAAMMDD>-<hasta 10 caracteres de la estación en mayúsculas>`. También convierte `latitud`, `longitud`, `elevacion_m` a número y cuenta los binarios recibidos en `evidencia_cantidad`.
3. **Clasificar y calcular prioridad** (nodo Code) — arma `clasificacion` según `tipo_estudio` (`suelo`, `roca`, `agua`, `otro`) cruzado con palabras clave encontradas en `descripcion` + `riesgo_observado` + `resultado_preliminar` + `material` (ej. "sulf", "mineral", "falla/fractura", "contamin", "ph/conductiv"). Calcula `prioridad`: parte de `prioridad_declarada` del formulario, pero sube a `alta` si detecta términos como *contamin*, *inestabilidad*, *sulfuro*, *mineralización*, *filtración*, y sube a `critica` si detecta *riesgo ambiental*, *riesgo para personas*, *derrame* o *contaminación severa*.
4. **PostgreSQL - ficha técnica completa** — `INSERT` de todo el registro clasificado en `registros_geologicos`.
5. **PostgreSQL - historial** — `INSERT` en `historial_registros` con `evento = 'registro_creado'`, usando el `registro_id` y `geologo_nombre` del paso anterior.
6. **Google Sheets - índice operativo** — hace `append` en la hoja "Índice operativo geológico" (Google Sheets) con `ID`, `Proyecto` y demás campos, para tener un tablero rápido fuera de la base de datos.
7. **¿Tiene fotografías?** (nodo IF) — evalúa `evidencia_cantidad > 0`.
   - Si **sí**: **Google Drive - subir evidencia** sube los archivos a una carpeta de Drive (nombrando el archivo `<registro_id>-evidencia`; la carpeta destino todavía tiene el placeholder `CONFIGURAR_CARPETA`, falta configurarla) y luego **PostgreSQL - enlace de evidencia** hace un `UPDATE registros_geologicos SET evidencia_url = ...` con el link resultante.
8. **¿Prioridad alta o crítica?** (nodo IF) — evalúa si `prioridad` es `alta` **o** `critica`.
   - Si **sí**: **Gmail - alerta prioritaria** envía un correo de alerta (además de la confirmación normal).
9. **Gmail - confirmación** — envía correo de confirmación al geólogo que hizo el registro (usa `geologo_email`).
10. **Construir respuesta** (nodo Code) — arma el JSON `{ ok, registro_id, clasificacion, prioridad, mensaje }`.
11. **Responder al formulario** — devuelve ese JSON al navegador; es lo que `app.js` muestra como `"Registro creado correctamente. ID: ..."`.
### Cómo se relaciona esto con las tablas
 
- Los pasos 4 y 5 son los únicos que escriben en Postgres al momento de crear el registro: uno llena `registros_geologicos`, el otro agrega la primera fila de `historial_registros`.
- El paso 7 es el único que vuelve a tocar `registros_geologicos` después del insert inicial (solo la columna `evidencia_url`), lo que explica por qué esa columna puede llegar en `NULL` si el registro no traía fotos, y por qué queda vacía hasta que Drive responde.
- `historial_registros` hoy solo recibe el evento `registro_creado`; el diseño de la tabla (columna `evento` como texto libre) sugiere que está pensada para más tipos de eventos a futuro (cambios de estado, alertas, revisiones), aunque el workflow actual no los genera todavía.
- Las columnas `clasificacion` y `prioridad` de `registros_geologicos` nunca las escribe el usuario directamente: siempre vienen calculadas por el nodo 3, así que cualquier cambio en esas reglas de negocio hay que hacerlo en n8n, no en el formulario ni en la base de datos.
 
