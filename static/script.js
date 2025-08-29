(function () {
  // DOM Elements
  const micBtn = document.getElementById("micBtn");
  const echoAudio = document.getElementById("echoAudio");
  const echoErrorBox = document.getElementById("echoErrorBox");
  const chatWindow = document.getElementById("chatWindow");
  const historyList = document.querySelector(".history-list");
  const newChatBtn = document.getElementById("newChatBtn");
  const voiceSelect = document.getElementById("voiceSelect");
  const historyItemTemplate = document.querySelector(".history-item");

  const fallbackAudioMessage =
    "I'm having trouble connecting right now. Please try again later!!!";
  const fallbackAudio = new Audio(
    "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YAAAAAAkAAAAAAAAAAAAAAAAAAAAAAAA"
  );

  let isRecording = false;
  let chatSessions = [];
  let currentSessionId;
  let websocket;
  let audioContext, processor, source;

  function uuidv4() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0,
        v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  async function loadVoices() {
    try {
      const response = await fetch("/static/voices.json");
      const voices = await response.json();
      voices.forEach((voice) => {
        const option = document.createElement("option");
        option.value = voice.id;
        option.textContent = `${voice.name} (${voice.language})`;
        voiceSelect.appendChild(option);
      });
      voiceSelect.value = "en-IN-isha";
    } catch (err) {
      echoErrorBox.innerText = "Currently under stress!!";
      echoErrorBox.style.display = "block";
    }
  }

  function addMessageToChat(text, sender) {
    const messageDiv = document.createElement("div");
    messageDiv.classList.add("chat-message", `${sender}-message`);
    let htmlText = text
      .replace(/```(.*?)```/gs, "<pre><code>$1</code></pre>")
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\n/g, "<br>");
    messageDiv.innerHTML = htmlText;
    chatWindow.appendChild(messageDiv);
    chatWindow.scrollTop = chatWindow.scrollHeight;
  }

  async function loadChatSession(sessionId) {
    currentSessionId = sessionId;
    window.history.pushState({}, "", `?session_id=${sessionId}`);
    document.querySelectorAll(".history-item").forEach((item) => {
      item.classList.toggle("active", item.dataset.sessionId === sessionId);
    });
    chatWindow.innerHTML =
      '<div class="status-message">Loading conversation...</div>';

    try {
      const res = await fetch(`/agent/chat/history/${sessionId}`);
      const json = await res.json();
      chatWindow.innerHTML = "";
      if (res.ok && json.history) {
        json.history.forEach((message) =>
          addMessageToChat(message.content, message.role)
        );
      } else {
        throw new Error("No history found.");
      }
    } catch (err) {
      chatWindow.innerHTML = `<div class="status-message error">Failed to load history: ${err.message}</div>`;
    }
  }

  function renderChatHistory() {
    historyItemTemplate.style.display = "none";
    historyList.innerHTML = "";
    if (chatSessions.length === 0) {
      historyList.innerHTML =
        '<div class="history-item">No past conversations</div>';
    } else {
      chatSessions.forEach((session) => {
        const clonedItem = historyItemTemplate.cloneNode(true);
        clonedItem.style.display = "flex";
        clonedItem.dataset.sessionId = session.id;
        clonedItem.querySelector(".history-title").textContent = session.title;
        clonedItem.classList.toggle("active", session.id === currentSessionId);
        clonedItem.querySelector(
          ".delete-chat-btn"
        ).dataset.sessionId = session.id;
        historyList.appendChild(clonedItem);
      });
    }
  }

  function deleteChatSession(sessionId) {
    if (sessionId === currentSessionId) {
      alert("Cannot delete the active conversation. Start a new one first.");
      return;
    }
    if (confirm("Are you sure you want to delete this conversation?")) {
      chatSessions = chatSessions.filter((session) => session.id !== sessionId);
      localStorage.setItem("chatSessions", JSON.stringify(chatSessions));
      renderChatHistory();
    }
  }

  historyList.addEventListener("click", (event) => {
    const deleteBtn = event.target.closest(".delete-chat-btn");
    const historyItem = event.target.closest(".history-item");
    if (deleteBtn) {
      const sessionId = deleteBtn.dataset.sessionId;
      deleteChatSession(sessionId);
      event.stopPropagation();
    } else if (historyItem) {
      const sessionId = historyItem.dataset.sessionId;
      loadChatSession(sessionId);
    }
  });

  function getOrCreateSessionId() {
    const urlParams = new URLSearchParams(window.location.search);
    let id = urlParams.get("session_id");
    const storedSessions =
      JSON.parse(localStorage.getItem("chatSessions")) || [];
    chatSessions = storedSessions;
    const placeholderIndex = chatSessions.findIndex((s) => s.id === "new");
    if (placeholderIndex > -1) chatSessions.splice(placeholderIndex, 1);
    if (!id || !chatSessions.some((session) => session.id === id)) {
      id = uuidv4();
      const newSession = { id: id, title: "New Conversation" };
      chatSessions.unshift(newSession);
      localStorage.setItem("chatSessions", JSON.stringify(chatSessions));
    }
    return id;
  }

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

  // --- Recording + WebSocket + Gemini + Murf ---
  async function handleRecording() {
    echoErrorBox.style.display = "none";
    micBtn.innerHTML = '<i class="fas fa-stop"></i>';
    micBtn.classList.add("recording");
    isRecording = true;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContext = new AudioContext({ sampleRate: 16000 });
      source = audioContext.createMediaStreamSource(stream);
      processor = audioContext.createScriptProcessor(4096, 1, 1);
      source.connect(processor);
      processor.connect(audioContext.destination);

      websocket = new WebSocket("ws://127.0.0.1:8000/ws");

      websocket.onopen = () => console.log("WebSocket connected.");

      websocket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "turn" && msg.end_of_turn && msg.transcript) {
            addMessageToChat(msg.transcript, "bot");
          } else if (msg.type === "error") {
            echoErrorBox.innerText = `Error: ${msg.message}`;
            echoErrorBox.style.display = "block";
          }
        } catch {
          console.log("Server message:", event.data);
        }
      };

      websocket.onclose = () => resetMicBtn();
      websocket.onerror = (err) => {
        echoErrorBox.innerText = `WebSocket failed: ${err.message}`;
        echoErrorBox.style.display = "block";
        resetMicBtn();
      };

      processor.onaudioprocess = (event) => {
        const inputData = event.inputBuffer.getChannelData(0);
        const pcm16 = floatTo16BitPCM(inputData);
        if (websocket.readyState === WebSocket.OPEN) websocket.send(pcm16);
      };
    } catch (err) {
      echoErrorBox.innerText = `Microphone access failed: ${err.message}`;
      echoErrorBox.style.display = "block";
      resetMicBtn();
    }
  }

  function resetMicBtn() {
    micBtn.innerHTML = '<i class="fas fa-microphone"></i>';
    micBtn.classList.remove("recording");
    isRecording = false;
    if (processor) processor.disconnect();
    if (source) source.disconnect();
    if (audioContext) audioContext.close();
    if (websocket && websocket.readyState === WebSocket.OPEN) websocket.close();
  }

  // --- Buttons ---
  newChatBtn.onclick = () => {
    const newId = uuidv4();
    chatSessions.unshift({ id: newId, title: "New Conversation" });
    localStorage.setItem("chatSessions", JSON.stringify(chatSessions));
    renderChatHistory();
    loadChatSession(newId);
  };

  micBtn.onclick = () => {
    if (isRecording) {
      if (websocket) {
        websocket.send("force_endpoint");
        websocket.send("close");
      }
      resetMicBtn();
    } else handleRecording();
  };

  // --- Init ---
  window.addEventListener("load", () => {
    loadVoices();
    currentSessionId = getOrCreateSessionId();
    renderChatHistory();
    if (currentSessionId) loadChatSession(currentSessionId);
  });
})();
