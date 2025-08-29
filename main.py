import os
from dotenv import load_dotenv
import logging
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pathlib import Path as PathLib
import json
import asyncio
import config
from typing import Type, List, Dict
import websockets
from datetime import datetime
import re
import requests 
import random
import string
import assemblyai as aai
import pycountry
from assemblyai.streaming.v3 import (
    BeginEvent,
    StreamingClient,
    StreamingClientOptions,
    StreamingError,
    StreamingEvents,
    StreamingParameters,
    TerminationEvent,
    TurnEvent,
)
import google.generativeai as genai
from pydantic import BaseModel

# ------------------------------------------------------------------
# Logging & App setup
# ------------------------------------------------------------------
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
app = FastAPI()
BASE_DIR = PathLib(__file__).resolve().parent
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# ------------------------------------------------------------------
# Load .env
# ------------------------------------------------------------------
load_dotenv()

# ------------------------------------------------------------------
# Gemini Model Setup
# ------------------------------------------------------------------
if config.GEMINI_API_KEY:
    genai.configure(api_key=config.GEMINI_API_KEY)
    gemini_model = genai.GenerativeModel("gemini-1.5-flash")
else:
    gemini_model = None
    logging.warning("Gemini model not initialized. GEMINI_API_KEY is missing.")

# ------------------------------------------------------------------
# Weather Skill (Current + 3 Day Forecast)
# ------------------------------------------------------------------
def get_weather(city: str):
    """Fetch current weather and 3-day forecast for a city using Open-Meteo API."""
    try:
        city = city.strip().strip(string.punctuation).title()
        geo_url = f"https://geocoding-api.open-meteo.com/v1/search?name={city}&count=1"
        geo_res = requests.get(geo_url).json()
        if "results" not in geo_res:
            return f"Sorry, I couldn’t find weather for {city}."

        lat, lon = geo_res["results"][0]["latitude"], geo_res["results"][0]["longitude"]

        weather_url = (
            f"https://api.open-meteo.com/v1/forecast"
            f"?latitude={lat}&longitude={lon}&current_weather=true"
            f"&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&forecast_days=3&timezone=auto"
        )
        weather_res = requests.get(weather_url).json()

        current = weather_res.get("current_weather", {})
        temp, wind = current.get("temperature"), current.get("windspeed")
        weather_text = f"Currently in {city}: {temp}°C with wind speed {wind} km/h.\n"

        daily = weather_res.get("daily", {})
        dates = daily.get("time", [])
        max_temps = daily.get("temperature_2m_max", [])
        min_temps = daily.get("temperature_2m_min", [])
        rain = daily.get("precipitation_sum", [])

        forecast_texts = []
        for i in range(min(3, len(dates))):
            forecast_texts.append(
                f"{dates[i]}: {min_temps[i]}°C - {max_temps[i]}°C, rain {rain[i]}mm"
            )

        weather_text += "Next 3 days:\n" + "\n".join(forecast_texts)
        return weather_text
    except Exception as e:
        return f"Could not fetch weather for {city}. Error: {str(e)}"


# ------------------------------------------------------------------
# Intent & City Extraction
# ------------------------------------------------------------------
def is_weather_intent(text: str) -> bool:
    return bool(
        re.search(r"\b(weather|forecast|temperature)\b", text, re.IGNORECASE)
    ) or bool(re.match(r"^\s*(in|at)\s+\w+", text, re.IGNORECASE))


def extract_city(text: str) -> str:
    text = text.strip()
    lowered = text.lower()

    m = re.search(r"\b(?:in|at)\s+([a-zA-Z .'-]+)$", lowered, re.IGNORECASE)
    if m:
        return m.group(1).strip().title()

    cleaned = re.sub(
        r"\b(weather|forecast|temperature|temp|what's|whats|the|please|tell me|about)\b",
        "",
        lowered,
        flags=re.IGNORECASE,
    ).strip()

    tokens = cleaned.split()
    if tokens:
        return tokens[-1].title()
    return ""

# ------------------------------------------------------------------
# News & Jokes Skills
# ------------------------------------------------------------------
def extract_country_code(user_message: str) -> str:
    """
    Detect a country name in the user's message and return its ISO 3166-1 alpha-2 code.
    Example: "India" -> "in", "United States" -> "us"
    """
    for country in pycountry.countries:
        if country.name.lower() in user_message.lower():
            return country.alpha_2.lower()
        if hasattr(country, "official_name") and country.official_name.lower() in user_message.lower():
            return country.alpha_2.lower()
    # Special cases / abbreviations
    common_aliases = {"usa": "us", "uk": "gb", "uae": "ae"}
    for alias, code in common_aliases.items():
        if alias in user_message.lower():
            return code
    return None

