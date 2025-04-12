from sqlalchemy import create_engine, Column, Integer, String, DateTime, ForeignKey, Text, Boolean, Float
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship, sessionmaker
from datetime import datetime
import os
from passlib.context import CryptContext

Base = declarative_base()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

class User(Base):
    __tablename__ = 'users'
    
    id = Column(Integer, primary_key=True)
    username = Column(String(50), unique=True, nullable=False)
    email = Column(String(120), unique=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    is_admin = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_login = Column(DateTime)
    
    # Relationships
    sessions = relationship("UserSession", back_populates="user")
    commands = relationship("Command", back_populates="user")

class UserSession(Base):
    __tablename__ = 'user_sessions'
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'))
    token = Column(String(255), unique=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)
    is_valid = Column(Boolean, default=True)
    
    # Relationships
    user = relationship("User", back_populates="sessions")

class Implant(Base):
    __tablename__ = 'implants'
    
    id = Column(String(50), primary_key=True)
    first_seen = Column(DateTime, default=datetime.utcnow)
    last_seen = Column(DateTime, default=datetime.utcnow)
    hostname = Column(String(255))
    username = Column(String(255))
    os_info = Column(String(255))
    ip_address = Column(String(45))
    status = Column(String(20), default='active')
    version = Column(String(20))
    architecture = Column(String(20))
    
    # Relationships
    commands = relationship("Command", back_populates="implant")
    files = relationship("File", back_populates="implant")

class Command(Base):
    __tablename__ = 'commands'
    
    id = Column(Integer, primary_key=True)
    implant_id = Column(String(50), ForeignKey('implants.id'))
    user_id = Column(Integer, ForeignKey('users.id'))
    command = Column(String(255), nullable=False)
    args = Column(Text)  # Stored as JSON string
    timestamp = Column(DateTime, default=datetime.utcnow)
    status = Column(String(20), default='pending')  # pending, running, completed, failed
    output = Column(Text)
    error = Column(Text)
    
    # Relationships
    implant = relationship("Implant", back_populates="commands")
    user = relationship("User", back_populates="commands")

class File(Base):
    __tablename__ = 'files'
    
    id = Column(Integer, primary_key=True)
    implant_id = Column(String(50), ForeignKey('implants.id'))
    filename = Column(String(255), nullable=False)
    path = Column(String(1024))
    size = Column(Integer)
    direction = Column(String(20))  # upload, download
    timestamp = Column(DateTime, default=datetime.utcnow)
    status = Column(String(20), default='pending')  # pending, completed, failed
    hash = Column(String(64))  # SHA-256 hash of the file
    
    # Relationships
    implant = relationship("Implant", back_populates="files")

def create_admin_user(session):
    """Create admin user if it doesn't exist"""
    admin = session.query(User).filter(User.username == "admin").first()
    if not admin:
        admin = User(
            username="admin",
            email="admin@local.dev",
            hashed_password=pwd_context.hash("admin"),
            is_active=True,
            is_admin=True,
            created_at=datetime.utcnow()
        )
        session.add(admin)
        session.commit()
    return admin

# Create database engine and tables
def init_db():
    db_path = os.path.join(os.path.dirname(__file__), 'hydra.db')
    engine = create_engine(f'sqlite:///{db_path}')
    Base.metadata.create_all(engine)
    
    # Create admin user
    Session = sessionmaker(bind=engine)
    session = Session()
    try:
        create_admin_user(session)
    finally:
        session.close()
    
    return engine

if __name__ == '__main__':
    init_db()
