from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable

import railtracks as rt

from ..agents import (
    build_intake_coordinator_agent,
    build_plan_explainer_agent,
    has_live_llm,
    mark_llm_unavailable,
)
from ..models import (
    DayPlan,
    IntakePreferences,
    PlannerChatRequest,
    PlannerChatResponse,
    PlannerChatStateDelta,
    SceneIntent,
    WeatherSnapshot,
)
from ..services.image_interpreter import get_image_interpreter
from ..services.intake_parser import merge_preferences_from_message
from ..services.map_highlights import get_map_highlight_service
from ..services.place_grounder import get_place_grounder
from ..services.plan_validator import get_plan_validator
from ..services.route_planner import get_route_planner
from ..services.weather import get_weather_provider
from .heuristics import (
    build_provisional_map_points,
    compute_pending_fields,
    infer_area_hint_from_scenes,
    needs_vibe_confirmation,
    next_question_for_field,
)
from .models import ImageInterpretationResult, PlannerRunContext

ReasoningEmitter = Callable[[str], Awaitable[None]]
StateEmitter = Callable[[PlannerChatStateDelta], Awaitable[None]]


@rt.function_node
async def interpret_images_step(context: PlannerRunContext) -> ImageInterpretationResult:
    if not context.new_images and context.current_scenes:
        return ImageInterpretationResult(
            scenes=context.current_scenes,
            interpretedVibe=context.current_vibe,
        )

    interpreter = get_image_interpreter()
    return await interpreter.interpret(
        message=context.message,
        images=context.images,
        preferences=context.preferences,
    )


@rt.function_node
async def lookup_weather_step(
    preferences: IntakePreferences | None,
) -> WeatherSnapshot | None:
    if preferences is None or not preferences.city:
        return None

    provider = get_weather_provider()
    return await provider.get_weather(area_label=preferences.city)


@rt.function_node
async def ground_scene_step(city: str, scene: SceneIntent) -> SceneIntent:
    grounder = get_place_grounder()
    return await grounder.ground_scene(city=city, scene=scene)


@rt.function_node
async def build_plan_step(
    preferences: IntakePreferences,
    scenes: list[SceneIntent],
    weather: WeatherSnapshot | None,
    current_plan: DayPlan | None,
) -> DayPlan:
    planner = get_route_planner()
    return await planner.build_plan(
        preferences=preferences,
        scenes=scenes,
        weather=weather,
        current_plan=current_plan,
    )


@rt.function_node
async def validate_plan_step(plan: DayPlan):
    validator = get_plan_validator()
    return await validator.validate(plan=plan)


@rt.function_node
async def run_planner_turn(payload: PlannerChatRequest) -> PlannerChatResponse:
    return await execute_planner_turn(payload)


