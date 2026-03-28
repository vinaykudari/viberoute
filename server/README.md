# Server

FastAPI scaffold for the VibeRoute MVP, managed with `uv`.

## What is here now
- thin typed endpoints for analysis, grounding, planning, revisions, chat, and export
- Pydantic request and response models that mirror the frontend contracts
- Railtracks-backed planner flow scaffold for server-side orchestration
- extendable planning services for image interpretation, weather lookup, grounding, routing, and validation

## Start
1. From the repo root, run `uv sync --directory server`
2. Run `npm run dev:server`
3. The server listens on `http://localhost:4000`

If you want to run it directly from `server/`:
1. `uv sync`
2. `uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 4000`

## Endpoints
- `GET /health`
- `POST /api/analyze-images`
- `POST /api/ground-places`
- `POST /api/generate-plan`
- `POST /api/chat`
- `POST /api/revise-plan`
- `POST /api/export-plan`

## Notes
- Gemini image analysis, weather, daylight, geocoding, and routing are wired into the live planner flow.
- Route handlers stay thin so orchestration lives in dedicated planner modules.
- `POST /api/chat` now runs a staged planner turn:
  - image interpretation and weather lookup can run in parallel
  - new image uploads trigger a fresh vibe interpretation
  - the flow asks for vibe confirmation and missing trip details before planning
  - once confirmed, the planner grounds scenes, builds a route, and validates it
- When a Gemini key is valid, small Railtracks agents can phrase intake and plan replies.
