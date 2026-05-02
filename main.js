import { ASSETS } from './assets.js';

const canvas = document.getElementById('appCanvas');
const ctx = canvas.getContext('2d');

// --- Configuration ---
const GRID_ROWS = 8;
const GRID_COLS = 6;
const BLINK_MIN = 6000;
const BLINK_MAX = 14000;
const BLINK_DURATION = 100;

// --- Data ---
const NAMES = [
    "James", "Mary", "Robert", "Patricia", "John", "Jennifer", "Michael", "Linda", "David", "Elizabeth",
    "William", "Barbara", "Richard", "Susan", "Joseph", "Jessica", "Thomas", "Sarah", "Charles", "Karen",
    "Christopher", "Nancy", "Daniel", "Lisa", "Matthew", "Betty", "Anthony", "Margaret", "Mark", "Sandra",
    "Donald", "Ashley", "Steven", "Kimberly", "Paul", "Emily", "Andrew", "Donna", "Joshua", "Michelle",
    "Kenneth", "Dorothy", "Kevin", "Carol", "Brian", "Amanda", "George", "Melissa", "Edward", "Deborah",
    "Ronald", "Stephanie", "Timothy", "Rebecca", "Jason", "Sharon", "Jeffrey", "Laura", "Ryan", "Cynthia", 
    "Mabel", "Elsa", "Scout", "RobloxFan75000"
];

const PREF_TYPES = [
    { type: 'front', text: "I want to sit in the front." },
    { type: 'back', text: "I need a seat in the back." },
    { type: 'window', text: "I want a window seat." },
    { type: 'aisle', text: "I prefer an aisle seat." },
    { type: 'not_middle', text: "I really don't want the middle." },
    { type: 'front_3', text: "I'd like to be in the front three rows." },
    { type: 'back_3', text: "I'd like to be in the back three rows." },
    { type: 'even_row', text: "I prefer even-numbered rows." },
    { type: 'odd_row', text: "I prefer odd-numbered rows." },
    { type: 'no_neighbors', text: "I want an empty seat on both sides of me." },
    { type: 'middle_lover', text: "I actually like the middle seat." },
    { type: 'near', text: "I want to sit next to" },
    { type: 'avoid', text: "Please keep me away from" },
    { type: 'anywhere', text: "Anywhere is fine." }
];

 // --- State ---
let gameState = 'MENU';
let width, height;
let images = {};
let seats = [];
let characters = [];
let remainingPassengers = [];
let score = 0;
let levelIndex = 0;
const LEVELS = [
    { name: 'Level 1', maxPassengers: 18 },
    { name: 'Level 2', maxPassengers: 24 },
    { name: 'Level 3', maxPassengers: 30 },
    { name: 'Endless', maxPassengers: 36 }
];
let holdingSlot = {
    x: 0,
    y: 0,
    size: 0,
    char: null
};
let draggedChar = null;
let selectedChar = null;
let dragOffset = { x: 0, y: 0 };
let dragStart = { x: 0, y: 0, seat: null };
let imagesLoaded = 0;
let totalImages = 0;
let lastTime = 0;
let uiCache = { char: null, lines: [] };

// --- Asset Loading ---
function loadImages() {
    const paths = {};
    paths['chair'] = ASSETS.props.chair;
    // Main menu logo
    paths['logo'] = './Defeating Seating Logo.png';
    for (const type in ASSETS.characters) {
        paths[`${type}_default`] = ASSETS.characters[type].default;
        paths[`${type}_blink`] = ASSETS.characters[type].blink;
    }

    totalImages = Object.keys(paths).length;
    for (const key in paths) {
        const img = new Image();
        img.src = paths[key];
        img.onload = () => { images[key] = img; imagesLoaded++; };
        images[key] = img; 
    }
}

// --- Logic Classes ---

class Seat {
    constructor(row, col, x, y, size) {
        this.row = row;
        this.col = col;
        this.x = x;
        this.y = y;
        this.size = size;
        this.occupiedBy = null;
    }

    draw(ctx) {
        const img = images['chair'];
        const drawX = Math.floor(this.x);
        const drawY = Math.floor(this.y);
        const drawSize = Math.floor(this.size);

        if (img && img.complete && img.naturalHeight !== 0) {
            ctx.drawImage(img, drawX, drawY, drawSize, drawSize);
        } else {
            ctx.fillStyle = '#ddd';
            ctx.fillRect(this.x, this.y, this.size, this.size);
        }
    }
    
