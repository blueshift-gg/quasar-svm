//go:build linux && arm64 && !quasar_dev && !dynamic

package quasarsvm

// #cgo CFLAGS: -DUSE_VENDORED_LIBQUASAR
// #cgo LDFLAGS: ${SRCDIR}/libquasar_svm_vendor/libquasar_svm_linux_arm64.a -lm -ldl -lpthread -lgcc_s -lc -lrt
import "C"

const libquasarSvmLinkInfo = "static linux_arm64"
