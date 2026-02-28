// Audio system for Poultry Patrol
// Creates retro arcade-style music and sound effects using Web Audio API

class AudioSystem {
    constructor() {
        this.audioContext = null;
        this.musicGainNode = null;
        this.sfxGainNode = null;
        this.musicVolume = 0.3;
        this.sfxVolume = 0.5;
        this.currentMusicMode = null; // Start with no music mode
        this.musicTimeout = null;
        this.scheduledOscillators = []; // Track all scheduled oscillators
    }

    init() {
        // Create audio context (must be done after user interaction)
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // Create gain nodes for volume control
        this.musicGainNode = this.audioContext.createGain();
        this.musicGainNode.gain.value = this.musicVolume;
        this.musicGainNode.connect(this.audioContext.destination);
        
        this.sfxGainNode = this.audioContext.createGain();
        this.sfxGainNode.gain.value = this.sfxVolume;
        this.sfxGainNode.connect(this.audioContext.destination);
    }

    // Play a single note and track the oscillator
    playNote(frequency, duration, startTime, gainNode) {
        const oscillator = this.audioContext.createOscillator();
        const noteGain = this.audioContext.createGain();
        
        oscillator.type = 'square'; // Retro square wave sound
        oscillator.frequency.value = frequency;
        
        // Envelope for more natural sound
        noteGain.gain.setValueAtTime(0, startTime);
        noteGain.gain.linearRampToValueAtTime(0.3, startTime + 0.01);
        noteGain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
        
        oscillator.connect(noteGain);
        noteGain.connect(gainNode);
        
        oscillator.start(startTime);
        oscillator.stop(startTime + duration);
        
        // Track this oscillator so we can stop it if needed
        this.scheduledOscillators.push(oscillator);
        
        // Clean up after it stops
        oscillator.onended = () => {
            const index = this.scheduledOscillators.indexOf(oscillator);
            if (index > -1) {
                this.scheduledOscillators.splice(index, 1);
            }
        };
    }

    // Stop all currently scheduled music
    stopAllMusic() {
        if (!this.audioContext) return;
        
        // Clear timeout to prevent music from looping
        if (this.musicTimeout) {
            clearTimeout(this.musicTimeout);
            this.musicTimeout = null;
        }
        
        // Stop all scheduled oscillators
        this.scheduledOscillators.forEach(osc => {
            try {
                osc.stop(0);
            } catch (e) {
                // Oscillator may have already stopped or not started
            }
        });
        this.scheduledOscillators = [];
    }

