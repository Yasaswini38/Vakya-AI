import os
from dotenv import load_dotenv
import logging

# Load environment variables from .env file
load_dotenv()

ASSEMBLYAI_API_KEY = os.getenv("ASSEMBLYAI_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
MURF_API_KEY = os.getenv("MURF_API_KEY")


if not ASSEMBLYAI_API_KEY:
    logging.warning("ASSEMBLYAI_API_KEY not found in .env file. Please create one.")

if not GEMINI_API_KEY:
    logging.warning("GEMINI_API_KEY not found in .env file. Please create one.")

if not MURF_API_KEY:
    logging.warning("MURF_API_KEY not found in .env file. Please create one.")