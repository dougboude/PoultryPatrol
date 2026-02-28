import * as THREE from 'three';
import AudioSystem from './audio.js';

// Initialize audio system
const audioSystem = new AudioSystem();

// Storage Manager for User Music
class StorageManager {
    constructor() {
        this.dbName = 'PoultryPatrolDB';
        this.version = 1;
        this.storeName = 'musicTracks';
        this.db = null;
        this.maxStorageSize = 52428800; // 50MB
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = () => {
                console.warn('IndexedDB unavailable, playlist will not persist');
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const objectStore = db.createObjectStore(this.storeName, { 
                        keyPath: 'id', 
                        autoIncrement: true 
                    });
                    objectStore.createIndex('filename', 'filename', { unique: false });
                    objectStore.createIndex('dateAdded', 'dateAdded', { unique: false });
                }
            };
        });
    }

    async addTrack(file) {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        // Check storage limit
        const currentSize = await this.getTotalSize();
        if (currentSize + file.size > this.maxStorageSize) {
            throw new Error('Storage limit reached (50MB). Please remove some tracks first.');
        }

        // Read file as blob
        const blob = new Blob([await file.arrayBuffer()], { type: file.type });

        const track = {
            filename: file.name,
            title: file.name.replace(/\.[^/.]+$/, ''), // Remove extension for display
            blob: blob,
            mimeType: file.type,
            size: file.size,
            dateAdded: Date.now()
        };

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const objectStore = transaction.objectStore(this.storeName);
            const request = objectStore.add(track);

            request.onsuccess = () => {
                track.id = request.result;
                resolve(track);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    async removeTrack(id) {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const objectStore = transaction.objectStore(this.storeName);
            const request = objectStore.delete(id);

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    async getAllTracks() {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const objectStore = transaction.objectStore(this.storeName);
            const request = objectStore.getAll();

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    async getTotalSize() {
        if (!this.db) {
            return 0;
        }

        try {
            const tracks = await this.getAllTracks();
            return tracks.reduce((total, track) => total + (track.size || 0), 0);
        } catch (error) {
            console.error('Error calculating storage size:', error);
            return 0;
        }
    }

    async clearAll() {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const objectStore = transaction.objectStore(this.storeName);
            const request = objectStore.clear();

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }
}

// Walkman Music System
const walkmanSystem = {
    audio: null,
    playlist: [], // Empty by default, populated from IndexedDB
    currentTrack: 0,
    mode: 'game', // 'game' or 'walkman'
    autoCloseTimer: null,
    autoCloseDelay: 10000, // 10 seconds
    isGameStarted: false, // Track game state
    storageManager: null, // Storage manager instance
    
    async init() {
        this.audio = document.getElementById('walkmanAudio');
        this.storageManager = new StorageManager();
        
        // Initialize storage and load playlist
        try {
            await this.storageManager.init();
            await this.loadPlaylistFromStorage();
        } catch (error) {
            console.warn('Storage unavailable, playlist will not persist:', error);
        }
        
        this.setupUI();
        
        // Auto-advance to next track when current one ends
        this.audio.addEventListener('ended', () => {
            if (this.mode === 'walkman' && this.playlist.length > 0) {
                this.nextTrack();
            }
        });
        
        // Cleanup object URLs on page unload
        window.addEventListener('beforeunload', () => {
            this.playlist.forEach(track => {
                if (track.objectURL) {
                    URL.revokeObjectURL(track.objectURL);
                }
            });
        });
    },
    
    async loadPlaylistFromStorage() {
        try {
            const tracks = await this.storageManager.getAllTracks();
            this.playlist = tracks.map(track => ({
                id: track.id,
                title: track.title,
                objectURL: URL.createObjectURL(track.blob)
            }));
        } catch (error) {
            console.error('Failed to load playlist:', error);
            this.playlist = [];
        }
    },
    
    setupUI() {
        const walkmanBtn = document.getElementById('walkman');
        const playlistDiv = document.getElementById('playlist');
        const managementDiv = document.getElementById('managementModal');
        const trackListDiv = document.getElementById('trackList');
        const modeButtons = document.querySelectorAll('.mode-btn');
        
        // Toggle modal visibility based on game state
        walkmanBtn.addEventListener('click', () => {
            if (this.isGameStarted) {
                // In-game: show playback modal
                playlistDiv.classList.toggle('visible');
                if (playlistDiv.classList.contains('visible')) {
                    this.startAutoCloseTimer();
                } else {
                    this.cancelAutoCloseTimer();
                }
            } else {
                // Pre-game: show management modal
                managementDiv.classList.toggle('visible');
            }
        });
        
        // Reset timer on any interaction with playback playlist
        playlistDiv.addEventListener('mouseenter', () => {
            this.cancelAutoCloseTimer();
        });
        
        playlistDiv.addEventListener('mouseleave', () => {
            if (playlistDiv.classList.contains('visible')) {
                this.startAutoCloseTimer();
            }
        });
        
        // Don't reset timer on click - let it close naturally after mouseleave
        // playlistDiv.addEventListener('click', () => {
        //     this.resetAutoCloseTimer();
        // });
        
        // Mode switching
        modeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.mode;
                this.setMode(mode);
                
                // Update button states
                modeButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
        
        // Add Music button (management modal)
        const addMusicBtn = document.getElementById('addMusicBtn');
        if (addMusicBtn) {
            addMusicBtn.addEventListener('click', () => {
                this.addMusicFiles();
            });
        }
        
        // Close management modal button
        const closeManagementBtn = document.getElementById('closeManagementBtn');
        if (closeManagementBtn) {
            closeManagementBtn.addEventListener('click', () => {
                managementDiv.classList.remove('visible');
            });
        }
        
        // Initial render
        this.renderManagementModal();
        this.renderPlaylist();
    },
    
    async addMusicFiles() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'audio/mp3,audio/mpeg,audio/mp4,audio/m4a,audio/ogg,audio/wav';
        input.multiple = true;
        
        input.addEventListener('change', async (e) => {
            const files = Array.from(e.target.files);
            
            for (const file of files) {
                // Validate file type
                const validTypes = ['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/m4a', 'audio/ogg', 'audio/wav'];
                if (!validTypes.includes(file.type) && !file.name.match(/\.(mp3|m4a|ogg|wav)$/i)) {
                    alert(`Invalid file type: ${file.name}\nSupported formats: MP3, M4A, OGG, WAV`);
                    continue;
                }
                
                // Check file size (10MB max per file)
                if (file.size > 10485760) {
                    alert(`File too large: ${file.name}\nMaximum size: 10MB`);
                    continue;
                }
                
                try {
                    // Add to storage
                    const track = await this.storageManager.addTrack(file);
                    
                    // Add to playlist
                    this.playlist.push({
                        id: track.id,
                        title: track.title,
                        objectURL: URL.createObjectURL(track.blob)
                    });
                    
                } catch (error) {
                    console.error(`Failed to add ${file.name}:`, error);
                    alert(`Failed to add ${file.name}: ${error.message}`);
                }
            }
            
            // Update UI
            this.renderManagementModal();
            this.renderPlaylist();
        });
        
        input.click();
    },
    
    async removeTrack(id) {
        try {
            // Find track in playlist
            const trackIndex = this.playlist.findIndex(t => t.id === id);
            if (trackIndex === -1) return;
            
            const track = this.playlist[trackIndex];
            
            // Revoke object URL
            if (track.objectURL) {
                URL.revokeObjectURL(track.objectURL);
            }
            
            // Remove from storage
            await this.storageManager.removeTrack(id);
            
            // Remove from playlist
            this.playlist.splice(trackIndex, 1);
            
            // Update current track if needed
            if (this.currentTrack >= this.playlist.length) {
                this.currentTrack = Math.max(0, this.playlist.length - 1);
            }
            
            // Update UI
            this.renderManagementModal();
            this.renderPlaylist();
            
        } catch (error) {
            console.error('Failed to remove track:', error);
            alert(`Failed to remove track: ${error.message}`);
        }
    },
    
    renderManagementModal() {
        const trackListDiv = document.getElementById('managementTrackList');
        const emptyDiv = document.getElementById('emptyManagementPlaylist');
        const storageDiv = document.getElementById('storageUsage');
        const trackCountDiv = document.getElementById('trackCount');
        
        if (!trackListDiv) return;
        
        // Update track count
        if (trackCountDiv) {
            trackCountDiv.textContent = `${this.playlist.length} track${this.playlist.length !== 1 ? 's' : ''}`;
        }
        
        // Update storage usage
        if (storageDiv && this.storageManager) {
            this.storageManager.getTotalSize().then(size => {
                const sizeMB = (size / 1048576).toFixed(1);
                const maxMB = (this.storageManager.maxStorageSize / 1048576).toFixed(0);
                storageDiv.textContent = `Storage: ${sizeMB} MB / ${maxMB} MB`;
            });
        }
        
        // Show/hide empty state
        if (this.playlist.length === 0) {
            if (emptyDiv) emptyDiv.style.display = 'block';
            trackListDiv.innerHTML = '';
            return;
        }
        
        if (emptyDiv) emptyDiv.style.display = 'none';
        trackListDiv.innerHTML = '';
        
        // Render tracks with delete buttons
        this.playlist.forEach((track) => {
            const trackDiv = document.createElement('div');
            trackDiv.className = 'management-track';
            
            const titleSpan = document.createElement('span');
            titleSpan.textContent = track.title;
            titleSpan.className = 'track-title';
            
            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = '×';
            deleteBtn.className = 'track-delete-btn';
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.removeTrack(track.id);
            });
            
            trackDiv.appendChild(titleSpan);
            trackDiv.appendChild(deleteBtn);
            trackListDiv.appendChild(trackDiv);
        });
    },
    
    startAutoCloseTimer() {
        this.cancelAutoCloseTimer();
        this.autoCloseTimer = setTimeout(() => {
            const playlistDiv = document.getElementById('playlist');
            playlistDiv.classList.remove('visible');
        }, this.autoCloseDelay);
    },
    
    cancelAutoCloseTimer() {
        if (this.autoCloseTimer) {
            clearTimeout(this.autoCloseTimer);
            this.autoCloseTimer = null;
        }
    },
    
    resetAutoCloseTimer() {
        const playlistDiv = document.getElementById('playlist');
        if (playlistDiv.classList.contains('visible')) {
            this.startAutoCloseTimer();
        }
    },
    
    renderPlaylist() {
        const trackListDiv = document.getElementById('trackList');
        const emptyDiv = document.getElementById('emptyPlaylist');
        
        if (!trackListDiv) return;
        
        if (this.playlist.length === 0) {
            if (emptyDiv) {
                if (this.isGameStarted) {
                    emptyDiv.textContent = 'No music added. Add tracks after this round!';
                } else {
                    emptyDiv.textContent = 'No MP3 files found. Add .mp3 files to enable playlist.';
                }
                emptyDiv.style.display = 'block';
            }
            trackListDiv.innerHTML = '';
            return;
        }
        
        if (emptyDiv) emptyDiv.style.display = 'none';
        trackListDiv.innerHTML = '';
        
        this.playlist.forEach((track, index) => {
            const trackDiv = document.createElement('div');
            trackDiv.className = 'track';
            if (index === this.currentTrack && this.mode === 'walkman') {
                trackDiv.classList.add('playing');
            }
            trackDiv.textContent = track.title;
            trackDiv.addEventListener('click', () => {
                this.playTrack(index);
            });
            trackListDiv.appendChild(trackDiv);
        });
    },
    
    setMode(mode) {
        // Don't do anything if already in this mode
        if (this.mode === mode) {
            return;
        }
        
        this.mode = mode;
        const walkmanBtn = document.getElementById('walkman');
        
        if (mode === 'walkman') {
            // Stop game music
            if (audioSystem.audioContext) {
                audioSystem.stopAllMusic();
            }
            
            // Start walkman if playlist exists
            if (this.playlist.length > 0) {
                this.playTrack(this.currentTrack);
                walkmanBtn.classList.add('playing');
            }
        } else {
            // Stop walkman
            this.audio.pause();
            walkmanBtn.classList.remove('playing');
            
            // Resume game music (only if audioSystem is initialized)
            if (audioSystem.audioContext) {
                audioSystem.playBackgroundMusic();
            }
        }
        
        this.renderPlaylist();
    },
    
    playTrack(index) {
        if (this.playlist.length === 0) return;
        
        this.currentTrack = index;
        const track = this.playlist[index];
        
        // Ensure audio is stopped and reset before playing new track
        this.audio.pause();
        this.audio.currentTime = 0;
        this.audio.src = track.objectURL;
        
        // Load the audio before playing
        this.audio.load();
        
        this.audio.play().catch(err => {
            console.error('Failed to play track:', err);
            alert('Could not play: ' + track.title);
        });
        
        this.renderPlaylist();
        
        // Update walkman icon
        const walkmanBtn = document.getElementById('walkman');
        walkmanBtn.classList.add('playing');
    },
    
    nextTrack() {
        if (this.playlist.length === 0) return;
        
        this.currentTrack = (this.currentTrack + 1) % this.playlist.length;
        this.playTrack(this.currentTrack);
    },
    
    stop() {
        this.audio.pause();
        this.audio.currentTime = 0;
        const walkmanBtn = document.getElementById('walkman');
        walkmanBtn.classList.remove('playing');
    }
};

// Game state
// Get game time from URL parameter (for testing), default to 10 minutes
const urlParams = new URLSearchParams(window.location.search);
const gameTimeMinutes = parseFloat(urlParams.get('time')) || 10;

const gameState = {
    started: false,
    gameTime: 0,
    maxGameTime: gameTimeMinutes * 60, // Convert minutes to seconds
    chickens: [],
    ducks: [],
    predators: [],
    visitor: null, // Liz the friendly neighbor
    player: null,
    escaped: 0,
    defeated: 0,
    ranAway: 0,
    killed: 0, // Birds killed by predators
    cornCharges: 5,
    cornPiles: [], // Array of {location, timer, mesh} objects
    cornParticles: [],
    // Egg collection
    inCoop: false,
    eggsAvailable: false,
    eggTimer: 60, // 1 minute until eggs available (for testing)
    eggAvailableTimer: 0, // How long eggs remain available (60 seconds)
    nestBoxes: [],
    eggsCollected: 0,
    eggBaskets: [], // Track each collection session
    // Scoring
    score: 0,
    survivalTimer: 0, // Track time for survival bonuses
    consecutiveEggCollections: 0, // Track streak for multiplier
    lastEggCollectionComplete: true, // Did we collect all eggs last time?
    gameCompleted: false // Flag to prevent multiple completion alerts
};

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB); // Sky blue
scene.fog = new THREE.Fog(0x87CEEB, 50, 200);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
sunLight.position.set(50, 50, 50);
sunLight.castShadow = true;
sunLight.shadow.camera.left = -100;
sunLight.shadow.camera.right = 100;
sunLight.shadow.camera.top = 100;
sunLight.shadow.camera.bottom = -100;
sunLight.shadow.mapSize.width = 2048;
sunLight.shadow.mapSize.height = 2048;
scene.add(sunLight);

// Create procedural grass texture
// Ground (1 acre = roughly 64m x 64m)
const groundGeometry = new THREE.PlaneGeometry(64, 64);

// Load grass texture from image file
const textureLoader = new THREE.TextureLoader();
const grassTexture = textureLoader.load(
    'assets/textures/grass.jpg',
    // Success callback
    (texture) => {
        // Grass texture loaded successfully
    },
    // Progress callback
    undefined,
    // Error callback
    (error) => {
        console.error('Error loading grass texture:', error);
        // Fallback to solid color if texture fails to load
        ground.material.color.setHex(0x3a7d44);
    }
);

grassTexture.wrapS = THREE.RepeatWrapping;
grassTexture.wrapT = THREE.RepeatWrapping;
grassTexture.repeat.set(8, 8); // Adjust this to control texture tiling

const groundMaterial = new THREE.MeshLambertMaterial({ 
    map: grassTexture
});
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Yard boundaries (visual markers)
const boundaryMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
const createBoundaryPost = (x, z) => {
    const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.2, 2, 8),
        boundaryMaterial
    );
    post.position.set(x, 1, z);
    post.castShadow = true;
    scene.add(post);
};

// Place boundary posts
for (let i = -30; i <= 30; i += 10) {
    createBoundaryPost(i, -30);
    createBoundaryPost(i, 30);
    createBoundaryPost(-30, i);
    createBoundaryPost(30, i);
}

// Create wood texture for coop
function createWoodTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    
    // Base wood color (lighter red barn wood)
    ctx.fillStyle = '#C85A54';
    ctx.fillRect(0, 0, 512, 512);
    
    // Add vertical wood planks (barn siding style)
    const plankWidth = 64;
    for (let i = 0; i < 8; i++) {
        const x = i * plankWidth;
        
        // Plank color variation
        const shade = (Math.random() - 0.5) * 30;
        ctx.fillStyle = `rgb(${200 + shade}, ${90 + shade}, ${84 + shade})`;
        ctx.fillRect(x, 0, plankWidth - 4, 512);
        
        // Plank shadow/gap
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(x + plankWidth - 4, 0, 4, 512);
        
        // Wood grain (vertical)
        for (let j = 0; j < 8; j++) {
            const grainX = x + Math.random() * (plankWidth - 4);
            ctx.strokeStyle = `rgba(0, 0, 0, ${0.15 + Math.random() * 0.1})`;
            ctx.lineWidth = 1 + Math.random();
            ctx.beginPath();
            ctx.moveTo(grainX, 0);
            ctx.lineTo(grainX + (Math.random() - 0.5) * 5, 512);
            ctx.stroke();
        }
    }
    
    // Add some knots and weathering
    for (let i = 0; i < 50; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        const size = 3 + Math.random() * 6;
        ctx.fillStyle = `rgba(80, 40, 20, ${0.3 + Math.random() * 0.2})`;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
    }
    
    return new THREE.CanvasTexture(canvas);
}

