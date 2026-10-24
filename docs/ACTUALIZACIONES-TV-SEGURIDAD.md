# Revisión de seguridad del actualizador TV

Fecha: 11 de octubre de 2026. Skill: meli-security-expert, modo Build. Dos superficies revisadas: Node.js en servidor y Android nativo. Proyecto personal fuera de Fury; SDKs internos no aplican. Revisión estática, no auditoría externa ni prueba de TV físico.

## Controles aplicados

- **CWE-798/532/209:** token GitHub únicamente en configuración privada de servidor; no incluido en respuestas, cliente, logs o artefactos. Fallos usan texto fijo sin excepción/proveedor original.
- **CWE-918:** host GitHub fijo, repositorio validado desde configuración del dueño, sin URLs recibidas del cliente. CDN HTTPS con lista cerrada; token no sigue redirección.
- **CWE-22:** rutas de descarga aceptan hash y lo comparan con manifiesto conocido; no utilizan ruta o nombre de cliente para buscar archivos. APK en TV usa archivo temporal privado generado por sistema.
- **CWE-306/352:** guardia existente de acceso a casa y validación de origen antes de rutas; actualizador bloquea túnel público. Refresco usa POST JSON estricto; GET lee metadatos o stream remoto sin operaciones de escritura en otros servicios. Descarga limita concurrencia, tamaño y duración.
- **CWE-494/347:** paquete, versión, SHA-256 y certificado instalado verificados antes de instalar; no se acepta cambiar firma. Backend también verifica hash antes de completar stream.
- **Componentes e Intents:** receiver no exportado. PendingIntent explícito y mutable únicamente para callback de PackageInstaller, que exige escribir extras del resultado; permitido por [contrato Android de Session.commit](https://developer.android.com/reference/android/content/pm/PackageInstaller.Session#commit(android.content.IntentSender)). Confirmación solo se abre si resuelve a actividad del sistema. Permiso REQUEST_INSTALL_PACKAGES tiene función explícita y requiere aprobación de usuario.
- **Ciclo de vida:** descarga cancelable, trabajo fuera de hilo UI, instalación pospuesta si actividad está en segundo plano. Ficheros se borran al cancelar, cerrar o entregar al instalador.

## Límites y revisión pendiente

- Compilación Android completada el 23 de octubre de 2026 con 28 pruebas existentes aprobadas; firma de APK 1.3.4 compatible con 1.3.3 verificada. Ejecución de actualización en TV real pendiente; estas pruebas no validan instalador físico.
- Biblioteca opera en HTTP dentro de LAN según arquitectura existente. Integridad/autenticidad de APK se valida con certificado instalado; no se envía credencial GitHub por LAN. Código de casa y sesión existentes conservan sus limitaciones de transporte doméstico.
- Firma actual es debug, según distribución anterior. Conservar key original permite actualizar instalaciones actuales; migrar a certificado nuevo requiere estrategia de firma compatible y no se implementó silenciosamente.
- Publicación y configuración de credencial aún necesarias. No se validaron autorización de token, GitHub remoto, variantes de instalador de fabricantes ni TV sin actividad compatible para permisos.

Resultado: controles implementados y revisados en código; sin hallazgos bloqueantes nuevos identificados dentro de revisión estática. Compilación y firma verificadas; entrega física pendiente. Procedimiento en [ACTUALIZACIONES-TV.md](ACTUALIZACIONES-TV.md).
