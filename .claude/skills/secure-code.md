---
name: secure-code
description: Enforce strict information security rules when writing or modifying code. Use this skill before implementing any feature that touches authentication, user data, file I/O, database queries, or API endpoints.
---

Before writing or modifying any code, enforce the following security rules without exception. If a rule would be violated, fix the design first before proceeding.

## Authentication & Authorization
- Every endpoint that touches user data MUST have an auth dependency (`get_current_user` or equivalent)
- Never trust client-supplied IDs — always derive the user identity from the verified token
- All database queries MUST scope to the authenticated user (e.g. `WHERE user_id = :uid`)

## Secrets & Configuration
- Never hardcode secrets, API keys, passwords, or tokens in source code
- All secrets go in `.env` / environment variables, accessed via the settings singleton
- Never log secret values — mask or omit them entirely

## Input Validation
- Validate and sanitize all user input at the API boundary (Pydantic models for FastAPI)
- Never pass raw user input directly into shell commands, file paths, or SQL strings
- Restrict uploaded file types explicitly; reject anything not on the allowlist

## Injection Prevention
- SQL: always use parameterized queries / ORM — never string-format SQL
- Path traversal: sanitize filenames with `os.path.basename()` before any file I/O
- XSS: never render raw user content as HTML; escape on output

## Data Isolation
- Each user's data (ChromaDB chunks, documents, folders) MUST be filtered by `user_id` on every read and write
- Public folders are readable by all authenticated users, but writable only by the owner

## Filesystem & Database
- Sensitive files (`*.db`, vector store dirs) MUST have owner-only permissions (600/700) set on startup
- Never expose internal paths, stack traces, or DB error details in API responses

## Dependency on Completion
After writing code, verify:
1. No endpoint is reachable without authentication (except `/health`, `/api/auth/register`, `/api/auth/login`)
2. No user can read or modify another user's private data
3. No secret appears in any file that could be committed to version control