    // Background music - upbeat arcade style melody
    playBackgroundMusic() {
        if (!this.audioContext) return;
        
        const tempo = 0.25; // Slower tempo
        const currentTime = this.audioContext.currentTime;
        
        // Note frequencies (in Hz)
        const notes = {
            C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.00, A3: 220.00, B3: 246.94,
            C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, B4: 493.88,
            C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.00
        };
        
        // Longer, more complex melody with multiple sections
        const melody = [
            // Section A - Main theme (upbeat and cheerful)
            { note: notes.G4, duration: tempo },
            { note: notes.E4, duration: tempo },
            { note: notes.C4, duration: tempo },
            { note: notes.E4, duration: tempo },
            { note: notes.G4, duration: tempo * 1.5 },
            { note: notes.A4, duration: tempo * 0.5 },
            { note: notes.G4, duration: tempo * 2 },
            
            { note: notes.F4, duration: tempo },
            { note: notes.D4, duration: tempo },
            { note: notes.B3, duration: tempo },
            { note: notes.D4, duration: tempo },
            { note: notes.F4, duration: tempo * 1.5 },
            { note: notes.G4, duration: tempo * 0.5 },
            { note: notes.F4, duration: tempo * 2 },
            
            // Section B - Variation
            { note: notes.E4, duration: tempo },
            { note: notes.G4, duration: tempo },
            { note: notes.C5, duration: tempo },
            { note: notes.B4, duration: tempo },
            { note: notes.A4, duration: tempo },
            { note: notes.G4, duration: tempo },
            { note: notes.F4, duration: tempo },
            { note: notes.E4, duration: tempo },
            
            { note: notes.D4, duration: tempo },
            { note: notes.F4, duration: tempo },
            { note: notes.A4, duration: tempo },
            { note: notes.G4, duration: tempo },
            { note: notes.F4, duration: tempo },
            { note: notes.E4, duration: tempo },
            { note: notes.D4, duration: tempo * 2 },
            
            // Section C - Bridge (calmer)
            { note: notes.C4, duration: tempo * 1.5 },
            { note: notes.D4, duration: tempo * 0.5 },
            { note: notes.E4, duration: tempo },
            { note: notes.F4, duration: tempo },
            { note: notes.G4, duration: tempo * 2 },
            
            { note: notes.A4, duration: tempo * 1.5 },
            { note: notes.B4, duration: tempo * 0.5 },
            { note: notes.C5, duration: tempo },
            { note: notes.B4, duration: tempo },
            { note: notes.A4, duration: tempo * 2 },
            
            // Section D - Build up
            { note: notes.G4, duration: tempo },
            { note: notes.A4, duration: tempo },
            { note: notes.B4, duration: tempo },
            { note: notes.C5, duration: tempo },
            { note: notes.D5, duration: tempo },
            { note: notes.E5, duration: tempo },
            { note: notes.D5, duration: tempo },
            { note: notes.C5, duration: tempo },
            
            // Section E - Finale
            { note: notes.G4, duration: tempo },
            { note: notes.E4, duration: tempo },
            { note: notes.C4, duration: tempo },
            { note: notes.E4, duration: tempo },
            { note: notes.G4, duration: tempo },
            { note: notes.C5, duration: tempo },
            { note: notes.E5, duration: tempo },
            { note: notes.C5, duration: tempo },
            
            { note: notes.G4, duration: tempo * 1.5 },
            { note: notes.F4, duration: tempo * 0.5 },
            { note: notes.E4, duration: tempo },
            { note: notes.D4, duration: tempo },
            { note: notes.C4, duration: tempo * 3 }
        ];
        
        // Play the melody
        let time = currentTime;
        melody.forEach(({ note, duration }) => {
            this.playNote(note, duration, time, this.musicGainNode);
            time += duration;
        });
        
        // Loop the music
        const totalDuration = (time - currentTime) * 1000;
        this.musicTimeout = setTimeout(() => {
            if (this.currentMusicMode === 'calm') {
                this.playBackgroundMusic();
            }
        }, totalDuration);
    }

    // Danger music - plays when predators are present
    playDangerMusic() {
        if (!this.audioContext) return;
        
        const tempo = 0.2; // Slightly faster, more urgent
        const currentTime = this.audioContext.currentTime;
        
        // Note frequencies (in Hz) - using minor key for ominous feel
        const notes = {
            C3: 130.81, D3: 146.83, Eb3: 155.56, F3: 174.61, G3: 196.00, Ab3: 207.65, Bb3: 233.08,
            C4: 261.63, D4: 293.66, Eb4: 311.13, F4: 349.23, G4: 392.00, Ab4: 415.30, Bb4: 466.16,
            C5: 523.25, D5: 587.33, Eb5: 622.25, F5: 698.46, G5: 783.99
        };
        
        // Ominous, tense melody in minor key
        const melody = [
            // Dark ascending pattern
            { note: notes.C4, duration: tempo },
            { note: notes.Eb4, duration: tempo },
            { note: notes.G4, duration: tempo },
            { note: notes.C5, duration: tempo },
            { note: notes.Bb4, duration: tempo },
            { note: notes.Ab4, duration: tempo },
            { note: notes.G4, duration: tempo * 2 },
            
            // Descending tension
            { note: notes.F4, duration: tempo },
            { note: notes.Eb4, duration: tempo },
            { note: notes.D4, duration: tempo },
            { note: notes.C4, duration: tempo },
            { note: notes.Bb3, duration: tempo },
            { note: notes.Ab3, duration: tempo },
            { note: notes.G3, duration: tempo * 2 },
            
            // Urgent pattern
            { note: notes.C4, duration: tempo * 0.5 },
            { note: notes.C4, duration: tempo * 0.5 },
            { note: notes.Eb4, duration: tempo },
            { note: notes.G4, duration: tempo },
            { note: notes.F4, duration: tempo * 0.5 },
            { note: notes.F4, duration: tempo * 0.5 },
            { note: notes.Ab4, duration: tempo },
            { note: notes.G4, duration: tempo * 2 },
            
            // Building tension
            { note: notes.Eb4, duration: tempo },
            { note: notes.F4, duration: tempo },
            { note: notes.G4, duration: tempo },
            { note: notes.Ab4, duration: tempo },
            { note: notes.Bb4, duration: tempo },
            { note: notes.C5, duration: tempo },
            { note: notes.Bb4, duration: tempo },
            { note: notes.Ab4, duration: tempo },
            
            // Climax and resolution
            { note: notes.G4, duration: tempo * 1.5 },
            { note: notes.F4, duration: tempo * 0.5 },
            { note: notes.Eb4, duration: tempo },
            { note: notes.D4, duration: tempo },
            { note: notes.C4, duration: tempo * 3 }
        ];
        
        // Play the melody
        let time = currentTime;
        melody.forEach(({ note, duration }) => {
            this.playNote(note, duration, time, this.musicGainNode);
            time += duration;
        });
        
        // Loop the music
        const totalDuration = (time - currentTime) * 1000;
        this.musicTimeout = setTimeout(() => {
            if (this.currentMusicMode === 'danger') {
                this.playDangerMusic();
            }
        }, totalDuration);
    }

