// Implants Module
const ImplantsModule = {
    implants: [],
    selectedImplant: null,

    init(socket) {
        this.socket = socket;
        this.setupEventListeners();
        console.log('ImplantsModule initialized with socket');
        
        // Check if there's a stored implant selection in WebSocketManager or localStorage
        const storedImplantId = WebSocketManager?.selectedImplantId || localStorage.getItem('selectedImplantId');
        if (storedImplantId) {
            console.log(`ImplantsModule: Restoring selected implant ${storedImplantId}`);
            this.selectedImplant = storedImplantId;
            
            // Wait for implants to load before highlighting the selected one
            document.addEventListener('socket-message', (event) => {
                if (event.detail && event.detail.type === 'implants') {
                    // Update UI to highlight the selected implant
                    setTimeout(() => this.updateSelectedImplantUI(), 100);
                }
            }, { once: true });
        }
        
        // Add listener for implant selection changes
        document.addEventListener('implant-selected', (event) => {
            if (event.detail && event.detail.implantId) {
                console.log(`ImplantsModule: Received implant selection event for ${event.detail.implantId}`);
                this.selectedImplant = event.detail.implantId;
                this.updateSelectedImplantUI();
            }
        });
    },

    setupEventListeners() {
        // Socket event listeners - only set up if socket is defined
        if (this.socket) {
            this.socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'implants') {
                        this.handleImplants(data);
                    }
                } catch (e) {
                    console.error('Error processing WebSocket message:', e);
                }
            };
        } else {
            console.warn('ImplantsModule: Socket not available for event listener setup');
            // Listen to the document event instead, which WebSocketManager will dispatch
            document.addEventListener('socket-message', (event) => {
                if (event.detail && event.detail.type === 'implants') {
                    this.handleImplants(event.detail);
                }
            });
        }
    },

    handleImplants(data) {
        this.implants = data.implants;
        this.updateImplantTable();
    },

    updateImplantTable() {
        const table = document.getElementById('implants-table');
        if (!table) return;

        const tbody = table.getElementsByTagName('tbody')[0];
        tbody.innerHTML = '';
        
        this.implants.forEach(implant => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${implant.id.substring(0, 8)}...</td>
                <td>${implant.hostname}</td>
                <td>${implant.ip}</td>
                <td>${implant.os}</td>
                <td>${new Date(implant.last_seen).toLocaleString()}</td>
                <td>
                    <span class="badge ${implant.status === 'online' ? 'bg-success' : 'bg-danger'}">
                        ${implant.status}
                    </span>
                </td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="viewImplant('${implant.id}')">
                        View
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });
    },

    selectImplant(implantId) {
        console.log(`ImplantsModule: Setting selected implant to ${implantId}`);
        this.selectedImplant = implantId;
        
        // Update the UI to show the selected implant
        this.updateSelectedImplantUI();
        
        // Also update localStorage directly as a fallback
        localStorage.setItem('selectedImplantId', implantId);
        
        // Update RemoteControlModule if it exists
        if (typeof window.RemoteControlModule !== 'undefined' && window.RemoteControlModule) {
            console.log('Notifying RemoteControlModule about implant selection');
            RemoteControlModule.selectImplant(implantId);
            
            // Also refresh system info if we're on the remote control page
            if (document.getElementById('remote-control') && 
                !document.getElementById('remote-control').classList.contains('d-none')) {
                console.log('Refreshing system info for selected implant');
                RemoteControlModule.updateSystemInfo();
            }
        } else {
            console.log('RemoteControlModule not available when selecting implant - implant selection will be applied when module loads');
        }
        
        return implantId;
    },

    getSelectedImplant() {
        return this.selectedImplant;
    },

    refreshImplants() {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({ type: 'get_implants' }));
        } else {
            console.error('Cannot refresh implants: WebSocket not connected');
        }
    },

    async loadImplantDetails(implant) {
        const osInfo = document.getElementById('os-info');
        const ipInfo = document.getElementById('ip-info');
        const lastSeen = document.getElementById('last-seen');
        
        if (osInfo) osInfo.textContent = implant.os;
        if (ipInfo) ipInfo.textContent = implant.ip;
        if (lastSeen) lastSeen.textContent = implant.last_seen;
        
        try {
            await WebSocketManager.send({ 
                type: 'get_files', 
                implant_id: implant.id, 
                path: '/' 
            });
            
            await WebSocketManager.send({ 
                type: 'get_processes', 
                implant_id: implant.id 
            });
        } catch (error) {
            console.error('Failed to load implant details:', error);
        }
    },

    async sendCommand() {
        const commandInput = document.getElementById('command-input');
        const implantId = document.getElementById('implant-id');
        
        if (!commandInput || !implantId || !commandInput.value || !implantId.value) return;
        
        try {
            await WebSocketManager.send({
                type: 'send_command',
                implant_id: implantId.value,
                command: commandInput.value
            });
            
            commandInput.value = '';
        } catch (error) {
            console.error('Failed to send command:', error);
        }
    },

    handleCommandOutput(data) {
        const output = document.getElementById('command-output');
        if (!output) return;
        
        output.innerHTML += `<div class="command-line">${data.output}</div>`;
        output.scrollTop = output.scrollHeight;
    },

    handleFiles(data) {
        const fileList = document.getElementById('file-list');
        if (!fileList) return;
        
        fileList.innerHTML = '';
        
        data.files.forEach(file => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>
                    <i class="fas ${file.type === 'directory' ? 'fa-folder' : 'fa-file'}"></i>
                    ${file.name}
                </td>
                <td>${file.size}</td>
                <td>${file.modified}</td>
                <td>
                    ${file.type === 'file' ? `
                        <button class="btn btn-sm btn-primary" onclick="ImplantsModule.downloadFile('${file.path}')">
                            Download
                        </button>
                    ` : ''}
                </td>
            `;
            fileList.appendChild(row);
        });
    },

    handleProcesses(data) {
        const processList = document.getElementById('process-list');
        if (!processList) return;
        
        processList.innerHTML = '';
        
        data.processes.forEach(process => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${process.pid}</td>
                <td>${process.name}</td>
                <td>${process.user}</td>
                <td>${process.memory}</td>
                <td>
                    <button class="btn btn-sm btn-danger" onclick="ImplantsModule.killProcess('${process.pid}')">
                        Kill
                    </button>
                </td>
            `;
            processList.appendChild(row);
        });
    },

    handleAlert(data) {
        const alertsContainer = document.getElementById('alerts-container');
        if (!alertsContainer) return;
        
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${data.type} alert-dismissible fade show`;
        alertDiv.innerHTML = `
            ${data.message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        
        alertsContainer.appendChild(alertDiv);
        
        setTimeout(() => {
            alertDiv.remove();
        }, 5000);
    },

    async downloadFile(path) {
        const implantId = document.getElementById('implant-id');
        if (!implantId || !implantId.value) return;
        
        try {
            await WebSocketManager.send({
                type: 'download_file',
                implant_id: implantId.value,
                path: path
            });
        } catch (error) {
            console.error('Failed to download file:', error);
        }
    },

    async killProcess(pid) {
        const implantId = document.getElementById('implant-id');
        if (!implantId || !implantId.value) return;
        
        try {
            await WebSocketManager.send({
                type: 'kill_process',
                implant_id: implantId.value,
                pid: pid
            });
        } catch (error) {
            console.error('Failed to kill process:', error);
        }
    },

    // Add a new method to update the UI for selected implant
    updateSelectedImplantUI() {
        // Update UI to show selected implant
        document.querySelectorAll('#implants-table tbody tr').forEach(row => {
            row.classList.remove('table-primary');
            
            // Get the ID from the first cell
            const cellId = row.cells[0].innerText.replace('...', '');
            if (this.selectedImplant && this.selectedImplant.startsWith(cellId)) {
                row.classList.add('table-primary');
            }
        });
        
        // Update header with selected implant
        const header = document.getElementById('selected-implant-header');
        if (header) {
            const implant = this.implants.find(imp => imp.id === this.selectedImplant);
            header.innerHTML = implant 
                ? `Selected: ${implant.hostname} (${implant.ip})`
                : 'No implant selected';
            header.classList.remove('d-none');
        }
    }
};

// Initialize when document is ready or when websocket is available
document.addEventListener('DOMContentLoaded', () => {
    // Don't pass socket directly - wait for WebSocketManager to be ready
    ImplantsModule.init();
});

// Listen for WebSocket ready event
document.addEventListener('websocket-ready', (event) => {
    console.log('ImplantsModule: WebSocket is ready, reinitializing with socket');
    ImplantsModule.init(event.detail);
}); 