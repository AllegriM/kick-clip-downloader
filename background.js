console.log("Background script cargado. v3.1");

// ======================================================
// === 🚀 LISTENER 1: CORREGIDO (Escuchando en live-video.net) 🚀 ===
// ======================================================
chrome.webRequest.onBeforeRequest.addListener(
  function (details) {
    if (details.tabId === -1) return;

    console.log(
      `Manifiesto HLS detectado en Tab ${details.tabId}:`,
      details.url
    );

    chrome.storage.session.get(["tabData"], (res) => {
      const tabData = res.tabData || {};

      tabData[details.tabId] = {
        ...(tabData[details.tabId] || {}),
        m3u8Url: details.url,
      };

      chrome.storage.session.set({ tabData });
    });
  },
  {
    urls: ["*://*.kick.com/*.m3u8*", "*://*.live-video.net/*.m3u8*"],
  },
  []
);

// ======================================================
// === LISTENER 2: Limpiar datos al Navegar (Sin cambios) ===
// ======================================================
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading") {
    console.log(`Tab ${tabId} está navegando. Limpiando sus datos de M3U8.`);
    chrome.storage.session.get(["tabData"], (res) => {
      const tabData = res.tabData || {};
      if (tabData[tabId]) {
        delete tabData[tabId].m3u8Url;
        chrome.storage.session.set({ tabData });
      }
    });
  }
});

// ======================================================
// === LISTENER 3: Limpiar datos al Cerrar Pestaña (Sin cambios) ===
// ======================================================
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  console.log(`Tab ${tabId} cerrada. Limpiando todos sus datos.`);
  chrome.storage.session.get(["tabData"], (res) => {
    const tabData = res.tabData || {};
    if (tabData[tabId]) {
      delete tabData[tabId];
      chrome.storage.session.set({ tabData });
    }
  });
});

// ======================================================
// === LISTENER 4: Escuchar órdenes (Sin cambios) ===
// ======================================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "downloadVODClip") {
    console.log("Orden de clipeo MANUAL recibida:", request);
    startDownloadProcess(
      request.m3u8Url,
      request.startTime,
      request.endTime,
      "manual"
    );
  }
  if (request.action === "downloadLast30s") {
    console.log("Orden de CLIP RÁPIDO (30s) recibida:", request);
    startDownloadProcess(request.m3u8Url, null, null, "last30s");
  }
  return true;
});

// --- EL RESTO DEL ARCHIVO (startDownloadProcess, parseM3U8, etc. - SIN CAMBIOS) ---

async function startDownloadProcess(m3u8Url, startTime, endTime, mode) {
  try {
    const segmentsToDownload = await parseM3U8(
      m3u8Url,
      startTime,
      endTime,
      mode
    );
    console.log(
      `[startDownloadProcess] Parseo finalizado. Se encontraron ${segmentsToDownload.length} segmentos.`
    );
    if (segmentsToDownload.length === 0) {
      console.error(
        "No se encontraron segmentos en el rango de tiempo. Revisa los logs de 'PARSE M3U8'."
      );
      return;
    }
    const segmentBuffers = await downloadSegments(segmentsToDownload);
    console.log("Todos los segmentos descargados.");
    const combinedBuffer = concatenateArrayBuffers(segmentBuffers);
    console.log("Segmentos unidos.");
    const blob = new Blob([combinedBuffer], { type: "video/mp2t" });
    const dataUrl = await blobToDataURL(blob);
    console.log(
      "Blob convertido a Data URL (tamaño: ",
      dataUrl.length,
      "bytes)"
    );
    const downloadId = await chrome.downloads.download({
      url: dataUrl,
      filename: `kick-clip-${Date.now()}.mpeg`,
    });
    console.log("Descarga iniciada, ID:", downloadId);
  } catch (error) {
    console.error("Error en el proceso de descarga:", error);
  }
}

