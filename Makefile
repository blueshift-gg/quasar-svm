# ============================================================================
# QuasarSVM Makefile
# ============================================================================
# Unified build, test, and release workflow for Rust, TypeScript, and Python

.PHONY: help build-all test-all release clean
.PHONY: build-rust build-typescript build-python
.PHONY: build-platform-* test-rust test-typescript test-python
.PHONY: publish-rust publish-typescript publish-python dump-programs

# ============================================================================
# Configuration
# ============================================================================

VERSION := $(shell node -p "require('./package.json').version")

# Platform targets
RUST_TARGETS := \
	aarch64-apple-darwin \
	x86_64-apple-darwin \
	x86_64-unknown-linux-gnu \
	aarch64-unknown-linux-gnu \
	x86_64-pc-windows-gnu

NPM_PLATFORMS := darwin-arm64 darwin-x64 linux-x64-gnu linux-arm64-gnu win32-x64-msvc
PYTHON_PLATFORMS := darwin-arm64 darwin-x64 linux-x64 linux-arm64 win-x64

# Directories
PYTHON_DIR := bindings/python
TS_DIR := .
PROGRAMS_DIR := programs

# ============================================================================
# Help
# ============================================================================

help:
	@echo "QuasarSVM Build System"
	@echo ""
	@echo "Building:"
	@echo "  make build-all              Build all platforms and languages"
	@echo "  make build-rust             Build Rust library for current platform"
	@echo "  make build-typescript       Build TypeScript package"
	@echo "  make build-python           Build Python wheel for current platform"
	@echo "  make build-platform-<name>  Build specific platform (darwin-arm64, linux-x64, etc.)"
	@echo ""
	@echo "Testing:"
	@echo "  make test-all               Run all tests (builds first)"
	@echo "  make test-rust              Run Rust tests"
	@echo "  make test-typescript        Run TypeScript tests"
	@echo "  make test-python            Run Python tests"
	@echo ""
	@echo "Release:"
	@echo "  make release V=0.2.0        Bump version, build all, publish all"
	@echo "  make publish-rust           Publish Rust crate to crates.io"
	@echo "  make publish-typescript     Publish TypeScript to npm (all platforms)"
	@echo "  make publish-python         Publish Python to PyPI (all platforms)"
	@echo ""
	@echo "Utilities:"
	@echo "  make dump-programs          Download SPL program binaries from mainnet"
	@echo "  make clean                  Remove all build artifacts"
	@echo "  make dev-setup              Create symlinks for development"

# ============================================================================
# Platform Builds
# ============================================================================

build-platform-darwin-arm64:
	@echo "Building darwin-arm64..."
	cargo build --release -p quasar-svm-ffi --target aarch64-apple-darwin
	cp target/aarch64-apple-darwin/release/libquasar_svm.dylib npm/darwin-arm64/
	cp target/aarch64-apple-darwin/release/libquasar_svm.dylib libquasar_svm.dylib

build-platform-darwin-x64:
	@echo "Building darwin-x64..."
	cargo build --release -p quasar-svm-ffi --target x86_64-apple-darwin
	cp target/x86_64-apple-darwin/release/libquasar_svm.dylib npm/darwin-x64/
	cp target/x86_64-apple-darwin/release/libquasar_svm.dylib libquasar_svm_x64.dylib

build-platform-linux-x64:
	@echo "Building linux-x64..."
	cargo zigbuild --release -p quasar-svm-ffi --target x86_64-unknown-linux-gnu
	cp target/x86_64-unknown-linux-gnu/release/libquasar_svm.so npm/linux-x64-gnu/
	cp target/x86_64-unknown-linux-gnu/release/libquasar_svm.so libquasar_svm_x64.so

build-platform-linux-arm64:
	@echo "Building linux-arm64..."
	cargo zigbuild --release -p quasar-svm-ffi --target aarch64-unknown-linux-gnu
	cp target/aarch64-unknown-linux-gnu/release/libquasar_svm.so npm/linux-arm64-gnu/
	cp target/aarch64-unknown-linux-gnu/release/libquasar_svm.so libquasar_svm_arm64.so

build-platform-win-x64:
	@echo "Building win-x64..."
	cargo zigbuild --release -p quasar-svm-ffi --target x86_64-pc-windows-gnu
	cp target/x86_64-pc-windows-gnu/release/quasar_svm.dll npm/win32-x64-msvc/
	cp target/x86_64-pc-windows-gnu/release/quasar_svm.dll quasar_svm.dll

