# Nimbus aircraft inspection handoff

## Current app
React/TypeScript frontend with a FastAPI/PostgreSQL backend and Alembic migrations.
Employee PIN sign-in and aircraft assignments limit access. Hom and Peach are the
demo employees. Voice uses local Argmax OSS WhisperKit; local Bonsai fills forms.

## Workflow
Capture and edit inspection tasks by voice or text. Clarify ambiguous updates in
one round of up to two questions. Before handoff, review all tasks and ask at most
three questions; a single recording can answer the set. Apply reviewed answers to
the tasks and create a saved handoff snapshot. Verify the incoming employee's PIN,
walk through attention items together, confirm, finish, and log out.

## Product decisions
Keep wording clear and recording fast. Open means carried over for review; physical
open conditions are separate. Never infer maintenance approval. Use Alembic for
schema and seed data; autogenerate schema changes. Validate flows end to end without
adding test files. The original native prototype is retained with NATIVE_README.md.
