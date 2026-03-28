from __future__ import annotations

from ..models import DayPlan
from ..planning.models import PlanValidationReport, ValidationIssue


class PlanValidator:
    async def validate(self, *, plan: DayPlan) -> PlanValidationReport:
        issues: list[ValidationIssue] = []

        if not plan.stops:
            issues.append(
                ValidationIssue(
                    code="no_stops",
                    message="The generated route does not contain any stops.",
                    severity="error",
                )
            )

        previous_end = None
        for stop in plan.stops:
            if previous_end and stop.start_time_iso < previous_end:
                issues.append(
                    ValidationIssue(
                        code="time_overlap",
                        message=f"{stop.title} overlaps the previous stop window.",
                        severity="error",
                    )
                )
            previous_end = stop.end_time_iso

        return PlanValidationReport(
            valid=not any(issue.severity == "error" for issue in issues),
            issues=issues,
        )


def get_plan_validator() -> PlanValidator:
    return PlanValidator()
