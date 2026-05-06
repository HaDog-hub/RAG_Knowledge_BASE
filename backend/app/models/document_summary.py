from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, Text, UniqueConstraint

from app.database import Base


class DocumentSummary(Base):
    __tablename__ = "document_summaries"

    id = Column(Integer, primary_key=True)
    user_id = Column(String, nullable=False, index=True)
    filename = Column(String, nullable=False)
    summary = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (UniqueConstraint("user_id", "filename", name="uq_summary_user_file"),)
