# Release Readiness

## Purpose

This document defines the minimum release gate for the repository's current preview stage.

The goal is not to certify `jsbin` as a full JavaScript or Node.js implementation. The goal is to prevent over-claiming and require a repeatable preview release check.

## Current Positioning

Current allowed release posture:

- Preview / experimental compiler.
- Supports a substantial ES subset, not full ECMAScript.
- Supports partial ESM flows validated by in-repo fixtures, not full standards-complete module semantics.
- Supports a limited Node core/runtime shim subset, not full Node.js compatibility.
- Verified primarily against repository fixtures and targeted manual smoke checks.

Current disallowed release posture:

- Full ES / full ECMAScript implementation.
- Full Node.js compatibility or drop-in runtime replacement.
- Full npm / `node_modules` / package-ecosystem compatibility.
- Full CommonJS compatibility.
- Full self-bootstrap / self-hosting claims.
- Production-ready or compatibility-complete messaging.

## Release Gates

A preview release is blocked unless all of the following are true:

1. `npm run release:check` passes on the release candidate tree.
2. README messaging remains conservative and matches the current implementation reality.
3. No release notes, tags, or announcement copy claim full ES, full Node, or full self-bootstrap.
4. Known capability gaps are either unchanged and documented, or newly introduced regressions are called out before release.
5. Manual spot checks are completed for the primary preview workflows listed below.

## Required Pre-Release Checks

Run these before cutting any preview release:

```bash
npm install
npm run release:check
```

Then perform manual verification:

1. Confirm README and release notes use only the allowed messaging in this document.
2. Confirm fixture coverage still exercises the current advertised scope.
3. Confirm no new claim depends on unverified npm package support, full CommonJS, or full dynamic `import()` runtime behavior.
4. Confirm no new claim depends on compiling the entire compiler/runtime stack with itself.

## Must-Check Areas And Current Status

### ES / Language Surface

Status: partial, suitable only for subset-based preview messaging.

Current baseline:

- The project supports a substantial ES subset.
- The project should not be described as standards-complete ECMAScript.
- Syntax support and runtime-semantic support are not equivalent; some features are partial or simplified.

Reference:

- [`docs/ES_SUPPORT.md`](/Users/nouo/github/jsbin/docs/ES_SUPPORT.md)

### Modules

Status: improved but still preview-grade.

Current baseline:

- In-repo ESM flows and cyclic-module paths have advanced materially.
- Module behavior should still be presented as partial/preview support, validated by fixtures rather than spec-complete claims.
- Runtime module record semantics, error-state handling, and broader compatibility coverage are still incomplete.

Reference:

- [`docs/CYCLIC_BOOTSTRAP_ANALYSIS.md`](/Users/nouo/github/jsbin/docs/CYCLIC_BOOTSTRAP_ANALYSIS.md)

### Node Compatibility

Status: limited subset only.

Current baseline:

- The project includes selected `runtime/node/` shims.
- It should not be described as full Node.js compatibility.
- Third-party package ecosystem compatibility remains incomplete and should not be implied.

Reference:

- [`docs/NODEJS_SUPPORT_ANALYSIS.md`](/Users/nouo/github/jsbin/docs/NODEJS_SUPPORT_ANALYSIS.md)

### Self-Bootstrap

Status: not a release claim.

Current baseline:

- The repository may contain progress toward stronger module/runtime behavior.
- That is not sufficient to market the project as fully self-hosting or fully self-bootstrapping.
- Any such claim requires separate end-to-end validation that does not exist in this gate.

## Allowed Release Copy

Use wording like:

- "preview native compiler"
- "experimental"
- "validated against repository fixtures"
- "supports a substantial ES subset"
- "includes a limited Node core shim subset"

Avoid wording like:

- "full ES"
- "full Node"
- "drop-in replacement"
- "production-ready"
- "self-hosting"
- "fully self-bootstrapping"

## Real Gaps That Documentation Does Not Remove

These are implementation gaps, not copywriting problems:

- No basis for full ECMAScript compatibility claims.
- No basis for full Node.js compatibility claims.
- No basis for third-party npm ecosystem compatibility claims.
- No basis for full CommonJS compatibility claims.
- No basis for complete dynamic `import()` runtime support claims.
- No basis for full self-bootstrap/self-hosting claims.

If a release needs any of the above claims, engineering work and new validation are required before release.
