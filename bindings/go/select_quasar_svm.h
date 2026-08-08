#ifndef SELECT_QUASAR_SVM_H
#define SELECT_QUASAR_SVM_H

/* Opaque type — defined in Rust, not emitted by cbindgen (parse_deps=false). */
typedef struct QuasarSvm QuasarSvm;

#ifdef USE_VENDORED_LIBQUASAR
#include "libquasar_svm_vendor/quasar_svm.h"
#else
#include <quasar_svm.h>
#endif

#endif /* SELECT_QUASAR_SVM_H */
