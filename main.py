from fastapi import FastAPI, Request, File, UploadFile, Form, HTTPException
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import requests
from dotenv import load_dotenv
import os
from murf import Murf
import assemblyai as aai
import google.generativeai as genai
from typing import Dict, List, Any
import uuid

#env vars
load_dotenv()
MURF_API_KEY = os.getenv("MURF_API_KEY")
aai.settings.api_key = os.getenv("ASSEMBLYAI_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

#apis
client = Murf(api_key=MURF_API_KEY)
genai.configure(api_key=GEMINI_API_KEY)
GEMINI_MODEL = "gemini-1.5-flash-002"
app = FastAPI()

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

#folders
os.makedirs("uploads", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# In-memory datastore for chat history
chat_history_datastore: Dict[str, List[Dict[str, str]]] = {}


# Routes
@app.get("/")
async def home(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/check-fastapi")
async def check_fastapi():
    return JSONResponse(content={"status": "FastAPI backend is working!"})

@app.get("/agent/chat/history/{session_id}")
async def get_chat_history(session_id: str):
    history = chat_history_datastore.get(session_id, [])
    user_visible_history = [
        {"role": msg["role"], "content": msg["content"]}
        for msg in history if msg["role"] != "system"
    ]
    return JSONResponse(content={"history": user_visible_history})


@app.post("/agent/chat/{session_id}")
async def agent_chat(
    session_id: str,
    file: UploadFile = File(...),
    voice_id: str = Form("en-IN-isha")
):
    try:
        audio_bytes = await file.read()

        # 1) Transcribe user's audio
        transcriber = aai.Transcriber()
        transcript_obj = transcriber.transcribe(audio_bytes)
        transcript_text = getattr(transcript_obj, "text", None)
        if not transcript_text:
            raise HTTPException(status_code=400, detail="Transcription failed or empty.")

        # 2) Manage Chat History
        if session_id not in chat_history_datastore:
            chat_history_datastore[session_id] = [
                {"role": "system", "content": "You are an assistant. Keep your responses concise and helpful. Be friendly but direct."}
            ]
        
        chat_history_datastore[session_id].append({"role": "user", "content": transcript_text})

        gemini_history = [
            {"role": "user" if msg["role"] == "user" else "model", "parts": [{"text": msg["content"]}]}
            for msg in chat_history_datastore[session_id]
        ]
        
        # 3) LLM (Gemini) with full chat history
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
        params = {"key": GEMINI_API_KEY}
        headers = {"Content-Type": "application/json"}
        body = {
            "contents": gemini_history
        }

        r = requests.post(url, headers=headers, params=params, json=body, timeout=60)
        r.raise_for_status()
        gemini_json = r.json()
        llm_response_text = gemini_json["candidates"][0]["content"]["parts"][0]["text"]

        # 4) Add LLM's response to history
        chat_history_datastore[session_id].append({"role": "model", "content": llm_response_text})

        # 5) Murf TTS
        murf_resp = client.text_to_speech.generate(
            text=llm_response_text,
            voice_id=voice_id
        )
        audio_url = getattr(murf_resp, "audio_file", None) or murf_resp.get("audio_file")
        if not audio_url:
            raise HTTPException(status_code=500, detail="Murf TTS failed to generate audio URL.")

        return {
            "transcript": transcript_text,
            "llm_response": llm_response_text,
            "audio_url": audio_url
        }

    except Exception as e:
        if session_id in chat_history_datastore:
             del chat_history_datastore[session_id]
        raise HTTPException(status_code=500, detail=str(e))
