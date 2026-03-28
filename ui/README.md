# UI

Next.js frontend scaffold for the VibeRoute MVP.

## What is here now
- Assistant UI powered chat rail
- local image upload previews
- live map plotting for provisional candidates and routed stops
- minimal two-pane layout with map left and chat right

## Start
1. From the repo root, run `npm install`
2. Run `npm run dev:ui`
3. Open `http://localhost:3000`

## Notes
- The chat rail proxies to the FastAPI planner server through `ui/app/api/chat/route.ts`.
- Assistant UI attachments are forwarded to the backend as inline images for Gemini analysis.
- If needed later, set `NEXT_PUBLIC_API_BASE_URL` to point the UI at the standalone server.
