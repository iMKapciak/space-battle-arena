const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, '../public')));

// Serve index.html for the root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Game state
const players = {};
const projectiles = [];

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('A player connected');

    socket.on('playerJoined', (playerInfo) => {
        players[socket.id] = {
            id: socket.id,
            name: playerInfo.name,
            x: playerInfo.x,
            y: playerInfo.y,
            health: 100,
            score: 0
        };
        
        // Send current players to the new player
        socket.emit('currentPlayers', players);
        
        // Broadcast new player to others
        socket.broadcast.emit('playerJoined', players[socket.id]);
    });

    socket.on('playerMoved', (playerInfo) => {
        if (players[socket.id]) {
            players[socket.id].x = playerInfo.x;
            players[socket.id].y = playerInfo.y;
            socket.broadcast.emit('playerMoved', players[socket.id]);
        }
    });

    socket.on('projectileFired', (projectileInfo) => {
        const projectile = {
            id: Date.now(),
            x: projectileInfo.x,
            y: projectileInfo.y,
            playerId: socket.id
        };
        projectiles.push(projectile);
        io.emit('projectileFired', projectile);
    });

    socket.on('disconnect', () => {
        console.log('A player disconnected');
        if (players[socket.id]) {
            delete players[socket.id];
            io.emit('playerLeft', socket.id);
        }
    });
});

// Start server
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});