"""
Feature registry — auto-discovers every sub-directory of features/ that
contains a manifest.py and a router.py, then mounts them onto FastAPI.

Adding a new feature = drop a folder in features/ with those two files.
"""
import importlib
import logging
from pathlib import Path
from fastapi import FastAPI

logger = logging.getLogger(__name__)

_registry: dict[str, dict] = {}


def discover(features_dir: Path) -> None:
    for item in sorted(features_dir.iterdir()):
        if not item.is_dir():
            continue
        if not (item / "manifest.py").exists() or not (item / "router.py").exists():
            continue
        feature_id = item.name
        try:
            manifest_mod = importlib.import_module(f"features.{feature_id}.manifest")
            router_mod = importlib.import_module(f"features.{feature_id}.router")
            _registry[feature_id] = {
                "manifest": manifest_mod.MANIFEST,
                "router": router_mod.router,
            }
            logger.info(f"Registered feature: {feature_id}")
        except Exception as e:
            logger.error(f"Failed to load feature '{feature_id}': {e}")


def mount_all(app: FastAPI, prefix: str) -> None:
    for feature_id, feature in _registry.items():
        app.include_router(
            feature["router"],
            prefix=f"{prefix}/{feature_id}",
            tags=[feature["manifest"]["label"]],
        )
        logger.info(f"Mounted /{feature_id} at {prefix}/{feature_id}")


def get_manifests() -> list[dict]:
    return [f["manifest"] for f in _registry.values()]
