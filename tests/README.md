# QuasarSVM Test Suite

Comprehensive test suite for QuasarSVM across Rust, TypeScript, and Python.

## Directory Structure

```
tests/
├── rust/              # Rust integration tests
├── typescript/        # TypeScript tests (kit + web3.js)
└── python/            # Python tests
```

## Running Tests

### All Tests
```bash
make test-all          # Build all, then run all tests
```

### Individual Language Tests
```bash
make test-rust         # Rust tests
make test-typescript   # TypeScript tests (both kit and web3.js)
make test-python       # Python tests
```

### From Test Directories

#### Rust
```bash
cd tests/rust
cargo test
cargo test -- --nocapture  # Show output
```

#### TypeScript
```bash
cd tests/typescript
npm install
npm test              # Run all tests
npm run test:kit      # Kit layer only
npm run test:web3     # Web3.js layer only
npm run test:watch    # Watch mode
```

#### Python
```bash
cd tests/python
pip install -e ../../bindings/python[test]  # Install local quasar-svm
pip install -e .[test]                       # Install test dependencies
pytest                                       # Run all tests
pytest -n auto                               # Parallel execution
pytest tests/test_basic.py                   # Specific file
pytest -k test_transfer                      # Specific test
pytest -v                                    # Verbose output
```

## Adding Test Programs

1. Place your test `.so` files in the appropriate `programs/` directory:
   - `tests/rust/programs/`
   - `tests/typescript/programs/`
   - `tests/python/programs/`

2. Update the test files to use your test program

3. Remove the `#[ignore]` or `.skip()` annotations from the tests

## Test Organization

### Rust Tests
- Located in `tests/rust/src/lib.rs`
- Uses Rust's built-in test framework
- Run with `cargo test`

### TypeScript Tests
- **Kit Layer**: `tests/typescript/kit/*.test.ts`
  - Uses `@solana/addresses`, `@solana/accounts`
  - Async PDA derivation
- **Web3.js Layer**: `tests/typescript/web3.js/*.test.ts`
  - Uses `@solana/web3.js` Address class
  - Sync PDA derivation
- Uses Vitest for test runner
- Supports parallel execution

### Python Tests
- Located in `tests/python/tests/test_*.py`
- Uses pytest with pytest-xdist for parallel execution
- Fixtures defined in `conftest.py`
- Run with `pytest` or `make test-python`

## Writing New Tests

### Rust
Add new test modules or functions in `tests/rust/src/lib.rs`:
```rust
#[test]
fn test_my_feature() {
    // Your test code
}
```

### TypeScript
Create new `.test.ts` files in `kit/` or `web3.js/`:
```typescript
import { describe, it, expect } from "vitest";

describe("My Feature", () => {
  it("should work", () => {
    expect(true).toBe(true);
  });
});
```

### Python
Create new `test_*.py` files in `tests/python/tests/`:
```python
import pytest

class TestMyFeature:
    def test_something(self):
        assert True
```

## CI/CD Integration

The test suite is designed to work in CI/CD pipelines:

```bash
make test-all  # Single command to build and test everything
```

Exit codes:
- `0` - All tests passed
- `1` - One or more tests failed
