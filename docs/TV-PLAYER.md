# Palomita: decisiones del reproductor

Investigación y cambios: 8 octubre 2026. App personal Android TV / Google TV, Android 6+; biblioteca permanece en PC Windows.

## Motores considerados

| Motor | Encaje | Decisión |
| --- | --- | --- |
| AndroidX Media3 / ExoPlayer | Integración Android, PlayerView, decodificación mediante códecs del dispositivo, selección de audio/texto y subtítulos externos. | Mantener 1.11.1; servidor prepara MP4 H.264/AAC y entrega subtítulos VTT. |
| libVLC | Motor de VLC reutilizable, amplia compatibilidad de formatos y bindings Java/Kotlin. Requeriría nueva integración nativa, controles y pruebas de distribuciones/arquitecturas. | Alternativa si formatos reales requieren códecs o subtítulos avanzados fuera de pipeline actual. |

Documentación primaria: [Media3](https://developer.android.com/jetpack/androidx/releases/media3), [formatos admitidos](https://developer.android.com/media/media3/exoplayer/supported-formats), [libVLC](https://www.videolan.org/vlc/libvlc.html). Decisión de mantener Media3 es evaluación de necesidades y mantenimiento de este proyecto, no benchmark comparativo entre motores.

## Problema de avance excesivo

`Player.Builder` tenía avance de 10 s, pero **DefaultTimeBar** usa incrementos por fracción de duración cuando no se fija tiempo. Código oficial tiene 20 divisiones por defecto: película de 3 horas puede avanzar 9 minutos por pulsación en barra. Inferencia de causa a partir de código, coincide con síntoma reportado; no se capturó evento de control físico de TV.

Cambios:

- `DefaultTimeBar.setKeyTimeIncrement(10_000)` y ExoPlayer con mismo incremento.
- Eventos de avance manejados una vez; Activity no despacha evento duplicado a PlayerView.
- `ACTION_DOWN` con `repeatCount == 0`: una pulsación → 10 s. Repeticiones de tecla mantenida y ACTION_UP no vuelven a buscar.
- Posición limitada a inicio/fin; `SeekParameters.EXACT` busca instante solicitado.
- Flechas sobre otros botones conservan navegación; con barra enfocada o controles ocultos hacen búsqueda.
- Feedback ±10 segundos; posición se conserva al salir. Fin real limpia progreso; avanzar dentro de últimos minutos ya no borra historial al superar 95%.

Fuentes: [DefaultTimeBar](https://developer.android.com/reference/androidx/media3/ui/DefaultTimeBar), [código oficial](https://github.com/androidx/media/blob/release/libraries/ui/src/main/java/androidx/media3/ui/DefaultTimeBar.java), [SeekParameters](https://developer.android.com/reference/androidx/media3/exoplayer/SeekParameters).

## Subtítulos, audio y carátulas

- FFprobe distingue video principal de `attached_pic`. Primero toma imagen adjunta MP4 o JPG/PNG adjunto MKV; si falla, fotograma de video principal. No usa API externa ni descarga carátulas de internet.
- Subtítulos incrustados SubRip/WebVTT/ASS/SSA/mov_text se extraen a VTT, hasta 12 pistas. Externos SRT/VTT UTF-8 hasta 5 MB, hasta 24 pistas totales. Web permite añadir, activar y eliminar pista externa; TV muestra menú de selección y Desactivados.
- ASS/SSA conserva texto/tiempos, pierde efectos tipográficos avanzados. PGS/VobSub son imágenes: versión actual informa limitación y permite añadir SRT/VTT. No hace OCR.
- Preparación MP4 conserva todas pistas de audio (AAC); TV permite escoger idioma. Preparaciones anteriores con audio único pueden recuperar otras pistas desde original. Web depende de controles/formats del navegador para audio; selector dedicado está en TV.
- TV carga subtítulos como `MediaItem.SubtitleConfiguration`, siempre desde IP privada y UUID validado; ignora URLs arbitrarias recibidas en JSON.
- Menús de velocidad 0.75–2× e imagen proporcional/recorte. Subtítulos usan preferencias de tamaño/estilo del sistema. Audio respeta foco y desconexión de salida; conexión fallida ofrece reintento.

Fuentes: [subtítulos externos](https://developer.android.com/media/media3/exoplayer/media-items#sideloading-subtitle-tracks), [selección de pistas](https://developer.android.com/media/media3/exoplayer/track-selection), [PlayerView](https://developer.android.com/reference/androidx/media3/ui/PlayerView), [FFmpeg mapeo/adjuntos](https://ffmpeg.org/ffmpeg.html).

## Evidencia y límites

Reporte de comandos/escenarios en [PRUEBAS-1.1.0.md](PRUEBAS-1.1.0.md). JUnit/Robolectric prueba eventos y vistas Android; navegador reproduce archivos reales; servidor verifica conversiones/pistas y carátulas mediante FFmpeg. No equivale a prueba de decodificación en hardware de TV.

Compatibilidad final depende de códec, HDR, audio y firmware de TV. Pipeline actual prioriza MP4 H.264/AAC; recodifica otros videos a máximo ancho 1920, CRF 23. No promete conservación HDR ni passthrough Dolby/DTS. Original permanece descargable. No Cast, Dolby Vision ni sincronización entre pantallas.

Paquete `com.andress1014.casacine.tv`, preferencias y protocolo `CASACINE_DISCOVER_V1` permanecen por compatibilidad. Nombre visible: Palomita, versión 1.1.0, versionCode 2. APK debug para instalación doméstica, firmado con mismo certificado anterior.
