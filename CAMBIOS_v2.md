# Bruno — cambios v2

Implementado el 20 de octubre de 2026. Código de Luis leído desde AppPesas2 (v1.3) y sus documentos de fases 2, 4 y 5; no se modificó ese proyecto. Cambios locales, sin commit ni push. No se tocaron archivos ajenos que ya estaban sin seguimiento.

## Mejoras portadas

- `barWeight` permanece como dato informativo en los ejercicios originales. Ningún cálculo lo suma: el registro de carga ya incluye la barra.
- Parámetro `usesBodyweight` editable por ejercicio; masa del sistema = carga convertida a kg + peso corporal cuando corresponde. Las cargas negativas restan asistencia. El 5RM corporal se etiqueta «5RM total (cuerpo + lastre)»; no se convierte automáticamente un 5RM histórico en otra referencia.
- `buildSummary()` conserva un resumen global y por ejercicio con `calculationVersion: "2.0"`, series, reps, volumen, intensidad ponderada por reps, cobertura, trabajo, potencia, referencias históricas, duración, RPE opcional 1–10 y notas. Intensidad desconocida = `null` / «Sin dato». Se conserva la intensidad legada de picos para las pantallas existentes; la intensidad media de Hist es una métrica nueva, con otra ponderación.
- Ciclos Lineal Pavel, Escalonado Pavel y Libre; edición del plan por semana y entrenamiento, estado activo/pausado, tarjeta de sesión, «Plan: …», carga del plan por ejercicio y comparación semanal planeado/real. Cada sesión vinculada conserva una copia del plan y referencias para que editar un ciclo no cambie el pasado.
- Hist muestra nueve gráficas apiladas en total: peso corporal, volumen, intensidad media, series, reps, trabajo, potencia, duración y RPE. Comparten fechas reales, bandas de ciclos, ventana de 70 días, scroll horizontal sincronizado, eje Y fijo y cursor compartido al tocar. La lista de sesiones permanece debajo; borradores vacíos no cuentan como entrenamientos.
- Siete fuentes Barlow locales y licencia OFL en `fonts/`, sin Google Fonts. Fecha con `showPicker()` y fallback protegido por `try/catch`; tarjetas de métricas adaptadas a anchos pequeños y valores largos.

## Particularidades conservadas

Se conserva exactamente el objeto original `EXERCISES`, incluidos orden, nombres, ROM, 5RM, unidades, `usesBodyweight` y `barWeight`: Sentadilla, Peso Muerto, Pantorrilla, Pull Ups, Remo con Barra, Shrugs, Fondos, Press Hombro Mancuerna, Press Inclinado Mancuerna y Press Horizontal Barra. Son diez ejercicios, no los nueve de Luis. Se conservan peso inicial 79.2 kg, duración inicial 60 minutos, altas de series 1×5 con carga cero, conversión de unidades, temporizador, copia de sesión anterior, nombre Bruno, color `--volt: #A78BFA`, icono B y crédito de Luis Cárdenas / Storm Studios.

`ASSISTED` está vacío en la versión original de Bruno: no se inventaron ejercicios asistidos. Se mantiene el mecanismo de entrada negativa y se comprueba que una carga negativa corporal resta del peso de esa sesión. La normalización conserva propiedades adicionales en sesiones, ejercicios, series, configuraciones y resúmenes.

## Almacenamiento y protección

- Sesiones: **`workoutSessions`**, exactamente la clave original, todavía un arreglo.
- Descanso: **`workoutRestBruno`**, exactamente la clave original.
- Ciclos nuevos: **`workoutSessionsCycles`** (`STORAGE_KEY + 'Cycles'`). No se usan claves de Luis.
- Primera copia previa: **`workoutSessions_respaldo_v2`**. Incluye sesiones/ciclos completos y los textos originales exactos `rawSessions` y `rawCycles`. Se crea antes de migrar o de la primera escritura y no se reemplaza después.
- Copia previa a la primera importación: **`workoutSessions_respaldo_importacion_v2`**.

JSON corrupto, una colección que no sea un arreglo o sesiones mal estructuradas provocan bloqueo de carga con «Datos protegidos»; nunca se interpretan como historial vacío. Si no se puede crear el respaldo, se aborta la migración sin escribir sesiones. Las fechas, series y referencias históricas originales se conservan al añadir IDs y resúmenes derivados. Consultar una sesión antigua no la vincula retroactivamente a un ciclo.

