// Initialize game state
const gameState = {};

// Game configuration
const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    backgroundColor: '#000033',
    parent: 'game-container',
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 },
            debug: false
        }
    },
    scene: {

        
        preload: preload,
        create: create,
        update: update
    }
};

let game = null;

// Initialize socket connection
gameState.socket = io();

// Socket event handlers for lobby
gameState.socket.on('updateLobby', function(players) {
    updatePlayerList(players);
});

gameState.socket.on('countdownStarted', function(time) {
    console.log('Countdown started:', time);
    gameState.isCountdownActive = true;
});

// Setup countdown handlers
gameState.socket.on('countdownUpdate', time => {
    console.log('Countdown update:', time);
    if (!game || !game.scene.scenes[0]) return;
    
    const scene = game.scene.scenes[0];
    
    if (gameState.countdownText) {
        if (time > 0) {
            gameState.countdownText.setText(time.toString());
        } else {
            gameState.countdownText.setText('GO!');
            scene.tweens.add({
                targets: gameState.countdownText,
                alpha: 0,
                duration: 500,
                onComplete: () => {
                    if (gameState.countdownText) {
                        gameState.countdownText.destroy();
                        gameState.countdownText = null;
                    }
                }
            });
            gameState.isCountdownActive = false;
            console.log('Countdown finished, controls enabled');
        }
    }
});

gameState.socket.on('countdownCancelled', () => {
    console.log('Countdown cancelled');
    if (gameState.countdownText) {
        gameState.countdownText.setText('Waiting...');
    }
    gameState.isCountdownActive = true;
});

gameState.socket.on('playerMoved', function(playerInfo) {
    if (gameState.otherPlayers[playerInfo.id]) {
        gameState.otherPlayers[playerInfo.id].sprite.x = playerInfo.x;
        gameState.otherPlayers[playerInfo.id].sprite.y = playerInfo.y;
        gameState.otherPlayers[playerInfo.id].sprite.rotation = playerInfo.rotation;
        updateHealthBar(gameState.otherPlayers[playerInfo.id].sprite, gameState.otherPlayers[playerInfo.id].healthBar);
    }
});

gameState.socket.on('scoreUpdated', function(scoreInfo) {
    if (scoreInfo.id === gameState.socket.id) {
        gameState.score = scoreInfo.score;
        document.getElementById('score-value').textContent = gameState.score;
    } else if (gameState.otherPlayers[scoreInfo.id]) {
        gameState.otherPlayers[scoreInfo.id].score = scoreInfo.score;
    }
});

gameState.socket.on('playerDamaged', function(playerInfo) {
    if (!game || !game.scene.scenes[0]) return;
    
    const scene = game.scene.scenes[0];
    
    if (playerInfo.id === gameState.socket.id) {
        gameState.player.health = playerInfo.health;
        gameState.player.shield = playerInfo.shield;
        updateHealthBar(gameState.player, gameState.playerHealthBar);
        
        if (gameState.player.health <= 0) {
            createExplosion(scene, gameState.player.x, gameState.player.y);
            gameState.player.setVisible(false);
            gameState.player.body.enable = false;
            gameState.playerHealthBar.clear(); // Clear the health/shield bars
            
            // Show game over message
            const gameOverText = scene.add.text(config.width/2, config.height/2, 'Game Over!', {
                fontSize: '48px',
                fill: '#ff0000',
                stroke: '#ffffff',
                strokeThickness: 2
            }).setOrigin(0.5);
            
            // Fade out after 3 seconds
            scene.tweens.add({
                targets: gameOverText,
                alpha: 0,
                duration: 1000,
                delay: 2000,
                onComplete: () => gameOverText.destroy()
            });
        }
    } else if (gameState.otherPlayers[playerInfo.id]) {
        gameState.otherPlayers[playerInfo.id].sprite.health = playerInfo.health;
        gameState.otherPlayers[playerInfo.id].sprite.shield = playerInfo.shield;
        updateHealthBar(gameState.otherPlayers[playerInfo.id].sprite, gameState.otherPlayers[playerInfo.id].healthBar);
        
        if (gameState.otherPlayers[playerInfo.id].sprite.health <= 0) {
            createExplosion(scene, gameState.otherPlayers[playerInfo.id].sprite.x, gameState.otherPlayers[playerInfo.id].sprite.y);
            gameState.otherPlayers[playerInfo.id].sprite.setVisible(false);
            gameState.otherPlayers[playerInfo.id].sprite.body.enable = false;
            gameState.otherPlayers[playerInfo.id].healthBar.clear(); // Clear the health/shield bars
            
            // Show victory message if you destroyed the enemy
            if (playerInfo.killerId === gameState.socket.id) {
                const victoryText = scene.add.text(config.width/2, config.height/2, 'Victory!', {
                    fontSize: '48px',
                    fill: '#00ff00',
                    stroke: '#ffffff',
                    strokeThickness: 2
                }).setOrigin(0.5);
                
                // Fade out after 3 seconds
                scene.tweens.add({
                    targets: victoryText,
                    alpha: 0,
                    duration: 1000,
                    delay: 2000,
                    onComplete: () => victoryText.destroy()
                });
            }
        }
    }
});