    isAisle() { return this.col === 2 || this.col === 3; }
    isWindow() { return this.col === 0 || this.col === 5; }
    isMiddle() { return this.col === 1 || this.col === 4; }
}

class Character {
    constructor(name) {
        this.name = name;
        this.preference = null;
        this.seat = null;
        this.x = 0;
        this.y = 0;
        this.size = 0;
        
        // Emotional State
        this.moodState = 'neutral'; // 'satisfied', 'tolerating', 'angry'
        this.moodVariant = 'default'; // 'neutral', 'friend', 'bored', 'uncomfortable', 'unhappy', 'sad'
        
        this.blinkTimer = Math.random() * (BLINK_MAX - BLINK_MIN) + BLINK_MIN;
        this.isBlinking = false;
        
        this.friendDirection = 1; // 1 = right, -1 = left
        this.animOffset = Math.random() * 1000;
    }

    assignPreference(allChars, isFirst = false, targetedNames = new Set()) {
        const pool = [...PREF_TYPES].sort(() => Math.random() - 0.5);

        for (const pref of pool) {
            const type = pref.type;

            // Rules: 
            // 1. First person can't ask for a friend (to prevent immediate tolerating state)
            // 2. 'near' target must be unique and not want to be alone
            // 3. 'no_neighbors' person cannot be someone's 'near' target
            if (isFirst && type === 'near') continue;

            if (type === 'near') {
                const target = allChars.find(t => 
                    t !== this && 
                    !targetedNames.has(t.name) && 
                    (!t.preference || t.preference.type !== 'no_neighbors')
                );
                if (target) {
                    this.preference = { ...pref, targetName: target.name };
                    targetedNames.add(target.name);
                    return;
                }
                continue; 
            }

            if (type === 'no_neighbors') {
                if (targetedNames.has(this.name)) continue;
                this.preference = { ...pref };
                return;
            }

            if (type === 'avoid') {
                const target = allChars.find(t => t !== this);
                if (target) {
                    this.preference = { ...pref, targetName: target.name };
                    return;
                }
                continue;
            }

            // Default handles all other types (front, back, etc.)
            this.preference = { ...pref };
            return;
        }
    }

    // Returns: 'satisfied', 'tolerating', 'angry'
    calculateSatisfaction(allChars) {
        if (!this.seat) return 'neutral';

        const s = this.seat;
        const pref = this.preference;
        let mood = 'satisfied';

        if (pref.type === 'anywhere') return 'satisfied';

        switch (pref.type) {
            case 'front':
                if (s.row >= GRID_ROWS - 2) mood = 'angry';
                else if (s.row > 0) mood = 'tolerating';
                break;
            case 'back':
                if (s.row <= 1) mood = 'angry';
                else if (s.row < GRID_ROWS - 1) mood = 'tolerating';
                break;
            case 'window':
                if (s.isAisle()) mood = 'angry';
                else if (s.isMiddle()) mood = 'tolerating';
                break;
            case 'aisle':
                if (s.isWindow()) mood = 'angry';
                else if (s.isMiddle()) mood = 'tolerating';
                break;
            case 'not_middle':
                if (s.isMiddle()) mood = 'angry';
                break;
            case 'middle_lover':
                if (!s.isMiddle()) mood = 'angry';
                break;
            case 'front_3':
                if (s.row > 2) mood = 'angry';
                break;
            case 'back_3':
                if (s.row < GRID_ROWS - 3) mood = 'angry';
                break;
            case 'even_row':
                // Even rows are 2, 4, 6, 8 (Indices 1, 3, 5, 7)
                if ((s.row + 1) % 2 !== 0) mood = 'angry';
                break;
            case 'odd_row':
                // Odd rows are 1, 3, 5, 7 (Indices 0, 2, 4, 6)
                if ((s.row + 1) % 2 === 0) mood = 'angry';
                break;
            case 'no_neighbors':
                const sideNeighbors = this.getSideNeighbors(allChars);
                if (sideNeighbors.length > 0) mood = 'angry';
                break;
            case 'near': {
                const friend = allChars.find(n => n.name === pref.targetName);
                if (!friend) {
                    mood = 'satisfied'; // Should not happen with new logic
                    break;
                }
                const isFriendSeated = friend.seat;
                const sideNeighbors = this.getSideNeighbors(allChars);
                const isNextToFriend = sideNeighbors.some(n => n.name === pref.targetName);
                
                if (isNextToFriend) {
                    mood = 'satisfied';
                } else if (isFriendSeated) {
                    mood = 'angry'; // Friend is elsewhere on the grid!
                } else {
                    // Friend is in the game (holding) but not seated next to them
                    mood = 'tolerating';
                }
                break;
            }
            case 'avoid': {
                const sideNeighbors = this.getSideNeighbors(allChars);
                const isNextToEnemy = sideNeighbors.some(n => n.name === pref.targetName);
                if (isNextToEnemy) mood = 'angry';
                break;
            }
        }

        // Global Conflict: If you sit next to someone who wants to be alone, you are also at fault/angry.
        const sideNeighbors = this.getSideNeighbors(allChars);
        const isNextToLoner = sideNeighbors.some(n => n.preference.type === 'no_neighbors');
        if (isNextToLoner) mood = 'angry';

        return mood;
    }

