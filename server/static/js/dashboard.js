// Initialize map - only if the element exists
let map;
try {
    const mapElement = document.getElementById('implant-map');
    if (mapElement) {
        map = L.map('implant-map').setView([0, 0], 2);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);
    } else {
        console.log('Map element not found, skipping map initialization');
    }
} catch (e) {
    console.error('Error initializing map:', e);
}

// Initialize chart
let ctx = document.getElementById('stats-chart');
let chart;

if (ctx) {
    ctx = ctx.getContext('2d');
    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Active Implants',
                data: [],
                borderColor: '#007bff',
                tension: 0.1
            }, {
                label: 'Commands Executed',
                data: [],
                borderColor: '#28a745',
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
} else {
    console.log('Stats chart element not found, skipping chart initialization');
}

// Initialize WebSocket connection
// const socket = new WebSocket(`wss://${window.location.host}/c2`);
let selectedClient = null;
let term = null;

// Initialize XTerm.js terminal
document.addEventListener('DOMContentLoaded', () => {
    term = new Terminal({
        cursorBlink: true,
        theme: {
            background: '#1e1e1e',
            foreground: '#ffffff'
        }
    });
    term.open(document.getElementById('terminal'));
    term.writeln('Welcome to Hydra C2\r\nSelect a client to begin...');

    // Command input handling
    const commandInput = document.getElementById('command-input');
    const sendButton = document.getElementById('send-command');
    
    commandInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendCommand();
        }
    });

    sendButton.addEventListener('click', sendCommand);

    document.getElementById('clear-terminal').addEventListener('click', () => {
        term.clear();
    });
});

// WebSocket event handlers
// socket.onopen = () => {
//     console.log('Connected to C2 server');
//     term.writeln('\r\nConnected to C2 server');
//     refreshClients();
// };

// socket.onclose = () => {
//     console.log('Disconnected from C2 server');
//     term.writeln('\r\nDisconnected from C2 server');
//     setTimeout(reconnect, 5000);
// };

// socket.onerror = (error) => {
//     console.error('WebSocket error:', error);
//     term.writeln('\r\nError: Connection failed');
// };

// socket.onmessage = (event) => {
//     const data = JSON.parse(event.data);
//     
//     switch (data.type) {
//         case 'clients':
//             updateClientList(data.clients);
//             break;
//         case 'command_output':
//             if (data.client_id === selectedClient) {
//                 term.writeln(`\r\n${data.output}`);
//             }
//             break;
//         case 'client_connected':
//             refreshClients();
//             term.writeln(`\r\nClient ${data.client_id} connected`);
//             break;
//         case 'client_disconnected':
//             refreshClients();
//             term.writeln(`\r\nClient ${data.client_id} disconnected`);
//             break;
//         case 'error':
//             term.writeln(`\r\nError: ${data.message}`);
//             break;
//     }
// };

// Client management functions
function refreshClients() {
    // socket.send(JSON.stringify({
    //     type: 'get_clients'
    // }));
}

function updateClientList(clients) {
    const clientList = document.getElementById('client-list');
    const clientCount = document.getElementById('client-count');
    
    clientList.innerHTML = '';
    clientCount.textContent = clients.length;

    clients.forEach(client => {
        const card = document.createElement('div');
        card.className = `card mb-2 client-card ${client.id === selectedClient ? 'selected-client' : ''}`;
        card.innerHTML = `
            <div class="card-body p-2">
                <h6 class="card-title mb-1">
                    <span class="status-${client.active ? 'active' : 'inactive'}">●</span>
                    ${client.hostname}
                </h6>
                <p class="card-text small mb-0">
                    ${client.ip} | ${client.os}
                </p>
            </div>
        `;
        
        card.addEventListener('click', () => selectClient(client));
        clientList.appendChild(card);
    });
}

function selectClient(client) {
    selectedClient = client.id;
    document.getElementById('client-hostname').textContent = client.hostname;
    document.getElementById('client-ip').textContent = client.ip;
    document.getElementById('client-os').textContent = client.os;
    document.getElementById('client-last-seen').textContent = new Date(client.last_seen).toLocaleString();
    
    refreshClients(); // Update selection highlight
    term.writeln(`\r\nSelected client: ${client.hostname} (${client.id})`);
}

function sendCommand() {
    const commandInput = document.getElementById('command-input');
    const command = commandInput.value.trim();
    
    if (!selectedClient) {
        term.writeln('\r\nError: No client selected');
        return;
    }
    
    if (!command) {
        return;
    }

    // socket.send(JSON.stringify({
    //     type: 'command',
    //     client_id: selectedClient,
    //     command: command
    // }));

    term.writeln(`\r\n$ ${command}`);
    commandInput.value = '';
}

function reconnect() {
    // if (socket.readyState === WebSocket.CLOSED) {
    //     socket = new WebSocket(`wss://${window.location.host}/c2`);
    // }
}

// Refresh client list periodically
setInterval(refreshClients, 30000);

// Update dashboard metrics
const socketIo = io();