    // Liz music - super upbeat and happy
    playLizMusic() {
        if (!this.audioContext) return;
        
        const tempo = 0.2; // Fast, energetic tempo
        const currentTime = this.audioContext.currentTime;
        
        // Note frequencies - major key, bright and cheerful
        const notes = {
            C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, B4: 493.88,
            C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.00, B5: 987.77
        };
        
        // Super happy, bouncy melody
        const melody = [
            // Bouncy opening
            { note: notes.C5, duration: tempo * 0.5 },
            { note: notes.E5, duration: tempo * 0.5 },
            { note: notes.G5, duration: tempo },
            { note: notes.E5, duration: tempo * 0.5 },
            { note: notes.C5, duration: tempo * 0.5 },
            { note: notes.G4, duration: tempo },
            
            { note: notes.A4, duration: tempo * 0.5 },
            { note: notes.C5, duration: tempo * 0.5 },
            { note: notes.E5, duration: tempo },
            { note: notes.D5, duration: tempo },
            { note: notes.C5, duration: tempo * 2 },
            
            // Ascending joy
            { note: notes.D5, duration: tempo * 0.5 },
            { note: notes.E5, duration: tempo * 0.5 },
            { note: notes.F5, duration: tempo * 0.5 },
            { note: notes.G5, duration: tempo * 0.5 },
            { note: notes.A5, duration: tempo },
            { note: notes.G5, duration: tempo },
            { note: notes.F5, duration: tempo },
            { note: notes.E5, duration: tempo },
            
            // Happy skip
            { note: notes.G5, duration: tempo * 0.5 },
            { note: notes.E5, duration: tempo * 0.5 },
            { note: notes.C5, duration: tempo },
            { note: notes.G5, duration: tempo * 0.5 },
            { note: notes.E5, duration: tempo * 0.5 },
            { note: notes.C5, duration: tempo },
            
            // Playful ending
            { note: notes.F5, duration: tempo },
            { note: notes.E5, duration: tempo },
            { note: notes.D5, duration: tempo },
            { note: notes.C5, duration: tempo * 2 }
        ];
        
        // Play the melody
        let time = currentTime;
        melody.forEach(({ note, duration }) => {
            this.playNote(note, duration, time, this.musicGainNode);
            time += duration;
        });
        
        // Loop the music
        const totalDuration = (time - currentTime) * 1000;
        this.musicTimeout = setTimeout(() => {
            if (this.currentMusicMode === 'liz') {
                this.playLizMusic();
            }
        }, totalDuration);
    }