# ============================================================================
# Language Package Builds
# ============================================================================

build-rust:
	@echo "Building Rust library..."
	cargo build --release -p quasar-svm-ffi

build-typescript: build-rust
	@echo "Building TypeScript package..."
	npx tsc
	@echo "✅ TypeScript build complete"

build-python: build-rust
	@echo "Building Python wheel for current platform..."
	@mkdir -p $(PYTHON_DIR)/quasar_svm
ifeq ($(shell uname -s),Darwin)
	cp target/release/libquasar_svm.dylib $(PYTHON_DIR)/quasar_svm/
else ifeq ($(OS),Windows_NT)
	cp target/release/quasar_svm.dll $(PYTHON_DIR)/quasar_svm/
else
	cp target/release/libquasar_svm.so $(PYTHON_DIR)/quasar_svm/
endif
	cd $(PYTHON_DIR) && python3 -m build --wheel
	@echo "✅ Python wheel built in $(PYTHON_DIR)/dist/"

build-python-all:
	@echo "Building Python wheels for all platforms..."
	@$(MAKE) --no-print-directory build-platform-darwin-arm64
	@$(MAKE) --no-print-directory _build-python-wheel PLAT=darwin-arm64 TARGET=aarch64-apple-darwin PLATTAG=macosx_11_0_arm64
	@$(MAKE) --no-print-directory build-platform-darwin-x64
	@$(MAKE) --no-print-directory _build-python-wheel PLAT=darwin-x64 TARGET=x86_64-apple-darwin PLATTAG=macosx_10_12_x86_64
	@$(MAKE) --no-print-directory build-platform-linux-x64
	@$(MAKE) --no-print-directory _build-python-wheel PLAT=linux-x64 TARGET=x86_64-unknown-linux-gnu PLATTAG=manylinux_2_17_x86_64
	@$(MAKE) --no-print-directory build-platform-linux-arm64
	@$(MAKE) --no-print-directory _build-python-wheel PLAT=linux-arm64 TARGET=aarch64-unknown-linux-gnu PLATTAG=manylinux_2_17_aarch64
	@$(MAKE) --no-print-directory build-platform-win-x64
	@$(MAKE) --no-print-directory _build-python-wheel PLAT=win-x64 TARGET=x86_64-pc-windows-gnu PLATTAG=win_amd64
	@echo "✅ All Python wheels built in $(PYTHON_DIR)/dist/"
	@ls -lh $(PYTHON_DIR)/dist/*.whl

_build-python-wheel:
	@echo "📦 Building Python wheel for $(PLAT)..."
	@mkdir -p $(PYTHON_DIR)/quasar_svm
	@rm -f $(PYTHON_DIR)/quasar_svm/*.{dylib,so,dll}
ifeq ($(findstring darwin,$(TARGET)),darwin)
	cp target/$(TARGET)/release/libquasar_svm.dylib $(PYTHON_DIR)/quasar_svm/
else ifeq ($(findstring windows,$(TARGET)),windows)
	cp target/$(TARGET)/release/quasar_svm.dll $(PYTHON_DIR)/quasar_svm/
else
	cp target/$(TARGET)/release/libquasar_svm.so $(PYTHON_DIR)/quasar_svm/
endif
	cd $(PYTHON_DIR) && python3 -m build --wheel --config-setting="--plat-name=$(PLATTAG)"
	@rm -f $(PYTHON_DIR)/quasar_svm/*.{dylib,so,dll}

# ============================================================================
# Build All
# ============================================================================

build-all:
	@echo "Building all platforms and languages..."
	@$(MAKE) --no-print-directory build-platform-darwin-arm64
	@$(MAKE) --no-print-directory build-platform-darwin-x64
	@$(MAKE) --no-print-directory build-platform-linux-x64
	@$(MAKE) --no-print-directory build-platform-linux-arm64
	@$(MAKE) --no-print-directory build-platform-win-x64
	@$(MAKE) --no-print-directory build-typescript
	@$(MAKE) --no-print-directory build-python-all
	@echo "✅ All platforms and languages built successfully"

# ============================================================================
# Testing
# ============================================================================

test-rust:
	@echo "Running Rust tests..."
	cargo test --all-features
	@echo "Running Rust integration tests..."
	cd tests/rust && cargo test

test-typescript: build-typescript
	@echo "Running TypeScript tests..."
	npm test
	@echo "Running TypeScript integration tests..."
	cd tests/typescript && npm install && npm test

test-python: build-python
	@echo "Running Python tests..."
	cd $(PYTHON_DIR) && python3 -m pytest tests/
	@echo "Running Python integration tests..."
	cd tests/python && python3 -m pytest

test-all: build-all
	@echo "Running all tests..."
	@$(MAKE) --no-print-directory test-rust
	@$(MAKE) --no-print-directory test-typescript
	@$(MAKE) --no-print-directory test-python
	@echo "✅ All tests passed"

# ============================================================================
# Publishing
# ============================================================================

publish-rust:
	@echo "Publishing Rust crate to crates.io..."
	cd svm && cargo publish
	@echo "✅ Rust crate published"

publish-typescript:
	@echo "Publishing TypeScript packages..."
	@for plat in $(NPM_PLATFORMS); do \
		echo "Publishing @blueshift-gg/quasar-svm-$$plat..."; \
		cd npm/$$plat && npm publish --access public && cd ../..; \
	done
	npm publish --access public
	@echo "✅ TypeScript packages published"

publish-python:
	@echo "Publishing Python wheels to PyPI..."
	@if [ ! -f $(PYTHON_DIR)/dist/*.whl ]; then \
		echo "❌ No wheels found. Run 'make build-python-all' first"; \
		exit 1; \
	fi
	cd $(PYTHON_DIR) && python3 -m twine upload dist/*.whl
	@echo "✅ Python package published to PyPI"

# ============================================================================
# Release Workflow
# ============================================================================

release:
ifndef V
	$(error V is required, e.g. make release V=0.2.0)
endif
	@echo "🚀 Releasing version $(V)..."
	@echo "Step 1: Updating version numbers..."
	@$(MAKE) --no-print-directory _update-versions V=$(V)
	@echo "Step 2: Building all platforms..."
	@$(MAKE) --no-print-directory build-all
	@echo "Step 3: Running tests..."
	@$(MAKE) --no-print-directory test-all
	@echo "Step 4: Publishing Rust..."
	@$(MAKE) --no-print-directory publish-rust
	@echo "Step 5: Publishing TypeScript..."
	@$(MAKE) --no-print-directory publish-typescript
	@echo "Step 6: Publishing Python..."
	@$(MAKE) --no-print-directory publish-python
	@echo "Step 7: Committing and tagging..."
	git add -A
	git commit -m "release: v$(V)"
	git tag -a v$(V) -m "Release v$(V)"
	git push && git push --tags
	@echo "✅ Release $(V) complete!"

_update-versions:
	@echo "Updating Rust version..."
	sed -i.bak 's/^version = ".*"/version = "$(V)"/' svm/Cargo.toml
	sed -i.bak 's/^version = ".*"/version = "$(V)"/' ffi/Cargo.toml
	rm -f svm/Cargo.toml.bak ffi/Cargo.toml.bak
	@echo "Updating TypeScript versions..."
	@node -e "\
		const fs = require('fs'); \
		const files = ['package.json', ...fs.readdirSync('npm').map(d => 'npm/' + d + '/package.json')]; \
		for (const f of files) { \
			const pkg = JSON.parse(fs.readFileSync(f, 'utf8')); \
			pkg.version = '$(V)'; \
			fs.writeFileSync(f, JSON.stringify(pkg, null, 2) + '\n'); \
		} \
		const root = JSON.parse(fs.readFileSync('package.json', 'utf8')); \
		if (root.optionalDependencies) { \
			for (const k of Object.keys(root.optionalDependencies)) { \
				root.optionalDependencies[k] = '^$(V)'; \
			} \
			fs.writeFileSync('package.json', JSON.stringify(root, null, 2) + '\n'); \
		}"
	@echo "Updating Python version..."
	sed -i.bak 's/^version = ".*"/version = "$(V)"/' $(PYTHON_DIR)/pyproject.toml
	rm -f $(PYTHON_DIR)/pyproject.toml.bak
	@echo "✅ All versions updated to $(V)"

# ============================================================================
# Program Dumping
# ============================================================================

dump-programs:
	@echo "Downloading SPL program binaries from Solana mainnet..."
	@mkdir -p $(PROGRAMS_DIR)
	@echo "Downloading SPL Token program..."
	solana program dump -u m TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA $(PROGRAMS_DIR)/spl_token.so
	@echo "Downloading SPL Token-2022 program..."
	solana program dump -u m TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb $(PROGRAMS_DIR)/spl_token_2022.so
	@echo "Downloading SPL Associated Token Account program..."
	solana program dump -u m ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL $(PROGRAMS_DIR)/spl_associated_token.so
	@echo "Copying programs to bindings directories..."
	cp $(PROGRAMS_DIR)/*.so bindings/node/programs/
	cp $(PROGRAMS_DIR)/*.so $(PYTHON_DIR)/programs/
	@echo "✅ Programs dumped and copied to:"
	@echo "   - $(PROGRAMS_DIR)/"
	@echo "   - bindings/node/programs/"
	@echo "   - $(PYTHON_DIR)/programs/"
	@ls -lh $(PROGRAMS_DIR)/*.so

# ============================================================================
# Development Setup
# ============================================================================

dev-setup:
	@echo "Setting up development environment..."
	@$(MAKE) --no-print-directory _link-python
	@$(MAKE) --no-print-directory _link-node
	@echo "✅ Development environment ready!"
	@echo "   Python and TypeScript bindings now use symlinks to target/release/"
	@echo "   Just run 'cargo build --release' and all bindings are updated."

_link-python:
	@echo "Creating symlink for Python bindings..."
	@mkdir -p $(PYTHON_DIR)/quasar_svm
	@rm -f $(PYTHON_DIR)/quasar_svm/*.{dylib,so,dll}
ifeq ($(shell uname -s),Darwin)
	ln -sf ../../../target/release/libquasar_svm.dylib $(PYTHON_DIR)/quasar_svm/libquasar_svm.dylib
	@echo "✅ Python: Linked libquasar_svm.dylib"
else ifeq ($(OS),Windows_NT)
	cmd /c mklink $(PYTHON_DIR)\quasar_svm\quasar_svm.dll ..\..\..\target\release\quasar_svm.dll
	@echo "✅ Python: Linked quasar_svm.dll"
else
	ln -sf ../../../target/release/libquasar_svm.so $(PYTHON_DIR)/quasar_svm/libquasar_svm.so
	@echo "✅ Python: Linked libquasar_svm.so"
endif

_link-node:
	@echo "Creating symlinks for Node.js bindings..."
	@mkdir -p bindings/node
ifeq ($(shell uname -s),Darwin)
	ln -sf ../../target/release/libquasar_svm.dylib bindings/node/libquasar_svm.dylib
	@echo "✅ Node.js: Linked libquasar_svm.dylib"
else ifeq ($(OS),Windows_NT)
	cmd /c mklink bindings\node\quasar_svm.dll ..\..\target\release\quasar_svm.dll
	@echo "✅ Node.js: Linked quasar_svm.dll"
else
	ln -sf ../../target/release/libquasar_svm.so bindings/node/libquasar_svm.so
	@echo "✅ Node.js: Linked libquasar_svm.so"
endif

# ============================================================================
# Cleanup
# ============================================================================

clean:
	@echo "Cleaning build artifacts..."
	cargo clean
	rm -rf dist
	rm -rf $(PYTHON_DIR)/dist $(PYTHON_DIR)/build $(PYTHON_DIR)/*.egg-info
	rm -rf $(PYTHON_DIR)/.pytest_cache $(PYTHON_DIR)/quasar_svm/__pycache__ $(PYTHON_DIR)/tests/__pycache__
	rm -f libquasar_svm*.{dylib,so} quasar_svm.dll
	@# Only remove if NOT a symlink
	@if [ -f bindings/node/libquasar_svm.dylib ] && [ ! -L bindings/node/libquasar_svm.dylib ]; then rm -f bindings/node/libquasar_svm.dylib; fi
	@if [ -f bindings/node/libquasar_svm.so ] && [ ! -L bindings/node/libquasar_svm.so ]; then rm -f bindings/node/libquasar_svm.so; fi
	@if [ -f $(PYTHON_DIR)/quasar_svm/libquasar_svm.dylib ] && [ ! -L $(PYTHON_DIR)/quasar_svm/libquasar_svm.dylib ]; then rm -f $(PYTHON_DIR)/quasar_svm/libquasar_svm.dylib; fi
	@if [ -f $(PYTHON_DIR)/quasar_svm/libquasar_svm.so ] && [ ! -L $(PYTHON_DIR)/quasar_svm/libquasar_svm.so ]; then rm -f $(PYTHON_DIR)/quasar_svm/libquasar_svm.so; fi
	@echo "✅ Clean complete"
