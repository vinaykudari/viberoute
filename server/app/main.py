from __future__ import annotations

import asyncio

from fastapi import FastAPI
from fastapi import HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .models import (
    AnalyzeImagesRequest,
    AnalyzeImagesResponse,
    ExportPlanRequest,
    GeneratePlanRequest,
    GeneratePlanResponse,
    GroundPlacesRequest,
    GroundPlacesResponse,
    IntakePreferences,
    NavigationCommentaryRequest,
    NavigationCommentaryResponse,
    PlannerChatImage,
    PlannerChatRequest,
    PlannerChatResponse,
    RevisePlanRequest,
    RevisePlanResponse,
)
from .planning.heuristics import compute_pending_fields
from .services.image_interpreter import get_image_interpreter
from .services.navigation_commentary import get_navigation_commentary_service
from .services.place_grounder import get_place_grounder
from .services.plan_validator import get_plan_validator
from .services.planner_chat import run_planner_chat, stream_planner_chat
from .services.route_planner import get_route_planner
from .services.weather import get_weather_provider

app = FastAPI(title="VibeRoute Server", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "viberoute-server",
        "timestamp": "2026-03-28T00:00:00.000Z",
    }


@app.post("/api/analyze-images", response_model=AnalyzeImagesResponse)
async def analyze_images(payload: AnalyzeImagesRequest) -> AnalyzeImagesResponse:
    interpreter = get_image_interpreter()
    preferences = IntakePreferences(city=payload.city, hardConstraints=[])
    images = [_upload_to_chat_image(image) for image in payload.images]
    result = await interpreter.interpret(
        message="Analyze these inspiration images for a one-day city plan.",
        images=images,
        preferences=preferences,
    )

    if result.error_message:
        raise HTTPException(status_code=503, detail=result.error_message)

    return AnalyzeImagesResponse(scenes=result.scenes, followUpFields=compute_pending_fields(preferences))


@app.post("/api/ground-places", response_model=GroundPlacesResponse)
async def ground_places(payload: GroundPlacesRequest) -> GroundPlacesResponse:
    grounder = get_place_grounder()
    scenes = await asyncio.gather(
        *(
            grounder.ground_scene(city=payload.city, scene=scene)
            for scene in payload.scenes
        )
    )
    return GroundPlacesResponse(scenes=scenes)


@app.post("/api/generate-plan", response_model=GeneratePlanResponse)
async def generate_plan(payload: GeneratePlanRequest) -> GeneratePlanResponse:
    if not payload.preferences.city:
        raise HTTPException(status_code=400, detail="A city is required to generate a plan.")

    weather = await get_weather_provider().get_weather(
        area_label=payload.preferences.city
    )
    planner = get_route_planner()
    plan = await planner.build_plan(
        preferences=payload.preferences,
        scenes=payload.scenes,
        weather=weather,
        current_plan=None,
    )
    validation_report = await get_plan_validator().validate(plan=plan)
    if not validation_report.valid:
        raise HTTPException(
            status_code=422,
            detail="The generated plan failed validation checks.",
        )

    return GeneratePlanResponse(plan=plan)


@app.post("/api/revise-plan", response_model=RevisePlanResponse)
def revise_plan(payload: RevisePlanRequest) -> RevisePlanResponse:
    raise HTTPException(
        status_code=501,
        detail=(
            "Use /api/chat for conversational revisions. The direct revise-plan route "
            "has not been implemented yet."
        ),
    )


@app.post("/api/chat", response_model=PlannerChatResponse)
def planner_chat(payload: PlannerChatRequest) -> PlannerChatResponse:
    return run_planner_chat(payload)


@app.post("/api/chat/stream")
async def planner_chat_stream(payload: PlannerChatRequest) -> StreamingResponse:
    return StreamingResponse(
        stream_planner_chat(payload),
        media_type="application/x-ndjson",
        headers={"cache-control": "no-store"},
    )


@app.post("/api/navigation/commentary", response_model=NavigationCommentaryResponse)
async def navigation_commentary(
    payload: NavigationCommentaryRequest,
) -> NavigationCommentaryResponse:
    try:
        return await get_navigation_commentary_service().generate(payload)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/api/export-plan", status_code=501)
def export_plan(payload: ExportPlanRequest) -> dict[str, object]:
    return {
        "message": (
            "PNG export is not wired in the scaffold yet. The endpoint exists so the UI "
            "contract can stabilize before implementation."
        ),
        "stopCount": len(payload.plan.stops),
    }


def _upload_to_chat_image(image) -> PlannerChatImage:
    if not image.preview_url:
        raise HTTPException(
            status_code=400,
            detail=(
                "Image analysis requires an inline image payload. Use the Assistant UI "
                "chat uploader or send a data URL in `previewUrl`."
            ),
        )

    if image.preview_url.startswith("blob:"):
        raise HTTPException(
            status_code=400,
            detail=(
                "Blob URLs are browser-local and cannot be analyzed by the server. Use "
                "the Assistant UI chat uploader or send a data URL in `previewUrl`."
            ),
        )

    return PlannerChatImage(
        dataUrl=image.preview_url,
        filename=image.name,
        mimeType=image.mime_type,
    )
