// Implants Module
const ImplantsModule = {
    implants: [],

    init() {
        // Register message handlers
        WebSocketManager.addMessageHandler('implants', this.handleImplants.bind(this));
        WebSocketManager.addMessageHandler('command_output', this.handleCommandOutput.bind(this));
        WebSocketManager.addMessageHandler('files', this.handleFiles.bind(this));
        WebSocketManager.addMessageHandler('processes', this.handleProcesses.bind(this));
        WebSocketManager.addMessageHandler('alert', this.handleAlert.bind(this));

        // Request initial implant list
        this.refreshImplants();

        // Set up event listeners
        const sendCommandBtn = document.getElementById('send-command');
        if (sendCommandBtn) {
            sendCommandBtn.addEventListener('click', this.sendCommand.bind(this));
        }
    },

    async refreshImplants() {
        try {
            await WebSocketManager.send({ type: 'get_implants' });
        } catch (error) {
            console.error('Failed to refresh implants:', error);
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
                <td>${implant.id}</td>
                <td>${implant.hostname}</td>
                <td>${implant.ip}</td>
                <td>${implant.os}</td>
                <td>${implant.last_seen}</td>
                <td>
                    <span class="badge ${implant.status === 'online' ? 'bg-success' : 'bg-danger'}">
                        ${implant.status}
                    </span>
                </td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="ImplantsModule.selectImplant('${implant.id}')">
                        Select
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });
    },

    async selectImplant(id) {
        const implant = this.implants.find(i => i.id === id);
        if (!implant) return;
        
        const selectedImplant = document.getElementById('selected-implant');
        const implantId = document.getElementById('implant-id');
        const commandInput = document.getElementById('command-input');
        const sendCommand = document.getElementById('send-command');
        
        if (selectedImplant) selectedImplant.textContent = implant.hostname;
        if (implantId) implantId.value = implant.id;
        if (commandInput) commandInput.disabled = false;
        if (sendCommand) sendCommand.disabled = false;
        
        this.loadImplantDetails(implant);
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
    }
};

// Initialize when document is ready
document.addEventListener('DOMContentLoaded', () => {
    ImplantsModule.init();
}); 