async function parseM3U8(m3u8Url, clipStartTime, clipEndTime, mode) {
  console.log(`[PARSE M3U8] Iniciando análisis. Modo: ${mode}`);

  if (!m3u8Url) {
    console.error(
      "[PARSE M3U8] Error: m3u8Url es undefined. (Probablemente el M3U8 no se ha guardado aún)."
    );
    return [];
  }
  console.log(`[PARSE M3U8] Fetching M3U8 desde: ${m3u8Url}`);

  const response = await fetch(m3u8Url);
  const text = await response.text();

  if (text.includes("#EXT-X-STREAM-INF")) {
    console.error(
      "[PARSE M3U8] ¡ERROR CRÍTICO! Este archivo es un 'Master Playlist'."
    );
    return [];
  }

  const lines = text.split("\n");
  const allSegments = [];
  const baseUrl = m3u8Url.substring(0, m3u8Url.lastIndexOf("/") + 1);
  const isDVR = text.includes("#EXT-X-PROGRAM-DATE-TIME:");
  let currentSegmentTime = 0;
  let currentAbsoluteTime = null;
  let streamEpochStart = null;

  console.log(
    `[PARSE M3U8] Tipo de playlist detectado: ${
      isDVR ? "DVR (con Fechas)" : "VOD (Simple)"
    }`
  );

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (isDVR && line.startsWith("#EXT-X-PROGRAM-DATE-TIME:")) {
      const dateString = line.substring(line.indexOf(":") + 1);
      currentAbsoluteTime = new Date(dateString).getTime() / 1000;

      if (streamEpochStart === null) {
        streamEpochStart = currentAbsoluteTime;
        console.log(
          `[PARSE M3U8] Inicio de VOD (Epoch) detectado: ${streamEpochStart}`
        );
      }
    }

    if (line.startsWith("#EXTINF:")) {
      const duration = parseFloat(line.split(":")[1].split(",")[0]);
      if (isNaN(duration)) continue;

      const segmentUrlLine = lines[++i].trim();
      if (!segmentUrlLine || segmentUrlLine.startsWith("#")) {
        i--;
        continue;
      }

      const segmentUrl = segmentUrlLine.startsWith("http")
        ? segmentUrlLine
        : baseUrl + segmentUrlLine;

      let segmentStartTime;
      if (isDVR) {
        if (currentAbsoluteTime === null) continue;
        segmentStartTime = currentAbsoluteTime;
        currentAbsoluteTime += duration;
      } else {
        segmentStartTime = currentSegmentTime;
        currentSegmentTime += duration;
      }

      if (isNaN(segmentStartTime)) {
        console.warn(
          "[PARSE M3M8] Se detectó un segmentStartTime NaN. Saltando segmento."
        );
        continue;
      }

      allSegments.push({
        url: segmentUrl,
        startTime: segmentStartTime,
        duration: duration,
      });
    }
  }

  console.log(
    `[PARSE M3U8] Análisis completo. ${allSegments.length} segmentos totales encontrados.`
  );

  if (mode === "manual") {
    if (clipStartTime === undefined || clipEndTime === undefined) {
      console.error(
        "[PARSE M3C8] Error: clipStartTime o clipEndTime es undefined en modo 'manual'."
      );
      return [];
    }

    let filterStartTime = clipStartTime;
    let filterEndTime = clipEndTime;

    if (isDVR) {
      if (streamEpochStart === null) {
        console.error(
          "[PARSE M3U8] Es DVR pero no se encontró el Epoch Start. Abortando."
        );
        return [];
      }
      console.log("[PARSE M3U8] Traduciendo tiempos relativos a absolutos...");
      filterStartTime = streamEpochStart + clipStartTime;
      filterEndTime = streamEpochStart + clipEndTime;
    }

    console.log(
      `[PARSE M3U8] Filtrando por modo MANUAL: ${filterStartTime.toFixed(
        2
      )}s a ${filterEndTime.toFixed(2)}s`
    );

    return allSegments.filter((seg) => {
      const segEndTime = seg.startTime + seg.duration;
      return segEndTime > filterStartTime && seg.startTime < filterEndTime;
    });
  } else if (mode === "last30s") {
    console.log("[PARSE M3U8] Filtrando por modo CLIP RÁPIDO (últimos 30s)...");
    if (allSegments.length === 0) {
      console.error("[PARSE M3U8 - last30s] El array allSegments está vacío.");
      return [];
    }
    const lastSegment = allSegments[allSegments.length - 1];
    if (
      !lastSegment ||
      isNaN(lastSegment.startTime) ||
      isNaN(lastSegment.duration)
    ) {
      console.error(
        "[PARSE M3U8 - last30s] El último segmento tiene datos inválidos (NaN)."
      );
      return [];
    }
    const totalDuration = lastSegment.startTime + lastSegment.duration;
    const clipStartPoint = totalDuration - 30;
    console.log(
      `[PARSE M3U8 - last30s] StartTime del ÚLTIMO segmento: ${lastSegment.startTime.toFixed(
        2
      )}`
    );
    console.log(
      `[PARSE M3U8 - last30s] Fin total del VOD (calculado): ${totalDuration.toFixed(
        2
      )}`
    );
    console.log(
      `[PARSE M3U8 - last30s] Punto de inicio del clip (calculado): ${clipStartPoint.toFixed(
        2
      )}`
    );
    const segmentsToDownload = allSegments.filter((seg) => {
      const segEndTime = seg.startTime + seg.duration;
      return segEndTime > clipStartPoint && seg.startTime < totalDuration;
    });
    console.log(
      `[PARSE M3U8 - last30s] Segmentos encontrados por el filtro: ${segmentsToDownload.length}`
    );
    return segmentsToDownload;
  }

  console.error(
    `[PARSE M3U8] Error: Modo desconocido ('${mode}'). No se devolvieron segmentos.`
  );
  return [];
}

async function downloadSegments(segments) {
  const downloadPromises = segments.map((seg) =>
    fetch(seg.url).then((res) => res.arrayBuffer())
  );
  if (segments.length === 0) {
    return Promise.resolve([]);
  }
  return Promise.all(downloadPromises);
}

function concatenateArrayBuffers(buffers) {
  let totalLength = 0;
  for (const buffer of buffers) {
    totalLength += buffer.byteLength;
  }
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const buffer of buffers) {
    combined.set(new Uint8Array(buffer), offset);
    offset += buffer.byteLength;
  }
  return combined.buffer;
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.onabort = () => reject(new Error("Blob read was aborted"));
    reader.readAsDataURL(blob);
  });
}
