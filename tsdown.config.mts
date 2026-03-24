import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "bindings/node/src/index.ts",
    "bindings/node/src/ffi.ts",
    "bindings/node/src/web3.js/index.ts",
    "bindings/node/src/kit/index.ts",
  ],
  outDir: "dist",
  root: "bindings/node/src",
  platform: "node",
  format: "cjs",
  unbundle: true,
  sourcemap: true,
  dts: true,
  outExtensions: () => ({
    js: ".js",
    dts: ".d.ts",
  }),
  deps: {
    skipNodeModulesBundle: true,
  },
});
