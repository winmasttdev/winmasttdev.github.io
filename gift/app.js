// ==========================================================================
// DESKTOP SCRAPBOOK INTERACTIVE ENGINE // EST. 2026
// ==========================================================================

// State Variables
let isLetterOpened = false;
let audioPlaying = false;
let webAudioCtx = null;
let synthIntervalId = null;

// DOM Elements
const envelopeWrapper = document.getElementById('envelope-wrapper');
const letterCard = document.getElementById('letter-card');
const photos = document.querySelectorAll('.polaroid-photo');
const retroPlayer = document.getElementById('retro-player');
const playerPlayBtn = document.getElementById('player-play-btn');
const playerVolume = document.getElementById('player-volume');
const wheelLeft = document.getElementById('wheel-left');
const wheelRight = document.getElementById('wheel-right');

// Lightbox Elements
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightbox-img');
const lightboxCaption = document.getElementById('lightbox-caption');
const lightboxClose = document.querySelector('.lightbox-close');

// Audio Element
const bgAudio = document.getElementById('bg-audio');

// ==========================================================================
// WEB AUDIO API SYNTHESIZERS (For Sounds & Fallback Music)
// ==========================================================================

function initAudioContext() {
    if (!webAudioCtx) {
        webAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (webAudioCtx.state === 'suspended') {
        webAudioCtx.resume();
    }
}

// Play simple retro beep
function playBeep(freq, duration) {
    if (!webAudioCtx) return;
    const osc = webAudioCtx.createOscillator();
    const gain = webAudioCtx.createGain();
    
    osc.type = 'sine';
    osc.frequency.value = freq;
    
    gain.gain.setValueAtTime(0.08, webAudioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, webAudioCtx.currentTime + duration);
    
    osc.connect(gain);
    gain.connect(webAudioCtx.destination);
    
    osc.start();
    osc.stop(webAudioCtx.currentTime + duration);
}

// Fallback arpeggio loop (lofi warm melody)
function startSynthFallback() {
    if (synthIntervalId) return;
    initAudioContext();
    
    const notes = [
        261.63, 329.63, 392.00, 493.88, // C4, E4, G4, B4
        440.00, 523.25, 392.00, 349.23, // A4, C5, G4, F4
        293.66, 349.23, 440.00, 392.00, // D4, F4, A4, G4
        329.63, 392.00, 493.88, 587.33  // E4, G4, B4, D5
    ];
    let step = 0;
    
    const filter = webAudioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, webAudioCtx.currentTime);
    filter.connect(webAudioCtx.destination);
    
    synthIntervalId = setInterval(() => {
        if (!audioPlaying) return;
        
        const osc = webAudioCtx.createOscillator();
        const gain = webAudioCtx.createGain();
        
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(notes[step % notes.length], webAudioCtx.currentTime);
        
        gain.gain.setValueAtTime(0.06, webAudioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, webAudioCtx.currentTime + 0.8);
        
        osc.connect(gain);
        gain.connect(filter);
        
        osc.start();
        osc.stop(webAudioCtx.currentTime + 0.8);
        
        step++;
    }, 450);
}

function stopSynthFallback() {
    if (synthIntervalId) {
        clearInterval(synthIntervalId);
        synthIntervalId = null;
    }
}

// ==========================================================================
// INTERACTIVE ENVELOPE (OPENING LOGIC)
// ==========================================================================

envelopeWrapper.addEventListener('click', () => {
    if (isLetterOpened) return;
    isLetterOpened = true;
    
    // 1. Envelope animation & fade out
    envelopeWrapper.classList.add('fade-out');
    
    // Initialize audio context
    initAudioContext();
    
    // 2. Play warm double-beep chime
    playBeep(440, 0.15);
    setTimeout(() => playBeep(554.37, 0.15), 100); // C#5
    setTimeout(() => playBeep(659.25, 0.25), 200); // E5
    
    setTimeout(() => {
        // 3. Remove envelope from layout completely
        envelopeWrapper.style.display = 'none';
        
        // 4. Reveal Letter Card & Walkman Player
        letterCard.classList.remove('hidden');
        retroPlayer.classList.remove('hidden');
        
        // 5. Stagger slide-in of Polaroid photos
        photos.forEach((photo, idx) => {
            setTimeout(() => {
                photo.classList.remove('hidden');
                photo.classList.add('animate');
            }, (idx + 1) * 200); // Stagger by 200ms each
        });
        
        // 6. Automatically start background music
        setTimeout(toggleAudio, 600);
    }, 600);
});

// ==========================================================================
// MEDIA PLAYER CONTROLS & MANAGEMENT
// ==========================================================================

function toggleAudio() {
    initAudioContext();
    
    if (audioPlaying) {
        bgAudio.pause();
        audioPlaying = false;
        stopCassetteAnimation();
        updatePlayButtons(false);
    } else {
        const playPromise = bgAudio.play();
        audioPlaying = true;
        updatePlayButtons(true);
        startCassetteAnimation();
        
        if (playPromise !== undefined) {
            playPromise.then(() => {
                stopSynthFallback(); // Ensure synth arpeggiator is stopped
            }).catch(error => {
                console.log("Audio file failed or missing. Starting retro-synth fallback.");
                startSynthFallback();
            });
        }
    }
}

function updatePlayButtons(isPlaying) {
    if (isPlaying) {
        playerPlayBtn.querySelector('.play-svg').classList.add('hidden');
        playerPlayBtn.querySelector('.pause-svg').classList.remove('hidden');
    } else {
        playerPlayBtn.querySelector('.play-svg').classList.remove('hidden');
        playerPlayBtn.querySelector('.pause-svg').classList.add('hidden');
    }
}

function startCassetteAnimation() {
    wheelLeft.classList.add('spinning');
    wheelRight.classList.add('spinning');
}

function stopCassetteAnimation() {
    wheelLeft.classList.remove('spinning');
    wheelRight.classList.remove('spinning');
}

// Volume slider
playerVolume.addEventListener('input', (e) => {
    bgAudio.volume = e.target.value;
});

// Button click on Walkman
playerPlayBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    playBeep(600, 0.05);
    toggleAudio();
});

// ==========================================================================
// LIGHTBOX (PHOTO LIGHTBOX DIALOG)
// ==========================================================================

photos.forEach(photo => {
    photo.addEventListener('click', () => {
        if (!isLetterOpened) return;
        
        initAudioContext();
        playBeep(700, 0.05);
        
        const imgSrc = photo.querySelector('img').src;
        const captionText = photo.querySelector('.polaroid-caption').textContent;
        
        lightboxImg.src = imgSrc;
        lightboxCaption.textContent = captionText;
        lightbox.style.display = 'block';
        document.body.style.overflow = 'hidden'; // Disable page scrolling
    });
});

function closeLightbox() {
    initAudioContext();
    playBeep(600, 0.05);
    lightbox.style.display = 'none';
    document.body.style.overflow = 'auto'; // Re-enable scrolling
}

lightboxClose.addEventListener('click', closeLightbox);

// Close on clicking outside the image
lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) {
        closeLightbox();
    }
});

// Close on ESC key press
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && lightbox.style.display === 'block') {
        closeLightbox();
    }
});
