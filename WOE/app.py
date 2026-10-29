# =========================================
# WOE - World of Entertainment
# بک‌اند کامل Flask + Socket.IO
# نسخه نهایی - بدون خطا و هشدار
# =========================================

import eventlet
eventlet.monkey_patch()

import os
import re
import time
import random
import string
import sqlite3

from flask import (
    Flask,
    render_template,
    request,
    redirect,
    url_for,
    session,
    jsonify,
    flash,
)
from flask_socketio import SocketIO, join_room, leave_room, emit
from werkzeug.security import generate_password_hash, check_password_hash

# =========================================
# تنظیمات اولیه
# =========================================
app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get(
    'SECRET_KEY',
    'woe-secret-key-2026-super-secure-change-me'
)

socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode='eventlet'
)

DB_PATH = os.path.join(os.path.dirname(__file__), 'woe.db')

# =========================================
# دیتابیس
# =========================================
def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            display_name TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            created_at REAL NOT NULL
        )
    ''')
    c.execute('''
        CREATE TABLE IF NOT EXISTS game_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            game TEXT NOT NULL,
            result TEXT,
            played_at REAL NOT NULL
        )
    ''')
    conn.commit()
    conn.close()


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


init_db()

# =========================================
# ذخیره‌سازی اتاق‌ها
# =========================================
rooms = {}


def generate_room_code():
    return ''.join(random.choices(string.digits, k=6))


def get_room_players(code):
    if code in rooms:
        return list(rooms[code]['players'].values())
    return []


def cleanup_old_rooms():
    now = time.time()
    for code in list(rooms.keys()):
        if now - rooms[code].get('created_at', now) > 7200:
            del rooms[code]


def is_valid_username(username):
    return bool(re.match(r'^[a-zA-Z0-9_]{3,20}$', username))

# =========================================
# تنظیمات تست‌ها (قبل از routeها)
# =========================================
test_configs = {
    'space': {
        'name': 'فضول سنج',
        'ranks': [
            (14, 'اصلاً فضول نیست! 😇'),
            (28, 'خیلی کم فضوله! 😌'),
            (42, 'کم فضوله! 🙂'),
            (57, 'متوسط فضوله! 🤔'),
            (72, 'زیاد فضوله! 😏'),
            (87, 'خیلی فضوله! 😱'),
            (100, 'فوق‌العاده فضوله! 🤯'),
        ]
    },
    'dare': {
        'name': 'تست جرئت',
        'ranks': [
            (14, 'خیلی ترسو! 😨'),
            (28, 'کم جرئت! 😟'),
            (42, 'متوسط! 😐'),
            (57, 'جرئت متوسط! 🙂'),
            (72, 'جرئو! 😎'),
            (87, 'خیلی جرئو! 🔥'),
            (100, 'شیر دل! 🦁'),
        ]
    },
    'truth': {
        'name': 'تست راستگویی',
        'ranks': [
            (14, 'کاملاً دروغگو! 🤥'),
            (28, 'خیلی کم راستگو! 😬'),
            (42, 'متوسط! 😐'),
            (57, 'نسبتاً راستگو! 🙂'),
            (72, 'راستگو! 😇'),
            (87, 'خیلی راستگو! ✨'),
            (100, 'فرشته راستگویی! 👼'),
        ]
    },
    'lie': {
        'name': 'تست دروغ یا راست',
        'ranks': [
            (14, 'همه رو راست می‌گی! 😇'),
            (28, 'خیلی کم دروغ می‌گی! 😌'),
            (42, 'متوسط! 😐'),
            (57, 'گاهی دروغ می‌گی! 😏'),
            (72, 'دروغگو! 🤥'),
            (87, 'خیلی دروغگو! 😱'),
            (100, 'استاد دروغ! 🎭'),
        ]
    },
    'luck': {
        'name': 'اسکنر شانس',
        'ranks': [
            (14, 'خیلی بدشانس! 😭'),
            (28, 'بدشانس! 😟'),
            (42, 'متوسط! 😐'),
            (57, 'خوش‌شانس! 🙂'),
            (72, 'خیلی خوش‌شانس! 🍀'),
            (87, 'شانس بالا! ✨'),
            (100, 'شانس‌آور! 🌟'),
        ]
    },
    'acting': {
        'name': 'اسکنر ادایی بودن',
        'ranks': [
            (14, 'اصلاً ادایی نیستی! 😇'),
            (28, 'خیلی کم! 😌'),
            (42, 'متوسط! 😐'),
            (57, 'گاهی ادایی می‌شی! 😏'),
            (72, 'ادایی! 🎭'),
            (87, 'خیلی ادایی! 💅'),
            (100, 'ملکه ادای! 👑'),
        ]
    },
    'coward': {
        'name': 'اسکنر ترسو بودن',
        'ranks': [
            (14, 'شیر دل! 🦁'),
            (28, 'خیلی شجاع! 💪'),
            (42, 'متوسط! 😐'),
            (57, 'کمی ترسو! 😟'),
            (72, 'ترسو! 😨'),
            (87, 'خیلی ترسو! 😱'),
            (100, 'پادشاه ترسوها! 👑😨'),
        ]
    },
    'iq': {
        'name': 'اسکنر هوش',
        'ranks': [
            (14, 'نیاز به تلاش بیشتر! 📚'),
            (28, 'متوسط پایین! 🤔'),
            (42, 'متوسط! 😐'),
            (57, 'باهوش! 🙂'),
            (72, 'خیلی باهوش! 🧠'),
            (87, 'نابغه! 🌟'),
            (100, 'انیشتین! 🧠✨'),
        ]
    },
}

jokes = [
    'به یه نفر گفتن چرا اینقدر خوش‌حالی؟ گفت: چون یادم رفت چی بودم! 😂',
    'یه بار یه برنامه‌نویس رفت رستوران، گفت: یه آبگوشت با سس! 🍲',
    'چرا کامپیوترا عینک می‌زنن؟ چون خیلی RAM دارن! 🤓',
    'به یه ریاضیدان گفتن چرا غمگینی؟ گفت: چون X من Y نمی‌شه! 😢',
    'یه بار یه وای‌فای رفت دکتر، دکتر گفت: سیگنالت ضعیفه! 📶',
    'چرا ماهی‌ها مدرسه نمی‌رن؟ چون توی آب شنا می‌کنن! 🐟',
]

# =========================================
# Routes - احراز هویت
# =========================================

@app.route('/')
def index():
    if 'username' in session:
        return redirect(url_for('lobby'))
    return render_template('index.html')


@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        display_name = request.form.get('display_name', '').strip()
        password = request.form.get('password', '')
        password2 = request.form.get('password2', '')

        if not is_valid_username(username):
            return render_template(
                'register.html',
                error='نام کاربری باید ۳ تا ۲۰ کاراکتر انگلیسی/عدد/آندرلاین باشد!'
            )
        if len(display_name) < 2:
            return render_template(
                'register.html',
                error='نام نمایشی حداقل ۲ حرف باشد!'
            )
        if len(password) < 6:
            return render_template(
                'register.html',
                error='رمز عبور حداقل ۶ کاراکتر باشد!'
            )
        if password != password2:
            return render_template(
                'register.html',
                error='رمز عبور و تکرارش یکسان نیستند!'
            )

        conn = get_db()
        c = conn.cursor()
        c.execute('SELECT id FROM users WHERE username = ?', (username,))
        if c.fetchone():
            conn.close()
            return render_template(
                'register.html',
                error='این نام کاربری قبلاً ثبت شده!'
            )

        password_hash = generate_password_hash(password)
        c.execute(
            'INSERT INTO users (username, display_name, password_hash, created_at) '
            'VALUES (?, ?, ?, ?)',
            (username, display_name, password_hash, time.time())
        )
        conn.commit()
        conn.close()

        flash('ثبت‌نام موفق! حالا وارد شو. 🎉', 'success')
        return redirect(url_for('login'))

    return render_template('register.html')


@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '')

        conn = get_db()
        c = conn.cursor()
        c.execute('SELECT * FROM users WHERE username = ?', (username,))
        user = c.fetchone()
        conn.close()

        if user and check_password_hash(user['password_hash'], password):
            session['username'] = user['username']
            session['display_name'] = user['display_name']
            return redirect(url_for('lobby'))

        return render_template(
            'login.html',
            error='نام کاربری یا رمز عبور اشتباه است!'
        )

    return render_template('login.html')


@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('index'))


@app.route('/lobby')
def lobby():
    if 'username' not in session:
        return redirect(url_for('login'))
    return render_template('lobby.html', display_name=session['display_name'])


@app.route('/room/<code>')
def room(code):
    if 'username' not in session:
        return redirect(url_for('login'))
    if code not in rooms:
        return render_template('error.html', message='اتاق پیدا نشد! 😕'), 404
    return render_template(
        'room.html',
        code=code,
        display_name=session['display_name'],
        username=session['username']
    )


@app.route('/tests')
def tests():
    if 'username' not in session:
        return redirect(url_for('login'))
    return render_template('tests.html')


@app.route('/test/<test_key>')
def test_page(test_key):
    if 'username' not in session:
        return redirect(url_for('login'))
    if test_key not in test_configs:
        return render_template('error.html', message='تست پیدا نشد! 😕'), 404
    return render_template(
        'test.html',
        test_name=test_configs[test_key]['name'],
        test_key=test_key
    )

# =========================================
# API تست‌ها و جوک
# =========================================

@app.route('/api/test/<test_name>')
def api_test(test_name):
    if test_name not in test_configs:
        return jsonify({'error': 'تست پیدا نشد'}), 404

    percent = random.randint(1, 100)
    config = test_configs[test_name]
    rank = config['ranks'][-1][1]
    for max_val, rank_name in config['ranks']:
        if percent <= max_val:
            rank = rank_name
            break

    return jsonify({
        'test': config['name'],
        'percent': percent,
        'rank': rank
    })


@app.route('/api/joke')
def api_joke():
    return jsonify({'joke': random.choice(jokes)})

# =========================================
# Socket.IO - اتاق‌ها
# =========================================

@socketio.on('create_room')
def handle_create_room(data=None):
    cleanup_old_rooms()
    code = generate_room_code()
    while code in rooms:
        code = generate_room_code()

    rooms[code] = {
        'players': {},
        'host': request.sid,
        'game': None,
        'state': {},
        'created_at': time.time()
    }
    emit('room_created', {'code': code})


@socketio.on('join')
def handle_join(data):
    code = data.get('code')
    username = data.get('username', '')
    display_name = data.get('display_name', '')

    if code not in rooms:
        emit('error_msg', {'msg': 'اتاق پیدا نشد! 😕'})
        return

    if len(rooms[code]['players']) >= 10:
        emit('error_msg', {'msg': 'اتاق پره! (حداکثر ۱۰ نفر) 🚫'})
        return

    for p in rooms[code]['players'].values():
        if p['username'] == username:
            emit('error_msg', {'msg': 'این نام کاربری قبلاً وارد شده! 😅'})
            return

    join_room(code)
    rooms[code]['players'][request.sid] = {
        'username': username,
        'display_name': display_name,
        'sid': request.sid
    }

    emit(
        'player_joined',
        {
            'players': get_room_players(code),
            'host': rooms[code]['host']
        },
        room=code
    )


@socketio.on('leave')
def handle_leave(data):
    code = data.get('code')
    if code not in rooms or request.sid not in rooms[code]['players']:
        return

    del rooms[code]['players'][request.sid]
    leave_room(code)

    if not rooms[code]['players']:
        del rooms[code]
        return

    if rooms[code]['host'] == request.sid:
        rooms[code]['host'] = list(rooms[code]['players'].keys())[0]

    emit(
        'player_left',
        {
            'players': get_room_players(code),
            'host': rooms[code]['host']
        },
        room=code
    )


@socketio.on('disconnect')
def handle_disconnect():
    for code, room_data in list(rooms.items()):
        if request.sid in room_data['players']:
            del room_data['players'][request.sid]

            if not room_data['players']:
                del rooms[code]
            else:
                if room_data['host'] == request.sid:
                    room_data['host'] = list(room_data['players'].keys())[0]
                emit(
                    'player_left',
                    {
                        'players': get_room_players(code),
                        'host': room_data['host']
                    },
                    room=code
                )
            break

# =========================================
# Socket.IO - شروع بازی
# =========================================

@socketio.on('start_game')
def handle_start_game(data):
    code = data.get('code')
    game = data.get('game')

    if code not in rooms:
        return

    if request.sid != rooms[code]['host']:
        emit('error_msg', {'msg': 'فقط میزبان می‌تونه بازی رو شروع کنه! 👑'})
        return

    if len(rooms[code]['players']) < 2:
        emit('error_msg', {'msg': 'حداقل ۲ نفر لازمه! 👥'})
        return

    rooms[code]['game'] = game
    players = list(rooms[code]['players'].keys())

    if game == 'xo':
        rooms[code]['state'] = {
            'board': [''] * 9,
            'turn': players[0],
            'symbols': {players[0]: 'X', players[1]: 'O'},
            'winner': None
        }
    elif game == 'rock-paper':
        rooms[code]['state'] = {
            'choices': {},
            'round': 0,
            'scores': {p: 0 for p in players}
        }
    elif game == 'snake-ladder':
        rooms[code]['state'] = {
            'positions': {p: 0 for p in players},
            'turn': players[0]
        }
    elif game == 'truth-dare':
        rooms[code]['state'] = {
            'current_player': players[0]
        }
    elif game == 'uno':
        rooms[code]['state'] = init_uno_game(players)

    emit(
        'game_started',
        {
            'game': game,
            'state': rooms[code]['state'],
            'players': get_room_players(code)
        },
        room=code
    )

# =========================================
# XO
# =========================================

@socketio.on('xo_move')
def handle_xo_move(data):
    code = data.get('code')
    index = data.get('index')

    if code not in rooms or rooms[code]['game'] != 'xo':
        return

    state = rooms[code]['state']
    if state['winner']:
        return
    if state['turn'] != request.sid:
        emit('error_msg', {'msg': 'نوبت تو نیست! ⏳'})
        return
    if state['board'][index] != '':
        return

    state['board'][index] = state['symbols'][request.sid]

    wins = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],
        [0, 3, 6], [1, 4, 7], [2, 5, 8],
        [0, 4, 8], [2, 4, 6]
    ]
    for w in wins:
        if (
            state['board'][w[0]]
            and state['board'][w[0]] == state['board'][w[1]] == state['board'][w[2]]
        ):
            state['winner'] = request.sid
            break

    if not state['winner'] and '' not in state['board']:
        state['winner'] = 'draw'

    if not state['winner']:
        players = list(rooms[code]['players'].keys())
        idx = players.index(request.sid)
        state['turn'] = players[(idx + 1) % len(players)]

    emit(
        'xo_update',
        {
            'board': state['board'],
            'turn': state['turn'],
            'winner': state['winner']
        },
        room=code
    )


@socketio.on('xo_restart')
def handle_xo_restart(data):
    code = data.get('code')
    if code not in rooms or rooms[code]['game'] != 'xo':
        return

    players = list(rooms[code]['players'].keys())
    rooms[code]['state'] = {
        'board': [''] * 9,
        'turn': players[0],
        'symbols': {players[0]: 'X', players[1]: 'O'},
        'winner': None
    }

    emit(
        'xo_update',
        {
            'board': rooms[code]['state']['board'],
            'turn': rooms[code]['state']['turn'],
            'winner': None
        },
        room=code
    )

# =========================================
# سنگ کاغذ قیچی
# =========================================

@socketio.on('rps_choose')
def handle_rps_choose(data):
    code = data.get('code')
    choice = data.get('choice')

    if code not in rooms or rooms[code]['game'] != 'rock-paper':
        return

    state = rooms[code]['state']
    state['choices'][request.sid] = choice

    if len(state['choices']) != len(rooms[code]['players']):
        return

    choices = state['choices']
    players = list(choices.keys())
    results = {p: 0 for p in players}
    rules = {'rock': 'scissors', 'scissors': 'paper', 'paper': 'rock'}

    for i, p1 in enumerate(players):
        for p2 in players[i + 1:]:
            if rules[choices[p1]] == choices[p2]:
                results[p1] += 1
            elif rules[choices[p2]] == choices[p1]:
                results[p2] += 1

    max_score = max(results.values())
    winners = [p for p, s in results.items() if s == max_score]
    for w in winners:
        state['scores'][w] += 1

    emit(
        'rps_result',
        {
            'choices': {
                p: {
                    'choice': choices[p],
                    'name': rooms[code]['players'][p]['display_name']
                } for p in players
            },
            'winners': winners,
            'scores': {
                p: {
                    'score': state['scores'][p],
                    'name': rooms[code]['players'][p]['display_name']
                } for p in players
            }
        },
        room=code
    )

    state['choices'] = {}
    state['round'] += 1

# =========================================
# مار و پله
# =========================================

@socketio.on('sl_roll')
def handle_sl_roll(data):
    code = data.get('code')

    if code not in rooms or rooms[code]['game'] != 'snake-ladder':
        return

    state = rooms[code]['state']
    if state['turn'] != request.sid:
        emit('error_msg', {'msg': 'نوبت تو نیست! ⏳'})
        return

    dice = random.randint(1, 6)
    current_pos = state['positions'][request.sid]
    new_pos = current_pos + dice

    snakes_ladders = {
        4: 14, 9: 31, 17: 7, 20: 38, 28: 84, 40: 59,
        51: 67, 54: 34, 62: 19, 63: 81, 64: 60, 71: 91,
        87: 24, 93: 73, 95: 75, 99: 78
    }

    if new_pos in snakes_ladders:
        new_pos = snakes_ladders[new_pos]
    if new_pos > 100:
        new_pos = 100

    state['positions'][request.sid] = new_pos

    winner = request.sid if new_pos == 100 else None
    players = list(rooms[code]['players'].keys())
    idx = players.index(request.sid)
    state['turn'] = players[(idx + 1) % len(players)]

    emit(
        'sl_update',
        {
            'positions': {
                p: {
                    'pos': state['positions'][p],
                    'name': rooms[code]['players'][p]['display_name']
                } for p in players
            },
            'dice': dice,
            'turn': state['turn'],
            'winner': winner
        },
        room=code
    )

# =========================================
# جرئت یا حقیقت
# =========================================

truths = [
    'آخرین بار کی دروغ گفتی؟ 🤥',
    'بزرگ‌ترین رازت چیه؟ 🤫',
    'تا حالا کسی رو از خواب بیدار کردی که عصبانی بشه؟ 😴',
    'آخرین بار کی گریه کردی؟ 😢',
    'چیزی که هیچ‌وقت به کسی نگفتی چیه؟ 🤐',
]

dares = [
    'یه آهنگ بخون! 🎤',
    '۱۰ تا شنا برو! 💪',
    'یه جوک بگو! 😂',
    'به یه نفر پیام بده و بگو دوستت داری! ❤️',
    'یه دقیقه بدون خندیدن به بقیه نگاه کن! 😐',
]


@socketio.on('td_choose')
def handle_td_choose(data):
    code = data.get('code')
    choice = data.get('choice')

    if code not in rooms or rooms[code]['game'] != 'truth-dare':
        return

    state = rooms[code]['state']
    if state['current_player'] != request.sid:
        emit('error_msg', {'msg': 'نوبت تو نیست! ⏳'})
        return

    text = random.choice(truths if choice == 'truth' else dares)
    players = list(rooms[code]['players'].keys())
    idx = players.index(request.sid)
    state['current_player'] = players[(idx + 1) % len(players)]

    emit(
        'td_result',
        {
            'choice': choice,
            'text': text,
            'next_player': rooms[code]['players'][state['current_player']]['display_name']
        },
        room=code
    )

# =========================================
# 🃏 UNO
# =========================================

UNO_COLORS = ['red', 'blue', 'green', 'yellow']


def create_uno_deck():
    deck = []
    for color in UNO_COLORS:
        deck.append({'color': color, 'value': '0'})
        for num in range(1, 10):
            deck.append({'color': color, 'value': str(num)})
            deck.append({'color': color, 'value': str(num)})
        for _ in range(2):
            deck.append({'color': color, 'value': 'skip'})
            deck.append({'color': color, 'value': 'reverse'})
            deck.append({'color': color, 'value': 'draw2'})
    for _ in range(4):
        deck.append({'color': 'wild', 'value': 'wild'})
        deck.append({'color': 'wild', 'value': 'wild4'})
    random.shuffle(deck)
    return deck


def init_uno_game(players):
    deck = create_uno_deck()
    hands = {}
    for p in players:
        hands[p] = [deck.pop() for _ in range(7)]

    first_card = deck.pop()
    while first_card['value'] in ('wild', 'wild4'):
        deck.insert(0, first_card)
        first_card = deck.pop()

    return {
        'deck': deck,
        'hands': hands,
        'discard': [first_card],
        'current_color': first_card['color'],
        'turn': players[0],
        'direction': 1,
        'winner': None,
        'uno_called': {},
        'drawn_this_turn': {}
    }


def get_next_player(players, current, direction, skip=0):
    idx = players.index(current)
    step = direction * (1 + skip)
    return players[(idx + step) % len(players)]


def can_play_card(card, top_card, current_color):
    if card['color'] == 'wild':
        return True
    if card['color'] == current_color:
        return True
    return card['value'] == top_card['value']


def draw_cards(state, sid, count):
    drawn = []
    for _ in range(count):
        if not state['deck']:
            if len(state['discard']) > 1:
                top = state['discard'][-1]
                rest = state['discard'][:-1]
                random.shuffle(rest)
                state['deck'] = rest
                state['discard'] = [top]
            else:
                break
        if state['deck']:
            card = state['deck'].pop()
            state['hands'][sid].append(card)
            drawn.append(card)
    return drawn


def send_uno_state(code):
    state = rooms[code]['state']
    players = list(state['hands'].keys())
    for sid in players:
        socketio.emit(
            'uno_update',
            {
                'players': [
                    {
                        'sid': p,
                        'name': rooms[code]['players'][p]['display_name'],
                        'card_count': len(state['hands'][p]),
                        'uno_called': state['uno_called'].get(p, False)
                    } for p in players
                ],
                'my_hand': state['hands'][sid],
                'discard_top': state['discard'][-1] if state['discard'] else None,
                'current_color': state['current_color'],
                'turn': state['turn'],
                'direction': state['direction'],
                'winner': state['winner'],
                'deck_count': len(state['deck'])
            },
            room=sid
        )


@socketio.on('uno_play')
def handle_uno_play(data):
    code = data.get('code')
    card_index = data.get('card_index')
    chosen_color = data.get('color')

    if code not in rooms or rooms[code]['game'] != 'uno':
        return

    state = rooms[code]['state']
    if state['winner']:
        return
    if state['turn'] != request.sid:
        emit('error_msg', {'msg': 'نوبت تو نیست! ⏳'})
        return

    players = list(state['hands'].keys())
    hand = state['hands'][request.sid]

    if card_index < 0 or card_index >= len(hand):
        emit('error_msg', {'msg': 'کارت نامعتبر! ❌'})
        return

    card = hand[card_index]
    top_card = state['discard'][-1]

    if not can_play_card(card, top_card, state['current_color']):
        emit('error_msg', {'msg': 'این کارت قابل بازی نیست! 🚫'})
        return

    hand.pop(card_index)
    state['discard'].append(card)

    if card['color'] == 'wild':
        state['current_color'] = chosen_color or random.choice(UNO_COLORS)
    else:
        state['current_color'] = card['color']

    if len(hand) == 0:
        state['winner'] = request.sid
        send_uno_state(code)
        return

    skip = 0
    if card['value'] == 'skip':
        skip = 1
    elif card['value'] == 'reverse':
        if len(players) == 2:
            skip = 1
        else:
            state['direction'] *= -1
    elif card['value'] == 'draw2':
        nxt = get_next_player(players, request.sid, state['direction'])
        draw_cards(state, nxt, 2)
        skip = 1
    elif card['value'] == 'wild4':
        nxt = get_next_player(players, request.sid, state['direction'])
        draw_cards(state, nxt, 4)
        skip = 1

    state['turn'] = get_next_player(players, request.sid, state['direction'], skip)
    send_uno_state(code)


@socketio.on('uno_draw')
def handle_uno_draw(data):
    code = data.get('code')
    if code not in rooms or rooms[code]['game'] != 'uno':
        return

    state = rooms[code]['state']
    if state['winner']:
        return
    if state['turn'] != request.sid:
        emit('error_msg', {'msg': 'نوبت تو نیست! ⏳'})
        return

    players = list(state['hands'].keys())
    drawn = draw_cards(state, request.sid, 1)

    if drawn:
        card = drawn[0]
        top_card = state['discard'][-1]
        if can_play_card(card, top_card, state['current_color']):
            send_uno_state(code)
            emit('uno_playable', {'msg': 'کارت کشیده شده قابل بازیه!'})
            return

    state['turn'] = get_next_player(players, request.sid, state['direction'])
    send_uno_state(code)


@socketio.on('uno_pass')
def handle_uno_pass(data):
    code = data.get('code')
    if code not in rooms or rooms[code]['game'] != 'uno':
        return

    state = rooms[code]['state']
    if state['turn'] != request.sid:
        return

    players = list(state['hands'].keys())
    state['turn'] = get_next_player(players, request.sid, state['direction'])
    send_uno_state(code)


@socketio.on('uno_call')
def handle_uno_call(data):
    code = data.get('code')
    if code not in rooms or rooms[code]['game'] != 'uno':
        return

    state = rooms[code]['state']
    if len(state['hands'].get(request.sid, [])) <= 2:
        state['uno_called'][request.sid] = True
        send_uno_state(code)

# =========================================
# شروع
# =========================================

if __name__ == '__main__':
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)
