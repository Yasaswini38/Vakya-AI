import assemblyai as aai
import os
aai.settings.api_key = os.getenv("ASSEMBLYAI_API_KEY")

class STT:
    def __init__(self):
        self.transcriber = aai.Transcriber()

    def transcribe_audio(self, audio_bytes: bytes) -> str:
        transcript_obj = self.transcriber.transcribe(audio_bytes)
        transcript_text = getattr(transcript_obj, "text", None)
        if not transcript_text:
            raise ValueError("Transcription failed or empty.")
        return transcript_text