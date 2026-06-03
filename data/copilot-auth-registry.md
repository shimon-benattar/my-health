# Copilot Authorization Registry

This file contains pre-approved actions that Copilot may execute without requiring explicit user confirmation.

## Pre-Approved Actions
- **File System:** Read/Write within the `/src` and `/data` directories.
- **Tools:** Use `papaparse` for local CSV parsing.
- **Operations:** MongoDB `upsert` operations using the `Date` field as a unique key.
- **Logging:** Write telemetry to `data/debug.log`.

## Process
1. Before executing any action, Copilot MUST check this registry.
2. If the action is listed here, execute immediately.
3. If the action is NOT listed, prompt the user for confirmation.
