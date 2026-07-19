"""Smoke test — verify the package imports and config loads correctly."""

from airsight.config import ROOT, DATA, CONFIG, load_cities, load_stations


def test_root_exists():
    assert ROOT.exists(), f"ROOT not found: {ROOT}"


def test_data_dir_exists():
    assert DATA.exists(), f"DATA dir not found: {DATA}"


def test_load_cities_returns_list():
    cities = load_cities()
    assert isinstance(cities, list)
    assert len(cities) > 0


def test_load_stations_returns_list():
    stations = load_stations()
    assert isinstance(stations, list)
    assert len(stations) > 0


def test_subpackages_import():
    """All subpackages should import without error."""
    import airsight.io
    import airsight.grid
    import airsight.features
    import airsight.models
    import airsight.attribution
    import airsight.impact
    import airsight.pipeline
