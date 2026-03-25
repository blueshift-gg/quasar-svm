import { describe, it, expect, beforeAll } from "vitest";
import { QuasarSvm } from "@blueshift-gg/quasar-svm/kit";
import { generateKeyPair, getAddressFromPublicKey } from "@solana/keys";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadTestProgram(name: string): Uint8Array {
  const programPath = path.join(__dirname, "..", "programs", name);
  return new Uint8Array(readFileSync(programPath));
}

describe("Kit Layer - Basic Tests", () => {
  let vm: QuasarSvm;

  beforeAll(() => {
    vm = new QuasarSvm();
  });

  it("should initialize SVM", () => {
    expect(vm).toBeDefined();
  });

  it.skip("should load custom program", async () => {
    const programId = await getAddressFromPublicKey(
      (await generateKeyPair()).publicKey
    );
    const elf = loadTestProgram("test_program.so");

    // Add program to SVM
    vm.addProgram(programId, elf, 3);

    // If we get here without error, the program loaded successfully
    expect(true).toBe(true);
  });

  it.skip("should execute instruction", async () => {
    const programId = await getAddressFromPublicKey(
      (await generateKeyPair()).publicKey
    );
    const elf = loadTestProgram("test_program.so");

    vm.addProgram(programId, elf, 3);

    // TODO: Create instruction and accounts
    // TODO: Execute instruction
    // TODO: Verify results
  });
});

describe("Kit Layer - Account Management", () => {
  let vm: QuasarSvm;

  beforeAll(() => {
    vm = new QuasarSvm();
  });

  it.skip("should create and modify accounts", async () => {
    // TODO: Test account creation and modification
  });
});
