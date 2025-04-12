// Network Monitor Module
const NetworkMonitor = {
    socket: null,
    selectedImplant: null,
    connectionList: [],
    isCapturing: false,
    captureInterval: null,

    init(socket) {
        this.socket = socket;
        this.setupEventListeners();
    },

    setupEventListeners() {
        // Control buttons
        document.getElementById('refresh-connections').addEventListener('click', () => this.refreshConnections());
        document.getElementById('start-capture').addEventListener('click', () => this.startCapture());
        document.getElementById('stop-capture').addEventListener('click', () => this.stopCapture());

        // Socket event listeners
        this.socket.on('connection_list', this.handleConnectionList.bind(this));
        this.socket.on('network_capture', this.handleNetworkCapture.bind(this));
    },

    selectImplant(implantId) {
        this.selectedImplant = implantId;
        this.refreshConnections();
    },

    refreshConnections() {
        if (!this.selectedImplant) {
            dashboard.showNotification('Please select an implant first', 'warning');
            return;
        }

        this.socket.emit('get_connections', {
            implant_id: this.selectedImplant
        });
    },

    handleConnectionList(data) {
        this.connectionList = data.connections;
        this.renderConnectionList();
    },

    renderConnectionList() {
        const connectionList = document.getElementById('connections-list');
        connectionList.innerHTML = '';

        this.connectionList.forEach(conn => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${conn.protocol}</td>
                <td>${conn.local_address}</td>
                <td>${conn.remote_address}</td>
                <td>
                    <span class="badge ${this.getStatusBadgeClass(conn.state)}">
                        ${conn.state}
                    </span>
                </td>
                <td>${conn.pid}</td>
                <td>${conn.program}</td>
                <td>
                    <div class="btn-group">
                        <button class="btn btn-sm btn-info" onclick="NetworkMonitor.viewConnectionDetails('${conn.id}')">
                            <i class="fas fa-info-circle"></i> Details
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="NetworkMonitor.closeConnection('${conn.id}')">
                            <i class="fas fa-times"></i> Close
                        </button>
                    </div>
                </td>
            `;
            connectionList.appendChild(row);
        });
    },

    getStatusBadgeClass(state) {
        switch (state.toLowerCase()) {
            case 'established':
                return 'bg-success';
            case 'listening':
                return 'bg-info';
            case 'time_wait':
                return 'bg-warning';
            case 'closed':
                return 'bg-danger';
            default:
                return 'bg-secondary';
        }
    },

    startCapture() {
        if (!this.selectedImplant) {
            dashboard.showNotification('Please select an implant first', 'warning');
            return;
        }

        if (this.isCapturing) {
            dashboard.showNotification('Network capture is already active', 'info');
            return;
        }

        this.isCapturing = true;
        this.socket.emit('start_capture', {
            implant_id: this.selectedImplant
        });

        // Start periodic refresh
        this.captureInterval = setInterval(() => {
            this.refreshConnections();
        }, 5000); // Refresh every 5 seconds

        dashboard.showNotification('Network capture started', 'success');
    },

    stopCapture() {
        if (!this.isCapturing) {
            dashboard.showNotification('No active network capture', 'info');
            return;
        }

        this.isCapturing = false;
        clearInterval(this.captureInterval);
        this.socket.emit('stop_capture', {
            implant_id: this.selectedImplant
        });

        dashboard.showNotification('Network capture stopped', 'info');
    },

    handleNetworkCapture(data) {
        // Update connection list with new data
        this.connectionList = data.connections;
        this.renderConnectionList();

        // Show notification for new connections
        if (data.new_connections && data.new_connections.length > 0) {
            data.new_connections.forEach(conn => {
                dashboard.showNotification(
                    `New connection: ${conn.program} (${conn.protocol})`,
                    'info'
                );
            });
        }
    },

    viewConnectionDetails(connectionId) {
        if (!this.selectedImplant) return;

        this.socket.emit('get_connection_details', {
            implant_id: this.selectedImplant,
            connection_id: connectionId
        });
    },

    closeConnection(connectionId) {
        if (!this.selectedImplant) return;

        if (confirm('Are you sure you want to close this connection?')) {
            this.socket.emit('close_connection', {
                implant_id: this.selectedImplant,
                connection_id: connectionId
            });
        }
    },

    // Connection details modal
    showConnectionDetailsModal(details) {
        const modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.id = 'connectionDetailsModal';
        modal.innerHTML = `
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Connection Details</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="row">
                            <div class="col-md-6">
                                <h6>Local Endpoint</h6>
                                <table class="table">
                                    <tr>
                                        <th>Address:</th>
                                        <td>${details.local_address}</td>
                                    </tr>
                                    <tr>
                                        <th>Port:</th>
                                        <td>${details.local_port}</td>
                                    </tr>
                                </table>
                            </div>
                            <div class="col-md-6">
                                <h6>Remote Endpoint</h6>
                                <table class="table">
                                    <tr>
                                        <th>Address:</th>
                                        <td>${details.remote_address}</td>
                                    </tr>
                                    <tr>
                                        <th>Port:</th>
                                        <td>${details.remote_port}</td>
                                    </tr>
                                </table>
                            </div>
                        </div>
                        <div class="row mt-3">
                            <div class="col-12">
                                <h6>Connection Information</h6>
                                <table class="table">
                                    <tr>
                                        <th>Protocol:</th>
                                        <td>${details.protocol}</td>
                                    </tr>
                                    <tr>
                                        <th>State:</th>
                                        <td>
                                            <span class="badge ${this.getStatusBadgeClass(details.state)}">
                                                ${details.state}
                                            </span>
                                        </td>
                                    </tr>
                                    <tr>
                                        <th>Program:</th>
                                        <td>${details.program}</td>
                                    </tr>
                                    <tr>
                                        <th>PID:</th>
                                        <td>${details.pid}</td>
                                    </tr>
                                </table>
                            </div>
                        </div>
                        <div class="row mt-3">
                            <div class="col-12">
                                <h6>Traffic Statistics</h6>
                                <table class="table">
                                    <tr>
                                        <th>Bytes Sent:</th>
                                        <td>${dashboard.formatBytes(details.bytes_sent)}</td>
                                    </tr>
                                    <tr>
                                        <th>Bytes Received:</th>
                                        <td>${dashboard.formatBytes(details.bytes_received)}</td>
                                    </tr>
                                    <tr>
                                        <th>Packets Sent:</th>
                                        <td>${details.packets_sent}</td>
                                    </tr>
                                    <tr>
                                        <th>Packets Received:</th>
                                        <td>${details.packets_received}</td>
                                    </tr>
                                </table>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                        <button type="button" class="btn btn-danger" onclick="NetworkMonitor.closeConnection('${details.id}')">
                            Close Connection
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
        if (data.type === 'network_connections') {
            updateNetworkConnections(data.connections);
        } else if (data.type === 'network_interfaces') {
            updateNetworkInterfaces(data.interfaces);
        }
    };

    NetworkMonitor.init(socket);
}); 