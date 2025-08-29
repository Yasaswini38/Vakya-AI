document.addEventListener("DOMContentLoaded", () => {
  /************************************************************
   * 🔧 State
   ************************************************************/
  let captureCtx = null;
  let captureSource = null;
  let captureProcessor = null;

  let playbackCtx = null;
  let playheadTime = 0;
  let decodeQueue = Promise.resolve();

  let isRecording = false;
  let socket = null;

  let chatSessions = [];
  let currentSessionId;

  let selectedPersona = "friendly";
  let selectedVoice = "en-IN-isha";

  /************************************************************
   * 🎛️ DOM Elements
   ************************************************************/
  const micBtn = document.getElementById("micBtn");
  const voiceSelect = document.getElementById("voiceSelect");
  const personaSelect = document.getElementById("personaSelect");
  const echoErrorBox = document.getElementById("echoErrorBox");
  const chatWindow = document.getElementById("chatWindow");
  const historyList = document.querySelector(".history-list");
  const newChatBtn = document.getElementById("newChatBtn");
  const historyItemTemplate = document.querySelector(".history-item");

  /************************************************************
   * 🛠️ Helpers
   ************************************************************/
  let userApiKeys = { gemini: null, murf: null, assembly: null, news: null };

document.getElementById("openConfigBtn").onclick = () => {
  const configContainer = document.getElementById("configContainer");
  configContainer.style.display =
    configContainer.style.display === "none" ? "block" : "none";
};

document.getElementById("saveKeysBtn").onclick = () => {
  userApiKeys.gemini = document.getElementById("geminiKeyInput").value.trim() || null;
  userApiKeys.murf = document.getElementById("murfKeyInput").value.trim() || null;
  userApiKeys.assembly = document.getElementById("assemblyKeyInput").value.trim() || null;
  userApiKeys.news = document.getElementById("newsKeyInput").value.trim() || null;
  alert("✅ API Keys saved for this session.");
};

  function floatTo16BitPCM(float32Array) {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view = new DataView(buffer);
    let offset = 0;
    for (let i = 0; i < float32Array.length; i++, offset += 2) {
      let s = Math.max(-1, Math.min(1, float32Array[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return buffer;
  }

  function uuidv4() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0,
        v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /************************************************************
   * 🔊 Proper MP3 decode & scheduled playback
   ************************************************************/
  function base64ToArrayBuffer(b64) {
    const base64 = b64.includes(",") ? b64.split(",").pop() : b64;
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  async function decodeAndScheduleMp3(arrayBuffer) {
    if (!playbackCtx) {
      playbackCtx = new (window.AudioContext || window.webkitAudioContext)();
      playheadTime = playbackCtx.currentTime;
    }
    if (playbackCtx.state === "suspended") await playbackCtx.resume();

    try {
      const audioBuffer = await playbackCtx.decodeAudioData(arrayBuffer);
      const src = playbackCtx.createBufferSource();
      src.buffer = audioBuffer;
      src.connect(playbackCtx.destination);

      const now = playbackCtx.currentTime;
      if (playheadTime < now + 0.05) playheadTime = now + 0.05;
      src.start(playheadTime);
      playheadTime += audioBuffer.duration;
    } catch (err) {
      console.error("MP3 decode error:", err);
    }
  }

  function playAudioMp3Chunk(base64Mp3) {
    const ab = base64ToArrayBuffer(base64Mp3);
    decodeQueue = decodeQueue.then(() => decodeAndScheduleMp3(ab)).catch(err => {
      console.error("Queue decode error, continuing:", err);
    });
  }

  /************************************************************
   * 📜 Voices
   ************************************************************/
  async function loadVoices() {
    try {
      const response = await fetch("/static/voices.json");
      const voices = await response.json();
      voices.forEach(voice => {
        const option = document.createElement("option");
        option.value = voice.id;
        option.textContent = `${voice.name} (${voice.language})`;
        voiceSelect.appendChild(option);
      });
      voiceSelect.value = selectedVoice;
    } catch (err) {
      echoErrorBox.innerText = "Failed to load voices.";
      echoErrorBox.style.display = "block";
    }
  }

  /************************************************************
   * 🔑 API Keys Config (NEW)
   ************************************************************/
  document.getElementById("saveKeysBtn").addEventListener("click", () => {
    const geminiKey = document.getElementById("geminiKeyInput").value.trim();
    const murfKey = document.getElementById("murfKeyInput").value.trim();
    const assemblyKey = document.getElementById("assemblyKeyInput").value.trim();
    const newsKey = document.getElementById("newsKeyInput").value.trim();

    const keys = { geminiKey, murfKey, assemblyKey, newsKey };
    localStorage.setItem("apiKeys", JSON.stringify(keys));
    alert("✅ API Keys saved! They will be used for new sessions.");
  });
  document.getElementById("closeConfigBtn").addEventListener("click", () => {
  document.getElementById("configContainer").style.display = "none";
});
  document.getElementById("openConfigBtn").addEventListener("click", () => {
  const config = document.getElementById("configContainer");
  config.style.display = "block"; // 🔹 always open

  // Load saved keys back into inputs
  const saved = JSON.parse(localStorage.getItem("apiKeys") || "{}");
  if (saved.geminiKey) document.getElementById("geminiKeyInput").value = saved.geminiKey;
  if (saved.murfKey) document.getElementById("murfKeyInput").value = saved.murfKey;
  if (saved.assemblyKey) document.getElementById("assemblyKeyInput").value = saved.assemblyKey;
  if (saved.newsKey) document.getElementById("newsKeyInput").value = saved.newsKey;
});


  function connectWebSocket(persona = "friendly") {
    const saved = JSON.parse(localStorage.getItem("apiKeys") || "{}");

    const query = new URLSearchParams({
      persona,
      gemini: saved.geminiKey || "",
      murf: saved.murfKey || "",
      assembly: saved.assemblyKey || "",
      news: saved.newsKey || ""
    });

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return new WebSocket(`${protocol}//${window.location.host}/ws?${query.toString()}`);

  }
  /************************************************************
   * 🗂️ Chat History
   ************************************************************/
  function addMessageToChat(text, sender) {
    const welcomeMsg = document.getElementById("welcome-msg");
    if (welcomeMsg) welcomeMsg.remove();

    const messageDiv = document.createElement("div");
    messageDiv.classList.add("chat-message", `${sender}-message`);
    messageDiv.innerHTML = text
      .replace(/```(.*?)```/gs, "<pre><code>$1</code></pre>")
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\n/g, "<br>");

    chatWindow.appendChild(messageDiv);
    chatWindow.scrollTop = chatWindow.scrollHeight;

    const session = chatSessions.find(s => s.id === currentSessionId);
    if (session) {
      if (!session.messages) session.messages = [];
      session.messages.push({ sender, text, timestamp: Date.now() });

      if (sender === "user" && (session.title === "New Conversation" || !session.titleSet)) {
        session.title = text.slice(0, 30) + (text.length > 30 ? "..." : "");
        session.titleSet = true;
      }
      localStorage.setItem("chatSessions", JSON.stringify(chatSessions));
      renderChatHistory();
    }
  }

  function renderChatHistory() {
    historyItemTemplate.style.display = "none";
    historyList.innerHTML = "";
    if (chatSessions.length === 0) {
      historyList.innerHTML = '<div class="history-item">No past conversations</div>';
    } else {
      chatSessions.forEach(session => {
        const cloned = historyItemTemplate.cloneNode(true);
        cloned.style.display = "flex";
        cloned.dataset.sessionId = session.id;
        cloned.querySelector(".history-title").textContent = session.title;
        cloned.classList.toggle("active", session.id === currentSessionId);
        cloned.querySelector(".delete-chat-btn").dataset.sessionId = session.id;
        historyList.appendChild(cloned);
      });
    }
  }

  function loadChatSession(sessionId) {
    currentSessionId = sessionId;
    window.history.pushState({}, "", `?session_id=${sessionId}`);
    document.querySelectorAll(".history-item").forEach(item => {
      item.classList.toggle("active", item.dataset.sessionId === sessionId);
    });
    chatWindow.innerHTML = "";

    const session = chatSessions.find(s => s.id === sessionId);
    if (session && session.messages && session.messages.length) {
      session.messages.forEach(msg => addMessageToChat(msg.text, msg.sender));
    } else {
      const welcomeMsg = document.createElement("div");
      welcomeMsg.id = "welcome-msg";
      welcomeMsg.innerText = "Welcome to Vākya — ask me anything";
      welcomeMsg.style.display = "flex";
      welcomeMsg.style.justifyContent = "center";
      welcomeMsg.style.alignItems = "center";
      welcomeMsg.style.height = "60vh";
      welcomeMsg.style.color = "gray";
      welcomeMsg.style.fontStyle = "italic";
      welcomeMsg.style.fontSize = "18px";
      chatWindow.appendChild(welcomeMsg);
    }
  }

  function getOrCreateSessionId() {
    const urlParams = new URLSearchParams(window.location.search);
    let id = urlParams.get("session_id");
    const stored = JSON.parse(localStorage.getItem("chatSessions")) || [];
    chatSessions = stored;

    if (!id || !chatSessions.some(s => s.id === id)) {
      id = uuidv4();
      const newSession = { id, title: "New Conversation", messages: [] };
      chatSessions.unshift(newSession);
      localStorage.setItem("chatSessions", JSON.stringify(chatSessions));
    }
    return id;
  }

  /************************************************************
   * 🎛️ Voice & Persona Handlers
   ************************************************************/
  voiceSelect.addEventListener("change", () => {
    selectedVoice = voiceSelect.value;
    console.log("Voice changed to:", selectedVoice);
    // Stop recording to apply new voice setting on next start
    stopRecording();
  });

  personaSelect.addEventListener("change", () => {
    selectedPersona = personaSelect.value;
    console.log("Persona changed to:", selectedPersona);
    // Stop recording to apply new persona setting on next start
    stopRecording();
  });

  /************************************************************
   * 🎙️ Recording + WebSocket
   ************************************************************/
  async function startRecording() {
    if (isRecording) return;

    echoErrorBox.style.display = "none";
    // Connect with updated persona and voice
    socket = new WebSocket(`ws://127.0.0.1:8000/ws?persona=${selectedPersona}&voice=${selectedVoice}`);

    socket.onopen = () => {
      console.log("WebSocket connected");
      // The persona and voice are already in the URL, no need to send config message
    };

    socket.onclose = () => resetMicBtn();
    socket.onerror = err => {
      echoErrorBox.innerText = `WebSocket error: ${err.message || err}`;
      echoErrorBox.style.display = "block";
      // Ensure state is reset on error
      resetMicBtn();
    };

    socket.onmessage = event => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "transcription") addMessageToChat(msg.text, "user");
        else if (msg.type === "llm_chunk") addMessageToChat(msg.data, "ai");
        else if (msg.type === "audio") playAudioMp3Chunk(msg.data);
      } catch (err) {
        console.error("Bad WS message", err, event.data);
      }
    };

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    captureCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    captureSource = captureCtx.createMediaStreamSource(stream);
    captureProcessor = captureCtx.createScriptProcessor(4096, 1, 1);

    captureSource.connect(captureProcessor);
    captureProcessor.connect(captureCtx.destination);

    captureProcessor.onaudioprocess = e => {
      const inputData = e.inputBuffer.getChannelData(0);
      const pcm16 = floatTo16BitPCM(inputData);
      if (socket && socket.readyState === WebSocket.OPEN) socket.send(pcm16);
    };

    isRecording = true;
    micBtn.innerHTML = '<i class="fas fa-stop"></i>';
    micBtn.classList.add("recording");
  }

  function stopRecording() {
    if (!isRecording) return;

    if (captureProcessor) {
      captureProcessor.disconnect();
      captureProcessor.onaudioprocess = null;
    }
    if (captureSource) captureSource.disconnect();
    if (captureCtx) captureCtx.close();
    if (socket && socket.readyState === WebSocket.OPEN) socket.close();

    resetMicBtn();
  }

  function resetMicBtn() {
    micBtn.innerHTML = '<i class="fas fa-microphone"></i>';
    micBtn.classList.remove("recording");
    isRecording = false;
  }

  /************************************************************
   * 🎛️ Buttons & Events
   ************************************************************/
  newChatBtn.onclick = () => {
    const newId = uuidv4();
    chatSessions.unshift({ id: newId, title: "New Conversation", messages: [] });
    localStorage.setItem("chatSessions", JSON.stringify(chatSessions));
    renderChatHistory();
    loadChatSession(newId);
  };

  historyList.addEventListener("click", event => {
    const deleteBtn = event.target.closest(".delete-chat-btn");
    const historyItem = event.target.closest(".history-item");
    if (deleteBtn) {
      const sessionId = deleteBtn.dataset.sessionId;
      if (sessionId === currentSessionId) return alert("Cannot delete active conversation.");
      chatSessions = chatSessions.filter(s => s.id !== sessionId);
      localStorage.setItem("chatSessions", JSON.stringify(chatSessions));
      renderChatHistory();
    } else if (historyItem) {
      const sessionId = historyItem.dataset.sessionId;
      loadChatSession(sessionId);
    }
  });

  micBtn.onclick = () => {
    // Force a reset if the state is out of sync before starting a new recording
    if (!isRecording && socket && socket.readyState !== WebSocket.CLOSED) {
      console.warn("Forcing a reset due to stale WebSocket connection.");
      stopRecording();
    }
    isRecording ? stopRecording() : startRecording();
  };

  window.addEventListener("beforeunload", () => {
    if (isRecording) stopRecording();
  });

  /************************************************************
   * 🚀 Init
   ************************************************************/
  (function init() {
    loadVoices();
    currentSessionId = getOrCreateSessionId();
    renderChatHistory();
    if (currentSessionId) loadChatSession(currentSessionId);
  })();
});