// 问题管理相关函数

// 加载问题列表
async function loadQuestions() {
    try {
        const competitions = await request('/competitions');
        
        // 加载每个比赛下的比赛和问题
        for (const competition of competitions) {
            const matches = await request(`/competitions/${competition.id}/matches`);
            competition.matches = matches;
            
            for (const match of matches) {
                const matchDetail = await request(`/matches/${match.match_code}`);
                match.questions = matchDetail.questions;
            }
        }
        
        renderQuestionTable(competitions);
    } catch (error) {
        showAlert('加载问题列表失败', 'error');
    }
}

// 渲染问题表格
function renderQuestionTable(competitions) {
    const tbody = document.getElementById('questionTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    competitions.forEach(competition => {
        if (competition.matches) {
            competition.matches.forEach(match => {
                if (match.questions) {
                    match.questions.forEach(question => {
                        const tr = document.createElement('tr');
                        const optionsText = question.options.map(o => `${o.option_text}(${o.base_rate})`).join(', ');
                        tr.innerHTML = `
                            <td>${question.id}</td>
                            <td>${question.question_code}</td>
                            <td>${question.question_text}</td>
                            <td>${optionsText}</td>
                            <td>${question.status === 'active' ? '进行中' : '已结束'}</td>
                            <td>
                                <button class="btn btn-primary" onclick="editQuestion(${question.id}, '${question.question_text}')">编辑</button>
                                <button class="btn btn-success" onclick="setCorrectAnswer(${question.id})">设置答案</button>
                            </td>
                        `;
                        tbody.appendChild(tr);
                    });
                }
            });
        }
    });
}

// 创建问题
function createQuestion() {
    const matchCode = prompt('请输入比赛代码（如：2026IVL秋季赛Week1Day1Match1）:');
    if (!matchCode) return;
    
    const questionText = prompt('请输入问题文本:');
    if (!questionText) return;
    
    const optionsStr = prompt('请输入选项（格式：选项1,倍率1;选项2,倍率2）:', '选项A,2.0;选项B,3.0');
    if (!optionsStr) return;
    
    // 解析选项
    const options = optionsStr.split(';').map(opt => {
        const [text, rate] = opt.split(',');
        return { option_text: text, base_rate: parseFloat(rate) };
    });
    
    // 先获取比赛ID
    request(`/matches/${matchCode}`)
    .then(match => {
        return request('/admin/questions', 'POST', {
            match_id: match.id,
            question_text: questionText,
            options: options
        });
    })
    .then(result => {
        showAlert('问题创建成功: ' + result.question_code);
        loadQuestions();
    })
    .catch(error => {
        showAlert('创建失败: ' + error.message, 'error');
    });
}

// 编辑问题
function editQuestion(questionId, currentText) {
    const newText = prompt('请输入新的问题文本:', currentText);
    if (!newText || newText === currentText) return;
    
    request(`/admin/questions/${questionId}`, 'PUT', {
        question_text: newText
    })
    .then(result => {
        showAlert('问题更新成功');
        loadQuestions();
    })
    .catch(error => {
        showAlert('更新失败: ' + error.message, 'error');
    });
}

// 设置正确答案
function setCorrectAnswer(questionId) {
    // 先获取问题详情
    request(`/questions/${questionId}`)
    .then(question => {
        const optionsText = question.options.map((o, i) => `${i + 1}. ${o.option_text}`).join('\n');
        const choice = prompt(`请选择正确答案（输入序号）:\n${optionsText}`);
        
        if (!choice) return;
        
        const optionIndex = parseInt(choice) - 1;
        if (optionIndex < 0 || optionIndex >= question.options.length) {
            showAlert('无效的选择', 'error');
            return;
        }
        
        const correctOption = question.options[optionIndex];
        
        if (!confirm(`确定要将"${correctOption.option_text}"设为正确答案吗？\n这将结算所有投注！`)) {
            return;
        }
        
        return request(`/admin/questions/${questionId}/answer`, 'PUT', {
            option_id: correctOption.id
        });
    })
    .then(result => {
        if (result) {
            showAlert('正确答案设置成功，投注已结算');
            loadQuestions();
        }
    })
    .catch(error => {
        showAlert('设置失败: ' + error.message, 'error');
    });
}