def is_news_intent(text: str) -> bool:
    return any(word in text.lower() for word in ["news", "headlines", "latest updates"])


def get_news(user_message: str = "", default_country: str = "us"):
    """Fetch top 3 headlines dynamically. Falls back to keyword search if country unsupported."""
    try:
        api_key = os.getenv("NEWS_API_KEY")
        if not api_key:
            return "News API key is missing. Please set NEWS_API_KEY in your .env."

        # Extract country
        country_code = extract_country_code(user_message)

        if country_code:
            url = f"https://newsapi.org/v2/top-headlines?country={country_code}&pageSize=3&apiKey={api_key}"
            resp = requests.get(url, timeout=10)
            data = resp.json()

            # ✅ If no results (unsupported country), fallback to keyword search
            if not data.get("articles"):
                url = f"https://newsapi.org/v2/everything?q={country_code.upper()}&pageSize=3&apiKey={api_key}"
                resp = requests.get(url, timeout=10)
                data = resp.json()

            if "articles" in data and data["articles"]:
                headlines = [f"{i+1}. {a['title']}" for i, a in enumerate(data["articles"][:3])]
                return f"Here are the top 3 headlines related to {country_code.upper()}:\n" + "\n".join(headlines)
            else:
                return f"I couldn’t fetch the latest news for {country_code.upper()} right now."

        # Default (no country found)
        url = f"https://newsapi.org/v2/top-headlines?country={default_country}&pageSize=3&apiKey={api_key}"
        resp = requests.get(url, timeout=10)
        data = resp.json()
        if "articles" in data and data["articles"]:
            headlines = [f"{i+1}. {a['title']}" for i, a in enumerate(data["articles"][:3])]
            return f"Here are the top 3 headlines for {default_country.upper()}:\n" + "\n".join(headlines)
        else:
            return f"I couldn’t fetch the latest news for {default_country.upper()} right now."

    except Exception as e:
        return f"Error fetching news: {e}"


def is_joke_intent(text: str) -> bool:
    return any(word in text.lower() for word in ["joke", "funny", "make me laugh", "laugh"])


def get_joke():
    jokes = [
        "Why don't programmers like nature? Because it has too many bugs.",
        "Why did the computer go to the doctor? Because it caught a virus!",
        "Why do Java developers wear glasses? Because they don’t see sharp.",
        "I told my laptop a joke, but it didn’t laugh. It just gave me a byte.",
    ]
    return random.choice(jokes)

# ------------------------------------------------------------------
# Chat History
# ------------------------------------------------------------------
chat_histories: Dict[str, List[Dict[str, str]]] = {}


class ChatMessage(BaseModel):
    role: str
    message: str


@app.post("/agent/chat/{session_id}")
async def add_message(session_id: str, msg: ChatMessage):
    if session_id not in chat_histories:
        chat_histories[session_id] = []
    chat_histories[session_id].append(msg.dict())
    return {"status": "ok"}


@app.get("/agent/chat/history/{session_id}")
async def get_history(session_id: str):
    if session_id not in chat_histories:
        raise HTTPException(status_code=404, detail="No history found")
    return {"conversations": chat_histories[session_id]}


