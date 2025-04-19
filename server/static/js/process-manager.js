// Process Manager Module
const ProcessManager = {
    socket: null,
    selectedImplant: null,
    processList: [],
    searchTerm: '',

    init(socket) {
        this.socket = socket;
        console.log('ProcessManager initialized with socket');
        this.setupEventListeners();
    },

    setupEventListeners() {
        try {
            // Refresh button
            const refreshBtn = document.getElementById('refresh-processes');
            if (refreshBtn) {
                refreshBtn.addEventListener('click', () => this.refreshProcesses());
            }

            // Search input
            const searchInput = document.getElementById('process-search');
            if (searchInput) {
                searchInput.addEventListener('input', (e) => {
                    this.searchTerm = e.target.value.toLowerCase();
                    this.filterProcesses();
                });
            }

            // Use custom event for WebSocket messages
            document.addEventListener('socket-message', (event) => {
                const message = event.detail;
                if (message.type === 'process_list') {
                    this.handleProcessList(message);
                } else if (message.type === 'process_killed') {
                    this.handleProcessKilled(message);
                } else if (message.type === 'process_info') {
                    this.showProcessDetailsModal(message.process_info);
                }
            });
            
            console.log('ProcessManager event listeners set up');
        } catch (error) {
            console.error('Error setting up ProcessManager event listeners:', error);
        }
    },

    selectImplant(implantId) {
        console.log(`ProcessManager: Setting selected implant to ${implantId}`);
        this.selectedImplant = implantId;
        return implantId;
    },

    refreshProcesses() {
        if (!this.selectedImplant) {
            dashboard.showNotification('Please select an implant first', 'warning');
            return;
        }

        if (WebSocketManager && WebSocketManager.send) {
            WebSocketManager.send({
                type: 'get_processes',
                implant_id: this.selectedImplant
            });
            console.log(`Requested processes for implant: ${this.selectedImplant}`);
        } else {
            console.error('WebSocketManager not available');
        }
    },

    handleProcessList(data) {
        if (!data.processes) {
            console.error('No process data received');
            return;
        }
        
        this.processList = data.processes;
        this.filterProcesses();
    },

    filterProcesses() {
        const filteredProcesses = this.searchTerm
            ? this.processList.filter(process => 
                process.name.toLowerCase().includes(this.searchTerm) ||
                process.pid.toString().includes(this.searchTerm) ||
                process.user.toLowerCase().includes(this.searchTerm)
            )
            : this.processList;

        this.renderProcessList(filteredProcesses);
    },

    renderProcessList(processes) {
        const processList = document.getElementById('process-list');
        if (!processList) {
            console.error('Process list element not found');
            return;
        }
        
        processList.innerHTML = '';

        processes.forEach(process => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${process.pid}</td>
                <td>${process.name}</td>
                <td>${process.user}</td>
                <td>${dashboard.formatBytes(process.memory)}</td>
                <td>${process.cpu}%</td>
                <td>
                    <div class="btn-group">
                        <button class="btn btn-sm btn-info" onclick="ProcessManager.viewProcessDetails('${process.pid}')">
                            <i class="fas fa-info-circle"></i> Details
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="ProcessManager.killProcess('${process.pid}')">
                            <i class="fas fa-times"></i> Kill
                        </button>
                    </div>
                </td>
            `;
            processList.appendChild(row);
        });
    },

    viewProcessDetails(pid) {
        if (!this.selectedImplant) return;

        if (WebSocketManager && WebSocketManager.send) {
            WebSocketManager.send({
                type: 'get_process_details',
                implant_id: this.selectedImplant,
                pid: pid
            });
        }
    },

    killProcess(pid) {
        if (!this.selectedImplant) return;

        if (confirm(`Are you sure you want to kill process ${pid}?`)) {
            if (WebSocketManager && WebSocketManager.send) {
                WebSocketManager.send({
                    type: 'kill_process',
                    implant_id: this.selectedImplant,
                    pid: pid
                });
            }
        }
    },

    handleProcessKilled(data) {
        if (data.success) {
            dashboard.showNotification(`Process ${data.pid} killed successfully`, 'success');
            this.refreshProcesses();
        } else {
            dashboard.showNotification(`Failed to kill process ${data.pid}: ${data.error}`, 'danger');
        }
    },

    // Process details modal
    showProcessDetailsModal(details) {
        if (!details) {
            console.error('No process details received');
            return;
        }
        
        try {
            const modal = document.createElement('div');
            modal.className = 'modal fade';
            modal.id = 'processDetailsModal';
            modal.innerHTML = `
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Process Details</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="row">
                                <div class="col-md-6">
                                    <h6>Basic Information</h6>
                                    <table class="table">
                                        <tr>
                                            <th>PID:</th>
                                            <td>${details.pid}</td>
                                        </tr>
                                        <tr>
                                            <th>Name:</th>
                                            <td>${details.name}</td>
                                        </tr>
                                        <tr>
                                            <th>User:</th>
                                            <td>${details.user}</td>
                                        </tr>
                                        <tr>
                                            <th>Status:</th>
                                            <td>${details.status}</td>
                                        </tr>
                                    </table>
                                </div>
                                <div class="col-md-6">
                                    <h6>Resource Usage</h6>
                                    <table class="table">
                                        <tr>
                                            <th>CPU:</th>
                                            <td>${details.cpu}%</td>
                                        </tr>
                                        <tr>
                                            <th>Memory:</th>
                                            <td>${dashboard.formatBytes(details.memory)}</td>
                                        </tr>
                                        <tr>
                                            <th>Threads:</th>
                                            <td>${details.threads}</td>
                                        </tr>
                                        <tr>
                                            <th>Priority:</th>
                                            <td>${details.priority}</td>
                                        </tr>
                                    </table>
                                </div>
                            </div>
                            <div class="row mt-3">
                                <div class="col-12">
                                    <h6>Command Line</h6>
                                    <pre class="bg-light p-2">${details.command_line}</pre>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                            <button type="button" class="btn btn-danger" onclick="ProcessManager.killProcess('${details.pid}')">
                                Kill Process
                            </button>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);
            const modalInstance = new bootstrap.Modal(modal);
            modalInstance.show();

            modal.addEventListener('hidden.bs.modal', () => {
                modal.remove();
            });
        } catch (error) {
            console.error('Error displaying process details:', error);
        }
    }
};

// Remove the duplicate initialization since WebSocketManager now handles this
document.addEventListener('DOMContentLoaded', () => {
    // WebSocketManager will initialize this module
    console.log('ProcessManager waiting for WebSocketManager initialization');
}); 