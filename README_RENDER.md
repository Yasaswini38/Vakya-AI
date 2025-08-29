# Vākya — AI Voice Agent (Render deployment)

## Project structure
```
main.py
config.py
requirements.txt
Procfile
render.yaml
templates/
  └─ index.html
static/
  ├─ index.js
  ├─ style.css
  └─ voices.json
```

## Local run
```bash
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

## Deploy to Render (free tier)
1. Push this folder to a **GitHub** repo.
2. In Render, **New +** → **Web Service** → connect the repo.
3. Environment: **Python**. Plan: **Free**.
4. **Build command**: `pip install -r requirements.txt`
   **Start command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Add Environment Variables:
   - `GEMINI_API_KEY`
   - `MURF_API_KEY`
   - `ASSEMBLYAI_API_KEY`
   - `NEWS_API_KEY` (optional)
6. Deploy. Render supports **WebSockets** on Web Services by default.

### Important production fix
The frontend WebSocket now auto-picks `wss://` in production and your domain host.
No code changes needed besides this repo.

### Common gotchas
- Make sure your `index.html` is in `/templates` and static assets live in `/static`.
- If audio doesn't play, check browser permissions and that your Murf/AssemblyAI keys are valid.
- If you see a 404 for `/static/voices.json`, verify the file exists and path is correct.
- If using a custom domain with HTTPS, WebSockets must use `wss://`.
