# Componentes Gaming

- **EmulatorJS 4.2.3**: frontend WebAssembly. [Código y licencia](https://github.com/EmulatorJS/EmulatorJS/tree/v4.2.3), [release oficial](https://github.com/EmulatorJS/EmulatorJS/releases/tag/v4.2.3).
- **PCSX ReARMed**: core PlayStation 1. [Código fuente](https://github.com/libretro/pcsx_rearmed), [documentación/licencia](https://docs.libretro.com/library/pcsx_rearmed/).
- **Snes9x**: core Super Nintendo. [Código fuente](https://github.com/libretro/snes9x), [documentación/licencia](https://docs.libretro.com/library/snes9x/).
- **RetroArch WebAssembly**: [herramientas de compilación EmulatorJS](https://github.com/EmulatorJS/build).

Motor se descarga sin modificar desde release oficial con SHA-256 fijado en script. `vendor/emulatorjs/4.2.3/LICENSE` conserva licencia de frontend. Cada archivo `data/cores/*-wasm.data` es contenedor 7z del build oficial con `license.txt`, `core.json`, `build.json`, JavaScript y WebAssembly; informes se conservan en `data/cores/reports`. Menú de EmulatorJS mantiene créditos y licencia de core.

Archivos binarios descargados quedan fuera de Git. Distribución personal Windows incorpora interfaz/cores seleccionados y documentos anteriores. No se incluyen juegos ni BIOS.
