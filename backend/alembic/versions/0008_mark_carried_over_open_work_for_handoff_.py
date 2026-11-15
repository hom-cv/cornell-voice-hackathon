"""Mark existing open work as carried over for the next handoff review.

Explicit data migration: autogenerate does not produce data updates.
"""

import sqlalchemy as sa

from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade():
    work_items = sa.table(
        "work_items",
        sa.column("status", sa.String),
        sa.column("handoff_review_required", sa.Boolean),
    )
    op.execute(
        work_items.update()
        .where(work_items.c.status == "open")
        .values(
            handoff_review_required=True,
        )
    )


def downgrade():
    work_items = sa.table(
        "work_items",
        sa.column("status", sa.String),
        sa.column("handoff_review_required", sa.Boolean),
    )
    op.execute(
        work_items.update()
        .where(work_items.c.status == "open")
        .values(
            handoff_review_required=False,
        )
    )
