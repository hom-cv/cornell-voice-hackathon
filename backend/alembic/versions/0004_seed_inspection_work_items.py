"""Seed sample inspection work items (explicit data migration)."""

import sqlalchemy as sa

from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade():
    items = sa.table(
        "work_items",
        sa.column("id", sa.String),
        sa.column("aircraft_registration", sa.String),
        sa.column("title", sa.String),
        sa.column("area", sa.String),
        sa.column("assignee_id", sa.String),
        sa.column("status", sa.String),
        sa.column("stopped_at", sa.String),
        sa.column("left_open", sa.Boolean),
    )
    rows = [
        (
            "417-01",
            "N417HD",
            "Left wing lower access panel 571AB removed",
            "Zone 571 · Left wing",
            "hom",
            "open",
            "Panel off, 18 fasteners bagged and tagged on cart 4. "
            "New clamp not fitted.",
            True,
        ),
        (
            "417-02",
            "N417HD",
            "Hydraulic system B depressurized for actuator swap",
            "Zone 140 · Main gear bay",
            "hom",
            "in_progress",
            "Old actuator out, new one not installed. Do not pressurize Hyd B.",
            True,
        ),
        (
            "417-03",
            "N417HD",
            "Engine 2 fan blade inspection",
            "Engine 2 · Fan",
            "hom",
            "in_progress",
            "Blades 1–14 of 24 inspected, no findings so far.",
            False,
        ),
        (
            "417-04",
            "N417HD",
            "Fuel line clamp replacement",
            "Zone 571 · Left wing",
            "hom",
            "blocked",
            "Waiting for the replacement clamp.",
            False,
        ),
        (
            "417-05",
            "N417HD",
            "Exterior lighting inspection",
            "Exterior · Lighting",
            "hom",
            "done",
            "Inspection recorded as complete.",
            False,
        ),
        (
            "417-06",
            "N417HD",
            "Flight deck inspection",
            "Flight deck",
            "hom",
            "done",
            "Inspection recorded as complete.",
            False,
        ),
        (
            "288-01",
            "N288HD",
            "Investigate #1 bleed valve fault",
            "Engine 1 · Bleed system",
            "hom",
            "open",
            "Fault recorded; inspection not started.",
            False,
        ),
        (
            "288-02",
            "N288HD",
            "Record bleed valve inspection findings",
            "Engine 1 · Bleed system",
            "hom",
            "open",
            "Awaiting inspection findings.",
            False,
        ),
        (
            "903-01",
            "N903HD",
            "Wheel inspection",
            "Landing gear · Wheels",
            "peach",
            "done",
            "Inspection recorded as complete.",
            False,
        ),
        (
            "903-02",
            "N903HD",
            "Brake inspection",
            "Landing gear · Brakes",
            "peach",
            "done",
            "Inspection recorded as complete.",
            False,
        ),
        (
            "903-03",
            "N903HD",
            "Wheel and brake change inspection",
            "Landing gear",
            "peach",
            "done",
            "Inspection recorded as complete.",
            False,
        ),
    ]
    keys = [
        "id",
        "aircraft_registration",
        "title",
        "area",
        "assignee_id",
        "status",
        "stopped_at",
        "left_open",
    ]
    op.bulk_insert(items, [dict(zip(keys, row)) for row in rows])


def downgrade():
    items = sa.table("work_items", sa.column("id", sa.String))
    ids = (
        [f"417-{n:02}" for n in range(1, 7)]
        + [f"288-{n:02}" for n in range(1, 3)]
        + [f"903-{n:02}" for n in range(1, 4)]
    )
    op.execute(items.delete().where(items.c.id.in_(ids)))