// Create dark wood texture for door
function createDoorTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    
    // Dark brown base
    ctx.fillStyle = '#3D2817';
    ctx.fillRect(0, 0, 256, 256);
    
    // Vertical planks
    const plankWidth = 32;
    for (let i = 0; i < 8; i++) {
        const x = i * plankWidth;
        
        // Plank variation
        const shade = (Math.random() - 0.5) * 20;
        ctx.fillStyle = `rgb(${61 + shade}, ${40 + shade}, ${23 + shade})`;
        ctx.fillRect(x, 0, plankWidth - 3, 256);
        
        // Plank gap
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(x + plankWidth - 3, 0, 3, 256);
        
        // Wood grain
        for (let j = 0; j < 3; j++) {
            const grainX = x + Math.random() * (plankWidth - 3);
            ctx.strokeStyle = `rgba(0, 0, 0, ${0.2 + Math.random() * 0.1})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(grainX, 0);
            ctx.lineTo(grainX + (Math.random() - 0.5) * 3, 256);
            ctx.stroke();
        }
    }
    
    // Add horizontal cross beams
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(0, 60, 256, 8);
    ctx.fillRect(0, 188, 256, 8);
    
    // Add door handle (larger and more visible)
    ctx.fillStyle = '#DAA520';
    ctx.beginPath();
    ctx.arc(200, 128, 12, 0, Math.PI * 2);
    ctx.fill();
    
    // Handle highlight
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.arc(198, 126, 6, 0, Math.PI * 2);
    ctx.fill();
    
    return new THREE.CanvasTexture(canvas);
}

// Create roof shingle texture
function createShingleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    
    // Base brown color
    ctx.fillStyle = '#654321';
    ctx.fillRect(0, 0, 256, 256);
    
    // Draw shingle pattern
    const shingleHeight = 20;
    const shingleWidth = 40;
    
    for (let row = 0; row < 15; row++) {
        const offsetX = (row % 2) * (shingleWidth / 2);
        for (let col = 0; col < 8; col++) {
            const x = col * shingleWidth + offsetX;
            const y = row * shingleHeight;
            
            // Shingle color variation
            const shade = Math.random() * 30 - 15;
            const r = Math.max(0, Math.min(255, 101 + shade));
            const g = Math.max(0, Math.min(255, 67 + shade));
            const b = Math.max(0, Math.min(255, 33 + shade));
            
            ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            ctx.fillRect(x, y, shingleWidth - 1, shingleHeight - 1);
            
            // Shingle outline
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, shingleWidth - 1, shingleHeight - 1);
        }
    }
    
    return new THREE.CanvasTexture(canvas);
}

// Create wood texture for coop
const coopGroup = new THREE.Group();
coopGroup.position.set(-26, 0, -26); // Moved to corner so nothing can get behind it

// Create textures
const woodTexture = createWoodTexture();
const doorTexture = createDoorTexture();
const shingleTexture = createShingleTexture();

// Main coop building (twice as large)
const coopWalls = new THREE.BoxGeometry(12, 8, 12);
const coopMaterial = new THREE.MeshLambertMaterial({ map: woodTexture });
const coopBody = new THREE.Mesh(coopWalls, coopMaterial);
coopBody.position.y = 4;
coopBody.castShadow = true;
coopGroup.add(coopBody);

// Roof
const roofGeometry = new THREE.ConeGeometry(9, 3, 4);
const roofMaterial = new THREE.MeshLambertMaterial({ map: shingleTexture });
const roof = new THREE.Mesh(roofGeometry, roofMaterial);
roof.position.y = 9.5;
roof.rotation.y = Math.PI / 4;
roof.castShadow = true;
coopGroup.add(roof);

// Player door (front) - darker wood to stand out
const doorGeometry = new THREE.BoxGeometry(3, 5, 0.5);
const doorMaterial = new THREE.MeshLambertMaterial({ map: doorTexture });
const door = new THREE.Mesh(doorGeometry, doorMaterial);
door.position.set(0, 2.5, 6.3);
door.castShadow = true;
coopGroup.add(door);

// Door frame to make it stand out more
const frameGeometry = new THREE.BoxGeometry(3.4, 5.4, 0.3);
const frameMaterial = new THREE.MeshLambertMaterial({ color: 0x2C1810 });
const doorFrame = new THREE.Mesh(frameGeometry, frameMaterial);
doorFrame.position.set(0, 2.5, 6.16);
coopGroup.add(doorFrame);

// Chicken ramp (side)
const rampGeometry = new THREE.BoxGeometry(2, 0.2, 4);
const rampMaterial = new THREE.MeshLambertMaterial({ color: 0xD2691E });
const ramp = new THREE.Mesh(rampGeometry, rampMaterial);
ramp.position.set(7, 1, 0);
ramp.rotation.z = -Math.PI / 6;
ramp.castShadow = true;
coopGroup.add(ramp);

// Small chicken door
const chickenDoorGeometry = new THREE.BoxGeometry(1, 1, 0.4);
const chickenDoor = new THREE.Mesh(chickenDoorGeometry, doorMaterial);
chickenDoor.position.set(6.2, 2, 0);
coopGroup.add(chickenDoor);

// Glow effect (hidden by default)
const glowGeometry = new THREE.SphereGeometry(10, 16, 16);
const glowMaterial = new THREE.MeshBasicMaterial({ 
    color: 0xFFD700, 
    transparent: true, 
    opacity: 0.2,
    side: THREE.BackSide
});
const coopGlow = new THREE.Mesh(glowGeometry, glowMaterial);
coopGlow.position.y = 4;
coopGlow.visible = false;
coopGroup.add(coopGlow);
gameState.coopGlow = coopGlow;

scene.add(coopGroup);
gameState.coopPosition = coopGroup.position;

// Duck pond
const pondGeometry = new THREE.CircleGeometry(5, 32);
const waterTexture = textureLoader.load('assets/textures/water.jpg');
waterTexture.wrapS = THREE.RepeatWrapping;
waterTexture.wrapT = THREE.RepeatWrapping;
waterTexture.repeat.set(2, 2);
const pondMaterial = new THREE.MeshLambertMaterial({ map: waterTexture });
const pond = new THREE.Mesh(pondGeometry, pondMaterial);
pond.rotation.x = -Math.PI / 2;
pond.position.set(10, 0.05, 10);
pond.receiveShadow = true;
scene.add(pond);

// Pond edge (decorative)
const pondEdgeGeometry = new THREE.RingGeometry(5, 5.3, 32);
const pondEdgeMaterial = new THREE.MeshLambertMaterial({ color: 0x8B7355 });
const pondEdge = new THREE.Mesh(pondEdgeGeometry, pondEdgeMaterial);
pondEdge.rotation.x = -Math.PI / 2;
pondEdge.position.set(10, 0.06, 10);
scene.add(pondEdge);

// Create interior wall texture (lighter wood planks)
function createInteriorWallTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    
    // Base light wood color
    ctx.fillStyle = '#E8D4B8';
    ctx.fillRect(0, 0, 512, 512);
    
    // Horizontal planks
    const plankHeight = 64;
    for (let i = 0; i < 8; i++) {
        const y = i * plankHeight;
        
        // Plank color variation
        const shade = (Math.random() - 0.5) * 20;
        ctx.fillStyle = `rgb(${232 + shade}, ${212 + shade}, ${184 + shade})`;
        ctx.fillRect(0, y, 512, plankHeight - 3);
        
        // Plank gap
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(0, y + plankHeight - 3, 512, 3);
        
        // Wood grain
        for (let j = 0; j < 6; j++) {
            const grainY = y + Math.random() * plankHeight;
            ctx.strokeStyle = `rgba(139, 90, 43, ${0.1 + Math.random() * 0.1})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, grainY);
            ctx.lineTo(512, grainY + (Math.random() - 0.5) * 8);
            ctx.stroke();
        }
    }
    
    return new THREE.CanvasTexture(canvas);
}

// Create nest box texture (straw-filled)
function createNestBoxTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    
    // Dark wood base
    ctx.fillStyle = '#654321';
    ctx.fillRect(0, 0, 128, 128);
    
    // Add straw texture
    for (let i = 0; i < 200; i++) {
        const x = Math.random() * 128;
        const y = Math.random() * 128;
        const length = 10 + Math.random() * 20;
        const angle = Math.random() * Math.PI * 2;
        
        ctx.strokeStyle = `rgba(${218 + Math.random() * 20}, ${165 + Math.random() * 20}, ${32 + Math.random() * 20}, ${0.6 + Math.random() * 0.4})`;
        ctx.lineWidth = 1 + Math.random();
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
        ctx.stroke();
    }
    
    return new THREE.CanvasTexture(canvas);
}

// Create floor texture (dirt and straw)
function createCoopFloorTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    
    // Base dirt color
    ctx.fillStyle = '#8B7355';
    ctx.fillRect(0, 0, 512, 512);
    
    // Add dirt variation
    for (let i = 0; i < 500; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        const size = 2 + Math.random() * 8;
        const shade = (Math.random() - 0.5) * 40;
        ctx.fillStyle = `rgba(${139 + shade}, ${115 + shade}, ${85 + shade}, ${0.3 + Math.random() * 0.4})`;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // Add scattered straw
    for (let i = 0; i < 300; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        const length = 5 + Math.random() * 15;
        const angle = Math.random() * Math.PI * 2;
        
        ctx.strokeStyle = `rgba(218, 165, 32, ${0.4 + Math.random() * 0.3})`;
        ctx.lineWidth = 1 + Math.random();
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
        ctx.stroke();
    }
    
    return new THREE.CanvasTexture(canvas);
}

// Create roost texture (worn wood)
function createRoostTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    
    // Base wood color
    ctx.fillStyle = '#8B6914';
    ctx.fillRect(0, 0, 256, 64);
    
    // Wood grain
    for (let i = 0; i < 20; i++) {
        const x = Math.random() * 256;
        ctx.strokeStyle = `rgba(0, 0, 0, ${0.1 + Math.random() * 0.15})`;
        ctx.lineWidth = 1 + Math.random();
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + (Math.random() - 0.5) * 10, 64);
        ctx.stroke();
    }
    
    // Worn spots (from chicken feet)
    for (let i = 0; i < 15; i++) {
        const x = Math.random() * 256;
        const y = Math.random() * 64;
        ctx.fillStyle = `rgba(139, 105, 20, ${0.5 + Math.random() * 0.3})`;
        ctx.beginPath();
        ctx.arc(x, y, 3 + Math.random() * 4, 0, Math.PI * 2);
        ctx.fill();
    }
    
    return new THREE.CanvasTexture(canvas);
}

// Coop interior (separate scene, not added to main scene yet)
const coopInterior = new THREE.Group();
coopInterior.visible = false;

// Create interior textures
const interiorWallTexture = createInteriorWallTexture();
const nestBoxTexture = createNestBoxTexture();
const coopFloorTexture = createCoopFloorTexture();
const roostTexture = createRoostTexture();

// Interior walls
const interiorWallMaterial = new THREE.MeshLambertMaterial({ map: interiorWallTexture });

// Back wall with nest boxes
const backWall = new THREE.Mesh(
    new THREE.BoxGeometry(11.6, 7.6, 0.4),
    interiorWallMaterial
);
backWall.position.set(0, 3.8, -5.8);
backWall.receiveShadow = true;
coopInterior.add(backWall);

// Front wall (with door opening)
const frontWallLeft = new THREE.Mesh(
    new THREE.BoxGeometry(4.3, 7.6, 0.4),
    interiorWallMaterial
);
frontWallLeft.position.set(-3.85, 3.8, 5.8);
frontWallLeft.receiveShadow = true;
coopInterior.add(frontWallLeft);

const frontWallRight = new THREE.Mesh(
    new THREE.BoxGeometry(4.3, 7.6, 0.4),
    interiorWallMaterial
);
frontWallRight.position.set(3.85, 3.8, 5.8);
frontWallRight.receiveShadow = true;
coopInterior.add(frontWallRight);

const frontWallTop = new THREE.Mesh(
    new THREE.BoxGeometry(3, 2.6, 0.4),
    interiorWallMaterial
);
frontWallTop.position.set(0, 6.3, 5.8);
frontWallTop.receiveShadow = true;
coopInterior.add(frontWallTop);

// Interior side of door
const interiorDoor = new THREE.Mesh(
    new THREE.BoxGeometry(3, 5, 0.3),
    new THREE.MeshLambertMaterial({ map: doorTexture })
);
interiorDoor.position.set(0, 2.5, 5.7);
coopInterior.add(interiorDoor);

// Side walls
const leftWall = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 7.6, 11.6),
    interiorWallMaterial
);
leftWall.position.set(-5.8, 3.8, 0);
leftWall.receiveShadow = true;
coopInterior.add(leftWall);

const rightWall = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 7.6, 11.6),
    interiorWallMaterial
);
rightWall.position.set(5.8, 3.8, 0);
rightWall.receiveShadow = true;
coopInterior.add(rightWall);

// Create 8 nest boxes on back wall
const nestBoxMaterial = new THREE.MeshLambertMaterial({ map: nestBoxTexture });
for (let i = 0; i < 8; i++) {
    const row = Math.floor(i / 4);
    const col = i % 4;
    
    const nestBox = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 1, 0.8),
        nestBoxMaterial
    );
    nestBox.position.set(
        -3.6 + col * 2.4,
        3 + row * 1.4,
        -5
    );
    nestBox.castShadow = true;
    coopInterior.add(nestBox);
    
    // Egg in nest box
    const eggGeometry = new THREE.SphereGeometry(0.24, 8, 8);
    const eggMaterial = new THREE.MeshLambertMaterial({ color: 0xFFFAF0 });
    const egg = new THREE.Mesh(eggGeometry, eggMaterial);
    egg.position.copy(nestBox.position);
    egg.position.z += 0.2;
    egg.scale.set(1, 1.2, 1);
    egg.visible = false;
    egg.castShadow = true;
    coopInterior.add(egg);
    
    gameState.nestBoxes.push({ box: nestBox, egg: egg, collected: false });
}

// Roost in corner
const roostMaterial = new THREE.MeshLambertMaterial({ map: roostTexture });
const roostPole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.2, 6, 8),
    roostMaterial
);
roostPole.position.set(-5, 3, 4);
roostPole.rotation.z = Math.PI / 6;
roostPole.castShadow = true;
coopInterior.add(roostPole);

// Roost rungs
for (let i = 0; i < 4; i++) {
    const rung = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.16, 2, 8),
        roostMaterial
    );
    rung.position.set(-4.4 + i * 0.6, 1 + i * 1.2, 4);
    rung.rotation.z = Math.PI / 2;
    rung.castShadow = true;
    coopInterior.add(rung);
}

// Interior floor
const interiorFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(11.6, 11.6),
    new THREE.MeshLambertMaterial({ map: coopFloorTexture })
);
interiorFloor.rotation.x = -Math.PI / 2;
interiorFloor.receiveShadow = true;
coopInterior.add(interiorFloor);

scene.add(coopInterior);
gameState.coopInterior = coopInterior;

// Create player hands and basket for first-person view
const playerHands = new THREE.Group();
playerHands.visible = false;

// Left hand with basket
const basketGeometry = new THREE.CylinderGeometry(0.3, 0.25, 0.3, 8);
const basketMaterial = new THREE.MeshLambertMaterial({ color: 0xD2691E });
const basket = new THREE.Mesh(basketGeometry, basketMaterial);
basket.position.set(-0.4, -0.5, -0.8);
basket.rotation.x = 0.2;
playerHands.add(basket);

// Basket handle
const handleGeometry = new THREE.TorusGeometry(0.25, 0.03, 8, 16, Math.PI);
const handle = new THREE.Mesh(handleGeometry, basketMaterial);
handle.position.set(-0.4, -0.35, -0.8);
handle.rotation.x = Math.PI / 2;
playerHands.add(handle);

// Right hand (reaching hand)
const handGeometry = new THREE.SphereGeometry(0.08, 8, 8);
const skinMaterial = new THREE.MeshLambertMaterial({ color: 0xFFDBAC });
const rightHand = new THREE.Mesh(handGeometry, skinMaterial);
rightHand.position.set(0.3, -0.4, -0.6);
playerHands.add(rightHand);

// Right arm
const armGeometry = new THREE.CylinderGeometry(0.05, 0.06, 0.4, 8);
const arm = new THREE.Mesh(armGeometry, skinMaterial);
arm.position.set(0.3, -0.6, -0.5);
arm.rotation.z = 0.2;
playerHands.add(arm);

camera.add(playerHands);
gameState.playerHands = playerHands;

