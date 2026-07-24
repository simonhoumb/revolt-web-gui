"""Shared SQLAlchemy declarative base and mixins used by every model in this package."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
	"""Declarative base every ORM model inherits from."""


class TimestampMixin:
	"""Adds server-managed created_at/updated_at columns to a model."""

	created_at: Mapped[datetime] = mapped_column(
		DateTime(timezone=True), server_default=func.now(), nullable=False
	)
	updated_at: Mapped[datetime] = mapped_column(
		DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
	)


def new_uuid() -> uuid.UUID:
	"""Default factory for primary-key columns."""
	return uuid.uuid4()
