// --- CONFIGURATION ---
const CLIENT_ID = 'b26e1fefe8c046bba2b5e8ebdae73858';
const CLIENT_SECRET = 'f1ce4e95f65045609866d6e566a575c6';
const REDIRECT_URI = 'https://georgekekatos.github.io/music-trivia/'; 

let accessToken = null;
let player = null;
let deviceId = null;
let currentSong = null;
let library = [];

// --- 1. AUTHENTICATION ---

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
    let duePool = pool.filter(s => s.next_review <= now || !s.next_review);
    
    if (duePool.length > 0) return duePool[Math.floor(Math.random() * duePool.length)];
    return pool[Math.floor(Math.random() * pool.length)];
}

// --- 3. PLAYBACK ENGINE ---

async function playSong() {
    if (!deviceId) {
        alert("
