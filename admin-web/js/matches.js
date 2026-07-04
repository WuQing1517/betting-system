// 比赛管理相关函数

// 加载比赛列表
async function loadMatches() {
    try {
        const competitions = await request('/competitions');
        renderCompetitionTable(competitions);
        
        // 加载每个比赛下的比赛
        for (const competition of competitions) {
            const matches = await request(`/competitions/${competition.id}/matches`);
            competition.matches = matches;
        }
        renderMatchTable(competitions);
    } catch (error) {
        showAlert('加载比赛列表失败', 'error');
    }
}

// 渲染大比赛表格
function renderCompetitionTable(competitions) {
    const tbody = document.getElementById('competitionTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    competitions.forEach(competition => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${competition.id}</td>
            <td>${competition.name}</td>
            <td>${competition.year}</td>
            <td>${competition.season}</td>
            <td>${competition.status === 'active' ? '进行中' : '已结束'}</td>
            <td>
                <button class="btn btn-primary" onclick="createMatch(${competition.id})">创建比赛</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// 渲染比赛表格
function renderMatchTable(competitions) {
    const tbody = document.getElementById('matchTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    competitions.forEach(competition => {
        if (competition.matches) {
            competition.matches.forEach(match => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${match.id}</td>
                    <td>${match.match_code}</td>
                    <td>${competition.name}</td>
                    <td>Week ${match.week_number}</td>
                    <td>Day ${match.day_number}</td>
                    <td>Match ${match.match_number}</td>
                    <td>${match.status === 'active' ? '进行中' : '已结束'}</td>
                    <td>
                        <button class="btn ${match.status === 'active' ? 'btn-danger' : 'btn-success'}" onclick="toggleMatchStatus(${match.id}, '${match.status === 'active' ? 'completed' : 'active'}')">
                            ${match.status === 'active' ? '结束比赛' : '开启比赛'}
                        </button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }
    });
}

// 创建大比赛
function createCompetition() {
    const name = prompt('请输入比赛名称（如：2026IVL秋季赛）:');
    if (!name) return;
    
    const year = prompt('请输入年份:');
    if (!year) return;
    
    const season = prompt('请输入赛季（春季赛/秋季赛）:');
    if (!season) return;
    
    request('/admin/competitions', 'POST', {
        name: name,
        year: parseInt(year),
        season: season
    })
    .then(result => {
        showAlert('大比赛创建成功');
        loadMatches();
    })
    .catch(error => {
        showAlert('创建失败: ' + error.message, 'error');
    });
}

// 创建比赛
function createMatch(competitionId) {
    const weekNumber = prompt('请输入周数:');
    if (!weekNumber) return;
    
    const dayNumber = prompt('请输入天数:');
    if (!dayNumber) return;
    
    const matchNumber = prompt('请输入比赛数:');
    if (!matchNumber) return;
    
    request('/admin/matches', 'POST', {
        competition_id: competitionId,
        week_number: parseInt(weekNumber),
        day_number: parseInt(dayNumber),
        match_number: parseInt(matchNumber)
    })
    .then(result => {
        showAlert('比赛创建成功: ' + result.match_code);
        loadMatches();
    })
    .catch(error => {
        showAlert('创建失败: ' + error.message, 'error');
    });
}

// 切换比赛状态
function toggleMatchStatus(matchId, newStatus) {
    const confirmMessage = newStatus === 'completed' ? '确定要结束该比赛吗？' : '确定要开启该比赛吗？';
    if (!confirm(confirmMessage)) return;
    
    request(`/admin/matches/${matchId}/status`, 'PUT', {
        status: newStatus
    })
    .then(result => {
        showAlert('状态更新成功');
        loadMatches();
    })
    .catch(error => {
        showAlert('更新失败: ' + error.message, 'error');
    });
}
