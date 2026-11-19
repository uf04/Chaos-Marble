const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const rooms = {};

io.on('connection', (socket) => {
    console.log(`플레이어 접속: ${socket.id}`);

    // 방 만들기
    socket.on('createRoom', (nickname) => {
        const roomCode = Math.random().toString(36).substring(2, 7).toUpperCase();

        rooms[roomCode] = {
            isStarted: false,
            players: [{ id: socket.id, name: nickname, isHost: true, isReady: false }]
        };

        socket.join(roomCode);
        socket.emit('roomCreated', roomCode);
        io.to(roomCode).emit('roomUpdated', rooms[roomCode].players);
    });

    // 방 참여하기
    socket.on('joinRoom', (data) => {
        const { roomCode, nickname } = data;
        const code = roomCode.toUpperCase();

        if (!rooms[code]) {
            socket.emit('errorMsg', '존재하지 않는 방 코드입니다.');
            return;
        }
        if (rooms[code].isStarted) {
            socket.emit('errorMsg', '이미 게임이 시작된 방입니다.');
            return;
        }
        if (rooms[code].players.length >= 4) {
            socket.emit('errorMsg', '방이 가득 찼습니다.');
            return;
        }

        rooms[code].players.push({ id: socket.id, name: nickname, isHost: false, isReady: false });
        socket.join(code);
        socket.emit('roomJoined', code);
        io.to(code).emit('roomUpdated', rooms[code].players);
    });

    // 준비 상태 토글
    socket.on('toggleReady', (roomCode) => {
        const room = rooms[roomCode];
        if (!room) return;

        const player = room.players.find(p => p.id === socket.id);
        if (player && !player.isHost) {
            player.isReady = !player.isReady;
            io.to(roomCode).emit('roomUpdated', room.players);
        }
    });

    // 방장 게임 시작 -> 방 전체 인원에게 game.html 이동 신호 전송
    socket.on('startGame', (roomCode) => {
        const room = rooms[roomCode];
        if (!room) return;

        const host = room.players.find(p => p.id === socket.id && p.isHost);
        if (!host) return;

        room.isStarted = true;
        io.to(roomCode).emit('gameStarted', {
            roomCode,
            players: room.players
        });
    });

    // game.html 진입 후 재접속 동기화
    socket.on('joinGameSession', ({ roomCode, nickname }) => {
        const room = rooms[roomCode];
        if (!room) {
            socket.emit('errorMsg', '방 정보를 찾을 수 없습니다.');
            return;
        }
        socket.join(roomCode);
        const existing = room.players.find(p => p.name === nickname);
        if (existing) {
            existing.id = socket.id;
        }
        io.to(roomCode).emit('gameSessionSynced', {
            roomCode,
            players: room.players
        });
    });

    // 접속 종료 처리
    socket.on('disconnect', () => {
        console.log(`플레이어 연결 끊김: ${socket.id}`);
        for (const roomCode in rooms) {
            const room = rooms[roomCode];
            // 페이지 전환(index.html -> game.html) 중에는 방을 즉시 삭제하지 않음
            if (room.isStarted) continue;

            const index = room.players.findIndex(p => p.id === socket.id);
            if (index !== -1) {
                room.players.splice(index, 1);

                if (room.players.length === 0) {
                    delete rooms[roomCode];
                } else {
                    if (index === 0) {
                        room.players[0].isHost = true;
                    }
                    io.to(roomCode).emit('roomUpdated', room.players);
                }
                break;
            }
        }
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`카오스 마블 멀티플레이 서버가 포트 ${PORT}에서 실행 중입니다.`);
});