    updateMood(allChars) {
        const newState = this.calculateSatisfaction(allChars);
        this.moodState = newState;

        // Map State to Sprite Variant
        if (this.moodState === 'satisfied') {
            // Check for friend interaction (only true side neighbors)
            const friend = this.getSideNeighbors(allChars).find(
                n => n.name === this.preference.targetName
            );
            if (this.preference.type === 'near' && friend) {
                this.moodVariant = 'friend';
                // Calculate direction
                if (friend.seat && this.seat) {
                    this.friendDirection = (friend.seat.col > this.seat.col) ? 1 : -1;
                }
            } else {
                // Occasional boredom? No, user wants deterministic.
                this.moodVariant = 'neutral'; 
                // this.moodVariant = Math.random() > 0.9 ? 'bored' : 'neutral'; // Deterministic means stable.
            }
        } else if (this.moodState === 'tolerating') {
             // Map to "Unhappy but tolerating" assets
             // User listed UnhappySeating and UncomfortableSeating here. 
             // We'll use Uncomfortable as the 'mild' unhappy.
             this.moodVariant = 'uncomfortable'; 
        } else if (this.moodState === 'angry') {
            // Map to "Angry / Bad" assets
            // User listed AngryDefault (doesn't exist) and SadDefault here.
            // We'll use UnhappySeating (looks angry) and Sad.
            // Let's strictly use UnhappySeating for Angry preference violations.
            this.moodVariant = 'unhappy'; 
        } else {
            this.moodVariant = 'neutral';
        }
    }

    getNeighbors(allChars) {
        const neighbors = [];
        if (!this.seat) return neighbors;
        
        // Check adjacent seats (Left, Right, Top, Bottom)
        const deltas = [[0, 1], [0, -1], [1, 0], [-1, 0]];
        
        for (const d of deltas) {
            const r = this.seat.row + d[0];
            const c = this.seat.col + d[1];
            // Find char in that seat
            const neighbor = allChars.find(char => char.seat && char.seat.row === r && char.seat.col === c);
            if (neighbor) neighbors.push(neighbor);
        }
        return neighbors;
    }

    // Only true "next to me" seats (same row, left/right)
    getSideNeighbors(allChars) {
        const neighbors = [];
        if (!this.seat) return neighbors;

        const deltas = [[0, 1], [0, -1]];
        for (const d of deltas) {
            const r = this.seat.row + d[0];
            const c = this.seat.col + d[1];
            const neighbor = allChars.find(
                char => char.seat && char.seat.row === r && char.seat.col === c
            );
            if (neighbor) neighbors.push(neighbor);
        }
        return neighbors;
    }

    update(dt, timestamp) {
        this.blinkTimer -= dt;
        if (this.blinkTimer <= 0) {
            this.isBlinking = !this.isBlinking;
            this.blinkTimer = this.isBlinking ? BLINK_DURATION : (Math.random() * (BLINK_MAX - BLINK_MIN) + BLINK_MIN);
        }
        
        // Movement
        if (!draggedChar || draggedChar !== this) {
            if (this.seat) {
                // Add subtle idle animation based on mood
                let idleY = 0;
                const t = (timestamp + this.animOffset) / 1000;
                
                if (this.moodState === 'satisfied') {
                    idleY = Math.sin(t * 2) * 1.5; // Slow breathe
                } else if (this.moodState === 'angry') {
                    // Jitter
                    if (Math.random() > 0.95) idleY = (Math.random() - 0.5) * 3;
                } else {
                    // Tolerating
                    idleY = Math.sin(t * 4) * 0.5; // Fast small breathe
                }

                const targetX = this.seat.x + (this.seat.size - this.size) / 2;
                const targetY = this.seat.y + (this.seat.size - this.size) / 2 - (this.size * 0.1) + idleY; 
                
                this.x += (targetX - this.x) * 0.25; // Snappier
                this.y += (targetY - this.y) * 0.25;
            }
        }
    }

