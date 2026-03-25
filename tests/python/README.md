# Python Tests

Integration tests for QuasarSVM Python bindings.

## Setup

```bash
cd tests/python

# Install local quasar-svm in editable mode
pip install -e ../../bindings/python

# Install test dependencies
pip install -e .[test]
```

This installs:
- Local `quasar-svm` package
- `pytest` - Test framework
- `pytest-xdist` - Parallel test execution
- `pytest-timeout` - Test timeouts

## Running Tests

```bash
# Run all tests (parallel execution enabled by default)
pytest

# Run with specific number of workers
pytest -n 4

# Run without parallel execution
pytest -n 0

# Run specific file
pytest tests/test_basic.py

# Run specific test
pytest tests/test_token.py::TestTokenTransfer::test_transfer_tokens

# Run with pattern matching
pytest -k transfer

# Verbose output
pytest -v

# Show print statements
pytest -s

# Stop on first failure
pytest -x
```

## Adding Test Programs

1. Place `.so` files in `programs/` directory
2. Update tests to remove `@pytest.mark.skip()` decorators
3. Tests will automatically load programs using the `load_test_program` fixture

## Test Organization

```
tests/
  ├── __init__.py
  ├── conftest.py       # Pytest fixtures and configuration
  ├── test_basic.py     # Basic SVM operations
  └── test_token.py     # Token operations
```

## Fixtures (conftest.py)

- `programs_dir` - Path to programs directory
- `test_program_path` - Path to test program .so
- `load_test_program` - Function to load test programs

## Parallel Testing

Tests run in parallel by default using `pytest-xdist`:
- `-n auto` - Auto-detect CPU count
- `-n 4` - Use 4 workers
- `-n 0` - Disable parallel execution

## Configuration

- **pytest.ini** - Pytest configuration
- **pyproject.toml** - Package and test dependencies

## Markers

```bash
# Run only slow tests
pytest -m slow

# Skip slow tests
pytest -m "not slow"

# Run only integration tests
pytest -m integration
```