# ------------------------------------------------------------------
# LLM + Murf Streaming
# ------------------------------------------------------------------
async def get_llm_response_stream(
    transcript: str, client_websocket: WebSocket, persona: str = "friendly"
):
    if not transcript or not transcript.strip():
        return
    if not gemini_model:
        logging.error("Cannot get LLM response because Gemini model is not initialized.")
        return

    logging.info(f"Sending to Gemini: '{transcript}' with persona: {persona}")

    murf_uri = (
        f"wss://api.murf.ai/v1/speech/stream-input?api-key={config.MURF_API_KEY}"
        f"&sample_rate=44100&channel_type=MONO&format=MP3"
    )

    try:
        async with websockets.connect(murf_uri) as tts_ws:
            voice_id = "en-IN-Isha"
            logging.info(f"Connected to Murf AI, using voice: {voice_id}")
            context_id = f"voice-agent-context-{datetime.now().isoformat()}"

            await tts_ws.send(
                json.dumps(
                    {
                        "voice_config": {"voiceId": voice_id, "style": "Conversational"},
                        "context_id": context_id,
                    }
                )
            )

            async def receive_and_forward_audio():
                first_audio_chunk_received = False
                while True:
                    try:
                        resp_raw = await tts_ws.recv()
                        response = json.loads(resp_raw)
                        if "audio" in response and response["audio"]:
                            if not first_audio_chunk_received:
                                await client_websocket.send_text(
                                    json.dumps({"type": "audio_start"})
                                )
                                first_audio_chunk_received = True
                                logging.info("Streaming first audio chunk.")
                            await client_websocket.send_text(
                                json.dumps({"type": "audio", "data": response["audio"]})
                            )
                        if response.get("final"):
                            await client_websocket.send_text(
                                json.dumps({"type": "audio_end"})
                            )
                            break
                    except websockets.ConnectionClosed:
                        await client_websocket.send_text(
                            json.dumps({"type": "audio_end"})
                        )
                        break
                    except Exception as e:
                        logging.error(f"Murf error: {e}")
                        break

            receiver_task = asyncio.create_task(receive_and_forward_audio())

            try:
                persona_instruction = {
                    "friendly": "a friendly and conversational assistant.",
                    "pirate": "a pirate with seafaring slang.",
                    "cowboy": "a cowboy with western slang.",
                    "robot": "a formal robot with mechanical tone.",
                    "doraemon": "Doraemon the helpful blue robot cat.",
                    "shinchan": "Shinchan the mischievous kid.",
                    "nobita": "Nobita, clumsy but kind-hearted.",
                    "pikachu": "Pikachu, responds with 'Pika' variations.",
                }.get(persona, "a friendly and conversational assistant.")

                final_spoken_text = None
                if is_weather_intent(transcript):
                    city = extract_city(transcript)
                    weather_info = get_weather(city or "Vijayawada")
                    final_spoken_text = weather_info
                    await client_websocket.send_text(
                        json.dumps({"type": "llm_chunk", "data": weather_info})
                    )
                # News intent
                if final_spoken_text is None and is_news_intent(transcript):
                    news_report = get_news(transcript)  # pass transcript for dynamic country detection
                    final_spoken_text = news_report
                    await client_websocket.send_text(
                        json.dumps({"type": "llm_chunk", "data": news_report})
                    )

                # Joke intent
                if final_spoken_text is None and is_joke_intent(transcript):
                    joke = get_joke()
                    final_spoken_text = joke
                    await client_websocket.send_text(
                        json.dumps({"type": "llm_chunk", "data": joke})
                    )
                
                
                
                if final_spoken_text is None:
                    prompt = (
                        f"You are {persona_instruction}\n"
                        f"The user just said: \"{transcript}\"\n"
                        f"Respond concisely in character. Do not use markdown."
                    )

                    def generate_sync():
                        return gemini_model.generate_content(prompt, stream=True)

                    loop = asyncio.get_running_loop()
                    gemini_response_stream = await loop.run_in_executor(
                        None, generate_sync
                    )

                    sentence_buffer = ""
                    assistant_response_accum = ""
                    for chunk in gemini_response_stream:
                        if chunk.text:
                            await client_websocket.send_text(
                                json.dumps({"type": "llm_chunk", "data": chunk.text})
                            )
                            sentence_buffer += chunk.text
                            assistant_response_accum += chunk.text

                        sentences = re.split(r"(?<=[.?!])\s+", sentence_buffer)
                        if len(sentences) > 1:
                            for sentence in sentences[:-1]:
                                s = sentence.strip()
                                if s:
                                    await tts_ws.send(
                                        json.dumps(
                                            {"text": s, "end": False, "context_id": context_id}
                                        )
                                    )
                            sentence_buffer = sentences[-1]

                    final_text = (
                        sentence_buffer.strip()
                        or assistant_response_accum.strip()
                        or "Okay."
                    )
                    logging.info(f"Sending to Murf (final): {final_text}")
                    await tts_ws.send(
                        json.dumps({"text": final_text, "end": True, "context_id": context_id})
                    )

                    session_id = str(client_websocket.client[1])
                    chat_histories.setdefault(session_id, []).append(
                        {"role": "assistant", "message": (assistant_response_accum.strip() or final_text)}
                    )
                else:
                    logging.info(f"Sending WEATHER reply to Murf: {final_spoken_text}")
                    await tts_ws.send(
                        json.dumps(
                            {"text": final_spoken_text, "end": True, "context_id": context_id}
                        )
                    )
                    session_id = str(client_websocket.client[1])
                    chat_histories.setdefault(session_id, []).append(
                        {"role": "assistant", "message": final_spoken_text}
                    )

                await asyncio.wait_for(receiver_task, timeout=60.0)

            finally:
                if not receiver_task.done():
                    try:
                        await receiver_task
                    except asyncio.CancelledError:
                        logging.warning("Receiver task cancelled.")
    except asyncio.CancelledError:
        logging.info("LLM/TTS task was cancelled.")
        await client_websocket.send_text(json.dumps({"type": "audio_interrupt"}))
    except Exception as e:
        logging.error(f"Error in LLM/TTS streaming: {e}", exc_info=True)


