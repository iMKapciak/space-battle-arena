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

function preload() {
    this.load.image('ship', 'assets/ship.png');
    this.load.image('projectile', 'assets/projectile.png');
    this.load.image('explosion', 'assets/explosion.png');
}

function create() {
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
    
    // Initialize socket
    gameState.socket = io();
    
    // Initialize game state variables
    gameState.projectileSpeed = 400; // Speed of projectiles
    gameState.lastFired = 0; // Time of last projectile fired
    gameState.otherPlayers = {}; // Store other players
    gameState.score = 0; // Player's score
    
    // Create player with physics
    gameState.player = this.physics.add.sprite(400, 300, 'ship');
    gameState.player.setScale(0.2);
    gameState.player.health = 4;
    
    // Create health bar for player
    gameState.playerHealthBar = this.add.graphics();
    updateHealthBar(gameState.player, gameState.playerHealthBar);
    
    // Setup controls
    gameState.cursors = this.input.keyboard.createCursorKeys();
    
    // Enable mouse pointer tracking
    gameState.pointer = this.input.activePointer;
    
    // Create projectiles group
    gameState.projectiles = this.add.group();

    // Create explosions group
    gameState.explosions = this.add.group();

    // Socket event handlers
    const self = this;
    
    // Emit initial player join event
    gameState.socket.emit('playerJoined', {
        id: gameState.socket.id,
        name: document.getElementById('player-name').value,
        x: gameState.player.x,
        y: gameState.player.y,
        rotation: gameState.player.rotation,
        health: gameState.player.health
    });
    
    gameState.socket.on('currentPlayers', function(players) {
        Object.keys(players).forEach(function(id) {
            if (id !== gameState.socket.id) {
                const otherPlayer = self.physics.add.sprite(players[id].x, players[id].y, 'ship');
                otherPlayer.setScale(0.2);
                otherPlayer.setTint(0xff0000); // Red tint for enemy ships
                otherPlayer.health = players[id].health;
                
                // Create health bar for other player
                const healthBar = self.add.graphics();
                updateHealthBar(otherPlayer, healthBar);
                
                gameState.otherPlayers[id] = {
                    sprite: otherPlayer,
                    healthBar: healthBar,
                    score: players[id].score || 0
                };
            }
        });
    });
    
    gameState.socket.on('scoreUpdated', function(scoreInfo) {
        if (scoreInfo.id === gameState.socket.id) {
            gameState.score = scoreInfo.score;
            document.getElementById('score-value').textContent = gameState.score;
        } else if (gameState.otherPlayers[scoreInfo.id]) {
            gameState.otherPlayers[scoreInfo.id].score = scoreInfo.score;
        }
    });
    
    gameState.socket.on('playerMoved', function(playerInfo) {
        if (gameState.otherPlayers[playerInfo.id]) {
            gameState.otherPlayers[playerInfo.id].sprite.x = playerInfo.x;
            gameState.otherPlayers[playerInfo.id].sprite.y = playerInfo.y;
            gameState.otherPlayers[playerInfo.id].sprite.rotation = playerInfo.rotation;
            updateHealthBar(gameState.otherPlayers[playerInfo.id].sprite, gameState.otherPlayers[playerInfo.id].healthBar);
        }
    });
    
    gameState.socket.on('playerDamaged', function(playerInfo) {
        if (playerInfo.id === gameState.socket.id) {
            gameState.player.health = playerInfo.health;
            updateHealthBar(gameState.player, gameState.playerHealthBar);
            if (gameState.player.health <= 0) {
                createExplosion(self, gameState.player.x, gameState.player.y);
                gameState.player.destroy();
                gameState.playerHealthBar.destroy();
            }
        } else if (gameState.otherPlayers[playerInfo.id]) {
            gameState.otherPlayers[playerInfo.id].sprite.health = playerInfo.health;
            updateHealthBar(gameState.otherPlayers[playerInfo.id].sprite, gameState.otherPlayers[playerInfo.id].healthBar);
            if (gameState.otherPlayers[playerInfo.id].sprite.health <= 0) {
                createExplosion(self, gameState.otherPlayers[playerInfo.id].sprite.x, gameState.otherPlayers[playerInfo.id].sprite.y);
                gameState.otherPlayers[playerInfo.id].sprite.destroy();
                gameState.otherPlayers[playerInfo.id].healthBar.destroy();
                delete gameState.otherPlayers[playerInfo.id];
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
        const projectile = self.add.sprite(projectileInfo.x, projectileInfo.y, 'projectile');
        projectile.setScale(0.1);
        projectile.setData('playerId', projectileInfo.playerId);
        
        // Add to projectiles group for collision detection
        gameState.projectiles.add(projectile);
        
        // Set up movement
        self.tweens.add({
            targets: projectile,
            x: projectileInfo.x + projectileInfo.velocityX * 2,
            y: projectileInfo.y + projectileInfo.velocityY * 2,
            duration: 2000,
            onComplete: function() {
                projectile.destroy();
            }
        });
    });
    
    // Setup collision detection
    this.physics.add.overlap(gameState.player, gameState.projectiles, handleProjectileHit, null, this);
    this.physics.add.overlap(gameState.player, Object.values(gameState.otherPlayers).map(p => p.sprite), handleShipCollision, null, this);
    
    // Add collision detection for other players
    Object.values(gameState.otherPlayers).forEach(otherPlayer => {
        this.physics.add.overlap(otherPlayer.sprite, gameState.projectiles, handleProjectileHit, null, this);
        this.physics.add.overlap(otherPlayer.sprite, gameState.player, handleShipCollision, null, this);
    });
}

function updateHealthBar(ship, healthBar) {
    healthBar.clear();
    const barWidth = 40;
    const barHeight = 5;
    const healthWidth = (ship.health / 4) * barWidth;
    
    // Background (red)
    healthBar.fillStyle(0xff0000, 1);
    healthBar.fillRect(ship.x - barWidth/2, ship.y - 30, barWidth, barHeight);
    
    // Health (green)
    healthBar.fillStyle(0x00ff00, 1);
    healthBar.fillRect(ship.x - barWidth/2, ship.y - 30, healthWidth, barHeight);
}

function createExplosion(scene, x, y) {
    const explosion = scene.add.sprite(x, y, 'explosion');
    explosion.setScale(0.5);
    scene.tweens.add({
        targets: explosion,
        scale: 1,
        alpha: 0,
        duration: 500,
        onComplete: () => explosion.destroy()
    });
}

function handleProjectileHit(ship, projectile) {
    // Get the projectile's owner ID from the projectile data
    const projectileOwnerId = projectile.getData('playerId');
    
    // Don't damage if the projectile belongs to the ship
    if (ship === gameState.player && projectileOwnerId === gameState.socket.id) {
        projectile.destroy();
        return;
    }
    
    if (ship === gameState.player) {
        gameState.player.health--;
        gameState.socket.emit('playerDamaged', {
            id: gameState.socket.id,
            health: gameState.player.health,
            killerId: projectileOwnerId
        });
    } else {
        const playerId = Object.keys(gameState.otherPlayers).find(id => gameState.otherPlayers[id].sprite === ship);
        if (playerId) {
            gameState.otherPlayers[playerId].sprite.health--;
            gameState.socket.emit('playerDamaged', {
                id: playerId,
                health: gameState.otherPlayers[playerId].sprite.health,
                killerId: projectileOwnerId
            });
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

function update() {
    if (!gameState.player || !gameState.cursors) return;
    
    // Update starfield
    gameState.starfield.clear();
    gameState.starfield.fillStyle(0xFFFFFF, 1);
    
    for (let star of gameState.stars) {
        // Draw star
        gameState.starfield.fillCircle(star.x, star.y, star.size);
        
        // Move star
        star.y += star.speed;
        
        // Wrap star position
        if (star.y > config.height) {
            star.y = 0;
            star.x = Math.random() * config.width;
        }
    }
    
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
        gameState.pointer.x, gameState.pointer.y
    );
    gameState.player.rotation = angle;
    
    if (moving) {
        gameState.socket.emit('playerMoved', {
            x: gameState.player.x,
            y: gameState.player.y,
            rotation: gameState.player.rotation
        });
    }
    
    // Update health bar position
    updateHealthBar(gameState.player, gameState.playerHealthBar);
    
    // Fire projectiles with cooldown (now using mouse position for direction)
    if (gameState.pointer.isDown && this.time.now > gameState.lastFired) {
        // Calculate velocity based on angle to mouse pointer
        const velocityX = Math.cos(angle);
        const velocityY = Math.sin(angle);
        
        // Create local projectile
        const projectile = this.add.sprite(gameState.player.x, gameState.player.y, 'projectile');
        projectile.setScale(0.1);
        projectile.setData('playerId', gameState.socket.id);
        
        // Add to projectiles group for collision detection
        gameState.projectiles.add(projectile);
        
        // Set up movement
        this.tweens.add({
            targets: projectile,
            x: gameState.player.x + velocityX * gameState.projectileSpeed * 2,
            y: gameState.player.y + velocityY * gameState.projectileSpeed * 2,
            duration: 2000,
            onComplete: function() {
                projectile.destroy();
            }
        });
        
        // Set cooldown
        gameState.lastFired = this.time.now + 250; // 250ms cooldown
        
        // Emit projectile event
        gameState.socket.emit('projectileFired', {
            playerId: gameState.socket.id,
            x: gameState.player.x,
            y: gameState.player.y,
            velocityX: velocityX,
            velocityY: velocityY
        });
    }
}