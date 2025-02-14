# Path Alias Review

The following files use the `@/` path alias and should be reviewed to ensure proper configuration:

## Test Files
- `src/app/api/validate-referral/__tests__/validate-referral.test.ts`
  - Imports from `@/lib/db`

## Components
- `src/components/ui/button.tsx`
  - Imports from `@/lib/utils`
- `src/components/ui/card.tsx`
  - Imports from `@/lib/utils`
- `src/app/layout.tsx`
  - Imports from `@/components/Header`

## Constants
- `src/constants/commands.ts`
  - Imports from `@/utils/solana`
  - Imports from `@/utils/referral`
- `src/constants/messages.ts`
  - Imports from `@/utils/solana`

## Library Files
- `src/lib/apify-scraper.ts`
  - Imports from `@/types/apify`
  - Imports from `@/types/scraper`
- `src/lib/openai.ts`
  - Imports from `@/types/scraper`

## Worker Files (Special Case)
The following files require relative paths instead of `@/` path aliases due to their separate compilation and runtime environment:

- `src/lib/apify-worker.ts` and related worker files
  - Must use relative paths (e.g., `../types/scraper`) instead of `@/` aliases
  - Reason: These files are:
    1. Compiled separately using `tsconfig.worker.json`
    2. Use Node.js module resolution
    3. Run in a Node.js environment outside Next.js
    4. Output to `dist` directory needs correct relative paths

## Configuration Status

The path alias `@/` is currently configured in:
1. `tsconfig.json` - ✅ Properly configured with:
```json
{
  "paths": {
    "@/*": ["./src/*"]
  }
}
```

2. `jest.config.ts` - ✅ Properly configured with:
```json
{
  "moduleNameMapper": {
    "^@/(.*)$": "<rootDir>/src/$1"
  }
}
```

3. `tsconfig.worker.json` - ⚠️ Different configuration:
```json
{
  "moduleResolution": "node",
  "module": "commonjs",
  "outDir": "dist"
}
```

## Conclusion
The current implementation appears to be correctly configured with two distinct approaches:
1. Next.js/Jest files: Use `@/` path aliases
2. Worker files: Use relative paths for proper compilation and runtime resolution

The path alias setup follows best practices for Next.js projects while accommodating the special requirements of worker threads running in Node.js. 