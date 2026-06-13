"""Standard API response envelope — mirrors one-stop-finance pattern."""
from typing import Any


def build_response(data: Any) -> dict:
    return {"data": data, "error": None, "meta": None}


def build_paginated_response(data: list, page: int, per_page: int, total: int) -> dict:
    return {
        "data": data,
        "error": None,
        "meta": {
            "page": page,
            "per_page": per_page,
            "total": total,
            "total_pages": -(-total // per_page),
        },
    }


def build_error(code: str, message: str) -> dict:
    return {"data": None, "error": {"code": code, "message": message}, "meta": None}
