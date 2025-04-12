// WebSocket Manager Module
const WebSocketManager = {
    socket: null,
    messageHandlers: new Map(),
    connectionPromise: null,
    connectionRetries: 0,
    maxRetries: 5,

    init() {
        // Verify token first
        const token = localStorage.getItem('token');
        if (!token) {
            console.error('No authentication token found');
            window.location.href = '/login';
            return;
        }
        
        console.log(`Initializing WebSocket with token: ${token.substring(0, 15)}...`);
        
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
                return;
            }
            
            // Token is valid, initialize WebSocket
            this.initWebSocket(token);
        }).catch(error => {
            console.error('API validation error:', error);
            this.connectionRetries++;
            if (this.connectionRetries < this.maxRetries) {
                setTimeout(() => this.init(), 2000);
            }
        });
    },
    
    initWebSocket(token) {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/dashboard?token=${token}`;
        console.log(`Connecting to WebSocket at: ${wsUrl}`);
        
        this.socket = new WebSocket(wsUrl);
        
        this.connectionPromise = new Promise((resolve, reject) => {
            this.socket.onopen = () => {
                console.log('WebSocket connection established');
                this.connectionRetries = 0;
                resolve();
            };
            
            this.socket.onerror = (error) => {
                console.error('WebSocket error:', error);
                reject(error);
            };
        });

        this.socket.onmessage = (event) => {
            console.log('WebSocket message received:', event.data);
            try {
                const data = JSON.parse(event.data);
                const handlers = this.messageHandlers.get(data.type) || [];
                handlers.forEach(handler => handler(data));
                
                // Default handler for implants data
                if (data.type === 'implants' && !this.messageHandlers.has('implants')) {
                    if (typeof updateImplantsTable === 'function') {
                        updateImplantsTable(data.implants);
                    } else {
                        console.warn('updateImplantsTable function not available');
                    }
                }
            } catch (e) {
                console.error('Error processing WebSocket message:', e);
            }
        };

        this.socket.onclose = (event) => {
            console.log('WebSocket connection closed:', event.code, event.reason);
            if (event.code === 4003) {
                console.error('Authentication failed:', event.reason);
                localStorage.removeItem('token');
                window.location.href = '/login';
                return;
            }
            
            this.connectionRetries++;
            if (this.connectionRetries < this.maxRetries) {
                const delay = this.connectionRetries * 2000;
                console.log(`Reconnecting in ${delay}ms (attempt ${this.connectionRetries} of ${this.maxRetries})`);
                setTimeout(() => this.init(), delay);
            } else {
                console.error('Max WebSocket reconnection attempts reached.');
                // Fall back to periodic polling
                console.log('Switching to API polling fallback.');
            }
        };
    },

    async send(message) {
        try {
            // Wait for connection to be established
            await this.connectionPromise;
            this.socket.send(JSON.stringify(message));
        } catch (error) {
            console.error('Failed to send message:', error);
            throw error;
        }
    },

    addMessageHandler(type, handler) {
        if (!this.messageHandlers.has(type)) {
            this.messageHandlers.set(type, []);
        }
        this.messageHandlers.get(type).push(handler);
    },

    removeMessageHandler(type, handler) {
        const handlers = this.messageHandlers.get(type);
        if (handlers) {
            const index = handlers.indexOf(handler);
            if (index !== -1) {
                handlers.splice(index, 1);
            }
        }
    }
};

// Initialize WebSocket connection
document.addEventListener('DOMContentLoaded', () => {
    WebSocketManager.init();
    
    // Add handler for implants
    WebSocketManager.addMessageHandler('implants', (data) => {
        if (typeof updateImplantsTable === 'function') {
            updateImplantsTable(data.implants);
        }
    });
}); 