const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);

// CORS 설정: 모든 도메인에서 접속 허용 (추후 배포 시 도메인 제한 필요)
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// 메모리에 방 정보 저장 (DB를 사용하지 않는 MVP 방식)
const rooms = {};

io.on('connection', (socket) => {
    console.log(`플레이어 접속: ${socket.id}`);

    // 방 만들기 이벤트
    socket.on('createRoom', (nickname) => {
        // 5자리 랜덤 방 코드 생성
        const roomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
        
        rooms[roomCode] = {
            players: [{ id: socket.id, name: nickname, isHost: true, isReady: false }]
        };
        
        socket.join(roomCode);
        socket.emit('roomCreated', roomCode); // 방장에게 코드 전달
        io.to(roomCode).emit('roomUpdated', rooms[roomCode].players); // 방 전체에 상태 동기화
    });

    // 방 참여하기 이벤트
    socket.on('joinRoom', (data) => {
        const { roomCode, nickname } = data;
        const code = roomCode.toUpperCase();

        if (rooms[code]) {
            if (rooms[code].players.length >= 4) {
                socket.emit('errorMsg', '방이 가득 찼습니다.');
                return;
            }
            // 참가자 추가
            rooms[code].players.push({ id: socket.id, name: nickname, isHost: false, isReady: false });
            socket.join(code);
            socket.emit('roomJoined', code);
            io.to(code).emit('roomUpdated', rooms[code].players);
        } else {
            socket.emit('errorMsg', '존재하지 않는 방 코드입니다.');
        }
    });

    // 준비 상태 토글 이벤트
    socket.on('toggleReady', (roomCode) => {
        if(rooms[roomCode]) {
            const player = rooms[roomCode].players.find(p => p.id === socket.id);
            if(player && !player.isHost) {
                player.isReady = !player.isReady;
                io.to(roomCode).emit('roomUpdated', rooms[roomCode].players);
            }
        }
    });

    // 접속 종료(새로고침, 브라우저 닫기) 시 처리
    socket.on('disconnect', () => {
        console.log(`플레이어 연결 끊김: ${socket.id}`);
        for (const roomCode in rooms) {
            const room = rooms[roomCode];
            const index = room.players.findIndex(p => p.id === socket.id);
            
            if (index !== -1) {
                room.players.splice(index, 1); // 방에서 해당 플레이어 삭제
                
                if (room.players.length === 0) {
                    delete rooms[roomCode]; // 아무도 없으면 방 폭파
                } else {
                    if (index === 0) {
                        room.players[0].isHost = true; // 방장이 나갔다면 다음 사람에게 방장 위임
                    }
                    io.to(roomCode).emit('roomUpdated', room.players); // 남은 사람들에게 UI 갱신
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