# Carátulas, fondos y fichas de cine

Guarida integra TMDb para películas y series. Búsqueda utiliza título y año; no reconoce imágenes del video ni sube archivo. Al terminar preparación y al iniciar servidor, busca también películas existentes sin ficha. Limpia extensión, resolución e información técnica del nombre. Una coincidencia exacta y única se aplica automáticamente; resultados ambiguos requieren escoger ficha.

## Web y Windows

Windows descarga carátula y fondo, guarda título, sinopsis, año y géneros. Carátula aparece en biblioteca web y APK; fondo horizontal aparece en banner web y pausa de TV. Imágenes quedan en disco y siguen disponibles sin internet. En reproductor, **Encuentra su carátula / Cambiar ficha** permite buscar y corregir selección. Original y carátula incrustada/fotograma permanecen intactos. **Usar imagen del video** retira imágenes TMDb y desactiva selección automática para ese video. Selecciones manuales se conservan.

Búsqueda automática se limita a Películas/Series. No consulta Recuerdos ni videos familiares. Sin coincidencia, reintenta después de un día o al cambiar título; errores de red reintentan después de cinco minutos. Catálogo se actualiza con nueva versión de imagen, también en APK instalada. Crédito de proveedor queda en **Acerca de**, fuera de reproductor y portada.

Credencial se configura en `.env`, usando **una** de estas variables:

```dotenv
TMDB_READ_ACCESS_TOKEN=tu_token_de_lectura
# Alternativa: TMDB_API_KEY=tu_clave_v3
```

También se admite `personal-settings.json` local con propiedad `tmdbApiKey`. Distribución personal incluye esa configuración; archivo queda fuera de Git. `.env` tiene prioridad. Reinicia servidor después de cambiar credencial. Nunca se entrega clave al navegador; búsquedas e imágenes pasan por API local con origen externo fijo, límites y tiempos máximos. TMDb recibe título consultado; video permanece en casa.

## APK Palomita 1.2.0

- Después de **30 segundos en pausa** sin pulsar control, muestra fondo de película con título y mensaje para continuar.
- OK/Enter/Play reanuda; cualquier otra tecla regresa a controles. Reproducción activa quita fondo inmediatamente. Al terminar película también se muestra fondo; OK comienza desde inicio.
- Durante buffering con reproducción solicitada o error no se sustituye video por fondo.
- Prioriza fondo guardado en Windows y carátula real local. Si tiene únicamente fotograma y categoría Películas/Series, APK puede buscar TMDb directamente como respaldo.
- Respaldo automático acepta coincidencia única con título normalizado. Si hay varios resultados equivalentes no elige al azar: conserva imagen local. Recuerdos/videos familiares no se consultan automáticamente.
- Clave de lectura personal se integra dentro de APK al compilar, según pedido. Se toma de `android-tv/local-secrets.properties` (`TMDB_API_KEY=...`) o variable de entorno `TMDB_API_KEY`. Archivo local no se versiona; APK ya compilada no requiere configurar clave en TV. Como cualquier valor dentro de APK, puede extraerse del binario.
- Imágenes externas tienen límites de tamaño y resolución antes de decodificar. Fallo de API no interrumpe reproducción.
- Menú **Créditos** incluye logo oficial y atribución TMDb.

Paquete y certificado de firma conservados. APK 1.2.0 (versionCode 3) actualiza versiones anteriores sin borrar IP, favoritos ni posiciones. Compilación debug para instalación personal mediante USB.

## Fuentes

[Búsqueda TMDb](https://developer.themoviedb.org/docs/search-and-query-for-details), [imágenes](https://developer.themoviedb.org/docs/image-basics), [autenticación](https://developer.themoviedb.org/docs/authentication-application), [atribución](https://developer.themoviedb.org/docs/faq), [logos oficiales](https://www.themoviedb.org/about/logos-attribution).