async def execute_planner_turn(
    payload: PlannerChatRequest,
    *,
    emit_reasoning: ReasoningEmitter | None = None,
    emit_state: StateEmitter | None = None,
) -> PlannerChatResponse:
    context = PlannerRunContext.from_request(payload)
    merged_preferences = merge_preferences_from_message(
        message=context.message,
        current=context.preferences,
    )
    context.preferences = merged_preferences
    area_label, area_lat, area_lng, area_timezone = _resolve_planning_area(
        preferences=merged_preferences,
        scenes=context.current_scenes,
        current_plan=context.current_plan,
        weather=None,
    )
    await _emit_reasoning(
        emit_reasoning,
        _build_parallel_stage_message(
            context=context,
            area_label=area_label,
        ),
    )

    image_task = asyncio.create_task(
        _interpret_images(
            context,
            emit_reasoning=emit_reasoning,
            emit_state=emit_state,
        )
    )
    weather_task = (
        asyncio.create_task(
            _lookup_weather(
                area_label=area_label,
                latitude=area_lat,
                longitude=area_lng,
                timezone=area_timezone,
                include_daylight=False,
            )
        )
        if area_label or (area_lat is not None and area_lng is not None)
        else None
    )
    image_result = await image_task
    weather = await weather_task if weather_task is not None else None

    scenes = image_result.scenes or context.current_scenes
    vibe = image_result.interpreted_vibe or context.current_vibe
    if image_result.error_message:
        pending_fields = compute_pending_fields(
            merged_preferences,
            scenes=scenes,
            current_plan=context.current_plan,
            weather=weather,
            explicit_pending_fields=context.pending_fields,
        )
        return PlannerChatResponse(
            agentReply=image_result.error_message,
            pendingFields=pending_fields,
            needsClarification=True,
            stage="needs_input",
            routeAction="hold",
            interpretedVibe=vibe,
            weather=weather,
            scenes=scenes,
            provisionalMapPoints=build_provisional_map_points(
                scenes,
                merged_preferences,
            ),
            preferences=merged_preferences,
            plan=context.current_plan,
        )

    grounding_label = merged_preferences.city or context.current_plan.city if context.current_plan else ""
    grounded_scenes = (
        await asyncio.gather(
            *(
                get_place_grounder().ground_scene(
                    city=grounding_label or None,
                    scene=scene,
                )
                for scene in scenes
            )
        )
        if scenes
        else []
    )

    area_label, area_lat, area_lng, area_timezone = _resolve_planning_area(
        preferences=merged_preferences,
        scenes=grounded_scenes,
        current_plan=context.current_plan,
        weather=weather,
    )
    needs_daylight = _requires_daylight(grounded_scenes)
    if weather is None and (area_label or (area_lat is not None and area_lng is not None)):
        weather = await _lookup_weather(
            area_label=area_label,
            latitude=area_lat,
            longitude=area_lng,
            timezone=area_timezone,
            include_daylight=needs_daylight,
        )
    elif weather is not None and needs_daylight and not (
        weather.sunrise_time_iso or weather.sunset_time_iso
    ):
        weather = await _lookup_weather(
            area_label=weather.area_label,
            latitude=weather.latitude,
            longitude=weather.longitude,
            timezone=weather.timezone,
            include_daylight=True,
        )

    map_highlights = (
        await get_map_highlight_service().build_cards(
            scenes=grounded_scenes,
            vibe=vibe,
            weather=weather,
            plan=context.current_plan,
        )
        if grounded_scenes
        else []
    )

    await _emit_state(
        emit_state,
        PlannerChatStateDelta(
            weather=weather,
            scenes=grounded_scenes,
            provisionalMapPoints=build_provisional_map_points(
                grounded_scenes,
                merged_preferences,
            ),
            mapHighlights=map_highlights,
        ),
    )

    pending_fields = compute_pending_fields(
        merged_preferences,
        scenes=grounded_scenes,
        current_plan=context.current_plan,
        weather=weather,
        explicit_pending_fields=context.pending_fields,
    )

    if vibe and not needs_vibe_confirmation(
        message=context.message,
        has_images=bool(context.images),
        has_new_images=bool(context.new_images),
        current_plan_exists=context.current_plan is not None,
        vibe_override_present=bool(merged_preferences.vibe_override),
        vibe_requires_confirmation=vibe.requires_confirmation,
    ):
        vibe = vibe.model_copy(update={"requires_confirmation": False})

    provisional_points = build_provisional_map_points(grounded_scenes, merged_preferences)

    if needs_vibe_confirmation(
        message=context.message,
        has_images=bool(context.images),
        has_new_images=bool(context.new_images),
        current_plan_exists=context.current_plan is not None,
        vibe_override_present=bool(merged_preferences.vibe_override),
        vibe_requires_confirmation=bool(vibe and vibe.requires_confirmation),
    ):
        next_question = (
            next_question_for_field(pending_fields[0]) if pending_fields else None
        )
        reply = await _compose_intake_reply(
            vibe_summary=vibe.summary if vibe else None,
            weather_summary=weather.summary if weather else None,
            next_question=next_question,
            mode="confirm_vibe",
        )
        return PlannerChatResponse(
            agentReply=reply,
            pendingFields=pending_fields,
            needsClarification=True,
            stage="needs_confirmation",
            routeAction="hold",
            interpretedVibe=vibe,
            weather=weather,
            scenes=grounded_scenes,
            provisionalMapPoints=provisional_points,
            mapHighlights=map_highlights,
            preferences=merged_preferences,
            plan=context.current_plan,
        )

    if pending_fields:
        next_question = next_question_for_field(pending_fields[0])
        reply = await _compose_intake_reply(
            vibe_summary=vibe.summary if vibe else None,
            weather_summary=weather.summary if weather else None,
            next_question=next_question,
            mode="clarify",
        )
        return PlannerChatResponse(
            agentReply=reply,
            pendingFields=pending_fields,
            needsClarification=True,
            stage="needs_input",
            routeAction="hold",
            interpretedVibe=vibe,
            weather=weather,
            scenes=grounded_scenes,
            provisionalMapPoints=provisional_points,
            mapHighlights=map_highlights,
            preferences=merged_preferences,
            plan=context.current_plan,
        )

    if not grounded_scenes:
        reply = await _compose_intake_reply(
            vibe_summary=None,
            weather_summary=weather.summary if weather else None,
            next_question=None,
            mode="request_images",
        )
        return PlannerChatResponse(
            agentReply=reply,
            pendingFields=pending_fields,
            needsClarification=True,
            stage="needs_input",
            routeAction="hold",
            interpretedVibe=vibe,
            weather=weather,
            preferences=merged_preferences,
            mapHighlights=map_highlights,
            plan=context.current_plan,
        )

    await _emit_reasoning(
        emit_reasoning,
        "Sequencing stops, weather windows, and route legs.",
    )
    plan = await get_route_planner().build_plan(
        preferences=merged_preferences,
        scenes=grounded_scenes,
        weather=weather,
        current_plan=context.current_plan,
    )
    await _emit_reasoning(
        emit_reasoning,
        "Validating timing, geometry, and route consistency.",
    )
    validation_report = await get_plan_validator().validate(plan=plan)
    final_map_highlights = (
        await get_map_highlight_service().build_cards(
            scenes=grounded_scenes,
            vibe=vibe,
            weather=weather,
            plan=plan,
        )
        if grounded_scenes
        else []
    )

    route_action = "replan" if context.current_plan is not None else "plan"
    stage = "replanned" if context.current_plan is not None else "planned"
    reply = await _compose_plan_reply(
        vibe_summary=vibe.summary if vibe else None,
        weather_summary=weather.summary if weather else None,
        plan_summary=plan.summary,
        route_action=route_action,
        is_valid=validation_report.valid,
    )

    return PlannerChatResponse(
        agentReply=reply,
        pendingFields=[],
        needsClarification=not validation_report.valid,
        stage=stage if validation_report.valid else "ready_to_plan",
        routeAction=route_action if validation_report.valid else "hold",
        interpretedVibe=vibe,
        weather=weather,
        scenes=grounded_scenes,
        provisionalMapPoints=provisional_points,
        mapHighlights=final_map_highlights,
        preferences=merged_preferences,
        plan=plan,
    )


