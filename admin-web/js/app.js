// 全局配置
const API_BASE_URL = 'http://localhost:5000/api';

// 检查登录状态
function checkLogin() {
    const userId = localStorage.getItem('adminUserId');
    if (!userId) {
        window.location.href = 'login.html';
        return false;
    }
    return true;
}

// 通用请求函数
async function request(url, method = 'GET', data = null) {
    const userId = localStorage.getItem('adminUserId');
    const headers = {
        'Content-Type': 'application/json',
        'X-User-Id': userId
    };

    const options = {
        method: method,
        headers: headers
    };

    if (data) {
        options.body = JSON.stringify(data);
    }

    try {
        const response = await fetch(`${API_BASE_URL}${url}`, options);
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Request failed');
        }
        
        return result;
    } catch (error) {
        console.error('Request error:', error);
        throw error;
    }
}

// 显示提示信息
function showAlert(message, type = 'success') {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.textContent = message;
    alertDiv.style.position = 'fixed';
    alertDiv.style.top = '20px';
    alertDiv.style.right = '20px';
    alertDiv.style.padding = '15px 25px';
    alertDiv.style.borderRadius = '5px';
    alertDiv.style.color = '#fff';
    alertDiv.style.zIndex = '10000';
    alertDiv.style.backgroundColor = type === 'success' ? '#2ecc71' : '#e74c3c';
    
    document.body.appendChild(alertDiv);
    
    setTimeout(() => {
        alertDiv.remove();
    }, 3000);
}

// 格式化日期
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN');
}
