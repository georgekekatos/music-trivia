// --- CONFIGURATION ---
const CLIENT_ID = 'b26e1fefe8c046bba2b5e8ebdae73858';
const CLIENT_SECRET = 'f1ce4e95f65045609866d6e566a575c6';
const REDIRECT_URI = 'https://georgekekatos.github.io/music-trivia/'; 

let accessToken = null;
let player = null;
let deviceId = null;
let currentSong = null;
let library = [];

// --- 1. AUTHENTICATION (The "Code" Flow) ---

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
            // Clean the URL hash/params
            window.history.pushState({}, document.title, window.location.pathname);
            loadLibrary();
        }
    } catch (err) {
        console.error("Token Exchange Error:", err);
    }
}

// --- 2. DATA & ANKI LOGIC ---

async function loadLibrary() {
    try {
        const response = await fetch('master_library.json');
        const rawData = await response.json();
        const progress = JSON.parse(localStorage.getItem('trivia_progress') || '{}');
        
        library = rawData.map(song => ({
            ...song,
            ...(progress[song.uri] || { next_review: 0, interval: 0, ease: 2.5 })
        }));

        const years = [...new Set(library.map(s => s.year))].sort();
        const select = document.getElementById('year-filter');
        if (select) {
            select.innerHTML = '<option value="ALL">All Years (Due for Review)</option>';
            years.forEach(y => {
                const opt = document.createElement('option');
                opt.value = y; opt.innerText = y;
                select.appendChild(opt);
            });
        }

        updateAnkiDisplay();
    } catch (e) { console.error("Library load failed", e); }
}

function updateAnkiDisplay() {
    const now = Date.now();
    let counts = { new: 0, learning: 0, due: 0 };

    library.forEach(song => {
        if (!song.next_review || song.next_review === 0) counts.new++;
        else if (song.next_review <= now) counts.due++;
        else counts.learning++;
    });

    if(document.getElementById('count-new')) document.getElementById('count-new').innerText = counts.new;
    if(document.getElementById('count-learning')) document.getElementById('count-learning').innerText = counts.learning;
    if(document.getElementById('count-due')) document.getElementById('count-due').innerText = counts.due;
}

function getNextSong() {
    const filter = document.getElementById('year-filter').value;
    const now = Date.now();
    let pool = library.filter(s => (filter === 'ALL' || s.year == filter));
    let duePool = pool.filter(s => s.next_review <= now || !s.next_review);
    
    if (duePool.length > 0) return duePool[Math.floor(Math.random() * duePool.length)];
    return pool[Math.floor(Math.random() * pool.length)];
}

// --- 3. PLAYBACK ENGINE ---

async function playSong() {
    if (!deviceId || !accessToken) {
        alert("Spotify not connected. Please login again.");
        return;
    }

    currentSong = getNextSong();
    if (!currentSong) return;

    // Reset UI
    document.getElementById('reveal-area').classList.add('hidden');
    if(document.getElementById('srs-controls')) document.getElementById('srs-controls').classList.add('hidden');
    document.getElementById('visualizer').classList.remove('hidden');
    document.getElementById('playing-status').innerText = "Playing...";
    document.getElementById('main-action-btn').innerText = 'REVEAL';

    // Transfer playback to this "Music Trivia" device
    await fetch('https://api.spotify.com/v1/me/player', {
        method: 'PUT',
        body: JSON.stringify({ device_ids: [deviceId], play: true }),
        headers: { 
            'Content-Type': 'application/json', 
            'Authorization': `Bearer ${accessToken}` 
        }
    });

    // Start the specific track
    try {
        await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
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
        
        if (player) {
            await player.activateElement();
            setTimeout(() => { player.resume(); }, 500);
        }
    } catch (err) {
        console.error("Playback Error:", err);
    }
}

function reveal() {
    document.getElementById('song-title').innerText = currentSong.title;
    document.getElementById('song-artist').innerText = currentSong.artist;
    document.getElementById('song-year').innerText = `Year: ${currentSong.year}`;
    
    document.getElementById('reveal-area').classList.remove('hidden');
    document.getElementById('visualizer').classList.add('hidden');
    document.getElementById('main-action-btn').classList.add('hidden');
    document.getElementById('srs-controls').classList.remove('hidden');
    document.getElementById('playing-status').innerText = "Paused";
    
    if (player) player.pause();
}

function handleSrs(grade) {
    const gradeNum = parseInt(grade);
    const now = Date.now();
    const dayInMs = 24 * 60 * 60 * 1000;

    if (gradeNum >= 3) {
        currentSong.interval = (currentSong.interval === 0) ? 1 : currentSong.interval * (gradeNum === 5 ? 4 : 2);
        currentSong.next_review = now + (currentSong.interval * dayInMs);
    } else {
        currentSong.interval = 0;
        currentSong.next_review = now + (10 * 60 * 1000); 
    }

    const progress = JSON.parse(localStorage.getItem('trivia_progress') || '{}');
    progress[currentSong.uri] = {
        next_review: currentSong.next_review,
        interval: currentSong.interval,
        ease: 2.5
    };
    localStorage.setItem('trivia_progress', JSON.stringify(progress));

    const idx = library.findIndex(s => s.uri === currentSong.uri);
    if (idx !== -1) library[idx] = {...currentSong};

    updateAnkiDisplay();
    document.getElementById('srs-controls').classList.add('hidden');
    document.getElementById('main-action-btn').classList.remove('hidden');
    document.getElementById('main-action-btn').innerText = 'PLAY';
}

// --- 4. INITIALIZATION ---

document.getElementById('login-btn').onclick = () => {
    const scope = 'streaming user-read-email user-read-private user-modify-playback-state';
    // FIXED: Ensure response_type is 'code'
    const authUrl = `https://accounts.spotify.com/authorize?client_id=${CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(scope)}`;
    window.location.href = authUrl;
};

document.getElementById('main-action-btn').onclick = () => {
    const text = document.getElementById('main-action-btn').innerText;
    if (text === 'PLAY' || text === 'NEXT SONG') playSong();
    else reveal();
};

document.querySelectorAll('.btn-srs').forEach(btn => {
    btn.onclick = () => handleSrs(btn.getAttribute('data-grade'));
});

window.onSpotifyWebPlaybackSDKReady = () => {
    player = new Spotify.Player({
        name: 'Music Trivia Player',
        getOAuthToken: cb => { cb(accessToken); },
        volume: 1.0
    });

    player.addListener('ready', ({ device_id }) => {
        deviceId = device_id;
        console.log('Spotify Player Ready');
    });

    player.connect();
};

// Check for 'code' in URL on load
const urlParams = new URLSearchParams(window.location.search);
const code = urlParams.get('code');
if (code) {
    exchangeCodeForToken(code);
}