// Player
class Player {
    constructor() {
        // Create a group to hold all player parts
        this.mesh = new THREE.Group();
        this.mesh.position.set(0, 0, 0);
        
        // Legs
        const legGeometry = new THREE.CylinderGeometry(0.27, 0.27, 1.8, 8);
        const skinMaterial = new THREE.MeshLambertMaterial({ color: 0xFFDBAC });
        const pantsMaterial = new THREE.MeshLambertMaterial({ 
            map: pantsTexture,
            color: pantsTexture ? 0xFFFFFF : 0x2C5F2D // White if texture loaded, green if not
        });
        
        const leftLeg = new THREE.Mesh(legGeometry, pantsMaterial);
        leftLeg.position.set(-0.36, 0.9, 0);
        leftLeg.castShadow = true;
        this.mesh.add(leftLeg);
        
        const rightLeg = new THREE.Mesh(legGeometry, pantsMaterial);
        rightLeg.position.set(0.36, 0.9, 0);
        rightLeg.castShadow = true;
        this.mesh.add(rightLeg);
        
        // Feet (shoes)
        const footGeometry = new THREE.BoxGeometry(0.35, 0.25, 0.6);
        const shoeMaterial = new THREE.MeshLambertMaterial({ color: 0x654321 }); // Brown shoes
        
        const leftFoot = new THREE.Mesh(footGeometry, shoeMaterial);
        leftFoot.position.set(-0.36, 0.125, 0.15);
        leftFoot.castShadow = true;
        this.mesh.add(leftFoot);
        
        const rightFoot = new THREE.Mesh(footGeometry, shoeMaterial);
        rightFoot.position.set(0.36, 0.125, 0.15);
        rightFoot.castShadow = true;
        this.mesh.add(rightFoot);
        
        // Torso
        const torsoGeometry = new THREE.BoxGeometry(1.08, 1.44, 0.54);
        const shirtMaterial = new THREE.MeshLambertMaterial({ 
            map: sweaterTexture,
            color: sweaterTexture ? 0xFFFFFF : 0xFF6347 // White if texture loaded, red if not
        });
        const torso = new THREE.Mesh(torsoGeometry, shirtMaterial);
        torso.position.set(0, 2.52, 0);
        torso.castShadow = true;
        this.mesh.add(torso);
        
        // Head (larger)
        const headGeometry = new THREE.SphereGeometry(0.55, 8, 8);
        const head = new THREE.Mesh(headGeometry, skinMaterial);
        head.position.set(0, 3.79, 0);
        head.castShadow = true;
        this.mesh.add(head);
        
        // Eyes
        const eyeGeometry = new THREE.SphereGeometry(0.07, 8, 8);
        const eyeMaterial = new THREE.MeshLambertMaterial({ color: 0x000000 });
        
        const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        leftEye.position.set(-0.18, 3.9, 0.48);
        this.mesh.add(leftEye);
        
        const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        rightEye.position.set(0.18, 3.9, 0.48);
        this.mesh.add(rightEye);
        
        // Nose
        const noseGeometry = new THREE.ConeGeometry(0.07, 0.18, 8);
        const nose = new THREE.Mesh(noseGeometry, skinMaterial);
        nose.position.set(0, 3.73, 0.54);
        nose.rotation.x = Math.PI / 2;
        this.mesh.add(nose);
        
        // Mustache
        const mustacheGeometry = new THREE.BoxGeometry(0.42, 0.05, 0.1);
        const mustacheMaterial = new THREE.MeshLambertMaterial({ color: 0x3D2817 });
        const mustache = new THREE.Mesh(mustacheGeometry, mustacheMaterial);
        mustache.position.set(0, 3.65, 0.52);
        this.mesh.add(mustache);
        
        // Mustache curls at the ends
        const curlGeometry = new THREE.SphereGeometry(0.05, 8, 8);
        
        const leftCurl = new THREE.Mesh(curlGeometry, mustacheMaterial);
        leftCurl.position.set(-0.23, 3.65, 0.52);
        leftCurl.scale.set(1.2, 1, 1);
        this.mesh.add(leftCurl);
        
        const rightCurl = new THREE.Mesh(curlGeometry, mustacheMaterial);
        rightCurl.position.set(0.23, 3.65, 0.52);
        rightCurl.scale.set(1.2, 1, 1);
        this.mesh.add(rightCurl);
        
        // Hair
        const hairGeometry = new THREE.SphereGeometry(0.6, 8, 8);
        const hairMaterial = new THREE.MeshLambertMaterial({ 
            map: hairTexture,
            color: hairTexture ? 0xFFFFFF : 0x3D2817 // White if texture loaded, brown if not
        });
        const hair = new THREE.Mesh(hairGeometry, hairMaterial);
        hair.position.set(0, 3.98, -0.05);
        hair.scale.set(1, 0.65, 1);
        hair.castShadow = true;
        this.mesh.add(hair);
        
        // Headphones
        const headphoneMaterial = new THREE.MeshLambertMaterial({ color: 0x000000 }); // Black headphones
        
        // Headband (arcing over the top of head, connecting to ear cups)
        const headbandGeometry = new THREE.TorusGeometry(0.5, 0.05, 8, 16, Math.PI);
        const headband = new THREE.Mesh(headbandGeometry, headphoneMaterial);
        headband.position.set(0, 4.2, 0);
        headband.rotation.z = 0; // No rotation - arc goes up
        headband.castShadow = true;
        this.mesh.add(headband);
        
        // Left ear cup
        const earCupGeometry = new THREE.CylinderGeometry(0.18, 0.18, 0.12, 16);
        const leftEarCup = new THREE.Mesh(earCupGeometry, headphoneMaterial);
        leftEarCup.position.set(-0.5, 3.79, 0);
        leftEarCup.rotation.z = Math.PI / 2;
        leftEarCup.castShadow = true;
        this.mesh.add(leftEarCup);
        
        // Left ear cup padding (inner)
        const paddingMaterial = new THREE.MeshLambertMaterial({ color: 0x333333 });
        const paddingGeometry = new THREE.CylinderGeometry(0.14, 0.14, 0.08, 16);
        const leftPadding = new THREE.Mesh(paddingGeometry, paddingMaterial);
        leftPadding.position.set(-0.56, 3.79, 0);
        leftPadding.rotation.z = Math.PI / 2;
        this.mesh.add(leftPadding);
        
        // Right ear cup
        const rightEarCup = new THREE.Mesh(earCupGeometry, headphoneMaterial);
        rightEarCup.position.set(0.5, 3.79, 0);
        rightEarCup.rotation.z = Math.PI / 2;
        rightEarCup.castShadow = true;
        this.mesh.add(rightEarCup);
        
        // Right ear cup padding (inner)
        const rightPadding = new THREE.Mesh(paddingGeometry, paddingMaterial);
        rightPadding.position.set(0.56, 3.79, 0);
        rightPadding.rotation.z = Math.PI / 2;
        this.mesh.add(rightPadding);
        
        // Arms
        const armGeometry = new THREE.CylinderGeometry(0.18, 0.18, 1.26, 8);
        
        // Left arm - hanging down at side (connected at shoulder)
        const leftArm = new THREE.Mesh(armGeometry, shirtMaterial);
        leftArm.position.set(-0.72, 2.52, 0); // Same y as torso center
        leftArm.rotation.z = 0;
        leftArm.castShadow = true;
        this.mesh.add(leftArm);
        
        // Right arm - raised up to hold crook (connected at shoulder)
        const rightArm = new THREE.Mesh(armGeometry, shirtMaterial);
        rightArm.position.set(0.72, 2.52, 0); // Same y as torso center
        rightArm.rotation.z = -0.8;
        rightArm.castShadow = true;
        this.mesh.add(rightArm);
        
        // Hands
        const handGeometry = new THREE.SphereGeometry(0.2, 8, 8);
        
        // Left hand - at bottom of left arm (hanging down)
        const leftHand = new THREE.Mesh(handGeometry, skinMaterial);
        leftHand.position.set(-0.72, 1.89, 0); // 0.63 below arm center (half arm length)
        leftHand.castShadow = true;
        this.mesh.add(leftHand);
        this.leftHand = leftHand; // Store reference for animation
        
        // Right hand - at end of raised arm (holding crook)
        const rightHand = new THREE.Mesh(handGeometry, skinMaterial);
        // Arm rotated -0.8 rad, so calculate end position
        rightHand.position.set(1.15, 3.05, 0);
        rightHand.castShadow = true;
        this.mesh.add(rightHand);
        
        // Shepherd's crook
        const crookMaterial = new THREE.MeshLambertMaterial({ 
            map: staffTexture,
            color: staffTexture ? 0xFFFFFF : 0x8B4513 // White if texture loaded, brown if not
        });
        
        // Staff (long pole) - positioned in the right hand
        const staffGeometry = new THREE.CylinderGeometry(0.09, 0.09, 4.5, 8);
        this.staff = new THREE.Mesh(staffGeometry, crookMaterial);
        this.staff.position.set(1.15, 2.8, 0);
        this.staff.castShadow = true;
        this.mesh.add(this.staff);
        
        // Hook at top
        const hookCurve = new THREE.TorusGeometry(0.36, 0.072, 8, 16, Math.PI);
        this.hook = new THREE.Mesh(hookCurve, crookMaterial);
        this.hook.position.set(1.15, 5.05, 0);
        this.hook.rotation.x = Math.PI / 2;
        this.hook.castShadow = true;
        this.mesh.add(this.hook);
        
        scene.add(this.mesh);
        
        this.velocity = new THREE.Vector3();
        this.speed = 8;
        this.direction = new THREE.Vector3();
        
        // Staff swing animation properties
        this.isSwinging = false;
        this.swingProgress = 0;
        this.swingSpeed = 8; // How fast the swing animation plays
        
        // Corn throw animation properties
        this.isThrowingCorn = false;
        this.throwProgress = 0;
        this.throwSpeed = 6; // How fast the throw animation plays
    }
    
    updateStaffSwing(delta) {
        if (this.isSwinging) {
            this.swingProgress += delta * this.swingSpeed;
            
            if (this.swingProgress <= 1) {
                // Swing down (0 to 1)
                const angle = this.swingProgress * Math.PI / 2; // 0 to 90 degrees
                this.staff.rotation.x = angle;
                this.hook.rotation.x = Math.PI / 2 + angle;
            } else if (this.swingProgress <= 2) {
                // Swing back up (1 to 2)
                const angle = (2 - this.swingProgress) * Math.PI / 2; // 90 to 0 degrees
                this.staff.rotation.x = angle;
                this.hook.rotation.x = Math.PI / 2 + angle;
            } else {
                // Animation complete
                this.isSwinging = false;
                this.swingProgress = 0;
                this.staff.rotation.x = 0;
                this.hook.rotation.x = Math.PI / 2;
            }
        }
    }
    
    updateCornThrow(delta) {
        if (this.isThrowingCorn) {
            this.throwProgress += delta * this.throwSpeed;
            
            if (this.throwProgress <= 1) {
                // Hand moves forward and down (0 to 1)
                const progress = this.throwProgress;
                this.leftHand.position.set(
                    -0.72 + progress * 0.5, // Move forward
                    1.89 - progress * 0.3,  // Move down slightly
                    progress * 0.8          // Move out in front
                );
            } else if (this.throwProgress <= 2) {
                // Hand returns to original position (1 to 2)
                const progress = 2 - this.throwProgress;
                this.leftHand.position.set(
                    -0.72 + progress * 0.5,
                    1.89 - progress * 0.3,
                    progress * 0.8
                );
            } else {
                // Animation complete
                this.isThrowingCorn = false;
                this.throwProgress = 0;
                this.leftHand.position.set(-0.72, 1.89, 0);
            }
        }
    }
    
    swingStaff() {
        if (!this.isSwinging) {
            this.isSwinging = true;
            this.swingProgress = 0;
        }
    }
    
    throwCorn() {
        if (gameState.cornCharges > 0) {
            gameState.cornCharges--;
            const cornLocation = this.mesh.position.clone();
            
            // Trigger throw animation
            if (!this.isThrowingCorn) {
                this.isThrowingCorn = true;
                this.throwProgress = 0;
            }
            
            // Play sound effect
            audioSystem.playCornThrow();
            
            // Create visual corn pile (bigger)
            const cornGeometry = new THREE.SphereGeometry(0.5, 12, 12);
            const cornMaterial = new THREE.MeshLambertMaterial({ 
                map: cornTexture,
                color: cornTexture ? 0xFFFFFF : 0xFFD700
            });
            const cornPile = new THREE.Mesh(cornGeometry, cornMaterial);
            cornPile.position.copy(cornLocation);
            cornPile.position.y = 0.3;
            cornPile.scale.set(1, 0.8, 1); // Slightly flattened pile
            scene.add(cornPile);
            
            // Add to corn piles array
            gameState.cornPiles.push({
                location: cornLocation,
                timer: 13, // Corn lasts 13 seconds
                mesh: cornPile
            });
            
            // Add some particle effect
            for (let i = 0; i < 20; i++) {
                const particle = new THREE.Mesh(
                    new THREE.SphereGeometry(0.05, 4, 4),
                    cornMaterial
                );
                particle.position.copy(cornLocation);
                particle.position.y = 0.5;
                particle.velocity = new THREE.Vector3(
                    (Math.random() - 0.5) * 2,
                    Math.random() * 2,
                    (Math.random() - 0.5) * 2
                );
                scene.add(particle);
                gameState.cornParticles.push({ mesh: particle, life: 1 });
            }
            
            // Store reference to remove later
            gameState.cornPileMesh = cornPile;
        }
    }
    
    update(delta, keys) {
        this.direction.set(0, 0, 0);
        
        if (keys['w']) this.direction.z -= 1;
        if (keys['s']) this.direction.z += 1;
        if (keys['a']) this.direction.x -= 1;
        if (keys['d']) this.direction.x += 1;
        
        if (this.direction.length() > 0) {
            this.direction.normalize();
            this.velocity.x = this.direction.x * this.speed;
            this.velocity.z = this.direction.z * this.speed;
            
            // Rotate player to face movement direction
            const targetAngle = Math.atan2(this.direction.x, this.direction.z);
            this.mesh.rotation.y = targetAngle;
        } else {
            this.velocity.x *= 0.9;
            this.velocity.z *= 0.9;
        }
        
        this.mesh.position.x += this.velocity.x * delta;
        this.mesh.position.z += this.velocity.z * delta;
        
        // Check coop collision (player can't walk through it)
        if (collidesWithCoop(this.mesh.position.x, this.mesh.position.z)) {
            // Push player away from coop
            const awayFromCoop = new THREE.Vector3()
                .subVectors(this.mesh.position, gameState.coopPosition)
                .normalize();
            this.mesh.position.x += awayFromCoop.x * 0.5;
            this.mesh.position.z += awayFromCoop.z * 0.5;
        }
        
        // Keep player in bounds
        this.mesh.position.x = Math.max(-30, Math.min(30, this.mesh.position.x));
        this.mesh.position.z = Math.max(-30, Math.min(30, this.mesh.position.z));
    }
}

// Load feather textures from images
let chickenFeatherTexture = null;
let duckFeatherTexture = null;

textureLoader.load('assets/textures/chicken-feathers.jpg', 
    (texture) => { chickenFeatherTexture = texture; },
    undefined,
    (error) => { console.error('Chicken texture failed to load:', error); }
);

textureLoader.load('assets/textures/duck-feathers.jpg', 
    (texture) => { duckFeatherTexture = texture; },
    undefined,
    (error) => { console.error('Duck texture failed to load:', error); }
);

// Load sweater texture for player
let sweaterTexture = null;
textureLoader.load('assets/textures/sweater.jpg',
    (texture) => { sweaterTexture = texture; },
    undefined,
    (error) => { /* Sweater texture failed to load, using solid color */ }
);

// Load pants texture for player
let pantsTexture = null;
textureLoader.load('assets/textures/pants.jpg',
    (texture) => { pantsTexture = texture; },
    undefined,
    (error) => { /* Pants texture failed to load, using solid color */ }
);

// Load staff texture for player
let staffTexture = null;
textureLoader.load('assets/textures/staff.jpg',
    (texture) => { staffTexture = texture; },
    undefined,
    (error) => { /* Staff texture failed to load, using solid color */ }
);

// Load hair texture for player
let hairTexture = null;
textureLoader.load('assets/textures/hair.jpg',
    (texture) => { hairTexture = texture; },
    undefined,
    (error) => { /* Hair texture failed to load, using solid color */ }
);

// Load dog hair texture
let dogHairTexture = null;
textureLoader.load('assets/textures/doghair.jpg',
    (texture) => { dogHairTexture = texture; },
    undefined,
    (error) => { /* Dog hair texture failed to load, using solid color */ }
);

// Load hawk feather texture
let hawkFeatherTexture = null;
textureLoader.load('assets/textures/hawk-feathers.jpg',
    (texture) => { hawkFeatherTexture = texture; },
    undefined,
    (error) => { /* Hawk feather texture failed to load, using solid color */ }
);

// Load corn texture
let cornTexture = null;
textureLoader.load('assets/textures/corn.jpg',
    (texture) => { cornTexture = texture; },
    undefined,
    (error) => { /* Corn texture failed to load, using solid color */ }
);

