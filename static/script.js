(function() {
  // DOM Elements 
  const micBtn = document.getElementById("micBtn");
  const echoAudio = document.getElementById("echoAudio");
  const echoErrorBox = document.getElementById("echoErrorBox");
  const chatWindow = document.getElementById("chatWindow");
  const historyList = document.querySelector('.history-list');
  const newChatBtn = document.getElementById("newChatBtn");
  const voiceSelect = document.getElementById("voiceSelect");
  const historyItemTemplate = document.querySelector('.history-item');

  const fallbackAudioMessage = "I'm having trouble connecting right now. Please try again later!!!";
  const fallbackAudio = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YAAAAAAkAAAAAAAAAAAAAAAAAAAAAAAA');

  //Variables 
  let mediaRecorder;
  let audioChunks = [];
  let isRecording = false;
  let chatSessions = [];
  let currentSessionId;

  // Utility Functions 
  /**
   * @returns {string} The new session ID.
   */
  function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

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
      voiceSelect.value = "en-IN-isha";
    } catch (err) {
      echoErrorBox.innerText = "Currently under stress!!";
      echoErrorBox.style.display = "block";
    }
  }
  /**
   * @param {string} text - The message content.
   * @param {string} sender - The sender ('user' or 'bot').
   */
  function addMessageToChat(text, sender) {
    const messageDiv = document.createElement("div");
    messageDiv.classList.add("chat-message", `${sender}-message`);
    
    let htmlText = text
      .replace(/```(.*?)```/gs, '<pre><code>$1</code></pre>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');

    messageDiv.innerHTML = htmlText;
    chatWindow.appendChild(messageDiv);
    chatWindow.scrollTop = chatWindow.scrollHeight;
  }

  /**
   * @param {string} sessionId - The ID of the session(history) to load.
   */
  async function loadChatSession(sessionId) {
    currentSessionId = sessionId;
    window.history.pushState({}, '', `?session_id=${sessionId}`);
    
    document.querySelectorAll('.history-item').forEach(item => {
      item.classList.toggle('active', item.dataset.sessionId === sessionId);
    });

    chatWindow.innerHTML = '<div class="status-message">Loading conversation...</div>';
    
    try {
      const res = await fetch(`/agent/chat/history/${sessionId}`);
      const json = await res.json();
      
      chatWindow.innerHTML = '';
      if (res.ok && json.history) {
        json.history.forEach(message => addMessageToChat(message.content, message.role));
      } else {
        throw new Error("You one lucky fella,,There is No History!!.");
      }
    } catch (err) {
      chatWindow.innerHTML = `<div class="status-message error">No Luck,,Failed to load history: ${err.message}</div>`;
    }
  }

  function renderChatHistory() {
    historyItemTemplate.style.display = 'none';
    historyList.innerHTML = '';
    
    if (chatSessions.length === 0) {
      historyList.innerHTML = '<div class="history-item">No past conversations</div>';
    } else {
      chatSessions.forEach(session => {
        const clonedItem = historyItemTemplate.cloneNode(true);
        clonedItem.style.display = 'flex'; 
        clonedItem.dataset.sessionId = session.id;
        clonedItem.querySelector('.history-title').textContent = session.title;
        clonedItem.classList.toggle('active', session.id === currentSessionId);
        
        clonedItem.querySelector('.delete-chat-btn').dataset.sessionId = session.id;
        
        historyList.appendChild(clonedItem);
      });
    }
  }

  /**
   * @param {string} sessionId - The ID of the session to delete.
   */
  function deleteChatSession(sessionId) {
    if (sessionId === currentSessionId) {
        alert("Cannot delete the active conversation. Start a new one first.");
        return;
    }

    const confirmDelete = confirm("Are you sure you want to delete this conversation?");
    if (confirmDelete) {
        chatSessions = chatSessions.filter(session => session.id !== sessionId);
        localStorage.setItem('chatSessions', JSON.stringify(chatSessions));
        renderChatHistory();
    }
  }

  historyList.addEventListener('click', (event) => {
    const deleteBtn = event.target.closest('.delete-chat-btn');
    const historyItem = event.target.closest('.history-item');

    if (deleteBtn) {
      const sessionId = deleteBtn.dataset.sessionId;
      deleteChatSession(sessionId);
      event.stopPropagation();
    } else if (historyItem) {
      const sessionId = historyItem.dataset.sessionId;
      loadChatSession(sessionId);
    }
  });


  /**
   * @returns {string} The session ID.
   */
  function getOrCreateSessionId() {
    const urlParams = new URLSearchParams(window.location.search);
    let id = urlParams.get('session_id');

    const storedSessions = JSON.parse(localStorage.getItem('chatSessions')) || [];
    chatSessions = storedSessions;

    const placeholderIndex = chatSessions.findIndex(s => s.id === 'new');
    if (placeholderIndex > -1) {
      chatSessions.splice(placeholderIndex, 1);
    }

    if (!id || !chatSessions.some(session => session.id === id)) {
      id = uuidv4();
      const newSession = { id: id, title: 'New Conversation' };
      chatSessions.unshift(newSession);
      localStorage.setItem('chatSessions', JSON.stringify(chatSessions));
    }
    return id;
  }

  async function handleRecording() {
    echoErrorBox.style.display = "none";
    micBtn.innerHTML = '<i class="fas fa-stop"></i>';
    micBtn.classList.add('recording');
    isRecording = true;
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];

      mediaRecorder.ondataavailable = event => audioChunks.push(event.data);
      mediaRecorder.onstop = processRecording;
      mediaRecorder.start();
    } catch (err) {
      echoErrorBox.innerText = `Microphone access failed: ${err.message}`;
      echoErrorBox.style.display = "block";
      resetMicBtn();
    }
  }

  function resetMicBtn() {
    micBtn.innerHTML = '<i class="fas fa-microphone"></i>';
    micBtn.classList.remove('recording');
    isRecording = false;
  }

  async function processRecording() {
    resetMicBtn();
    
    const thinkingMessage = document.createElement("div");
    thinkingMessage.classList.add("status-message");
    thinkingMessage.innerHTML = 'Thinking...';
    chatWindow.appendChild(thinkingMessage);
    chatWindow.scrollTop = chatWindow.scrollHeight;

    try {
      const blob = new Blob(audioChunks, { type: "audio/webm" });
      const fd = new FormData();
      fd.append("file", blob, "recording.webm");
      fd.append("voice_id", voiceSelect.value || "en-IN-isha");

      const res = await fetch(`/agent/chat/${currentSessionId}`, { method: "POST", body: fd });
      const json = await res.json();
      thinkingMessage.remove();
      
      if (!res.ok) {
        const errorMessage = json.detail || `API request failed with status ${res.status}`;
        throw new Error(errorMessage);
      }

      addMessageToChat(json.transcript, "user");
      addMessageToChat(json.llm_response, "bot");

      if (json.audio_url) {
        echoAudio.src = json.audio_url;
        echoAudio.play();
      }

      const currentSession = chatSessions.find(s => s.id === currentSessionId);
      if (currentSession && currentSession.title === 'New Conversation' && json.transcript) {
        currentSession.title = json.transcript.substring(0, 20) + '...';
        localStorage.setItem('chatSessions', JSON.stringify(chatSessions));
        renderChatHistory();
      }
    } catch (err) {
      thinkingMessage.remove();
      echoErrorBox.innerText = `Request failed: ${err.message}`;
      echoErrorBox.style.display = "block";
      addMessageToChat(fallbackAudioMessage, "bot");
      fallbackAudio.play();
    }
  }

  newChatBtn.onclick = () => {
    const newId = uuidv4();
    chatSessions.unshift({ id: newId, title: 'New Conversation' });
    localStorage.setItem('chatSessions', JSON.stringify(chatSessions));
    renderChatHistory();
    loadChatSession(newId);
  };

  micBtn.onclick = () => {
    if (isRecording) {
      mediaRecorder.stop();
    } else {
      handleRecording();
    }
  };

  window.addEventListener('load', () => {
    loadVoices();
    currentSessionId = getOrCreateSessionId();
    renderChatHistory();
    if (currentSessionId) {
      loadChatSession(currentSessionId);
    }
  });

})();