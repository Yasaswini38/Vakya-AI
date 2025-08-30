Markdown

# Vākya AI 🗣️

Vākya, which means "sentence" in Sanskrit, is a conversational AI that allows users to interact with a Large Language Model (LLM) using their voice. Speak. Understand. Reply.
That’s **Vākya** , a full loop of human-like conversation, built with **Python**, driven by **FastAPI**, and delivered in a crisp, modern UI.

***

### Features 

* **Voice-to-Voice Interaction**: Talk to the AI and hear it respond back in real time.  
* **Real-time Transcription**: See your speech transcribed instantly on screen.  
* **Conversational Memory**: Maintains context within a session for natural dialogue.  
* **Session Management**: Start new chats or revisit past conversations.  
* **Voice Customization**: Choose from multiple voices for responses.  
* **Fun Skills Built-in**: Weather updates, News headlines, Jokes on demand.  
* **Modern UI**: Cute & aesthetic responsive interface with chat history panel.

***

### Technologies Used 

* **FastAPI** — backend framework for REST + WebSocket support  
* **Jinja2** — template rendering for frontend  
* **AssemblyAI** — speech-to-text (transcription)  
* **Google Gemini** — LLM for text generation  
* **Murf.ai** — text-to-speech (streaming natural voices)  
* **python-dotenv** — for managing API keys securely  
* **HTML, CSS, JavaScript** — responsive UI (with chat history, persona selection)

***

### Architecture 

The application follows a simple client-server architecture:

1. User’s voice recorded via browser microphone  
2. Audio streamed to FastAPI backend over WebSocket  
3. AssemblyAI transcribes speech → text  
4. Transcribed text + history → Gemini (LLM) for response generation  
5. Response text → Murf.ai → natural voice audio stream  
6. Frontend shows transcription, AI’s reply, and plays back the audio  

***

### Getting Started

#### Prerequisites

* Python 3.8+
* `pip`
* API keys for **AssemblyAI**, **Google Gemini**, and **Murf.ai**.

#### Installation and Setup

1.  **Clone the repository**:
    ```sh
    git clone https://github.com/Yasaswini38/Vakya-AI
    cd  Vakya-AI
    ```

2.  **Install dependencies**:
    ```sh
    pip install -r requirements.txt
    ```

3.  **Set up environment variables**:
    Create a `.env` file in the root directory and add your API keys:
    ```sh
    MURF_API_KEY="YOUR_MURF_API_KEY"
    ASSEMBLYAI_API_KEY="YOUR_ASSEMBLYAI_API_KEY"
    GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
    NEWS_API_KEY="YOUR_NEWS_API_KEY"
    ```

4.  **Run the application**:
    ```sh
    uvicorn main:app --reload
    ```
    The server will run on `http://127.0.0.1:8000`.

***

### How to Run the API Server

Once the setup is complete, the `uvicorn main:app --reload` command will start the APP

#### Project Structure
```plaintext
├── main.py              # FastAPI backend
├── templates/
│   └── index.html       # Main UI
├── static/
│   ├── script.js        # Frontend JS
│   ├── style.css        # Styles
│   └── voices.json      # Voice list
├── uploads/             # Uploaded audio
├── .env                 # API keys
└── README.md
