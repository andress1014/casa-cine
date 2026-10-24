# Actualizar Guarida desde TV

> **Desde 1.3.5 (24 de octubre de 2026):** el repositorio es público y el TV consulta GitHub directamente (`GitHubReleases.java`): lee `releases/latest`, baja `tv-update.json` y el APK de `github.com/andress1014/casa-cine/releases/download/<tag>/`, y verifica tamaño, SHA-256, paquete, versión y certificado igual que antes. No hace falta token ni que el PC esté encendido para actualizar. La 1.3.5 se instala una vez a mano (USB) sobre la 1.3.4; las siguientes llegan desde **Opciones → Actualizar Guarida**. Las rutas `/api/tv/update*` del servidor y `TV_UPDATE_*` del `.env` quedan sin uso por el TV. Lo de abajo describe el flujo 1.3.4 vía PC.

Implementación: 11 de octubre de 2026. APK compilada y verificada: 23 de octubre de 2026. Versión Android: 1.3.4, versionCode 8.

## Uso

Primera APK con actualizador requiere instalación manual sobre versión anterior, con mismo certificado. Después:

1. Enciende PC Windows con servidor actualizado; conecta TV al servidor.
2. Guarida consulta versiones al conectar y al volver a pantalla principal. Evita repetir consulta automática durante seis horas dentro del mismo proceso; abrir de nuevo proceso vuelve a consultar.
3. Si hay versión nueva, muestra aviso. **Opciones → Actualizar Guarida** permite consultar en cualquier momento.
4. Selecciona Actualizar. Descarga muestra progreso y admite cancelación.
5. Primera vez Android puede pedir permiso para instalar aplicaciones desde Guarida. Actívalo en Ajustes y vuelve a app. Instalador del sistema pide confirmar actualización.

Actualización no desinstala app: conserva conexión, preferencias y datos. No se inicia instalación mientras app está en segundo plano. Al volver a pantalla principal continúa instalación pendiente. Salir de actividad o cambiar PC cancela trabajo pendiente. Biblioteca y reproducción siguen funcionando sin credencial GitHub; actualizador informa configuración pendiente.

## Configurar PC Windows

Parche de servidor preparado en `artifacts/Guarida-servidor-actualizador-TV-v1.3.4.zip`: contiene módulos de servidor y guía, sin credenciales, biblioteca ni APK. Detener servidor y respaldar instalación antes de copiar módulos sobre carpeta existente. Conservar `.env` y datos; `.env.example` es referencia. Este parche no reemplaza primera instalación de APK con actualizador.

En `.env` privado de instalación:

```dotenv
TV_UPDATE_REPOSITORY=andress1014/casa-cine
TV_UPDATE_GITHUB_TOKEN=TU_CREDENCIAL_PRIVADA
```

Usar fine-grained token limitado a este repositorio, permiso **Contents: Read-only** y fecha de expiración apropiada. Reiniciar servidor después de configurar. No guardar token en APK, Git, ZIP de distribución, enlaces ni mensajes. Servidor no obtiene automáticamente credencial de cuenta GitHub del desarrollador.

Repositorio puede permanecer privado. PC autentica consultas y descarga; TV recibe metadatos y APK a través de LAN. Rutas del actualizador rechazan acceso mediante túnel público y utilizan código de casa cuando está configurado. No necesita publicar repositorio ni introducir cuenta GitHub en TV.

## Publicar versiones siguientes

Cada Release estable más reciente debe contener juntos:

- `Guarida-TV-vX.Y.Z.apk`, con mismo paquete/certificado y versionCode creciente.
- `tv-update.json`, generado desde APK final.

Release sin manifiesto no se ofrece como actualización de TV. Borradores y prereleases quedan fuera. Publicar release únicamente de Windows sin estos archivos tampoco ofrece actualización de TV: conservar manifiesto/APK correspondiente en release estable más reciente o publicar TV después.

