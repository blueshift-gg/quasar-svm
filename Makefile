VERSION := $(shell node -p "require('./package.json').version")

PLATFORMS := darwin-arm64 darwin-x64 linux-x64-gnu linux-arm64-gnu win32-x64-msvc

RUST_TARGETS := aarch64-apple-darwin x86_64-apple-darwin x86_64-unknown-linux-gnu aarch64-unknown-linux-gnu x86_64-pc-windows-gnu

PYTHON_DIR := bindings/python
GO_DIR := bindings/go

.PHONY: build build-all clean copy-binary prepublish publish publish-platform version
.PHONY: build-python-wheel publish-python clean-python link-python link-node dev-setup
.PHONY: test-go link-go clean-go build-go-all build-go-local clean-go-libs

build:
	cargo build --release -p quasar-svm-ffi
	npx tsc

# Development setup: Create symlinks instead of copying binaries.
# This makes development faster - build once, all bindings see the update.
dev-setup: link-python link-node link-go
	@echo "✅ Development environment ready!"
	@echo "   Python, TypeScript, and Go bindings now use symlinks to target/release/"
	@echo "   Just run 'cargo build --release' and all bindings are updated."

# Create symlink for Python bindings (development only).
link-python:
	@echo "Creating symlink for Python bindings..."
	@mkdir -p $(PYTHON_DIR)/quasar_svm
	@rm -f $(PYTHON_DIR)/quasar_svm/*.dylib $(PYTHON_DIR)/quasar_svm/*.so $(PYTHON_DIR)/quasar_svm/*.dll
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

# Create symlinks for Node.js bindings (development only).
link-node:
	@echo "Creating symlinks for Node.js bindings..."
ifeq ($(shell uname -s),Darwin)
ifeq ($(shell uname -m),arm64)
	@mkdir -p bindings/node
	ln -sf ../../target/release/libquasar_svm.dylib bindings/node/libquasar_svm.dylib
	@echo "✅ Node.js: Linked libquasar_svm.dylib (arm64)"
else
	@mkdir -p bindings/node
	ln -sf ../../target/release/libquasar_svm.dylib bindings/node/libquasar_svm.dylib
	@echo "✅ Node.js: Linked libquasar_svm.dylib (x64)"
endif
else ifeq ($(OS),Windows_NT)
	@mkdir -p bindings/node
	cmd /c mklink bindings\node\quasar_svm.dll ..\..\target\release\quasar_svm.dll
	@echo "✅ Node.js: Linked quasar_svm.dll"
else
	@mkdir -p bindings/node
	ln -sf ../../target/release/libquasar_svm.so bindings/node/libquasar_svm.so
	@echo "✅ Node.js: Linked libquasar_svm.so"
endif

# Create symlink for Go bindings (development only).
# Go uses CGo with -lquasar_svm, so we symlink the library into the Go dir
# so the rpath in the #cgo directive resolves correctly.
link-go:
	@echo "Setting up Go bindings..."
	@cd $(GO_DIR) && go mod tidy
	@echo "✅ Go: Ready (CGo links against target/release/ via rpath)"

# Run Go binding tests (dev mode — links against target/release/).
test-go: build
	cd $(GO_DIR) && go test -tags quasar_dev -v -count=1 .

# Run Go binding tests without rebuilding the native library.
test-go-only:
	cd $(GO_DIR) && go test -tags quasar_dev -v -count=1 .

# Clean Go build cache for this module.
clean-go:
	cd $(GO_DIR) && go clean -cache -testcache

# Build Go bindings with vendored static libraries for all platforms.
# This copies prebuilt .a files into libquasar_svm_vendor/ so consumers
# can `go get` without needing Rust/Cargo or any runtime dependencies.
build-go-all:
	@echo "Copying static libraries into Go vendor directory..."
	cp target/aarch64-apple-darwin/release/libquasar_svm.a  $(GO_DIR)/libquasar_svm_vendor/libquasar_svm_darwin_arm64.a
	cp target/x86_64-apple-darwin/release/libquasar_svm.a   $(GO_DIR)/libquasar_svm_vendor/libquasar_svm_darwin_amd64.a
	cp target/x86_64-unknown-linux-gnu/release/libquasar_svm.a $(GO_DIR)/libquasar_svm_vendor/libquasar_svm_linux_amd64.a
	cp target/aarch64-unknown-linux-gnu/release/libquasar_svm.a $(GO_DIR)/libquasar_svm_vendor/libquasar_svm_linux_arm64.a
	cp target/x86_64-pc-windows-gnu/release/libquasar_svm.a $(GO_DIR)/libquasar_svm_vendor/libquasar_svm_windows_amd64.a
	@echo "✅ Go: Static libraries vendored for all platforms"
	@ls -lh $(GO_DIR)/libquasar_svm_vendor/*.a

# Copy the current platform's static library into the Go vendor directory.
build-go-local: build
ifeq ($(shell uname -s),Darwin)
ifeq ($(shell uname -m),arm64)
	cp target/release/libquasar_svm.a $(GO_DIR)/libquasar_svm_vendor/libquasar_svm_darwin_arm64.a
	@echo "✅ Go: Vendored libquasar_svm.a (darwin/arm64)"
else
	cp target/release/libquasar_svm.a $(GO_DIR)/libquasar_svm_vendor/libquasar_svm_darwin_amd64.a
	@echo "✅ Go: Vendored libquasar_svm.a (darwin/amd64)"
endif
else ifeq ($(OS),Windows_NT)
	cp target/release/libquasar_svm.a $(GO_DIR)/libquasar_svm_vendor/libquasar_svm_windows_amd64.a
	@echo "✅ Go: Vendored libquasar_svm.a (windows/amd64)"
else
ifeq ($(shell uname -m),aarch64)
	cp target/release/libquasar_svm.a $(GO_DIR)/libquasar_svm_vendor/libquasar_svm_linux_arm64.a
	@echo "✅ Go: Vendored libquasar_svm.a (linux/arm64)"
else
	cp target/release/libquasar_svm.a $(GO_DIR)/libquasar_svm_vendor/libquasar_svm_linux_amd64.a
	@echo "✅ Go: Vendored libquasar_svm.a (linux/amd64)"
endif
endif

# Clean Go vendored static libraries.
clean-go-libs:
	rm -f $(GO_DIR)/libquasar_svm_vendor/*.a

# Build native libraries for all platforms, copy to package root + npm dirs.
build-all:
	cargo build --release -p quasar-svm-ffi --target aarch64-apple-darwin
	cargo build --release -p quasar-svm-ffi --target x86_64-apple-darwin
	cargo zigbuild --release -p quasar-svm-ffi --target x86_64-unknown-linux-gnu
	cargo zigbuild --release -p quasar-svm-ffi --target aarch64-unknown-linux-gnu
	cargo zigbuild --release -p quasar-svm-ffi --target x86_64-pc-windows-gnu
	cp target/aarch64-apple-darwin/release/libquasar_svm.dylib  libquasar_svm.dylib
	cp target/x86_64-apple-darwin/release/libquasar_svm.dylib   libquasar_svm_x64.dylib
	cp target/x86_64-unknown-linux-gnu/release/libquasar_svm.so libquasar_svm_x64.so
	cp target/aarch64-unknown-linux-gnu/release/libquasar_svm.so libquasar_svm_arm64.so
	cp target/x86_64-pc-windows-gnu/release/quasar_svm.dll      quasar_svm.dll
	cp target/aarch64-apple-darwin/release/libquasar_svm.dylib  npm/darwin-arm64/libquasar_svm.dylib
	cp target/x86_64-apple-darwin/release/libquasar_svm.dylib   npm/darwin-x64/libquasar_svm.dylib
	cp target/x86_64-unknown-linux-gnu/release/libquasar_svm.so npm/linux-x64-gnu/libquasar_svm.so
	cp target/aarch64-unknown-linux-gnu/release/libquasar_svm.so npm/linux-arm64-gnu/libquasar_svm.so
	cp target/x86_64-pc-windows-gnu/release/quasar_svm.dll      npm/win32-x64-msvc/quasar_svm.dll
	cp target/aarch64-apple-darwin/release/libquasar_svm.a  $(GO_DIR)/libquasar_svm_vendor/libquasar_svm_darwin_arm64.a
	cp target/x86_64-apple-darwin/release/libquasar_svm.a   $(GO_DIR)/libquasar_svm_vendor/libquasar_svm_darwin_amd64.a
	cp target/x86_64-unknown-linux-gnu/release/libquasar_svm.a $(GO_DIR)/libquasar_svm_vendor/libquasar_svm_linux_amd64.a
	cp target/aarch64-unknown-linux-gnu/release/libquasar_svm.a $(GO_DIR)/libquasar_svm_vendor/libquasar_svm_linux_arm64.a
	cp target/x86_64-pc-windows-gnu/release/libquasar_svm.a $(GO_DIR)/libquasar_svm_vendor/libquasar_svm_windows_amd64.a
	npx tsc
	@echo "All platform binaries built and copied."

clean: clean-python
	rm -rf dist target

# Copy a pre-built binary into the correct platform package directory.
# Usage: make copy-binary PLATFORM=darwin-arm64 BINARY=path/to/libquasar_svm.dylib
copy-binary:
ifndef PLATFORM
	$(error PLATFORM is required, e.g. make copy-binary PLATFORM=darwin-arm64 BINARY=path/to/lib)
endif
ifndef BINARY
	$(error BINARY is required, e.g. make copy-binary PLATFORM=darwin-arm64 BINARY=path/to/lib)
endif
	cp $(BINARY) npm/$(PLATFORM)/

# Copy the local build into the current platform's package dir.
copy-local:
ifeq ($(shell uname -s),Darwin)
ifeq ($(shell uname -m),arm64)
	cp target/release/libquasar_svm.dylib npm/darwin-arm64/
else
	cp target/release/libquasar_svm.dylib npm/darwin-x64/
endif
else
ifeq ($(shell uname -m),aarch64)
	cp target/release/libquasar_svm.so npm/linux-arm64-gnu/
else
	cp target/release/libquasar_svm.so npm/linux-x64-gnu/
endif
endif

# Verify that binaries exist before publishing.
prepublish: build
	@for plat in $(PLATFORMS); do \
		count=$$(ls npm/$$plat/*.dylib npm/$$plat/*.so npm/$$plat/*.dll 2>/dev/null | wc -l); \
		if [ $$count -eq 0 ]; then \
			echo "WARNING: no binary in npm/$$plat/"; \
		else \
			echo "OK: npm/$$plat/"; \
		fi \
	done

# Publish a single platform package.
# Usage: make publish-platform PLATFORM=darwin-arm64
publish-platform:
ifndef PLATFORM
	$(error PLATFORM is required)
endif
	cd npm/$(PLATFORM) && npm publish --access public

# Publish all platform packages, then the main package.
publish: prepublish
	@for plat in $(PLATFORMS); do \
		echo "Publishing @blueshift-gg/quasar-svm-$$plat..."; \
		cd npm/$$plat && npm publish --access public && cd ../..; \
	done
	npm publish --access public

# Bump version in all package.json files at once.
# Usage: make version V=0.2.0
version:
ifndef V
	$(error V is required, e.g. make version V=0.2.0)
endif
	node -e "\
		const fs = require('fs'); \
		const files = ['package.json', ...fs.readdirSync('npm').map(d => 'npm/' + d + '/package.json')]; \
		for (const f of files) { \
			const pkg = JSON.parse(fs.readFileSync(f, 'utf8')); \
			pkg.version = '$(V)'; \
			fs.writeFileSync(f, JSON.stringify(pkg, null, 2) + '\n'); \
			console.log('Updated', f, '->', '$(V)'); \
		} \
		const root = JSON.parse(fs.readFileSync('package.json', 'utf8')); \
		if (root.optionalDependencies) { \
			for (const k of Object.keys(root.optionalDependencies)) { \
				root.optionalDependencies[k] = '$(V)'; \
			} \
			fs.writeFileSync('package.json', JSON.stringify(root, null, 2) + '\n'); \
			console.log('Updated optionalDependencies ->', '$(V)'); \
		}"

# ============================================================================
# Python wheel building targets
# ============================================================================
#
# Workflow:
#   1. Build all platform wheels: make build-python-all
#   2. Publish to PyPI: make publish-python
#
# Requirements:
#   - pip install build twine
#   - PyPI API token (set as TWINE_PASSWORD with TWINE_USERNAME=__token__)
#   - cargo-zigbuild for cross-compilation: cargo install cargo-zigbuild
#
# Platform tags:
#   - macOS arm64: macosx_11_0_arm64
#   - macOS x64:   macosx_10_12_x86_64
#   - Linux x64:   manylinux_2_17_x86_64
#   - Linux arm64: manylinux_2_17_aarch64
#   - Windows x64: win_amd64
#
# ============================================================================

PYTHON_PLATFORMS := darwin-arm64 darwin-x64 linux-x64 linux-arm64 win-x64

# Build Python wheel for the CURRENT platform only.
# Usage: make build-python-wheel
build-python-wheel: build
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
	@echo "✅ Wheel built in $(PYTHON_DIR)/dist/"

# Build Python wheels for ALL platforms (cross-compiled).
# This builds native libraries for all targets, then creates platform-specific wheels.
build-python-all:
	@echo "Building native libraries for all platforms..."
	cargo build --release -p quasar-svm-ffi --target aarch64-apple-darwin
	cargo build --release -p quasar-svm-ffi --target x86_64-apple-darwin
	cargo zigbuild --release -p quasar-svm-ffi --target x86_64-unknown-linux-gnu
	cargo zigbuild --release -p quasar-svm-ffi --target aarch64-unknown-linux-gnu
	cargo zigbuild --release -p quasar-svm-ffi --target x86_64-pc-windows-gnu
	@echo "Building Python wheels for each platform..."
	@$(MAKE) --no-print-directory build-python-platform PLAT=darwin-arm64
	@$(MAKE) --no-print-directory build-python-platform PLAT=darwin-x64
	@$(MAKE) --no-print-directory build-python-platform PLAT=linux-x64
	@$(MAKE) --no-print-directory build-python-platform PLAT=linux-arm64
	@$(MAKE) --no-print-directory build-python-platform PLAT=win-x64
	@echo "✅ All wheels built in $(PYTHON_DIR)/dist/"
	@ls -lh $(PYTHON_DIR)/dist/*.whl

# Internal: Build wheel for a specific platform by copying the right binary.
# Usage: make build-python-platform PLAT=darwin-arm64
build-python-platform:
ifndef PLAT
	$(error PLAT is required: darwin-arm64, darwin-x64, linux-x64, linux-arm64, win-x64)
endif
	@echo "📦 Building wheel for $(PLAT)..."
	@mkdir -p $(PYTHON_DIR)/quasar_svm
	@rm -f $(PYTHON_DIR)/quasar_svm/*.dylib $(PYTHON_DIR)/quasar_svm/*.so $(PYTHON_DIR)/quasar_svm/*.dll
ifeq ($(PLAT),darwin-arm64)
	cp target/aarch64-apple-darwin/release/libquasar_svm.dylib $(PYTHON_DIR)/quasar_svm/
	cd $(PYTHON_DIR) && python3 -m build --wheel --config-setting="--plat-name=macosx_11_0_arm64"
else ifeq ($(PLAT),darwin-x64)
	cp target/x86_64-apple-darwin/release/libquasar_svm.dylib $(PYTHON_DIR)/quasar_svm/
	cd $(PYTHON_DIR) && python3 -m build --wheel --config-setting="--plat-name=macosx_10_12_x86_64"
else ifeq ($(PLAT),linux-x64)
	cp target/x86_64-unknown-linux-gnu/release/libquasar_svm.so $(PYTHON_DIR)/quasar_svm/
	cd $(PYTHON_DIR) && python3 -m build --wheel --config-setting="--plat-name=manylinux_2_17_x86_64"
else ifeq ($(PLAT),linux-arm64)
	cp target/aarch64-unknown-linux-gnu/release/libquasar_svm.so $(PYTHON_DIR)/quasar_svm/
	cd $(PYTHON_DIR) && python3 -m build --wheel --config-setting="--plat-name=manylinux_2_17_aarch64"
else ifeq ($(PLAT),win-x64)
	cp target/x86_64-pc-windows-gnu/release/quasar_svm.dll $(PYTHON_DIR)/quasar_svm/
	cd $(PYTHON_DIR) && python3 -m build --wheel --config-setting="--plat-name=win_amd64"
endif
	@rm -f $(PYTHON_DIR)/quasar_svm/*.dylib $(PYTHON_DIR)/quasar_svm/*.so $(PYTHON_DIR)/quasar_svm/*.dll

# Publish Python wheels to PyPI.
# Uploads all .whl files from bindings/python/dist/ to PyPI.
# Requires: pip install twine
# Set TWINE_USERNAME=__token__ and TWINE_PASSWORD=<your-pypi-token>
publish-python:
	@echo "Publishing Python wheels to PyPI..."
	@if [ ! -f $(PYTHON_DIR)/dist/*.whl ]; then \
		echo "❌ No wheels found in $(PYTHON_DIR)/dist/"; \
		echo "   Run 'make build-python-all' first"; \
		exit 1; \
	fi
	@echo "Uploading wheels:"
	@ls -lh $(PYTHON_DIR)/dist/*.whl
	cd $(PYTHON_DIR) && python3 -m twine upload dist/*.whl
	@echo "✅ Python package published to PyPI!"

# Publish to TestPyPI for testing.
# Requires: Set TWINE_USERNAME=__token__ and TWINE_PASSWORD=<your-testpypi-token>
publish-python-test:
	@echo "Publishing Python wheels to TestPyPI..."
	@ls -lh $(PYTHON_DIR)/dist/*.whl
	cd $(PYTHON_DIR) && python3 -m twine upload --repository testpypi dist/*.whl
	@echo "✅ Python package published to TestPyPI!"
	@echo "   Test install: pip install --index-url https://test.pypi.org/simple/ quasar-svm"

# Update Python package version.
# Usage: make version-python V=0.2.0
version-python:
ifndef V
	$(error V is required, e.g. make version-python V=0.2.0)
endif
	@echo "Updating Python package version to $(V)..."
	sed -i.bak 's/^version = ".*"/version = "$(V)"/' $(PYTHON_DIR)/pyproject.toml
	rm -f $(PYTHON_DIR)/pyproject.toml.bak
	@echo "✅ Updated $(PYTHON_DIR)/pyproject.toml to version $(V)"

# Clean Python build artifacts (preserves symlinks).
clean-python:
	rm -rf $(PYTHON_DIR)/dist $(PYTHON_DIR)/build $(PYTHON_DIR)/*.egg-info
	@# Only remove if it's NOT a symlink (preserve dev setup)
	@if [ -f $(PYTHON_DIR)/quasar_svm/libquasar_svm.dylib ] && [ ! -L $(PYTHON_DIR)/quasar_svm/libquasar_svm.dylib ]; then rm -f $(PYTHON_DIR)/quasar_svm/libquasar_svm.dylib; fi
	@if [ -f $(PYTHON_DIR)/quasar_svm/libquasar_svm.so ] && [ ! -L $(PYTHON_DIR)/quasar_svm/libquasar_svm.so ]; then rm -f $(PYTHON_DIR)/quasar_svm/libquasar_svm.so; fi
	@if [ -f $(PYTHON_DIR)/quasar_svm/quasar_svm.dll ] && [ ! -L $(PYTHON_DIR)/quasar_svm/quasar_svm.dll ]; then rm -f $(PYTHON_DIR)/quasar_svm/quasar_svm.dll; fi
	rm -rf $(PYTHON_DIR)/.pytest_cache
	rm -rf $(PYTHON_DIR)/quasar_svm/__pycache__
	rm -rf $(PYTHON_DIR)/tests/__pycache__

# Remove ALL binaries including symlinks (full reset).
clean-python-all: clean-python
	rm -f $(PYTHON_DIR)/quasar_svm/libquasar_svm.dylib
	rm -f $(PYTHON_DIR)/quasar_svm/libquasar_svm.so
	rm -f $(PYTHON_DIR)/quasar_svm/quasar_svm.dll
