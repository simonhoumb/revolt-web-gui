"""The AuditLog table model, written to by audit.log_action() for every command-issuing endpoint."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from revolt_api.models.base import Base


class AuditLog(Base):
	"""One logged command-issuing action: who (session_id), what, and the vessel state at the time."""

	__tablename__ = "audit_log"

	id: Mapped[uuid.UUID] = mapped_column(
		UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
	)
	timestamp: Mapped[datetime] = mapped_column(
		DateTime(timezone=True), server_default=func.now(), nullable=False
	)
	session_id: Mapped[str] = mapped_column(Text, nullable=False)
	# user_id is null until identity provider integration lands; pre-auth events only have session_id
	user_id: Mapped[str | None] = mapped_column(Text, nullable=True)
	action: Mapped[str] = mapped_column(Text, nullable=False)
	severity: Mapped[str] = mapped_column(Text, nullable=False, server_default="info")
	params: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
	vessel_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
