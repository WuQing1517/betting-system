// 用户管理相关函数

// 加载用户列表
async function loadUsers() {
    try {
        const users = await request('/admin/users');
        renderUserTable(users);
    } catch (error) {
        showAlert('加载用户列表失败', 'error');
    }
}

// 渲染用户表格
function renderUserTable(users) {
    const tbody = document.getElementById('userTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    users.forEach(user => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${user.id}</td>
            <td>${user.nickname || '未设置'}</td>
            <td>${user.cn || '未设置'}</td>
            <td>${user.coins}</td>
            <td>${user.is_admin ? '是' : '否'}</td>
            <td>${formatDate(user.created_at)}</td>
            <td>
                <button class="btn btn-primary" onclick="editUserCoins(${user.id}, ${user.coins})">调整币数</button>
                <button class="btn ${user.is_admin ? 'btn-danger' : 'btn-success'}" onclick="toggleAdmin(${user.id}, ${!user.is_admin})">
                    ${user.is_admin ? '取消管理员' : '设为管理员'}
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// 调整用户币数
function editUserCoins(userId, currentCoins) {
    const amount = prompt('请输入调整金额（正数增加，负数减少）:', '0');
    if (amount === null) return;
    
    const amountNum = parseInt(amount);
    if (isNaN(amountNum) || amountNum === 0) {
        showAlert('请输入有效的金额', 'error');
        return;
    }
    
    const action = amountNum > 0 ? 'add' : 'subtract';
    const absAmount = Math.abs(amountNum);
    
    request(`/admin/users/${userId}/coins`, 'PUT', {
        amount: absAmount,
        action: action
    })
    .then(result => {
        showAlert('币数调整成功');
        loadUsers();
    })
    .catch(error => {
        showAlert('调整失败: ' + error.message, 'error');
    });
}

// 设置/取消管理员
function toggleAdmin(userId, isAdmin) {
    const confirmMessage = isAdmin ? '确定要将该用户设为管理员吗？' : '确定要取消该用户的管理员权限吗？';
    if (!confirm(confirmMessage)) return;
    
    request(`/admin/users/${userId}/admin`, 'PUT', {
        is_admin: isAdmin
    })
    .then(result => {
        showAlert('操作成功');
        loadUsers();
    })
    .catch(error => {
        showAlert('操作失败: ' + error.message, 'error');
    });
}
