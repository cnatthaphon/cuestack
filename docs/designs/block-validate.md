# Feature: ValidateBlock + TransformBlock

**Author:** Natthaphon C.
**Date:** 2026-03-25
**Status:** Draft

## What

Two blocks for the ingest pipeline:
- **ValidateBlock**: checks sensor data has required fields, valid types, parseable timestamps. Rejects bad data with clear error messages.
- **TransformBlock**: applies unit conversions, adds computed fields/metadata.

## How

### ValidateBlock
- **Input:** `ctx.raw_data` (list of dicts or single dict)
- **Output:** `ctx.records` (validated) or `ctx.errors`
- **Config:** `required_fields` set (default: device_id, timestamp, value)
- Parses ISO 8601 timestamps, validates numeric values

### TransformBlock
- **Input:** `ctx.records` (validated)
- **Output:** `ctx.records` (transformed)
- **Config:** `conversions` dict mapping field names to transform functions

### Pipeline Integration
```
INGEST: [ValidateBlock] → [TransformBlock] → Store
```

## Tests

| Test | What It Verifies |
|------|-----------------|
| `test_valid_data` | 2 valid records pass through |
| `test_missing_fields` | Missing fields → error with field names |
| `test_invalid_timestamp` | Bad timestamp string → error |
| `test_non_numeric_value` | String value → error |
| `test_no_data` | null input → error |
| `test_single_dict` | Single dict auto-wrapped to list |
| `test_custom_fields` | Custom required_fields works |
| `test_transform_conversion` | Celsius → Fahrenheit conversion |
| `test_transform_no_conversion` | Pass-through when no conversions |

## Security (ASVS L1)

| ID | Requirement | How Addressed |
|----|-------------|---------------|
| V5.1.3 | Validate all input | ValidateBlock checks type, format, required fields |
| V5.1.5 | Reject unexpected input | Missing/extra fields rejected |
| V13.1.1 | JSON schema validation | Required fields + type checking |
