# Gaming · Guarida

Biblioteca local para PlayStation 1 y Super Nintendo. Windows almacena juegos, BIOS, portadas y partidas; dispositivo donde juegas ejecuta emulador. Web y [Guarida TV 1.3.0](GUARIDA-TV-GAMING.md) comparten perfiles y guardados. APK integra Cine y Gaming, con entrada nativa para mandos Bluetooth/USB.

## Preparar servidor

Node 24 o superior. Desde carpeta del proyecto:

```powershell
npm ci
npm run build
npm start
```

`npm run build` prepara motor automáticamente. Primera instalación descarga release oficial EmulatorJS **4.2.3** (290 MB), valida SHA-256 y extrae interfaz, licencias y cores PCSX ReARMed/Snes9x. Windows 10/11 requiere `tar.exe` disponible; se admite `TAR_BIN` para seleccionar bsdtar compatible con 7z. Motor queda en `vendor/emulatorjs/4.2.3`, fuera de Git; instalaciones siguientes verifican hashes sin descargar de nuevo. Para preparar motor por separado: `npm run gaming:setup`. Si descargaste release manualmente, `EMULATORJS_ARCHIVE` permite usar archivo `.7z` local; misma comprobación de checksum.

Juegos no salen de casa. Interfaz, scripts y cores se sirven desde mismo Windows, sin CDN en reproducción. CSP bloquea solicitudes externas de motor, incluyendo comprobación de actualizaciones/fallback remoto. Versión se actualiza expresamente desde código para mantener guardados compatibles.

## Agregar juegos

Abre `/gaming`, crea/escoge perfil y pulsa **Agregar juego**:

- **PS1:** CHD **v5**, PBP que contenga juego PS1, o ZIP con **un CUE** y todas sus pistas **BIN**; SBI opcional. Archivos en raíz del ZIP, sin carpetas. Límite 1 GB por subida y 1500 MB descomprimidos. Para varios discos, añade cada disco por separado; compartir memory card entre discos requiere soporte posterior. No se promete cambio de disco automático.
- **SNES:** SFC, SMC o ZIP con una única ROM, sin carpetas. Límite 16 MB.
- Portada opcional PNG/JPG hasta 4 MB; servidor la convierte a JPG. Ficha permite cambiar nombre, región, portada, descargar original y eliminar juego con sus partidas.
- Usa copias de tus juegos o homebrew. Juegos y BIOS no vienen incluidos.

Subidas quedan fuera de biblioteca hasta completar validación. ZIP no se extrae en disco del servidor: se inspeccionan directorio y CUE, se rechazan rutas, enlaces, cifrado, ZIP64 y formatos ajenos. ROM se ejecuta dentro de WebAssembly del navegador, nunca como programa del servidor. Validación de formato no garantiza que cada juego sea compatible.

## BIOS PS1

Pulsa **BIOS PS1** y carga BIN de tu consola. Huella MD5 permite reconocer SCPH5500/5501/5502, SCPH101/7001/1001 y PSXONPSP660. Guarda BIOS por región. Región elegida en ficha prioriza BIOS correspondiente; automática utiliza BIOS disponible. Si falta BIOS, PCSX ReARMed usa HLE, con compatibilidad reducida.

## Control PS5 y HTTPS local

Control se conecta por USB o Bluetooth a dispositivo donde juegas. Para emparejar DualSense apagado: mantén Create + PS hasta que parpadee y escógelo en Bluetooth. Pulsa botón con navegador visible para detectar control. **Controles** dentro de partida abre configuración de botones para jugadores; soporte de dos controles depende de juego, navegador y dispositivo. Teclado y controles táctiles también disponibles.

En Windows servidor, `http://localhost:3210/gaming` es contexto seguro. Para jugar con control desde otro equipo mediante IP privada, configura **HTTPS con certificado de confianza**. Se mantiene HTTP 3210 para APK/cine y se añade HTTPS 3443.

1. Instala [mkcert oficial](https://github.com/FiloSottile/mkcert) en Windows personal y añádelo a PATH.
2. Reserva IP del servidor en router antes de crear certificado.
3. Abre PowerShell como administrador desde proyecto y ejecuta con IP real de Windows:

```powershell
.\scripts\setup-gaming-https.ps1 -Address 192.168.1.13
```

Script instala autoridad local de mkcert, genera certificado para IP/localhost, configura `TLS_CERT`, `TLS_KEY`, `TLS_PORT` en `.env` preservando otras entradas y abre 3443 para perfil privado/red local. Reinicia servidor o tarea CasaCine.

4. Instala **certificado público** `data/tls/Guarida-CA.crt` como autoridad de confianza en dispositivos clientes. Si DATA_DIR cambia, archivo está en esa ruta. En iPhone, además activa confianza plena desde Ajustes → General → Información → Ajustes de confianza de certificados. Nunca copies `rootCA-key.pem` ni `guarida-key.pem` a clientes.
5. Abre `https://192.168.1.13:3443/gaming`, sin avisos de certificado. Aceptar excepción de certificado puede no habilitar APIs seguras.

TV necesita navegador compatible con WebAssembly/Gamepad y suficiente memoria. No todos los navegadores TV sirven para emulación. Motor usa un hilo para evitar dependencia de SharedArrayBuffer; rendimiento depende de CPU/GPU/memoria del cliente y juego. No modifica controles ni seguridad del Mac corporativo.

## Partidas

- Perfiles se comparten en casa; selecciona mismo nombre para continuar en otro dispositivo. Son perfiles de uso familiar, no cuentas privadas con contraseña individual.
- Memory card/SRAM se guarda cada 15 segundos mientras juego está activo. Aún debes guardar dentro de juego cuando este usa menú de guardado.
- **Guardar punto** guarda estado completo en Windows. **Recuperar punto** restaura último estado. Puedes iniciar nueva partida desmarcando continuar punto antes de arrancar.
- **Guardar y salir** guarda memory card y punto antes de cerrar. Cambia dispositivo después de salir.
- **Exportar** descarga estado para respaldo. Menú nativo de motor permite exportar memory card.
- Revisiones de guardado evitan sobrescribir progreso cambiado desde otro dispositivo. Si aparece conflicto/error, exporta antes de salir y vuelve a abrir juego. No hay sincronización simultánea/netplay.
- Si no pudo cargar memory card previa, se detiene guardado automático para proteger partida. Salir sin guardar mantiene última versión existente.

Respaldos: copia DATA_DIR completo con servidor detenido, incluyendo `gaming.sqlite`, `games`, `gameBios`, `gameCovers`, `gameSaves` y archivos WAL si existen. Cambiar core/versión puede invalidar estados; memory cards suelen tener más compatibilidad. No borres motor durante reproducción.

## Estado de implementación

Biblioteca, subida, BIOS, portadas, perfiles, emulación, configuración de controles, SRAM/estados y HTTPS opcional implementados. Compilación web realizada. Sin prueba física de DualSense, TV, juegos comerciales o HTTPS Windows en este entorno; compatibilidad concreta requiere probar tus archivos y dispositivos.

Fuentes: [EmulatorJS PS1](https://emulatorjs.org/docs/systems/playstation/), [funciones](https://emulatorjs.org/docs/features/), [PCSX ReARMed](https://docs.libretro.com/library/pcsx_rearmed/), [DualSense](https://www.playstation.com/en-us/support/hardware/pair-dualsense-controller-bluetooth/), [Gamepad API](https://developer.mozilla.org/en-US/docs/Web/API/GamepadEvent/gamepad).
