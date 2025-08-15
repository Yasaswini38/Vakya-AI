Markdown

# Vākya AI 🗣️

Vākya, which means "sentence" in Sanskrit, is a conversational AI that allows users to interact with a Large Language Model (LLM) using their voice. Speak. Understand. Reply.
That’s **Vākya** , a full loop of human-like conversation, built with **Python**, driven by **FastAPI**, and delivered in a crisp, modern UI.

***

### Features 

* **Voice-to-Voice Interaction**: Talk to the AI and hear its response back.
* **Real-time Transcription**: See your speech transcribed into text.
* **Conversational Memory**: The AI maintains context throughout the conversation.
* **Session Management**: Start new chats or revisit old ones.
* **Voice Customization**: Select from a variety of voices for the AI's responses.
* **Modern UI**: A responsive, clean user interface with a chat history panel.

***

### Technologies Used 

* **FastAPI**: A modern, high-performance web framework for the backend.
* **Jinja2**: For rendering HTML templates.
* **AssemblyAI**: Handles the **speech-to-text** (transcription) of user audio.
* **Google Gemini**: The **Large Language Model** that processes the user's query and generates a text response.
* **Murf.ai**: The **text-to-speech** (TTS) engine that converts the AI's response into natural-sounding audio.
* **`python-dotenv`**: Manages environment variables for API keys.
* **HTML, CSS, JavaScript**: For the frontend user interface.

***

### Architecture 

The application follows a simple client-server architecture:

1.  The user's microphone records their voice input.
2.  The audio is sent to the FastAPI backend.
3.  FastAPI uses the **AssemblyAI** API to transcribe the audio into text.
4.  The transcribed text, along with the conversation history, is sent to the **Google Gemini** API.
5.  Gemini generates a text response.
6.  The text response is sent to the **Murf.ai** API, which generates an audio file.
7.  The URL for the audio file is returned to the frontend.
8.  The frontend displays the transcribed user message, the AI's text response, and plays the generated audio.

***

### Getting Started

#### Prerequisites

* Python 3.8+
* `pip`
* API keys for **AssemblyAI**, **Google Gemini**, and **Murf.ai**.

#### Installation and Setup

1.  **Clone the repository**:
    ```sh
    git clone [[Vakya_AI]](https://github.com/Yasaswini38/Vakya-AI)
    cd [Vakya-AI]https://github.com/Yasaswini38/Vakya-AI
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
