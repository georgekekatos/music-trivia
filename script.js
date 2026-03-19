// --- CONFIGURATION ---
const CLIENT_ID = 'b26e1fefe8c046bba2b5e8ebdae73858';
const REDIRECT_URI = 'https://georgekekatos.github.io/music-trivia/'; 

let accessToken = null;
let player = null;
let deviceId = null;
let currentSong = null;
let library = [];

// --- CORE FUNCTIONS ---

async function exchangeCodeForToken(code) {
    // Note: In a real app, this should happen on a backend server. 
    // Since you are on GitHub Pages, we are assuming your setup handles the token exchange.
    // Ensure your Auth flow is returning the token to the 'accessToken' variable.
}

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
        select.innerHTML = '<option value="ALL">All Years (Due for Review)</option>';
        years.forEach(y => {
            const opt = document.createElement('option');
            opt.value = y; opt.innerText = y;
            select.appendChild(opt);
        });

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

    document.getElementById('count-new').innerText = counts.new;
    document.getElementById('count-learning').innerText = counts.learning;
    document.getElementById('count-due').innerText = counts.due;
}

function getNextSong() {
    const filter = document.getElementById('year-filter').value;
    const now = Date.now();
    let pool = library.filter(s => (filter === 'ALL' || s.year == filter));
    let duePool = pool.filter(s => s.next_review <= now);
    
    if (duePool.length > 0) return duePool[Math.floor(Math.random() * duePool.length)];
    return pool[Math.floor(Math.random() * pool.length)];
}

async function playSong() {
    if (!deviceId) {
        alert("Spotify Player not ready. Try playing a song in the Spotify App first to 'wake' it up.");
        return;
    }

    currentSong = getNextSong();
    if (!currentSong) return;

    // 1. UI Updates
    document.getElementById('reveal-area').classList.add('hidden');
    document.getElementById('srs-controls').classList.add('hidden');
    document.getElementById('visualizer').classList.remove('hidden');
    document.getElementById('playing-status').innerText = "Playing...";
    document.getElementById('main-action-btn').innerText = 'REVEAL';

    // 2. THE MOBILE FIX: Force Spotify to transfer playback to this device
    await fetch('https://api.spotify.com/v1/me/player', {
        method: 'PUT',
        body: JSON.stringify({ device_ids: [deviceId], play: true }),
        headers: { 
            'Content-Type': 'application/json', 
            'Authorization': `Bearer ${accessToken}` 
        }
    });

    // 3. Play the specific song
    const url = `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`;
    try {
        await fetch(url, {
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
        
        // Final kick to un-mute Safari
        if (player) {
            await player.activateElement();
            setTimeout(() => { player.resume(); }, 500);
        }
    } catch (err) {
        console.error("Playback Fetch Error:", err);
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

    // Simple SRS Logic: 1=Again, 2=Hard, 3=Good, 4=Easy
    if (gradeNum >= 3) {
        currentSong.interval = (currentSong.interval === 0) ? 1 : currentSong.interval * (gradeNum === 4 ? 4 : 2);
        currentSong.next_review = now + (currentSong.interval * dayInMs);
    } else {
        currentSong.interval = 0;
        currentSong.next_review = now + (10 * 60 * 1000); // 10 mins
    }

    const index = library.findIndex(s => s.uri === currentSong.uri);
    if (index !== -1) library[index] = { ...currentSong };

    const progress = JSON.parse(localStorage.getItem('trivia_progress') || '{}');
    progress[currentSong.uri] = {
        next_review: currentSong.next_review,
        interval: currentSong.interval,
        ease: 2.5
    };
    localStorage.setItem('trivia_progress', JSON.stringify(progress));

    updateAnkiDisplay();
    document.getElementById('srs-controls').classList.add('hidden');
    document.getElementById('main-action-btn').classList.remove('hidden');
    document.getElementById('main-action-btn').innerText = 'PLAY';
}

// --- INITIALIZATION ---

document.getElementById('login-btn').onclick = () => {
    const scope = 'streaming user-read-email user-read-private user-modify-playback-state';
    const authUrl = `https://accounts.spotify.com/authorize?client_id=${CLIENT_ID}&response_type=token&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(scope)}`;
    window.location.href = authUrl;
};

// Handle the Implicit Grant Token (Simpler for GitHub Pages)
if (window.location.hash) {
    const params = new URLSearchParams(window.location.hash.substring(1));
    accessToken = params.get('access_token');
    if (accessToken) {
        document.getElementById('auth-section').classList.add('hidden');
        document.getElementById('player-section').classList.remove('hidden');
        loadLibrary();
    }
}

document.getElementById('main-action-btn').onclick = () => {
    const text = document.getElementById('main-action-btn').innerText;
    if (text === 'PLAY' || text === 'NEXT SONG') playSong();
    else reveal();
};

document.querySelectorAll('.btn-srs').forEach(btn => {
    btn.onclick = () => handleSrs(btn.dataset.grade);
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
        player.activateElement(); // Crucial for Safari
    });

    player.connect();
};
