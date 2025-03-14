const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server);
const path = require('path');

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, '../public')));

// Serve index.html for the root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Game state
const players = {};
let gameStarted = false;
let countdownInterval = null;
let gameStartTimeout = null;

// Game configuration
const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;
const MAX_SHIELD = 4;
const SHIELD_REGEN_RATE = 0.5; // Shield points per second
const SHIELD_REGEN_DELAY = 3000; // Time in ms before shield starts regenerating

function getSpawnPosition(playerCount, totalPlayers) {
    // Calculate spawn positions in a circle
    const radius = Math.min(GAME_WIDTH, GAME_HEIGHT) * 0.4;
    const angle = (playerCount / totalPlayers) * Math.PI * 2;
    return {
        x: GAME_WIDTH / 2 + Math.cos(angle) * radius,
        y: GAME_HEIGHT / 2 + Math.sin(angle) * radius
    };
}

function respawnPlayer(playerId) {
    const numPlayers = Object.keys(players).length;
    const playerIndex = Object.keys(players).indexOf(playerId);
    const spawnPos = getSpawnPosition(playerIndex, numPlayers);
    
    // Reset player health and shield
    players[playerId].health = 4;
    players[playerId].shield = MAX_SHIELD;
    players[playerId].x = spawnPos.x;
    players[playerId].y = spawnPos.y;
    
    // Emit respawn event to all clients
    io.emit('playerRespawned', {
        id: playerId,
        x: spawnPos.x,
        y: spawnPos.y,
        health: 4,
        shield: MAX_SHIELD
    });
}

function startCountdown() {
    // Clear any existing timers
    if (countdownInterval) clearInterval(countdownInterval);
    if (gameStartTimeout) clearTimeout(gameStartTimeout);
    
    let countdown = 3;
    gameStarted = false;
    
    // Emit initial countdown state
    io.emit('countdownStarted', countdown);
    console.log('Starting countdown from:', countdown);
    
    // Start countdown
    countdownInterval = setInterval(() => {
        countdown--;
        console.log('Countdown:', countdown);
        io.emit('countdownUpdate', countdown);
        
        if (countdown === -1) {
            clearInterval(countdownInterval);
            countdownInterval = null;
            
            // Start the game after showing "GO!"
            gameStartTimeout = setTimeout(() => {
                startGame();
            }, 1000); // Give more time for "GO!" animation
        }
    }, 1000);
}

function cancelCountdown() {
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
    if (gameStartTimeout) {
        clearTimeout(gameStartTimeout);
        gameStartTimeout = null;
    }
    gameStarted = false;
    io.emit('countdownCancelled');
}

function startGame() {
    if (gameStarted) return;
    console.log('Starting game...');
    gameStarted = true;
    
    // Calculate spawn positions for all players
    const numPlayers = Object.keys(players).length;
    const radius = Math.min(GAME_WIDTH, GAME_HEIGHT) * 0.3; // Use 30% of the smaller game dimension
    const spawnPositions = {};
    
    Object.keys(players).forEach((id, index) => {
        // Calculate angle for even distribution around the circle
        const angle = (index / numPlayers) * Math.PI * 2;
        // Calculate position and add some randomness to avoid exact overlap
        const randomOffset = 20; // Small random offset
        spawnPositions[id] = {
            x: GAME_WIDTH/2 + (radius * Math.cos(angle)) + (Math.random() * randomOffset - randomOffset/2),
            y: GAME_HEIGHT/2 + (radius * Math.sin(angle)) + (Math.random() * randomOffset - randomOffset/2),
            health: 4,
            score: 0,
            rotation: angle + Math.PI // Face outward from center
        };
        console.log(`Player ${id} spawn position:`, spawnPositions[id]);
    });
    
    console.log('Sending spawn positions to clients:', spawnPositions);
    io.emit('startGame', spawnPositions);
}

function resetGame() {
    cancelCountdown();
    gameStarted = false;
    Object.keys(players).forEach(id => {
        players[id].ready = false;
    });
    io.emit('updateLobby', players);
}

// Add shield regeneration interval
setInterval(() => {
    if (!gameStarted) return;
    
    const currentTime = Date.now();
    Object.keys(players).forEach(playerId => {
        const player = players[playerId];
        if (player.shield < MAX_SHIELD && 
            currentTime - player.lastDamageTime > SHIELD_REGEN_DELAY) {
            player.shield = Math.min(MAX_SHIELD, player.shield + SHIELD_REGEN_RATE);
            io.emit('shieldUpdated', {
                id: playerId,
                shield: player.shield
            });
        }
    });
}, 1000);

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('A player connected');

    socket.on('playerJoined', (playerInfo) => {
        console.log('Player joined:', playerInfo.name);
        players[socket.id] = {
            id: socket.id,
            name: playerInfo.name,
            x: playerInfo.x,
            y: playerInfo.y,
            rotation: playerInfo.rotation,
            health: playerInfo.health,
            shield: MAX_SHIELD,
            lastDamageTime: 0,
            score: 0,
            ready: false
        };
        
        socket.emit('currentPlayers', players);
        socket.broadcast.emit('newPlayer', players[socket.id]);
        io.emit('updateLobby', players);
    });

    socket.on('toggleReady', () => {
        if (!players[socket.id]) return;
        
        players[socket.id].ready = !players[socket.id].ready;
        io.emit('updateLobby', players);
        
        // Check if all players are ready
        const allReady = Object.values(players).every(player => player.ready);
        const playerCount = Object.keys(players).length;
        
        if (allReady && playerCount >= 2) {
            console.log('All players ready, starting countdown');
            startCountdown();
        } else if (!allReady && countdownInterval) {
            console.log('Not all players ready, cancelling countdown');
            cancelCountdown();
        }
    });

    socket.on('playerMoved', (movementData) => {
        if (players[socket.id] && gameStarted) {
            players[socket.id].x = movementData.x;
            players[socket.id].y = movementData.y;
            players[socket.id].rotation = movementData.rotation;
            socket.broadcast.emit('playerMoved', {
                id: socket.id,
                x: movementData.x,
                y: movementData.y,
                rotation: movementData.rotation
            });
        }
    });

    socket.on('projectileFired', (projectileData) => {
        if (players[socket.id] && gameStarted) {
            io.emit('projectileFired', projectileData);
        }
    });

    socket.on('playerDamaged', (damageData) => {
        if (players[socket.id] && gameStarted) {
            const player = players[damageData.id];
            if (player) {
                player.lastDamageTime = Date.now();
                
                // If player has shield, damage shield first
                if (player.shield > 0) {
                    player.shield--;
                    io.emit('shieldUpdated', {
                        id: damageData.id,
                        shield: player.shield
                    });
                } else {
                    // Only damage health if shield is depleted
                    player.health = damageData.health;
                    
                    // If player died and there was a killer, update score
                    if (player.health <= 0 && damageData.killerId && players[damageData.killerId]) {
                        players[damageData.killerId].score += 1;
                        io.emit('scoreUpdated', {
                            id: damageData.killerId,
                            score: players[damageData.killerId].score
                        });
                        
                        // Schedule respawn after 3 seconds
                        setTimeout(() => {
                            respawnPlayer(damageData.id);
                        }, 3000);
                    }
                    
                    io.emit('playerDamaged', damageData);
                }
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        delete players[socket.id];
        io.emit('updateLobby', players);
        
        // If a player disconnects during countdown, cancel it
        if (countdownInterval) {
            cancelCountdown();
        }
        
        // If game is in progress and a player disconnects, reset the game
        if (gameStarted) {
            resetGame();
        }
    });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});