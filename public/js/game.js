// Game configuration
const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    backgroundColor: '#000000',
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

function preload() {
    this.load.image('ship', 'assets/ship.png');
    this.load.image('projectile', 'assets/projectile.png');
}

function create() {
    // Initialize socket
    gameState.socket = io();
    
    // Create player with physics
    gameState.player = this.physics.add.sprite(400, 300, 'ship');
    gameState.player.setScale(0.5);
    
    // Setup controls
    gameState.cursors = this.input.keyboard.createCursorKeys();
    
    // Create projectiles group with physics
    gameState.projectiles = this.physics.add.group({
        defaultKey: 'projectile',
        maxSize: 30
    });

    // Socket event handlers
    const self = this;
    
    gameState.socket.on('playerMoved', function(playerInfo) {
        if (gameState.otherPlayers[playerInfo.id]) {
            gameState.otherPlayers[playerInfo.id].x = playerInfo.x;
            gameState.otherPlayers[playerInfo.id].y = playerInfo.y;
            gameState.otherPlayers[playerInfo.id].rotation = playerInfo.rotation;
        }
    });
    
    gameState.socket.on('playerJoined', function(playerInfo) {
        if (playerInfo.id !== gameState.socket.id) {
            gameState.otherPlayers[playerInfo.id] = self.physics.add.sprite(playerInfo.x, playerInfo.y, 'ship');
            gameState.otherPlayers[playerInfo.id].setScale(0.5);
        }
    });
    
    gameState.socket.on('playerLeft', function(playerId) {
        if (gameState.otherPlayers[playerId]) {
            gameState.otherPlayers[playerId].destroy();
            delete gameState.otherPlayers[playerId];
        }
    });
    
    gameState.socket.on('projectileFired', function(projectileInfo) {
        if (projectileInfo.playerId !== gameState.socket.id) {
            const projectile = gameState.projectiles.create(projectileInfo.x, projectileInfo.y);
            if (projectile) {
                projectile.setScale(0.3);
                projectile.setVelocity(projectileInfo.velocityX, projectileInfo.velocityY);
                
                // Destroy projectile after 2 seconds
                self.time.delayedCall(2000, function() {
                    projectile.destroy();
                });
            }
        }
    });
}

function update() {
    if (!gameState.player || !gameState.cursors) return;
    
    // Player movement
    let moving = false;
    if (gameState.cursors.left.isDown) {
        gameState.player.x -= 4;
        moving = true;
    }
    if (gameState.cursors.right.isDown) {
        gameState.player.x += 4;
        moving = true;
    }
    if (gameState.cursors.up.isDown) {
        gameState.player.y -= 4;
        moving = true;
    }
    if (gameState.cursors.down.isDown) {
        gameState.player.y += 4;
        moving = true;
    }
    
    // Update player rotation to face movement direction
    if (moving) {
        gameState.player.rotation = Math.atan2(
            gameState.cursors.down.isDown - gameState.cursors.up.isDown,
            gameState.cursors.right.isDown - gameState.cursors.left.isDown
        );
        
        gameState.socket.emit('playerMoved', {
            x: gameState.player.x,
            y: gameState.player.y,
            rotation: gameState.player.rotation
        });
    }
    
    // Fire projectiles with cooldown
    if (gameState.cursors.space.isDown && this.time.now > gameState.lastFired) {
        const projectile = gameState.projectiles.create(gameState.player.x, gameState.player.y);
        
        if (projectile) {
            projectile.setScale(0.3);
            
            // Calculate velocity based on player's rotation
            const angle = gameState.player.rotation;
            const velocityX = Math.cos(angle) * gameState.projectileSpeed;
            const velocityY = Math.sin(angle) * gameState.projectileSpeed;
            
            projectile.setVelocity(velocityX, velocityY);
            
            // Set cooldown
            gameState.lastFired = this.time.now + 250; // 250ms cooldown
            
            // Emit projectile event
            gameState.socket.emit('projectileFired', {
                x: gameState.player.x,
                y: gameState.player.y,
                velocityX: velocityX,
                velocityY: velocityY
            });
            
            // Destroy projectile after 2 seconds
            this.time.delayedCall(2000, function() {
                projectile.destroy();
            });
        }
    }
    
    // Clean up projectiles that are out of bounds
    gameState.projectiles.children.each(function(projectile) {
        if (projectile.x < 0 || projectile.x > config.width ||
            projectile.y < 0 || projectile.y > config.height) {
            projectile.destroy();
        }
    });
}