def build_planner_flow() -> rt.Flow:
    return rt.Flow(
        name="VibeRoute Planner Flow",
        entry_point=run_planner_turn,
    )


async def _compose_intake_reply(
    *,
    vibe_summary: str | None,
    weather_summary: str | None,
    next_question: str | None,
    mode: str,
) -> str:
    if not has_live_llm():
        raise RuntimeError("Gemini planner phrasing is unavailable.")

    prompt = (
        "Write a crisp, natural planner chat reply.\n"
        f"Mode: {mode}\n"
        f"Vibe summary: {vibe_summary or 'None'}\n"
        f"Weather summary: {weather_summary or 'None'}\n"
        f"Next question: {next_question or 'None'}\n"
        "Reply like a calm human planner.\n"
        "Use 1 to 2 short sentences.\n"
        "Do not use bullet points, labels, or stage narration.\n"
    )
    return await _run_agent_reply(build_intake_coordinator_agent, prompt)


async def _compose_plan_reply(
    *,
    vibe_summary: str | None,
    weather_summary: str | None,
    plan_summary: str,
    route_action: str,
    is_valid: bool,
) -> str:
    if not has_live_llm():
        raise RuntimeError("Gemini planner phrasing is unavailable.")

    prompt = (
        "Write a crisp, natural route-planning reply.\n"
        f"Vibe summary: {vibe_summary or 'None'}\n"
        f"Weather summary: {weather_summary or 'None'}\n"
        f"Plan summary: {plan_summary}\n"
        f"Route action: {route_action}\n"
        f"Plan valid: {is_valid}\n"
        "Reply like a human planner.\n"
        "Use 1 to 2 short sentences.\n"
        "Do not use bullet points, labels, or meta commentary.\n"
    )
    return await _run_agent_reply(build_plan_explainer_agent, prompt)


