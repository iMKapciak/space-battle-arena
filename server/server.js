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
            health: playerInfo.health || 4,
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

    socket.on('playerDamaged', (playerInfo) => {
        if (players[socket.id]) {
            players[socket.id].health = playerInfo.health;
            if (playerInfo.health <= 0) {
                // Find the player who fired the last shot
                const killerId = playerInfo.killerId;
                if (killerId && players[killerId]) {
                    players[killerId].score += 1;
                    io.emit('scoreUpdated', {
                        id: killerId,
                        score: players[killerId].score
                    });
                }
            }
            io.emit('playerDamaged', {
                id: socket.id,
                health: playerInfo.health
            });
        }
    });

    socket.on('projectileFired', (projectileInfo) => {
        const projectile = {
            id: Date.now(),
            x: projectileInfo.x,
            y: projectileInfo.y,
            playerId: socket.id,
            velocityX: projectileInfo.velocityX,
            velocityY: projectileInfo.velocityY
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