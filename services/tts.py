from murf import Murf
import os

MURF_API_KEY = os.getenv("MURF_API_KEY")
client = Murf(api_key=MURF_API_KEY)

class TTS:
    def generate_audio(self, text: str, voice_id: str) -> str:
        murf_resp = client.text_to_speech.generate(
            text=text,
            voice_id=voice_id
        )
        audio_url = getattr(murf_resp, "audio_file", None) or murf_resp.get("audio_file")
        if not audio_url:
            raise RuntimeError("Murf TTS failed to generate audio URL.")
        return audio_url