// Bird class (chickens and ducks)
class Bird {
    constructor(type, startX, startZ) {
        this.type = type;
        const featherTexture = type === 'chicken' ? chickenFeatherTexture : duckFeatherTexture;
        
        // Simple bird shape with feather texture (50% larger)
        const bodyGeometry = new THREE.SphereGeometry(0.45, 16, 16);
        const bodyMaterial = new THREE.MeshLambertMaterial({ map: featherTexture });
        this.mesh = new THREE.Mesh(bodyGeometry, bodyMaterial);
        this.mesh.castShadow = true;
        
        // Head with feather texture
        const headGeometry = new THREE.SphereGeometry(0.225, 16, 16);
        const head = new THREE.Mesh(headGeometry, bodyMaterial);
        head.position.set(0, 0.45, 0.3);
        this.mesh.add(head);
        this.head = head;
        
        // Eyes
        const eyeGeometry = new THREE.SphereGeometry(0.05, 8, 8);
        const eyeMaterial = new THREE.MeshLambertMaterial({ color: 0x000000 });
        
        const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        leftEye.position.set(-0.12, 0.525, 0.42);
        this.mesh.add(leftEye);
        
        const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        rightEye.position.set(0.12, 0.525, 0.42);
        this.mesh.add(rightEye);
        
        // Beak/Bill - more prominent and properly positioned
        if (type === 'chicken') {
            // Chicken beak - pointed cone, larger and brighter
            const beakGeometry = new THREE.ConeGeometry(0.08, 0.25, 8);
            const beakMaterial = new THREE.MeshLambertMaterial({ color: 0xFFAA00 });
            const beak = new THREE.Mesh(beakGeometry, beakMaterial);
            beak.position.set(0, 0.48, 0.52);
            beak.rotation.x = Math.PI / 2;
            this.mesh.add(beak);
            this.beak = beak;
        } else {
            // Duck bill - flatter and wider
            const billGeometry = new THREE.BoxGeometry(0.15, 0.08, 0.2);
            const billMaterial = new THREE.MeshLambertMaterial({ color: 0xFF8C00 });
            const bill = new THREE.Mesh(billGeometry, billMaterial);
            bill.position.set(0, 0.42, 0.48);
            this.mesh.add(bill);
            this.beak = bill;
        }
        
        // Comb (chickens only - red crest on head) - larger and more prominent
        if (type === 'chicken') {
            const combGeometry = new THREE.SphereGeometry(0.13, 8, 8);
            const combMaterial = new THREE.MeshLambertMaterial({ color: 0xFF0000 });
            const comb = new THREE.Mesh(combGeometry, combMaterial);
            comb.position.set(0, 0.68, 0.25);
            comb.scale.set(0.9, 1.6, 0.6);
            this.mesh.add(comb);
            
            // Wattles (red things under chin) - larger and more visible
            const wattleGeometry = new THREE.SphereGeometry(0.08, 8, 8);
            const wattleMaterial = new THREE.MeshLambertMaterial({ color: 0xFF0000 });
            
            const leftWattle = new THREE.Mesh(wattleGeometry, wattleMaterial);
            leftWattle.position.set(-0.08, 0.35, 0.45);
            leftWattle.scale.set(0.8, 1.5, 0.7);
            this.mesh.add(leftWattle);
            
            const rightWattle = new THREE.Mesh(wattleGeometry, wattleMaterial);
            rightWattle.position.set(0.08, 0.35, 0.45);
            rightWattle.scale.set(0.8, 1.5, 0.7);
            this.mesh.add(rightWattle);
        }
        
        // Wings (store references for animation) with feather texture
        const wingGeometry = new THREE.BoxGeometry(0.225, 0.075, 0.375);
        const leftWing = new THREE.Mesh(wingGeometry, bodyMaterial);
        leftWing.position.set(-0.375, 0.15, 0);
        this.mesh.add(leftWing);
        this.leftWing = leftWing;
        
        const rightWing = new THREE.Mesh(wingGeometry, bodyMaterial);
        rightWing.position.set(0.375, 0.15, 0);
        this.mesh.add(rightWing);
        this.rightWing = rightWing;
        
        this.mesh.position.set(startX, 0.45, startZ);
        scene.add(this.mesh);
        
        this.velocity = new THREE.Vector3();
        this.speed = 2;
        this.wanderAngle = Math.random() * Math.PI * 2;
        this.wanderTimer = 0;
        this.scared = false;
        this.scaredTimer = 0;
        this.inBounds = true;
        this.outOfBoundsTimer = 0; // Grace period before counting as escaped
        this.hasEscaped = false; // Track if this bird has been counted as escaped
        this.captured = false; // Being carried by predator
        this.killed = false; // Killed by predator
        this.onVisitorHead = false; // Sitting on Liz's head
        this.headOffset = new THREE.Vector3(); // Offset when on head
        this.attractedToVisitor = false; // Being attracted to visitor
        
        // Animation state
        this.flapTimer = Math.random() * 3;
        this.isFlapping = false;
        this.flapDuration = 0;
        this.peckTimer = Math.random() * 5;
        this.isPecking = false;
        this.peckDuration = 0;
        
        // Coop visiting (only chickens lay eggs)
        this.visitCoopTimer = this.type === 'chicken' ? 30 + Math.random() * 60 : 999999;
        this.visitingCoop = false;
        this.coopVisitState = 'idle'; // idle, walking, inside, returning
    }
    
    update(delta, player, predators) {
        // Skip normal behavior if on visitor's head
        if (this.onVisitorHead) {
            // Just do wing flapping animation
            if (this.isFlapping) {
                this.flapDuration -= delta;
                const flapSpeed = 20;
                const flapAngle = Math.sin(this.flapDuration * flapSpeed) * 0.5;
                this.leftWing.rotation.z = flapAngle;
                this.rightWing.rotation.z = -flapAngle;
                
                if (this.flapDuration <= 0) {
                    this.isFlapping = false;
                    this.leftWing.rotation.z = 0;
                    this.rightWing.rotation.z = 0;
                }
            }
            return false; // Don't remove bird
        }
        
        // Check if scared by predators
        this.scared = false;
        for (const predator of predators) {
            const dist = this.mesh.position.distanceTo(predator.mesh.position);
            if (dist < 8) {
                this.scared = true;
                this.scaredTimer = 2;
                // Run away from predator
                const away = new THREE.Vector3()
                    .subVectors(this.mesh.position, predator.mesh.position)
                    .normalize();
                this.velocity.copy(away).multiplyScalar(this.speed * 2);
                break;
            }
        }
        
        // Check if scared by player (when space is pressed)
        if (player && keys[' ']) {
            const dist = this.mesh.position.distanceTo(player.mesh.position);
            if (dist < 3) {
                const away = new THREE.Vector3()
                    .subVectors(this.mesh.position, player.mesh.position)
                    .normalize();
                this.velocity.copy(away).multiplyScalar(this.speed * 1.5);
                this.scaredTimer = 1;
                
                // Play sound when herded by player
                if (this.type === 'chicken') {
                    audioSystem.playChickenSquawk();
                } else {
                    audioSystem.playDuckQuack();
                }
            }
        }
        
        // Check for visitor attraction - takes priority over corn but not danger
        let attractedToVisitor = this.attractedToVisitor && gameState.visitor && gameState.visitor.state === 'sitting';
        
        // Check for corn - overrides everything except immediate danger and visitor
        let nearestCorn = null;
        let nearestCornDist = Infinity;
        
        if (!this.scared && !attractedToVisitor && gameState.cornPiles.length > 0) {
            // Find nearest corn pile
            for (const pile of gameState.cornPiles) {
                const dist = this.mesh.position.distanceTo(pile.location);
                if (dist < nearestCornDist) {
                    nearestCornDist = dist;
                    nearestCorn = pile;
                }
            }
        }
        
        if (this.scaredTimer > 0) {
            this.scaredTimer -= delta;
        } else if (attractedToVisitor) {
            // Visitor attraction is handled by the Visitor class
            // Don't override the velocity here
        } else if (nearestCorn) {
            // Run to nearest corn location
            const distToCorn = this.mesh.position.distanceTo(nearestCorn.location);
            if (distToCorn > 1) {
                const toCorn = new THREE.Vector3()
                    .subVectors(nearestCorn.location, this.mesh.position)
                    .normalize();
                this.velocity.copy(toCorn).multiplyScalar(this.speed * 1.5);
            } else {
                // At corn, slow down and peck
                this.velocity.multiplyScalar(0.5);
            }
        } else if (!this.scared) {
            // Coop visiting behavior (chickens only)
            if (this.type === 'chicken' && !nearestCorn) {
                this.visitCoopTimer -= delta;
                
                if (this.visitCoopTimer <= 0 && this.coopVisitState === 'idle') {
                    this.coopVisitState = 'walking';
                    this.visitingCoop = true;
                }
                
                if (this.coopVisitState === 'walking') {
                    // Walk to coop
                    const distToCoop = this.mesh.position.distanceTo(gameState.coopPosition);
                    if (distToCoop > 2) {
                        const toCoop = new THREE.Vector3()
                            .subVectors(gameState.coopPosition, this.mesh.position)
                            .normalize();
                        this.velocity.copy(toCoop).multiplyScalar(this.speed);
                    } else {
                        // Arrived at coop
                        this.coopVisitState = 'inside';
                        this.coopVisitTimer = 3; // Stay inside for 3 seconds
                    }
                } else if (this.coopVisitState === 'inside') {
                    // Inside coop
                    this.velocity.multiplyScalar(0.1);
                    this.coopVisitTimer -= delta;
                    if (this.coopVisitTimer <= 0) {
                        this.coopVisitState = 'returning';
                    }
                } else if (this.coopVisitState === 'returning') {
                    // Return to wandering
                    this.coopVisitState = 'idle';
                    this.visitingCoop = false;
                    this.visitCoopTimer = 30 + Math.random() * 60; // Next visit in 30-90 seconds
                }
            }
            
            // Normal wandering behavior (when not visiting coop)
            if (!this.visitingCoop) {
                this.wanderTimer -= delta;
                if (this.wanderTimer <= 0) {
                    this.wanderAngle = Math.random() * Math.PI * 2;
                    this.wanderTimer = 2 + Math.random() * 3;
                }
                
                this.velocity.x = Math.cos(this.wanderAngle) * this.speed;
                this.velocity.z = Math.sin(this.wanderAngle) * this.speed;
                
                // Ducks are attracted to the pond
                if (this.type === 'duck' && !nearestCorn) {
                    const pondPos = new THREE.Vector3(10, 0, 10);
                    const distToPond = this.mesh.position.distanceTo(pondPos);
                    if (distToPond > 3) {
                        const toPond = new THREE.Vector3()
                            .subVectors(pondPos, this.mesh.position)
                            .normalize();
                        this.velocity.add(toPond.multiplyScalar(this.speed * 0.3));
                    }
                }
            }
        }
        
        // Apply velocity
        this.mesh.position.x += this.velocity.x * delta;
        this.mesh.position.z += this.velocity.z * delta;
        
        // Check coop collision (birds can't walk through it except when visiting)
        if (!this.visitingCoop && collidesWithCoop(this.mesh.position.x, this.mesh.position.z)) {
            // Push bird away from coop
            const awayFromCoop = new THREE.Vector3()
                .subVectors(this.mesh.position, gameState.coopPosition)
                .normalize();
            this.mesh.position.x += awayFromCoop.x * 0.5;
            this.mesh.position.z += awayFromCoop.z * 0.5;
        }
        
        // Boundary avoidance - birds try to stay inside
        const boundaryDist = 25; // Start avoiding at this distance from center
        const distFromCenter = Math.sqrt(
            this.mesh.position.x * this.mesh.position.x + 
            this.mesh.position.z * this.mesh.position.z
        );
        
        if (distFromCenter > boundaryDist && !this.scared && !nearestCorn) {
            // Push back toward center
            const toCenter = new THREE.Vector3(-this.mesh.position.x, 0, -this.mesh.position.z)
                .normalize()
                .multiplyScalar(this.speed * 0.5);
            this.velocity.add(toCenter);
        }
        
        // Check boundaries
        const prevInBounds = this.inBounds;
        this.inBounds = (
            this.mesh.position.x > -30 && this.mesh.position.x < 30 &&
            this.mesh.position.z > -30 && this.mesh.position.z < 30
        );
        
        if (!this.inBounds) {
            // Bird is out of bounds, start/continue timer
            this.outOfBoundsTimer += delta;
            
            // Bird runs away after 20 seconds out of bounds
            if (this.outOfBoundsTimer >= 20 && !this.hasEscaped) {
                this.hasEscaped = true;
                gameState.ranAway++;
                return true; // Signal to remove this bird from the game
            }
        } else {
            // Bird is back in bounds, reset timer and escape flag
            this.outOfBoundsTimer = 0;
            this.hasEscaped = false;
        }
        
        // Hard boundary - can't go past this point
        this.mesh.position.x = Math.max(-32, Math.min(32, this.mesh.position.x));
        this.mesh.position.z = Math.max(-32, Math.min(32, this.mesh.position.z));
        
        // Face movement direction
        if (this.velocity.length() > 0.1) {
            this.mesh.rotation.y = Math.atan2(this.velocity.x, this.velocity.z);
        }
        
        // Wing flapping animation
        this.flapTimer -= delta;
        if (this.flapTimer <= 0 && !this.isFlapping && !this.isPecking) {
            this.isFlapping = true;
            this.flapDuration = 0.5; // Half second flap
            this.flapTimer = 3 + Math.random() * 4; // Flap every 3-7 seconds
        }
        
        if (this.isFlapping) {
            this.flapDuration -= delta;
            const flapSpeed = 20;
            const flapAngle = Math.sin(this.flapDuration * flapSpeed) * 0.5;
            this.leftWing.rotation.z = flapAngle;
            this.rightWing.rotation.z = -flapAngle;
            
            if (this.flapDuration <= 0) {
                this.isFlapping = false;
                this.leftWing.rotation.z = 0;
                this.rightWing.rotation.z = 0;
            }
        }
        
        // Pecking animation (only when not moving much)
        if (this.velocity.length() < 0.5) {
            this.peckTimer -= delta;
            if (this.peckTimer <= 0 && !this.isPecking && !this.isFlapping) {
                this.isPecking = true;
                this.peckDuration = 1.5; // 1.5 seconds of pecking
                this.peckTimer = 4 + Math.random() * 6; // Peck every 4-10 seconds
            }
            
            if (this.isPecking) {
                this.peckDuration -= delta;
                // Bob head up and down
                const peckSpeed = 8;
                const peckAmount = Math.abs(Math.sin(this.peckDuration * peckSpeed)) * 0.15;
                this.head.position.y = 0.3 - peckAmount;
                this.head.rotation.x = -peckAmount * 2;
                
                if (this.peckDuration <= 0) {
                    this.isPecking = false;
                    this.head.position.y = 0.3;
                    this.head.rotation.x = 0;
                }
            }
        } else {
            // Reset pecking if bird starts moving
            if (this.isPecking) {
                this.isPecking = false;
                this.head.position.y = 0.3;
                this.head.rotation.x = 0;
            }
        }
    }
}

