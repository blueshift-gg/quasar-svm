//go:build darwin && amd64 && !quasar_dev && !dynamic

package quasarsvm

// #cgo CFLAGS: -DUSE_VENDORED_LIBQUASAR
// #cgo LDFLAGS: ${SRCDIR}/libquasar_svm_vendor/libquasar_svm_darwin_amd64.a -liconv
import "C"

const libquasarSvmLinkInfo = "static darwin_amd64"