socketIo.on('metrics', (data) => {
    document.getElementById('active-implants').textContent = data.active_implants;
    document.getElementById('pending-commands').textContent = data.pending_commands;
    document.getElementById('file-transfers').textContent = data.file_transfers;
    document.getElementById('alerts').textContent = data.alerts;
});

// Update recent activity
socketIo.on('activity', (data) => {
    const activityTable = document.getElementById('recent-activity');
    const row = document.createElement('tr');
    
    row.innerHTML = `
        <td>${data.time}</td>
        <td>${data.implant}</td>
        <td>${data.event}</td>
    `;
    
    activityTable.insertBefore(row, activityTable.firstChild);
    
    // Keep only last 10 activities
    if (activityTable.children.length > 10) {
        activityTable.removeChild(activityTable.lastChild);
    }
});

// Update implant locations
socketIo.on('implant_location', (data) => {
    const marker = L.marker([data.lat, data.lon]).addTo(map);
    marker.bindPopup(`
        <strong>${data.hostname}</strong><br>
        IP: ${data.ip}<br>
        Last Seen: ${data.last_seen}
    `);
});

// Update chart data
socketIo.on('stats', (data) => {
    const labels = data.map(d => d.time);
    const activeImplants = data.map(d => d.active_implants);
    const commandsExecuted = data.map(d => d.commands_executed);
    
    chart.data.labels = labels;
    chart.data.datasets[0].data = activeImplants;
    chart.data.datasets[1].data = commandsExecuted;
    chart.update();
});

// Handle alerts
socketIo.on('alert', (data) => {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${data.type} alert-dismissible fade show`;
    alertDiv.innerHTML = `
        ${data.message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.getElementById('alerts-container').appendChild(alertDiv);
    
    // Remove alert after 5 seconds
    setTimeout(() => {
        alertDiv.remove();
    }, 5000);
});

// Refresh data periodically
setInterval(() => {
    socketIo.emit('get_metrics');
    socketIo.emit('get_stats');
}, 5000);

// Initial data load
socketIo.emit('get_metrics');
socketIo.emit('get_stats');
socketIo.emit('get_activity');
socketIo.emit('get_implants');

// Dashboard Main Controller
document.addEventListener('DOMContentLoaded', function() {
    initializeNavigation();
});

/**
 * Initializes the dashboard navigation
 */
function initializeNavigation() {
    // Get all sidebar navigation links
    const navLinks = document.querySelectorAll('#sidebar a[href^="#"]');
    
    // Add click handlers to each link
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            if (this.getAttribute('href') === '#' && this.hasAttribute('onclick')) {
                // Skip links with onclick handlers (like logout)
                return;
            }
            
            e.preventDefault();
            
            // Get the target section id
            const targetId = this.getAttribute('href').substring(1);
            
            // Show the target section and hide others
            showSection(targetId);
            
            // Update active state in sidebar
            navLinks.forEach(navLink => {
                navLink.parentElement.classList.remove('active');
            });
            this.parentElement.classList.add('active');
            
            // Handle section-specific initialization
            handleSectionChange(targetId);
        });
    });
    
    // Initialize default section (implants)
    showSection('implants');
}

/**
 * Shows the specified section and hides others
 */
function showSection(sectionId) {
    // Hide all content sections
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.add('d-none');
    });
    
    // Show the target section
    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
        targetSection.classList.remove('d-none');
    }
}

/**
 * Handles special initialization when changing sections
 */
function handleSectionChange(sectionId) {
    console.log(`Navigated to section: ${sectionId}`);
    
    // Get the currently selected implant
    const selectedImplant = ImplantsModule.getSelectedImplant();
    console.log(`Selected implant ID: ${selectedImplant}`);
    
    switch (sectionId) {
        case 'remote-control':
            if (selectedImplant) {
                // Check if RemoteControl exists and has the required methods
                if (typeof RemoteControlModule !== 'undefined' && RemoteControlModule.selectImplant) {
                    RemoteControlModule.selectImplant(selectedImplant);
                    if (RemoteControlModule.updateSystemInfo) {
                        RemoteControlModule.updateSystemInfo();
                    }
                } else {
                    console.error('RemoteControlModule not properly initialized');
                }
            } else {
                showSelectImplantWarning();
            }
            break;
            
        case 'file-manager':
            if (selectedImplant) {
                // Check if FileManager exists and has the required methods
                if (typeof FileExplorerModule !== 'undefined' && FileExplorerModule.selectImplant) {
                    FileExplorerModule.selectImplant(selectedImplant);
                    if (FileExplorerModule.refreshFiles) {
                        FileExplorerModule.refreshFiles();
                    }
                } else if (typeof FileManager !== 'undefined' && FileManager.selectImplant) {
                    FileManager.selectImplant(selectedImplant);
                    FileManager.refreshFiles();
                } else {
                    console.error('FileManager module not properly initialized');
                }
            } else {
                showSelectImplantWarning();
            }
            break;
            
        case 'process-manager':
            if (selectedImplant) {
                // Check if ProcessManager exists and has the required methods
                if (typeof ProcessManager !== 'undefined' && ProcessManager.selectImplant) {
                    ProcessManager.selectImplant(selectedImplant);
                    ProcessManager.refreshProcesses();
                } else {
                    console.error('ProcessManager not properly initialized');
                }
            } else {
                showSelectImplantWarning();
            }
            break;
            
        case 'network':
            if (selectedImplant) {
                // Check if NetworkMonitor exists and has the required methods
                if (typeof NetworkMonitor !== 'undefined' && NetworkMonitor.selectImplant) {
                    NetworkMonitor.selectImplant(selectedImplant);
                    NetworkMonitor.refreshConnections();
                } else {
                    console.error('NetworkMonitor not properly initialized');
                }
            } else {
                showSelectImplantWarning();
            }
            break;
    }
}