Exportación por descarga Blob de `{schemaVersion: 2, sessions, cycles}`, incluyendo cambios en memoria. Importación compatible con arreglos antiguos y envoltorios v1/v2: valida y combina, conserva fechas y ciclos existentes ante conflictos y no reemplaza el historial con un archivo incompleto. Escrituras de las dos colecciones con restauración ante errores detectables; localStorage no ofrece transacciones atómicas ante un cierre abrupto entre claves. Estos respaldos viven en el mismo almacenamiento del navegador: no sustituyen una exportación externa.

## PWA para iPhone

Se conservan meta tags Apple, manifest, iconos, scope y registro del service worker. **`id` sigue siendo `./?app=bruno-v6`** para conservar la identidad instalada. `start_url` pasa a `./index.html?app=bruno-v7`; enlace del manifest `?v=7`, registro `./sw.js?v=7` y caché `bruno-workout-v7`. ASSETS incluye todas las fuentes locales y licencia. La activación elimina únicamente cachés antiguas `bruno-workout-*`, protegiendo las otras apps del mismo origen. No contiene `AndroidBridge` ni `androidBack`.

## Prueba de migración y regresión

Comando desde la raíz: `node tests/migracion.cjs` — **PASS**.

El test obtiene el HTML viejo mediante `git show HEAD:index.html`, lo inicializa en Node/vm con localStorage/DOM simulados y usa sus funciones reales `load`, `updateSetting`, `go`, `changeUnit`, `updateConfig`, `addSet`, `updateSet`, `repeatSet`, `save` y `setRest`. Genera tres fechas separadas, todos los ejercicios, kg y lbs, peso corporal/duración variables y 5RM/ROM editados. Después ejecuta el HTML nuevo sobre ese almacenamiento y compara cada dato original, definición de ejercicios, descanso y respaldo exacto.

Comprueba descarga Blob y el manejador de importación de archivo, igualdad de sesiones/ciclos tras ida y vuelta, todas las pantallas y los diez ejercicios, referencia corporal total y asistencia negativa. Prueba rechazo de corrupción y fallo por cuota sin sobrescribir. Incluye regresión adaptada de Luis: planes lineales/escalonados, edición de ciclos, referencias fijas y snapshots, progreso sin duplicados, importación antigua/nueva/conflictos, campos extra, cuotas, null/cobertura, fuentes TTF y nueve gráficas con fechas irregulares, bandas, huecos, cursor, gestos y scroll sincronizado sobre 150 sesiones en un año; límites de 20/70/71 días. Comprueba identidad/iconos del manifest, versión del registro y fuentes en ASSETS.

## Cambio numérico por eliminar la barra

Son **datos sintéticos generados por el test**, no el historial real del iPhone. Para cada ejercicio el test demuestra: volumen, reps, series y e1RM iguales; diferencia de fuerza = `barWeight × 9.8 × repsTotales`; diferencia de trabajo = esa fuerza × ROM; diferencia del pico de carga = barra; diferencia de intensidad de pico = `100 × barra / e1RM`. La potencia cambia por la diferencia de trabajo dividida por los segundos de sesión. En ejercicios corporales la barra es cero y las métricas conservan cuerpo + lastre.

| Fecha de prueba | Volumen conservado (kg·reps) | Fuerza eliminada (N) | Trabajo eliminado (J) | Potencia eliminada (W) | Intensidad legada eliminada (pp) |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2026-01-03 | 8181.742960 | 26460 | 9319.8 | 3.451778 | 13.338754 |
| 2026-05-17 | 12169.670520 | 39690 | 14376.6 | 4.607885 | 13.066800 |
| 2026-10-19 | 17277.952608 | 52920 | 19698.0 | 5.564407 | 13.110278 |

El volumen viejo ya excluía la barra; por eso no baja. La intensidad media ponderada nueva debe compararse con su propia definición, no con el promedio viejo de picos. Las referencias ausentes ahora se muestran como null en lugar de cero, de forma explícita.

## Alcance de verificación

Pruebas automatizadas con DOM/dimensiones/eventos simulados, sin instalar ni publicar. Pendiente verificar en Safari/iPhone real el calendario, diseño, gestos, descarga/selector de archivos, actualización del service worker, apertura offline y conservación efectiva del almacenamiento del alumno tras actualizar. No se accedió al historial real del teléfono; no se puede cuantificar su cambio total hasta disponer de una exportación. No se hizo commit ni push.
