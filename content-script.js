console.log(
  "Kick Clipper [Content Script] cargado en la página. v0.3 (con debug)"
);

let videoElement = null; // ACA guardo el video
let lastReportedTime = 0;

// --- FUNCIÓN DE DEBUG --- //
setInterval(() => {
  videoElement = document.querySelector("#video-player");

  if (videoElement) {
    if (videoElement.currentTime !== lastReportedTime) {
      lastReportedTime = videoElement.currentTime;

      console.log(
        `[KICK CLIPPER DEBUG] video.currentTime: ${lastReportedTime}`
      );
    }
  } else {
    if (lastReportedTime !== -1) {
      console.log("[KICK CLIPPER DEBUG] Buscando #video-player...");
      lastReportedTime = -1;
    }
  }
}, 2000);

// --- Escucha mensajes/acciones que vengan del popup.js ---
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  // Si la orden es "getCurrentTime"
  if (request.action === "getCurrentTime") {
    if (videoElement && videoElement.currentTime) {
      const currentTime = videoElement.currentTime;
      sendResponse({ success: true, time: currentTime });
    } else {
      console.error(
        "[Content Script] No se pudo encontrar el elemento <video> con ID 'video-player'."
      );
      sendResponse({ success: false, error: "Video no encontrado" });
    }
  }

  return true;
});