    draw(ctx) {
        // Sprite Selection
        // satisfied -> neutral (or friend)
        // tolerating -> uncomfortable (or less_unhappy)
        // angry -> unhappy (or sad)
        
        let key = `${this.moodVariant}_${this.isBlinking ? 'blink' : 'default'}`;
        
        // Handle missing keys gracefully
        if (!images[key]) {
             if (this.moodState === 'angry') key = 'unhappy_default';
             else if (this.moodState === 'tolerating') key = 'uncomfortable_default';
             else key = 'neutral_default';
        }

        const img = images[key] || images['neutral_default'];
        
        const drawX = Math.floor(this.x);
        const drawY = Math.floor(this.y);
        const drawSize = Math.floor(this.size);

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.beginPath();
        ctx.ellipse(drawX + drawSize/2, drawY + drawSize - 5, drawSize/2.5, drawSize/8, 0, 0, Math.PI * 2);
        ctx.fill();

        // Draw Character
        if (img && img.complete) {
            ctx.save();
            if (this.moodVariant === 'friend' && this.friendDirection === 1) {
                // Flip horizontally
                ctx.translate(drawX + drawSize, drawY);
                ctx.scale(-1, 1);
                ctx.drawImage(img, 0, 0, drawSize, drawSize);
            } else {
                ctx.drawImage(img, drawX, drawY, drawSize, drawSize);
            }
            ctx.restore();
        } else {
            ctx.fillStyle = '#FFCC00'; 
            ctx.beginPath();
            ctx.arc(drawX + drawSize/2, drawY + drawSize/2, drawSize/2 - 2, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Visual Indicator (Bubble)
        if (this.seat) {
            const bubbleX = drawX + drawSize - 10;
            const bubbleY = drawY + 10;
            const r = 12;

            ctx.beginPath();
            ctx.arc(bubbleX, bubbleY, r, 0, Math.PI * 2);
            ctx.fillStyle = '#FFF';
            ctx.fill();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = 'bold 14px sans-serif';

            if (this.moodState === 'satisfied') {
                ctx.fillStyle = '#4CAF50';
                ctx.fillText('✓', bubbleX, bubbleY + 1);
            } else if (this.moodState === 'tolerating') {
                ctx.fillStyle = '#FF9800';
                ctx.fillText('~', bubbleX, bubbleY - 1);
            } else if (this.moodState === 'angry') {
                ctx.fillStyle = '#F44336';
                ctx.fillText('✕', bubbleX, bubbleY + 1);
            }
        }

        // Selection Highlight (only when not in holding slot)
        if (selectedChar === this && holdingSlot.char !== this) {
             ctx.strokeStyle = '#2196F3'; // Blue for selection
             ctx.lineWidth = 3;
             ctx.strokeRect(drawX - 2, drawY - 2, drawSize + 4, drawSize + 4);
        }
    }
}

// --- Game Logic ---

function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
    uiCache.char = null;
    initGrid();
}

function initGrid() {
    const margin = 10;
    const topBar = 20; 
    const bottomBar = 160; 
    
    const availableH = height - topBar - bottomBar;
    const availableW = width - (margin * 2);
    
    const seatW = availableW / GRID_COLS;
    const seatH = availableH / GRID_ROWS;
    const size = Math.min(seatW, seatH, 80); 
    
    const gridW = size * GRID_COLS;
    const gridH = size * GRID_ROWS;
    const startX = (width - gridW) / 2;
    const startY = topBar + (availableH - gridH) / 2;
    
    // Create/Update Seats
    let seatIdx = 0;
    for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
            let xOff = 0;
            if (c >= 3) xOff = 10; // Aisle gap
            
            const x = startX + c * size + xOff;
            const y = startY + r * size;

            if (seatIdx < seats.length) {
                seats[seatIdx].x = x;
                seats[seatIdx].y = y;
                seats[seatIdx].size = size;
            } else {
                seats.push(new Seat(r, c, x, y, size));
            }
            seatIdx++;
        }
    }

    // Holding slot (single) lives in the bottom UI bar on the left
    const uiH = 150;
    const uiY = height - uiH;
    const holdSize = Math.min(80, uiH - 40);
    holdingSlot.size = holdSize;
    holdingSlot.x = 20;
    holdingSlot.y = uiY + (uiH - holdSize) / 2;
    
    // Update character sizes/positions
    characters.forEach(char => {
        if (char === holdingSlot.char && !char.seat) {
            // Fella in HOLD box: base size on holdingSlot and center with no vertical offset
            char.size = holdingSlot.size * 0.9;
            char.x = holdingSlot.x + (holdingSlot.size - char.size) / 2;
            char.y = holdingSlot.y + (holdingSlot.size - char.size) / 2;
        } else {
            // Seated or free characters use grid seat size
            char.size = size * 0.9;
            if (char.seat) {
                char.x = char.seat.x + (char.seat.size - char.size) / 2;
                char.y = char.seat.y + (char.seat.size - char.size) / 2 - (char.size * 0.1);
            }
        }
    });
}



