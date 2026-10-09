# Actualizar Windows a Guarida + Palomita 1.1.0

Actualización conserva películas, documentos, `.env`, favoritos y direcciones anteriores. Repositorio continúa llamándose `casa-cine`. Servidor sigue en puerto 3210. Tarea Windows instalada anteriormente conserva nombre `CasaCine`.

## Instalación existente de Andres

Rutas conocidas de instalación: `C:\Users\andre\Desktop\casa-cine` y script de arranque `C:\Users\andre\AppData\Local\CasaCine\start.ps1`. No reemplaces ese script por una instalación nueva ni borres carpeta de datos.

1. Espera a que terminen subidas/conversiones. Abre PowerShell en PC Windows.
2. Comprueba cambios locales:

```powershell
cd C:\Users\andre\Desktop\casa-cine
git status --short
```

Si aparecen cambios de código, consérvalos antes de cambiar rama. `.env` y datos están ignorados; cambiar rama no los modifica.

3. Descarga rama nueva antes de detener servicio:

```powershell
git fetch origin
```

4. Detén tarea desde Programador de tareas → `CasaCine` → Finalizar. Alternativa PowerShell con permisos suficientes:

```powershell
Stop-ScheduledTask -TaskName CasaCine
```

5. Con servidor detenido, respalda **carpeta completa indicada por DATA_DIR** en otro disco. Si variable está vacía, corresponde a `data` dentro del repo. No subas datos a GitHub.
6. Primera actualización a esta rama:

```powershell
git switch --track origin/feature/guarida-home-hub
npm.cmd ci --registry=https://registry.npmjs.org/
npm.cmd run build
```

Si rama ya existe localmente, usa `git switch feature/guarida-home-hub` y después `git merge --ff-only origin/feature/guarida-home-hub`. Ejecuta siguiente comando únicamente si instalación y compilación terminaron correctamente:

```powershell
Start-ScheduledTask -TaskName CasaCine
```

Si `node`/`npm` no están en PATH de terminal, abre nueva terminal o añade ruta usada por instalación actual a sesión:

```powershell
$env:PATH = "C:\Users\andre\AppData\Local\nvm\v24.21.0;$env:PATH"
```

No cambies versión Node usada por tarea si ya funciona. Proyecto requiere Node 24+.

7. Abre `http://localhost:3210` en Windows. Desde casa, dirección conocida de este PC: `http://192.168.1.13:3210`; IP puede cambiar según router. Inicio ahora muestra Guarida; cine está en `/cine`, archivos en `/archivos`.
8. Primer arranque actualiza catálogo automáticamente y busca carátulas/subtítulos de películas anteriores. Archivos preparados antiguos con un único audio se actualizan para recuperar pistas adicionales desde original; proceso puede tardar. No se borran originales.

Si no inicia, revisa `C:\Users\andre\AppData\Local\CasaCine\casacine.log`. Configuración/red y tarea existentes no requieren cambio por nombre nuevo.

## Actualizar TV por USB

1. Descarga **Palomita-TV-v1.1.0.apk** de Releases privadas con cuenta `andress1014`.
2. Copia a USB. Abre APK desde gestor de archivos; reproductor multimedia de TV no instala APK.
3. Instala encima de app anterior. Paquete y certificado son mismos; favoritos/IP se conservan. En menú aparece **Palomita**.
4. Conecta a `192.168.1.13:3210` si app no detecta PC. Mantén Windows encendido y ambos dispositivos en misma red.
5. Durante película: izquierda/derecha con barra enfocada, o botones de avance, saltan **10 segundos por pulsación**. Mantener tecla no acelera. Flechas entre botones siguen navegando. OK en barra pausa/reproduce; Atrás oculta controles, siguiente Atrás vuelve.
6. Flecha arriba permite acceder a **Subtítulos**, **Audio**, **Velocidad** e **Imagen**. SRT/VTT añadidos desde web están disponibles al volver a abrir película en TV.

Si Android muestra conflicto de firma, no desinstales primero: revisa APK y versión descargada. Esta entrega tiene mismo certificado que APK inicial.

## Compatibilidad

App TV anterior sigue funcionando con servidor nuevo. APK nueva funciona con API anterior, pero necesita servidor 1.1.0 para subtítulos extraídos/añadidos y nuevas carátulas. Cookies, protocolo de búsqueda local, paquete Android y rutas de videos conservan compatibilidad.


## Mantener IP local fija

Recomendado: reserva DHCP en router doméstico. Selecciona interfaz de Windows usada por servidor y asigna siempre IP conocida, por ejemplo `192.168.1.13`, si router confirma que corresponde a esa PC y no hay conflicto. Windows puede continuar con configuración automática (DHCP). Sitio quedará en `http://192.168.1.13:3210` después de reiniciar/conectar PC. Estar siempre encendido no garantiza IP estable.

Ruta depende de modelo: busca DHCP / Reserva de dirección / Address Reservation en router. Reserva identifica interfaz por dirección MAC; Ethernet y Wi-Fi tienen MAC distintas. Mantén interfaz elegida para servidor. [Ejemplo oficial TP-Link](https://www.tp-link.com/in/support/faq/182/).

Alternativa: Windows → Configuración de red → Asignación IP → Editar → Manual. Necesita IP libre en subred correcta, máscara, puerta de enlace y DNS; coordina dirección con rango DHCP de router para evitar duplicados. [Documentación Microsoft](https://support.microsoft.com/es-es/windows/experience/connectivity-networking/essential-network-settings-and-tasks-in-windows).
