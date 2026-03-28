# PROMPTS.md — VibeRoute

## Current status
Prompt files are not wired yet. This document tracks the prompt surfaces that the server scaffold will expose.

## Planned prompt surfaces
- image analysis prompt:
  turns uploaded images plus city context into validated `SceneIntent[]`
- intake follow-up prompt:
  identifies missing trip constraints and proposes the next direct user question
- revision prompt:
  converts freeform chat edits into a structured revision request

## Agent orchestration note
- Railtracks should own planner-agent orchestration on the Python server
- prompts should stay isolated from FastAPI route handlers even when called through Railtracks agents

## Rules
- prompts live in isolated files, not inline in route handlers
- all model output must be structured JSON
- all model output must be validated with `zod`