// Predator class
class Predator {
    constructor(type) {
        this.type = type;
        this.mesh = new THREE.Group();
        
        if (type === 'hawk') {
            // Hawk - flying predator (more hawk-like)
            const color = 0x654321;
            const material = new THREE.MeshLambertMaterial({ 
                map: hawkFeatherTexture,
                color: hawkFeatherTexture ? 0xFFFFFF : 0x654321
            });
            
            // Body (more substantial and elongated)
            const bodyGeometry = new THREE.CylinderGeometry(0.35, 0.4, 1.2, 12);
            const body = new THREE.Mesh(bodyGeometry, material);
            body.rotation.x = Math.PI / 2;
            body.castShadow = true;
            this.mesh.add(body);
            
            // Chest (rounded front)
            const chestGeometry = new THREE.SphereGeometry(0.4, 12, 12);
            const chest = new THREE.Mesh(chestGeometry, material);
            chest.position.set(0, 0, 0.5);
            chest.scale.set(1, 1, 0.8);
            chest.castShadow = true;
            this.mesh.add(chest);
            
            // Head (distinct and rounded)
            const headGeometry = new THREE.SphereGeometry(0.35, 12, 12);
            const head = new THREE.Mesh(headGeometry, material);
            head.position.set(0, 0.3, 0.9);
            head.scale.set(0.9, 1, 1);
            head.castShadow = true;
            this.mesh.add(head);
            
            // Eyes
            const eyeGeometry = new THREE.SphereGeometry(0.08, 8, 8);
            const eyeMaterial = new THREE.MeshLambertMaterial({ color: 0xFFD700 });
            
            const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
            leftEye.position.set(-0.2, 0.35, 1.15);
            this.mesh.add(leftEye);
            
            const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
            rightEye.position.set(0.2, 0.35, 1.15);
            this.mesh.add(rightEye);
            
            // Beak (sharp and hooked)
            const beakGeometry = new THREE.ConeGeometry(0.12, 0.35, 8);
            const beakMaterial = new THREE.MeshLambertMaterial({ color: 0x333333 });
            const beak = new THREE.Mesh(beakGeometry, beakMaterial);
            beak.position.set(0, 0.25, 1.3);
            beak.rotation.x = Math.PI / 2.2; // Slightly hooked
            beak.castShadow = true;
            this.mesh.add(beak);
            
            // Main wings (longer and more defined)
            const wingGeometry = new THREE.BoxGeometry(3.2, 0.12, 1.0);
            const wings = new THREE.Mesh(wingGeometry, material);
            wings.position.set(0, 0, 0.1);
            wings.castShadow = true;
            this.mesh.add(wings);
            
            // Primary feathers (individual feathers at wing tips)
            const primaryFeatherGeometry = new THREE.BoxGeometry(0.45, 0.06, 0.18);
            const primaryMaterial = new THREE.MeshLambertMaterial({ 
                map: hawkFeatherTexture,
                color: hawkFeatherTexture ? 0xFFFFFF : 0x4A3728
            });
            
            // Left wing primaries
            for (let i = 0; i < 6; i++) {
                const feather = new THREE.Mesh(primaryFeatherGeometry, primaryMaterial);
                feather.position.set(-1.4 - (i * 0.16), 0.02, 0.4 - (i * 0.14));
                feather.rotation.y = -0.3 - (i * 0.12);
                feather.rotation.z = -0.15;
                feather.castShadow = true;
                this.mesh.add(feather);
            }
            
            // Right wing primaries
            for (let i = 0; i < 6; i++) {
                const feather = new THREE.Mesh(primaryFeatherGeometry, primaryMaterial);
                feather.position.set(1.4 + (i * 0.16), 0.02, 0.4 - (i * 0.14));
                feather.rotation.y = 0.3 + (i * 0.12);
                feather.rotation.z = 0.15;
                feather.castShadow = true;
                this.mesh.add(feather);
            }
            
            // Fan tail (spread tail feathers)
            const tailFeatherGeometry = new THREE.BoxGeometry(0.25, 0.08, 0.8);
            for (let i = 0; i < 7; i++) {
                const angle = (i - 3) * 0.15; // Spread from -3 to +3
                const tailFeather = new THREE.Mesh(tailFeatherGeometry, material);
                tailFeather.position.set(Math.sin(angle) * 0.4, -0.1, -0.6 + Math.cos(angle) * 0.2);
                tailFeather.rotation.y = angle;
                tailFeather.castShadow = true;
                this.mesh.add(tailFeather);
            }
            
            // Spawn in the air
            const edge = Math.floor(Math.random() * 4);
            switch(edge) {
                case 0: this.mesh.position.set(Math.random() * 60 - 30, 15, -35); break;
                case 1: this.mesh.position.set(Math.random() * 60 - 30, 15, 35); break;
                case 2: this.mesh.position.set(-35, 15, Math.random() * 60 - 30); break;
                case 3: this.mesh.position.set(35, 15, Math.random() * 60 - 30); break;
            }
            
            this.speed = 6;
            this.health = 2;
            this.isFlying = true;
        } else {
            // Dog - ground predator (twice as big, more dog-like)
            const color = 0x8B4513;
            const material = new THREE.MeshLambertMaterial({ 
                map: dogHairTexture,
                color: dogHairTexture ? 0xFFFFFF : 0x8B4513
            });
            
            // Body (more elongated, less blocky - dog-shaped)
            const bodyGeometry = new THREE.BoxGeometry(0.8, 0.8, 1.8);
            const body = new THREE.Mesh(bodyGeometry, material);
            body.position.set(0, 0.9, 0);
            body.castShadow = true;
            this.mesh.add(body);
            
            // Head (more rounded)
            const headGeometry = new THREE.SphereGeometry(0.5, 12, 12);
            const head = new THREE.Mesh(headGeometry, material);
            head.position.set(0, 1.0, 1.3);
            head.scale.set(0.9, 0.9, 1.1);
            head.castShadow = true;
            this.mesh.add(head);
            
            // Snout
            const snoutGeometry = new THREE.CylinderGeometry(0.25, 0.3, 0.6, 12);
            const snoutMaterial = new THREE.MeshLambertMaterial({ color: 0x654321 });
            const snout = new THREE.Mesh(snoutGeometry, snoutMaterial);
            snout.position.set(0, 0.9, 1.9);
            snout.rotation.x = Math.PI / 2;
            snout.castShadow = true;
            this.mesh.add(snout);
            
            // Nose
            const noseGeometry = new THREE.SphereGeometry(0.12, 8, 8);
            const noseMaterial = new THREE.MeshLambertMaterial({ color: 0x000000 });
            const nose = new THREE.Mesh(noseGeometry, noseMaterial);
            nose.position.set(0, 0.9, 2.2);
            this.mesh.add(nose);
            
            // Eyes
            const eyeGeometry = new THREE.SphereGeometry(0.08, 8, 8);
            const eyeMaterial = new THREE.MeshLambertMaterial({ color: 0x000000 });
            
            const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
            leftEye.position.set(-0.25, 1.15, 1.7);
            this.mesh.add(leftEye);
            
            const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
            rightEye.position.set(0.25, 1.15, 1.7);
            this.mesh.add(rightEye);
            
            // Ears (floppy)
            const earGeometry = new THREE.BoxGeometry(0.25, 0.5, 0.1);
            const leftEar = new THREE.Mesh(earGeometry, material);
            leftEar.position.set(-0.4, 1.3, 1.1);
            leftEar.rotation.z = -0.3;
            leftEar.castShadow = true;
            this.mesh.add(leftEar);
            
            const rightEar = new THREE.Mesh(earGeometry, material);
            rightEar.position.set(0.4, 1.3, 1.1);
            rightEar.rotation.z = 0.3;
            rightEar.castShadow = true;
            this.mesh.add(rightEar);
            
            // Legs (distinct and properly positioned)
            const legGeometry = new THREE.CylinderGeometry(0.15, 0.15, 0.9, 8);
            const legMaterial = new THREE.MeshLambertMaterial({ color: 0x654321 });
            
            const frontLeftLeg = new THREE.Mesh(legGeometry, legMaterial);
            frontLeftLeg.position.set(-0.35, 0.45, 0.7);
            frontLeftLeg.castShadow = true;
            this.mesh.add(frontLeftLeg);
            
            const frontRightLeg = new THREE.Mesh(legGeometry, legMaterial);
            frontRightLeg.position.set(0.35, 0.45, 0.7);
            frontRightLeg.castShadow = true;
            this.mesh.add(frontRightLeg);
            
            const backLeftLeg = new THREE.Mesh(legGeometry, legMaterial);
            backLeftLeg.position.set(-0.35, 0.45, -0.7);
            backLeftLeg.castShadow = true;
            this.mesh.add(backLeftLeg);
            
            const backRightLeg = new THREE.Mesh(legGeometry, legMaterial);
            backRightLeg.position.set(0.35, 0.45, -0.7);
            backRightLeg.castShadow = true;
            this.mesh.add(backRightLeg);
            
            // Paws
            const pawGeometry = new THREE.SphereGeometry(0.18, 8, 8);
            const pawMaterial = new THREE.MeshLambertMaterial({ color: 0x654321 });
            
            const frontLeftPaw = new THREE.Mesh(pawGeometry, pawMaterial);
            frontLeftPaw.position.set(-0.35, 0.1, 0.7);
            frontLeftPaw.scale.set(1, 0.6, 1);
            this.mesh.add(frontLeftPaw);
            
            const frontRightPaw = new THREE.Mesh(pawGeometry, pawMaterial);
            frontRightPaw.position.set(0.35, 0.1, 0.7);
            frontRightPaw.scale.set(1, 0.6, 1);
            this.mesh.add(frontRightPaw);
            
            const backLeftPaw = new THREE.Mesh(pawGeometry, pawMaterial);
            backLeftPaw.position.set(-0.35, 0.1, -0.7);
            backLeftPaw.scale.set(1, 0.6, 1);
            this.mesh.add(backLeftPaw);
            
            const backRightPaw = new THREE.Mesh(pawGeometry, pawMaterial);
            backRightPaw.position.set(0.35, 0.1, -0.7);
            backRightPaw.scale.set(1, 0.6, 1);
            this.mesh.add(backRightPaw);
            
            // Tail (curved upward)
            const tailGeometry = new THREE.CylinderGeometry(0.12, 0.08, 1.0, 8);
            const tail = new THREE.Mesh(tailGeometry, material);
            tail.position.set(0, 1.2, -1.0);
            tail.rotation.x = -Math.PI / 3;
            tail.castShadow = true;
            this.mesh.add(tail);
            
            // Spawn at random edge
            const edge = Math.floor(Math.random() * 4);
            switch(edge) {
                case 0: this.mesh.position.set(Math.random() * 60 - 30, 0, -35); break;
                case 1: this.mesh.position.set(Math.random() * 60 - 30, 0, 35); break;
                case 2: this.mesh.position.set(-35, 0, Math.random() * 60 - 30); break;
                case 3: this.mesh.position.set(35, 0, Math.random() * 60 - 30); break;
            }
            
            this.speed = 4;
            this.health = 3;
            this.isFlying = false;
        }
        
        scene.add(this.mesh);
        
        this.velocity = new THREE.Vector3();
        this.target = null;
        this.fleeing = false;
        this.capturedBird = null; // Bird being carried
        this.targetBird = null; // Bird being stalked (for hawks waiting)
        this.captureTimer = 0; // For hawks - time on bird before grabbing
        this.hasScreeched = false; // Track if hawk has screeched during this hunt
        this.barkTimer = 0; // For dogs - time since last bark
    }
    
    update(delta, birds, player) {
        // Check if player scares predator
        if (player) {
            const distToPlayer = this.mesh.position.distanceTo(player.mesh.position);
            const scareRange = this.isFlying ? 6 : 4;
            
            if (distToPlayer < scareRange && keys[' ']) {
                this.fleeing = true;
                this.health--;
                
                // Trigger staff swing animation
                player.swingStaff();
                
                // Dog barks when hit
                if (!this.isFlying) {
                    audioSystem.playDogBark();
                }
                
                // Release captured bird if player scares predator
                if (this.capturedBird) {
                    this.capturedBird.captured = false;
                    // Reset bird to ground level
                    this.capturedBird.mesh.position.y = 0.3;
                    this.capturedBird = null;
                    this.captureTimer = 0;
                }
                
                // Reset target bird if stalking
                if (this.targetBird) {
                    this.targetBird = null;
                    this.captureTimer = 0;
                }
                
                if (this.health <= 0) {
                    return true; // Signal to remove this predator
                }
            }
            
            if (distToPlayer > 10) {
                this.fleeing = false;
            }
        }
        
        if (this.fleeing && player) {
            // Run/fly away from player
            const away = new THREE.Vector3()
                .subVectors(this.mesh.position, player.mesh.position)
                .normalize();
            this.velocity.copy(away).multiplyScalar(this.speed * 1.5);
            
            if (this.isFlying) {
                this.mesh.position.y += delta * 8;
            }
        } else if (this.capturedBird) {
            // Carrying a bird - head to edge
            const edge = this.getClosestEdge();
            const direction = new THREE.Vector3()
                .subVectors(edge, this.mesh.position)
                .normalize();
            this.velocity.copy(direction).multiplyScalar(this.speed);
            
            // Hawks fly up when carrying
            if (this.isFlying) {
                const carryHeight = 12;
                if (this.mesh.position.y < carryHeight) {
                    this.mesh.position.y += delta * 8;
                }
            }
            
            // Move captured bird with predator
            this.capturedBird.mesh.position.copy(this.mesh.position);
            this.capturedBird.mesh.position.y = this.mesh.position.y;
            
            // Check if crossed the boundary (beyond -32 or 32)
            const outOfBounds = (
                this.mesh.position.x < -32 || this.mesh.position.x > 32 ||
                this.mesh.position.z < -32 || this.mesh.position.z > 32
            );
            
            if (outOfBounds) {
                // Bird is killed - signal to remove it
                this.capturedBird.killed = true;
                return true; // Remove predator too
            }
        } else {
            // Hunt nearest bird
            let nearest = null;
            let nearestDist = Infinity;
            
            for (const bird of birds) {
                if (!bird.captured) {
                    const dist = this.mesh.position.distanceTo(bird.mesh.position);
                    if (dist < nearestDist) {
                        nearestDist = dist;
                        nearest = bird;
                    }
                }
            }
            
            if (nearest) {
                // Check if caught bird
                if (nearestDist < 2.0) {  // Increased to 2.0 for easier capture
                    if (this.isFlying) {
                        // Hawk: wait 20 seconds before grabbing
                        // Lock onto this bird while waiting
                        if (!this.targetBird) {
                            this.targetBird = nearest;
                        }
                        
                        this.captureTimer += delta;
                        
                        // Stay on top of the bird
                        this.mesh.position.x = this.targetBird.mesh.position.x;
                        this.mesh.position.z = this.targetBird.mesh.position.z;
                        this.mesh.position.y = 1.5;
                        this.velocity.set(0, 0, 0);
                        
                        if (this.captureTimer >= 10) {
                            this.capturedBird = this.targetBird;
                            this.targetBird.captured = true;
                            this.targetBird = null;
                            this.captureTimer = 0;
                        }
                    } else {
                        // Dog: grab immediately
                        this.capturedBird = nearest;
                        nearest.captured = true;
                    }
                } else {
                    // Not close enough, chase the bird
                    this.targetBird = null;
                    this.captureTimer = 0;
                    
                    const direction = new THREE.Vector3()
                        .subVectors(nearest.mesh.position, this.mesh.position)
                        .normalize();
                    this.velocity.copy(direction).multiplyScalar(this.speed);
                    
                    // Dogs bark periodically while chasing
                    if (!this.isFlying) {
                        this.barkTimer += delta;
                        if (this.barkTimer >= 2) { // Bark every 2 seconds
                            audioSystem.playDogBark();
                            this.barkTimer = 0;
                        }
                    }
                    
                    // Hawks dive down when hunting
                    if (this.isFlying) {
                        const targetHeight = 1.5;
                        if (this.mesh.position.y > targetHeight) {
                            this.mesh.position.y -= delta * 6;
                            
                            // Screech once when starting to dive
                            if (!this.hasScreeched && this.mesh.position.y < 10) {
                                audioSystem.playHawkScreech();
                                this.hasScreeched = true;
                            }
                        } else {
                            this.mesh.position.y = targetHeight;
                        }
                    }
                }
            } else if (this.isFlying) {
                // No target, maintain cruising altitude
                this.hasScreeched = false; // Reset for next hunt
                const cruisingHeight = 12;
                if (this.mesh.position.y < cruisingHeight) {
                    this.mesh.position.y += delta * 3;
                }
            }
        }
        
        this.mesh.position.x += this.velocity.x * delta;
        this.mesh.position.z += this.velocity.z * delta;
        
        // Check coop collision (predators can't walk through it)
        if (!this.isFlying && collidesWithCoop(this.mesh.position.x, this.mesh.position.z)) {
            const awayFromCoop = new THREE.Vector3()
                .subVectors(this.mesh.position, gameState.coopPosition)
                .normalize();
            this.mesh.position.x += awayFromCoop.x * 0.5;
            this.mesh.position.z += awayFromCoop.z * 0.5;
        }
        
        // Avoid player collision
        if (player && !this.fleeing) {
            const distToPlayer = this.mesh.position.distanceTo(player.mesh.position);
            if (distToPlayer < 2) {
                const awayFromPlayer = new THREE.Vector3()
                    .subVectors(this.mesh.position, player.mesh.position)
                    .normalize();
                this.mesh.position.x += awayFromPlayer.x * 0.5;
                this.mesh.position.z += awayFromPlayer.z * 0.5;
            }
        }
        
        // Avoid Liz collision
        if (gameState.visitor && !this.fleeing) {
            const distToLiz = this.mesh.position.distanceTo(gameState.visitor.mesh.position);
            if (distToLiz < 3) {
                const awayFromLiz = new THREE.Vector3()
                    .subVectors(this.mesh.position, gameState.visitor.mesh.position)
                    .normalize();
                this.mesh.position.x += awayFromLiz.x * 0.5;
                this.mesh.position.z += awayFromLiz.z * 0.5;
            }
        }
        
        // Face movement direction
        if (this.velocity.length() > 0.1) {
            this.mesh.rotation.y = Math.atan2(this.velocity.x, this.velocity.z);
        }
        
        return false;
    }
    
    getClosestEdge() {
        const pos = this.mesh.position;
        const edges = [
            new THREE.Vector3(pos.x, pos.y, -40),  // North
            new THREE.Vector3(pos.x, pos.y, 40),   // South
            new THREE.Vector3(-40, pos.y, pos.z),  // West
            new THREE.Vector3(40, pos.y, pos.z)    // East
        ];
        
        let closest = edges[0];
        let minDist = pos.distanceTo(edges[0]);
        
        for (let i = 1; i < edges.length; i++) {
            const dist = pos.distanceTo(edges[i]);
            if (dist < minDist) {
                minDist = dist;
                closest = edges[i];
            }
        }
        
        return closest;
    }
}