async def _run_agent_reply(agent_builder, prompt: str) -> str:
    try:
        result = await rt.call(agent_builder(), user_input=prompt)
        reply = result.text if hasattr(result, "text") else str(result)
        reply = reply.strip()
        if not reply:
            raise RuntimeError("Planner agent returned an empty reply.")
        return reply
    except Exception as exc:
        mark_llm_unavailable()
        raise RuntimeError(f"Planner reply generation failed: {exc}") from exc


async def _emit_reasoning(
    emit_reasoning: ReasoningEmitter | None,
    text: str | None,
) -> None:
    if emit_reasoning is None or not text:
        return
    await emit_reasoning(text)


async def _emit_state(
    emit_state: StateEmitter | None,
    state: PlannerChatStateDelta | None,
) -> None:
    if emit_state is None or state is None:
        return
    await emit_state(state)


async def _interpret_images(
    context: PlannerRunContext,
    *,
    emit_reasoning: ReasoningEmitter | None = None,
    emit_state: StateEmitter | None = None,
) -> ImageInterpretationResult:
    if not context.new_images and context.current_scenes:
        return ImageInterpretationResult(
            scenes=context.current_scenes,
            interpretedVibe=context.current_vibe,
        )

    interpreter = get_image_interpreter()
    async def emit_partial_scenes(scenes: list[SceneIntent]) -> None:
        await _emit_state(
            emit_state,
            PlannerChatStateDelta(
                scenes=scenes,
                provisionalMapPoints=build_provisional_map_points(
                    scenes,
                    context.preferences,
                ),
            ),
        )
        if len(context.images) > 1:
            await _emit_reasoning(
                emit_reasoning,
                f"Pinned {len(scenes)} of {len(context.images)} photos on the map.",
            )

    return await interpreter.interpret(
        message=context.message,
        images=context.images,
        preferences=context.preferences,
        emit_scenes=emit_partial_scenes if emit_state is not None else None,
    )


async def _lookup_weather(
    *,
    area_label: str | None,
    latitude: float | None,
    longitude: float | None,
    timezone: str | None,
    include_daylight: bool,
) -> WeatherSnapshot | None:
    if not area_label and (latitude is None or longitude is None):
        return None

    provider = get_weather_provider()
    return await provider.get_weather(
        area_label=area_label,
        latitude=latitude,
        longitude=longitude,
        timezone=timezone,
        include_daylight=include_daylight,
    )


def _build_parallel_stage_message(
    *,
    context: PlannerRunContext,
    area_label: str | None,
) -> str:
    tasks: list[str] = []

    if context.new_images or not context.current_scenes:
        tasks.append("Reading the uploaded photos")
    elif context.current_plan is not None:
        tasks.append("Updating the current plan")
    else:
        tasks.append("Reviewing the current route context")

    if area_label:
        if area_label == "Inferred route area":
            tasks.append("checking weather along the route")
        else:
            tasks.append(f"checking weather near {area_label}")

    if not tasks:
        return "Preparing the planner turn."

    head, *tail = tasks
    if not tail:
        return f"{head}."

    return f"{head} while {' and '.join(tail)}."


def _requires_daylight(scenes: list[SceneIntent]) -> bool:
    return any(
        scene.time_preference in {"sunrise", "sunset"}
        for scene in scenes
    )


def _resolve_planning_area(
    *,
    preferences: IntakePreferences | None,
    scenes: list[SceneIntent],
    current_plan: DayPlan | None,
    weather: WeatherSnapshot | None,
) -> tuple[str | None, float | None, float | None, str | None]:
    if weather and weather.latitude is not None and weather.longitude is not None:
        return weather.area_label, weather.latitude, weather.longitude, weather.timezone

    if preferences and preferences.city:
        return preferences.city, None, None, None

    if current_plan and current_plan.stops:
        first_stop = current_plan.stops[0]
        return current_plan.city, first_stop.lat, first_stop.lng, None

    scene_hint = infer_area_hint_from_scenes(scenes)
    if scene_hint is not None:
        label, lat, lng = scene_hint
        return label, lat, lng, None

    return None, None, None, None
