const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  maxHttpBufferSize: 1e9, // 1GB
  cors: {
    origin: "*"
  }
});

const PORT = 8080;

// 静态文件服务
app.use(express.static('public'));

// 存储在线用户
const users = new Map();

// 获取本机IP地址
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

io.on('connection', (socket) => {
  console.log('用户连接:', socket.id);

  // 用户加入
  socket.on('join', (username) => {
    users.set(socket.id, {
      id: socket.id,
      username: username || `用户${socket.id.slice(0, 4)}`
    });

    // 广播用户列表更新
    io.emit('users-update', Array.from(users.values()));
    console.log(`${users.get(socket.id).username} 加入房间`);
  });

  // 文件传输请求
  socket.on('file-offer', (data) => {
    console.log(`文件传输请求: ${data.fileName} -> ${data.to}`);
    io.to(data.to).emit('file-offer', {
      from: socket.id,
      fromName: users.get(socket.id)?.username,
      fileName: data.fileName,
      fileSize: data.fileSize,
      fileType: data.fileType
    });
  });

  // 接受文件传输
  socket.on('file-accept', (data) => {
    console.log(`文件传输被接受: ${data.from}`);
    io.to(data.from).emit('file-accept', {
      to: socket.id
    });
  });

  // 拒绝文件传输
  socket.on('file-reject', (data) => {
    console.log(`文件传输被拒绝: ${data.from}`);
    io.to(data.from).emit('file-reject', {
      to: socket.id
    });
  });

  // 文件数据块传输
  socket.on('file-chunk', (data) => {
    io.to(data.to).emit('file-chunk', {
      chunk: data.chunk,
      progress: data.progress
    });
  });

  // 文件传输完成
  socket.on('file-complete', (data) => {
    console.log('文件传输完成');
    io.to(data.to).emit('file-complete');
  });

  // 用户断开连接
  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (user) {
      console.log(`${user.username} 离开房间`);
      users.delete(socket.id);
      io.emit('users-update', Array.from(users.values()));
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const localIP = getLocalIP();
  console.log('\n=================================');
  console.log('  局域网P2P文件传输服务已启动');
  console.log('=================================');
  console.log(`\n本机访问: http://localhost:${PORT}`);
  console.log(`局域网访问: http://${localIP}:${PORT}`);
  console.log('\n其他设备通过局域网IP访问此服务');
  console.log('文件直接在设备间传输，不保存在服务器');
  console.log('=================================\n');
});
