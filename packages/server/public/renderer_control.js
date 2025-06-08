document.addEventListener("DOMContentLoaded", () => {
  // DOM Elements
  const deviceNameEl = document.getElementById("device-name");
  const trackTitleEl = document.getElementById("track-title");
  const trackArtistEl = document.getElementById("track-artist");
  const trackAlbumEl = document.getElementById("track-album");
  const trackAlbumArtEl = document.getElementById("track-album-art");
  const progressBarEl = document.getElementById("progress-bar");
  const currentTimeEl = document.getElementById("current-time");
  const totalTimeEl = document.getElementById("total-time");
  const prevBtn = document.getElementById("prev-btn");
  const playPauseBtn = document.getElementById("play-pause-btn");
  const stopBtn = document.getElementById("stop-btn");
  const nextBtn = document.getElementById("next-btn");
  const muteBtn = document.getElementById("mute-btn");
  const volumeSliderEl = document.getElementById("volume-slider");

  // State
  let udn = "";
  let transportState = "STOPPED";
  let pollingInterval;

  const deviceInfo = {
    transportInfo: null,
    positionInfo: null,
    volumeInfo: null,
    muteInfo: null,
  };

  globalThis.deviceInfo = deviceInfo; // Make it globally accessible for debugging

  // --- Initialization ---
  function initialize() {
    const params = new URLSearchParams(window.location.search);
    udn = params.get("udn");
    if (!udn) {
      showError('לא נבחר התקן. יש להוסיף "?udn=UDN_OF_DEVICE" לכתובת.');
      return;
    }
    deviceNameEl.textContent = `מתחבר ל-${udn}...`;
    fetchDeviceDetails();
    setupEventListeners();
    startPolling();
  }

  // --- API Communication ---
  async function fetchDeviceDetails() {
    try {
      const response = await fetch("/api/devices");
      if (!response.ok) throw new Error("Failed to fetch devices");
      const devices = await response.json();
      const device = devices.find((d) => d.UDN === udn);
      if (device) {
        deviceNameEl.textContent = device.friendlyName || udn;
      } else {
        showError(`התקן עם UDN ${udn} לא נמצא.`);
      }
    } catch (error) {
      console.error("Error fetching device details:", error);
      showError("שגיאה באחזור פרטי ההתקן.");
    }
  }

  async function invokeAction(serviceId, actionName, args = {}) {
    try {
      const response = await fetch(
        `/api/devices/${udn}/action?actionMane=${actionName}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ serviceId, actionName, args }),
        }
      );
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "פעולה נכשלה");
      }
      return await response.json();
    } catch (error) {
      console.error(`Error invoking action ${actionName}:`, error);
      // אפשר להוסיף כאן התראה למשתמש
      return null;
    }
  }

  // --- UI Updates ---
  function showError(message) {
    deviceNameEl.textContent = message;
    deviceNameEl.style.color = "red";
    // Disable all controls
    [
      prevBtn,
      playPauseBtn,
      stopBtn,
      nextBtn,
      muteBtn,
      volumeSliderEl,
      progressBarEl,
    ].forEach((el) => (el.disabled = true));
  }

  function updateTransportState(newState) {
    transportState = newState;
    playPauseBtn.textContent = newState === "PLAYING" ? "⏸️" : "▶️";
  }

  function formatTime(timeStr) {
    if (!timeStr || timeStr === "NOT_IMPLEMENTED" || !timeStr.includes(":")) {
      return "00:00";
    }
    const parts = timeStr.split(":").map((p) => parseInt(p, 10));
    if (parts.length === 3) {
      return `${String(parts[0]).padStart(2, "0")}:${String(parts[1]).padStart(
        2,
        "0"
      )}:${String(parts[2]).padStart(2, "0")}`;
    }
    return "00:00";
  }

  function timeToSeconds(timeStr) {
    if (!timeStr || timeStr === "NOT_IMPLEMENTED" || !timeStr.includes(":"))
      return 0;
    const parts = timeStr.split(":").map((p) => parseInt(p, 10));
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return 0;
  }

  function updatePositionInfo(info) {
    const trackDuration = info?.TrackDuration || "0:00:00";
    const relTime = info?.RelTime || "0:00:00";
    const trackMetaData = info?.TrackMetaData;

    totalTimeEl.textContent = formatTime(trackDuration);
    currentTimeEl.textContent = formatTime(relTime);

    const durationSeconds = timeToSeconds(trackDuration);
    const currentSeconds = timeToSeconds(relTime);

    progressBarEl.max = durationSeconds;
    progressBarEl.value = currentSeconds;

    if (trackMetaData && trackMetaData !== "NOT_IMPLEMENTED" && trackMetaData.startsWith("<")) {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(trackMetaData, "text/xml");
      
      const item = xmlDoc.querySelector("item");
      if (item) {
        const title = item.querySelector("title")?.textContent || "מידע לא זמין";
        const artist = item.querySelector("artist")?.textContent;
        const album = item.querySelector("album")?.textContent;
        const albumArtURI = item.querySelector("albumArtURI")?.textContent;

        trackTitleEl.textContent = title;
        trackArtistEl.textContent = artist || "";
        trackAlbumEl.textContent = album || "";

        if (albumArtURI) {
          trackAlbumArtEl.src = albumArtURI;
          trackAlbumArtEl.style.display = "block";
        } else {
          trackAlbumArtEl.style.display = "none";
        }
      } else {
         // Fallback for simpler metadata
         const titleMatch = trackMetaData.match(/<dc:title>(.*?)<\/dc:title>/);
         trackTitleEl.textContent = titleMatch ? titleMatch[1] : "מידע לא זמין";
         trackArtistEl.textContent = "";
         trackAlbumEl.textContent = "";
         trackAlbumArtEl.style.display = "none";
      }
    } else {
      trackTitleEl.textContent = "לא מנגן כלום";
      trackArtistEl.textContent = "";
      trackAlbumEl.textContent = "";
      trackAlbumArtEl.style.display = "none";
    }
  }

  // --- Event Handlers ---
  function setupEventListeners() {
    playPauseBtn.addEventListener("click", () => {
      const action = transportState === "PLAYING" ? "Pause" : "Play";
      const args =
        action === "Play"
          ? { InstanceID: "0", Speed: "1" }
          : { InstanceID: "0" };
      invokeAction("AVTransport", action, args).then(pollOnce);
    });

    stopBtn.addEventListener("click", () => {
      invokeAction("AVTransport", "Stop", { InstanceID: "0" }).then(pollOnce);
    });

    nextBtn.addEventListener("click", () => {
      invokeAction("AVTransport", "Next", { InstanceID: "0" }).then(pollOnce);
    });

    prevBtn.addEventListener("click", () => {
      invokeAction("AVTransport", "Previous", { InstanceID: "0" }).then(
        pollOnce
      );
    });

    volumeSliderEl.addEventListener("input", () => {
      const volume = volumeSliderEl.value;
      invokeAction("RenderingControl", "SetVolume", {
        InstanceID: "0",
        Channel: "Master",
        DesiredVolume: volume,
      });
    });

    muteBtn.addEventListener("click", async () => {
      const response = await invokeAction("RenderingControl", "GetMute", {
        InstanceID: "0",
        Channel: "Master",
      });
      if (response && response.data) {
        const isMuted = response.data.CurrentMute === "1";
        await invokeAction("RenderingControl", "SetMute", {
          InstanceID: "0",
          Channel: "Master",
          DesiredMute: !isMuted,
        });
        pollOnce(); // Refresh mute state
      }
    });

    progressBarEl.addEventListener("input", () => {
      const targetSeconds = progressBarEl.value;
      const hours = Math.floor(targetSeconds / 3600);
      const minutes = Math.floor((targetSeconds % 3600) / 60);
      const seconds = targetSeconds % 60;
      const targetTime = `${String(hours).padStart(2, "0")}:${String(
        minutes
      ).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
      invokeAction("AVTransport", "Seek", {
        InstanceID: "0",
        Unit: "REL_TIME",
        Target: targetTime,
      });
    });
  }

  // --- Polling ---
  async function pollStatus() {
    // Get transport state
    const transportInfo = await invokeAction(
      "AVTransport",
      "GetTransportInfo",
      { InstanceID: "0" }
    );
    if (transportInfo && transportInfo.data) {
      updateTransportState(transportInfo.data.CurrentTransportState);
      deviceInfo.transportInfo = transportInfo.data;
    }

    // Get position info
    const positionInfo = await invokeAction("AVTransport", "GetPositionInfo", {
      InstanceID: "0",
    });
    if (positionInfo && positionInfo.data) {
      updatePositionInfo(positionInfo.data);
      deviceInfo.positionInfo = positionInfo.data;
    }

    // Get volume and mute state
    const volumeInfo = await invokeAction("RenderingControl", "GetVolume", {
      InstanceID: "0",
      Channel: "Master",
    });
    if (volumeInfo && volumeInfo.data) {
      volumeSliderEl.value = volumeInfo.data.CurrentVolume;
      deviceInfo.volumeInfo = volumeInfo.data;
    }

    const muteInfo = await invokeAction("RenderingControl", "GetMute", {
      InstanceID: "0",
      Channel: "Master",
    });
    if (muteInfo && muteInfo.data) {
      muteBtn.textContent = muteInfo.data.CurrentMute ? "🔇" : "🔊";
      muteBtn.title = muteInfo.data.CurrentMute ? "בטל השתקה" : "השתק";
      deviceInfo.muteInfo = muteInfo.data;
    }
  }

  function pollOnce() {
    setTimeout(pollStatus, 200); // Short delay to allow device to process action
  }

  function startPolling() {
    pollStatus(); // Initial poll
    pollingInterval = setInterval(pollStatus, 2000); // Poll every 2 seconds
  }

  // --- Start the app ---
  initialize();
});