gameState.socket.on('playerLeft', function(playerId) {
    if (gameState.otherPlayers[playerId]) {
        gameState.otherPlayers[playerId].sprite.destroy();
        gameState.otherPlayers[playerId].healthBar.destroy();
        delete gameState.otherPlayers[playerId];
    }
});

gameState.socket.on('projectileFired', function(projectileInfo) {
    if (game && game.scene.scenes[0] && projectileInfo.playerId !== gameState.socket.id) {
        createProjectile(game.scene.scenes[0], projectileInfo);
    }
});

// Chat message handler
gameState.socket.on('chatMessage', function(chatMessage) {
    const chatMessages = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    
    if (chatMessage.type === 'system') {
        messageDiv.style.color = '#888';
        messageDiv.style.fontStyle = 'italic';
        messageDiv.textContent = `${chatMessage.message}`;
    } else {
        messageDiv.innerHTML = `<strong>${chatMessage.sender}:</strong> ${chatMessage.message}`;
    }
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
});

// Add respawn handler after other socket handlers
gameState.socket.on('playerRespawned', function(playerInfo) {
    if (!game || !game.scene.scenes[0]) return;
    
    if (playerInfo.id === gameState.socket.id) {
        // Respawn local player
        gameState.player.x = playerInfo.x;
        gameState.player.y = playerInfo.y;
        gameState.player.setVisible(true);
        gameState.player.body.enable = true;
        gameState.player.health = playerInfo.health;
        updateHealthBar(gameState.player, gameState.playerHealthBar);
        
        // Show respawn message
        const respawnText = game.scene.scenes[0].add.text(config.width/2, config.height/2, 'Respawned!', {
            fontSize: '48px',
            fill: '#00ff00',
            stroke: '#ffffff',
            strokeThickness: 2
        }).setOrigin(0.5);
        
        // Fade out respawn message
        game.scene.scenes[0].tweens.add({
            targets: respawnText,
            alpha: 0,
            duration: 1000,
            onComplete: () => respawnText.destroy()
        });
    } else {
        // Respawn other player
        if (gameState.otherPlayers[playerInfo.id]) {
            const otherPlayer = gameState.otherPlayers[playerInfo.id].sprite;
            otherPlayer.x = playerInfo.x;
            otherPlayer.y = playerInfo.y;
            otherPlayer.health = playerInfo.health;
            otherPlayer.setVisible(true);
            otherPlayer.body.enable = true;
            updateHealthBar(otherPlayer, gameState.otherPlayers[playerInfo.id].healthBar);
        }
    }
});

// Add shield update handler
gameState.socket.on('shieldUpdated', function(shieldInfo) {
    if (shieldInfo.id === gameState.socket.id) {
        gameState.player.shield = shieldInfo.shield;
        updateHealthBar(gameState.player, gameState.playerHealthBar);
    } else if (gameState.otherPlayers[shieldInfo.id]) {
        gameState.otherPlayers[shieldInfo.id].sprite.shield = shieldInfo.shield;
        updateHealthBar(gameState.otherPlayers[shieldInfo.id].sprite, gameState.otherPlayers[shieldInfo.id].healthBar);
    }
});

