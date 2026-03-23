//go:build dynamic && !quasar_dev

// Use -tags dynamic to link against a system-installed libquasar_svm
// instead of the vendored static library. Requires pkg-config or
// manual CGO_LDFLAGS pointing to the shared library.

package quasarsvm

// #cgo pkg-config: quasar_svm
import "C"

const libquasarSvmLinkInfo = "dynamic (system)"
