// --- 0. CONFIGURATION ---
const CLIENT_ID = 'b26e1fefe8c046bba2b5e8ebdae73858';
const CLIENT_SECRET = 'f1ce4e95f65045609866d6e566a575c6';
// FORCE THE SLASH AT THE END
const REDIRECT_URI = 'https://georgekekatos.github.io/music-trivia/'; 

let accessToken = null;
let player = null;
let deviceId = null;
let currentSong = null;
let library = [];

// --- 1. DEFINE FUNCTIONS FIRST ---

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
        } else {
            alert("Spotify rejected the token swap: " + JSON.stringify(data));
        }
    } catch (err) {
        alert("Network Error: " + err);
    }
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

async function playSong() {
    currentSong = getNextSong();
    
    // Ensure we are using the internal Player's ID
    const url = `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`;

    // 1. Tell the browser "Get ready to make noise"
    if (player) {
        await player.activateElement(); 
    }

    // 2. Send the Play Command
    const response = await fetch(url, {
        method: 'PUT',
        body: JSON.stringify({ 
            uris: [currentSong.uri], // Must be "spotify:track:ID"
            position_ms: currentSong.start_ms 
        }),
        headers: { 
            'Content-Type': 'application/json', 
            'Authorization': `Bearer ${accessToken}` 
        }
    });

    if (response.ok) {
        document.getElementById('main-action-btn').innerText = 'REVEAL';
        // 3. Force the player to actually start the stream
        setTimeout(() => { player.resume(); }, 1000);
    } else {
        const err = await response.json();
        console.error("Playback failed:", err);
        alert("Playback failed: " + err.error.message);
    }
}

function getNextSong() {
    const filter = document.getElementById('year-filter').value;
    let pool = (filter === 'ALL') ? library : library.filter(s => s.year == filter);
    return pool[Math.floor(Math.random() * pool.length)];
}

function reveal() {
    document.getElementById('song-title').innerText = currentSong.title;
    document.getElementById('song-artist').innerText = currentSong.artist;
    document.getElementById('reveal-area').classList.remove('hidden');
    document.getElementById('main-action-btn').classList.add('hidden');
    document.getElementById('srs-controls').classList.remove('hidden');
}

function handleSrs(grade) {
    // Basic reset for now to ensure flow works
    document.getElementById('reveal-area').classList.add('hidden');
    document.getElementById('srs-controls').classList.add('hidden');
    document.getElementById('main-action-btn').classList.remove('hidden');
    document.getElementById('main-action-btn').innerText = 'NEXT SONG';
    if (player) player.pause();
}

// --- 2. EXECUTION AT THE BOTTOM ---

document.getElementById('login-btn').onclick = () => {
    const scope = 'streaming user-read-email user-read-private user-modify-playback-state';
    const authUrl = `https://accounts.spotify.com/authorize?client_id=${CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(scope)}&show_dialog=true`;
    window.location.href = authUrl;
};

document.getElementById('main-action-btn').onclick = () => {
    const text = document.getElementById('main-action-btn').innerText;
    if (text === 'PLAY' || text === 'NEXT SONG') playSong();
    else reveal();
};

document.querySelectorAll('.btn-srs').forEach(btn => {
    btn.onclick = () => handleSrs(btn.dataset.grade);
});

// Check if we just arrived from Spotify
const urlParams = new URLSearchParams(window.location.search);
const code = urlParams.get('code');
if (code) {
    exchangeCodeForToken(code);
}

window.onSpotifyWebPlaybackSDKReady = () => {
    player = new Spotify.Player({
        name: 'Music Trivia',
        getOAuthToken: cb => { cb(accessToken); },
        volume: 1.0 // Force volume to max
    });

    player.addListener('ready', ({ device_id }) => {
        deviceId = device_id;
        // This is the CRITICAL fix for iPhones:
        // It tells the browser "I am a speaker, let me make noise"
        player.activateElement(); 
    });

    // Handle Safari "Autoplay" blocks
    player.addListener('not_ready', ({ device_id }) => {
        console.log('Device ID has gone offline', device_id);
    });

    player.connect();
};

function updateAnkiDisplay() {
    const now = Date.now();
    let counts = { new: 0, learning: 0, due: 0 };

    library.forEach(song => {
        // New: Never been reviewed
        if (!song.next_review || song.next_review === 0) {
            counts.new++;
        } 
        // Due: Review time has passed
        else if (song.next_review <= now) {
            counts.due++;
        } 
        // Learning: Reviewed but not due yet
        else {
            counts.learning++;
        }
    });

    // Update the HTML spans we created earlier
    document.getElementById('count-new').innerText = counts.new;
    document.getElementById('count-learning').innerText = counts.learning;
    document.getElementById('count-due').innerText = counts.due;
}

function rateSong(grade) {
    console.log("Rating received:", grade);
    if (!currentSong) {
        console.error("No song is currently active!");
        return;
    }

    const now = Date.now();
    const dayInMs = 24 * 60 * 60 * 1000;

    // 1. Calculate the New Review Date
    if (grade >= 3) {
        // If it's a "Pass" (Easy/Good), move it to tomorrow or further
        currentSong.interval = (currentSong.interval || 0) === 0 ? 1 : currentSong.interval * 2;
        currentSong.next_review = now + (currentSong.interval * dayInMs);
    } else {
        // If it's a "Fail" (Hard), show it again in 10 minutes
        currentSong.interval = 0;
        currentSong.next_review = now + (10 * 60 * 1000); 
    }

    // 2. Save this specific song's progress to the Library object
    // Find the song in the main library and update it
    const index = library.findIndex(s => s.uri === currentSong.uri);
    if (index !== -1) {
        library[index].next_review = currentSong.next_review;
        library[index].interval = currentSong.interval;
    }

    // 3. Save everything to the phone's permanent memory
    const progress = {};
    library.forEach(s => {
        if (s.next_review > 0) {
            progress[s.uri] = {
                next_review: s.next_review,
                interval: s.interval,
                ease: s.ease || 2.5
            };
        }
    });
    localStorage.setItem('trivia_progress', JSON.stringify(progress));

    // 4. Update the 0 + 0 + 0 display
    updateAnkiDisplay();

    // 5. Reset UI
    document.getElementById('reveal-area').classList.add('hidden');
    document.getElementById('main-action-btn').innerText = 'PLAY';
    
    // Scroll back to top for the next round
    window.scrollTo(0, 0);
}

function revealAnswer() {
    // 1. Make sure we actually have a song playing
    if (!currentSong) return;

    // 2. Fill the h2 tag with the song's name and artist
    const info = document.getElementById('song-info');
    info.innerText = `${currentSong.title} - ${currentSong.artist}`;

    // 3. Show the hidden area where the buttons are
    const revealArea = document.getElementById('reveal-area');
    revealArea.classList.remove('hidden');

    // 4. Change the main button text so it's ready for the next song later
    document.getElementById('main-action-btn').innerText = 'NEXT SONG';
    
    // 5. Hide the music visualizer animation
    const viz = document.getElementById('visualizer');
    if (viz) viz.style.display = 'none';
}

function handleMainClick() {
    const btn = document.getElementById('main-action-btn');

    if (btn.innerText === 'PLAY') {
        playSong(); // Start the music
    } else if (btn.innerText === 'REVEAL') {
        revealAnswer(); // Show the answer & rating buttons
    } else if (btn.innerText === 'NEXT SONG') {
        // Reset the UI and play the next one
        document.getElementById('reveal-area').classList.add('hidden');
        btn.innerText = 'PLAY';
        playSong();
    }
}