function startGame() {
    gameState = 'PLAYING';
    characters = [];
    remainingPassengers = [];
    holdingSlot.char = null;
    selectedChar = null;
    score = 0;
    const usedNames = new Set();
    
    seats.forEach(s => s.occupiedBy = null);

    const level = LEVELS[levelIndex] || LEVELS[LEVELS.length - 1];
    const maxSeatsToUse = Math.floor(seats.length * 0.75);
    const maxPassengers = Math.min(level.maxPassengers, maxSeatsToUse);
    const numChars = maxPassengers;

    // Pre-generate passengers and their preferences into a queue
    for (let i = 0; i < numChars; i++) {
        let name;
        do { name = NAMES[Math.floor(Math.random() * NAMES.length)]; } while (usedNames.has(name));
        usedNames.add(name);
        const c = new Character(name);
        remainingPassengers.push(c);
    }

    // Assign preferences once we know the pool
    const targetedNames = new Set();
    remainingPassengers.forEach((c, idx) => {
        c.assignPreference(remainingPassengers, idx === 0, targetedNames);
    });

    // Spawn the first passenger into the holding area
    spawnNextPassenger();

    initGrid();
}



function checkWin() {
    // Win when:
    // - No more passengers waiting
    // - Everyone is seated
    // - Nobody is angry
    if (gameState !== 'PLAYING') return;

    const noWaiting = remainingPassengers.length === 0 && !holdingSlot.char;
    if (!noWaiting) return;

    if (characters.length === 0) return;

    const allSeated = characters.every(c => c.seat);
    if (!allSeated) return;

    const noneAngry = characters.every(c => c.moodState !== 'angry');
    if (noneAngry) {
        gameState = 'WIN';
    }
}

// --- Interaction ---

function spawnNextPassenger() {
    if (holdingSlot.char || remainingPassengers.length === 0) return;

    // Prevent spawning new passengers if someone is currently angry
    const isAnyoneAngry = characters.some(c => c.moodState === 'angry');
    if (isAnyoneAngry) return;

    // Dependency check: Try to find a passenger whose "near" friend is already spawned
    let indexToSpawn = 0;
    for (let i = 0; i < remainingPassengers.length; i++) {
        const p = remainingPassengers[i];
        if (p.preference.type === 'near') {
            const targetName = p.preference.targetName;
            const isTargetSpawned = characters.some(c => c.name === targetName);
            if (isTargetSpawned) {
                indexToSpawn = i;
                break;
            }
        } else {
            // Non-dependent passengers can always spawn
            indexToSpawn = i;
            break;
        }
    }

    const c = remainingPassengers.splice(indexToSpawn, 1)[0];
    characters.push(c);
    c.size = holdingSlot.size * 0.9;
    c.seat = null;
    c.x = holdingSlot.x + (holdingSlot.size - c.size) / 2;
    c.y = holdingSlot.y + (holdingSlot.size - c.size) / 2;
    holdingSlot.char = c;
    selectedChar = c;
    characters.forEach(char => char.updateMood(characters));
    updateFriendSprites(characters);
}