// Visitor class - Liz the friendly neighbor
class Visitor {
    constructor() {
        this.mesh = new THREE.Group();
        
        // Skin material
        const skinMaterial = new THREE.MeshLambertMaterial({ color: 0xFFDBAC });
        
        // Legs (gray sweatpants)
        const legGeometry = new THREE.CylinderGeometry(0.25, 0.25, 1.6, 8);
        const pantsMaterial = new THREE.MeshLambertMaterial({ color: 0x808080 }); // Gray
        
        const leftLeg = new THREE.Mesh(legGeometry, pantsMaterial);
        leftLeg.position.set(-0.3, 0.8, 0);
        leftLeg.castShadow = true;
        this.mesh.add(leftLeg);
        this.leftLeg = leftLeg; // Store for animation
        
        const rightLeg = new THREE.Mesh(legGeometry, pantsMaterial);
        rightLeg.position.set(0.3, 0.8, 0);
        rightLeg.castShadow = true;
        this.mesh.add(rightLeg);
        this.rightLeg = rightLeg; // Store for animation
        
        // Feet (shoes)
        const footGeometry = new THREE.BoxGeometry(0.3, 0.2, 0.5);
        const shoeMaterial = new THREE.MeshLambertMaterial({ color: 0xFFFFFF }); // White shoes
        
        const leftFoot = new THREE.Mesh(footGeometry, shoeMaterial);
        leftFoot.position.set(-0.3, 0.1, 0.1);
        leftFoot.castShadow = true;
        this.mesh.add(leftFoot);
        this.leftFoot = leftFoot; // Store for animation
        
        const rightFoot = new THREE.Mesh(footGeometry, shoeMaterial);
        rightFoot.position.set(0.3, 0.1, 0.1);
        rightFoot.castShadow = true;
        this.mesh.add(rightFoot);
        this.rightFoot = rightFoot; // Store for animation
        
        // Torso (blue sweatshirt)
        const torsoGeometry = new THREE.BoxGeometry(0.9, 1.2, 0.5);
        const sweatshirtMaterial = new THREE.MeshLambertMaterial({ color: 0x4169E1 }); // Royal blue
        const torso = new THREE.Mesh(torsoGeometry, sweatshirtMaterial);
        torso.position.set(0, 2.2, 0);
        torso.castShadow = true;
        this.mesh.add(torso);
        this.torso = torso; // Store for animation
        
        // Add chest shape for feminine appearance
        const chestGeometry = new THREE.SphereGeometry(0.2, 8, 8);
        const leftChest = new THREE.Mesh(chestGeometry, sweatshirtMaterial);
        leftChest.position.set(-0.2, 2.4, 0.2);
        leftChest.scale.set(1, 0.8, 1);
        leftChest.castShadow = true;
        this.mesh.add(leftChest);
        this.leftChest = leftChest; // Store for animation
        
        const rightChest = new THREE.Mesh(chestGeometry, sweatshirtMaterial);
        rightChest.position.set(0.2, 2.4, 0.2);
        rightChest.scale.set(1, 0.8, 1);
        rightChest.castShadow = true;
        this.mesh.add(rightChest);
        this.rightChest = rightChest; // Store for animation
        
        // Arms
        const armGeometry = new THREE.CylinderGeometry(0.15, 0.15, 1.0, 8);
        
        const leftArm = new THREE.Mesh(armGeometry, sweatshirtMaterial);
        leftArm.position.set(-0.6, 2.2, 0);
        leftArm.castShadow = true;
        this.mesh.add(leftArm);
        this.leftArm = leftArm; // Store for animation
        
        const rightArm = new THREE.Mesh(armGeometry, sweatshirtMaterial);
        rightArm.position.set(0.6, 2.2, 0);
        rightArm.castShadow = true;
        this.mesh.add(rightArm);
        this.rightArm = rightArm; // Store for animation
        
        // Hands
        const handGeometry = new THREE.SphereGeometry(0.15, 8, 8);
        
        const leftHand = new THREE.Mesh(handGeometry, skinMaterial);
        leftHand.position.set(-0.6, 1.7, 0);
        leftHand.castShadow = true;
        this.mesh.add(leftHand);
        this.leftHand = leftHand; // Store for animation
        
        const rightHand = new THREE.Mesh(handGeometry, skinMaterial);
        rightHand.position.set(0.6, 1.7, 0);
        rightHand.castShadow = true;
        this.mesh.add(rightHand);
        this.rightHand = rightHand; // Store for animation
        
        // Head
        const headGeometry = new THREE.SphereGeometry(0.45, 12, 12);
        const head = new THREE.Mesh(headGeometry, skinMaterial);
        head.position.set(0, 3.2, 0);
        head.castShadow = true;
        this.mesh.add(head);
        this.head = head; // Store for animation
        
        // Eyes
        const eyeGeometry = new THREE.SphereGeometry(0.06, 8, 8);
        const eyeMaterial = new THREE.MeshLambertMaterial({ color: 0x000000 });
        
        const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        leftEye.position.set(-0.15, 3.25, 0.4);
        this.mesh.add(leftEye);
        this.leftEye = leftEye; // Store for animation
        
        const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        rightEye.position.set(0.15, 3.25, 0.4);
        this.mesh.add(rightEye);
        this.rightEye = rightEye; // Store for animation
        
        // Smile (happy arc)
        const smileCurve = new THREE.EllipseCurve(
            0, 0,
            0.2, 0.1,
            0, Math.PI,
            false,
            0
        );
        const smilePoints = smileCurve.getPoints(20);
        const smileGeometry = new THREE.BufferGeometry().setFromPoints(smilePoints);
        const smileMaterial = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
        const smile = new THREE.Line(smileGeometry, smileMaterial);
        smile.position.set(0, 3.0, 0.42); // Lower on face
        smile.rotation.x = Math.PI; // Flip to face forward correctly
        smile.rotation.y = Math.PI; // Additional rotation
        this.mesh.add(smile);
        this.smile = smile; // Store for animation
        
        // Green baseball cap
        const capBillGeometry = new THREE.CylinderGeometry(0.5, 0.5, 0.05, 16, 1, false, 0, Math.PI);
        const capMaterial = new THREE.MeshLambertMaterial({ color: 0x228B22 }); // Forest green
        const capBill = new THREE.Mesh(capBillGeometry, capMaterial);
        capBill.position.set(0, 3.48, 0.25); // Move back closer to head
        capBill.rotation.y = -Math.PI / 2; // Rotate -90 degrees (flip to point forward correctly)
        capBill.castShadow = true;
        this.mesh.add(capBill);
        this.capBill = capBill; // Store for animation
        
        // Cap crown (dome)
        const capCrownGeometry = new THREE.SphereGeometry(0.48, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2);
        const capCrown = new THREE.Mesh(capCrownGeometry, capMaterial);
        capCrown.position.set(0, 3.45, 0);
        capCrown.castShadow = true;
        this.mesh.add(capCrown);
        this.capCrown = capCrown; // Store for animation
        
        // Spawn at right side center
        this.mesh.position.set(35, 0, 0);
        this.entryPoint = new THREE.Vector3(35, 0, 0);
        
        scene.add(this.mesh);
        
        // State management
        this.state = 'entering'; // entering, wandering, sitting, leaving
        this.velocity = new THREE.Vector3();
        this.speed = 3;
        this.targetPosition = null;
        this.sitTimer = 0;
        this.sitDuration = 20; // Sits for 20 seconds (increased for testing)
        this.greetingShown = false;
        this.greetingTimer = 0;
        this.throwTimer = 0;
        this.throwInterval = 3; // Throw treats every 3 seconds while sitting
        this.birdsOnHead = []; // Track which birds are on her head
    }
    
    update(delta, birds, player) {
        // Update greeting timer across all states
        if (!this.greetingShown && player) {
            this.greetingTimer += delta;
            if (this.greetingTimer >= 3) {
                this.greetingShown = true;
                this.showGreeting(player);
            }
        }
        
        if (this.state === 'entering') {
            // Walk into the play area
            const inBounds = this.mesh.position.x < 25;
            
            if (!inBounds) {
                // Move toward center
                this.velocity.set(-this.speed, 0, 0);
                this.mesh.position.x += this.velocity.x * delta;
            } else {
                // Pick a random spot to sit (not too close to coop or edges)
                this.targetPosition = new THREE.Vector3(
                    -10 + Math.random() * 20,
                    0,
                    -10 + Math.random() * 20
                );
                this.state = 'wandering';
            }
        } else if (this.state === 'wandering') {
            // Walk to target position
            if (!this.targetPosition) {
                console.error('Liz in wandering state but no target position!');
                this.state = 'leaving';
                return false;
            }
            
            const distToTarget = this.mesh.position.distanceTo(this.targetPosition);
            
            if (distToTarget > 1) {
                const direction = new THREE.Vector3()
                    .subVectors(this.targetPosition, this.mesh.position)
                    .normalize();
                this.velocity.copy(direction).multiplyScalar(this.speed);
                this.mesh.position.x += this.velocity.x * delta;
                this.mesh.position.z += this.velocity.z * delta;
                
                // Face movement direction
                this.mesh.rotation.y = Math.atan2(this.velocity.x, this.velocity.z);
            } else {
                // Arrived, sit down
                this.state = 'sitting';
                this.velocity.set(0, 0, 0);
                this.sitTimer = 0;
                
                // Animate sitting pose
                this.sitDown();
            }
        } else if (this.state === 'sitting') {
            // Sit and attract birds
            this.sitTimer += delta;
            this.throwTimer += delta;
            
            // Throw treats periodically
            if (this.throwTimer >= this.throwInterval) {
                this.throwTreat();
                this.throwTimer = 0;
            }
            
            // Attract birds to sit on head
            this.attractBirds(birds, delta);
            
            // Time to leave
            if (this.sitTimer >= this.sitDuration) {
                this.state = 'leaving';
                
                // Show goodbye message
                if (player) {
                    this.showGoodbye(player);
                }
                
                // Stand back up
                this.standUp();
                
                // Birds jump off and resume normal behavior
                this.birdsOnHead.forEach(bird => {
                    bird.onVisitorHead = false;
                    bird.attractedToVisitor = false; // Clear attraction flag
                    bird.mesh.position.y = 0.3;
                    bird.velocity.set(0, 0, 0); // Reset velocity
                    bird.wanderTimer = 0; // Trigger new wander direction immediately
                });
                this.birdsOnHead = [];
            }
        } else if (this.state === 'leaving') {
            // Walk back to entry point and off screen
            // Once we're past x=33, just walk straight right to exit
            if (this.mesh.position.x > 33) {
                this.velocity.set(this.speed, 0, 0);
                this.mesh.position.x += this.velocity.x * delta;
                
                // Face right
                this.mesh.rotation.y = 0;
                
                // Remove when off screen
                if (this.mesh.position.x > 40) {
                    return true; // Signal to remove
                }
            } else {
                // Navigate back toward entry point
                const direction = new THREE.Vector3()
                    .subVectors(this.entryPoint, this.mesh.position)
                    .normalize();
                this.velocity.copy(direction).multiplyScalar(this.speed);
                this.mesh.position.x += this.velocity.x * delta;
                this.mesh.position.z += this.velocity.z * delta;
                
                // Face movement direction
                this.mesh.rotation.y = Math.atan2(this.velocity.x, this.velocity.z);
            }
        }
        
        return false;
    }
    
    attractBirds(birds, delta) {
        // Birds within range are attracted - larger range when sitting
        const attractionRange = this.state === 'sitting' ? 20 : 12;
        const headYOffset = this.state === 'sitting' ? 2.0 : 3.2; // Head position when sitting vs standing
        const headPosition = new THREE.Vector3(
            this.mesh.position.x,
            this.mesh.position.y + headYOffset,
            this.mesh.position.z
        );
        
        // Target position for birds to gather around (slightly in front when sitting)
        const gatherPosition = new THREE.Vector3(
            this.mesh.position.x,
            this.mesh.position.y,
            this.mesh.position.z + (this.state === 'sitting' ? 1.0 : 0.5)
        );
        
        birds.forEach(bird => {
            const dist = bird.mesh.position.distanceTo(gatherPosition);
            
            if (dist < attractionRange && !bird.captured && !bird.onVisitorHead) {
                // Move toward gathering spot, but stop at a comfortable distance
                if (dist > 1.5) {
                    const toLiz = new THREE.Vector3()
                        .subVectors(gatherPosition, bird.mesh.position)
                        .normalize();
                    bird.velocity.copy(toLiz).multiplyScalar(bird.speed * 2); // Faster attraction
                    bird.attractedToVisitor = true; // Mark as attracted
                } else {
                    // Close enough, slow down and wander nearby
                    bird.velocity.multiplyScalar(0.3);
                    bird.attractedToVisitor = true;
                }
                
                // If close enough, jump on head (2% chance per frame when very close)
                if (dist < 2 && Math.random() < 0.02 && this.birdsOnHead.length < 3) {
                    bird.onVisitorHead = true;
                    this.birdsOnHead.push(bird);
                    
                    // Position on TOP of head (spread them out)
                    const offset = this.birdsOnHead.length - 1;
                    bird.headOffset = new THREE.Vector3(
                        (offset - 1) * 0.4,  // Spread left/right
                        0.7,                  // Well above head (0.45 head radius + 0.25 clearance for cap)
                        (offset - 1) * 0.2   // Slight front/back variation
                    );
                }
            } else if (bird.attractedToVisitor && dist >= attractionRange) {
                // Bird left range, clear attraction flag
                bird.attractedToVisitor = false;
            }
        });
        
        // Update birds on head
        this.birdsOnHead.forEach(bird => {
            bird.mesh.position.copy(headPosition).add(bird.headOffset);
            bird.velocity.set(0, 0, 0);
            
            // Flap wings occasionally
            if (Math.random() < 0.05 && !bird.isFlapping) {
                bird.isFlapping = true;
                bird.flapDuration = 0.5;
            }
        });
    }
    
    throwTreat() {
        // Visual treat (small yellow sphere)
        const treatGeometry = new THREE.SphereGeometry(0.15, 8, 8);
        const treatMaterial = new THREE.MeshLambertMaterial({ color: 0xFFD700 });
        const treat = new THREE.Mesh(treatGeometry, treatMaterial);
        treat.position.copy(this.mesh.position);
        treat.position.y = 1.7;
        scene.add(treat);
        
        // Animate hand throwing
        const originalY = this.leftHand.position.y;
        this.leftHand.position.y += 0.3;
        setTimeout(() => {
            this.leftHand.position.y = originalY;
        }, 200);
        
        // Treat falls to ground
        let treatLife = 0.5;
        const treatInterval = setInterval(() => {
            treatLife -= 0.016;
            treat.position.y -= 0.1;
            
            if (treatLife <= 0 || treat.position.y <= 0.2) {
                treat.position.y = 0.2;
                // Remove after a moment
                setTimeout(() => {
                    scene.remove(treat);
                }, 2000);
                clearInterval(treatInterval);
            }
        }, 16);
    }
    
    sitDown() {
        // Lower torso
        this.torso.position.y = 1.0;
        
        // Lower chest
        this.leftChest.position.y = 1.2;
        this.rightChest.position.y = 1.2;
        
        // Lower and adjust arms
        this.leftArm.position.y = 1.0;
        this.rightArm.position.y = 1.0;
        
        // Lower hands
        this.leftHand.position.y = 0.5;
        this.rightHand.position.y = 0.5;
        
        // Lower head
        this.head.position.y = 2.0;
        
        // Lower eyes
        this.leftEye.position.y = 2.05;
        this.rightEye.position.y = 2.05;
        
        // Lower smile
        this.smile.position.y = 1.8;
        
        // Lower cap
        this.capBill.position.y = 2.28;
        this.capCrown.position.y = 2.25;
        
        // Rotate legs forward to be horizontal (sitting with legs extended)
        const legRotation = Math.PI / 2.2; // ~82 degrees
        this.leftLeg.rotation.x = legRotation;
        this.leftLeg.position.set(-0.3, 0.3, 0.4); // Position legs forward from torso
        
        this.rightLeg.rotation.x = legRotation;
        this.rightLeg.position.set(0.3, 0.3, 0.4); // Position legs forward from torso
        
        // Calculate foot position at end of rotated legs
        // Cylinder is 1.6 tall, centered at (x, 0.3, 0.4)
        // After rotation around X by legRotation, the far end is at:
        const halfLegLength = 0.8;
        const footY = 0.3 + (halfLegLength * Math.cos(legRotation));
        const footZ = 0.4 + (halfLegLength * Math.sin(legRotation)) + 0.15; // Add a bit extra to extend past leg end
        
        this.leftFoot.position.set(-0.3, footY, footZ);
        this.leftFoot.rotation.x = -Math.PI / 2; // Point upward
        
        this.rightFoot.position.set(0.3, footY, footZ);
        this.rightFoot.rotation.x = -Math.PI / 2; // Point upward
    }
    
    standUp() {
        // Reset torso
        this.torso.position.y = 2.2;
        
        // Reset chest
        this.leftChest.position.y = 2.4;
        this.rightChest.position.y = 2.4;
        
        // Reset arms
        this.leftArm.position.y = 2.2;
        this.rightArm.position.y = 2.2;
        
        // Reset hands
        this.leftHand.position.y = 1.7;
        this.rightHand.position.y = 1.7;
        
        // Reset head
        this.head.position.y = 3.2;
        
        // Reset eyes
        this.leftEye.position.y = 3.25;
        this.rightEye.position.y = 3.25;
        
        // Reset smile
        this.smile.position.y = 3.0;
        
        // Reset cap
        this.capBill.position.y = 3.48;
        this.capCrown.position.y = 3.45;
        
        // Reset legs to standing position
        this.leftLeg.rotation.x = 0;
        this.leftLeg.position.set(-0.3, 0.8, 0);
        
        this.rightLeg.rotation.x = 0;
        this.rightLeg.position.set(0.3, 0.8, 0);
        
        // Reset feet
        this.leftFoot.position.set(-0.3, 0.1, 0.1);
        this.leftFoot.rotation.x = 0;
        
        this.rightFoot.position.set(0.3, 0.1, 0.1);
        this.rightFoot.rotation.x = 0;
    }
    
    showGreeting(player) {
        // Create dialog bubble above player
        const bubble = document.createElement('div');
        bubble.id = 'lizGreeting';
        bubble.style.cssText = `
            position: absolute;
            background: white;
            color: black;
            padding: 10px 20px;
            border-radius: 20px;
            border: 3px solid #4169E1;
            font-size: 24px;
            font-weight: bold;
            pointer-events: none;
            z-index: 1000;
            box-shadow: 0 4px 8px rgba(0,0,0,0.3);
        `;
        bubble.textContent = 'Hi Liz!';
        document.body.appendChild(bubble);
        
        // Position above player (we'll update in animation loop)
        bubble.dataset.followPlayer = 'true';
        
        // Remove after 3 seconds
        setTimeout(() => {
            bubble.remove();
        }, 3000);
    }
    
    showGoodbye(player) {
        // Create dialog bubble above player
        const bubble = document.createElement('div');
        bubble.id = 'lizGoodbye';
        bubble.style.cssText = `
            position: absolute;
            background: white;
            color: black;
            padding: 10px 20px;
            border-radius: 20px;
            border: 3px solid #FF1493;
            font-size: 24px;
            font-weight: bold;
            pointer-events: none;
            z-index: 1000;
            box-shadow: 0 4px 8px rgba(0,0,0,0.3);
        `;
        bubble.textContent = 'Bye Liz!';
        document.body.appendChild(bubble);
        
        // Position above player (we'll update in animation loop)
        bubble.dataset.followPlayer = 'true';
        
        // Remove after 3 seconds
        setTimeout(() => {
            bubble.remove();
        }, 3000);
    }
}

