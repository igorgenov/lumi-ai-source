from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, Text, Enum, ForeignKey, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.db.base import Base


class ConversationType(str, enum.Enum):
    call = "call"
    meeting = "meeting"


class ConversationStatus(str, enum.Enum):
    pending = "pending"
    analyzing = "analyzing"
    analyzed = "analyzed"
    failed = "failed"


class CallResult(str, enum.Enum):
    success = "success"
    rejected = "rejected"
    no_answer = "no_answer"
    callback = "callback"
    transferred = "transferred"


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(String, primary_key=True)
    manager_id = Column(String, ForeignKey("users.id"), nullable=False)
    client_name = Column(String, nullable=False)
    client_company = Column(String)
    client_phone = Column(String)

    type = Column(Enum(ConversationType), nullable=False)
    status = Column(Enum(ConversationStatus), default=ConversationStatus.pending)
    service = Column(String)  # SEO, PPC, Веб-аналітика, Комплекс
    tags = Column(JSON, default=list)

    occurred_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Call-specific
    ringostat_call_id = Column(String, unique=True)
    call_duration = Column(Integer)  # seconds
    call_direction = Column(String)  # inbound / outbound
    call_result = Column(Enum(CallResult))
    audio_url = Column(String)

    # Meeting-specific
    google_meet_link = Column(String)
    google_drive_file_id = Column(String)
    meeting_duration = Column(Integer)
    meeting_participants = Column(JSON, default=list)
    video_url = Column(String)

    # AI outputs
    transcript = Column(Text)
    ai_score = Column(Integer)  # 0-100
    ai_summary = Column(Text)
    ai_strengths = Column(JSON, default=list)
    ai_weaknesses = Column(JSON, default=list)
    ai_recommendations = Column(JSON, default=list)
    ai_topics = Column(JSON, default=list)
    ai_sentiment = Column(String)  # positive / neutral / negative
    ai_talk_ratio_manager = Column(Integer)  # percent
    ai_talk_ratio_client = Column(Integer)
    ai_objection_handling = Column(Integer)
    ai_needs_identification = Column(Integer)
    ai_closing_skills = Column(Integer)

    manager = relationship("User", back_populates="conversations")
