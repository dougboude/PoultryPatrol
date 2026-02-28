# 🐔 Poultry Patrol

A 3D farming game where you protect your flock of chickens and ducks from predators while managing your farm. Built with Three.js.

## 🎮 Game Overview

You're a shepherd tasked with keeping your poultry safe for 10 minutes. Feed your birds, protect them from hawks and dogs, and enjoy visits from your friend Liz who loves to hang out with the flock.

### Features

- **Dynamic Flock Management**: Chickens lay eggs that hatch into more chickens, ducks swim in the pond
- **Predator Threats**: Fend off hawks and dogs that hunt your birds
- **Corn Feeding System**: Throw corn to keep your birds happy and healthy
- **Special Visitor**: Liz drops by every 3-5 minutes to sit with the birds (they love her!)
- **Walkman Mode**: Upload your own MP3s and jam while you farm
- **Minimap Radar**: Track all birds, predators, and visitors in real-time
- **First-Person Controls**: WASD movement with mouse-look perspective

## 🚀 Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

### Testing with Custom Game Time

Want to test without waiting 10 minutes? Use the `time` parameter:

```
http://localhost:5173/?time=1     # 1 minute game
http://localhost:5173/?time=0.5   # 30 second game
```

## 🎯 How to Play

1. Click "Open the Gate!" to start
2. Use **WASD** to move, **mouse** to look around
3. **Left-click** to throw corn and feed birds
4. **Right-click** to scare away predators
5. Press **M** to toggle the walkman music player
6. Press **ESC** to release mouse lock

### Objectives

- Keep your birds alive for 10 minutes
- Chickens lay eggs every 30 seconds (if there's corn nearby)
- Protect your flock from hawks (air) and dogs (ground)
- Enjoy Liz's visits - birds flock to her when she sits down!

## 🎵 Walkman Feature

Upload your own music to play while farming:

1. Press **M** to open the walkman
2. Click "Add Tracks" to upload MP3 files
3. Your playlist is saved in browser storage
4. Music persists between sessions

## 🏆 Scoring

- Each chicken alive at the end: **10 points**
- Each duck alive at the end: **15 points**
- Survive the full 10 minutes to see your final score!

## 🛠️ Tech Stack

- **Three.js**: 3D rendering engine
- **Vite**: Build tool and dev server
- **Vanilla JavaScript**: No framework overhead
- **Web Audio API**: Sound effects and music playback

## 📁 Project Structure

```
├── game.js           # Main game logic and Three.js scene
├── audio.js          # Audio system and walkman functionality
├── index.html        # Entry point
├── assets/
│   └── textures/     # All game textures
└── package.json      # Dependencies
```

## 🎨 Game Elements

- **Chickens**: Brown feathered birds that lay eggs
- **Ducks**: Yellow feathered waterfowl that swim
- **Hawks**: Aerial predators with brown feathers
- **Dogs**: Ground predators with fur texture
- **Liz**: Your friend who visits in gray sweatpants, blue sweatshirt, and green cap
- **Shepherd**: You! Wearing jeans and a cozy sweater

## 🐛 Known Behaviors

- Predators avoid both the player and Liz
- Birds are attracted to Liz when she sits down (up to 3 can perch on her head!)
- Corn piles disappear after 30 seconds
- Game music respects walkman mode - your tunes take priority

## 📝 License

MIT

## 🤝 Contributing

This is a personal project, but feel free to fork and make it your own!

---

Made with ❤️ for poultry enthusiasts everywhere
