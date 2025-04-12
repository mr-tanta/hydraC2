# Hydra C2 Framework

A secure Command and Control (C2) framework with advanced anti-analysis capabilities and encrypted communication.

## Overview

This framework consists of two main components:
1. **Client (Implant)**: A stealthy implant that runs on target systems
2. **Server (C2)**: A command and control server that manages implants

### Features

- Encrypted communication using Fernet (symmetric encryption)
- Anti-analysis and anti-debugging capabilities
- Secure logging with anti-forensics
- Hardware-bound encryption keys
- Certificate pinning for secure communication
- SQLite database for persistent storage
- Command queuing and execution
- File transfer capabilities

## Prerequisites

- Python 3.8 or higher
- Windows operating system (for client)
- Administrator privileges (for some anti-analysis features)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/hydra_c2.git
cd hydra_c2
```

2. Create a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

## Configuration

### Server Setup

1. Set the pre-shared key (PSK) environment variable:
```bash
# On Windows
set C2_PSK=your_secret_key_here

# On Linux/Mac
export C2_PSK=your_secret_key_here
```

2. Start the C2 server:
```bash
python server/c2_server.py
```

The server will:
- Create a SQLite database (`c2.db`)
- Generate SSL certificates on first run
- Listen on port 443 for HTTPS connections

### Client Setup

1. Configure the client:
   - Open `client/network.py`
   - Update the `server_url` variable with your C2 server's address
   - Ensure the PSK matches the server's PSK

2. Run the client:
```bash
python client/main.py
```

## Usage

### Server Commands

The C2 server supports the following commands:

1. **Shell Commands**:
```python
c2_server.queue_command(implant_id, "shell", ["command", "arg1", "arg2"])
```

2. **File Download**:
```python
c2_server.queue_command(implant_id, "download", ["/path/to/file"])
```

3. **File Upload**:
```python
c2_server.queue_command(implant_id, "upload", ["/path/to/save", "base64_encoded_content"])
```

### Monitoring

- Check the SQLite database for implant information:
```bash
sqlite3 c2.db
```

- View active implants:
```sql
SELECT * FROM implants;
```

- View command history:
```sql
SELECT * FROM commands;
```

## Security Features

### Anti-Analysis
- Debugger detection
- Virtualization detection
- Sandbox detection
- Timing checks
- Hardware artifact detection

### Anti-Forensics
- Secure log deletion
- Timestamp manipulation
- Encrypted logging
- Hardware-bound encryption

### Network Security
- Certificate pinning
- Encrypted communication
- Stealthy HTTP headers
- Jittered beacon intervals

## Development

### Project Structure
```
hydra_c2/
├── client/
│   ├── anti_analysis.py
│   ├── logger.py
│   ├── main.py
│   └── network.py
├── server/
│   └── c2_server.py
├── requirements.txt
└── README.md
```

### Adding New Features

1. **New Commands**:
   - Add command handling in `client/network.py`
   - Update server-side handling in `server/c2_server.py`

2. **Anti-Analysis**:
   - Add new checks in `client/anti_analysis.py`
   - Update the `check_environment()` method

3. **Logging**:
   - Modify `client/logger.py` for new logging features
   - Update encryption/decryption methods as needed

## Troubleshooting

1. **Connection Issues**:
   - Verify PSK matches between client and server
   - Check firewall settings
   - Ensure SSL certificates are properly generated

2. **Command Execution Failures**:
   - Check implant status in database
   - Verify command syntax
   - Check server logs for errors

3. **Anti-Analysis Triggers**:
   - Review `anti_analysis.py` settings
   - Adjust detection thresholds if needed
   - Check for false positives

## Security Notes

- This framework is for educational purposes only
- Use responsibly and ethically
- Do not use against systems without permission
- Keep PSK secure and rotate regularly
- Monitor logs for suspicious activity

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details. 