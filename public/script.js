let socket;
let currentFile = null;
let myId = null;
let myUsername = '';
let transferInProgress = false;
let currentTransfer = null;

// DOM 元素
const usernameInput = document.getElementById('usernameInput');
const joinBtn = document.getElementById('joinBtn');
const currentUserDiv = document.getElementById('currentUser');
const currentUsernameSpan = document.getElementById('currentUsername');
const mainContent = document.getElementById('mainContent');
const usersList = document.getElementById('usersList');
const userCount = document.getElementById('userCount');
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const fileSelected = document.getElementById('fileSelected');
const selectedFileName = document.getElementById('selectedFileName');
const selectedFileSize = document.getElementById('selectedFileSize');
const clearFileBtn = document.getElementById('clearFileBtn');
const transferStatus = document.getElementById('transferStatus');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const statusTitle = document.getElementById('statusTitle');
const statusInfo = document.getElementById('statusInfo');
const receiveModal = document.getElementById('receiveModal');
const senderName = document.getElementById('senderName');
const receiveFileName = document.getElementById('receiveFileName');
const receiveFileSize = document.getElementById('receiveFileSize');
const acceptBtn = document.getElementById('acceptBtn');
const rejectBtn = document.getElementById('rejectBtn');

// 加入房间
joinBtn.addEventListener('click', () => {
    const username = usernameInput.value.trim() || `用户${Date.now().toString().slice(-4)}`;
    myUsername = username;

    socket = io();

    socket.on('connect', () => {
        myId = socket.id;
        socket.emit('join', username);

        document.querySelector('.user-info').style.display = 'none';
        currentUserDiv.style.display = 'flex';
        currentUsernameSpan.textContent = username;
        mainContent.style.display = 'grid';
    });

    // 用户列表更新
    socket.on('users-update', (users) => {
        updateUsersList(users);
    });

    // 收到文件传输请求
    socket.on('file-offer', (data) => {
        showReceiveModal(data);
    });

    // 文件传输被接受
    socket.on('file-accept', (data) => {
        startSending(data.to);
    });

    // 文件传输被拒绝
    socket.on('file-reject', () => {
        alert('对方拒绝了文件传输');
        resetTransfer();
    });

    // 接收文件数据块
    socket.on('file-chunk', (data) => {
        receiveChunk(data);
    });

    // 文件传输完成
    socket.on('file-complete', () => {
        completeReceiving();
    });
});

// 更新用户列表
function updateUsersList(users) {
    const otherUsers = users.filter(u => u.id !== myId);
    userCount.textContent = otherUsers.length;

    if (otherUsers.length === 0) {
        usersList.innerHTML = '<div class="empty-state">暂无其他用户</div>';
        return;
    }

    usersList.innerHTML = otherUsers.map(user => `
        <div class="user-item ${!currentFile || transferInProgress ? 'disabled' : ''}" data-id="${user.id}">
            <div class="user-avatar">${user.username.charAt(0).toUpperCase()}</div>
            <div class="user-name">${user.username}</div>
        </div>
    `).join('');

    // 添加点击事件
    document.querySelectorAll('.user-item:not(.disabled)').forEach(item => {
        item.addEventListener('click', () => {
            const userId = item.dataset.id;
            sendFileOffer(userId, item.querySelector('.user-name').textContent);
        });
    });
}

// 文件选择
uploadArea.addEventListener('click', () => {
    if (!transferInProgress) {
        fileInput.click();
    }
});

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        currentFile = file;
        selectedFileName.textContent = file.name;
        selectedFileSize.textContent = formatFileSize(file.size);
        uploadArea.style.display = 'none';
        fileSelected.style.display = 'flex';

        // 更新用户列表，使其可点击
        socket.emit('join', myUsername);
    }
});

clearFileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    clearFile();
});

