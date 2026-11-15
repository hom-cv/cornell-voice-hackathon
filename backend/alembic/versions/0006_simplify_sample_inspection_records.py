"""Use short, synthetic inspection notes for the spoken demo.

All DEMO-CHECK references are fictional labels, not maintenance manual tasks.
"""

import sqlalchemy as sa

from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None

DEMO_RECORDS = [
    {
        "id": "417-01",
        "title": "Loose cover under the left wing",
        "area": "Under the left wing",
        "found": "A small cover was loose. One clip was cracked.",
        "work_done": "Removed the cover and put its screws in a labeled bag.",
        "stopped_at": "The cover is off. The screws are in the bag on cart 4.",
        "next_action": "Replace the clip and have the cover checked before closing the "
        "task.",
        "manual_reference": "",
    },
    {
        "id": "417-02",
        "title": "Small fluid leak near the left wheel",
        "area": "Left wheel area",
        "found": "A few drops of fluid were found below a hose.",
        "work_done": "Cleaned the area and marked where the drops appeared.",
        "stopped_at": "The access cover is open. The leak still needs a closer check.",
        "next_action": "Have the marked hose checked by the next technician.",
        "manual_reference": "DEMO-CHECK-02",
    },
    {
        "id": "417-03",
        "title": "Check the right engine fan",
        "area": "Right engine",
        "found": "The first 14 fan blades look clear, with no visible damage.",
        "work_done": "Checked blades 1 through 14 and recorded the result.",
        "stopped_at": "14 of 24 blades have been checked.",
        "next_action": "Continue the inspection from blade 15.",
        "manual_reference": "DEMO-CHECK-03",
    },
    {
        "id": "417-04",
        "title": "Replace a worn cabin seat cover",
        "area": "Cabin · Row 8",
        "found": "The seat cover has a small tear.",
        "work_done": "Took a photo and requested a replacement cover.",
        "stopped_at": "Waiting for the replacement cover from stores.",
        "next_action": "Fit the replacement cover when it arrives.",
        "manual_reference": "DEMO-CHECK-04",
    },
    {
        "id": "417-05",
        "title": "Check the outside lights",
        "area": "Outside lights",
        "found": "All lights checked were working.",
        "work_done": "Checked each outside light and recorded the results.",
        "stopped_at": "The light check is complete.",
        "next_action": "No further action recorded.",
        "manual_reference": "DEMO-CHECK-05",
    },
    {
        "id": "417-06",
        "title": "Check the cockpit seats",
        "area": "Cockpit",
        "found": "Both seats and their belts looked secure.",
        "work_done": "Checked both seats and belts.",
        "stopped_at": "The seat check is complete.",
        "next_action": "No further action recorded.",
        "manual_reference": "DEMO-CHECK-06",
    },
    {
        "id": "288-01",
        "title": "Check a reported air-system warning",
        "area": "Cockpit warning display",
        "found": "The crew reported an air-system warning during the last flight.",
        "work_done": "Recorded the crew report.",
        "stopped_at": "The warning has been logged. The inspection has not started.",
        "next_action": "Review the warning with the assigned technician.",
        "manual_reference": "",
    },
    {
        "id": "288-02",
        "title": "Record the warning-check result",
        "area": "Cockpit warning display",
        "found": "The warning-check result is still pending.",
        "work_done": "Opened a record for the follow-up inspection.",
        "stopped_at": "Waiting for the inspection result.",
        "next_action": "Add the inspection findings when the check is finished.",
        "manual_reference": "DEMO-CHECK-08",
    },
    {
        "id": "903-01",
        "title": "Check the tires",
        "area": "Main wheels",
        "found": "No cuts or unusual wear were seen on the tires checked.",
        "work_done": "Looked over both main tires and recorded the result.",
        "stopped_at": "The tire check is complete.",
        "next_action": "No further action recorded.",
        "manual_reference": "DEMO-CHECK-09",
    },
    {
        "id": "903-02",
        "title": "Check the brake area",
        "area": "Main wheels · Brakes",
        "found": "No loose parts or visible damage were found in the areas checked.",
        "work_done": "Inspected the visible brake areas and recorded the result.",
        "stopped_at": "The brake-area check is complete.",
        "next_action": "No further action recorded.",
        "manual_reference": "DEMO-CHECK-10",
    },
    {
        "id": "903-03",
        "title": "Final check after the wheel change",
        "area": "Main wheels",
        "found": "The final inspection was recorded with no new issues.",
        "work_done": "Reviewed the completed wheel-change check.",
        "stopped_at": "The final check is complete.",
        "next_action": "No further action recorded.",
        "manual_reference": "DEMO-CHECK-11",
    },
]