function preload() {
    console.log('Preloading assets...');
    this.load.image('ship', '/assets/ship.png');
    this.load.image('projectile', '/assets/projectile.png');
    // Create a simple explosion sprite if missing
    const explosionKey = 'explosion';
    if (!this.textures.exists(explosionKey)) {
        const graphics = this.add.graphics();
        graphics.fillStyle(0xffff00, 1);
        graphics.fillCircle(32, 32, 32);
        graphics.generateTexture(explosionKey, 64, 64);
        graphics.destroy();
    }
}

function create() {
    const self = this;
    console.log('Creating game scene...');
    
    // Clean up any existing countdown text first
    if (gameState.countdownText) {
        gameState.countdownText.destroy();
        gameState.countdownText = null;
    }
    
    // Wait for spawn positions if they're not available yet
    if (!gameState.spawnPositions || !gameState.spawnPositions[gameState.socket.id]) {
        console.log('Waiting for spawn positions...');
        this.time.delayedCall(100, () => {
            if (gameState.spawnPositions && gameState.spawnPositions[gameState.socket.id]) {
                console.log('Spawn positions received, setting up game objects');
                this.scene.restart();
            }
        });
        return;
    }
    
    // Create starfield
    gameState.stars = [];
    for (let i = 0; i < 200; i++) {
        gameState.stars.push({
            x: Math.random() * config.width,
            y: Math.random() * config.height,
            speed: 0.5 + Math.random() * 2,
            size: 1 + Math.random() * 2
        });
    }
    
    // Create graphics object for stars
    gameState.starfield = this.add.graphics();
    
    // Initialize game state variables
    gameState.projectileSpeed = 500;
    gameState.lastFired = 0;
    gameState.otherPlayers = {};
    gameState.score = 0;
    
    // Create countdown text only if countdown is active
    if (gameState.isCountdownActive) {
        gameState.countdownText = this.add.text(config.width/2, 100, 'Get Ready!', {
            fontSize: '64px',
            fill: '#ffffff',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5);
        gameState.countdownText.setDepth(1);
    }
    
    // Create player and setup game objects
    console.log('Setting up game objects with spawn positions:', gameState.spawnPositions);
    setupGameObjects(this);
}

function setupGameObjects(scene) {
    console.log('Setting up game objects...');
    
    // Create graphics for projectile trails
    gameState.projectileTrails = scene.add.graphics();
    
    // Setup controls
    gameState.cursors = scene.input.keyboard.createCursorKeys();
    gameState.pointer = scene.input.activePointer;
    
    // Create groups with physics
    gameState.projectiles = scene.physics.add.group({
        collideWorldBounds: false
    });
    gameState.explosions = scene.add.group();

    // Create player with physics at spawn position
    const spawnData = gameState.spawnPositions[gameState.socket.id];
    console.log('Creating player at position:', spawnData);
    gameState.player = scene.physics.add.sprite(spawnData.x, spawnData.y, 'ship');
    gameState.player.setScale(0.2);
    gameState.player.health = 4;
    gameState.player.shield = 4;
    // Set a smaller hitbox for more precise collisions
    gameState.player.body.setSize(gameState.player.width * 0.5, gameState.player.height * 0.5);
    gameState.player.body.setOffset(gameState.player.width * 0.25, gameState.player.height * 0.25);
    
    // Create health bar for player
    gameState.playerHealthBar = scene.add.graphics();
    updateHealthBar(gameState.player, gameState.playerHealthBar);

    // Create other players
    console.log('Creating other players...');
    Object.keys(gameState.spawnPositions).forEach(function(id) {
        if (id !== gameState.socket.id) {
            const playerData = gameState.spawnPositions[id];
            console.log('Creating other player:', id, playerData);
            const otherPlayer = scene.physics.add.sprite(playerData.x, playerData.y, 'ship');
            otherPlayer.setScale(0.2);
            otherPlayer.setTint(0xff0000);
            otherPlayer.health = playerData.health;
            otherPlayer.shield = 4;
            // Set a smaller hitbox for more precise collisions
            otherPlayer.body.setSize(otherPlayer.width * 0.5, otherPlayer.height * 0.5);
            otherPlayer.body.setOffset(otherPlayer.width * 0.25, otherPlayer.height * 0.25);
            
            const healthBar = scene.add.graphics();
            updateHealthBar(otherPlayer, healthBar);
            
            gameState.otherPlayers[id] = {
                sprite: otherPlayer,
                healthBar: healthBar,
                score: playerData.score || 0
            };
        }
    });
    
    // Setup collision detection with custom process callback
    scene.physics.add.overlap(gameState.player, gameState.projectiles, handleProjectileHit, checkProjectileHit, scene);
    Object.values(gameState.otherPlayers).forEach(otherPlayer => {
        scene.physics.add.overlap(otherPlayer.sprite, gameState.projectiles, handleProjectileHit, checkProjectileHit, scene);
        scene.physics.add.overlap(otherPlayer.sprite, gameState.player, handleShipCollision, null, scene);
    });
    
    console.log('Game objects setup complete');
}

function updateHealthBar(ship, healthBar) {
    healthBar.clear();
    const barWidth = 40;
    const barHeight = 5;
    const healthWidth = (ship.health / 4) * barWidth;
    const shieldWidth = (ship.shield / 4) * barWidth;
    const barY = ship.y - 30;
    
    // Health bar (bottom)
    // Background (red)
    healthBar.fillStyle(0xff0000, 1);
    healthBar.fillRect(ship.x - barWidth/2, barY, barWidth, barHeight);
    
    // Health (green)
    healthBar.fillStyle(0x00ff00, 1);
    healthBar.fillRect(ship.x - barWidth/2, barY, healthWidth, barHeight);
    
    // Shield bar (top, 3 pixels above health bar)
    // Shield background (dark blue)
    healthBar.fillStyle(0x000066, 1);
    healthBar.fillRect(ship.x - barWidth/2, barY - 6, barWidth, barHeight);
    
    // Shield (bright blue)
    healthBar.fillStyle(0x0099ff, 1);
    healthBar.fillRect(ship.x - barWidth/2, barY - 6, shieldWidth, barHeight);
}

function createExplosion(scene, x, y) {
    const explosion = scene.add.sprite(x, y, 'explosion');
    explosion.setScale(0.2);
    
    // Create multiple particle explosions
    for (let i = 0; i < 8; i++) {
        const particle = scene.add.sprite(x, y, 'explosion');
        particle.setScale(0.1);
        const angle = (i / 8) * Math.PI * 2;
        const distance = 30;
        
        scene.tweens.add({
            targets: particle,
            x: x + Math.cos(angle) * distance,
            y: y + Math.sin(angle) * distance,
            scale: 0.2,
            alpha: 0,
            duration: 500,
            onComplete: () => particle.destroy()
        });
    }
    
    // Main explosion
    scene.tweens.add({
        targets: explosion,
        scale: 1,
        alpha: 0,
        duration: 800,
        onComplete: () => explosion.destroy()
    });
}

function handleProjectileHit(ship, projectile) {
    const projectileOwnerId = projectile.getData('playerId');
    
    if ((ship === gameState.player && projectileOwnerId === gameState.socket.id) || 
        (gameState.otherPlayers[projectileOwnerId] && gameState.otherPlayers[projectileOwnerId].sprite === ship)) {
        return;
    }
    
    if (ship === gameState.player) {
        if (gameState.player.shield > 0) {
            gameState.player.shield--;
            gameState.socket.emit('playerDamaged', {
                id: gameState.socket.id,
                shield: gameState.player.shield,
                health: gameState.player.health,
                killerId: projectileOwnerId
            });
        } else {
            gameState.player.health--;
            gameState.socket.emit('playerDamaged', {
                id: gameState.socket.id,
                shield: 0,
                health: gameState.player.health,
                killerId: projectileOwnerId
            });
        }
    } else {
        const playerId = Object.keys(gameState.otherPlayers).find(id => gameState.otherPlayers[id].sprite === ship);
        if (playerId) {
            const otherPlayer = gameState.otherPlayers[playerId].sprite;
            if (otherPlayer.shield > 0) {
                otherPlayer.shield--;
                gameState.socket.emit('playerDamaged', {
                    id: playerId,
                    shield: otherPlayer.shield,
                    health: otherPlayer.health,
                    killerId: projectileOwnerId
                });
            } else {
                otherPlayer.health--;
                gameState.socket.emit('playerDamaged', {
                    id: playerId,
                    shield: 0,
                    health: otherPlayer.health,
                    killerId: projectileOwnerId
                });
            }
        }
    }
    projectile.destroy();
}

function handleShipCollision(ship1, ship2) {
    if (ship1 === gameState.player) {
        gameState.player.health--;
        gameState.socket.emit('playerDamaged', {
            id: gameState.socket.id,
            health: gameState.player.health,
            killerId: ship2 === gameState.player ? null : Object.keys(gameState.otherPlayers).find(id => gameState.otherPlayers[id].sprite === ship2)
        });
    } else {
        const playerId = Object.keys(gameState.otherPlayers).find(id => gameState.otherPlayers[id].sprite === ship1);
        if (playerId) {
            gameState.otherPlayers[playerId].sprite.health--;
            gameState.socket.emit('playerDamaged', {
                id: playerId,
                health: gameState.otherPlayers[playerId].sprite.health,
                killerId: ship2 === gameState.player ? gameState.socket.id : Object.keys(gameState.otherPlayers).find(id => gameState.otherPlayers[id].sprite === ship2)
            });
        }
    }
    
    if (ship2 === gameState.player) {
        gameState.player.health--;
        gameState.socket.emit('playerDamaged', {
            id: gameState.socket.id,
            health: gameState.player.health,
            killerId: ship1 === gameState.player ? null : Object.keys(gameState.otherPlayers).find(id => gameState.otherPlayers[id].sprite === ship1)
        });
    } else {
        const playerId = Object.keys(gameState.otherPlayers).find(id => gameState.otherPlayers[id].sprite === ship2);
        if (playerId) {
            gameState.otherPlayers[playerId].sprite.health--;
            gameState.socket.emit('playerDamaged', {
                id: playerId,
                health: gameState.otherPlayers[playerId].sprite.health,
                killerId: ship1 === gameState.player ? gameState.socket.id : Object.keys(gameState.otherPlayers).find(id => gameState.otherPlayers[id].sprite === ship1)
            });
        }
    }
}

function createProjectile(scene, projectileInfo) {
    // Calculate spawn position in front of the ship
    const spawnX = projectileInfo.x;
    const spawnY = projectileInfo.y;
    
    // Create projectile sprite
    const projectile = scene.physics.add.sprite(spawnX, spawnY, 'projectile');
    projectile.setScale(0.1);
    projectile.setRotation(projectileInfo.rotation);
    projectile.setData('playerId', projectileInfo.playerId);
    
    // Set a small hitbox for projectiles
    projectile.body.setSize(projectile.width * 0.5, projectile.height * 0.5);
    projectile.body.setOffset(projectile.width * 0.25, projectile.height * 0.25);
    
    // Set color based on owner
    const color = projectileInfo.playerId === gameState.socket.id ? 0x00ffff : 0xff0000;
    projectile.setTint(color);
    projectile.setData('color', color);
    
    // Add to projectiles group
    gameState.projectiles.add(projectile);
    
    // Set velocity
    projectile.setVelocity(
        projectileInfo.velocityX * gameState.projectileSpeed,
        projectileInfo.velocityY * gameState.projectileSpeed
    );
    
    // Store previous positions for trail effect
    projectile.setData('previousPositions', []);
    
    // Destroy projectile after 1 second
    scene.time.delayedCall(1000, () => {
        if (projectile.active) {
            projectile.destroy();
        }
    });
    
    return projectile;
}

// Add this new function for precise collision detection
function checkProjectileHit(ship, projectile) {
    // Calculate the distance between the centers of the ship and projectile
    const dx = ship.x - projectile.x;
    const dy = ship.y - projectile.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Define a threshold for hit detection (adjust this value as needed)
    const hitThreshold = Math.min(ship.width, ship.height) * ship.scale * 0.3;
    
    return distance <= hitThreshold;
}

function update() {
    if (!gameState.player || !gameState.cursors) return;
    
    // Update starfield
    gameState.starfield.clear();
    gameState.starfield.fillStyle(0xFFFFFF, 1);
    
    for (let star of gameState.stars) {
        gameState.starfield.fillCircle(star.x, star.y, star.size);
        star.y += star.speed;
        if (star.y > config.height) {
            star.y = 0;
            star.x = Math.random() * config.width;
        }
    }
    
    // Update projectile trails
    gameState.projectileTrails.clear();
    gameState.projectiles.getChildren().forEach(projectile => {
        const previousPositions = projectile.getData('previousPositions');
        const color = projectile.getData('color');
        
        previousPositions.push({ x: projectile.x, y: projectile.y });
        if (previousPositions.length > 5) {
            previousPositions.shift();
        }
        
        if (previousPositions.length > 1) {
            gameState.projectileTrails.lineStyle(2, color, 0.5);
            for (let i = 0; i < previousPositions.length - 1; i++) {
                gameState.projectileTrails.lineBetween(
                    previousPositions[i].x,
                    previousPositions[i].y,
                    previousPositions[i + 1].x,
                    previousPositions[i + 1].y
                );
            }
        }
    });
    
    // Debug logging
    console.log('Game state:', {
        isCountdownActive: gameState.isCountdownActive,
        playerActive: gameState.player.active,
        playerVisible: gameState.player.visible,
        playerHealth: gameState.player.health
    });
    
    // Allow player movement and shooting if player is alive and countdown is finished
    if (gameState.player.active && gameState.player.visible && gameState.player.health > 0) {
        // Player movement
        let moving = false;
        if (gameState.cursors.left.isDown) {
            gameState.player.x = Math.max(0, gameState.player.x - 4);
            moving = true;
        }
        if (gameState.cursors.right.isDown) {
            gameState.player.x = Math.min(config.width, gameState.player.x + 4);
            moving = true;
        }
        if (gameState.cursors.up.isDown) {
            gameState.player.y = Math.max(0, gameState.player.y - 4);
            moving = true;
        }
        if (gameState.cursors.down.isDown) {
            gameState.player.y = Math.min(config.height, gameState.player.y + 4);
            moving = true;
        }
        
        // Update player rotation to face mouse pointer
        const angle = Phaser.Math.Angle.Between(
            gameState.player.x, gameState.player.y,
            this.input.mousePointer.x, this.input.mousePointer.y
        );
        gameState.player.rotation = angle;
        
        if (moving) {
            gameState.socket.emit('playerMoved', {
                x: gameState.player.x,
                y: gameState.player.y,
                rotation: gameState.player.rotation
            });
        }
        
        // Fire projectiles with cooldown
        if (this.input.mousePointer.isDown && this.time.now > gameState.lastFired) {
            const velocityX = Math.cos(gameState.player.rotation);
            const velocityY = Math.sin(gameState.player.rotation);
            
            gameState.lastFired = this.time.now + 250;
            
            const projectileInfo = {
                playerId: gameState.socket.id,
                x: gameState.player.x + velocityX * 25,
                y: gameState.player.y + velocityY * 25,
                velocityX: velocityX,
                velocityY: velocityY,
                rotation: gameState.player.rotation
            };
            
            createProjectile(this, projectileInfo);
            gameState.socket.emit('projectileFired', projectileInfo);
        }
    }
    
    // Update health bar position
    if (gameState.player.active && gameState.player.visible) {
        updateHealthBar(gameState.player, gameState.playerHealthBar);
    }
}

// Setup chat input handlers when the page loads
document.addEventListener('DOMContentLoaded', function() {
    const chatInput = document.getElementById('chat-input');
    const chatSend = document.getElementById('chat-send');
    
    function sendMessage() {
        const message = chatInput.value.trim();
        if (message) {
            gameState.socket.emit('chatMessage', message);
            chatInput.value = '';
        }
    }
    
    chatSend.addEventListener('click', sendMessage);
    
    chatInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });
});

// Modified startGame event handler
gameState.socket.on('startGame', function(players) {
    console.log('Game starting with players:', players);
    gameState.spawnPositions = players;
    gameState.isCountdownActive = false; // Set to false initially
    
    // Destroy any existing countdown text before creating the game
    if (gameState.countdownText) {
        gameState.countdownText.destroy();
        gameState.countdownText = null;
    }
    
    // Only initialize the game after receiving spawn positions
    if (!game) {
        startGame(); // Show game container
        game = new Phaser.Game(config);
    } else {
        // If game exists, restart the scene
        game.scene.scenes[0].scene.restart();
    }
});