function clearFile() {
    currentFile = null;
    fileInput.value = '';
    uploadArea.style.display = 'block';
    fileSelected.style.display = 'none';

    // 更新用户列表，使其不可点击
    socket.emit('join', myUsername);
}

// 发送文件传输请求
function sendFileOffer(userId, username) {
    if (!currentFile || transferInProgress) return;

    socket.emit('file-offer', {
        to: userId,
        fileName: currentFile.name,
        fileSize: currentFile.size,
        fileType: currentFile.type
    });

    showTransferStatus(`等待 ${username} 接受...`, 0);
    currentTransfer = { to: userId, type: 'send' };
}

// 显示接收文件模态框
function showReceiveModal(data) {
    senderName.textContent = data.fromName;
    receiveFileName.textContent = data.fileName;
    receiveFileSize.textContent = formatFileSize(data.fileSize);
    receiveModal.style.display = 'flex';

    currentTransfer = {
        from: data.from,
        fileName: data.fileName,
        fileSize: data.fileSize,
        chunks: [],
        type: 'receive'
    };
}

// 接受文件传输
acceptBtn.addEventListener('click', () => {
    socket.emit('file-accept', { from: currentTransfer.from });
    receiveModal.style.display = 'none';
    showTransferStatus('接收文件中...', 0);
});

// 拒绝文件传输
rejectBtn.addEventListener('click', () => {
    socket.emit('file-reject', { from: currentTransfer.from });
    receiveModal.style.display = 'none';
    currentTransfer = null;
});

// 开始发送文件
function startSending(to) {
    if (!currentFile) return;

    transferInProgress = true;
    const chunkSize = 64 * 1024; // 64KB per chunk
    let offset = 0;
    const totalSize = currentFile.size;

    const reader = new FileReader();

    reader.onload = (e) => {
        const chunk = e.target.result;
        const progress = Math.round((offset / totalSize) * 100);

        socket.emit('file-chunk', {
            to: to,
            chunk: chunk,
            progress: progress
        });

        updateProgress(progress);
        offset += chunk.byteLength;

        if (offset < totalSize) {
            readNextChunk();
        } else {
            socket.emit('file-complete', { to: to });
            completeTransfer('文件发送成功!');
        }
    };

    function readNextChunk() {
        const slice = currentFile.slice(offset, offset + chunkSize);
        reader.readAsArrayBuffer(slice);
    }

    showTransferStatus('发送文件中...', 0);
    readNextChunk();
}

// 接收文件数据块
function receiveChunk(data) {
    if (!currentTransfer || currentTransfer.type !== 'receive') return;

    currentTransfer.chunks.push(data.chunk);
    updateProgress(data.progress);
}

// 完成接收
function completeReceiving() {
    if (!currentTransfer || currentTransfer.type !== 'receive') return;

    const blob = new Blob(currentTransfer.chunks);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = currentTransfer.fileName;
    a.click();
    URL.revokeObjectURL(url);

    completeTransfer('文件接收成功!');
}

// 显示传输状态
function showTransferStatus(title, progress) {
    transferInProgress = true;
    transferStatus.style.display = 'block';
    statusTitle.textContent = title;
    updateProgress(progress);
}

// 更新进度
function updateProgress(progress) {
    progressFill.style.width = `${progress}%`;
    progressText.textContent = `${progress}%`;
}

// 完成传输
function completeTransfer(message) {
    statusTitle.textContent = message;
    statusInfo.textContent = '3秒后自动关闭';

    setTimeout(() => {
        resetTransfer();
    }, 3000);
}

// 重置传输状态
function resetTransfer() {
    transferInProgress = false;
    transferStatus.style.display = 'none';
    currentTransfer = null;
    clearFile();

    // 刷新用户列表
    if (socket) {
        socket.emit('join', myUsername);
    }
}

// 格式化文件大小
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// 取消传输（可选功能）
document.getElementById('cancelBtn')?.addEventListener('click', () => {
    if (confirm('确定要取消传输吗？')) {
        resetTransfer();
    }
});
