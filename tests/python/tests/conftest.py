"""Pytest configuration and fixtures."""
import os
from pathlib import Path
import pytest


@pytest.fixture
def programs_dir() -> Path:
    """Return path to test programs directory."""
    return Path(__file__).parent.parent / "programs"


@pytest.fixture
def test_program_path(programs_dir: Path) -> Path:
    """Return path to test program .so file."""
    return programs_dir / "test_program.so"


def load_program(programs_dir: Path, name: str) -> bytes:
    """Load a test program binary."""
    path = programs_dir / name
    if not path.exists():
        pytest.skip(f"Test program not found: {name}")
    return path.read_bytes()


@pytest.fixture
def load_test_program(programs_dir: Path):
    """Fixture that returns a function to load test programs."""
    def _load(name: str) -> bytes:
        return load_program(programs_dir, name)
    return _load
