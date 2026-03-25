# TypeScript Tests

Integration tests for QuasarSVM TypeScript bindings (kit and web3.js layers).

## Setup

```bash
cd tests/typescript
npm install
```

This will install the local `@blueshift-gg/quasar-svm` package from the repository root.

## Running Tests

```bash
# Run all tests
npm test

# Run only kit tests
npm run test:kit

# Run only web3.js tests
npm run test:web3

# Watch mode
npm run test:watch
```

## Test Layers

### Kit Layer (`kit/*.test.ts`)
Uses Solana's modular packages:
- `@solana/addresses` - Address type
- `@solana/accounts` - Account type
- `@solana-program/token` - Token instructions

### Web3.js Layer (`web3.js/*.test.ts`)
Uses legacy web3.js:
- `@solana/web3.js` - Address, TransactionInstruction

## Adding Test Programs

1. Place `.so` files in `programs/` directory
2. Update tests to remove `.skip()` from test descriptions
3. Tests will automatically load programs using `loadTestProgram()`

## Configuration

- **Vitest**: `vitest.config.ts`
- **TypeScript**: `tsconfig.json`
- **Parallel execution**: Enabled by default

## Test Structure

```
kit/
  ├── basic.test.ts    - Basic SVM operations
  └── token.test.ts    - Token operations
web3.js/
  ├── basic.test.ts    - Basic SVM operations
  └── token.test.ts    - Token operations
```