function getEventPos(e) {
    if (e.touches && e.touches.length > 0) {
        return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
}

function handleStart(e) {


    if (gameState === 'MENU') {
        startGame();
        return;
    }
    if (gameState === 'WIN') {
        if (levelIndex < LEVELS.length - 1) {
            levelIndex++;
        } else {
            levelIndex = 0;
        }
        startGame();
        return;
    }

    const pos = getEventPos(e);

    if (gameState === 'PLAYING') {
        // Tap on holding slot to spawn next passenger if it's empty
        if (!holdingSlot.char &&
            pos.x >= holdingSlot.x && pos.x <= holdingSlot.x + holdingSlot.size &&
            pos.y >= holdingSlot.y && pos.y <= holdingSlot.y + holdingSlot.size) {
            spawnNextPassenger();
            return;
        }
    }
    
    for (let i = characters.length - 1; i >= 0; i--) {
        const char = characters[i];
        if (pos.x >= char.x && pos.x <= char.x + char.size &&
            pos.y >= char.y && pos.y <= char.y + char.size) {
            
            draggedChar = char;
            selectedChar = char;
            dragOffset.x = pos.x - char.x;
            dragOffset.y = pos.y - char.y;
            dragStart.x = char.x;
            dragStart.y = char.y;
            dragStart.seat = char.seat || null;
            
            // Bring to front
            characters.splice(i, 1);
            characters.push(char);
            return;
        }
    }
}

function handleMove(e) {
    if (!draggedChar) return;
    const pos = getEventPos(e);
    draggedChar.x = pos.x - dragOffset.x;
    draggedChar.y = pos.y - dragOffset.y;
}

function handleEnd(e) {
    if (!draggedChar) return;

    const center = {
        x: draggedChar.x + draggedChar.size / 2,
        y: draggedChar.y + draggedChar.size / 2
    };

    let bestDist = Infinity;
    let bestSeat = null;

    for (const seat of seats) {
        const seatCenter = {
            x: seat.x + seat.size / 2,
            y: seat.y + seat.size / 2
        };
        const dx = center.x - seatCenter.x;
        const dy = center.y - seatCenter.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        
        if (dist < seat.size && dist < bestDist) {
            bestDist = dist;
            bestSeat = seat;
        }
    }

    const oldSeat = dragStart.seat;

    // Check if dropped into holding slot
    const inHolding =
        center.x >= holdingSlot.x && center.x <= holdingSlot.x + holdingSlot.size &&
        center.y >= holdingSlot.y && center.y <= holdingSlot.y + holdingSlot.size;

    if (inHolding && (!holdingSlot.char || holdingSlot.char === draggedChar)) {
        // Move dragged char into holding slot
        if (draggedChar.seat) {
            draggedChar.seat.occupiedBy = null;
        }
        draggedChar.seat = null;
        holdingSlot.char = draggedChar;
        draggedChar.x = holdingSlot.x + (holdingSlot.size - draggedChar.size) / 2;
        draggedChar.y = holdingSlot.y + (holdingSlot.size - draggedChar.size) / 2;
    } else if (bestSeat) {
        const occupant = bestSeat.occupiedBy;

        // If this character was in holding, clear it
        if (holdingSlot.char === draggedChar) {
            holdingSlot.char = null;
        }

        if (occupant && occupant !== draggedChar) {
            // Swap seats
            occupant.seat = oldSeat;
            if (oldSeat) oldSeat.occupiedBy = occupant;
            bestSeat.occupiedBy = draggedChar;
            draggedChar.seat = bestSeat;
        } else {
            if (oldSeat && oldSeat !== bestSeat) oldSeat.occupiedBy = null;
            bestSeat.occupiedBy = draggedChar;
            draggedChar.seat = bestSeat;
        }
    } else {
        // Invalid drop: snap back to where they started
        draggedChar.x = dragStart.x;
        draggedChar.y = dragStart.y;
        if (dragStart.seat !== draggedChar.seat) {
            if (draggedChar.seat && draggedChar.seat !== dragStart.seat) {
                draggedChar.seat.occupiedBy = null;
            }
            draggedChar.seat = dragStart.seat;
            if (dragStart.seat) dragStart.seat.occupiedBy = draggedChar;
        }
    }

    // Determine everyone's mood AFTER the move
    characters.forEach(c => c.updateMood(characters));
    updateFriendSprites(characters);
    recomputeScore();
    checkWin();

    draggedChar = null;
}

function recomputeScore() {
    // Satisfied: 2 points, Tolerating: 1 point, Angry/Unseated: 0
    let total = 0;
    characters.forEach(c => {
        if (!c.seat) return;
        if (c.moodState === 'satisfied') total += 2;
        else if (c.moodState === 'tolerating') total += 1;
    });
    score = total;
}

// --- Render ---

function drawMenu() {
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(0, 0, width, height);

    ctx.textAlign = 'center';

    const logo = images['logo'];
    let tapY, tipY;
    let mainFontSize, subFontSize;

    if (logo && logo.complete && logo.naturalWidth > 0) {
        const maxLogoWidth = Math.min(width * 0.9, 520);
        const scale = maxLogoWidth / logo.naturalWidth;
        const logoW = logo.naturalWidth * scale;
        const logoH = logo.naturalHeight * scale;
        const x = (width - logoW) / 2;
        const y = height * 0.26 - logoH / 2;

        ctx.drawImage(logo, x, y, logoW, logoH);

        const logoBottom = y + logoH;
        tapY = logoBottom + logoH * 0.18;
        tipY = tapY + logoH * 0.14;

        // Cap to default desktop-like sizes and only scale down on smaller screens
        mainFontSize = Math.min(18, logoH * 0.18);
        subFontSize = Math.min(14, logoH * 0.12);
    } else {
        ctx.fillStyle = '#333';
        ctx.font = '900 42px sans-serif';
        ctx.fillText('DEFEATING SEATING', width / 2, height * 0.28);

        tapY = height * 0.5;
        tipY = height * 0.56;
        mainFontSize = 18;
        subFontSize = 14;
    }

    ctx.font = `500 ${mainFontSize}px sans-serif`;
    ctx.fillStyle = '#666';
    ctx.fillText('Tap to Start', width / 2, tapY);
    ctx.font = `${subFontSize}px sans-serif`;
    ctx.fillText('Tap and drag passengers into seats. Avoid angry faces.', width / 2, tipY);
}

function drawUI() {
    const uiH = 150;
    const y = height - uiH;
    
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, y, width, uiH);
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();

    // Holding slot visual
    ctx.save();
    const isAnyoneAngry = characters.some(c => c.moodState === 'angry');
    const isLocked = isAnyoneAngry && !holdingSlot.char;
    
    ctx.strokeStyle = isLocked ? '#F44336' : '#999';
    ctx.lineWidth = 2;
    if (!holdingSlot.char) ctx.setLineDash([4, 4]);
    ctx.strokeRect(holdingSlot.x, holdingSlot.y, holdingSlot.size, holdingSlot.size);
    ctx.setLineDash([]);
    
    ctx.font = '10px sans-serif';
    ctx.fillStyle = isLocked ? '#F44336' : '#666';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(isLocked ? 'LOCKED' : 'HOLD', holdingSlot.x + holdingSlot.size / 2, holdingSlot.y + holdingSlot.size + 10);

    // Counter for remaining passengers & score
    ctx.textAlign = 'right';
    ctx.font = '12px sans-serif';
    ctx.fillText(`LEFT: ${remainingPassengers.length}`, width - 20, y + 24);
    ctx.fillText(`SCORE: ${score}`, width - 20, y + 44);
    ctx.restore();

    if (selectedChar) {
        const p = selectedChar.preference;

        ctx.fillStyle = '#000';
        ctx.textAlign = 'left';
        ctx.font = 'bold 20px sans-serif';
        ctx.fillText(selectedChar.name.toUpperCase(), holdingSlot.x + holdingSlot.size + 20, y + 32);

        let statusText = "Satisfied";
        let statusColor = "#4CAF50";
        if (selectedChar.moodState === 'angry') { statusText = "Angry"; statusColor = "#F44336"; }
        else if (selectedChar.moodState === 'tolerating') { statusText = "Tolerating"; statusColor = "#FF9800"; }
        
        ctx.fillStyle = statusColor;
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(statusText.toUpperCase(), holdingSlot.x + holdingSlot.size + 20, y + 55);

        ctx.fillStyle = '#333';
        // Preference text keeps a clear, readable size
        ctx.font = '16px sans-serif';
        let desc = p.text;
        if (p.targetName) desc += " " + p.targetName + ".";
        
        // Wrap text
        if (uiCache.char !== selectedChar) {
            uiCache.char = selectedChar;
            uiCache.lines = [];
            const words = desc.split(' ');
            let line = "";
            // Keep preference text away from the RIGHT: counters so they don't overlap
            const rightPadding = 120;
            const maxWidth = Math.max(
                80,
                width - (holdingSlot.x + holdingSlot.size + 40 + rightPadding)
            );
            for (const w of words) {
                if (ctx.measureText(line + w).width > maxWidth) {
                    uiCache.lines.push(line);
                    line = w + " ";
                } else {
                    line += w + " ";
                }
            }
            uiCache.lines.push(line);
        }

        let ly = y + 80;
        ctx.textAlign = 'left';
        for (const line of uiCache.lines) {
            ctx.fillText(line, holdingSlot.x + holdingSlot.size + 20, ly);
            ly += 20;
        }

        // Instruction message goes directly under the preference text block
        const isSeatedAndUnhappy = selectedChar.seat && selectedChar.moodState === 'angry';
        const anyoneAngry = characters.some(c => c.moodState === 'angry');
        
        ctx.font = '11px sans-serif';
        if (anyoneAngry && !holdingSlot.char) {
            ctx.fillStyle = '#F44336';
            const msg = 'Resolve all angry Fellas to bring in the next passenger!';
            ctx.fillText(msg, holdingSlot.x + holdingSlot.size + 20, ly + 16);
        } else {
            const hasGuidingFella = characters.some(c =>
                c.seat && (c.moodState === 'satisfied' || c.moodState === 'tolerating')
            );
            if (hasGuidingFella || isSeatedAndUnhappy || holdingSlot.char) {
                ctx.fillStyle = '#555';
                const msg = 'Click and drag or hold and drag to move the Fella to their seat';
                ctx.fillText(msg, holdingSlot.x + holdingSlot.size + 20, ly + 16);
            }
        }

    } else {
        ctx.fillStyle = '#999';
        ctx.textAlign = 'center';
        ctx.font = 'italic 16px sans-serif';
        ctx.fillText("Select a passenger to view details", width / 2, y + 75);
    }
}

