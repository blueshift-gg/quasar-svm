import koffi from "koffi";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const fs = require("fs") as typeof import("fs");

const PLATFORMS: Record<string, { pkg: string; lib: string; rootLib: string }> = {
  "darwin-arm64": { pkg: "@blueshift-gg/quasar-svm-darwin-arm64",   lib: "libquasar_svm.dylib", rootLib: "libquasar_svm.dylib" },
  "darwin-x64":   { pkg: "@blueshift-gg/quasar-svm-darwin-x64",     lib: "libquasar_svm.dylib", rootLib: "libquasar_svm_x64.dylib" },
  "linux-x64":    { pkg: "@blueshift-gg/quasar-svm-linux-x64-gnu",  lib: "libquasar_svm.so",    rootLib: "libquasar_svm_x64.so" },
  "linux-arm64":  { pkg: "@blueshift-gg/quasar-svm-linux-arm64-gnu", lib: "libquasar_svm.so",   rootLib: "libquasar_svm_arm64.so" },
  "win32-x64":    { pkg: "@blueshift-gg/quasar-svm-win32-x64-msvc", lib: "quasar_svm.dll",      rootLib: "quasar_svm.dll" },
};

function getLibraryPath(): string {
  if (process.env.QUASAR_SVM_LIB) return process.env.QUASAR_SVM_LIB;

  const key = `${process.platform}-${process.arch}`;
  const triple = PLATFORMS[key];
  if (!triple) {
    throw new Error(`Unsupported platform: ${key}. Set QUASAR_SVM_LIB to the path of the shared library.`);
  }

  const pkgRoot = findPackageRoot(__dirname);

  // 1. Prefer a local build while developing the package.
  const devBin = path.join(pkgRoot, "target", "release", triple.lib);
  try { fs.accessSync(devBin); return devBin; } catch {}

  // 2. Binary at package root (bundled release artifact).
  const rootBin = path.join(pkgRoot, triple.rootLib);
  try { fs.accessSync(rootBin); return rootBin; } catch {}

  // 3. Platform-specific npm package.
  try {
    const pkgDir = path.dirname(require.resolve(`${triple.pkg}/package.json`));
    return path.join(pkgDir, triple.lib);
  } catch {
    throw new Error(
      `Failed to locate quasar-svm native library. Tried:\n` +
      `  1. Platform package: ${triple.pkg}\n` +
      `  2. Package root: ${rootBin}\n` +
      `  3. Dev build: ${devBin}\n\n` +
      `Solutions:\n` +
      `  - Ensure optional dependencies are installed: npm install\n` +
      `  - Build locally: npm run build:native\n` +
      `  - Set QUASAR_SVM_LIB environment variable to the library path`
    );
  }
}

function findPackageRoot(start: string): string {
  let current = start;
  while (true) {
    if (fs.existsSync(path.join(current, "package.json"))) return current;
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(`Could not find @blueshift-gg/quasar-svm package root from ${start}`);
    }
    current = parent;
  }
}

const lib = koffi.load(getLibraryPath());

export const quasar_last_error = lib.func("const char *quasar_last_error()");
export const quasar_svm_new = lib.func("void *quasar_svm_new()");
export const quasar_svm_free = lib.func("void quasar_svm_free(void *svm)");

export const quasar_svm_add_program = lib.func(
  "int32_t quasar_svm_add_program(void *svm, const void *program_id, const void *elf_data, uint64_t elf_len, uint8_t loader_version)"
);

export const quasar_svm_set_clock = lib.func(
  "int32_t quasar_svm_set_clock(void *svm, uint64_t slot, int64_t epoch_start_timestamp, uint64_t epoch, uint64_t leader_schedule_epoch, int64_t unix_timestamp)"
);

export const quasar_svm_warp_to_slot = lib.func(
  "int32_t quasar_svm_warp_to_slot(void *svm, uint64_t slot)"
);

export const quasar_svm_warp_to_timestamp = lib.func(
  "int32_t quasar_svm_warp_to_timestamp(void *svm, int64_t timestamp)"
);

export const quasar_svm_set_rent = lib.func(
  "int32_t quasar_svm_set_rent(void *svm, uint64_t lamports_per_byte_year)"
);

export const quasar_svm_set_epoch_schedule = lib.func(
  "int32_t quasar_svm_set_epoch_schedule(void *svm, uint64_t slots_per_epoch, uint64_t leader_schedule_slot_offset, bool warmup, uint64_t first_normal_epoch, uint64_t first_normal_slot)"
);

export const quasar_svm_set_compute_budget = lib.func(
  "int32_t quasar_svm_set_compute_budget(void *svm, uint64_t max_units)"
);

export const quasar_svm_process_transaction = lib.func(
  "int32_t quasar_svm_process_transaction(void *svm, const void *instructions, uint64_t instructions_len, const void *accounts, uint64_t accounts_len, _Out_ void **result_out, _Out_ uint64_t *result_len_out)"
);

export const quasar_svm_simulate_transaction = lib.func(
  "int32_t quasar_svm_simulate_transaction(void *svm, const void *instructions, uint64_t instructions_len, const void *accounts, uint64_t accounts_len, _Out_ void **result_out, _Out_ uint64_t *result_len_out)"
);

export const quasar_result_free = lib.func(
  "void quasar_result_free(void *result, uint64_t result_len)"
);

export { koffi };
