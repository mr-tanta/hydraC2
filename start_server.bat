@echo off
echo Starting Hydra C2 Server...
python -m uvicorn server.c2_server:app --host 0.0.0.0 --port 8443 --ssl-keyfile server.key --ssl-certfile server.crt --reload