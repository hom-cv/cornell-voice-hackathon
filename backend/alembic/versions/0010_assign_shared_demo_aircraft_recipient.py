"""Assign Peach to the shared demo aircraft for incoming handoff."""

from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade():
    # Data-only migration. Other aircraft assignments remain restricted.
    op.execute(
        "INSERT INTO aircraft_assignments (user_id, aircraft_registration) "
        "SELECT 'peach', 'N417HD' "
        "WHERE EXISTS (SELECT 1 FROM users WHERE id = 'peach') "
        "AND EXISTS (SELECT 1 FROM aircraft WHERE registration = 'N417HD') "
        "AND NOT EXISTS (SELECT 1 FROM aircraft_assignments "
        "WHERE user_id = 'peach' AND aircraft_registration = 'N417HD')"
    )


def downgrade():
    op.execute(
        "DELETE FROM aircraft_assignments "
        "WHERE user_id = 'peach' AND aircraft_registration = 'N417HD'"
    )