# ------------------------------------------------------------------
# Routes & WebSocket
# ------------------------------------------------------------------
@app.get("/")
async def home(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


async def send_client_message(ws: WebSocket, message: dict):
    try:
        await ws.send_text(json.dumps(message))
    except ConnectionError:
        logging.warning("Client connection closed.")


@app.websocket("/ws")
async def websocket_audio_streaming(websocket: WebSocket):
    await websocket.accept()
    logging.info("WebSocket connection accepted.")
    main_loop = asyncio.get_running_loop()
    persona = websocket.query_params.get("persona", "friendly")
    logging.info(f"Persona selected: {persona}")
    
    params = websocket.query_params
    llm_task = None
    last_processed_transcript = ""

    gemini_key = params.get("gemini") or config.GEMINI_API_KEY
    murf_key = params.get("murf") or config.MURF_API_KEY
    assembly_key = params.get("assembly") or config.ASSEMBLYAI_API_KEY
    news_key = params.get("news") or os.getenv("NEWS_API_KEY")

    if gemini_key:
        genai.configure(api_key=gemini_key)
        gemini_model = genai.GenerativeModel("gemini-1.5-flash")
    else:
        gemini_model = None
        logging.warning("No Gemini API key provided.")

    if not assembly_key:
        await send_client_message(websocket, {"type": "error", "message": "AssemblyAI API key missing."})
        await websocket.close()
        return


    client = StreamingClient(StreamingClientOptions(api_key=assembly_key))

    def on_turn(self: Type[StreamingClient], event: TurnEvent):
        nonlocal last_processed_transcript, llm_task
        transcript_text = (event.transcript or "").strip()
        if (
            event.end_of_turn
            and event.turn_is_formatted
            and transcript_text
            and transcript_text != last_processed_transcript
        ):
            last_processed_transcript = transcript_text
            if llm_task and not llm_task.done():
                logging.warning("User interrupted. Cancelling previous response.")
                llm_task.cancel()
                asyncio.run_coroutine_threadsafe(
                    send_client_message(websocket, {"type": "audio_interrupt"}), main_loop
                )

            logging.info(f"Final turn: '{transcript_text}'")
            session_id = str(websocket.client[1])
            chat_histories.setdefault(session_id, []).append(
                {"role": "user", "message": transcript_text}
            )
            asyncio.run_coroutine_threadsafe(
                send_client_message(
                    websocket, {"type": "transcription", "text": transcript_text, "end_of_turn": True}
                ),
                main_loop,
            )
            llm_task = asyncio.run_coroutine_threadsafe(
                get_llm_response_stream(transcript_text, websocket, persona), main_loop
            )
        elif transcript_text and transcript_text == last_processed_transcript:
            logging.warning(f"Duplicate turn ignored: '{transcript_text}'")

    client.on(StreamingEvents.Begin, lambda self, e: logging.info("Transcription started."))
    client.on(StreamingEvents.Turn, on_turn)
    client.on(StreamingEvents.Termination, lambda self, e: logging.info("Transcription terminated."))
    client.on(StreamingEvents.Error, lambda self, err: logging.error(f"AssemblyAI error: {err}"))

    try:
        client.connect(StreamingParameters(sample_rate=16000, format_turns=True))
        await send_client_message(websocket, {"type": "status", "message": "Connected to transcription service."})

        while True:
            message = await websocket.receive()
            if "text" in message:
                try:
                    data = json.loads(message["text"])
                    if data.get("type") == "ping":
                        await websocket.send_text(json.dumps({"type": "pong"}))
                except (json.JSONDecodeError, TypeError):
                    pass
            elif "bytes" in message:
                if message["bytes"]:
                    client.stream(message["bytes"])
    except (WebSocketDisconnect, RuntimeError) as e:
        logging.info(f"Client disconnected: {e}")
    except Exception as e:
        logging.error(f"WebSocket error: {e}", exc_info=True)
    finally:
        if llm_task and not llm_task.done():
            llm_task.cancel()
        logging.info("Cleaning up connection resources.")
        client.disconnect()
        if websocket.client_state.name != "DISCONNECTED":
            await websocket.close()


if __name__ == "__main__":
    import uvicorn

    missing = [
        k
        for k, v in {
            "GEMINI_API_KEY": getattr(config, "GEMINI_API_KEY", None),
            "MURF_API_KEY": getattr(config, "MURF_API_KEY", None),
            "ASSEMBLYAI_API_KEY": getattr(config, "ASSEMBLYAI_API_KEY", None),
        }.items()
        if not v
    ]
    if missing:
        logging.warning(f"Missing API keys: {', '.join(missing)}")

    uvicorn.run(app, host="0.0.0.0", port=8000)
