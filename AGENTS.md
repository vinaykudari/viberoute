# AGENTS.md — VibeRoute

## 1. Mission
Build **VibeRoute**, a local-first, map-first web app that turns a small set of inspiration photos into a **timed, color-coded day plan** on an interactive map.

The shipped MVP should feel like:
- upload 3–6 images
- infer the desired scene or experience from each image
- ground each scene to one or more real places
- build a practical route for a single day
- let the user refine the plan conversationally
- export the final plan as an image

The app is not an image generator. The core artifact is the **interactive route plan**.

---

## 2. Product Scope for the MVP

### In scope
- Single-day itinerary
- User provides a city or start area explicitly
- 3–6 uploaded images
- Structured extraction from each image:
  - place or place type
  - preferred time of day
  - vibe or scene type
  - estimated duration
  - confidence
- Ground each image to candidate POIs or neighborhoods
- Generate a routed day plan
- Display route on a map with colored segments
- Show start and end time for each stop
- Let the user refine the plan through chat
- Export the final plan as a PNG

### Out of scope for the MVP
- Multi-day planning
- Hotel booking, restaurant booking, ticketing
- Full social graph or collaboration
- Exact lat/long recovery from arbitrary images with no user context
- Fully autonomous arbitrary-world landmark recognition with no fallback
- Real-time traffic-heavy optimization

### Recommended MVP assumptions
If the user has not clarified otherwise, assume:
- one city per plan
- one day per plan
- walking + driving or walking + transit, whichever is easier with current APIs
- route quality matters, but explainability matters more than mathematically perfect optimization
- low-confidence grounding should be surfaced to the user, not hidden

---

## 3. Sponsor Strategy

### Required build strategy
Prefer a stack that is easy to run locally first, then deploy later.

### Recommended sponsor usage
Use at least these sponsors in the actual app flow:
1. **Google DeepMind / Gemini**
   - multimodal image understanding
   - structured extraction from photos
   - revision explanations in chat
2. **Assistant UI**
   - conversational planner sidebar
   - refinement loop for itinerary changes
3. **Unkey**
   - protect server endpoints
   - rate limit expensive AI routes
   - issue demo key for client requests if needed

### Optional sponsor usage
4. **DigitalOcean**
   - deployment target if time permits
5. **Lovable**
   - optional UI ideation or first-pass page scaffolding
   - not required for the local MVP to run

### Important recommendation
Do **not** block the MVP on Lovable.
Build the app locally in a normal codebase first.
If Lovable is used later, treat it as a source of UI ideas or generated scaffolding that can be ported into the local project.

This keeps delivery risk low.

---

## 4. Development Philosophy

### Core principles
- Local-first development
- Small, decoupled modules
- Strong typing everywhere
- Validate all model outputs with schemas
- Prefer deterministic code for routing, timing, and validation
- Use the model for perception and soft reasoning, not for everything
- Never let one huge file accumulate product logic
- Always keep the current plan documented

### File-size discipline
Target limits:
- components: ideally under 250 lines
- hooks/services: ideally under 200 lines
- route handlers: thin, mostly orchestration
- if a file starts mixing unrelated responsibilities, split it

### Separation of concerns
- UI components: rendering only
- hooks: client state and data fetching only
- services: external APIs and business logic
- planners: itinerary assembly rules
- validators: schema checks and guardrails
- adapters: provider-specific API wrappers

### Model usage discipline
- Always request structured JSON from Gemini
- Always validate with `zod`
- Never trust raw model output directly in UI or planning
- Keep prompts in isolated files, not inline in route handlers

---

## 5. Recommended Stack

### App framework
- Next.js with App Router
- TypeScript
- Tailwind CSS
- Assistant UI
- MapLibre GL for map rendering
- OpenStreetMap tiles for visual map display

### Server-side libraries
- `zod` for validation
- `@google/genai` or the current official Google client
- `@unkey/nextjs` or equivalent Unkey SDK

### Optional helpers
- `date-fns` for time math
- `html-to-image` or `dom-to-image` for export

### Why this stack
- easy local development
- clear separation of client and server
- works well with Assistant UI
- map rendering is flexible and lightweight
- does not tie the MVP to one map vendor for UI rendering

---

## 6. Architecture Overview

Use a **hybrid architecture**:
- Gemini extracts structured scene intent from images
- deterministic services ground, validate, and route
- Assistant UI modifies the plan through structured revision requests

### High-level flow
1. user uploads images and specifies a city or starting area
2. server analyzes images with Gemini
3. server grounds scenes to place candidates
4. server builds an itinerary skeleton
5. server computes route segments
6. UI renders timeline + map
7. user revises plan in chat
8. server applies revisions and recomputes route
9. user exports plan image

### Important rule
The model should produce:
- scene interpretations
- soft preferences
- revision intent

The code should produce:
- validated data
- canonical plan state
- route computations
- timing assembly
- fallback behavior

---