// Input handling
const keys = {};
window.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
    
    // Throw corn with 'C' key
    if (e.key.toLowerCase() === 'c' && gameState.started && gameState.player && !gameState.inCoop) {
        gameState.player.throwCorn();
    }
    
    // Enter/exit coop with 'E' key
    if (e.key.toLowerCase() === 'e' && gameState.started && gameState.player) {
        if (gameState.inCoop) {
            // Exit coop (always allowed from inside)
            toggleCoop();
        } else {
            // Try to enter coop - must be at the door
            // Door is on the front (south side) of the coop at z = -22
            const doorPos = new THREE.Vector3(
                gameState.coopPosition.x,
                0,
                gameState.coopPosition.z + 6.5
            );
            const distToDoor = gameState.player.mesh.position.distanceTo(doorPos);
            
            if (distToDoor < 4) {
                toggleCoop();
            }
        }
    }
    
    // Collect egg with 'F' key (alternative to clicking)
    if (e.key.toLowerCase() === 'f' && gameState.inCoop && gameState.eggsAvailable) {
        collectEggAtCrosshair();
    }
});
window.addEventListener('keyup', (e) => keys[e.key.toLowerCase()] = false);

// Mouse look
let mouseX = 0;
let mouseY = 0;
let cameraAngleH = 0; // Horizontal angle
let cameraAngleV = 0.3; // Vertical angle (start slightly looking down)
let isPointerLocked = false;

window.addEventListener('mousemove', (e) => {
    // Only update camera if pointer is locked
    if (isPointerLocked) {
        // Calculate mouse movement delta
        const deltaX = e.movementX || 0;
        const deltaY = e.movementY || 0;
        
        // Update camera angles based on mouse movement
        cameraAngleH -= deltaX * 0.003; // Horizontal rotation
        cameraAngleV -= deltaY * 0.003; // Vertical rotation
        
        // Clamp vertical angle to prevent flipping
        cameraAngleV = Math.max(-Math.PI / 3, Math.min(Math.PI / 2.5, cameraAngleV));
    }
});

// Pointer lock change event
document.addEventListener('pointerlockchange', () => {
    isPointerLocked = document.pointerLockElement === renderer.domElement;
    const lockIndicator = document.getElementById('lockIndicator');
    if (isPointerLocked) {
        lockIndicator.style.display = 'block';
    } else {
        lockIndicator.style.display = 'none';
        
        // If we're in the coop and pointer gets unlocked, re-lock it immediately
        if (gameState.inCoop) {
            setTimeout(() => {
                renderer.domElement.requestPointerLock();
            }, 100);
        }
    }
});

// Request pointer lock on click
renderer.domElement.addEventListener('click', () => {
    // Only lock pointer if game has started
    if (!gameState.started) {
        return;
    }
    
    if (!isPointerLocked && !gameState.inCoop) {
        renderer.domElement.requestPointerLock();
    } else if (gameState.inCoop && gameState.eggsAvailable) {
        // Collect egg when in coop
        collectEggAtCrosshair();
    }
});

// Start game
document.getElementById('startBtn').addEventListener('click', () => {
    document.getElementById('instructions').classList.add('hidden');
    gameState.started = true;
    
    // Initialize timer display with correct max time
    const minutes = Math.floor(gameState.maxGameTime / 60);
    const seconds = Math.floor(gameState.maxGameTime % 60);
    document.getElementById('timer').textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    
    // Update walkman state and remove yellow glow
    walkmanSystem.isGameStarted = true;
    const walkmanBtn = document.getElementById('walkman');
    walkmanBtn.classList.remove('pre-game');
    
    // Initialize audio system (but don't start music yet)
    audioSystem.init();
    
    // Only start game music if user is in game music mode
    if (walkmanSystem.mode === 'game') {
        audioSystem.playBackgroundMusic();
    }
    
    // Create player
    gameState.player = new Player();
    
    // Spawn chickens
    for (let i = 0; i < 8; i++) {
        const chicken = new Bird('chicken', -25 + Math.random() * 6, -25 + Math.random() * 6);
        gameState.chickens.push(chicken);
    }
    
    // Spawn ducks
    for (let i = 0; i < 5; i++) {
        const duck = new Bird('duck', -25 + Math.random() * 6, -25 + Math.random() * 6);
        gameState.ducks.push(duck);
    }
});

// Game Over Modal Function
function showGameOverModal(isComplete, score, stats) {
    const modal = document.getElementById('gameOverModal');
    const title = document.getElementById('gameOverTitle');
    const finalScore = document.getElementById('finalScore');
    const statsDiv = document.getElementById('gameOverStats');
    
    // Set title based on completion
    if (isComplete) {
        title.textContent = '🎉 LEVEL COMPLETE! 🎉';
        title.className = 'complete';
    } else {
        title.textContent = '💀 GAME OVER 💀';
        title.className = 'failed';
    }
    
    // Set final score
    finalScore.textContent = score.toString().padStart(7, '0');
    
    // Build stats HTML
    let statsHTML = '';
    if (isComplete) {
        statsHTML += `<div class="stat-line"><span class="stat-label">Birds Remaining:</span><span class="stat-value">${stats.birdsRemaining}/13</span></div>`;
    }
    statsHTML += `<div class="stat-line"><span class="stat-label">Eggs Collected:</span><span class="stat-value">${stats.eggsCollected}</span></div>`;
    statsHTML += `<div class="stat-line"><span class="stat-label">Predators Defeated:</span><span class="stat-value">${stats.defeated}</span></div>`;
    statsHTML += `<div class="stat-line"><span class="stat-label">Birds Ran Away:</span><span class="stat-value">${stats.ranAway}</span></div>`;
    statsHTML += `<div class="stat-line"><span class="stat-label">Birds Killed:</span><span class="stat-value">${stats.killed}</span></div>`;
    
    statsDiv.innerHTML = statsHTML;
    
    // Show modal
    modal.classList.add('visible');
}

// Play Again button handler
document.getElementById('playAgainBtn').addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent any event bubbling
    location.reload();
});

// Prevent modal from closing on clicks/keyboard
document.getElementById('gameOverModal').addEventListener('click', (e) => {
    e.stopPropagation();
});

document.getElementById('gameOverModal').addEventListener('keydown', (e) => {
    e.stopPropagation();
});

// Spawn predators periodically
let predatorSpawnTimer = 15;
let hawkSpawnTimer = 25;

// Spawn Liz (friendly visitor) randomly
let visitorSpawnTimer = 180 + Math.random() * 120; // First visit between 3-5 minutes

// Game loop
const clock = new THREE.Clock();

// Minimap setup
const minimapCanvas = document.getElementById('minimap');
const minimapCtx = minimapCanvas.getContext('2d');
minimapCanvas.width = 200;
minimapCanvas.height = 200;

function drawMinimap() {
    if (!gameState.started) return;
    
    // Clear minimap
    minimapCtx.fillStyle = 'rgba(58, 125, 68, 0.8)'; // Green yard
    minimapCtx.fillRect(0, 0, 200, 200);
    
    // Draw boundary
    minimapCtx.strokeStyle = 'rgba(139, 69, 19, 0.8)'; // Brown
    minimapCtx.lineWidth = 3;
    minimapCtx.strokeRect(10, 10, 180, 180);
    
    // Draw pond
    minimapCtx.fillStyle = 'rgba(65, 105, 225, 0.8)'; // Blue
    minimapCtx.beginPath();
    const pondX = ((10 + 30) / 60) * 180 + 10; // Map 10 to minimap coords
    const pondZ = ((10 + 30) / 60) * 180 + 10;
    minimapCtx.arc(pondX, pondZ, 15, 0, Math.PI * 2);
    minimapCtx.fill();
    
    // Draw pen
    minimapCtx.fillStyle = 'rgba(139, 0, 0, 0.8)'; // Dark red
    const penX = ((-25 + 30) / 60) * 180 + 10;
    const penZ = ((-25 + 30) / 60) * 180 + 10;
    minimapCtx.fillRect(penX - 12, penZ - 12, 24, 24);
    
    // Draw corn piles if active
    gameState.cornPiles.forEach(pile => {
        const cornX = ((pile.location.x + 30) / 60) * 180 + 10;
        const cornZ = ((pile.location.z + 30) / 60) * 180 + 10;
        minimapCtx.fillStyle = 'rgba(255, 215, 0, 1)'; // Gold
        minimapCtx.beginPath();
        minimapCtx.arc(cornX, cornZ, 5, 0, Math.PI * 2);
        minimapCtx.fill();
        
        // Pulsing ring
        const pulseSize = 8 + Math.sin(Date.now() / 200) * 3;
        minimapCtx.strokeStyle = 'rgba(255, 215, 0, 0.6)';
        minimapCtx.lineWidth = 2;
        minimapCtx.beginPath();
        minimapCtx.arc(cornX, cornZ, pulseSize, 0, Math.PI * 2);
        minimapCtx.stroke();
    });
    
    // Helper function to convert world coords to minimap coords
    const worldToMinimap = (x, z) => {
        return {
            x: ((x + 30) / 60) * 180 + 10,
            y: ((z + 30) / 60) * 180 + 10
        };
    };
    
    // Draw chickens
    gameState.chickens.forEach(chicken => {
        const pos = worldToMinimap(chicken.mesh.position.x, chicken.mesh.position.z);
        
        // Color based on status
        let color;
        if (chicken.inBounds) {
            color = 'rgba(255, 255, 255, 0.9)'; // White - safe
        } else if (chicken.outOfBoundsTimer < 20) {
            color = 'rgba(255, 165, 0, 0.9)'; // Orange - warning
        } else {
            color = 'rgba(255, 100, 100, 0.9)'; // Red - escaped
        }
        
        minimapCtx.fillStyle = color;
        minimapCtx.beginPath();
        minimapCtx.arc(pos.x, pos.y, 3, 0, Math.PI * 2);
        minimapCtx.fill();
        
        // Show warning ring if out of bounds but not yet escaped
        if (!chicken.inBounds && chicken.outOfBoundsTimer < 20) {
            minimapCtx.strokeStyle = 'rgba(255, 165, 0, 0.6)';
            minimapCtx.lineWidth = 1;
            minimapCtx.beginPath();
            minimapCtx.arc(pos.x, pos.y, 5, 0, Math.PI * 2);
            minimapCtx.stroke();
        }
    });
    
    // Draw ducks
    gameState.ducks.forEach(duck => {
        const pos = worldToMinimap(duck.mesh.position.x, duck.mesh.position.z);
        
        // Color based on status
        let color;
        if (duck.inBounds) {
            color = 'rgba(255, 215, 0, 0.9)'; // Gold - safe
        } else if (duck.outOfBoundsTimer < 20) {
            color = 'rgba(255, 165, 0, 0.9)'; // Orange - warning
        } else {
            color = 'rgba(255, 100, 100, 0.9)'; // Red - escaped
        }
        
        minimapCtx.fillStyle = color;
        minimapCtx.beginPath();
        minimapCtx.arc(pos.x, pos.y, 3, 0, Math.PI * 2);
        minimapCtx.fill();
        
        // Show warning ring if out of bounds but not yet escaped
        if (!duck.inBounds && duck.outOfBoundsTimer < 20) {
            minimapCtx.strokeStyle = 'rgba(255, 165, 0, 0.6)';
            minimapCtx.lineWidth = 1;
            minimapCtx.beginPath();
            minimapCtx.arc(pos.x, pos.y, 5, 0, Math.PI * 2);
            minimapCtx.stroke();
        }
    });
    
    // Draw predators
    gameState.predators.forEach(predator => {
        const pos = worldToMinimap(predator.mesh.position.x, predator.mesh.position.z);
        minimapCtx.fillStyle = predator.type === 'hawk' ? 'rgba(255, 0, 0, 0.9)' : 'rgba(200, 0, 0, 0.9)';
        minimapCtx.beginPath();
        minimapCtx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
        minimapCtx.fill();
        
        // Add warning ring for predators
        minimapCtx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
        minimapCtx.lineWidth = 1;
        minimapCtx.beginPath();
        minimapCtx.arc(pos.x, pos.y, 8, 0, Math.PI * 2);
        minimapCtx.stroke();
    });
    
    // Draw visitor (Liz)
    if (gameState.visitor) {
        const pos = worldToMinimap(gameState.visitor.mesh.position.x, gameState.visitor.mesh.position.z);
        
        // Draw a heart shape for Liz
        minimapCtx.fillStyle = 'rgba(255, 20, 147, 1)'; // Deep pink/red
        minimapCtx.beginPath();
        
        // Heart shape using bezier curves - increased size
        const heartSize = 8; // Increased from 5 to 8
        const topCurveHeight = heartSize * 0.3;
        
        // Start at bottom point
        minimapCtx.moveTo(pos.x, pos.y + heartSize * 0.3);
        
        // Left side of heart
        minimapCtx.bezierCurveTo(
            pos.x, pos.y - heartSize * 0.1,
            pos.x - heartSize, pos.y - heartSize * 0.1,
            pos.x - heartSize * 0.5, pos.y - heartSize * 0.7
        );
        
        // Top left curve
        minimapCtx.bezierCurveTo(
            pos.x - heartSize * 0.5, pos.y - heartSize,
            pos.x, pos.y - heartSize,
            pos.x, pos.y - heartSize * 0.5
        );
        
        // Top right curve
        minimapCtx.bezierCurveTo(
            pos.x, pos.y - heartSize,
            pos.x + heartSize * 0.5, pos.y - heartSize,
            pos.x + heartSize * 0.5, pos.y - heartSize * 0.7
        );
        
        // Right side of heart
        minimapCtx.bezierCurveTo(
            pos.x + heartSize, pos.y - heartSize * 0.1,
            pos.x, pos.y - heartSize * 0.1,
            pos.x, pos.y + heartSize * 0.3
        );
        
        minimapCtx.fill();
        
        // Add white outline for better visibility
        minimapCtx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        minimapCtx.lineWidth = 1.5; // Slightly thicker outline
        minimapCtx.stroke();
    }
    
    // Draw player
    if (gameState.player) {
        const pos = worldToMinimap(gameState.player.mesh.position.x, gameState.player.mesh.position.z);
        minimapCtx.fillStyle = 'rgba(0, 150, 255, 1)'; // Blue
        minimapCtx.beginPath();
        minimapCtx.arc(pos.x, pos.y, 5, 0, Math.PI * 2);
        minimapCtx.fill();
        
        // Direction indicator
        minimapCtx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        minimapCtx.lineWidth = 2;
        minimapCtx.beginPath();
        minimapCtx.moveTo(pos.x, pos.y);
        const angle = gameState.player.mesh.rotation.y;
        minimapCtx.lineTo(
            pos.x + Math.sin(angle) * 10,
            pos.y + Math.cos(angle) * 10
        );
        minimapCtx.stroke();
    }
}

// Toggle coop interior/exterior
function toggleCoop() {
    gameState.inCoop = !gameState.inCoop;
    
    if (gameState.inCoop) {
        // Entering coop
        gameState.coopInterior.visible = true;
        gameState.coopInterior.position.copy(gameState.coopPosition);
        
        // Save current camera angles to restore on exit
        gameState.savedCameraAngleH = cameraAngleH;
        gameState.savedCameraAngleV = cameraAngleV;
        
        // Reset camera to look forward into coop
        cameraAngleH = 0;
        cameraAngleV = 0;
        
        // Hide player model
        gameState.player.mesh.visible = false;
        
        // Show hands and basket
        gameState.playerHands.visible = true;
        
        // Position camera for first-person view inside coop
        camera.position.set(
            gameState.coopPosition.x,
            gameState.coopPosition.y + 1.6,
            gameState.coopPosition.z + 1
        );
        
        // Make sure pointer is locked for looking around
        if (!isPointerLocked) {
            renderer.domElement.requestPointerLock();
        }
        
        // Track eggs collected at start of this visit
        gameState.eggsAtVisitStart = gameState.eggsCollected;
        
        // Show eggs if available
        if (gameState.eggsAvailable) {
            gameState.nestBoxes.forEach(nest => {
                nest.egg.visible = !nest.collected;
            });
        }
        
        document.getElementById('coopPrompt').style.display = 'none';
        
        // Add crosshair for aiming
        if (!document.getElementById('crosshair')) {
            const crosshair = document.createElement('div');
            crosshair.id = 'crosshair';
            crosshair.style.cssText = `
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 20px;
                height: 20px;
                border: 2px solid white;
                border-radius: 50%;
                pointer-events: none;
                box-shadow: 0 0 5px black;
            `;
            document.body.appendChild(crosshair);
        }
    } else {
        // Exiting coop
        gameState.coopInterior.visible = false;
        gameState.player.mesh.visible = true;
        gameState.playerHands.visible = false;
        
        // Release pointer lock
        if (document.pointerLockElement) {
            document.exitPointerLock();
        }
        
        // Remove crosshair
        const crosshair = document.getElementById('crosshair');
        if (crosshair) crosshair.remove();
        
        // Calculate eggs collected THIS visit only
        const eggsThisSession = gameState.eggsCollected - gameState.eggsAtVisitStart;
        if (eggsThisSession > 0) {
            gameState.eggBaskets.push(eggsThisSession);
            updateEggDisplay();
            
            // Bonus for collecting all 8 eggs
            if (eggsThisSession === 8) {
                addScore(50, 'Full basket bonus!');
                gameState.consecutiveEggCollections++;
            } else {
                gameState.consecutiveEggCollections = 0;
            }
        }
        
        // Restore camera angles from before entering
        cameraAngleH = gameState.savedCameraAngleH;
        cameraAngleV = gameState.savedCameraAngleV;
        
        // Don't reset eggs or timer - they expire on their own schedule
    }
}

// Collect egg at crosshair
function collectEggAtCrosshair() {
    // Raycast from camera center
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    
    // Check which eggs we're looking at
    const eggs = gameState.nestBoxes
        .filter(nest => nest.egg.visible && !nest.collected)
        .map(nest => nest.egg);
    
    const intersects = raycaster.intersectObjects(eggs);
    
    if (intersects.length > 0) {
        // Found an egg!
        const egg = intersects[0].object;
        const nest = gameState.nestBoxes.find(n => n.egg === egg);
        
        if (nest) {
            nest.collected = true;
            nest.egg.visible = false;
            gameState.eggsCollected++;
            
            // Add score for collecting egg
            addScore(10, 'Egg collected');
            
            // Play sound effect
            audioSystem.playEggCollect();
            
            // Update UI
            document.getElementById('totalEggs').textContent = gameState.eggsCollected;
        }
    }
}

