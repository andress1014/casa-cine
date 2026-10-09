# Actualización personal 1.2.1

Paquete local `releases/Guarida-v1.2.1-Windows.zip` contiene backend, frontend compilado, fuente, motor PS1/SNES y configuración TMDb personal. No incluye videos, documentos, juegos, BIOS, claves HTTPS ni `.env` anterior. APK independiente: `releases/Palomita-TV-v1.2.0.apk`.

## Windows ya instalado

1. Detén tarea CasaCine desde Programador de tareas (si servidor se inició manualmente, cierra esa ventana). Mantén copia de seguridad de DATA_DIR y `.env`.
2. Extrae ZIP en carpeta temporal. Copia contenido de `Guarida-v1.2.1` encima de repo Windows, por ejemplo `C:\Users\andre\Desktop\casa-cine`. Conserva `data`, `.env` y configuración de tarea; paquete no reemplaza esos archivos.
3. Desde PowerShell en carpeta del repo:

```powershell
npm ci
npm run build
```

Motor incluido evita descarga de 290 MB. `personal-settings.json` activa TMDb sin pegar clave; variable TMDB_API_KEY/READ_ACCESS_TOKEN en `.env` tiene prioridad.

4. Inicia tarea CasaCine. Página sigue en `http://localhost:3210`; otros equipos usan IP local de Windows. Cine: `/cine`, Gaming: `/gaming`.
5. Para DualSense desde otro dispositivo configura HTTPS local según [guía Gaming](GAMING.md).
6. Si ya instalaste APK 1.2.0, no hace falta reinstalar: carátulas nuevas llegan desde servidor. Si conservas APK anterior, instala Palomita 1.2.0 mediante USB para obtener fondo tras 30 segundos en pausa.

Paquete es personal y contiene clave de lectura solicitada. Archivos locales de configuración permanecen fuera de Git. APK y ZIP todavía no están publicados en GitHub.

## Compilaciones realizadas

- Web: TypeScript + Vite, versión 1.2.1.
- APK: assembleDebug, versión 1.2.0, versionCode 3.
- Motor: release oficial EmulatorJS 4.2.3, checksum validado, interfaz y cores PS1/SNES instalados.
- No se ejecutaron pruebas nuevas de juegos, DualSense, pausa física en TV ni HTTPS Windows en este cambio. Compilación no garantiza compatibilidad de todos los juegos/dispositivos.

## Corrección de carátulas

Películas nuevas y existentes sin ficha se buscan automáticamente en TMDb. Nombre de archivo se limpia antes de búsqueda. Coincidencia exacta y única guarda carátula, fondo, título y sinopsis. Banner utiliza fondo horizontal; tarjetas y TV reciben carátula. Selección manual se conserva. Crédito pasa a Acerca de.

Vista local comprobada con Spider-Man: Brand New Day: banner usa backdrop y catálogo usa poster de TMDb. No se hizo prueba física en TV ni acceso a Windows desde este Mac.
