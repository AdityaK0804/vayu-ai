"""Shared helpers for all AirSight fetch scripts."""
from pathlib import Path
import yaml

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
CONFIG = ROOT / "config" / "cities.yaml"


def load_config():
    with open(CONFIG) as f:
        return yaml.safe_load(f)


def get_cities(only=None, include_optional=False):
    """Return city dicts merged with defaults.

    only: list of city ids to restrict to (e.g. ["korba"])
    include_optional: include role=validation_optional cities (Bhilai/Bilaspur)
    """
    cfg = load_config()
    defaults = cfg["defaults"]
    out = []
    for c in cfg["cities"]:
        if only and c["id"] not in only:
            continue
        if not only and not include_optional and c["role"] == "validation_optional":
            continue
        merged = {**defaults, **c}
        out.append(merged)
    return out


def get_state():
    return load_config()["state"]


def ensure(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def say(msg):
    print(f"  {msg}", flush=True)


def ok(msg):
    print(f"  [OK] {msg}", flush=True)


def warn(msg):
    print(f"  [!]  {msg}", flush=True)
