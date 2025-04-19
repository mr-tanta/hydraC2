# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands
- Server: `python -m uvicorn server.c2_server:app --host 0.0.0.0 --port 8443 --ssl-keyfile server.key --ssl-certfile server.crt --reload`
- Client build: `python client/build.py build`
- Lab package build: `client/build_lab_package.bat`
- Start server: `start_server.bat`

## Code Style Guidelines
- Use snake_case for variables/functions, PascalCase for classes
- Import order: standard library → external deps → internal modules
- Type annotations required for all functions (parameters and returns)
- Error handling: use explicit try/except with logging
- Private methods prefixed with underscore (e.g., `_private_method`)
- Document functions with docstring: `"""Brief description"""`

## Project Structure
- `server/`: C2 server components and web interface
- `client/`: Implant code and build scripts
- `core/`: Shared components (encryption, protobufs)
- `tests/`: Testing utilities

The codebase uses FastAPI, WebSockets for communication, and follows a modular architecture with clear separation of concerns.