    // Switch music mode based on game state
    switchMusicMode(mode, forcePlay = false) {
        // Don't switch if already in this mode (unless forced)
        if (!forcePlay && this.currentMusicMode === mode) {
            return;
        }
        
        // Always update the current mode (what SHOULD be playing)
        const previousMode = this.currentMusicMode;
        this.currentMusicMode = mode;
        
        // Check if we're in walkman mode
        const isWalkmanMode = (typeof walkmanSystem !== 'undefined' && walkmanSystem.mode === 'walkman');
        
        if (isWalkmanMode) {
            // In walkman mode - mute game music but let it continue
            if (this.musicGainNode) {
                this.musicGainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
            }
        } else {
            // In game mode - unmute and switch music if needed
            if (this.musicGainNode) {
                this.musicGainNode.gain.setValueAtTime(this.musicVolume, this.audioContext.currentTime);
            }
            
            // Only restart music if we're switching to a different mode
            if (previousMode !== mode) {
                // Stop current music
                this.stopAllMusic();
                
                // Start the appropriate music
                if (mode === 'danger') {
                    this.playDangerMusic();
                } else if (mode === 'liz') {
                    this.playLizMusic();
                } else {
                    this.playBackgroundMusic();
                }
            }
        }
    }

    // Sound effect: Egg collected
    playEggCollect() {
        if (!this.audioContext) return;
        
        const currentTime = this.audioContext.currentTime;
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(800, currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(1200, currentTime + 0.1);
        
        gainNode.gain.setValueAtTime(0.3, currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, currentTime + 0.1);
        
        oscillator.connect(gainNode);
        gainNode.connect(this.sfxGainNode);
        
        oscillator.start(currentTime);
        oscillator.stop(currentTime + 0.1);
    }

    // Sound effect: Predator scared
    playPredatorScared() {
        if (!this.audioContext) return;
        
        const currentTime = this.audioContext.currentTime;
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(400, currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(100, currentTime + 0.3);
        
        gainNode.gain.setValueAtTime(0.2, currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, currentTime + 0.3);
        
        oscillator.connect(gainNode);
        gainNode.connect(this.sfxGainNode);
        
        oscillator.start(currentTime);
        oscillator.stop(currentTime + 0.3);
    }

    // Sound effect: Bird captured/killed
    playBirdCaptured() {
        if (!this.audioContext) return;
        
        const currentTime = this.audioContext.currentTime;
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(600, currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(200, currentTime + 0.4);
        
        gainNode.gain.setValueAtTime(0.3, currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, currentTime + 0.4);
        
        oscillator.connect(gainNode);
        gainNode.connect(this.sfxGainNode);
        
        oscillator.start(currentTime);
        oscillator.stop(currentTime + 0.4);
    }

    // Sound effect: Corn thrown
    playCornThrow() {
        if (!this.audioContext) return;
        
        const currentTime = this.audioContext.currentTime;
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(300, currentTime);
        oscillator.frequency.linearRampToValueAtTime(150, currentTime + 0.15);
        
        gainNode.gain.setValueAtTime(0.2, currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, currentTime + 0.15);
        
        oscillator.connect(gainNode);
        gainNode.connect(this.sfxGainNode);
        
        oscillator.start(currentTime);
        oscillator.stop(currentTime + 0.15);
    }

    // Sound effect: Score increase
    playScoreIncrease() {
        if (!this.audioContext) return;
        
        const currentTime = this.audioContext.currentTime;
        
        // Quick ascending arpeggio
        [523.25, 659.25, 783.99].forEach((freq, i) => {
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.type = 'square';
            oscillator.frequency.value = freq;
            
            const startTime = currentTime + (i * 0.05);
            gainNode.gain.setValueAtTime(0.15, startTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.1);
            
            oscillator.connect(gainNode);
            gainNode.connect(this.sfxGainNode);
            
            oscillator.start(startTime);
            oscillator.stop(startTime + 0.1);
        });
    }

    // Sound effect: Score decrease
    playScoreDecrease() {
        if (!this.audioContext) return;
        
        const currentTime = this.audioContext.currentTime;
        
        // Quick descending tone
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(400, currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(200, currentTime + 0.2);
        
        gainNode.gain.setValueAtTime(0.2, currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, currentTime + 0.2);
        
        oscillator.connect(gainNode);
        gainNode.connect(this.sfxGainNode);
        
        oscillator.start(currentTime);
        oscillator.stop(currentTime + 0.2);
    }

    // Sound effect: Chicken squawk (when herded back)
    playChickenSquawk() {
        if (!this.audioContext) return;
        
        const currentTime = this.audioContext.currentTime;
        
        // Rapid frequency modulation for squawk effect
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.type = 'square';
        
        // Quick warbling pattern
        oscillator.frequency.setValueAtTime(800, currentTime);
        oscillator.frequency.linearRampToValueAtTime(1200, currentTime + 0.05);
        oscillator.frequency.linearRampToValueAtTime(900, currentTime + 0.1);
        oscillator.frequency.linearRampToValueAtTime(1100, currentTime + 0.15);
        oscillator.frequency.linearRampToValueAtTime(800, currentTime + 0.2);
        
        gainNode.gain.setValueAtTime(0.15, currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, currentTime + 0.2);
        
        oscillator.connect(gainNode);
        gainNode.connect(this.sfxGainNode);
        
        oscillator.start(currentTime);
        oscillator.stop(currentTime + 0.2);
    }

    // Sound effect: Duck quack (when herded back)
    playDuckQuack() {
        if (!this.audioContext) return;
        
        const currentTime = this.audioContext.currentTime;
        
        // Lower, more nasal sound for duck
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.type = 'sawtooth';
        
        // Quack pattern - quick drop
        oscillator.frequency.setValueAtTime(400, currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(200, currentTime + 0.1);
        
        // Sharp attack, quick decay
        gainNode.gain.setValueAtTime(0.2, currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, currentTime + 0.15);
        
        oscillator.connect(gainNode);
        gainNode.connect(this.sfxGainNode);
        
        oscillator.start(currentTime);
        oscillator.stop(currentTime + 0.15);
    }

    // Sound effect: Hawk screech (when swooping)
    playHawkScreech() {
        if (!this.audioContext) return;
        
        const currentTime = this.audioContext.currentTime;
        
        // High-pitched screech
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.type = 'sawtooth';
        
        // Piercing high frequency with vibrato
        oscillator.frequency.setValueAtTime(2000, currentTime);
        oscillator.frequency.linearRampToValueAtTime(2400, currentTime + 0.1);
        oscillator.frequency.linearRampToValueAtTime(2200, currentTime + 0.2);
        oscillator.frequency.linearRampToValueAtTime(2500, currentTime + 0.3);
        oscillator.frequency.exponentialRampToValueAtTime(1800, currentTime + 0.5);
        
        gainNode.gain.setValueAtTime(0.15, currentTime);
        gainNode.gain.linearRampToValueAtTime(0.2, currentTime + 0.1);
        gainNode.gain.exponentialRampToValueAtTime(0.01, currentTime + 0.5);
        
        oscillator.connect(gainNode);
        gainNode.connect(this.sfxGainNode);
        
        oscillator.start(currentTime);
        oscillator.stop(currentTime + 0.5);
    }

    // Sound effect: Dog bark
    playDogBark() {
        if (!this.audioContext) return;
        
        const currentTime = this.audioContext.currentTime;
        
        // More realistic bark with noise component
        const oscillator1 = this.audioContext.createOscillator();
        const oscillator2 = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        // Low frequency component
        oscillator1.type = 'sawtooth';
        oscillator1.frequency.setValueAtTime(150, currentTime);
        oscillator1.frequency.exponentialRampToValueAtTime(80, currentTime + 0.08);
        
        // Mid frequency component for texture
        oscillator2.type = 'square';
        oscillator2.frequency.setValueAtTime(300, currentTime);
        oscillator2.frequency.exponentialRampToValueAtTime(150, currentTime + 0.08);
        
        // Sharp attack, quick decay
        gainNode.gain.setValueAtTime(0.3, currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, currentTime + 0.12);
        
        oscillator1.connect(gainNode);
        oscillator2.connect(gainNode);
        gainNode.connect(this.sfxGainNode);
        
        oscillator1.start(currentTime);
        oscillator2.start(currentTime);
        oscillator1.stop(currentTime + 0.12);
        oscillator2.stop(currentTime + 0.12);
    }
}

// Export for use in game
export default AudioSystem;