/**
 * Display warning to select an implant first
 */
function showSelectImplantWarning() {
    dashboard.showNotification('Please select an implant first', 'warning');
    // Return to implants section
    showSection('implants');
    
    // Update active state in sidebar
    document.querySelectorAll('#sidebar li').forEach(item => {
        item.classList.remove('active');
    });
    document.querySelector('#sidebar a[href="#implants"]').parentElement.classList.add('active');
}

/**
 * Global redirect functions for remote control to maintain backward compatibility
 */
function captureScreen() {
    if (typeof RemoteControlModule !== 'undefined' && RemoteControlModule.captureSingleScreenshot) {
        RemoteControlModule.captureSingleScreenshot();
    } else {
        console.error('RemoteControlModule not properly initialized');
    }
}

function startScreenStream() {
    if (typeof RemoteControlModule !== 'undefined' && RemoteControlModule.startScreenStream) {
        RemoteControlModule.startScreenStream();
    } else {
        console.error('RemoteControlModule not properly initialized');
    }
}

function stopScreenStream() {
    if (typeof RemoteControlModule !== 'undefined' && RemoteControlModule.stopScreenStream) {
        RemoteControlModule.stopScreenStream();
    } else {
        console.error('RemoteControlModule not properly initialized');
    }
}

function enableRemoteControl() {
    if (typeof RemoteControlModule !== 'undefined' && RemoteControlModule.enableRemoteControl) {
        RemoteControlModule.enableRemoteControl();
    } else {
        console.error('RemoteControlModule not properly initialized');
    }
}

function disableRemoteControl() {
    if (typeof RemoteControlModule !== 'undefined' && RemoteControlModule.disableRemoteControl) {
        RemoteControlModule.disableRemoteControl();
    } else {
        console.error('RemoteControlModule not properly initialized');
    }
}

/**
 * Functions for File Manager
 */
function navigateUp() {
    if (typeof FileManager !== 'undefined' && FileManager.navigateUp) {
        FileManager.navigateUp();
    } else {
        console.error('FileManager not properly initialized');
    }
}

function refreshFiles() {
    if (typeof FileManager !== 'undefined' && FileManager.refreshFiles) {
        FileManager.refreshFiles();
    } else {
        console.error('FileManager not properly initialized');
    }
}

function navigateToPath() {
    if (typeof FileManager !== 'undefined' && FileManager.navigateToPath) {
        FileManager.navigateToPath();
    } else {
        console.error('FileManager not properly initialized');
    }
}

/**
 * Functions for Process Manager
 */
function refreshProcesses() {
    if (typeof ProcessManager !== 'undefined' && ProcessManager.refreshProcesses) {
        ProcessManager.refreshProcesses();
    } else {
        console.error('ProcessManager not properly initialized');
    }
}

// Theme management
function setTheme(theme) {
    document.body.classList.remove('dark-theme');
    if (theme === 'dark') {
        document.body.classList.add('dark-theme');
    }
    localStorage.setItem('theme', theme);
}

// Notification system
function showNotification(message, type = 'info') {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    const container = document.getElementById('alerts-container') || document.body;
    container.appendChild(alertDiv);
    
    // Remove alert after 5 seconds
    setTimeout(() => {
        alertDiv.remove();
    }, 5000);
}

// Command console management
function openCommandConsole(implantId) {
    const modal = new bootstrap.Modal(document.getElementById('commandConsole'));
    document.getElementById('implant-id').value = implantId;
    modal.show();
}

// Utility functions
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDate(timestamp) {
    return new Date(timestamp * 1000).toLocaleString();
}

// Error handling
function handleError(error) {
    console.error('Error:', error);
    showNotification(error.message || 'An error occurred', 'danger');
}

// WebSocket connection management
let socket = null;

function initializeWebSocket() {
    socket = io({
        transports: ['websocket'],
        secure: true
    });

    socket.on('connect', () => {
        showNotification('Connected to server', 'success');
    });

    socket.on('disconnect', () => {
        showNotification('Disconnected from server', 'warning');
    });

    socket.on('error', (error) => {
        handleError(error);
    });

    return socket;
}

// Export functions for use in other modules
window.dashboard = {
    showNotification,
    openCommandConsole,
    formatBytes,
    formatDate,
    handleError,
    initializeWebSocket
}; 