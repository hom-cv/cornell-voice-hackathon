from fastapi import APIRouter

from app.api.endpoints.v1 import aircraft, auth, capture, handoff

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(aircraft.router)

api_router.include_router(capture.router)

api_router.include_router(handoff.router)
