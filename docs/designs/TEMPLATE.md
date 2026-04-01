# Feature: [Block/Feature Name]

**Author:** [name]
**Date:** [date]
**Status:** Draft / Approved / Implemented

## What

One paragraph: what does this block/feature do and why do we need it?

## How

### Block Design

- **Input:** What does it read from PipelineContext?
- **Output:** What does it write to PipelineContext?
- **Config:** What parameters does the block accept?

### Pipeline Integration

Which pipeline(s) will this block be added to?

```
PIPELINE_NAME: ExistingBlock → [NewBlock] → ExistingBlock
```

## API Changes

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| ... | ... | ... | ... |

## UI Changes

Describe any frontend changes (if any).

## Tests

| Test | What It Verifies |
|------|-----------------|
| `test_basic` | Block processes valid input |
| `test_invalid_input` | Block rejects bad data |
| `test_pipeline` | Block works in full pipeline chain |

## Security (ASVS L1)

| ID | Requirement | How Addressed |
|----|-------------|---------------|
| V_._._ | ... | ... |

## Questions

- [ ] Open question 1?
