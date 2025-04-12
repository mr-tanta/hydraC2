import websockets
import asyncio
from core.protobufs.hydra_pb2 import ClientMessage, Heartbeat, SystemInfo

async def test_connection():
    async with websockets.connect("wss://localhost/c2") as ws:
        # Authentication (JWT)
        await ws.send("dummy_jwt_token")
        
        # Send heartbeat
        hb = ClientMessage(
            client_id="test_client",
            heartbeat=Heartbeat(
                timestamp=1689293205,
                system=SystemInfo(
                    os="Windows 11 Pro",
                    hostname="TARGET-PC",
                    is_admin=True,
                    gpu="NVIDIA RTX 4090"
                )
            )
        )
        await ws.send(hb.SerializeToString())
        
        # Receive commands
        while True:
            response = await ws.recv()
            print(f"Received command: {response}")

asyncio.run(test_connection())