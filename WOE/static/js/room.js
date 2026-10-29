// =========================================
// WOE - World of Entertainment
// room.js - نسخه اولترا حرفه‌ای و کامل
// منطق اتاق، بازی‌ها و همه تعاملات
// =========================================

// ========== اتصال Socket ==========
const socket = io({
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000
});

// ========== متغیرهای سراسری ==========
const ROOM_CODE = window.ROOM_CODE || null;
const DISPLAY_NAME = window.DISPLAY_NAME || '';
const USERNAME = window.USERNAME || '';

let currentPlayers = [];
let currentHost = null;
let currentGame = null;
let mySid = null;
let xoBoard = ['', '', '', '', '', '', '', '', ''];
let xoSymbols = {};
let rpsScores = {};
let slPositions = {};
let tdCurrentPlayer = null;

// ========== عناصر DOM ==========
const errorBox = document.getElementById('error-box');
const createBtn = document.getElementById('create-btn');
const joinBtn = document.getElementById('join-btn');
const roomCodeInput = document.getElementById('room-code');
const leaveBtn = document.getElementById('leave-btn');
const playersList = document.getElementById('players-list');
const gamesGrid = document.getElementById('games-grid');
const gameArea = document.getElementById('game-area');

// =========================================
// توابع کمکی
// =========================================

function showError(msg, duration = 4000) {
    if (!errorBox) return;
    errorBox.textContent = msg;
    errorBox.style.display = 'block';
    errorBox.style.animation = 'none';
    setTimeout(() => {
        errorBox.style.animation = 'shake 0.5s ease';
    }, 10);
    setTimeout(() => {
        errorBox.style.display = 'none';
    }, duration);
}

function showToast(msg, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function getPlayerBySid(sid) {
    return currentPlayers.find(p => p.sid === sid);
}

function getPlayerName(sid) {
    const p = getPlayerBySid(sid);
    return p ? p.display_name : 'نامشخص';
}

function playSound(type) {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        const frequencies = {
            click: 600,
            win: 880,
            lose: 220,
            join: 440,
            error: 150,
            dice: 300
        };
        oscillator.frequency.value = frequencies[type] || 440;
        oscillator.type = 'sine';
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.3);
    } catch (e) {}
}

// =========================================
// اتصال Socket - رویدادها
// =========================================

socket.on('connect', () => {
    mySid = socket.id;
    console.log('✅ متصل شد:', mySid);
    if (ROOM_CODE && DISPLAY_NAME) {
        socket.emit('join', {
            code: ROOM_CODE,
            username: USERNAME,
            display_name: DISPLAY_NAME
        });
    }
});

socket.on('disconnect', () => {
    showError('اتصال قطع شد! دوباره وصل می‌شیم... 🔄');
});

socket.on('reconnect', () => {
    showToast('دوباره وصل شدی! ✅');
    if (ROOM_CODE && DISPLAY_NAME) {
        socket.emit('join', {
            code: ROOM_CODE,
            username: USERNAME,
            display_name: DISPLAY_NAME
        });
    }
});

// =========================================
// لابی - ساخت اتاق
// =========================================

if (createBtn) {
    createBtn.addEventListener('click', () => {
        createBtn.disabled = true;
        createBtn.textContent = 'در حال ساخت... ⏳';
        playSound('click');
        socket.emit('create_room', {});
        setTimeout(() => {
            if (createBtn) {
                createBtn.disabled = false;
                createBtn.textContent = '🏠 ساخت اتاق';
            }
        }, 5000);
    });
}

socket.on('room_created', (data) => {
    playSound('win');
    showToast(`اتاق ساخته شد: ${data.code} 🎉`);
    setTimeout(() => {
        window.location.href = `/room/${data.code}`;
    }, 500);
});

// =========================================
// لابی - ورود به اتاق
// =========================================

if (joinBtn) {
    joinBtn.addEventListener('click', () => {
        const code = roomCodeInput.value.trim();
        if (code.length !== 6) {
            showError('کد اتاق باید ۶ رقمی باشه! 😅');
            playSound('error');
            return;
        }
        playSound('click');
        window.location.href = `/room/${code}`;
    });
}