## 7. Suggested Repo Structure

```text
app/
  (marketing)/
    page.tsx
  plan/
    page.tsx
  api/
    analyze-images/route.ts
    ground-places/route.ts
    generate-plan/route.ts
    revise-plan/route.ts
    export-plan/route.ts

components/
  upload/
    photo-dropzone.tsx
    photo-grid.tsx
  planner/
    scene-card.tsx
    stop-card.tsx
    timeline.tsx
    route-legend.tsx
  map/
    map-view.tsx
    route-layer.tsx
    stop-markers.tsx
  chat/
    planner-chat.tsx
    planner-thread.tsx
  layout/
    app-shell.tsx

lib/
  env.ts
  types/
    plan.ts
    scene.ts
    place.ts
    chat.ts
  validation/
    scene-schemas.ts
    plan-schemas.ts
  ai/
    gemini-client.ts
    prompts/
      analyze-images.ts
      revise-plan.ts
  maps/
    geocoder.ts
    routing.ts
    map-utils.ts
  planning/
    build-plan.ts
    schedule-stops.ts
    color-route.ts
    revise-plan.ts
    explain-plan.ts
  storage/
    uploads.ts
  auth/
    unkey.ts

docs/
  PLAN.md
  DECISIONS.md
  PROMPTS.md
```

If a folder starts holding unrelated logic, split it further.

---

## 8. Data Contracts

### Scene extraction contract
Each uploaded image should resolve to a validated `SceneIntent`.

Suggested shape:

```ts
export type SceneIntent = {
  imageId: string
  title: string
  sceneType:
    | 'landmark'
    | 'viewpoint'
    | 'food'
    | 'neighborhood'
    | 'museum'
    | 'park'
    | 'shopping'
    | 'nightlife'
    | 'other'
  vibeTags: string[]
  timePreference:
    | 'sunrise'
    | 'morning'
    | 'midday'
    | 'afternoon'
    | 'sunset'
    | 'evening'
    | 'night'
    | 'flexible'
  durationMinutes: number
  placeCandidates: PlaceCandidate[]
  confidence: number
  notes?: string
}
```

### Place grounding contract

```ts
export type PlaceCandidate = {
  name: string
  lat: number
  lng: number
  address?: string
  category?: string
  source: 'google-places' | 'manual' | 'fallback'
  confidence: number
}
```

### Planned stop contract

```ts
export type PlannedStop = {
  id: string
  title: string
  lat: number
  lng: number
  startTimeIso: string
  endTimeIso: string
  routeColor: string
  sourceImageIds: string[]
  rationale: string
}
```

### Day plan contract

```ts
export type DayPlan = {
  city: string
  startLocation?: {
    label: string
    lat: number
    lng: number
  }
  stops: PlannedStop[]
  segments: RouteSegment[]
  summary: string
}
```

Keep these types centralized. Do not redefine them ad hoc across files.

---

## 9. API Design Guidance

Route handlers should be orchestration-only.
Move core logic to services.

### Required endpoints
- `POST /api/analyze-images`
  - input: uploaded image references + city
  - output: `SceneIntent[]`
- `POST /api/ground-places`
  - input: `SceneIntent[]`
  - output: selected place candidates
- `POST /api/generate-plan`
  - input: scenes + user constraints
  - output: `DayPlan`
- `POST /api/revise-plan`
  - input: current plan + user revision request
  - output: revised `DayPlan`
- `POST /api/export-plan`
  - input: plan id or current plan payload
  - output: PNG or image blob

### API route rules
- validate request body with `zod`
- return typed errors
- do not inline giant prompt strings
- do not call external APIs directly from UI components
- protect expensive endpoints with Unkey middleware or wrapper checks

---

## 10. Planning Logic Guidance

### Keep the planner simple and reliable
For MVP, use this sequence:
1. interpret images into structured scene intents
2. choose one best place per scene, with fallback options
3. assign rough time windows from image semantics
4. order stops by a combination of:
   - time preference
   - geographic clustering
   - travel cost
   - meal-like scene placement
5. compute route segments
6. generate human-readable explanation

### Important planner constraint
Do not let the LLM directly emit the final schedule with no validation.
Use model output as input to deterministic scheduling rules.

### Revision strategy
The user may say things like:
- make this more relaxed
- keep lunch near noon
- move sunset later
- replace Mission dinner with something quieter

Handle revisions in two steps:
1. use Gemini to convert chat intent into a structured revision request
2. apply the revision through deterministic planner functions

This prevents the chat loop from corrupting the plan shape.

---

## 11. Assistant UI Guidance

Assistant UI should be the **planner copilot**, not the source of truth.

### Good chat capabilities
- explain why a stop is placed where it is
- accept user edits in natural language
- suggest swaps or tradeoffs
- expose low-confidence grounding and ask for confirmation

### Bad chat capabilities for MVP
- freeform storytelling disconnected from the current plan
- direct mutation of hidden state without validation

