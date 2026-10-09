# Pruebas Guarida / Palomita 1.1.0

Fecha: 8 octubre 2026. Desarrollo macOS ARM64; Node 26.11.0, JDK 17, Android SDK 36, Media3 1.11.1. Servidor Windows requiere Node 24+. Fixtures generados localmente con FFmpeg; ninguna película de terceros incluida.

## Resultados

| Comando | Resultado | Cobertura |
| --- | --- | --- |
| `npm run check` | Compilación TypeScript/Vite correcta; 11 pruebas servidor pasan | Subidas, MP4/MKV/AVI, rangos HTTP, persistencia, acceso, entradas falsas, documentos/carpetas, carátulas adjuntas y subtítulos. |
| `npm run test:ui` | 6 pruebas Chromium pasan | Inicio, archivos compartidos, carpetas/mover/renombrar/descargar/eliminar, navegación directa, móvil sin desbordamiento, cine, favoritos, progreso, modo TV web y SRT/VTT seleccionables. |
| `./gradlew :app:testDebugUnitTest` | 28 pruebas pasan | 5 de política de avance, 2 de direcciones, 7 de vistas/eventos repetidas en SDK 23/28/35 (Android 6/9/15). |
| `./gradlew :app:lintDebug` | Pasa, cero errores | Compatibilidad minSdk y opt-in Media3 corregidos. Warnings no bloqueantes sobre recursos/convenciones y APIs visuales antiguas. |
| `./gradlew :app:assembleDebug` | APK generado | Nombre Palomita, paquete anterior, versionCode 2. |
| `apksigner verify --print-certs` | Ambas APK válidas, mismo certificado SHA-256 | Actualización sobre instalación anterior conserva preferencias. |

Total: **45 pruebas automatizadas**. No cuenta compilación o lint como pruebas independientes.

## Casos destacados

- Película de 3 horas, posición 1 hora: flecha/barra avanza exactamente 10 segundos, no 9 minutos.
- Una pulsación seguida de 100 eventos repetidos y liberación: una llamada de búsqueda. Treinta pulsaciones independientes: 300 segundos. Extremos/overflow limitados.
- Barra enfocada despacha flecha una vez; pausa ignora repeticiones. Atrás primero oculta controles sin cerrar película. Intent con ID inválido cierra reproductor.
- JSON de subtítulos con URL externa no se usa: URL se deriva de base privada y UUID validado. ID de ruta malicioso se descarta.
- MKV con carátula JPG adjunta roja, SRT español y dos audios: miniatura proviene de imagen incrustada (verificación RGB), VTT tiene texto esperado y MP4 preparado conserva ambos audios.
- MP4 con `attached_pic`: dimensiones/duración corresponden a video real, carátula procede de adjunto.
- Preparación antigua reducida a primer audio: refrescar metadata recupera segundo audio copiando video.
- SRT externo inválido se rechaza; pista válida conserva UTF-8, sobrevive refresco y puede eliminarse sin borrar película. Chromium comprueba cue cargado y modo showing.
- Archivos falsos/ejecutables/extensiones incompatibles/rutas se rechazan, temporales se limpian; búsqueda trata `%` como texto literal. Carpetas no vacías no se borran; descarga es adjunto.
- Nuevo acceso compartido protege Inicio, Cine, Archivos y subtítulos mediante guardia común. Pruebas previas de Host/Origin/CSRF siguen pasando.

## Lo que falta comprobar en hardware

Robolectric ejecuta vistas y eventos Android en JVM. ExoPlayer se simula para medir llamadas de avance; estas pruebas no decodifican video sobre procesador de TV. Chromium sí reproduce video real; FFmpeg verifica archivos preparados.

Pruebas Android se ejecutaron con JUnit/Robolectric, sin emulador ni conexión a TV física o Windows del usuario. Falta confirmar en ese TV: mandos específicos, reproducción prolongada/4K, firmware/códecs, idiomas y rendimiento Wi-Fi.

No se modificaron controles de seguridad de Mac corporativa. Pruebas servidor/web usan loopback y carpetas temporales; servicio doméstico permanece en Windows.