if (roomCodeInput) {
    roomCodeInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') joinBtn.click();
    });
    roomCodeInput.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/[^0-9]/g, '');
    });
}

// =========================================
// ورود به اتاق
// =========================================

if (ROOM_CODE && DISPLAY_NAME && socket.connected) {
    socket.emit('join', {
        code: ROOM_CODE,
        username: USERNAME,
        display_name: DISPLAY_NAME
    });
}

if (leaveBtn) {
    leaveBtn.addEventListener('click', () => {
        if (confirm('از اتاق خارج می‌شی؟ 😕')) {
            socket.emit('leave', { code: ROOM_CODE });
            window.location.href = '/lobby';
        }
    });
}

// =========================================
// مدیریت بازیکنان
// =========================================

socket.on('player_joined', (data) => {
    currentPlayers = data.players;
    currentHost = data.host;
    playSound('join');
    renderPlayers();
    showToast(`${data.players[data.players.length - 1].display_name} وارد شد! 👋`);
});

socket.on('player_left', (data) => {
    currentPlayers = data.players;
    currentHost = data.host;
    renderPlayers();
});

function renderPlayers() {
    if (!playersList) return;
    if (currentPlayers.length === 0) {
        playersList.innerHTML = '<p class="no-players">هنوز کسی نیست! 😅</p>';
        return;
    }
    playersList.innerHTML = currentPlayers.map(p => {
        const isHost = p.sid === currentHost;
        const isMe = p.sid === mySid;
        return `<div class="player ${isHost ? 'host' : ''} ${isMe ? 'me' : ''}">
            👤 ${p.display_name}${isMe ? ' (تو)' : ''}
        </div>`;
    }).join('');
}

// =========================================
// شروع بازی
// =========================================

function startGame(game) {
    if (!ROOM_CODE) return;
    playSound('click');
    socket.emit('start_game', { code: ROOM_CODE, game });
}

window.startGame = startGame;

