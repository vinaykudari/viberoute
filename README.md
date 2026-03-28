# VibeRoute

Split scaffold for the VibeRoute MVP.

## Workspaces
- `ui/`: Next.js frontend shell for chat, uploads, map, and day plan rendering
- `server/`: FastAPI scaffold for analysis, grounding, planning, and Railtracks-based agent flows
- `shared/`: centralized contracts and schemas shared by the UI and server

## Quick start
1. `npm install`
2. `uv sync --directory server`
3. `npm run dev:server`
4. In a second terminal, `npm run dev:ui`

The current milestone is a live planner scaffold. The UI renders a chat-led intake and map-first planning surface while the server exposes typed endpoints wired to Gemini, Assistant UI, routing, and weather services.
