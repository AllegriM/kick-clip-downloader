# 🚀 Anonymous Kick Clipper

![Licencia: MIT](https://img.shields.io/badge/Licencia-MIT-green.svg)

Una extensión de navegador simple para descargar clips de VODs y Streams en Vivo (DVR) de Kick de forma 100% anónima, directamente a tu computadora.

> **El Problema:** Cuando creas un clip en Kick de forma nativa, tu nombre de usuario queda atado públicamente a ese clip.
>
> **La Solución:** Esta extensión no usa la API de clips de Kick. En su lugar, analiza el stream de video (HLS) y descarga los segmentos de video crudos (`.ts`) directamente. Luego, los une y te los entrega como un archivo de video `.mpeg` en tu PC. El resultado es un clip perfecto sin ninguna conexión a tu cuenta.

## 🎬 Demostración

_(Te recomiendo 100% grabar un GIF corto o un video de 15 segundos mostrando cómo funciona la extensión y ponerlo aquí. Un buen README visual multiplica el interés)._

`[IMAGEN/GIF DE LA EXTENSIÓN EN USO AQUÍ]`

---

## ✨ Características

- **100% Anónimo:** Los clips se descargan localmente y nunca se publican en Kick.
- **Clip Rápido:** Guarda instantáneamente los últimos 30 segundos de un stream con un solo clic.
- **Clip Manual:** Ten control total marcando un "Inicio" y "Fin" exactos.
- **Soporta VODs y Directos:** Funciona tanto en videos ya subidos como en streams en vivo que tengan DVR (que te dejen retroceder).
- **Manejo de Múltiples Pestañas:** Mantiene los datos de cada stream separados por pestaña. Podés tener dos streams abiertos y la extensión sabrá cuál querés clipear.

---

## 🔧 Instalación y Uso

### Instalación (Desde Fuente)

Como esta extensión (aún) no está en la Chrome Web Store, debés cargarla manualmente.

1.  **Descargá/Cloná el Repositorio:** Obtené los archivos de este repositorio en una carpeta en tu computadora.
2.  **Abrí las Extensiones:** Andá a tu navegador (Chrome, Brave, Edge) y escribí `chrome://extensions` en la barra de direcciones.
3.  **Activá el Modo Desarrollador:** En la esquina superior derecha, activá el interruptor de "Modo de desarrollador".
4.  **Cargá la Extensión:** Hacé clic en el botón "Cargar descomprimida" y seleccioná la carpeta donde descargaste los archivos del repositorio.
5.  ¡Listo! El ícono de la extensión (el logo verde de Kick) aparecerá en tu barra de herramientas.

### Cómo Usarla

1.  Navegá a un stream en vivo (con DVR) o a un VOD en Kick.
2.  **Importante:** Esperá unos segundos a que el reproductor de video cargue. La extensión necesita detectar el stream de video primero.
3.  Hacé clic en el ícono de la extensión para abrir el popup.

#### Para un Clip Rápido:

- Simplemente hacé clic en el botón **"Clipear últimos 30 seg."**.
- La extensión calculará y descargará los últimos 30 segundos de video desde el manifiesto del stream.

#### Para un Clip Manual:

1.  En el reproductor de Kick, pausá el video en el momento donde querés que **comience** tu clip.
2.  Abrí el popup y hacé clic en **"Marcar Inicio"**.
3.  Volvé al video, avanzá hasta el momento donde querés que **termine** tu clip y pausalo.
4.  Abrí el popup y hacé clic en **"Marcar Fin"**.
5.  Hacé clic en el botón verde **"¡Clipear Selección!"**.

El archivo (`kick-clip-....mpeg`) se descargará automáticamente.

---

## 🛠️ Cómo Funciona (Técnicamente)

Este proyecto es una extensión de Manifest V3 que funciona sin inyectar librerías pesadas.

1.  **`background.js` (Service Worker):**

    - Usa `chrome.webRequest` para "escuchar" las peticiones de red y capturar la URL del manifiesto principal (`.m3u8`) tan pronto como la página la solicita.
    - Usa `chrome.storage.session` para almacenar esta URL asociada al `tabId` (ID de la pestaña) que la solicitó. Esto permite que la extensión funcione con múltiples streams abiertos.
    - Escucha los mensajes del `popup.js` ("Clip Rápido" o "Clip Manual").
    - Al recibir una orden, hace un `fetch` del `.m3u8`, lo analiza (lo "parsea") para encontrar los segmentos de video (`.ts`) correctos según el rango de tiempo.
    - Descarga todos los segmentos `.ts` necesarios en paralelo como `ArrayBuffers`.
    - Concatena los buffers en un solo `Blob` (con el tipo `video/mp2t`).
    - Convierte el `Blob` a una `Data URL` y usa `chrome.downloads` para entregárselo al usuario.

2.  **`popup.js`:**

    - Maneja toda la lógica de la interfaz de usuario.
    - Obtiene el `tabId` de la pestaña actual.
    - Lee y escribe los tiempos de "Inicio" y "Fin" en `chrome.storage.session` (también asociados al `tabId`).
    - Al clipear, lee la URL del M3U8 y los tiempos del storage y se los envía al `background.js` para que haga el trabajo pesado.

3.  **`content-script.js`:**
    - Es un script muy ligero que se inyecta en la página de Kick.
    - Su única función es escuchar un mensaje del `popup.js` que le pregunta: "¿En qué segundo está el video ahora mismo?".
    - Responde con el `video.currentTime` del reproductor de video de Kick.

---

## ⚖️ Aviso Legal

Este es un proyecto no oficial y no está afiliado, asociado, autorizado, respaldado por, o de alguna manera conectado oficialmente con Kick.com.

Esta herramienta se proporciona "tal cual", sin garantía de ningún tipo. Usala bajo tu propia responsabilidad. El contenido descargado pertenece a sus respectivos creadores de contenido.