socket.on('game_started', (data) => {
    currentGame = data.game;
    playSound('win');
    if (gamesGrid) gamesGrid.style.display = 'none';
    if (gameArea) {
        gameArea.style.display = 'block';
        gameArea.innerHTML = '';
        gameArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    switch (data.game) {
        case 'xo': initXO(data); break;
        case 'rock-paper': initRPS(data); break;
        case 'uno': initUNO(data); break;
        case 'snake-ladder': initSnakeLadder(data); break;
        case 'truth-dare': initTruthDare(data); break;
    }
});

// =========================================
// 🎮 بازی XO
// =========================================

function initXO(data) {
    xoBoard = data.state.board;
    xoSymbols = data.state.symbols;
    if (!gameArea) return;
    gameArea.innerHTML = `
        <div class="game-container">
            <div class="game-header">
                <h2>❌⭕ XO</h2>
                <button class="btn btn-small" onclick="backToGames()">🔙 بازگشت</button>
            </div>
            <div class="xo-board" id="xo-board"></div>
            <div class="game-status" id="xo-status"></div>
            <button class="btn btn-primary" onclick="restartXO()">🔄 بازی جدید</button>
        </div>
    `;
    renderXOBoard();
    updateXOStatus(data.state);
}

function renderXOBoard() {
    const board = document.getElementById('xo-board');
    if (!board) return;
    board.innerHTML = '';
    for (let i = 0; i < 9; i++) {
        const cell = document.createElement('div');
        cell.className = 'xo-cell';
        cell.textContent = xoBoard[i];
        if (xoBoard[i]) cell.classList.add('filled', xoBoard[i].toLowerCase());
        cell.addEventListener('click', () => {
            if (xoBoard[i] === '' && !document.querySelector('.xo-cell.winner')) {
                playSound('click');
                socket.emit('xo_move', { code: ROOM_CODE, index: i });
            }
        });
        board.appendChild(cell);
    }
}

function updateXOStatus(state) {
    const status = document.getElementById('xo-status');
    if (!status) return;
    if (state.winner === 'draw') {
        status.innerHTML = '🤝 مساوی شد!';
        playSound('lose');
    } else if (state.winner) {
        status.innerHTML = `🎉 برنده: <strong>${getPlayerName(state.winner)}</strong>`;
        playSound('win');
        highlightXOWin(state.board);
    } else {
        const isMyTurn = state.turn === mySid;
        status.innerHTML = isMyTurn 
            ? `⏳ نوبت توئه! (${xoSymbols[mySid] || ''})` 
            : `نوبت: ${getPlayerName(state.turn)}`;
        status.className = isMyTurn ? 'game-status my-turn' : 'game-status';
    }
}

function highlightXOWin(board) {
    const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    for (let w of wins) {
        if (board[w[0]] && board[w[0]] === board[w[1]] && board[w[1]] === board[w[2]]) {
            const cells = document.querySelectorAll('.xo-cell');
            w.forEach(i => cells[i] && cells[i].classList.add('winner'));
        }
    }
}

socket.on('xo_update', (data) => {
    xoBoard = data.board;
    renderXOBoard();
    updateXOStatus(data);
});

function restartXO() {
    playSound('click');
    socket.emit('xo_restart', { code: ROOM_CODE });
}

window.restartXO = restartXO;

// =========================================
// ✊✋✌️ سنگ کاغذ قیچی
// =========================================

function initRPS(data) {
    rpsScores = data.state.scores || {};
    if (!gameArea) return;
    gameArea.innerHTML = `
        <div class="game-container">
            <div class="game-header">
                <h2>✊✋✌️ سنگ کاغذ قیچی</h2>
                <button class="btn btn-small" onclick="backToGames()">🔙 بازگشت</button>
            </div>
            <p class="game-hint">انتخاب کن:</p>
            <div class="rps-choices">
                <button class="rps-btn" onclick="chooseRPS('rock')">
                    <span class="rps-emoji">✊</span>
                    <span>سنگ</span>
                </button>
                <button class="rps-btn" onclick="chooseRPS('paper')">
                    <span class="rps-emoji">✋</span>
                    <span>کاغذ</span>
                </button>
                <button class="rps-btn" onclick="chooseRPS('scissors')">
                    <span class="rps-emoji">✌️</span>
                    <span>قیچی</span>
                </button>
            </div>
            <div class="game-status" id="rps-status">منتظر انتخاب...</div>
            <div id="rps-result" class="rps-result-box"></div>
            <div id="rps-scores" class="rps-scores-box"></div>
        </div>
    `;
    renderRPSScores(data.scores);
}

function chooseRPS(choice) {
    playSound('click');
    socket.emit('rps_choose', { code: ROOM_CODE, choice });
    const status = document.getElementById('rps-status');
    if (status) status.innerHTML = 'انتخاب شد! منتظر بقیه... ⏳';
}

window.chooseRPS = chooseRPS;

socket.on('rps_result', (data) => {
    const result = document.getElementById('rps-result');
    if (result) {
        const emojiMap = { rock: '✊', paper: '✋', scissors: '✌️' };
        let html = '<h3>نتیجه دور:</h3><div class="rps-result-grid">';
        for (const [sid, info] of Object.entries(data.choices)) {
            const isWinner = data.winners.includes(sid);
            html += `<div class="rps-result-item ${isWinner ? 'winner' : ''}">
                <span class="rps-name">${info.name}</span>
                <span class="rps-emoji-big">${emojiMap[info.choice]}</span>
                ${isWinner ? '🎉' : ''}
            </div>`;
        }
        html += '</div>';
        if (data.winners.length > 0) {
            html += `<p class="rps-winner-text">🎉 برنده: ${data.winners.map(sid => getPlayerName(sid)).join(', ')}</p>`;
        } else {
            html += '<p class="rps-winner-text">🤝 مساوی!</p>';
        }
        result.innerHTML = html;
        playSound('win');
    }
    renderRPSScores(data.scores);
    const status = document.getElementById('rps-status');
    if (status) status.innerHTML = 'دور بعد رو انتخاب کن! 🎯';
});

function renderRPSScores(scores) {
    const box = document.getElementById('rps-scores');
    if (!box || !scores) return;
    let html = '<h3>🏆 امتیازها:</h3><div class="scores-grid">';
    const sorted = Object.entries(scores).sort((a, b) => b[1].score - a[1].score);
    for (const [sid, info] of sorted) {
        html += `<div class="score-item">
            <span>${info.name}</span>
            <span class="score-num">${info.score}</span>
        </div>`;
    }
    html += '</div>';
    box.innerHTML = html;
}

// =========================================
// 🎲 مار و پله
// =========================================

function initSnakeLadder(data) {
    slPositions = data.positions;
    if (!gameArea) return;
    gameArea.innerHTML = `
        <div class="game-container">
            <div class="game-header">
                <h2>🎲 مار و پله</h2>
                <button class="btn btn-small" onclick="backToGames()">🔙 بازگشت</button>
            </div>
            <div class="sl-board" id="sl-board"></div>
            <div class="game-status" id="sl-status"></div>
            <button class="btn btn-primary" id="sl-roll-btn">🎲 تاس بریز</button>
        </div>
    `;
    renderSLBoard(data.positions);
    updateSLStatus(data);
    const rollBtn = document.getElementById('sl-roll-btn');
    if (rollBtn) {
        rollBtn.addEventListener('click', () => {
            playSound('dice');
            socket.emit('sl_roll', { code: ROOM_CODE });
            rollBtn.disabled = true;
            setTimeout(() => { rollBtn.disabled = false; }, 1500);
        });
    }
}

function renderSLBoard(positions) {
    const board = document.getElementById('sl-board');
    if (!board) return;
    const snakes = new Set([17, 54, 62, 64, 87, 93, 95, 99]);
    const ladders = new Set([4, 9, 20, 28, 40, 51, 63, 71]);
    let html = '<div class="sl-cells">';
    for (let i = 100; i >= 1; i--) {
        const playersHere = Object.entries(positions).filter(([sid, info]) => info.pos === i);
        let cls = 'sl-cell';
        if (snakes.has(i)) cls += ' snake';
        if (ladders.has(i)) cls += ' ladder';
        html += `<div class="${cls}">
            <span class="sl-num">${i}</span>
            ${playersHere.map(p => `<span class="sl-player" title="${p[1].name}">${p[1].name[0]}</span>`).join('')}
        </div>`;
    }
    html += '</div>';
    board.innerHTML = html;
}

function updateSLStatus(data) {
    const status = document.getElementById('sl-status');
    if (!status) return;
    if (data.winner) {
        status.innerHTML = `🎉 برنده: <strong>${getPlayerName(data.winner)}</strong>`;
        playSound('win');
    } else if (data.turn) {
        const isMyTurn = data.turn === mySid;
        status.innerHTML = isMyTurn 
            ? '⏳ نوبت توئه! تاس بریز 🎲' 
            : `نوبت: ${getPlayerName(data.turn)}`;
        status.className = isMyTurn ? 'game-status my-turn' : 'game-status';
        if (data.dice) {
            status.innerHTML += ` <span class="dice-display">🎲 ${data.dice}</span>`;
        }
    }
}

socket.on('sl_update', (data) => {
    renderSLBoard(data.positions);
    updateSLStatus(data);
});

// =========================================
// 🎯 جرئت یا حقیقت
// =========================================

function initTruthDare(data) {
    tdCurrentPlayer = data.state.current_player;
    if (!gameArea) return;
    gameArea.innerHTML = `
        <div class="game-container">
            <div class="game-header">
                <h2>🎯 جرئت یا حقیقت</h2>
                <button class="btn btn-small" onclick="backToGames()">🔙 بازگشت</button>
            </div>
            <div class="game-status" id="td-status"></div>
            <div class="td-buttons">
                <button class="btn btn-primary" onclick="chooseTD('truth')">💬 حقیقت</button>
                <button class="btn btn-danger" onclick="chooseTD('dare')">😈 جرئت</button>
            </div>
            <div id="td-result"></div>
        </div>
    `;
    updateTDStatus();
}

function updateTDStatus() {
    const status = document.getElementById('td-status');
    if (!status) return;
    const isMyTurn = tdCurrentPlayer === mySid;
    status.innerHTML = isMyTurn 
        ? '⏳ نوبت توئه! حقیقت یا جرئت؟' 
        : `نوبت: ${getPlayerName(tdCurrentPlayer)}`;
    status.className = isMyTurn ? 'game-status my-turn' : 'game-status';
}

function chooseTD(choice) {
    playSound('click');
    socket.emit('td_choose', { code: ROOM_CODE, choice });
}

window.chooseTD = chooseTD;

socket.on('td_result', (data) => {
    const result = document.getElementById('td-result');
    if (!result) return;
    const choiceText = data.choice === 'truth' ? '💬 حقیقت' : '😈 جرئت';
    const choiceClass = data.choice === 'truth' ? 'truth' : 'dare';
    result.innerHTML = `
        <div class="td-card ${choiceClass}">
            <h3>${choiceText}</h3>
            <p class="td-text">${data.text}</p>
            <p class="next-player">نوبت بعدی: <strong>${data.next_player}</strong></p>
        </div>
    `;
    playSound('win');
    tdCurrentPlayer = null;
    setTimeout(() => {
        updateTDStatus();
    }, 100);
});
// =========================================
// 🃏 اونو (UNO) - کامل
// =========================================

let unoState = null;
let selectedCardIndex = null;

function initUNO(data) {
    if (!gameArea) return;
    gameArea.innerHTML = `
        <div class="game-container uno-container">
            <div class="game-header">
                <h2>🃏 اونو</h2>
                <button class="btn btn-small" onclick="backToGames()">🔙 بازگشت</button>
            </div>
            <div class="uno-opponents" id="uno-opponents"></div>
            <div class="uno-center">
                <div class="uno-deck" id="uno-deck" onclick="unoDraw()">
                    <span>🂠</span>
                    <small id="uno-deck-count">0</small>
                </div>
                <div class="uno-discard" id="uno-discard"></div>
                <div class="uno-color-indicator" id="uno-color"></div>
            </div>
            <div class="uno-status" id="uno-status"></div>
            <div class="uno-hand" id="uno-hand"></div>
            <div class="uno-actions">
                <button class="btn btn-secondary" onclick="unoPass()">رد کردن ⏭️</button>
                <button class="btn btn-test" onclick="unoCall()">UNO! 🎉</button>
            </div>
            <div id="uno-color-picker" class="uno-color-picker" style="display:none;">
                <p>رنگ رو انتخاب کن:</p>
                <button class="color-btn red" onclick="pickColor('red')"></button>
                <button class="color-btn blue" onclick="pickColor('blue')"></button>
                <button class="color-btn green" onclick="pickColor('green')"></button>
                <button class="color-btn yellow" onclick="pickColor('yellow')"></button>
            </div>
        </div>
    `;
}

socket.on('uno_update', (data) => {
    unoState = data;
    renderUNO();
});

function renderUNO() {
    if (!unoState) return;

    // بازیکنان حریف
    const opponents = document.getElementById('uno-opponents');
    if (opponents) {
        opponents.innerHTML = unoState.players
            .filter(p => p.sid !== mySid)
            .map(p => `
                <div class="uno-opponent ${p.sid === unoState.turn ? 'active' : ''}">
                    <span class="opp-name">${p.name}</span>
                    <span class="opp-cards">🂠 ${p.card_count}</span>
                    ${p.uno_called ? '<span class="uno-badge">UNO!</span>' : ''}
                </div>
            `).join('');
    }

    // دسته کارت
    const deckCount = document.getElementById('uno-deck-count');
    if (deckCount) deckCount.textContent = unoState.deck_count;

    // کارت روی زمین
    const discard = document.getElementById('uno-discard');
    if (discard && unoState.discard_top) {
        discard.innerHTML = renderCard(unoState.discard_top, false);
    }

    // نشانگر رنگ
    const colorInd = document.getElementById('uno-color');
    if (colorInd) {
        colorInd.className = `uno-color-indicator color-${unoState.current_color}`;
        colorInd.textContent = colorName(unoState.current_color);
    }

    // وضعیت
    const status = document.getElementById('uno-status');
    if (status) {
        if (unoState.winner) {
            const winner = unoState.players.find(p => p.sid === unoState.winner);
            status.innerHTML = `🎉 برنده: <strong>${winner ? winner.name : '?'}</strong>`;
            status.className = 'uno-status winner';
        } else if (unoState.turn === mySid) {
            status.innerHTML = '⏳ نوبت توئه! یه کارت انتخاب کن';
            status.className = 'uno-status my-turn';
        } else {
            const turnPlayer = unoState.players.find(p => p.sid === unoState.turn);
            status.innerHTML = `نوبت: ${turnPlayer ? turnPlayer.name : '...'}`;
            status.className = 'uno-status';
        }
    }

    // دست خودم
    const hand = document.getElementById('uno-hand');
    if (hand) {
        hand.innerHTML = unoState.my_hand.map((card, i) => 
            `<div class="uno-card-wrapper ${i === selectedCardIndex ? 'selected' : ''}" onclick="selectCard(${i})">
                ${renderCard(card, true)}
            </div>`
        ).join('');
    }
}

function renderCard(card, clickable) {
    const valueMap = {
        'skip': '🚫', 'reverse': '🔄', 'draw2': '+2',
        'wild': '🎨', 'wild4': '+4'
    };
    const displayValue = valueMap[card.value] || card.value;
    const colorClass = card.color === 'wild' ? 'wild' : `color-${card.color}`;
    return `<div class="uno-card ${colorClass}">
        <span class="card-value">${displayValue}</span>
    </div>`;
}

function colorName(color) {
    return { red: 'قرمز', blue: 'آبی', green: 'سبز', yellow: 'زرد' }[color] || '';
}

function selectCard(index) {
    if (!unoState || unoState.turn !== mySid) return;
    selectedCardIndex = index;
    const card = unoState.my_hand[index];
    
    if (card.color === 'wild') {
        // نمایش انتخاب رنگ
        const picker = document.getElementById('uno-color-picker');
        if (picker) picker.style.display = 'block';
        window.pendingWildIndex = index;
    } else {
        playCard(index, null);
    }
}

function pickColor(color) {
    const picker = document.getElementById('uno-color-picker');
    if (picker) picker.style.display = 'none';
    if (window.pendingWildIndex !== undefined) {
        playCard(window.pendingWildIndex, color);
        window.pendingWildIndex = undefined;
    }
}

function playCard(index, color) {
    socket.emit('uno_play', { code: ROOM_CODE, card_index: index, color });
    selectedCardIndex = null;
    playSound('click');
}

function unoDraw() {
    if (!unoState || unoState.turn !== mySid) return;
    socket.emit('uno_draw', { code: ROOM_CODE });
    playSound('click');
}

function unoPass() {
    if (!unoState || unoState.turn !== mySid) return;
    socket.emit('uno_pass', { code: ROOM_CODE });
}

function unoCall() {
    socket.emit('uno_call', { code: ROOM_CODE });
    playSound('win');
}

window.selectCard = selectCard;
window.pickColor = pickColor;
window.unoDraw = unoDraw;
window.unoPass = unoPass;
window.unoCall = unoCall;
// =========================================
// بازگشت به لیست بازی‌ها
// =========================================

function backToGames() {
    playSound('click');
    if (gameArea) {
        gameArea.style.display = 'none';
        gameArea.innerHTML = '';
    }
    if (gamesGrid) gamesGrid.style.display = 'block';
    currentGame = null;
}

window.backToGames = backToGames;

// =========================================
// رویدادهای خطا
// =========================================

socket.on('error_msg', (data) => {
    showError(data.msg);
    playSound('error');
    if (createBtn) {
        createBtn.disabled = false;
        createBtn.textContent = '🏠 ساخت اتاق';
    }
});

// =========================================
// کلیدهای میانبر
// =========================================

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && currentGame) {
        backToGames();
    }
});

// =========================================
// لاگ نهایی
// =========================================

console.log('🎮 WOE room.js loaded successfully!');
console.log('📍 Room:', ROOM_CODE || 'لابی');
console.log('👤 User:', DISPLAY_NAME || 'مهمان');