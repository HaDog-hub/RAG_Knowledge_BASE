from sqlalchemy import Boolean, Column, Integer, String, UniqueConstraint

from app.database import Base


class FolderSettings(Base):
    __tablename__ = "folder_settings"

    id = Column(Integer, primary_key=True)
    user_id = Column(String, nullable=False, index=True)
    folder_name = Column(String, nullable=False)
    is_public = Column(Boolean, default=False, nullable=False)

    __table_args__ = (
        UniqueConstraint("user_id", "folder_name", name="uq_folder_settings"),
    )
