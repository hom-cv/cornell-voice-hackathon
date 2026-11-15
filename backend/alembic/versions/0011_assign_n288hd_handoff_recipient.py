"""assign N288HD handoff recipient

Revision ID: 0011
Revises: 0010
Create Date: 2026-11-14 19:39:06.485963

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '0011'
down_revision: Union[str, Sequence[str], None] = '0010'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Autogenerate found no schema changes. Seed data requires explicit SQL.
    op.execute(
        "INSERT INTO aircraft_assignments (user_id, aircraft_registration) "
        "SELECT 'peach', 'N288HD' "
        "WHERE EXISTS (SELECT 1 FROM users WHERE id = 'peach') "
        "AND EXISTS (SELECT 1 FROM aircraft WHERE registration = 'N288HD') "
        "AND NOT EXISTS (SELECT 1 FROM aircraft_assignments "
        "WHERE user_id = 'peach' AND aircraft_registration = 'N288HD')"
    )


def downgrade() -> None:
    op.execute(
        "DELETE FROM aircraft_assignments "
        "WHERE user_id = 'peach' AND aircraft_registration = 'N288HD'"
    )