Preparación local, sin publicar:

```bash
# Java 17+, SDK Android y dependencias instaladas.
export JAVA_HOME=/ruta/a/jdk
export ANDROID_HOME=/ruta/a/android-sdk
cd android-tv
./gradlew --offline assembleDebug
cd ..
node scripts/prepare-tv-release.mjs
```

Script verifica firmas con `apksigner`, obtiene identidad real con `aapt`, compara versión con Gradle y prepara archivos en `releases/`. Referencia por defecto: `releases/Guarida-TV-v1.3.3.apk`; argumentos opcionales permiten indicar APK construida y referencia anterior. No genera certificado nuevo ni publica en GitHub. Conservar keystore original en respaldo privado; construir con otro certificado rompe compatibilidad de actualización. Script de preparación está destinado a Mac/Linux con Android build-tools; PC Windows ejecuta servidor, no necesita SDK.

Publicación requiere autorización explícita según AGENTS.md. Crear release y subir ambos archivos solo después de aprobar artefactos; no existe publicación automática en este cambio.

Formato de manifiesto:

```json
{
  "packageName": "com.andress1014.casacine.tv",
  "versionCode": 8,
  "versionName": "1.3.4",
  "minSdk": 23,
  "apkName": "Guarida-TV-v1.3.4.apk",
  "size": 1234567,
  "sha256": "REEMPLAZADO_POR_SCRIPT_CON_SHA256_REAL"
}
```

Ejemplo ilustrativo, no subirlo directamente. Tamaño y hash deben corresponder a APK firmada real.

## API y protección

- `GET /api/tv/update`: consulta memoria de última comprobación, sin llamadas remotas ni descargar APK.
- `POST /api/tv/update/check`, cuerpo `{}`: consulta GitHub y manifiesto. Comprobación compartida entre dispositivos, máximo una cada quince minutos, incluyendo fallos. Solo consulta metadatos; no descarga APK completa.
- `GET /api/tv/update/apk/:sha256`: sirve APK de versión comprobada mediante stream GitHub → PC → TV. No acepta URLs ni nombres arbitrarios. Máximo dos descargas simultáneas, 128 MiB y tres minutos. HEAD devuelve encabezados desde metadatos sin descargar.

GitHub solo recibe credencial en host fijo `api.github.com`; redirección binaria admite hosts CDN fijos HTTPS y nunca reenvía credencial. Errores no incluyen token, URLs firmadas, cuerpo del proveedor ni rutas privadas. PC comprueba tamaño/hash antes de completar respuesta; TV vuelve a comprobar SHA-256, paquete, versión, SDK mínimo y certificado frente a app instalada antes de PackageInstaller. Archivo temporal queda en caché privada y se elimina al terminar/cancelar.

Manifest y APK usan certificado instalado como ancla de confianza. Rotación de certificado, downgrade y actualizaciones que cambien paquete no están soportados por este flujo. Hash sin certificado no permitiría autenticar una actualización recibida por HTTP doméstico. Release se consulta por HTTPS autenticado; TV rechaza APK que no tenga certificado esperado aunque LAN altere metadatos.

## Estado de validación

Compilación `assembleDebug` completada con JDK 17 y SDK Android existentes. Las 28 pruebas Android y 11 pruebas de servidor existentes pasan; no cubren instalación ni actualización en TV real. Sintaxis de módulos Node y preparación comprobada. `prepare-tv-release.mjs` verificó firma compatible con APK 1.3.3 y generó APK 1.3.4 junto con manifiesto real en `releases/`. SDKs internos de Fury no aplican a este proyecto personal; se conserva cliente HTTP/Android nativo existente.

**Comprobación en TV real pendiente:** permisos, callback del instalador y continuidad de actualización requieren prueba física. Publicar release no configura automáticamente credencial ni servidor de PC Windows. Primera instalación de APK 1.3.4 sigue siendo manual.
