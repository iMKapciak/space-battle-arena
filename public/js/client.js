// Initialize gameState object
window.gameState = {
    game: null,
    player: null,
    cursors: null,
    socket: null,
    otherPlayers: {},
    projectiles: null,
    lastFired: 0,
    projectileSpeed: 400
};

function startGame() {
    const playerNameInput = document.getElementById('player-name');
    const playerName = playerNameInput.value.trim();
    
    if (playerName) {
        // Hide login screen
        document.getElementById('login-screen').style.display = 'none';
        // Show game UI
        document.getElementById('game-ui').style.display = 'block';
        // Initialize the game
        if (!gameState.game) {
            gameState.game = new Phaser.Game(config);
        }
    }
}