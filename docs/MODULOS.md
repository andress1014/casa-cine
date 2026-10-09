# Guarida crece por secciones

Inicio `/` reúne módulos; Cine `/cine` y Archivos `/archivos` funcionan. Gaming `/gaming` incluye biblioteca PS1/SNES, emulación web, controles y partidas en Windows.

## Agregar sección

1. Describe función y dispositivos: por ejemplo biblioteca PS1 para guardar/descargar juegos, o emulación web con mando. Define formatos, tamaño, persistencia y permisos antes de programarla.
2. Añade entrada a `shared/home-modules.json`: `id`, `path`, `name`, `eyebrow`, `description`, `status`, `color`. Registro alimenta inicio y API `/api/hub`.
3. Declara ruta en `src/home-types.ts`. Crea componente independiente y agrega navegación en `App.tsx`; conserva estado de perfil/sesión del contenedor común.
4. Implementa API/storage propios si hace falta. Todas rutas privadas deben montarse después de guardia común de `/api`; archivos usan UUID generado, nunca rutas enviadas por cliente.
5. Añade pruebas de módulo y verifica integración con Inicio, móvil, acceso protegido y persistencia.

Separar secciones permite evolucionar documentos o Gaming sin recompilar APK de Palomita. Cine conserva API `/api/media`; app TV continúa siendo reproductor de cine. Futuro APK de Guarida sería otro producto, si lo necesitamos.

## Gaming actual

- `src/Gaming.tsx`: colección, perfiles, subida, BIOS, portadas y panel de emulación.
- `server/gaming.mjs`, `game-store.mjs`, `game-formats.mjs`: API, SQLite y validación.
- `public/gaming-player/`: adaptador aislado de EmulatorJS 4.2.3 y guardados versionados.
- `scripts/setup-gaming.mjs`: instalación local de motor con checksum.
- HTTPS opcional y controles: [guía Gaming](GAMING.md).
- Emulación en TV depende de navegador; APK Palomita continúa dedicado a cine.
