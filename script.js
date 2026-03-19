const CLIENT_ID = 'b26e1fefe8c046bba2b5e8ebdae73858';
const CLIENT_SECRET = 'f1ce4e95f65045609866d6e566a575c6';
const REDIRECT_URI = 'https://georgekekatos.github.io/music-trivia/'; 

let accessToken = null;
let player = null;
let deviceId = null;
let currentSong = null;
let library = [];

// --- 1. AUTH & DATA ---

async function exchangeCodeForToken(code) {
    try {
        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + btoa(CLIENT_ID + ':' + CLIENT_SECRET)
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
            window.history.pushState({}, document.title, window.location.pathname);
            loadLibrary();
        }
    } catch (err) { alert("Auth Error: " + err); }
}

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
    updateAnkiDisplay();
}

// --- 2. THE PLAYBACK (YOUR ORIGINAL LOGIC) ---

async function playSong() {
    currentSong = getNextSong();
    if (!currentSong) return;

    // Reset UI
    document.getElementById('reveal-area').classList.add('hidden');
    document.getElementById('srs-controls').classList.add('hidden');
    document.getElementById('main-action-btn').classList.remove('hidden');
    
    const url = `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`;

    // Fix for Mobile/Safari
    if (player) {
        await player.activateElement(); 
    }

    const response = await fetch(url, {
        method: 'PUT',
        body: JSON.stringify({ 
            uris: [currentSong.uri],
            position_ms: currentSong.start_ms || 0
        }),
        headers: { 
            'Content-Type': 'application/json', 
            'Authorization': `Bearer ${accessToken}` 
        }
    });

    if (response.ok) {
        document.getElementById('main-action-btn').innerText = 'REVEAL';
        document.getElementById('playing-status').innerText = "Playing...";
        document.getElementById('visualizer').classList.remove('hidden');
        // Your specific 1s delay fix
        setTimeout(() => { player.resume(); }, 1000);
    } else {
        const err = await response.json();
        alert("Playback failed: " + err.error.message);
    }
}

function getNextSong() {
    const filter = document.getElementById('year-filter').value;
    const now = Date.now();
    let pool = (filter === 'ALL') ? library : library.filter(s => s.year == filter);
    
    // Prioritize Due/New
    let due = pool.filter(s => !s.next_review || s.next_review <= now);
    if (due.length > 0) return due[Math.floor(Math.random() * due.length)];
    return pool[Math.floor(Math.random() * pool.length)];
}

// --- 3. THE REVEAL & SRS (THE FIX) ---

function reveal() {
    document.getElementById('song-title').innerText = currentSong.title;
    document.getElementById('song-artist').innerText = currentSong.artist;
    document.getElementById('song-year').innerText = "Year: " + currentSong.year;
    
    document.getElementById('reveal-area').classList.remove('hidden');
    document.getElementById('main-action-btn').classList.add('hidden');
    document.getElementById('srs-controls').classList.remove('hidden');
    document.getElementById('visualizer').classList.add('hidden');
}

function handleSrs(grade) {
    const now = Date.now();
    const dayInMs = 24 * 60 * 60 * 1000;

    // 1. Calculate next review
    if (grade >= 3) {
        currentSong.interval = (currentSong.interval || 0) === 0 ? 1 : currentSong.interval * 2;
        currentSong.next_review = now + (currentSong.interval * dayInMs);
    } else {
        currentSong.interval = 0;
        currentSong.next_review = now + (10 * 60 * 1000); // 10 mins
    }

    // 2. Update library object
    const index = library.findIndex(s => s.uri === currentSong.uri);
    if (index !== -1) library[index] = {...currentSong};

    // 3. Save to LocalStorage
    const progress = {};
    library.forEach(s => {
        if (s.next_review > 0) {
            progress[s.uri] = { next_review: s.next_review, interval: s.interval };
        }
    });
    localStorage.setItem('trivia_progress', JSON.stringify(progress));

    // 4. Update the "0 + 0 + 154" display
    updateAnkiDisplay();

    // 5. Reset UI for next round
    document.getElementById('reveal-area').classList.add('hidden');
    document.getElementById('srs-controls').classList.add('hidden');
    document.getElementById('main-action-btn').classList.remove('hidden');
    document.getElementById('main-action-btn').innerText = 'NEXT SONG';
    if (player) player.pause();
    window.scrollTo(0, 0);
}

function updateAnkiDisplay() {
    const now = Date.now();
    let counts = { new: 0, learning: 0, due: 0 };

    library.forEach(song => {
        if (!song.next_review || song.next_review === 0) counts.new++;
        else if (song.next_review <= now) counts.due++;
        else counts.learning++;
    });

    document.getElementById('count-new').innerText = counts.new;
    document.getElementById('count-learning').innerText = counts.learning;
    document.getElementById('count-due').innerText = counts.due;
}

// --- 4. SDK INITIALIZATION ---

document.getElementById('login-btn').onclick = () => {
    const scope = 'streaming user-read-email user-read-private user-modify-playback-state';
    window.location.href = `https://accounts.spotify.com/authorize?client_id=${CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(scope)}&show_dialog=true`;
};

document.getElementById('main-action-btn').onclick = () => {
    const text = document.getElementById('main-action-btn').innerText;
    if (text === 'PLAY' || text === 'NEXT SONG') playSong();
    else reveal();
};

window.onSpotifyWebPlaybackSDKReady = () => {
    player = new Spotify.Player({
        name: 'Music Trivia',
        getOAuthToken: cb => { cb(accessToken); },
        volume: 1.0
    });

    player.addListener('ready', ({ device_id }) => {
        deviceId = device_id;
        player.activateElement(); 
    });

    player.connect();
};

const code = new URLSearchParams(window.location.search).get('code');
if (code) exchangeCodeForToken(code);
