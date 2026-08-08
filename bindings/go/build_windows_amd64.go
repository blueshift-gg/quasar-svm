//go:build windows && amd64 && !quasar_dev && !dynamic

package quasarsvm

// #cgo CFLAGS: -DUSE_VENDORED_LIBQUASAR
// #cgo LDFLAGS: ${SRCDIR}/libquasar_svm_vendor/libquasar_svm_windows_amd64.a -lws2_32 -luserenv -lbcrypt -lntdll -ladvapi32
import "C"

const libquasarSvmLinkInfo = "static windows_amd64"