PREVIOUS_RECORDS = [
    {
        "id": "417-01",
        "title": "Left wing lower access panel 571AB removed",
        "area": "Zone 571 · Left wing",
        "stopped_at": "Panel off, 18 fasteners bagged and tagged on cart 4. New clamp "
        "not fitted.",
        "found": "",
        "work_done": "",
        "next_action": "",
        "manual_reference": "",
    },
    {
        "id": "417-02",
        "title": "Hydraulic system B depressurized for actuator swap",
        "area": "Zone 140 · Main gear bay",
        "stopped_at": (
            "Old actuator out, new one not installed. " "Do not pressurize Hyd B."
        ),
        "found": "",
        "work_done": "",
        "next_action": "",
        "manual_reference": "",
    },
    {
        "id": "417-03",
        "title": "Engine 2 fan blade inspection",
        "area": "Engine 2 · Fan",
        "stopped_at": "Blades 1–14 of 24 inspected, no findings so far.",
        "found": "",
        "work_done": "",
        "next_action": "",
        "manual_reference": "",
    },
    {
        "id": "417-04",
        "title": "Fuel line clamp replacement",
        "area": "Zone 571 · Left wing",
        "stopped_at": "Waiting for the replacement clamp.",
        "found": "",
        "work_done": "",
        "next_action": "",
        "manual_reference": "",
    },
    {
        "id": "417-05",
        "title": "Exterior lighting inspection",
        "area": "Exterior · Lighting",
        "stopped_at": "Inspection recorded as complete.",
        "found": "",
        "work_done": "",
        "next_action": "",
        "manual_reference": "",
    },
    {
        "id": "417-06",
        "title": "Flight deck inspection",
        "area": "Flight deck",
        "stopped_at": "Inspection recorded as complete.",
        "found": "",
        "work_done": "",
        "next_action": "",
        "manual_reference": "",
    },
    {
        "id": "288-01",
        "title": "Investigate #1 bleed valve fault",
        "area": "Engine 1 · Bleed system",
        "stopped_at": "Fault recorded; inspection not started.",
        "found": "",
        "work_done": "",
        "next_action": "",
        "manual_reference": "",
    },
    {
        "id": "288-02",
        "title": "Record bleed valve inspection findings",
        "area": "Engine 1 · Bleed system",
        "stopped_at": "Awaiting inspection findings.",
        "found": "",
        "work_done": "",
        "next_action": "",
        "manual_reference": "",
    },
    {
        "id": "903-01",
        "title": "Wheel inspection",
        "area": "Landing gear · Wheels",
        "stopped_at": "Inspection recorded as complete.",
        "found": "",
        "work_done": "",
        "next_action": "",
        "manual_reference": "",
    },
    {
        "id": "903-02",
        "title": "Brake inspection",
        "area": "Landing gear · Brakes",
        "stopped_at": "Inspection recorded as complete.",
        "found": "",
        "work_done": "",
        "next_action": "",
        "manual_reference": "",
    },
    {
        "id": "903-03",
        "title": "Wheel and brake change inspection",
        "area": "Landing gear",
        "stopped_at": "Inspection recorded as complete.",
        "found": "",
        "work_done": "",
        "next_action": "",
        "manual_reference": "",
    },
]


def _update_records(records):
    table = sa.table(
        "work_items",
        *(
            sa.column(name, sa.String)
            for name in (
                "id",
                "title",
                "area",
                "found",
                "work_done",
                "stopped_at",
                "next_action",
                "manual_reference",
            )
        ),
    )
    for record in records:
        values = {key: value for key, value in record.items() if key != "id"}
        op.execute(table.update().where(table.c.id == record["id"]).values(**values))


def upgrade():
    _update_records(DEMO_RECORDS)
    aircraft = sa.table(
        "aircraft", sa.column("registration", sa.String), sa.column("work", sa.String)
    )
    for registration, work in [
        ("N417HD", "Routine inspection · WP 24-1187"),
        ("N288HD", "Air-system warning check"),
    ]:
        op.execute(
            aircraft.update()
            .where(aircraft.c.registration == registration)
            .values(work=work)
        )


def downgrade():
    _update_records(PREVIOUS_RECORDS)
    aircraft = sa.table(
        "aircraft", sa.column("registration", sa.String), sa.column("work", sa.String)
    )
    for registration, work in [
        ("N417HD", "A-check · WP 24-1187"),
        ("N288HD", "Fault: #1 bleed valve"),
    ]:
        op.execute(
            aircraft.update()
            .where(aircraft.c.registration == registration)
            .values(work=work)
        )
