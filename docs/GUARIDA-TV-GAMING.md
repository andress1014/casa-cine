# Guarida TV 1.3.3: Cine, Gaming y mando PS5

APK abre **Guarida**, con **Cine · Palomita** y **Gaming · PS1 / SNES**. Cine conserva Media3, subtítulos, carátulas, favoritos y posiciones. Gaming comparte biblioteca y perfiles con web; ejecuta emulador en TV y guarda progreso en PC servidor.

## Navegación en TV

Fondo de película o juego a pantalla completa, degradados para leer texto, título destacado y acción principal. Foco de biblioteca cambia título y fondo; se reutilizan carátulas y fondos del servidor, con caché y carga diferida. Cine muestra seis portadas por fila; Gaming muestra cuatro tarjetas. Navegación superior: **Inicio, Cine y Gaming** con pestaña activa subrayada. Iconos de **Buscar** y **Opciones**, avatar y nombre de perfil permanecen en cabecera. Avatar abre edición/selección de perfil. Acciones secundarias y filtros se muestran como texto; acción principal utiliza botón sólido. Categorías y consolas se eligen con un selector. IP no aparece en cartelera.

- Cine: **Opciones** permite cambiar favorito de video seleccionado, actualizar, editar perfil, conectar mando y cambiar PC. Selector de categoría incluye **Favoritos** y **Seguir viendo**.
- Gaming: **Opciones** reúne **Cambiar jugador**, **Mandos y Bluetooth** y **Actualizar biblioteca**. Perfil activo aparece debajo del título.
- Inicio: dos tarjetas grandes para Cine y Gaming. Perfil y conexión se gestionan desde **Opciones** o avatar.
- Resaltado lima indica foco del control remoto. Flechas / stick recorren navegación, selector y biblioteca.

## Instalar

1. Copia `releases/Guarida-TV-v1.3.3.apk` a USB y abre instalador desde gestor de archivos de TV.
2. Instala encima de Palomita. No desinstales versión anterior: conserva IP, perfil, favoritos y posiciones.
3. Paquete sigue siendo `com.andress1014.casacine.tv`, misma firma debug; versionCode es 7.
4. Mantén PC encendida en misma red. Servidor necesita Gaming de Guarida 1.2.x o superior y motor instalado. Si falta motor, ejecuta `npm run gaming:setup` en Windows.
5. Sube juegos y BIOS desde web `/gaming`. APK ofrece biblioteca, búsqueda, filtros y perfiles; subidas se realizan desde PC/teléfono.

Adaptador Gaming viaja dentro de APK y utiliza API existente. No necesita HTTPS para mando dentro de APK: entrada se procesa con APIs nativas Android. Paquete Windows 1.3.0 es opcional para recibir también cambios web.

## Emparejar DualSense

- **Bluetooth:** con mando apagado, mantén **Crear + PS** hasta que luz parpadee. En ajustes Bluetooth / Mandos y accesorios de TV, añade **Wireless Controller**.
- **USB:** utiliza cable USB-C **de datos** entre TV y mando. Cable de carga no transporta botones.
- **Opciones → Conectar mando PS5 / Mandos y Bluetooth** muestra dispositivos detectados e instrucciones y abre ajustes Bluetooth. Emparejamiento se realiza en TV; APK no pide acceso Bluetooth.
- Sony indica compatibilidad desde **Android TV 12**. En versiones anteriores y dispositivos modificados depende de fabricante. Mantén Android System WebView actualizado cuando TV lo permita.

## Controles

| Acción | DualSense |
|---|---|
| Navegar menús | Cruceta o stick izquierdo |
| Aceptar | ✕ |
| Volver en menús | ○ |
| PS1 | ✕, ○, □, △, cruceta, L1/R1, L2/R2, L3/R3 |
| SNES | Posiciones equivalentes a B/A/Y/X, cruceta y L/R |
| Start de consola | Options, pulsación corta |
| Select de consola | Crear |
| Menú de partida | Mantener Options 0,8 s o Atrás del control remoto |
| Cine: reproducir / pausar | Options; ✕ utiliza controles de reproductor |

Stick izquierdo también genera cruceta para PS1 digital y SNES. Ambos sticks envían valores analógicos; uso efectivo depende del modo de mando del core y juego. Dos mandos se asignan como jugadores 1 y 2 al recibir primera entrada. Multijugador requiere juego compatible. Vibración, gatillos adaptativos, touchpad y audio del mando no están implementados.

Durante juego, ○ llega a consola y no cierra app. Botones se liberan al abrir menú, ir a otra app o desconectar mando. Si desaparecen todos los mandos, partida se pausa.

## Partidas

- Escoge mismo perfil que usas en web para continuar guardados desde otro dispositivo.
- **Continuar** recupera punto de partida si existe. **Desde inicio** no carga ese punto; conserva memory card / SRAM del perfil.
- Menú: **Guardar partida**, **Cargar partida**, **Guardar y salir**. Memory card / SRAM se sincroniza periódicamente con Windows.
- Fallo de red o conflicto con otra sesión impide sobrescribir partida. Salida con guardado espera respuesta del servidor.
- **Exportar copia en TV** guarda estado en documentos de app. Diálogo muestra ruta, normalmente `Android/data/com.andress1014.casacine.tv/files/Documents/`. Acceso desde gestor depende de restricciones de TV.
- **Salir sin guardar** requiere confirmación. Conserva último guardado de Windows.

## Implementación y límites

Biblioteca y perfiles son nativos. Partida utiliza WebView con adaptador empaquetado y EmulatorJS **4.2.3**, versión fijada. `NativeGamepad` traduce entrada Android a índices libretro. No depende de Gamepad API ni cambia requisitos HTTPS de web.

Documento empaquetado bloquea marcos y navegación externa. Recursos de red se limitan al origen de servidor elegido y rutas Gaming/motor. Exportación utiliza bloques de 24 KB y máximo 64 MB. No se incluyen ROM comerciales ni BIOS. Rendimiento depende de CPU, memoria, WebView y juego de TV.

Compilaciones: TypeScript/Vite y assembleDebug. Firma verificada contra APK anterior. **No se realizó prueba física con TV, DualSense, ROM ni BIOS en este cambio.** Compilación no valida emparejamiento ni rendimiento real.

## Fuentes

- [Sony: compatibilidad y emparejamiento](https://controller.dl.playstation.net/controller/lang/es/index.html).
- [Android: botones, sticks y gatillos](https://developer.android.com/games/sdk/game-controller/controller-input).
- [EmulatorJS: opciones](https://emulatorjs.org/docs/options/).
- [Android: puentes WebView](https://developer.android.com/privacy-and-security/risks/insecure-webview-native-bridges).

## Gaming sin carátula

APK incluye ilustración de consolas y mandos como fondo de Gaming. Juegos sin carátula utilizan esa ilustración con etiqueta pequeña de consola. Una carátula subida desde web reemplaza imagen genérica. Arte incluido funciona sin internet y no contiene ROM ni BIOS.
