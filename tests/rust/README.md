# Rust Tests

Integration tests for QuasarSVM using Rust.

## Setup

```bash
cd tests/rust
cargo build
```

## Running Tests

```bash
# Run all tests
cargo test

# Run with output
cargo test -- --nocapture

# Run specific test
cargo test test_svm_initialization

# Run ignored tests (once test programs are added)
cargo test -- --ignored
```

## Adding Test Programs

1. Place `.so` files in `programs/` directory
2. Update tests to remove `#[ignore]` attribute
3. Tests will automatically load programs using `load_test_program()`

## Test Structure

- `basic_tests` - SVM initialization and basic operations
- `token_tests` - Token-specific operations

## Dependencies

Tests use the local `quasar-svm` crate via path dependency:
```toml
quasar-svm = { path = "../../svm" }
```