function drawGame(timestamp) {
    ctx.clearRect(0, 0, width, height);
    
    if (seats.length > 0) {
        ctx.save();
        ctx.fillStyle = '#E0E0E0';
        ctx.font = 'bold 30px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        const firstRowY = seats[0].y;
        ctx.fillText("FRONT", width/2, firstRowY - 25);
        
        const lastRowY = seats[seats.length-1].y + seats[seats.length-1].size;
        ctx.fillText("BACK", width/2, lastRowY + 30);

        // Draw Row Numbers
        ctx.fillStyle = '#BBB';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'right';
        for (let r = 0; r < GRID_ROWS; r++) {
            const firstSeatInRow = seats[r * GRID_COLS];
            if (firstSeatInRow) {
                const centerY = firstSeatInRow.y + firstSeatInRow.size / 2;
                ctx.fillText(`${r + 1}`, firstSeatInRow.x - 12, centerY + 2);
            }
        }
        ctx.restore();
    }

    seats.forEach(s => s.draw(ctx));
    drawUI();
    characters.forEach(c => c.draw(ctx));

    if (gameState === 'WIN') {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = '#4CAF50';
        ctx.font = 'bold 34px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('LEVEL COMPLETE', width / 2, height / 2 - 30);
        ctx.fillStyle = '#333';
        ctx.font = '20px sans-serif';
        ctx.fillText(`Score: ${score}`, width / 2, height / 2 + 2);
        ctx.fillStyle = '#666';
        ctx.font = '16px sans-serif';
        const nextLabel = (levelIndex < LEVELS.length - 1) ? 'Tap for next level' : 'Tap to play again';
        ctx.fillText(nextLabel, width / 2, height / 2 + 40);
    }
}



