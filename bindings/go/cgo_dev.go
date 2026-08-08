//go:build quasar_dev

// Development mode: link dynamically against the local Cargo build output.
// Use this when working in the quasar-svm monorepo:
//
//	go test -tags quasar_dev ./...
package quasarsvm

// #cgo CFLAGS: -DUSE_VENDORED_LIBQUASAR
// #cgo LDFLAGS: -lquasar_svm -L${SRCDIR}/../../target/release
// #cgo darwin LDFLAGS: -Wl,-rpath,${SRCDIR}/../../target/release
// #cgo linux LDFLAGS: -Wl,-rpath,${SRCDIR}/../../target/release
import "C"

const libquasarSvmLinkInfo = "dynamic dev (target/release)"
