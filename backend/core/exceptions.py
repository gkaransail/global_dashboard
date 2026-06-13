"""Structured exception handling — mirrors one-stop-finance pattern."""
from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse


class AppException(HTTPException):
    def __init__(self, status_code: int, code: str, message: str):
        super().__init__(status_code=status_code)
        self.code = code
        self.message = message


async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"data": None, "error": {"code": exc.code, "message": exc.message}, "meta": None},
    )


async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"data": None, "error": {"code": "HTTP_ERROR", "message": str(exc.detail)}, "meta": None},
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=500,
        content={"data": None, "error": {"code": "INTERNAL_ERROR", "message": "An unexpected error occurred"}, "meta": None},
    )