function updateFriendSprites(allChars) {
    // First, reset satisfied non-special faces back to neutral
    allChars.forEach(c => {
        if (c.moodState === 'satisfied' && c.moodVariant === 'friend') {
            c.moodVariant = 'neutral';
        }
    });

    // Then, for any pair actually sitting side-by-side with a "near" preference,
    // make both look at each other.
    allChars.forEach(c => {
        if (!c.seat || c.preference.type !== 'near' || c.moodState !== 'satisfied') return;

        const neighbors = c.getSideNeighbors(allChars);
        const friend = neighbors.find(n => n.name === c.preference.targetName);
        if (!friend || !friend.seat) return;

        // This one looks toward the friend
        c.moodVariant = 'friend';
        c.friendDirection = (friend.seat.col > c.seat.col) ? 1 : -1;

        // Friend looks back, unless they're angry
        if (friend.moodState !== 'angry') {
            friend.moodVariant = 'friend';
            friend.friendDirection = (c.seat.col > friend.seat.col) ? 1 : -1;
        }
    });
}

function loop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    const dt = timestamp - lastTime;
    lastTime = timestamp;

    if (gameState === 'PLAYING' || gameState === 'WIN') {
        characters.forEach(c => c.update(dt, timestamp));
        drawGame(timestamp);
    } else {
        drawMenu();
    }
    requestAnimationFrame(loop);
}

// --- Setup ---
window.addEventListener('resize', resize);
window.addEventListener('mousedown', handleStart);
window.addEventListener('mousemove', handleMove);
window.addEventListener('mouseup', handleEnd);
window.addEventListener('touchstart', (e) => { if(e.target !== canvas) return; e.preventDefault(); handleStart(e); }, { passive: false });
window.addEventListener('touchmove', (e) => { if(e.target !== canvas) return; e.preventDefault(); handleMove(e); }, { passive: false });
window.addEventListener('touchend', (e) => { if(e.target !== canvas) return; e.preventDefault(); handleEnd(e); }, { passive: false });

loadImages();
resize();
requestAnimationFrame(loop);

