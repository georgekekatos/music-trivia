const CLIENT_ID = 'b26e1fefe8c046bba2b5e8ebdae73858';
const REDIRECT_URI = 'https://georgekekatos.github.io/music-trivia/'; 
let accessToken = null;

// --- 1. CHECK FOR CODE IN URL ---
const urlParams = new URLSearchParams(window.location.search);
const code = urlParams.get('code');

if (code) {
    exchangeCodeForToken(code);
}

// --- 2. LOGIN BUTTON ---
document.getElementById('login-btn').onclick = () => {
    const scope = 'streaming user-read-email user-read-private user-modify-playback-state';
    
    // Constructing the URL manually to avoid any object errors
    const authUrl = `https://accounts.spotify.com/authorize?client_id=${CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(scope)}&show_dialog=true`;
    
    window.location.href = authUrl;
};

async function exchangeCodeForToken(code) {
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
        window.history.pushState({}, document.title, window.location.pathname);
        loadLibrary();
    }
}

// ... (Keep the rest of your loadLibrary, playSong, and handleSrs functions the same)
