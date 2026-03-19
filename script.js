const CLIENT_ID = 'b26e1fefe8c046bba2b5e8ebdae73858';
const REDIRECT_URI = window.location.origin + window.location.pathname;
let accessToken = null;
let player = null;
let deviceId = null;
let currentSong = null;
let library = [];

// --- 1. AUTHENTICATION (AUTHORIZATION CODE FLOW) ---

const urlParams = new URLSearchParams(window.location.search);
const code = urlParams.get('code');

if (code) {
    // If we have a code in the URL, exchange it for a token
    exchangeCodeForToken(code);
}

document.getElementById('login-btn').onclick = () => {
    const scope = 'streaming user-read-email user-read-private user-modify-playback-state';
    const authUrl = new URL("https://accounts.spotify.com/authorize");
    
    const params = {
        response_type: 'code', // CHANGED FROM 'token' TO 'code'
        client_id: CLIENT_ID,
        scope: scope,
        redirect_uri: REDIRECT_URI,
        show_dialog: true 
    };

    authUrl.search = new URLSearchParams(params).toString();
    window.location.href = authUrl.toString();
};

async function exchangeCodeForToken(code) {
    // Note: In a professional app, this happens on a server. 
    // For your personal trivia tool, we'll do it here, but you'll need your Client Secret.
    const clientSecret = '12bd69f385f5481984f9c6b187e0af7a'; 
    
    const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + btoa(CLIENT_ID + ':' + clientSecret)
        },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: REDIRECT_URI
        })
    });

    const data = await response.json();
    if (data.access_token) {
        accessToken = data.access_token;
        document.getElementById('auth-section').classList.add('hidden');
        document.getElementById('player-section').classList.remove('hidden');
        // Clean the URL
        window.history.pushState({}, document.title, window.location.pathname);
        loadLibrary();
    }
}

// --- 2. SPOTIFY PLAYER SETUP ---
window.onSpotifyWebPlaybackSDKReady = () => {
    player = new Spotify.Player({
        name: 'Trivia SRS Web Player',
        getOAuthToken: cb => { cb(accessToken); }
    });

    player.addListener('ready', ({ device_id }) => {
        deviceId = device_id;
        console.log('Ready with Device ID', device_id);
    });

    player.connect();
};

// --- 3. CORE TRIVIA LOGIC ---
async function loadLibrary() {
    const response = await fetch('master_library.json');
    const rawData = await response.json();
    const progress = JSON.parse(localStorage.getItem('trivia_progress') || '{}');
    library = rawData.map(song => ({
        ...song,
        ...(progress[song.uri] || { next_review: 0, interval: 0, ease: 2.5 })
    }));

    const years = [...new Set(library.map(s => s.year))].sort();
    const select = document.getElementById('year-filter');
    years.forEach(y => {
        const opt = document.createElement('option');
        opt.value = y; opt.innerText = y;
        select.appendChild(opt);
    });
}

function getNextSong() {
    const filter = document.getElementById('year-filter').value;
    const now = Date.now();
    let pool = library;
    if (filter !== 'ALL') {
        pool = library.filter(s => s.year == filter);
    } else {
        pool = library.filter(s => s.next_review <= now);
    }
    if (pool.length === 0) return library[Math.floor(Math.random() * library.length)];
    return pool[Math.floor(Math.random() * pool.length)];
}

async function playSong() {
    currentSong = getNextSong();
    
    // THE REAL PLAYBACK URL:
    await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
        method: 'PUT',
        body: JSON.stringify({ uris: [currentSong.uri], position_ms: currentSong.start_ms }),
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` }
    });

    document.getElementById('main-action-btn').innerText = 'REVEAL';
    document.getElementById('playing-status').innerText = 'Playing...';
}

function reveal() {
    document.getElementById('song-title').innerText = currentSong.title;
    document.getElementById('song-artist').innerText = currentSong.artist;
    document.getElementById('song-year').innerText = currentSong.year;
    document.getElementById('reveal-area').classList.remove('hidden');
    document.getElementById('main-action-btn').classList.add('hidden');
    document.getElementById('srs-controls').classList.remove('hidden');
}

function handleSrs(grade) {
    const now = Date.now();
    let { interval, ease } = currentSong;
    if (grade >= 3) {
        if (interval === 0) interval = 1;
        else if (interval === 1) interval = 4;
        else interval = Math.round(interval * ease);
        ease = ease + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02));
    } else {
        interval = 1;
        ease = Math.max(1.3, ease - 0.2);
    }
    currentSong.next_review = now + (interval * 24 * 60 * 60 * 1000);
    currentSong.interval = interval;
    currentSong.ease = ease;
    const progress = JSON.parse(localStorage.getItem('trivia_progress') || '{}');
    progress[currentSong.uri] = { next_review: currentSong.next_review, interval, ease };
    localStorage.setItem('trivia_progress', JSON.stringify(progress));
    resetUI();
}

function resetUI() {
    document.getElementById('reveal-area').classList.add('hidden');
    document.getElementById('srs-controls').classList.add('hidden');
    document.getElementById('main-action-btn').classList.remove('hidden');
    document.getElementById('main-action-btn').innerText = 'NEXT SONG';
    document.getElementById('playing-status').innerText = 'Ready';
    player.pause();
}

document.getElementById('main-action-btn').onclick = () => {
    const text = document.getElementById('main-action-btn').innerText;
    if (text === 'PLAY' || text === 'NEXT SONG') playSong();
    else reveal();
};

document.querySelectorAll('.btn-srs').forEach(btn => {
    btn.onclick = () => handleSrs(parseInt(btn.dataset.grade));
});
