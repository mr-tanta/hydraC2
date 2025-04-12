// Handle login form submission
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // Store token
            localStorage.setItem('token', data.token);
            
            // Redirect to dashboard
            window.location.href = '/dashboard';
        } else {
            showError(data.message);
        }
    } catch (error) {
        showError('An error occurred during login');
    }
});

// Handle registration form submission
document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    
    if (password !== confirmPassword) {
        showError('Passwords do not match');
        return;
    }
    
    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // Store token
            localStorage.setItem('token', data.token);
            
            // Redirect to dashboard
            window.location.href = '/dashboard';
        } else {
            showError(data.message);
        }
    } catch (error) {
        showError('An error occurred during registration');
    }
});

// Handle password reset request
document.getElementById('reset-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('email').value;
    
    try {
        const response = await fetch('/api/auth/reset-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showSuccess('Password reset instructions have been sent to your email');
        } else {
            showError(data.message);
        }
    } catch (error) {
        showError('An error occurred while requesting password reset');
    }
});

// Handle password change
document.getElementById('change-password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    
    if (newPassword !== confirmPassword) {
        showError('New passwords do not match');
        return;
    }
    
    try {
        const response = await fetch('/api/auth/change-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
                current_password: currentPassword,
                new_password: newPassword
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showSuccess('Password changed successfully');
            document.getElementById('change-password-form').reset();
        } else {
            showError(data.message);
        }
    } catch (error) {
        showError('An error occurred while changing password');
    }
});

// Handle 2FA setup
document.getElementById('setup-2fa-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    try {
        const response = await fetch('/api/auth/setup-2fa', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // Show QR code
            document.getElementById('qr-code').src = data.qr_code;
            document.getElementById('secret-key').textContent = data.secret_key;
            
            // Show verification form
            document.getElementById('verify-2fa-form').style.display = 'block';
        } else {
            showError(data.message);
        }
    } catch (error) {
        showError('An error occurred while setting up 2FA');
    }
});

// Handle 2FA verification
document.getElementById('verify-2fa-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const code = document.getElementById('verification-code').value;
    
    try {
        const response = await fetch('/api/auth/verify-2fa', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ code })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showSuccess('2FA enabled successfully');
            document.getElementById('setup-2fa-form').style.display = 'none';
            document.getElementById('verify-2fa-form').style.display = 'none';
        } else {
            showError(data.message);
        }
    } catch (error) {
        showError('An error occurred while verifying 2FA');
    }
});

// Show error message
function showError(message) {
    const alertDiv = document.createElement('div');
    alertDiv.className = 'alert alert-danger alert-dismissible fade show';
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.getElementById('alerts-container').appendChild(alertDiv);
    
    // Remove alert after 5 seconds
    setTimeout(() => {
        alertDiv.remove();
    }, 5000);
}

// Show success message
function showSuccess(message) {
    const alertDiv = document.createElement('div');
    alertDiv.className = 'alert alert-success alert-dismissible fade show';
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.getElementById('alerts-container').appendChild(alertDiv);
    
    // Remove alert after 5 seconds
    setTimeout(() => {
        alertDiv.remove();
    }, 5000);
}

// Check authentication status
async function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/login';
        return;
    }
    
    try {
        const response = await fetch('/api/auth/verify', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            localStorage.removeItem('token');
            window.location.href = '/login';
        }
    } catch (error) {
        localStorage.removeItem('token');
        window.location.href = '/login';
    }
}

// Check auth status on protected pages
if (document.getElementById('auth-check')) {
    checkAuth();
} 