// Update egg basket display
function updateEggDisplay() {
    const basketsContainer = document.getElementById('eggBaskets');
    basketsContainer.innerHTML = '';
    
    gameState.eggBaskets.forEach((count, index) => {
        const basketDiv = document.createElement('div');
        basketDiv.className = 'basket';
        basketDiv.innerHTML = `
            <div class="basket-icon">🧺</div>
            <div>${count}</div>
        `;
        basketsContainer.appendChild(basketDiv);
    });
}

// Check if position collides with coop
function collidesWithCoop(x, z) {
    const coopX = gameState.coopPosition.x;
    const coopZ = gameState.coopPosition.z;
    const coopSize = 6.5; // Half-width of coop (slightly larger than actual 6 to prevent clipping)
    
    return (
        x > coopX - coopSize && x < coopX + coopSize &&
        z > coopZ - coopSize && z < coopZ + coopSize
    );
}

// Convert 3D world position to 2D screen position
function getScreenPosition(position, camera) {
    const vector = position.clone();
    vector.project(camera);
    
    const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
    const y = (vector.y * -0.5 + 0.5) * window.innerHeight;
    
    return { x, y };
}

// Scoring functions
function addScore(points, reason) {
    gameState.score += points;
    updateScoreDisplay();
    
    // Play sound effect
    if (points > 0) {
        audioSystem.playScoreIncrease();
    } else if (points < 0) {
        audioSystem.playScoreDecrease();
    }
    
    // Show floating score change
    showScoreChange(points, reason);
}

function updateScoreDisplay() {
    const scoreElement = document.getElementById('score');
    // Format with leading zeros (7 digits for that classic arcade feel)
    const formattedScore = gameState.score.toString().padStart(7, '0');
    scoreElement.textContent = formattedScore;
}

function showScoreChange(points, reason) {
    const changeDiv = document.createElement('div');
    changeDiv.className = `score-change ${points > 0 ? 'score-positive' : 'score-negative'}`;
    changeDiv.textContent = `${points > 0 ? '+' : ''}${points}`;
    changeDiv.style.left = '50%';
    changeDiv.style.top = '120px';
    changeDiv.style.transform = 'translateX(-50%)';
    document.body.appendChild(changeDiv);
    
    // Remove after animation
    setTimeout(() => {
        changeDiv.remove();
    }, 1000);
}

function animate() {
    requestAnimationFrame(animate);
    
    if (!gameState.started) {
        renderer.render(scene, camera);
        return;
    }
    
    const delta = clock.getDelta();
    gameState.gameTime += delta;
    
    // Survival bonus - award points every 60 seconds if all birds are alive
    gameState.survivalTimer += delta;
    if (gameState.survivalTimer >= 60) {
        gameState.survivalTimer = 0;
        const totalBirds = gameState.chickens.length + gameState.ducks.length;
        if (totalBirds === 13) { // All birds still alive (8 chickens + 5 ducks)
            addScore(25, 'All birds safe for 1 minute!');
        }
    }
    
    // Check for game completion (10 minutes)
    if (gameState.gameTime >= gameState.maxGameTime && !gameState.gameCompleted) {
        gameState.gameCompleted = true; // Prevent multiple alerts
        gameState.started = false; // Stop the game loop
        
        // Stop music
        audioSystem.stopAllMusic();
        
        // Clean up the scene - remove all game objects
        if (gameState.player) {
            scene.remove(gameState.player.mesh);
            scene.remove(gameState.playerHands);
        }
        gameState.chickens.forEach(chicken => scene.remove(chicken.mesh));
        gameState.ducks.forEach(duck => scene.remove(duck.mesh));
        gameState.predators.forEach(predator => scene.remove(predator.mesh));
        gameState.cornPiles.forEach(pile => scene.remove(pile.mesh));
        if (gameState.visitor) {
            scene.remove(gameState.visitor.mesh);
        }
        
        const totalBirds = gameState.chickens.length + gameState.ducks.length;
        let finalBonus = 500; // Base completion bonus
        
        if (totalBirds === 13) {
            finalBonus += 200; // All birds survived
        }
        if (gameState.eggsCollected >= 10) {
            finalBonus += 100; // Collected 10+ eggs
        }
        if (gameState.killed === 0) {
            finalBonus += 200; // No birds killed
        }
        
        addScore(finalBonus, 'Level complete!');
        
        showGameOverModal(true, gameState.score, {
            birdsRemaining: totalBirds,
            eggsCollected: gameState.eggsCollected,
            defeated: gameState.defeated,
            ranAway: gameState.ranAway,
            killed: gameState.killed
        });
        return;
    }
    
    // Update player
    if (gameState.player) {
        if (!gameState.inCoop) {
            gameState.player.update(delta, keys);
            gameState.player.updateStaffSwing(delta); // Update staff swing animation
            gameState.player.updateCornThrow(delta); // Update corn throw animation
            
            // Camera follows player with mouse-controlled angle
            const distance = 12;
            const height = 6;
            
            // Calculate camera position based on angles
            const offsetX = Math.sin(cameraAngleH) * distance * Math.cos(cameraAngleV);
            const offsetZ = Math.cos(cameraAngleH) * distance * Math.cos(cameraAngleV);
            const offsetY = height + Math.sin(cameraAngleV) * distance;
            
            camera.position.set(
                gameState.player.mesh.position.x + offsetX,
                gameState.player.mesh.position.y + offsetY,
                gameState.player.mesh.position.z + offsetZ
            );
            
            camera.lookAt(gameState.player.mesh.position);
        } else {
            // First-person view in coop
            camera.position.set(
                gameState.coopPosition.x,
                gameState.coopPosition.y + 1.6,
                gameState.coopPosition.z + 1
            );
            
            // Look around with mouse (using camera rotation directly)
            const lookDirection = new THREE.Vector3(
                Math.sin(cameraAngleH) * Math.cos(cameraAngleV),
                Math.sin(cameraAngleV),
                Math.cos(cameraAngleH) * Math.cos(cameraAngleV)
            );
            camera.lookAt(
                camera.position.x + lookDirection.x,
                camera.position.y + lookDirection.y,
                camera.position.z + lookDirection.z
            );
        }
    }
    
    // Update birds
    for (let i = gameState.chickens.length - 1; i >= 0; i--) {
        const bird = gameState.chickens[i];
        const shouldRemove = bird.update(delta, gameState.player, gameState.predators);
        
        if (shouldRemove || bird.killed) {
            scene.remove(bird.mesh);
            gameState.chickens.splice(i, 1);
            if (bird.killed) {
                gameState.killed++;
                addScore(-100, 'Bird killed');
                audioSystem.playBirdCaptured();
            } else if (shouldRemove) {
                // Bird ran away
                addScore(-50, 'Bird ran away');
            }
        }
    }
    
    for (let i = gameState.ducks.length - 1; i >= 0; i--) {
        const bird = gameState.ducks[i];
        const shouldRemove = bird.update(delta, gameState.player, gameState.predators);
        
        if (shouldRemove || bird.killed) {
            scene.remove(bird.mesh);
            gameState.ducks.splice(i, 1);
            if (bird.killed) {
                gameState.killed++;
                addScore(-100, 'Bird killed');
                audioSystem.playBirdCaptured();
            } else if (shouldRemove) {
                // Bird ran away
                addScore(-50, 'Bird ran away');
            }
        }
    }
    
    // Check for game over
    if (gameState.chickens.length === 0 && gameState.ducks.length === 0 && !gameState.gameCompleted) {
        gameState.gameCompleted = true; // Prevent multiple alerts
        gameState.started = false; // Stop the game loop
        
        // Stop music
        audioSystem.stopAllMusic();
        
        // Clean up the scene - remove all game objects
        if (gameState.player) {
            scene.remove(gameState.player.mesh);
            scene.remove(gameState.playerHands);
        }
        gameState.predators.forEach(predator => scene.remove(predator.mesh));
        gameState.cornPiles.forEach(pile => scene.remove(pile.mesh));
        if (gameState.visitor) {
            scene.remove(gameState.visitor.mesh);
        }
        
        showGameOverModal(false, gameState.score, {
            eggsCollected: gameState.eggsCollected,
            defeated: gameState.defeated,
            ranAway: gameState.ranAway,
            killed: gameState.killed
        });
        return;
    }
    
    // Update corn piles
    for (let i = gameState.cornPiles.length - 1; i >= 0; i--) {
        const pile = gameState.cornPiles[i];
        pile.timer -= delta;
        if (pile.timer <= 0) {
            // Remove expired corn pile
            scene.remove(pile.mesh);
            gameState.cornPiles.splice(i, 1);
        }
    }
    
    // Update corn particles
    for (let i = gameState.cornParticles.length - 1; i >= 0; i--) {
        const particle = gameState.cornParticles[i];
        particle.life -= delta;
        
        if (particle.life <= 0) {
            scene.remove(particle.mesh);
            gameState.cornParticles.splice(i, 1);
        } else {
            particle.mesh.position.add(particle.mesh.velocity.clone().multiplyScalar(delta));
            particle.mesh.velocity.y -= delta * 5; // Gravity
            
            if (particle.mesh.position.y < 0.1) {
                particle.mesh.position.y = 0.1;
                particle.mesh.velocity.multiplyScalar(0.5);
            }
        }
    }
    
    // Update egg timer (runs continuously, regardless of player location)
    if (!gameState.eggsAvailable) {
        gameState.eggTimer -= delta;
        if (gameState.eggTimer <= 0) {
            gameState.eggsAvailable = true;
            gameState.eggAvailableTimer = 60; // Eggs available for 60 seconds
            gameState.coopGlow.visible = true;
            
            // If player is in coop, show eggs immediately
            if (gameState.inCoop) {
                gameState.nestBoxes.forEach(nest => {
                    nest.egg.visible = !nest.collected;
                });
            }
        }
    }
    
    // If eggs are available, count down the availability timer
    if (gameState.eggsAvailable) {
        gameState.eggAvailableTimer -= delta;
        
        // Blink warning at 15 seconds remaining
        if (gameState.eggAvailableTimer <= 15) {
            const blinkSpeed = 5;
            gameState.coopGlow.visible = Math.sin(Date.now() / 1000 * blinkSpeed) > 0;
        }
        
        // Eggs expire
        if (gameState.eggAvailableTimer <= 0) {
            gameState.eggsAvailable = false;
            gameState.coopGlow.visible = false;
            gameState.eggTimer = 60; // Reset timer for next batch
            
            // Hide all eggs (whether player is in coop or not)
            gameState.nestBoxes.forEach(nest => {
                nest.egg.visible = false;
                nest.collected = false;
            });
        }
    }
    
    // Update coop glow pulse (when not blinking)
    if (gameState.coopGlow.visible && gameState.eggAvailableTimer > 15) {
        const pulseSpeed = 2;
        gameState.coopGlow.material.opacity = 0.15 + Math.sin(Date.now() / 1000 * pulseSpeed) * 0.1;
    }
    
    // Show coop prompt when near door (outside only)
    if (gameState.player && !gameState.inCoop) {
        const doorPos = new THREE.Vector3(
            gameState.coopPosition.x,
            0,
            gameState.coopPosition.z + 6.5
        );
        const distToDoor = gameState.player.mesh.position.distanceTo(doorPos);
        const coopPrompt = document.getElementById('coopPrompt');
        
        if (distToDoor < 4) {
            coopPrompt.style.display = 'block';
            if (gameState.eggsAvailable) {
                const timeLeft = Math.ceil(gameState.eggAvailableTimer);
                coopPrompt.textContent = `Press E to collect eggs 🥚 (${timeLeft}s left)`;
            } else {
                const timeLeft = Math.ceil(gameState.eggTimer);
                const minutes = Math.floor(timeLeft / 60);
                const seconds = timeLeft % 60;
                coopPrompt.textContent = `Press E - Eggs in ${minutes}:${seconds.toString().padStart(2, '0')}`;
            }
        } else {
            coopPrompt.style.display = 'none';
        }
    }
    
    // Show timer inside coop
    const coopTimer = document.getElementById('coopTimer');
    if (gameState.inCoop) {
        coopTimer.style.display = 'block';
        if (gameState.eggsAvailable) {
            const timeLeft = Math.ceil(gameState.eggAvailableTimer);
            coopTimer.innerHTML = `<div>🥚 Eggs Available!</div><div style="font-size: 16px; margin-top: 5px;">Expires in ${timeLeft}s</div>`;
            
            // Warning color when time is running out
            if (timeLeft <= 15) {
                coopTimer.style.background = 'rgba(139, 0, 0, 0.8)';
            } else {
                coopTimer.style.background = 'rgba(0, 0, 0, 0.8)';
            }
        } else {
            const timeLeft = Math.ceil(gameState.eggTimer);
            const minutes = Math.floor(timeLeft / 60);
            const seconds = timeLeft % 60;
            coopTimer.innerHTML = `<div>Next eggs in</div><div style="font-size: 24px; margin-top: 5px;">${minutes}:${seconds.toString().padStart(2, '0')}</div>`;
            coopTimer.style.background = 'rgba(0, 0, 0, 0.8)';
        }
    } else {
        coopTimer.style.display = 'none';
    }
    
    // Update predators
    predatorSpawnTimer -= delta;
    if (predatorSpawnTimer <= 0) {
        gameState.predators.push(new Predator('dog'));
        predatorSpawnTimer = 20 + Math.random() * 10;
    }
    
    hawkSpawnTimer -= delta;
    if (hawkSpawnTimer <= 0) {
        gameState.predators.push(new Predator('hawk'));
        hawkSpawnTimer = 30 + Math.random() * 15;
    }
    
    for (let i = gameState.predators.length - 1; i >= 0; i--) {
        const allBirds = [...gameState.chickens, ...gameState.ducks];
        const shouldRemove = gameState.predators[i].update(delta, allBirds, gameState.player);
        if (shouldRemove) {
            scene.remove(gameState.predators[i].mesh);
            gameState.predators.splice(i, 1);
            gameState.defeated++;
            addScore(20, 'Predator scared away');
            audioSystem.playPredatorScared();
        }
    }
    
    // Update visitor (Liz)
    visitorSpawnTimer -= delta;
    if (visitorSpawnTimer <= 0 && !gameState.visitor) {
        gameState.visitor = new Visitor();
        visitorSpawnTimer = 180 + Math.random() * 120; // Next visit in 3-5 minutes
    }
    
    if (gameState.visitor) {
        const allBirds = [...gameState.chickens, ...gameState.ducks];
        const shouldRemove = gameState.visitor.update(delta, allBirds, gameState.player);
        if (shouldRemove) {
            scene.remove(gameState.visitor.mesh);
            gameState.visitor = null;
            
            // Reset spawn timer for next visit
            visitorSpawnTimer = 180 + Math.random() * 120; // Next visit in 3-5 minutes
            
            // Switch music back to appropriate mode
            if (walkmanSystem.mode === 'game') {
                if (gameState.predators.length > 0) {
                    audioSystem.switchMusicMode('danger');
                } else {
                    audioSystem.switchMusicMode('calm');
                }
            }
        }
        
        // Update greeting bubble position if it exists
        const greetingBubble = document.getElementById('lizGreeting');
        if (greetingBubble && gameState.player) {
            const playerScreenPos = getScreenPosition(gameState.player.mesh.position, camera);
            greetingBubble.style.left = playerScreenPos.x + 'px';
            greetingBubble.style.top = (playerScreenPos.y - 100) + 'px';
        }
        
        // Update goodbye bubble position if it exists
        const goodbyeBubble = document.getElementById('lizGoodbye');
        if (goodbyeBubble && gameState.player) {
            const playerScreenPos = getScreenPosition(gameState.player.mesh.position, camera);
            goodbyeBubble.style.left = playerScreenPos.x + 'px';
            goodbyeBubble.style.top = (playerScreenPos.y - 100) + 'px';
        }
    }
    
    // Switch music based on game state (only if in game music mode)
    if (walkmanSystem.mode === 'game') {
        if (gameState.predators.length > 0) {
            // Predators take priority
            audioSystem.switchMusicMode('danger');
        } else if (gameState.visitor) {
            // Liz music when no predators
            audioSystem.switchMusicMode('liz');
        } else {
            audioSystem.switchMusicMode('calm');
        }
    }
    
    // Update UI
    const timeRemaining = gameState.maxGameTime - gameState.gameTime;
    const minutes = Math.floor(timeRemaining / 60);
    const seconds = Math.floor(timeRemaining % 60);
    document.getElementById('timer').textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    
    const chickensInBounds = gameState.chickens.filter(c => c.inBounds).length;
    const ducksInBounds = gameState.ducks.filter(d => d.inBounds).length;
    document.getElementById('chickens').textContent = gameState.chickens.length;
    document.getElementById('ducks').textContent = gameState.ducks.length;
    document.getElementById('escaped').textContent = gameState.ranAway;
    document.getElementById('killed').textContent = gameState.killed;
    document.getElementById('predators').textContent = gameState.defeated;
    document.getElementById('corn').textContent = gameState.cornCharges;
    
    // Draw minimap
    drawMinimap();
    
    renderer.render(scene, camera);
}

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Initialize walkman system on page load (before game starts)
walkmanSystem.init();

// Initialize timer display with correct game time
setTimeout(() => {
    const minutes = Math.floor(gameState.maxGameTime / 60);
    const seconds = Math.floor(gameState.maxGameTime % 60);
    const timerElement = document.getElementById('timer');
    if (timerElement) {
        timerElement.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
}, 0);

animate();