### Rule
All chat revisions must round-trip through:
- validated request schema
- deterministic plan mutation
- full plan recompute if needed

---

## 12. Unkey Guidance

Use Unkey, but keep it thin.

### Recommended use
- protect AI-backed endpoints
- rate limit analyze/generate/revise routes
- support a simple public demo key if needed

### Do not do
- over-engineer auth
- build a custom API key dashboard during the hackathon

The goal is sponsor integration with minimal complexity.

---

## 13. Lovable Guidance

Lovable is **not** required for the repo to run.

### Acceptable usage
- generate design inspiration
- generate first-pass layout ideas
- generate component copy or rough structure
- port or recreate that UI manually in the local codebase

### Rule
Do not make the local repo depend on Lovable exports to function.
If Lovable-generated assets or code are introduced later, place them in isolated presentational components and refactor them to match repo standards.

---

## 14. Local-First Development Plan

### Phase 1 — scaffold and mock data
- create app shell
- create upload panel, map panel, chat panel
- define all core types and schemas
- render a mocked day plan in UI

### Phase 2 — image analysis
- wire Gemini image analysis endpoint
- return validated `SceneIntent[]`
- show scene cards and confidence states

### Phase 3 — place grounding and routing
- ground image scenes to POIs
- compute route segments
- render route on map
- show timeline with times

### Phase 4 — conversational revisions
- wire Assistant UI
- support structured revision requests
- recompute plan after each revision

### Phase 5 — export and polish
- export PNG
- improve legends, labels, loading states, and empty states
- optionally deploy to DigitalOcean

### Development rule
Start each external integration with a mock adapter and a real adapter.
UI should work with mock data first.
This prevents API issues from blocking front-end progress.

---

## 15. Clarification Protocol

When requirements are ambiguous, ask concise clarification questions **only if the ambiguity blocks implementation**.

### Ask when it affects architecture or product scope
Examples:
- are we supporting only one city at a time?
- should users manually confirm place matches?
- do we support driving, walking, transit, or all three?
- should the plan optimize for efficiency, vibe, or balance by default?

### Do not ask when a reasonable MVP default exists
Instead:
- choose the smallest sensible default
- write the assumption into `docs/PLAN.md`
- continue implementation

### Required behavior
If the user changes direction mid-build:
1. update `docs/PLAN.md` first
2. note the new decision in `docs/DECISIONS.md`
3. then change the code

Do not silently drift away from the documented plan.

---

## 16. Documentation Protocol

### `docs/PLAN.md`
This is the live implementation plan.
Update it when:
- scope changes
- priorities change
- a new feature is added or removed
- current milestone changes

### `docs/DECISIONS.md`
This stores architectural decisions and tradeoffs.
Each entry should include:
- date
- decision
- rationale
- consequence

### `docs/PROMPTS.md`
Document the prompts, schemas, and why they exist.
This helps debugging and iteration.

### Important rule
Keep `AGENTS.md` mostly stable.
Use `PLAN.md` for changing scope.
Only update `AGENTS.md` when the operating rules or architecture philosophy changes.

---

## 17. Error Handling and Fallbacks

### Must-have fallbacks
- if image grounding is low confidence, show top candidates
- if route generation fails, still show stop list without route
- if one image is ambiguous, keep the rest of the plan usable
- if Gemini returns invalid JSON, retry once with stricter schema instructions

### User-facing behavior
Always fail soft.
Never leave the user with a blank screen because one image or one route failed.

---

## 18. Quality Bar

Before calling a feature complete, check:
- types are centralized
- schema validation exists
- no giant mixed-responsibility files
- route handlers are thin
- UI works with loading and error states
- map is legible
- revisions update both chat-visible explanation and plan state
- current scope is reflected in `docs/PLAN.md`

---

## 19. Definition of Done for MVP

MVP is done when:
- a user can upload images
- the server extracts structured scene intent from them
- the app grounds them to places in a chosen city
- the app generates a timed day plan with a visible route
- the user can revise that plan through Assistant UI
- the final plan can be exported as an image
- the codebase remains modular and understandable

---

## 20. Environment Variables

The user will provide real values in `.env.local`.
Do not hardcode secrets.

Suggested env contract:

```bash
GOOGLE_API_KEY=
GOOGLE_MAPS_API_KEY=
UNKEY_ROOT_KEY=
UNKEY_API_ID=
NEXT_PUBLIC_MAP_STYLE_URL=
NEXT_PUBLIC_APP_URL=
```

If deployment happens later, add deployment-specific variables separately.

---

## 21. Final Instruction to the Coding Agent

Implement the MVP in the smallest reliable steps.
Keep the repo clean.
Prefer working software over speculative abstraction, but never collapse unrelated logic into a single giant file.

When in doubt:
- keep the plan map-first
- keep the AI outputs structured
- keep revisions deterministic
- document assumptions
- update `docs/PLAN.md` when the user changes direction
