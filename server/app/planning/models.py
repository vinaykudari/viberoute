from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from ..models import (
    DayPlan,
    IntakeField,
    IntakePreferences,
    InterpretedVibe,
    PlannerChatImage,
    PlannerChatRequest,
    PlannerChatResponse,
    ProvisionalMapPoint,
    SceneIntent,
    WeatherSnapshot,
)


class PlannerRunContext(BaseModel):
    message: str
    images: list[PlannerChatImage] = Field(default_factory=list)
    new_images: list[PlannerChatImage] = Field(default_factory=list)
    preferences: IntakePreferences | None = None
    current_vibe: InterpretedVibe | None = None
    current_scenes: list[SceneIntent] = Field(default_factory=list)
    current_plan: DayPlan | None = None
    pending_fields: list[IntakeField] = Field(default_factory=list)

    @classmethod
    def from_request(cls, payload: PlannerChatRequest) -> "PlannerRunContext":
        return cls(
            message=payload.message,
            images=payload.images,
            new_images=payload.new_images,
            preferences=payload.preferences,
            current_vibe=payload.interpreted_vibe,
            current_scenes=payload.scenes,
            current_plan=payload.plan,
            pending_fields=payload.pending_fields,
        )


class ImageInterpretationResult(BaseModel):
    scenes: list[SceneIntent] = Field(default_factory=list)
    interpreted_vibe: InterpretedVibe | None = Field(
        default=None, alias="interpretedVibe"
    )
    error_message: str | None = Field(default=None, alias="errorMessage")

    model_config = {"populate_by_name": True}


class ValidationIssue(BaseModel):
    code: str
    message: str
    severity: Literal["warning", "error"]


class PlanValidationReport(BaseModel):
    valid: bool
    issues: list[ValidationIssue] = Field(default_factory=list)


class PlannerTurnResult(BaseModel):
    response: PlannerChatResponse
    weather: WeatherSnapshot | None = None
    vibe: InterpretedVibe | None = None
    scenes: list[SceneIntent] = Field(default_factory=list)
    provisional_map_points: list[ProvisionalMapPoint] = Field(default_factory=list)
