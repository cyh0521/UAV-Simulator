/** AERO-X 3D UAV Simulator — Taiwan City Edition */
const COURSE_GATES = [
  { id: 1, pos: { x: 0, y: 10, z: -48 }, rotY: 0, radius: 5.5, name: '1號門：騎樓商圈' },
  { id: 2, pos: { x: 0, y: 11, z: -82 }, rotY: 0, radius: 5.5, name: '2號門：市區平交道' },
  { id: 3, pos: { x: 0, y: 12, z: -120 }, rotY: 0, radius: 5.5, name: '3號門：中央車站路口' },
  { id: 4, pos: { x: 72, y: 12, z: -120 }, rotY: -Math.PI / 2, radius: 5.5, name: '4號門：市民大道' },
  { id: 5, pos: { x: 72, y: 12, z: -184 }, rotY: 0, radius: 5.5, name: '5號門：市民公園北口' },
  { id: 6, pos: { x: 0, y: 10, z: -184 }, rotY: Math.PI / 2, radius: 5.5, name: '6號門：市民服務中心路口' }
];
const HELIPAD_POS = { x: 0, y: 0.85, z: 0 };
const LANDING_RADIUS = 6.5;
const RAILWAY_Z = -88;

// ============================================================================
// 2. STATE & PHYSICS PARAMETERS
// ============================================================================
const TACTICAL_BOMB_LIMIT = 6;
const FARP_LANDING_RADIUS = 7;
const TACTICAL_COLLISION_COST = 5;
const tacticalState = {
  bombsRemaining: 2,
  maxBombs: 2,
  activeBombs: [],
  targets: [],
  tanks: [],
  explosions: [],
  debris: [],
  directHitBombs: 0,
  pendingExplosions: [],
  bombsDropped: 0,
  rearmTimer: 0,
  rearming: false
};

let cityGroup = null;
let worldLoading = false;

const state = {
  gameMode: 'training', // 'training' | 'versus_race' | 'free_flight' | 'tactical_strike'
  trainingStep: 1,      // 1 to 6
  trainingHoverTime: 0, // hover timer for Task 1
  trainingBrakeTime: 0, // air brake timer
  timeOfDay: 'day',        // 'day' | 'sunset' | 'night'
  weather: 'clear',        // 'clear' | 'cloudy' | 'drizzle' | 'heavy_rain' | 'fog' | 'typhoon'
  cameraMode: 'chase',     // 'chase' | 'fpv' | 'down'
  downZoom: 1,             // 1, 2, 4 (for downward optic camera)
  sensorMode: 'visible',   // 'visible' | 'flir_white' | 'nvg'
  flightMode: 'stabilized',// 'stabilized' | 'sport'
  keymapMode: 'dual',      // 'dual' | 'single'
  audioEnabled: true,
  mapOpen: false,
  menuOpen: true,
  pauseOpen: false,
  scoreboardOpen: false,

  raceActive: false,
  countdownActive: false,
  elapsedTime: 0,
  penaltyTime: 0,
  collisionCount: 0,
  currentGateIndex: 0,
  landingHoldTimer: 0,

  currentPlayer: 1,
  p1Result: null,
  p2Result: null,
  currentRecording: [],
  recordSampleAccum: 0,
  p1GhostRecording: [],
  countdownRemaining: 0,

  lastCheckpoint: {
    pos: { x: 0, y: 1.2, z: 0 },
    yaw: 0
  }
};

const drone = {
  pos: new THREE.Vector3(0, 1.2, 0),
  vel: new THREE.Vector3(0, 0, 0),
  yaw: 0,
  yawRate: 0,
  pitch: 0,
  pitchRate: 0,
  roll: 0,
  rollRate: 0,
  groundEffectFactor: 1.0,
  vrsSeverity: 0,
  massRatio: 1.0,
  radius: 1.15,
  collisionCooldown: 0,
  rotorAngle: 0
};

const PHYSICS = {
  stabilized: {
    maxTiltAngle: 0.46,
    tiltResponse: 9.5,
    maxHorizontalAccel: 34.0,
    horizontalDrag: 2.1,
    maxClimbSpeed: 16.0,
    maxDescentSpeed: 10.5,
    hoverDescentLimit: 7.5,
    verticalAccel: 28.0,
    verticalDamping: 6.5,
    yawMaxRate: 2.4,
    yawResponse: 9.5,
    boostMultiplier: 1.45
  },
  sport: {
    maxTiltAngle: 0.75,
    tiltResponse: 12.0,
    maxHorizontalAccel: 54.0,
    horizontalDrag: 1.35,
    maxClimbSpeed: 24.0,
    maxDescentSpeed: 16.5,
    hoverDescentLimit: 14.5,
    verticalAccel: 38.0,
    verticalDamping: 4.2,
    yawMaxRate: 3.2,
    yawResponse: 11.5,
    boostMultiplier: 1.6
  },
  maxAltitude: 120.0
};

// ============================================================================
// 3. KEYBOARD INPUT HANDLING
// ============================================================================
const pressedKeys = new Set();

function clearAllKeys() {
  pressedKeys.clear();
  updateKeyboardVisualizer({ throttle: 0, yaw: 0, pitch: 0, roll: 0 });
}

window.addEventListener('blur', clearAllKeys);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearAllKeys();
});

window.addEventListener('keydown', (e) => {
  if (worldLoading) return;
  if (e.code === 'Escape') {
    if (e.repeat) return;
    if (state.mapOpen) {
      toggleFullMap(false);
      return;
    }
    if (!state.menuOpen && !state.scoreboardOpen) {
      togglePauseMenu(!state.pauseOpen);
    }
    return;
  }

  if (state.menuOpen || state.scoreboardOpen) return;
  if (state.pauseOpen) {
    if (e.code === 'KeyM' && !e.repeat) toggleFullMap(!state.mapOpen);
    return;
  }

  if (!e.repeat) {
    if (e.code === 'KeyC') {
      toggleCameraMode();
      return;
    }
    if (e.code === 'KeyT') {
      cycleTimeOfDay();
      return;
    }
    if (e.code === 'KeyY') {
      cycleWeather();
      return;
    }
    if (e.code === 'KeyM') {
      toggleFullMap(!state.mapOpen);
      return;
    }
    if (e.code === 'KeyG') {
      toggleFlightMode();
      return;
    }
    if (e.code === 'KeyK') {
      toggleKeymapMode();
      return;
    }
    if (e.code === 'KeyN') {
      toggleAudio();
      return;
    }
    if (e.code === 'KeyR') {
      respawnAtLastCheckpoint(false);
      return;
    }
    if (e.code === 'KeyZ') {
      if (state.cameraMode === 'down') {
        cycleDownZoom();
        return;
      }
    }
    if (e.code === 'KeyX') {
      cycleSensorMode();
      return;
    }
    if (e.code === 'KeyB') {
      dropBomb();
      return;
    }
  }

  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
    e.preventDefault();
  }

  if (!state.mapOpen && !document.hidden) pressedKeys.add(e.code);
});

window.addEventListener('keyup', (e) => {
  pressedKeys.delete(e.code);
});

function sampleFlightControls() {
  if (state.menuOpen || state.pauseOpen || state.scoreboardOpen || state.mapOpen || state.countdownActive) {
    return { throttle: 0, yaw: 0, pitch: 0, roll: 0, brake: false, boost: false };
  }

  let throttle = 0;
  let yaw = 0;
  let pitch = 0;
  let roll = 0;

  if (state.keymapMode === 'dual') {
    if (pressedKeys.has('KeyW')) throttle += 1;
    if (pressedKeys.has('KeyS')) throttle -= 1;
    if (pressedKeys.has('KeyA') || pressedKeys.has('KeyQ')) yaw += 1;
    if (pressedKeys.has('KeyD') || pressedKeys.has('KeyE')) yaw -= 1;

    if (pressedKeys.has('ArrowUp')) pitch += 1;
    if (pressedKeys.has('ArrowDown')) pitch -= 1;
    if (pressedKeys.has('ArrowLeft')) roll -= 1;
    if (pressedKeys.has('ArrowRight')) roll += 1;
  } else {
    if (pressedKeys.has('KeyW') || pressedKeys.has('ArrowUp')) pitch += 1;
    if (pressedKeys.has('KeyS') || pressedKeys.has('ArrowDown')) pitch -= 1;
    if (pressedKeys.has('KeyA') || pressedKeys.has('ArrowLeft')) roll -= 1;
    if (pressedKeys.has('KeyD') || pressedKeys.has('ArrowRight')) roll += 1;

    if (pressedKeys.has('KeyQ')) yaw += 1;
    if (pressedKeys.has('KeyE')) yaw -= 1;

    if (pressedKeys.has('ShiftLeft') || pressedKeys.has('ShiftRight') || pressedKeys.has('KeyU')) throttle += 1;
    if (pressedKeys.has('ControlLeft') || pressedKeys.has('ControlRight') || pressedKeys.has('KeyJ')) throttle -= 1;
  }

  const brake = pressedKeys.has('Space');
  const boost =
    state.keymapMode === 'dual'
      ? pressedKeys.has('ShiftLeft') || pressedKeys.has('ShiftRight')
      : pressedKeys.has('KeyF');

  return { throttle, yaw, pitch, roll, brake, boost };
}

// ============================================================================
// 4. AUDIO ENGINE (ROTOR HUM, CHIMES & CROSSING BELL)
// ============================================================================
class DroneAudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.osc1 = null;
    this.osc2 = null;
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = state.audioEnabled ? 0.14 : 0.0;
      this.masterGain.connect(this.ctx.destination);

      this.osc1 = this.ctx.createOscillator();
      this.osc2 = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 350;
      this.filter = filter;

      this.osc1.type = 'sawtooth';
      this.osc2.type = 'triangle';
      this.osc1.frequency.value = 92;
      this.osc2.frequency.value = 186;

      const rotorGain = this.ctx.createGain();
      rotorGain.gain.value = 0.22;

      this.osc1.connect(filter);
      this.osc2.connect(filter);
      filter.connect(rotorGain);
      rotorGain.connect(this.masterGain);

      this.osc1.start();
      this.osc2.start();
      this.initialized = true;
    } catch (e) {
      console.warn('Audio init skipped:', e);
    }
  }

  updateRotorSound(speed, throttleInput, boost) {
    if (!this.initialized || !this.ctx) return;
    if (this.ctx.state === 'suspended' && state.audioEnabled) {
      this.ctx.resume().catch(() => {});
    }
    const vrs = drone.vrsSeverity || 0;
    const tSec = performance.now() * 0.001;
    const vrsFlutter = vrs > 0.12 ? (Math.sin(tSec * 28.0) * 14 + Math.cos(tSec * 43.0) * 9) * vrs : 0;
    const load = Math.min(1.6, speed / 24 + Math.abs(throttleInput) * 0.35 + (boost ? 0.35 : 0) + vrs * 0.45);
    const baseFreq = Math.max(52, 86 + load * 74 + vrsFlutter);
    const now = this.ctx.currentTime;
    this.osc1.frequency.setTargetAtTime(baseFreq, now, 0.04);
    this.osc2.frequency.setTargetAtTime(baseFreq * (2.02 - vrs * 0.18), now, 0.04);
    this.filter.frequency.setTargetAtTime(290 + load * 310 + Math.abs(vrsFlutter) * 8, now, 0.05);
  }

  setMuted(muted) {
    if (!this.initialized || !this.masterGain) return;
    this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.14, this.ctx.currentTime, 0.05);
  }

  playTone(freq = 880, duration = 0.12, type = 'sine', secondFreq = null) {
    if (!state.audioEnabled) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (secondFreq) {
      osc.frequency.setValueAtTime(secondFreq, now + duration * 0.5);
    }
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  playBombRelease() {
    if (!state.audioEnabled || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      // 1. Mechanical servo release latch click & unhook
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(680, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.035);
      gain.gain.setValueAtTime(0.38, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.04);

      // Low mechanical latch pop
      const pop = this.ctx.createOscillator();
      const popGain = this.ctx.createGain();
      pop.type = 'sine';
      pop.frequency.setValueAtTime(130, now);
      pop.frequency.exponentialRampToValueAtTime(42, now + 0.04);
      popGain.gain.setValueAtTime(0.28, now);
      popGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
      pop.connect(popGain);
      popGain.connect(this.ctx.destination);
      pop.start(now);
      pop.stop(now + 0.045);

      // 2. Military Avionics HUD Chirp ("ORD RELEASED" Telemetry confirmation beep)
      const chirp = this.ctx.createOscillator();
      const chirpGain = this.ctx.createGain();
      chirp.type = 'sine';
      chirp.frequency.setValueAtTime(1920, now + 0.015);
      chirp.frequency.exponentialRampToValueAtTime(2450, now + 0.065);
      chirpGain.gain.setValueAtTime(0.18, now + 0.015);
      chirpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
      chirp.connect(chirpGain);
      chirpGain.connect(this.ctx.destination);
      chirp.start(now + 0.015);
      chirp.stop(now + 0.075);
    } catch (e) {}
  }

  playBombWhistle() {
    // Deprecated: Cartoon bomb whistle removed for authentic military UAV silence during fall
  }

  playExplosion(intensity = 1.0) {
    if (!state.audioEnabled || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const isNadirView = state.cameraMode === 'down';

      if (isNadirView) {
        // High-altitude Nadir View (Operator Perspective):
        // Air drastically attenuates high-frequency shrapnel/crackle over distance.
        // What reaches the high-altitude optical sensor is a heavy, muffled sub-bass shockwave rumble.
        const bufferSize = Math.floor(this.ctx.sampleRate * 1.0);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        // Deep lowpass: only low rumble passes through (< 115Hz down to 26Hz)
        filter.frequency.setValueAtTime(115 * Math.min(1.2, intensity), now);
        filter.frequency.exponentialRampToValueAtTime(26, now + 0.85);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.68 * intensity, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.95);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        noise.start(now);
        noise.stop(now + 1.0);

        // Heavy sub-bass shockwave displacement
        const sub = this.ctx.createOscillator();
        const subGain = this.ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(62, now);
        sub.frequency.exponentialRampToValueAtTime(22, now + 0.55);
        subGain.gain.setValueAtTime(0.88 * intensity, now);
        subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        sub.connect(subGain);
        subGain.connect(this.ctx.destination);
        sub.start(now);
        sub.stop(now + 0.65);
      } else {
        // Chase Camera (External Battlefield Observer):
        // Full-spectrum explosion with noise, shrapnel blast & sub-bass thump
        const bufferSize = Math.floor(this.ctx.sampleRate * 1.5);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(420 * intensity, now);
        filter.frequency.exponentialRampToValueAtTime(40, now + 1.3);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.9 * intensity, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.45);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        noise.start(now);
        noise.stop(now + 1.5);

        // Sub-bass heavy thump
        const sub = this.ctx.createOscillator();
        const subGain = this.ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(75, now);
        sub.frequency.exponentialRampToValueAtTime(28, now + 0.65);
        subGain.gain.setValueAtTime(0.95 * intensity, now);
        subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
        sub.connect(subGain);
        subGain.connect(this.ctx.destination);
        sub.start(now);
        sub.stop(now + 0.75);
      }
    } catch (e) {}
  }

  playGateChime() {
    this.playTone(880, 0.16, 'triangle', 1318.5);
  }

  playCollisionAlert() {
    this.playTone(180, 0.24, 'sawtooth', 130);
  }

  playFinishFanfare() {
    if (!state.audioEnabled) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, idx) => {
      setTimeout(() => this.playTone(f, 0.2, 'triangle'), idx * 95);
    });
  }

  playDudThud() {
    if (!state.audioEnabled || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(580, now);
      osc.frequency.exponentialRampToValueAtTime(120, now + 0.12);
      gain.gain.setValueAtTime(0.42, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.13);

      const sub = this.ctx.createOscillator();
      const subGain = this.ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(90, now);
      sub.frequency.exponentialRampToValueAtTime(32, now + 0.18);
      subGain.gain.setValueAtTime(0.65, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      sub.connect(subGain);
      subGain.connect(this.ctx.destination);
      sub.start(now);
      sub.stop(now + 0.19);
    } catch (e) {}
  }

  playIRCutClick() {
    if (!state.audioEnabled || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc1 = this.ctx.createOscillator();
      const gain1 = this.ctx.createGain();
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(450, now);
      osc1.frequency.exponentialRampToValueAtTime(80, now + 0.035);
      gain1.gain.setValueAtTime(0.4, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
      osc1.connect(gain1);
      gain1.connect(this.ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.04);

      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, now + 0.035);
      osc2.frequency.exponentialRampToValueAtTime(160, now + 0.075);
      gain2.gain.setValueAtTime(0.35, now + 0.035);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.075);
      osc2.connect(gain2);
      gain2.connect(this.ctx.destination);
      osc2.start(now + 0.035);
      osc2.stop(now + 0.08);
    } catch (e) {}
  }

  playShockwaveImpact() {
    if (!state.audioEnabled || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const boom = this.ctx.createOscillator();
      const boomGain = this.ctx.createGain();
      boom.type = 'sawtooth';
      boom.frequency.setValueAtTime(115, now);
      boom.frequency.exponentialRampToValueAtTime(24, now + 0.55);
      boomGain.gain.setValueAtTime(0.85, now);
      boomGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      boom.connect(boomGain);
      boomGain.connect(this.ctx.destination);
      boom.start(now);
      boom.stop(now + 0.65);
    } catch (e) {}
  }
}

const audioEngine = new DroneAudioEngine();

// ============================================================================
// 5. THREE.JS SCENE SETUP & ANIME COLOR PALETTES
// ============================================================================
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x38bdf8);
scene.fog = new THREE.Fog(0x93c5fd, 180, 1120);

const camera = new THREE.PerspectiveCamera(
  62,
  window.innerWidth / window.innerHeight,
  0.25,
  1600
);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance'
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
container.appendChild(renderer.domElement);

// High-Dynamic-Range Procedural IBL (Image-Based Lighting) via PMREMGenerator
const pmremGenerator = new THREE.PMREMGenerator(renderer);
pmremGenerator.compileCubemapShader();
const envMapCache = new Map();

function getProceduralEnvMap(cacheKey, topHex, midHex, botHex, groundHex, sunPos, sunHex, sunStrength) {
  if (envMapCache.has(cacheKey)) return envMapCache.get(cacheKey);
  const scale = 0.42;
  const toCss = (hex, mult = scale) => {
    const c = new THREE.Color(hex).multiplyScalar(mult);
    const r = Math.min(255, Math.round(c.r * 255));
    const g = Math.min(255, Math.round(c.g * 255));
    const b = Math.min(255, Math.round(c.b * 255));
    return `rgb(${r},${g},${b})`;
  };
  const cTop = toCss(topHex, scale);
  const cMid = toCss(midHex, scale);
  const cBot = toCss(botHex, scale * 1.05);
  const cGnd = toCss(groundHex, scale * 0.75);
  const cSun = toCss(sunHex, Math.min(1.0, scale * 1.45 * Math.max(0.2, sunStrength)));

  const faces = [];
  for (let i = 0; i < 6; i++) {
    const cv = document.createElement('canvas');
    cv.width = 64;
    cv.height = 64;
    const ctx = cv.getContext('2d');
    if (i === 2) {
      // +Y Zenith
      const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 45);
      g.addColorStop(0.0, cTop);
      g.addColorStop(1.0, cMid);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
    } else if (i === 3) {
      // -Y Ground nadir
      ctx.fillStyle = cGnd;
      ctx.fillRect(0, 0, 64, 64);
    } else {
      // Horizon side faces (+X, -X, +Z, -Z)
      const g = ctx.createLinearGradient(0, 0, 0, 64);
      g.addColorStop(0.0, cTop);
      g.addColorStop(0.42, cMid);
      g.addColorStop(0.52, cBot);
      g.addColorStop(0.62, cGnd);
      g.addColorStop(1.0, cGnd);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
      if (i === 0 || i === 4) {
        // Subtle solar specular highlight on sunward cube faces
        const sg = ctx.createRadialGradient(32, 22, 1, 32, 22, 24);
        sg.addColorStop(0.0, cSun);
        sg.addColorStop(1.0, 'rgba(0,0,0,0)');
        ctx.fillStyle = sg;
        ctx.fillRect(0, 0, 64, 64);
      }
    }
    faces.push(cv);
  }
  const cubeTex = new THREE.CubeTexture(faces);
  cubeTex.encoding = THREE.sRGBEncoding;
  cubeTex.needsUpdate = true;
  const rt = pmremGenerator.fromCubemap(cubeTex);
  cubeTex.dispose();
  envMapCache.set(cacheKey, rt.texture);
  return rt.texture;
}

// Balanced Physically-Based Lighting with Texel-Snapped Drone-Following Shadows
const hemiLight = new THREE.HemisphereLight(0xbae6fd, 0x1e3a1f, 0.55);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xfff7ed, 1.15);
const currentSunOffset = new THREE.Vector3(130, 160, 90);
dirLight.position.copy(currentSunOffset);
dirLight.castShadow = true;
const shadowMapRes = Math.min(4096, renderer.capabilities.maxTextureSize || 2048);
dirLight.shadow.mapSize.width = shadowMapRes;
dirLight.shadow.mapSize.height = shadowMapRes;
dirLight.shadow.camera.near = 15;
dirLight.shadow.camera.far = 520;
const dRange = 135;
dirLight.shadow.camera.left = -dRange;
dirLight.shadow.camera.right = dRange;
dirLight.shadow.camera.top = dRange;
dirLight.shadow.camera.bottom = -dRange;
dirLight.shadow.bias = -0.00025;
dirLight.shadow.normalBias = 0.022;
scene.add(dirLight);
scene.add(dirLight.target);

function updateShadowFrustum() {
  // Snap shadow frustum center to world texel grid to prevent shadow edge shimmering
  const texelWorldStep = (dRange * 2) / shadowMapRes * 4.0;
  const snapX = Math.round(drone.pos.x / texelWorldStep) * texelWorldStep;
  const snapZ = Math.round(drone.pos.z / texelWorldStep) * texelWorldStep;
  dirLight.target.position.set(snapX, 0, snapZ);
  dirLight.position.set(snapX + currentSunOffset.x, currentSunOffset.y, snapZ + currentSunOffset.z);
}

// ============================================================================
// 6. CITY LAYOUT
// ============================================================================
const buildingColliders = [];
const movingColliders = [];
const signalIntersections = [];
const outerMapRoads = [];
const outerMapCourtyards = [];
const CITY_BOUNDS = { halfWidth: 215, north: -325, south: 105 };
let updateSignals = () => {};
let signalTime = 0;
const townMapFeatures = [];
let cityTrain = null;
let trainStopRemaining = 0;
const crossingArms = [];
const crossingBarrierColliders = [];
const crossingBarrierBounds = new THREE.Box3();
const roadVehicles = [];

function vehiclePart(parent, geometry, material, x, y, z, castShadow = false) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function vehicleProfile(points, depth, bevel) {
  const shape = new THREE.Shape();
  points.forEach(([x, y], index) => {
    if (index === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  });
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: depth - 2 * bevel, bevelEnabled: true, bevelSize: bevel,
    bevelThickness: bevel, bevelSegments: 3, steps: 1
  });
  geometry.translate(0, 0, bevel - depth / 2);
  return geometry;
}

function buildRoadVehicles() {
  const paint = [0x345771, 0xb3b5ad, 0x794038, 0xd0af65, 0xe4e3d7, 0x397a63].map(color =>
    new THREE.MeshStandardMaterial({ color, roughness: .37, metalness: .32 }));
  const glass = new THREE.MeshStandardMaterial({ color: 0x273f51, roughness: .2, metalness: .35 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x202125, roughness: .95 });
  const rim = new THREE.MeshStandardMaterial({ color: 0x9aabb6, metalness: .48, roughness: .42 });
  const white = new THREE.MeshBasicMaterial({ color: 0xffefd0 });
  const red = new THREE.MeshBasicMaterial({ color: 0xc94035 });
  const plate = new THREE.MeshBasicMaterial({ color: 0xe9e6d8 });
  const types = [
    { length: 4.35, width: 1.77, axle: 1.32, wheel: .35, lightY: .76,
      body: [[-2.12,.84],[-1.6,1],[1.72,.97],[2.12,.77]],
      cabin: [[-1.51,.93],[-.68,1.53],[.49,1.52],[1.26,.96]],
      roof: [-.09, 1.61, 1.32, 1.34], pillars: [[-.48,1.29],[.08,1.28]] },
    { length: 5.05, width: 1.95, axle: 1.52, wheel: .38, lightY: .90,
      body: [[-2.47,1.48],[-2.32,2.02],[.60,2.02],[1.41,1.17],[2.38,1.12],[2.47,.91]],
      cabin: [[-2.34,1.40],[-2.27,1.93],[.65,1.93],[1.42,1.40]],
      roof: [-.82, 2.10, 2.99, 1.65], pillars: [[-1.41,1.66],[-.52,1.66],[.32,1.66]] },
    { length: 9.9, width: 2.48, axle: 2.78, wheel: .52, lightY: .99,
      body: [[-4.88,2.50],[-4.65,3.22],[4.40,3.22],[4.83,2.89],[4.89,.92]],
      cabin: [[-4.58,1.72],[-4.58,2.89],[4.49,2.89],[4.73,1.72]],
      roof: [-.12, 3.34, 2.31, 1.5], pillars: [[-3,2.30],[-1.46,2.30],[.08,2.30],[1.62,2.30],[3.16,2.30]] }
  ];

  const models = types.map(type => {
    const { length, width, axle, wheel, body, cabin, roof } = type;
    const edge = length / 2 - .06;
    const wheelArch = wheel + .10;
    const outline = [[-edge, wheel], ...body, [edge, wheel]];
    for (const x of [axle, -axle]) {
      for (let step = 0; step <= 10; step++) {
        const angle = step / 10 * Math.PI;
        outline.push([x + Math.cos(angle) * wheelArch, wheel + Math.sin(angle) * wheelArch]);
      }
    }
    return {
      shell: vehicleProfile(outline, width, length > 6 ? .135 : .085),
      glazing: vehicleProfile(cabin, width + (length < 4.5 ? -.23 : .055), .028),
      roof: new THREE.BoxGeometry(roof[2], .09, roof[3]),
      pillar: new THREE.BoxGeometry(.10, length > 6 ? 1.16 : .49, .06),
      tire: new THREE.CylinderGeometry(wheel, wheel, wheel * .64, 16),
      hub: new THREE.CylinderGeometry(wheel * .56, wheel * .56, .027, 12),
      lamp: new THREE.BoxGeometry(.11, .15, length > 6 ? .37 : .41),
      bumper: new THREE.BoxGeometry(.17, .18, width * .87),
      plate: new THREE.BoxGeometry(.036, .12, .30),
      mirror: new THREE.BoxGeometry(.22, .13, .21)
    };
  });

  const vanWindshield = new THREE.BoxGeometry(.045, .94, 1.52);
  const busWindshield = new THREE.BoxGeometry(.045, 1.14, 2.02);
  for (const [index, z] of CITY.streets.entries()) {
    for (const direction of [-1, 1]) {
      const typeIndex = (index * 2 + (direction > 0 ? 1 : 0)) % types.length;
      const type = types[typeIndex];
      const model = models[typeIndex];
      const car = new THREE.Group();
      const body = paint[(index + direction + paint.length) % paint.length];
      vehiclePart(car, model.shell, body, 0, 0, 0, true);
      vehiclePart(car, model.glazing, glass, 0, 0, 0);
      if (typeIndex === 1) vehiclePart(car, vanWindshield, glass, 1.04, 1.63, 0).rotation.z = .75;
      if (typeIndex === 2) vehiclePart(car, busWindshield, glass, 4.88, 2.23, 0).rotation.z = .03;
      vehiclePart(car, model.roof, typeIndex === 2 ? rubber : body, type.roof[0], type.roof[1], 0);
      for (const end of [-1, 1]) {
        vehiclePart(car, model.bumper, rubber, end * (type.length / 2 - .03), type.lightY - .23, 0);
        vehiclePart(car, model.plate, plate, end * (type.length / 2 + .07), type.lightY - .23, 0);
      }
      for (const side of [-1, 1]) {
        for (const x of [-type.axle, type.axle]) {
          vehiclePart(car, model.tire, rubber, x, type.wheel, side * (type.width / 2 - .08)).rotation.x = Math.PI / 2;
          vehiclePart(car, model.hub, rim, x, type.wheel,
            side * (type.width / 2 - .067 + type.wheel * .32)).rotation.x = Math.PI / 2;
        }
        const glassSide = type.width / 2 + (typeIndex === 0 ? -.10 : .043);
        for (const [x, y] of type.pillars) vehiclePart(car, model.pillar, body, x, y, side * glassSide);
        vehiclePart(car, model.lamp, white, type.length / 2 - .06, type.lightY, side * type.width * .33);
        vehiclePart(car, model.lamp, red, -type.length / 2 + .02, type.lightY, side * type.width * .33);
        vehiclePart(car, model.mirror, body, typeIndex === 2 ? 4.22 : .80,
          typeIndex === 2 ? 2.13 : 1.25, side * (type.width / 2 + .06));
      }
      car.position.set(-120 + index * 49 + direction * 23, .06, z + direction * 3.5);
      car.rotation.y = direction === 1 ? 0 : Math.PI;
      cityGroup.add(car);
      roadVehicles.push({ car, direction, speed: 7.5 + index % 3 });
      movingColliders.push({ object: car, w: type.length, h: type.roof[1] + .05, d: type.width, label: '道路車輛' });
    }
  }
}

function registerBoxCollider(x, yCenter, z, w, h, d, label = '障礙物', color = '#64748b', showOnMap = true) {
  if (isNaN(x) || isNaN(yCenter) || isNaN(z) || isNaN(w) || isNaN(h) || isNaN(d)) {
    return;
  }
  buildingColliders.push({
    minX: x - w / 2,
    maxX: x + w / 2,
    minY: yCenter - h / 2,
    maxY: yCenter + h / 2,
    minZ: z - d / 2,
    maxZ: z + d / 2,
    label
  });
  if (showOnMap && h >= 3) {
    townMapFeatures.push({ x, z, w, d, color, label });
  }
}

const CITY = {
  minX: -180, maxX: 180, minZ: -280, maxZ: 52,
  avenues: [-144, -72, 0, 72, 144],
  streets: [-248, -184, -120, -28, 20],
  avenueWidth: 14, streetWidth: 16
};
const cityMapAreas = [];
const cityLandmarks = [];

function buildCityBackdrop() {
  const { halfWidth, north: northEdge, south: southEdge } = CITY_BOUNDS;
  const centerZ = (northEdge + southEdge) / 2;
  const backdrop = new THREE.Group();
  backdrop.name = '城市邊緣街廓';
  cityGroup.add(backdrop);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(halfWidth * 2, southEdge - northEdge),
    new THREE.MeshLambertMaterial({ color: new THREE.Color(0x383e44).convertSRGBToLinear() }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -.04, centerZ);
  backdrop.add(ground);

  const west = [-halfWidth, CITY.minX];
  const east = [CITY.maxX, halfWidth];
  const north = [northEdge, CITY.minZ];
  const south = [CITY.maxZ, southEdge];
  const xs = [...west, ...CITY.avenues, ...east];
  const zs = [...north, ...CITY.streets, RAILWAY_Z, ...south].sort((a, b) => a - b);

  function road(x1, z1, x2, z2, width) {
    outerMapRoads.push([x1, z1, x2, z2, width]);
  }

  for (const x of xs) {
    const stops = x <= CITY.minX || x >= CITY.maxX
      ? [...north, ...south] : null;
    for (const route of stops ? [stops] : [north, south]) {
      for (let i = 1; i < route.length; i++) {
        const from = route[i - 1];
        const to = route[i];
        if (Math.abs(x) === halfWidth) continue;
        road(x, from, x, to, CITY.avenueWidth);
      }
    }
  }
  for (const z of zs) {
    if (z === RAILWAY_Z || z === CITY.minZ || z === CITY.maxZ || z === northEdge || z === southEdge) continue;
    road(-halfWidth, z, CITY.minX, z, CITY.streetWidth);
    road(CITY.maxX, z, halfWidth, z, CITY.streetWidth);
  }

  const cube = new THREE.BoxGeometry();
  const transform = new THREE.Object3D();
  const roadMesh = new THREE.InstancedMesh(cube,
    new THREE.MeshLambertMaterial({ color: new THREE.Color(0x54575b).convertSRGBToLinear() }), outerMapRoads.length);
  outerMapRoads.forEach(([x1, z1, x2, z2, width], i) => {
    const dx = x2 - x1, dz = z2 - z1;
    transform.position.set((x1 + x2) / 2, .015, (z1 + z2) / 2);
    transform.rotation.y = Math.atan2(dx, dz);
    transform.scale.set(width, .02, Math.hypot(dx, dz));
    transform.updateMatrix();
    roadMesh.setMatrixAt(i, transform.matrix);
  });
  transform.rotation.y = 0;
  roadMesh.frustumCulled = false;
  backdrop.add(roadMesh);

  for (const x of xs.slice(1, -1)) {
    for (const z of zs.slice(1, -1)) {
      if (z === RAILWAY_Z || z === CITY.minZ || z === CITY.maxZ) continue;
      if (x > CITY.minX && x < CITY.maxX && z > CITY.minZ && z < CITY.maxZ) continue;
      signalIntersections.push([x, z]);
    }
  }
  const buildings = [];

  const palette = [0x7a8487, 0x928176, 0x8a897e, 0x747b83, 0xa29a89, 0x857d79];
  // A seeded generator keeps the skyline stable on every load.
  let seed = 1469;
  function random() {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  for (let row = 0; row < zs.length - 1; row++) {
    for (let col = 0; col < xs.length - 1; col++) {
      const x = (xs[col] + xs[col + 1]) / 2;
      const z = (zs[row] + zs[row + 1]) / 2;
      if (x > CITY.minX && x < CITY.maxX && z > CITY.minZ && z < CITY.maxZ) continue;
      const lotWidth = xs[col + 1] - xs[col] - 25;
      const lotDepth = zs[row + 1] - zs[row] - 20;
      if (lotDepth < 8 || random() < .10) continue;
      const shiftedX = x;
      const green = (row + col) % 5 === 0;
      outerMapCourtyards.push([shiftedX, z, lotWidth, lotDepth, green]);
      if (green) continue;
      const edgeDistance = Math.max(CITY.minX - x, x - CITY.maxX, CITY.minZ - z, z - CITY.maxZ);
      const tall = random() < .20 && lotDepth > 26 && edgeDistance > 70;
      for (const side of [-1, 1]) {
        const bx = shiftedX + side * lotWidth * .23;
        const bz = z + (random() - .5) * lotDepth * .18;
        const w = lotWidth * (.28 + random() * .13);
        const d = lotDepth * (.50 + random() * .26);
        const h = tall ? 33 + random() * 42 : 6 + random() * 22;
        const color = palette[Math.floor(random() * palette.length)];
        const profile = (row + col * 2 + (side > 0 ? 1 : 0)) % 4;
        if (profile === 0 || tall) {
          const podium = h * .30;
          buildings.push([bx, podium / 2, bz, w, podium, d, color]);
          buildings.push([bx - w * .09, (h + podium) / 2, bz, w * .72, h - podium, d * .73, color]);
        } else if (profile === 1) {
          buildings.push([bx, h * .33, bz, w, h * .66, d, color]);
          buildings.push([bx + w * .19, h * .50, bz, w * .60, h, d * .78, color]);
        } else {
          const slabHeight = profile === 2 ? h * .62 : h;
          buildings.push([bx, slabHeight / 2, bz, w, slabHeight, d, color]);
        }
      }
    }
  }
  // High-fidelity procedural Taiwanese apartment facade atlas for outer horizon skyline
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d');
  // Authentic Taiwanese Ding-Gua ceramic tile base (米白/淺灰二丁掛磁磚)
  ctx.fillStyle = '#d6d0c4';
  ctx.fillRect(0, 0, 512, 512);

  // Ceramic tile joint grout lines (磁磚細橫向勾縫)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
  for (let y = 0; y < 512; y += 8) {
    ctx.fillRect(0, y, 512, 1);
  }

  const floors = 8;
  const bays = 8;
  const floorH = 512 / floors;
  const bayW = 512 / bays;

  for (let f = 0; f < floors; f++) {
    const fy = f * floorH;
    ctx.fillStyle = '#8b8479';
    ctx.fillRect(0, fy + floorH - 6, 512, 6);

    if (f === 0) {
      // Ground floor: Taiwanese commercial shopfronts with roll-up shutters & colorful awnings
      ctx.fillStyle = '#475569';
      ctx.fillRect(4, fy + 8, 504, floorH - 18);
      ctx.fillStyle = '#64748b';
      for (let sy = fy + 12; sy < fy + floorH - 14; sy += 6) {
        ctx.fillRect(4, sy, 504, 2);
      }
      const awningColors = ['#dc2626', '#16a34a', '#2563eb', '#ea580c', '#ca8a04', '#0d9488', '#7c3aed', '#b91c1c'];
      for (let b = 0; b < bays; b++) {
        ctx.fillStyle = awningColors[b % awningColors.length];
        ctx.fillRect(b * bayW + 4, fy + 4, bayW - 8, 12);
      }
      continue;
    }

    // Upper residential windows with reflections, grilles, and AC units
    for (let b = 0; b < bays; b++) {
      const bx = b * bayW + 8;
      const bw = bayW - 16;
      const bh = floorH - 20;
      const by = fy + 8;

      // Dark window frame & glass
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = '#334155';
      ctx.fillRect(bx + 2, by + 2, bw - 4, bh - 4);
      // Window reflection
      ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.fillRect(bx + 3, by + 3, bw - 6, 6);

      // Stainless steel window grilles (不鏽鋼防盜鐵窗花)
      if ((f + b) % 2 === 0) {
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(bx, by, bw, bh);
        for (let gx = bx + 6; gx < bx + bw; gx += 8) {
          ctx.beginPath();
          ctx.moveTo(gx, by);
          ctx.lineTo(gx, by + bh);
          ctx.stroke();
        }
      }

      // Wall-mounted split AC outdoor units (外掛分離式冷氣機)
      if ((f * 3 + b) % 4 === 0) {
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(bx + bw - 10, by + bh - 14, 16, 12);
        ctx.fillStyle = '#334155';
        ctx.fillRect(bx + bw - 7, by + bh - 11, 7, 7);
      }
    }
  }

  // Top roof parapet cap
  ctx.fillStyle = '#475569';
  ctx.fillRect(0, 0, 512, 10);
  const texture = new THREE.CanvasTexture(canvas);
  texture.encoding = THREE.sRGBEncoding;
  const skylineBox = cube.clone();
  const uv = skylineBox.attributes.uv;
  const normals = skylineBox.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    uv.setY(i, Math.abs(normals.getY(i)) > .5 ? .035 : .11 + uv.getY(i) * .88);
  }
  const lots = new THREE.InstancedMesh(cube, new THREE.MeshLambertMaterial(), outerMapCourtyards.length);
  outerMapCourtyards.forEach(([x, z, w, d, green], i) => {
    transform.position.set(x, .02, z);
    transform.scale.set(w, .09, d);
    transform.updateMatrix();
    lots.setMatrixAt(i, transform.matrix);
    lots.setColorAt(i, new THREE.Color(green ? 0x727d60 : 0x9a9183).convertSRGBToLinear());
  });
  lots.frustumCulled = false;
  backdrop.add(lots);

  const skyline = new THREE.InstancedMesh(skylineBox,
    new THREE.MeshLambertMaterial({ map: texture }), buildings.length);
  buildings.forEach(([x, y, z, w, h, d, color], i) => {
    transform.position.set(x, y, z);
    transform.scale.set(w, h, d);
    transform.updateMatrix();
    skyline.setMatrixAt(i, transform.matrix);
    registerBoxCollider(x, y, z, w, h, d, '外圍街廓建築', '#756f65', false);
    skyline.setColorAt(i, new THREE.Color(color).convertSRGBToLinear());
  });
  skyline.frustumCulled = false;
  backdrop.add(skyline);


}

function* buildCity() {
  const group = new THREE.Group();
  group.name = '台灣城市';
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const colors = {
    base: 0x796d5e, asphalt: 0x353c45, sidewalk: 0x9c917d, white: 0xe9e6db,
    yellow: 0xd8aa53, lawn: 0x527743, paving: 0x977357, court: 0x417c77,
    glass: 0x506370, metalRoof: 0x657078, trim: 0x52616c, concrete: 0x988b78,
    wood: 0x715342, leaves: 0x547d49,
    slateRoof: 0x505459, tealRoof: 0x5c6166, copperRoof: 0x666a6e,
    tileRoof: 0x55595d, greenRoof: 0x525c55, sandRoof: 0x6e7175,
    puTrack: 0x993d31, tinGreen: 0x3d4d42, tinBlue: 0x45515e,
    courtGreen: 0x276749, courtBlue: 0x1e3a8a, tankSteel: 0xc8d1d9, rimOrange: 0xe65100
  };
  const materials = Object.fromEntries(Object.entries(colors).map(([key, color]) =>
    [key, new THREE.MeshStandardMaterial({ color: new THREE.Color(color).convertSRGBToLinear(), roughness: 0.88 })]));
  applyTreeWindShader(materials.leaves, true);
  function surfaceMaterial(asphalt) {
    const tile = document.createElement('canvas');
    tile.width = tile.height = 256;
    const ctx = tile.getContext('2d');
    ctx.fillStyle = asphalt ? '#45464a' : '#a79b86';
    ctx.fillRect(0, 0, 256, 256);
    let seed = 2304;
    const sample = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 5700; i++) {
      ctx.fillStyle = sample() > .51 ? '#fff2da26' : '#171b2536';
      ctx.fillRect(sample() * 256, sample() * 256, 1 + sample() * 2, 1 + sample() * 2);
    }
    if (!asphalt) {
      ctx.strokeStyle = '#6a625b80';
      for (let i = 0; i < 256; i += 32) {
        ctx.strokeRect(i, 0, 32, 256);
        ctx.strokeRect(0, i, 256, 32);
      }
    }
    const texture = new THREE.CanvasTexture(tile);
    texture.encoding = THREE.sRGBEncoding;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return new THREE.MeshStandardMaterial({ map: texture, roughness: .96 });
  }
  const roadSurface = surfaceMaterial(true);
  const walkSurface = surfaceMaterial(false);
  function surface(mat, x, y, z, w, d, tileSize) {
    const geometry = new THREE.PlaneGeometry(w, d);
    const uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, uv.getX(i) * w / tileSize, uv.getY(i) * d / tileSize);
    }
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  const batches = new Map();
  function block(key, x, y, z, w, h, d) {
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key).push([x, y, z, w, h, d]);
  }

  const cityWidth = CITY.maxX - CITY.minX;
  const cityDepth = CITY.maxZ - CITY.minZ;
  const centerZ = (CITY.minZ + CITY.maxZ) / 2;
  block('base', 0, -.28, centerZ, cityWidth, .55, cityDepth);
  for (const x of CITY.avenues) {
    surface(roadSurface, x, .045, centerZ, CITY.avenueWidth, cityDepth, 4);
    for (const side of [-1, 1]) {
      block('white', x + side * 6.5, .056, centerZ, .14, .012, cityDepth);
    }
    for (let z = CITY.minZ + 6; z < CITY.maxZ; z += 8) {
      if (CITY.streets.some(street => Math.abs(z - street) < 13) || Math.abs(z - RAILWAY_Z) < 9) continue;
      if (x === 0 && Math.abs(z) < 13) continue;
      block('yellow', x, .06, z, .17, .012, 3.2);
    }
  }
  for (const z of CITY.streets) {
    surface(roadSurface, 0, .055, z, cityWidth, CITY.streetWidth, 4);
    for (let x = CITY.minX + 5; x < CITY.maxX; x += 8) {
      if (CITY.avenues.some(avenue => Math.abs(x - avenue) < 12)) continue;
      block('yellow', x, .064, z, 3.2, .012, .17);
    }
    for (const x of CITY.avenues) {
      for (let stripe = -3; stripe <= 3; stripe++) {
        for (const side of [-1, 1]) {
          block('white', x + stripe * 1.6, .065, z + side * 10, .67, .012, 2.2);
          block('white', x + side * 9, .065, z + stripe * 1.6, 2.2, .012, .67);
        }
      }
    }
  }
  const manhole = new THREE.CylinderGeometry(.47, .47, .018, 18);
  for (const z of CITY.streets) {
    for (const x of [-116, -45, 28, 108]) {
      block('asphalt', x, .062, z + 2.6, 3.2, .014, 1.55);
      const cover = new THREE.Mesh(manhole, materials.trim);
      cover.position.set(x + .62, .079, z + 2.6);
      cover.receiveShadow = true;
      group.add(cover);
      for (const offset of [-.2, 0, .2]) {
        block('asphalt', x + .62, .09, z + 2.6 + offset, .63, .012, .035);
      }
    }
  }
  const signalColors = [0xf04436, 0xffc544, 0x40e38b];
  const lampMaterials = [0, 1].map(axis => signalColors.map((color, index) => {
    const material = new THREE.MeshStandardMaterial({ color: 0x1e2528, emissive: color });
    materials['signal-' + axis + '-' + index] = material;
    return material;
  }));
  updateSignals = dt => {
    signalTime = (signalTime + dt) % 24;
    lampMaterials.forEach((lamps, axis) => {
      const phase = (signalTime + axis * 12) % 24;
      const active = phase < 9 ? 2 : phase < 11 ? 1 : 0;
      lamps.forEach((lamp, index) => { lamp.emissiveIntensity = index === active ? 1.4 : .045; });
    });
  };
  updateSignals(0);
  for (const x of CITY.avenues) {
    for (const z of CITY.streets) signalIntersections.push([x, z]);
  }
  for (const [x, z] of signalIntersections) {
    for (const side of [-1, 1]) {
      const poleX = x + side * 8.4;
      const poleZ = z + side * 9.7;
      block('trim', poleX, 2.45, poleZ, .22, 4.9, .22);
      block('trim', poleX - side * 2, 4.7, poleZ, 4.15, .16, .16);
      block('asphalt', poleX - side * 3.9, 4.47, poleZ, .44, .78, .29);
      block('asphalt', poleX, 4.47, poleZ - side * .25, .29, .78, .44);
      for (let lamp = 0; lamp < 3; lamp++) {
        const y = 4.71 - lamp * .235;
        block('signal-0-' + lamp, poleX - side * 3.9, y, poleZ + side * .16, .20, .19, .06);
        block('signal-1-' + lamp, poleX + side * .16, y, poleZ - side * .25, .06, .19, .20);
      }
      block('white', x - side * 3.4, .08, z + side * 12.6, 6.4, .018, .30);
      block('white', x + side * 11.6, .08, z + side * 4, .30, .018, 7.4);
      registerBoxCollider(poleX, 2.45, poleZ, .22, 4.9, .22, '路口號誌柱', '#52616c', false);
      registerBoxCollider(poleX - side * 2, 4.7, poleZ, 4.15, .16, .16, '號誌橫桿', '#52616c', false);
      registerBoxCollider(poleX - side * 3.9, 4.47, poleZ, .44, .78, .29, '交通號誌', '#52616c', false);
      registerBoxCollider(poleX, 4.47, poleZ - side * .25, .29, .78, .44, '交通號誌', '#52616c', false);
    }
  }

  const facadeMaterials = new Map();
  function facade(kind, floors, variant) {
    const key = kind + floors + '-' + variant;
    if (facadeMaterials.has(key)) return facadeMaterials.get(key);
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = floors * 24;
    const ctx = canvas.getContext('2d');
    const office = kind === 'office';
    const bays = office && variant === 2 ? 4 : kind === 'housing' && variant === 1 ? 5 : 6;
    const bayWidth = 128 / bays;

    // Taiwanese wall base color (米白丁掛磚、灰白磁磚、淺駝色二丁掛)
    const twTileColors = ['#d8d3c8', '#ccc7bb', '#bebbb1'];
    const officeColors = ['#5a656d', '#6f7875', '#7a6f65'];
    ctx.fillStyle = office ? officeColors[variant % 3] : twTileColors[variant % 3];
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Taiwanese ceramic tile joint lines (丁掛磚細勾縫)
    if (!office) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
      for (let ty = 0; ty < canvas.height; ty += 4) {
        ctx.fillRect(0, ty, canvas.width, 1);
      }
    }

    for (let floor = 0; floor < floors; floor++) {
      const y = floor * 24;
      ctx.fillStyle = office ? '#354b59' : '#88847b';
      ctx.fillRect(0, y + 21, 128, office ? 3 : 2);

      // Ground floor (floor 0): Taiwanese roll-up metal shutter or glass shop
      if (!office && floor === 0) {
        ctx.fillStyle = '#475569'; // Roll-up steel shutter (鐵捲門)
        ctx.fillRect(4, y + 2, 120, 18);
        ctx.fillStyle = '#64748b';
        for (let sy = y + 4; sy < y + 20; sy += 3) {
          ctx.fillRect(4, sy, 120, 1);
        }
        continue;
      }

      for (let bay = 0; bay < bays; bay++) {
        const inset = office ? 2 : 4;
        const x = inset + bay * bayWidth;
        const width = bayWidth - inset * 2;

        ctx.fillStyle = '#1e293b';
        ctx.fillRect(x - 1, y + 3, width + 2, 16);
        ctx.fillStyle = office ? ['#3b82f6', '#0ea5e9', '#64748b'][variant % 3] : '#475569';
        ctx.fillRect(x, y + 4, width, 14);

        ctx.fillStyle = (floor + bay) % 3 === 0 ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.18)';
        ctx.fillRect(x + 1, y + 5, width - 2, 4);

        if (!office) {
          ctx.fillStyle = '#cbd5e1';
          ctx.fillRect(x - 1, y + 18, width + 2, 2);

          // Taiwanese Stainless Iron Window Grille (外推防盜鐵窗花網格)
          if ((floor + bay) % 2 === 0) {
            ctx.strokeStyle = '#94a3b8';
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y + 4, width, 14);
            for (let gx = x + 3; gx < x + width; gx += 4) {
              ctx.beginPath();
              ctx.moveTo(gx, y + 4);
              ctx.lineTo(gx, y + 18);
              ctx.stroke();
            }
          }

          // Wall-mounted AC unit on the side of window (外掛冷氣室外機)
          if ((floor * 3 + bay) % 4 === 0) {
            ctx.fillStyle = '#f1f5f9';
            ctx.fillRect(x + width - 4, y + 11, 7, 6);
            ctx.fillStyle = '#334155';
            ctx.fillRect(x + width - 2, y + 13, 3, 3);
          }
        }
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    const material = new THREE.MeshStandardMaterial({ map: texture, roughness: office ? .45 : .85 });
    facadeMaterials.set(key, material);
    return material;
  }

  const tankCylGeo = new THREE.CylinderGeometry(0.9, 0.9, 1.8, 16);
  const tankDomeGeo = new THREE.SphereGeometry(0.9, 16, 8, 0, Math.PI * 2, 0, Math.PI / 4);
  const tankMetalMat = new THREE.MeshStandardMaterial({
    color: 0xd8dde2,
    metalness: 0.85,
    roughness: 0.25
  });

  function addWaterTank(tx, ty, tz) {
    block('trim', tx, ty + 0.25, tz, 1.4, 0.5, 1.4);
    const cyl = new THREE.Mesh(tankCylGeo, tankMetalMat);
    cyl.position.set(tx, ty + 0.5 + 0.9, tz);
    cyl.castShadow = true;
    group.add(cyl);
    const dome = new THREE.Mesh(tankDomeGeo, tankMetalMat);
    dome.position.set(tx, ty + 0.5 + 1.8, tz);
    group.add(dome);
    registerBoxCollider(tx, ty + 1.4, tz, 2.0, 2.8, 2.0, '頂樓不鏽鋼水塔', '#d8dde2', false);
  }

  const TAIWAN_LOCAL_SHOPS = [
    { name: '八方雲集', sub: '鍋貼 • 水餃 專賣店', bg: '#f59e0b', fg: '#b91c1c', border: '#b91c1c', logo: '餃' },
    { name: '早安美而美', sub: '中西式活力精緻早午餐', bg: '#ffffff', fg: '#15803d', border: '#b91c1c', logo: '美' },
    { name: '全聯福利中心', sub: 'PX MART 買進美好生活', bg: '#1d4ed8', fg: '#ffffff', border: '#ef4444', logo: 'PX' },
    { name: '全國電子', sub: '揪甘心 3C 家電特賣', bg: '#dc2626', fg: '#ffffff', border: '#ffffff', logo: '全' },
    { name: '康是美', sub: 'COSMED 藥妝美彩生活館', bg: '#ea580c', fg: '#ffffff', border: '#ea580c', logo: 'C' },
    { name: 'SYM 三陽機車', sub: '專業維修 排氣定檢 買賣', bg: '#b91c1c', fg: '#ffffff', border: '#ffffff', logo: 'SYM' },
    { name: '大呼過癮', sub: '百元風味臭臭小火鍋', bg: '#eab308', fg: '#991b1b', border: '#991b1b', logo: '火' },
    { name: '清心福全', sub: '特級純茶 • 手搖冷飲專賣', bg: '#16a34a', fg: '#ffffff', border: '#dc2626', logo: '清' },
    { name: '池上木片便當', sub: '正宗池上米 現做現包', bg: '#78350f', fg: '#fef08a', border: '#fef08a', logo: '米' },
    { name: '小林眼鏡', sub: '專業驗光配鏡 • 隱形眼鏡', bg: '#1e3a8a', fg: '#ffffff', border: '#60a5fa', logo: '鏡' },
    { name: '屈臣氏', sub: 'Watsons 美麗與健康生活', bg: '#0891b2', fg: '#ffffff', border: '#ffffff', logo: 'W' },
    { name: '台安藥局', sub: '健保特約 處方調劑 慢性病', bg: '#ffffff', fg: '#1d4ed8', border: '#16a34a', logo: '✚' },
    { name: '振宇五金', sub: '水電衛浴 五金工具 配件', bg: '#0284c7', fg: '#ffffff', border: '#facc15', logo: '五' },
    { name: '弘爺漢堡', sub: '美味活力早餐 連鎖專賣', bg: '#f97316', fg: '#ffffff', border: '#ffffff', logo: '弘' },
    { name: '小北百貨', sub: '24H 生活五金 • 百貨批發', bg: '#facc15', fg: '#1e40af', border: '#dc2626', logo: '北' },
    { name: '蝦皮店到店', sub: '包裹寄取 便利生活取件門市', bg: '#ea580c', fg: '#ffffff', border: '#ffffff', logo: 'S' }
  ];

  const genericShopTextures = new Map();
  function getGenericStoreTexture(shop) {
    if (genericShopTextures.has(shop.name)) return genericShopTextures.get(shop.name);
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = shop.bg;
    ctx.fillRect(0, 0, 512, 128);

    ctx.strokeStyle = shop.border;
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, 506, 122);
    ctx.fillStyle = shop.border;
    ctx.fillRect(0, 0, 512, 8);
    ctx.fillRect(0, 120, 512, 8);

    ctx.beginPath();
    ctx.arc(68, 64, 46, 0, Math.PI * 2);
    ctx.fillStyle = shop.border;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(68, 64, 41, 0, Math.PI * 2);
    ctx.fillStyle = shop.bg === '#ffffff' ? '#f1f5f9' : '#ffffff';
    ctx.fill();

    ctx.fillStyle = shop.border;
    ctx.font = 'bold 36px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(shop.logo, 68, 65);

    ctx.fillStyle = shop.fg;
    ctx.font = 'bold 52px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(shop.name, 130, 48);

    ctx.fillStyle = shop.fg === '#ffffff' ? 'rgba(255,255,255,0.85)' : '#475569';
    ctx.font = 'bold 22px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
    ctx.fillText(shop.sub, 132, 94);

    const texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    genericShopTextures.set(shop.name, texture);
    return texture;
  }

  const genericVerticalTextures = new Map();
  function getGenericVerticalTexture(shop) {
    if (genericVerticalTextures.has(shop.name)) return genericVerticalTextures.get(shop.name);
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 384;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = shop.bg;
    ctx.fillRect(0, 0, 128, 384);

    ctx.strokeStyle = shop.border;
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, 122, 378);

    ctx.beginPath();
    ctx.arc(64, 52, 34, 0, Math.PI * 2);
    ctx.fillStyle = shop.border;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(64, 52, 29, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.fillStyle = shop.border;
    ctx.font = 'bold 26px "Microsoft JhengHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(shop.logo, 64, 53);

    ctx.fillStyle = shop.fg;
    ctx.font = 'bold 34px "Microsoft JhengHei", sans-serif';
    ctx.textAlign = 'center';
    const chars = shop.name.split('');
    const startY = 125;
    const charSpacing = Math.min(54, (355 - startY) / chars.length);
    chars.forEach((c, idx) => {
      ctx.fillText(c, 64, startY + idx * charSpacing);
    });

    const texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    genericVerticalTextures.set(shop.name, texture);
    return texture;
  }

  function addGenericStreetStorefront(bx, bz, bw, bd, brandIndex) {
    const shop = TAIWAN_LOCAL_SHOPS[brandIndex % TAIWAN_LOCAL_SHOPS.length];
    const frontZ = bz + bd / 2;
    const signW = Math.min(bw * 0.72, 12.0);
    const signH = 1.9;
    const signY = 3.9;

    // Horizontal Storefront Signboard
    const signGeo = new THREE.PlaneGeometry(signW, signH);
    const signMat = new THREE.MeshBasicMaterial({
      map: getGenericStoreTexture(shop),
      side: THREE.DoubleSide
    });
    const signMesh = new THREE.Mesh(signGeo, signMat);
    signMesh.position.set(bx, signY, frontZ + 0.15);
    group.add(signMesh);

    // Weather Awning / Steel Canopy below sign
    block('metalRoof', bx, 2.95, frontZ + 0.75, signW + 0.4, 0.15, 1.4);
    registerBoxCollider(bx, 2.95, frontZ + 0.75, signW + 0.4, 0.15, 1.4, shop.name + '雨庇', '#657078', false);

    // Protruding Vertical Double-Sided Blade Sign
    const vertW = 1.25;
    const vertH = 3.4;
    const vertY = 5.2;
    const vertX = bx + bw * 0.42;
    const vertZ = frontZ + vertW / 2 + 0.1;

    const vertGeo = new THREE.PlaneGeometry(vertW, vertH);
    const vertMat = new THREE.MeshBasicMaterial({
      map: getGenericVerticalTexture(shop),
      side: THREE.DoubleSide
    });
    const vertMesh = new THREE.Mesh(vertGeo, vertMat);
    vertMesh.position.set(vertX, vertY, vertZ);
    vertMesh.rotation.y = Math.PI / 2;
    group.add(vertMesh);

    // Steel Wall Mounting Brackets
    block('trim', vertX, vertY + 1.2, frontZ + vertW / 2, 0.08, 0.08, vertW);
    block('trim', vertX, vertY - 1.2, frontZ + vertW / 2, 0.08, 0.08, vertW);
    registerBoxCollider(vertX, vertY, vertZ, 0.25, vertH, vertW, shop.name + '側招', '#475569', false);
  }

  const gableShape = new THREE.Shape();
  gableShape.moveTo(-.5, 0);
  gableShape.lineTo(0, 1);
  gableShape.lineTo(.5, 0);
  gableShape.closePath();
  const gableGeometry = new THREE.ExtrudeGeometry(gableShape, { depth: 1, bevelEnabled: false });
  gableGeometry.translate(0, 0, -.5);

  function building(label, kind, x, z, w, d, floors, variant = 0) {
    const height = floors * 3.2;
    const office = kind === 'office';
    const color = office ? ['#626d77', '#78817e', '#8a786b'][variant % 3]
      : kind === 'housing' ? ['#947b6f', '#ada496', '#818780'][variant % 3] : '#977c9d';
    // Taiwanese flat concrete / waterproof coating roof
    const roof = 'slateRoof';

    function mass(cx, cz, width, depth, bottom, levels, drawFootprint = true) {
      const h = levels * 3.2;
      const wall = facade(kind, levels, variant);
      const tower = new THREE.Mesh(cube, [wall, wall, materials[roof], materials.concrete, wall, wall]);
      tower.position.set(cx, bottom + h / 2, cz);
      tower.scale.set(width, h, depth);
      tower.castShadow = tower.receiveShadow = true;
      group.add(tower);
      block(roof, cx, bottom + h + .18, cz, width + .4, .36, depth + .4);
      registerBoxCollider(cx, bottom + (h + .36) / 2, cz, width + .4, h + .36, depth + .4, label, color, drawFootprint);
    }

    let topX = x, topZ = z, topW = w, topD = d;
    const topY = .2 + height + .36;

    if (office && variant !== 0) {
      const podium = variant === 1 ? 2 : Math.ceil(floors * .45);
      const bottom = .2 + podium * 3.2;
      mass(x, z, w, d, .2, podium);
      const offset = variant === 2 ? w * .17 : 0;
      topX = x + offset;
      topW = w * (variant === 2 ? .58 : .70);
      topD = d * .73;
      mass(topX, topZ, topW, topD, bottom, floors - podium, false);

      if (variant === 2) {
        block('concrete', topX, height + 1.35, z, topW * .42, 2.2, topD * .42);
        block('trim', topX, height + 4.0, z, .25, 4.2, .25);
      } else {
        for (const side of [-1, 1]) {
          block('trim', x + side * w * .27, height / 2 + 3.3, z + d * .371, .28, height - 6.4, .28);
        }
      }
    } else {
      const stepped = kind === 'housing' && variant === 2;
      if (stepped) {
        mass(x, z, w, d, .2, floors - 1);
        topX = x - w * .10;
        topZ = z - d * .08;
        topW = w * .62;
        topD = d * .68;
        mass(topX, topZ, topW, topD, height - 3, 1, false);
      } else {
        mass(x, z, w, d, .2, floors);
      }

      if (kind === 'housing' && variant !== 0) {
        for (let floor = 1; floor < floors; floor++) {
          for (const side of [-1, 1]) {
            const front = z + d / 2 + .3;
            const bay = x + side * w * .22;
            block('concrete', bay, floor * 3.2 + .56, front, w * .27, .25, 1);
            block(variant === 1 ? 'trim' : 'wood', bay, floor * 3.2 + .94, front + .49, w * .27, .58, .08);
          }
        }
      }
    }

    // --- Taiwanese Rooftop Features for All Buildings ---
    // 1. Concrete Parapet Walls (四面女兒牆)
    const parapetH = 0.95;
    block('trim', topX, topY + parapetH / 2, topZ - topD / 2 + 0.16, topW, parapetH, 0.32);
    block('trim', topX, topY + parapetH / 2, topZ + topD / 2 - 0.16, topW, parapetH, 0.32);
    block('trim', topX - topW / 2 + 0.16, topY + parapetH / 2, topZ, 0.32, parapetH, topD - 0.64);
    block('trim', topX + topW / 2 - 0.16, topY + parapetH / 2, topZ, 0.32, parapetH, topD - 0.64);
    // Dark waterproof roof ground
    block('slateRoof', topX, topY + 0.05, topZ, topW - 0.64, 0.1, topD - 0.64);

    // 2. Rooftop Stairhead Penthouse (屋突 / 電梯機房)
    const pentW = Math.min(topW * 0.28, 4.5);
    const pentD = Math.min(topD * 0.28, 4.2);
    const pentH = 2.4;
    const pentX = topX - topW * 0.22;
    const pentZ = topZ - topD * 0.18;
    block('concrete', pentX, topY + pentH / 2, pentZ, pentW, pentH, pentD);
    block('trim', pentX, topY + pentH + 0.08, pentZ, pentW + 0.25, 0.16, pentD + 0.25);
    block('trim', pentX, topY + 1.0, pentZ + pentD / 2 + 0.05, 0.9, 2.0, 0.1);
    registerBoxCollider(pentX, topY + pentH / 2, pentZ, pentW, pentH, pentD, '屋頂電梯機房/屋突', '#988b78', false);

    // 3. Stainless Steel Rooftop Water Tanks (不鏽鋼水塔)
    if (kind !== 'civic') {
      const tankX = topX + topW * 0.22;
      const tankZ = topZ - topD * 0.15;
      addWaterTank(tankX, topY, tankZ);
      if (topW > 16) {
        addWaterTank(tankX, topY, tankZ + 3.2);
      }
    }

    // 4. Taiwanese Corrugated Sheet Rooftop Shed (頂樓鐵皮加蓋)
    if (kind === 'housing' && (variant === 1 || variant === 2)) {
      const shedColor = variant === 1 ? 'tinGreen' : 'tinBlue';
      const shedW = Math.min(topW * 0.52, topW - pentW - 1.2);
      const shedD = Math.min(topD * 0.50, topD - 1.2);
      const shedH = 2.4;
      const shedX = topX + (topW - shedW) / 2 - 0.5;
      const shedZ = topZ + (topD - shedD) / 2 - 0.5;
      block(shedColor, shedX, topY + shedH / 2, shedZ, shedW, shedH, shedD);
      block('metalRoof', shedX, topY + shedH + 0.12, shedZ, shedW + 0.5, 0.22, shedD + 0.5);
      registerBoxCollider(shedX, topY + shedH / 2, shedZ, shedW, shedH, shedD, '頂樓鐵皮加蓋', shedColor === 'tinGreen' ? '#3d4d42' : '#45515e', false);
    }

    // 5. Commercial AC Chillers
    if (office) {
      for (let i = 0; i < 2; i++) {
        block('trim', topX + (i - 0.5) * 3.2, topY + 0.6, topZ + topD * 0.2, 1.8, 1.2, 1.4);
      }
    }
  }

  function sign(text, x, y, z, width, height, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = '#fffaf0';
    ctx.textAlign = 'center';
    ctx.font = 'bold 58px sans-serif';
    ctx.fillText(text, 256, 84);
    const texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
    face.position.set(x, y, z);
    group.add(face);
    return face;
  }

  function park(name, x, z, w, d) {
    block('lawn', x, .15, z, w, .28, d);
    block('paving', x, .30, z, 3.4, .05, d - 2);
    block('paving', x, .30, z, w - 2, .05, 3.4);

    // 1. Red PU Running Track (紅色 PU 慢跑步道)
    const trackW = 2.4;
    block('puTrack', x, .31, z - d / 2 + 2.8, w - 4, .06, trackW);
    block('puTrack', x, .31, z + d / 2 - 2.8, w - 4, .06, trackW);
    block('puTrack', x - w / 2 + 2.8, .31, z, trackW, .06, d - 4);
    block('puTrack', x + w / 2 - 2.8, .31, z, trackW, .06, d - 4);
    // PU Lane Dividers (White Lines)
    block('white', x, .345, z - d / 2 + 2.8, w - 6, .015, .08);
    block('white', x, .345, z + d / 2 - 2.8, w - 6, .015, .08);
    block('white', x - w / 2 + 2.8, .345, z, .08, .015, d - 6);
    block('white', x + w / 2 - 2.8, .345, z, .08, .015, d - 6);

    // 2. Taiwan Street Basketball Court (台灣街頭標準戶外籃球場)
    if (w >= 30 && d >= 22) {
      const cW = 16, cD = 10.5;
      const cX = x + w * 0.20, cZ = z - d * 0.14;
      block('courtGreen', cX, .30, cZ, cW, .06, cD);
      // Key / paint areas in navy blue
      block('courtBlue', cX - 5.5, .31, cZ, 4.8, .05, 4.4);
      block('courtBlue', cX + 5.5, .31, cZ, 4.8, .05, 4.4);
      // Court white lines
      block('white', cX, .34, cZ - cD / 2 + .06, cW, .015, .12);
      block('white', cX, .34, cZ + cD / 2 - .06, cW, .015, .12);
      block('white', cX - cW / 2 + .06, .34, cZ, .12, .015, cD);
      block('white', cX + cW / 2 - .06, .34, cZ, .12, .015, cD);
      // Half court line & center circle
      block('white', cX, .34, cZ, .12, .015, cD);
      block('white', cX, .34, cZ, 3.4, .015, .12);
      // 3D Basketball Hoops at both ends
      for (const side of [-1, 1]) {
        const poleX = cX + side * (cW / 2 - 0.5);
        block('trim', poleX, 2.1, cZ, 0.22, 3.8, 0.22);
        block('trim', poleX - side * 0.6, 3.7, cZ, 1.2, 0.14, 0.14);
        block('white', poleX - side * 1.1, 3.7, cZ, 0.08, 1.1, 1.8);
        block('rimOrange', poleX - side * 1.4, 3.25, cZ, 0.55, 0.08, 0.55);
        registerBoxCollider(poleX - side * 0.7, 2.3, cZ, 1.8, 4.2, 2.0, '公園籃球架', '#64748b', false);
      }
    }

    // 3. Taiwan Park Arbor / Pavilion (遮陽休閒涼亭 / 石桌棋藝區)
    if (w >= 32 && d >= 22) {
      const px = x - w * 0.22, pz = z + d * 0.16;
      block('paving', px, .35, pz, 6.0, .20, 6.0);
      for (const dx of [-2.4, 2.4]) {
        for (const dz of [-2.4, 2.4]) {
          block('wood', px + dx, 1.85, pz + dz, .32, 2.8, .32);
        }
      }
      block('trim', px, 3.4, pz, 6.6, .35, 6.6);
      block('trim', px, 3.7, pz, 5.0, .35, 5.0);
      block('trim', px, 4.0, pz, 3.2, .35, 3.2);
      block('trim', px, 4.25, pz, 1.4, .35, 1.4);
      // Center stone chess table & stools
      block('concrete', px, .75, pz, 1.4, .60, 1.4);
      for (const [sx, sz] of [[-1.2, 0], [1.2, 0], [0, -1.2], [0, 1.2]]) {
        block('concrete', px + sx, .58, pz + sz, .55, .45, .55);
      }
      registerBoxCollider(px, 2.2, pz, 6.6, 4.2, 6.6, '公園涼亭', '#715342', false);
    }

    // 4. Shade Trees & Park Benches
    for (const side of [-1, 1]) {
      for (const dx of [-.38, -.15, .15, .38]) {
        const tx = x + w * dx;
        const tz = z + side * (d / 2 - 4.5);
        block('wood', tx, 1.62, tz, .43, 2.65, .43);
        const tree = new THREE.Mesh(new THREE.IcosahedronGeometry(2.1, 1), materials.leaves);
        tree.position.set(tx, 3.25, tz);
        tree.scale.y = 1.15;
        tree.castShadow = true;
        group.add(tree);
        registerBoxCollider(tx, 1.62, tz, .43, 2.65, .43, '公園樹幹', '#608557', false);
        registerBoxCollider(tx, 3.25, tz, 3.5, 4.15, 3.5, '公園樹冠', '#608557', false);
      }
      block('wood', x + side * 4, .63, z + 2.8, 2.2, .5, .65);
      registerBoxCollider(x + side * 4, .63, z + 2.8, 2.2, .5, .65, '公園長椅', '#715342', false);
    }
    cityMapAreas.push({ x, z, w, d, color: '#395c4a' });
    cityLandmarks.push({ name, x, z });
    sign(name, x - w * .24, 2, z + d / 2 - 1.2, 7, 1.25, '#386148');
  }

  const westEdges = [CITY.minX, ...CITY.avenues, CITY.maxX];
  const northEdges = [CITY.minZ, ...CITY.streets, CITY.maxZ];
  for (let row = 0; row < northEdges.length - 1; row++) {
    yield;
    for (let col = 0; col < westEdges.length - 1; col++) {
      const left = westEdges[col] + (col === 0 ? 2 : 7.1);
      const right = westEdges[col + 1] - (col === westEdges.length - 2 ? 2 : 7.1);
      const north = northEdges[row] + (row === 0 ? 2 : 8.1);
      const south = northEdges[row + 1] - (row === northEdges.length - 2 ? 2 : 8.1);
      const x = (left + right) / 2, z = (north + south) / 2;
      const w = right - left, d = south - north;
      if (north < RAILWAY_Z && south > RAILWAY_Z) continue;
      if (row === 5 && (col === 2 || col === 3)) continue;
      block('sidewalk', x, .09, z, w, .18, d);
      surface(walkSurface, x, .182, z, w, d, 4.8);
      if (row === 2 && col === 3) {
        park('市民公園', x, z, w - 4, d - 4);
      } else if (row === 2 && col === 2) {
        building('市民服務中心', 'civic', x, z - 5, 34, 24, 3);
        sign('市民服務中心', x, 5.2, z + 7.1, 13, 2.3, '#5a5072');
        cityLandmarks.push({name:'市民服務中心', x, z});
      } else {
        const office = row <= 2 && col >= 2 && col <= 4;
        const floors = office ? 8 + (row * 7 + col * 5) % 15 : 4 + (row + col * 2) % 6;
        const kind = office ? 'office' : 'housing';
        const name = office ? '商辦大樓' : '住宅大樓';
        const b1X = x - w * .24, b1Z = z, b1W = w * .39, b1D = d * .60;
        const b2X = x + w * .24, b2Z = z + d * .09, b2W = w * .35, b2D = d * .56;
        building(name, kind, b1X, b1Z, b1W, b1D, floors, (row + col) % 3);
        building(name, kind, b2X, b2Z, b2W, b2D, Math.max(3, floors - 3), (row + col + 1) % 3);
        // Procedural authentic Taiwanese neighborhood storefronts on ground floor
        addGenericStreetStorefront(b1X, b1Z, b1W, b1D, (row * 3 + col * 2) % TAIWAN_LOCAL_SHOPS.length);
        addGenericStreetStorefront(b2X, b2Z, b2W, b2D, (row * 3 + col * 2 + 1) % TAIWAN_LOCAL_SHOPS.length);
      }
    }
  }

  // The rail corridor divides the station block from the shopping district.
  block('sidewalk', 36, .11, -103.5, 57, .22, 17);
  park('站前綠地', 42, -57, 39, 33);
  block('lawn', 36, .07, -80.5, 53, .14, 5.5);
  block('sidewalk', 36, .12, -77.2, 53, .24, 1.4);
  for (let x = 13; x < 63; x += 5) {
    block('leaves', x, .42, -80.2, 3.65, .68, 1.04);
  }
  block('paving', 36, .29, -92.1, 50, .54, 3.9);
  registerBoxCollider(36, .29, -92.1, 50, .54, 3.9, '車站月台', '#64748b', false);
  block('yellow', 36, .57, -90.45, 50, .025, .14);
  block('sidewalk', 36, 3.42, -93.25, 48, .23, 3.7);
  for (const x of [16, 26, 36, 46, 56]) {
    block('trim', x, 1.94, -94.4, .24, 2.95, .24);
    registerBoxCollider(x, 1.94, -94.4, .24, 2.95, .24, '月台立柱', '#64748b', false);
  }
  registerBoxCollider(36, 3.42, -93.25, 48, .23, 3.7, '月台雨棚');
  building('中央車站', 'civic', 36, -104, 45, 13, 1);
  block('glass', 36, 4.95, -104, 44.6, 3.1, 12.7);
  registerBoxCollider(36, 5.45, -104, 45.4, 4.1, 13.4, '中央車站上層', '#587385', false);
  for (const side of [-1, 1]) {
    const front = -104 + side * 6.43;
    for (let x = 15; x <= 57; x += 3) {
      block('trim', x, 4.95, front, .13, 3.1, .17);
    }
    block('trim', 36, 5.43, front, 44.8, .14, .16);
    block('metalRoof', 36, 3.43, front + side * .62, 44.8, .26, 1.5);
    block('concrete', 36, .25, front + side * 1.25, 19, .5, 2.2);
    const stationSign = sign('中央車站', 36, 4.37, front + side * .17, 13, 1.6, '#285675');
    if (side < 0) stationSign.rotation.y = Math.PI;
  }

  // Curved roof with raised seams. The ridge runs along the railway.
  function roofSection(halfWidth, rise, thickness) {
    const shape = new THREE.Shape();
    shape.moveTo(-halfWidth, 0);
    shape.quadraticCurveTo(0, rise * 2, halfWidth, 0);
    shape.lineTo(halfWidth, -thickness);
    shape.quadraticCurveTo(0, rise * 2 - thickness, -halfWidth, -thickness);
    shape.closePath();
    return shape;
  }
  const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(roofSection(7.2, 1.42, .22),
    { depth: 46.8, bevelEnabled: false, curveSegments: 14 }), materials.metalRoof);
  roof.position.set(12.6, 6.5, -104);
  roof.rotation.y = Math.PI / 2;
  roof.castShadow = roof.receiveShadow = true;
  group.add(roof);
  // Keep collision clearance close to the curved roof, with shorter boxes at its edges.
  for (const [z, h, depth] of [[-104, 1.5, 5.2], [-108.85, 1.12, 4.5], [-99.15, 1.12, 4.5]]) {
    registerBoxCollider(36, 6.5 + h / 2, z, 46.8, h, depth, '中央車站屋頂', '#587385', false);
  }
  const seam = new THREE.ExtrudeGeometry(roofSection(7.22, 1.47, .09),
    { depth: .14, bevelEnabled: false, curveSegments: 14 });
  const seams = new THREE.InstancedMesh(seam, materials.trim, 12);
  const roofRotation = new THREE.Matrix4().makeRotationY(Math.PI / 2);
  for (let i = 0; i < seams.count; i++) {
    seams.setMatrixAt(i, roofRotation.setPosition(13.6 + i * 4, 6.5, -104));
  }
  seams.frustumCulled = false;
  group.add(seams);
  cityLandmarks.push({name:'中央車站', x:36, z:-105});
  for (const x of [-108, -36, 108, 161]) {
    if (x === -36) {
      block('sidewalk', -37, .10, -57, 32, .20, 40);
      building('街區住宅', 'housing', -41, -59, 22, 26, 6, 1);
      building('街角店屋', 'civic', -24, -60, 9, 20, 2, 2);
      block('metalRoof', -24, 3.22, -48.8, 9.4, .24, 2.6);
      sign('站前商店', -24, 3.97, -49.91, 7.8, 1.25, '#8a4a32');
    } else {
      block('sidewalk', x, .10, -57, 33, .20, 40);
      const variant = x === 108 ? 2 : 0;
      building('街區住宅', 'housing', x, -57, 28, 28, 6, variant);
    }
  }

  park('鄰里公園', -36, -4, 44, 26);
  building('市區派出所', 'civic', 35, -4, 29, 19, 3);
  sign('市區派出所', 35, 5.1, 5.6, 11, 1.8, '#344d79');
  cityLandmarks.push({name:'市區派出所', x:35, z:-4});

  // A small pedestrian square separates the flight pad from the first intersection.
  block('paving', 0, .10, 0, 24, .20, 22);
  block('white', -10, .22, 0, .12, .018, 20);
  block('white', 10, .22, 0, .12, .018, 20);
  cityLandmarks.push({name:'起降廣場', x:0, z:0}, {name:'騎樓商圈', x:0, z:-56}, {name:'商辦區', x:99, z:-217});

  for (const [key, boxes] of batches) {
    const mesh = new THREE.InstancedMesh(cube, materials[key], boxes.length);
    const transform = new THREE.Object3D();
    boxes.forEach(([x, y, z, w, h, d], index) => {
      transform.position.set(x, y, z);
      transform.scale.set(w, h, d);
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
    });
    mesh.receiveShadow = true;
    mesh.castShadow = ['wood', 'trim'].includes(key);
    // This bundled Three.js revision does not compute a batch-wide bound.
    mesh.frustumCulled = false;
    group.add(mesh);
  }
  cityGroup.add(group);
}



function buildCityHelipad() {
  const padGroup = new THREE.Group();
  padGroup.position.set(HELIPAD_POS.x, 0.34, HELIPAD_POS.z);

  const padDisc = new THREE.Mesh(
    new THREE.CylinderGeometry(7.5, 7.8, 0.22, 32),
    new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.6 })
  );
  padDisc.receiveShadow = true;
  padGroup.add(padDisc);

  const yellowRing = new THREE.Mesh(
    new THREE.RingGeometry(5.6, 6.2, 32),
    new THREE.MeshBasicMaterial({ color: 0xfacc15, side: THREE.DoubleSide })
  );
  yellowRing.rotation.x = -Math.PI / 2;
  yellowRing.position.y = 0.12;
  padGroup.add(yellowRing);

  const hMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
  const hL = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.05, 4.5), hMat);
  hL.position.set(-1.6, 0.13, 0);
  const hR = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.05, 4.5), hMat);
  hR.position.set(1.6, 0.13, 0);
  const hC = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.05, 0.8), hMat);
  hC.position.set(0, 0.13, 0);
  padGroup.add(hL, hR, hC);

  cityGroup.add(padGroup);
}

function buildRailwayAndCrossing() {
  const railGroup = new THREE.Group();

  // Gravel Ballast Bed (碎石路基)
  const ballastMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.95 });
  const ballast = new THREE.Mesh(new THREE.BoxGeometry(CITY_BOUNDS.halfWidth * 2, 0.45, 6.5), ballastMat);
  ballast.position.set(0, 0.22, RAILWAY_Z);
  ballast.receiveShadow = true;
  railGroup.add(ballast);

  // Wooden Railroad Ties (枕木)
  const tieMat = new THREE.MeshLambertMaterial({ color: 0x451a03 });
  const tiePositions = [];
  for (let x = -CITY_BOUNDS.halfWidth + 2; x < CITY_BOUNDS.halfWidth; x += Math.abs(x) < 210 ? .95 : 3.2) {
    tiePositions.push(x);
  }
  const ties = new THREE.InstancedMesh(new THREE.BoxGeometry(.28, .17, 4.8), tieMat, tiePositions.length);
  const tieTransform = new THREE.Matrix4();
  tiePositions.forEach((x, index) => {
    ties.setMatrixAt(index, tieTransform.makeTranslation(x, .45, RAILWAY_Z));
  });
  ties.frustumCulled = false;
  railGroup.add(ties);

  // Steel Rails (鋼軌)
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.2 });
  [-1.4, 1.4].forEach((offsetZ) => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(CITY_BOUNDS.halfWidth * 2, 0.22, 0.16), steelMat);
    rail.position.set(0, 0.65, RAILWAY_Z + offsetZ);
    railGroup.add(rail);
  });

  cityGroup.add(railGroup);

  // --------------------------------------------------------------------------
  // CENTRAL AVENUE LEVEL CROSSING
  // --------------------------------------------------------------------------
  const poleMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.4 }); // Yellow/Black
  const redLampMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
  const crossingMat = new THREE.MeshStandardMaterial({ color: 0x555c62, roughness: 0.9 });

  for (const crossX of CITY.avenues) {
    const deck = new THREE.Mesh(new THREE.BoxGeometry(14, .16, 7), crossingMat);
    deck.position.set(crossX, .49, RAILWAY_Z);
    deck.receiveShadow = true;
    cityGroup.add(deck);
    [-8.4, 8.4].forEach((sideX, idx) => {
      const poleGroup = new THREE.Group();
      poleGroup.position.set(crossX + sideX, 0, RAILWAY_Z + (idx === 0 ? -4.5 : 4.5));

      // Yellow Post
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 5.5, 8), poleMat);
      pole.position.y = 2.75;
      pole.castShadow = true;
      poleGroup.add(pole);

      // Crossbuck sign (X mark)
      const xMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
      const b1 = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.22, 0.05), xMat);
      b1.rotation.z = Math.PI / 4;
      b1.position.set(0, 4.6, 0);
      const b2 = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.22, 0.05), xMat);
      b2.rotation.z = -Math.PI / 4;
      b2.position.set(0, 4.6, 0);
      poleGroup.add(b1, b2);

      // Red crossing lamps
      const lampL = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 8), redLampMat);
      lampL.position.set(-0.6, 4.1, 0.2);
      const lampR = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 8), redLampMat);
      lampR.position.set(0.6, 4.1, 0.2);
      poleGroup.add(lampL, lampR);

      const side = Math.sign(sideX);
      const arm = new THREE.Group();
      arm.position.y = 1.4;
      arm.rotation.z = -side * Math.PI / 2;
      const barrier = new THREE.Mesh(new THREE.BoxGeometry(8.1, .16, .12), poleMat);
      barrier.position.x = -side * 4.05;
      arm.add(barrier);
      poleGroup.add(arm);
      crossingArms.push({ arm, side, crossX });
      crossingBarrierColliders.push({ object: barrier, label: '平交道柵欄' });

      cityGroup.add(poleGroup);
      registerBoxCollider(crossX + sideX, 2.75, RAILWAY_Z + (idx === 0 ? -4.5 : 4.5), 1.2, 5.5, 1.2, '平交道號誌柱');
    });
  }

  buildCommuterTrain();
}

function buildCommuterTrain() {
  cityTrain = new THREE.Group();
  cityTrain.position.set(110, .65, RAILWAY_Z);
  const silver = new THREE.MeshStandardMaterial({ color: 0xb4c2c8, roughness: .34, metalness: .36 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x206091, roughness: .38, metalness: .2 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x243845, roughness: .18, metalness: .2 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x3a4248, roughness: .78 });
  const light = new THREE.MeshBasicMaterial({ color: 0xffecd0 });
  const tail = new THREE.MeshBasicMaterial({ color: 0xd04c40 });
  const sections = [
    [-8.96, 1.11, 2.38, .94], [-8.76, .86, 3.22, 1.36],
    [-8.25, .79, 3.55, 1.59], [-7.45, .78, 3.67, 1.68],
    [8.24, .78, 3.67, 1.68], [8.62, .82, 3.50, 1.57]
  ];
  const positions = [];
  const indices = [];
  for (const [x, bottom, top, width] of sections) {
    const corner = .28;
    positions.push(x,bottom,-width+corner, x,bottom+corner,-width,
      x,top-corner,-width, x,top,-width+corner, x,top,width-corner,
      x,top-corner,width, x,bottom+corner,width, x,bottom,width-corner);
  }
  const ringSize = 8;
  for (let ring = 0; ring < sections.length - 1; ring++) {
    for (let side = 0; side < ringSize; side++) {
      const a = ring * ringSize + side;
      const b = ring * ringSize + (side + 1) % ringSize;
      indices.push(a, b, a + ringSize, b, b + ringSize, a + ringSize);
    }
  }
  const rear = (sections.length - 1) * ringSize;
  for (let i = 1; i < ringSize - 1; i++) {
    indices.push(0, i + 1, i, rear, rear + i, rear + i + 1);
  }
  const shell = new THREE.BufferGeometry();
  shell.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  shell.setIndex(indices);
  shell.computeVertexNormals();

  const windshield = new THREE.BufferGeometry();
  windshield.setAttribute('position', new THREE.Float32BufferAttribute([
    -8.975,2.37,-.65, -8.975,2.37,.65, -8.785,3.19,-1.04, -8.785,3.19,1.04
  ], 3));
  windshield.setIndex([0,1,2, 1,3,2]);
  windshield.computeVertexNormals();
  const bogie = new THREE.BoxGeometry(2.03, .52, 2.75);
  const grille = new THREE.BoxGeometry(.09, .13, 1.38);
  const noseLight = new THREE.BoxGeometry(.10, .16, .30);
  const destination = new THREE.MeshBasicMaterial({ color: 0xe5bd6b });
  const cabDisplay = new THREE.BoxGeometry(.06, .11, .52);
  const wheel = new THREE.CylinderGeometry(.43, .43, .18, 16);
  const window = new THREE.BoxGeometry(1.11,.70,.06);
  for (let index = 0; index < 2; index++) {
    const car = new THREE.Group();
    car.position.x = index * 18.5;
    car.rotation.y = index * Math.PI;
    cityTrain.add(car);
    movingColliders.push({ object: car, w: 17.6, h: 4.15, d: 3.36, label: '列車' });
    vehiclePart(car, shell, silver, 0, 0, 0, true);
    vehiclePart(car, new THREE.BoxGeometry(15.8,.36,2.4), steel, .4, .68, 0);
    for (const x of [-5.28, 5.28]) vehiclePart(car, bogie, steel, x, .48, 0);
    vehiclePart(car, grille, blue, -8.98, 1.75, 0);
    vehiclePart(car, cabDisplay, destination, -8.985, 2.13, 0);
    vehiclePart(car, vehicleProfile([[-2.4,0],[-2.05,.36],[2.05,.36],[2.4,0]],1.75,.09), steel, .4, 3.64, 0);
    for (const side of [-1, 1]) {
      vehiclePart(car, new THREE.BoxGeometry(16.1,.31,.07), blue, .43, 1.89, side * 1.70);
      for (const x of [-6.8,-3.0,-1.45,1.45,3,6.6]) {
        vehiclePart(car, window, glass, x, 2.64, side * 1.72);
      }
      for (const x of [-4.85,0,4.85]) {
        vehiclePart(car, new THREE.BoxGeometry(1.18,2.26,.062), steel, x, 2.05, side * 1.72);
        for (const door of [-1,1]) {
          vehiclePart(car, new THREE.BoxGeometry(.53,2.19,.062), silver, x + door * .283, 2.05, side * 1.76);
          vehiclePart(car, new THREE.BoxGeometry(.34,.70,.052), glass, x + door * .283, 2.62, side * 1.80);
        }
      }
      for (const x of [-6,-4.55,4.55,6]) {
        vehiclePart(car, wheel, steel, x, .42, side * 1.38).rotation.x = Math.PI / 2;
      }
      vehiclePart(car, noseLight, index === 0 ? light : tail, -8.98, 1.57, side * .66);
    }
    vehiclePart(car, windshield, glass, 0, 0, 0);
    for (let i = 0; i < 7; i++) {
      vehiclePart(car, grille, silver, -1.03 + i * .31, 4.14, 0);
    }
  }
  vehiclePart(cityTrain, new THREE.BoxGeometry(1.5, 2.3, 2.16), steel, 9.25, 2, 0);
  cityGroup.add(cityTrain);
}

// ============================================================================
// 10. AUTHENTIC TAIWANESE COMMERCIAL ARCADE & SHOPHOUSES (台灣騎樓名店商圈)
// ============================================================================
window.taiwanEmissiveMaterials = [];

function* buildTaiwanMarketStreet() {
  const street = new THREE.Group();
  street.name = '台灣特色名店街';
  const cubeGeo = new THREE.BoxGeometry(1, 1, 1);

  const surfaceMaterials = new Map();
  const tileTextures = new Map();
  const signTextures = new Map();
  const signMaterials = new Map();

  function material(color, roughness = 0.85, metalness = 0.1, map = null) {
    const tint = new THREE.Color(color).convertSRGBToLinear();
    const key = `${tint.r},${tint.g},${tint.b}:${roughness}:${metalness}:${map?.id ?? ''}`;
    if (!surfaceMaterials.has(key)) {
      surfaceMaterials.set(key, new THREE.MeshStandardMaterial({ color: tint, roughness, metalness, map }));
    }
    return surfaceMaterials.get(key);
  }

  const concreteMat = material(0x787a7d, 0.9);
  const curbMat = material(0x94928d, 0.88);
  const darkMetalMat = material(0x22262a, 0.45, 0.7);
  const steelMat = material(0x8a9198, 0.25, 0.85);
  const glassMat = material(0x355a6c, 0.2, 0.35);
  const noParkingRed = material(0xef4444, 0.7);
  const scooterRubber = material(0x181b1c, 0.95);
  const scooterWheelGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.115, 14);
  const waterTankMat = material(0xd8dde2, 0.15, 0.95);

  function addBox(parent, mat, x, y, z, w, h, d, castShadow = false, receiveShadow = true) {
    const mesh = new THREE.Mesh(cubeGeo, mat);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    parent.add(mesh);
    return mesh;
  }

  // --------------------------------------------------------------------------
  // Procedural Canvas Texture: Taiwanese Tile Facade (真實丁掛磚磁磚貼圖)
  // --------------------------------------------------------------------------
  function createTileTexture(baseHex) {
    if (tileTextures.has(baseHex)) return tileTextures.get(baseHex);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = baseHex;
    ctx.fillRect(0, 0, 256, 256);

    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let y = 0; y < 256; y += 16) {
      ctx.fillRect(0, y, 256, 2);
    }
    for (let y = 0; y < 256; y += 16) {
      const shift = (y / 16) % 2 === 0 ? 0 : 20;
      for (let x = shift; x < 256 + 40; x += 40) {
        ctx.fillRect(x, y, 2, 16);
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 2);
    tex.encoding = THREE.sRGBEncoding;
    tileTextures.set(baseHex, tex);
    return tex;
  }

  // --------------------------------------------------------------------------
  // AUTHENTIC GOOGLE STREET VIEW TAIWANESE BRAND PAINTERS (量身打造，絕不套版)
  // --------------------------------------------------------------------------
  const TAIWAN_BRAND_REGISTRY = {
    'bafang': { name: '八方雲集', sub: '鍋貼 • 水餃 專賣店', bg: '#f59e0b', fg: '#b91c1c', border: '#b91c1c', logo: '餃' },
    'meiemei': { name: '早安美而美', sub: '中西式精緻活力早午餐', bg: '#ffffff', fg: '#15803d', border: '#b91c1c', logo: '美' },
    'pxmart': { name: '全聯福利中心', sub: '買進美好生活 PX MART', bg: '#1d4ed8', fg: '#ffffff', border: '#ef4444', logo: 'PX' },
    'elife': { name: '全國電子', sub: '揪甘心 3C 家電生活館', bg: '#dc2626', fg: '#ffffff', border: '#ffffff', logo: '全' },
    'cosmed': { name: '康是美', sub: 'COSMED 藥妝美彩生活館', bg: '#ea580c', fg: '#ffffff', border: '#ea580c', logo: 'C' },
    'sym': { name: 'SYM 三陽機車', sub: '專業維修 排氣定檢 買賣', bg: '#b91c1c', fg: '#ffffff', border: '#ffffff', logo: 'SYM' },
    'dahu': { name: '大呼過癮', sub: '百元風味臭臭小火鍋', bg: '#eab308', fg: '#991b1b', border: '#991b1b', logo: '火' },
    'chishang': { name: '池上木片便當', sub: '正宗池上米 現包快餐', bg: '#78350f', fg: '#fef08a', border: '#fef08a', logo: '米' },
    'kobayashi': { name: '小林眼鏡', sub: '專業驗光配鏡 • 隱形眼鏡', bg: '#1e3a8a', fg: '#ffffff', border: '#60a5fa', logo: '鏡' },
    'taian': { name: '台安藥局', sub: '健保特約 處方調劑 慢性病', bg: '#ffffff', fg: '#1d4ed8', border: '#16a34a', logo: '✚' },
    'hardware': { name: '振宇五金', sub: '水電衛浴 五金工具 配件', bg: '#0284c7', fg: '#ffffff', border: '#facc15', logo: '五' },
    'hongya': { name: '弘爺漢堡', sub: '美味活力早餐 連鎖專賣', bg: '#f97316', fg: '#ffffff', border: '#ffffff', logo: '弘' },
    'showba': { name: '小北百貨', sub: '24H 生活五金 • 百貨批發', bg: '#facc15', fg: '#1e40af', border: '#dc2626', logo: '北' },
    'shopee': { name: '蝦皮店到店', sub: '包裹寄取 便利生活取件門市', bg: '#ea580c', fg: '#ffffff', border: '#ffffff', logo: 'S' },
    'louisa': { name: '路易莎咖啡', sub: 'Louisa Coffee 職人手沖', bg: '#2b1a11', fg: '#ea580c', border: '#ea580c', logo: 'L' },
    'poya': { name: '寶雅 POYA', sub: 'POYA 美妝生活流行館', bg: '#f43f5e', fg: '#ffffff', border: '#ffffff', logo: 'P' },
    'hilife': { name: '萊爾富', sub: 'Hi-Life 便利超商 24H', bg: '#dc2626', fg: '#ffffff', border: '#fbbf24', logo: 'Hi' },
    'chunghwa': { name: '中華電信', sub: '中華電信 5G 行動門市', bg: '#0284c7', fg: '#ffffff', border: '#ffffff', logo: '中' },
    'fried_chicken': { name: '台灣第一家鹽酥雞', sub: '特製胡椒鹽 宵夜第一首選', bg: '#991b1b', fg: '#fef08a', border: '#fef08a', logo: '雞' },
    'bubble_tea': { name: '麻古茶坊', sub: 'MACU 芝芝鮮果飲專賣', bg: '#dc2626', fg: '#ffffff', border: '#fef08a', logo: '茶' },
    'dintaifung': { name: '鼎泰豐', sub: '黃金十八摺小籠包點心', bg: '#7f1d1d', fg: '#fef08a', border: '#fef08a', logo: '鼎' },
    'beef_soup': { name: '阿宗麵線', sub: '萬華老店 柴魚大腸麵線', bg: '#78350f', fg: '#ffffff', border: '#f59e0b', logo: '麵' },
    'braised_pork': { name: '鬍鬚張魯肉飯', sub: '正宗經典 台灣魯肉便當', bg: '#eab308', fg: '#991b1b', border: '#991b1b', logo: '張' },
    'sanma': { name: '三媽臭臭鍋', sub: '正宗平價 百元風味臭臭鍋', bg: '#b91c1c', fg: '#ffffff', border: '#facc15', logo: '三' },
    'four_seas': { name: '四海遊龍', sub: '鍋貼水餃 專賣名店', bg: '#ea580c', fg: '#ffffff', border: '#ffffff', logo: '龍' },
    'kebuke': { name: '可不可熟成紅茶', sub: '熟成純茶 • 冷飲專賣', bg: '#064e3b', fg: '#d1fae5', border: '#d97706', logo: '渴' },
    'mwd': { name: '麥味登', sub: 'My Warm Day 溫暖早午餐', bg: '#15803d', fg: '#ffffff', border: '#ffffff', logo: '麥' },
    'yamaha': { name: '山葉機車', sub: 'YAMAHA 專業保修定檢', bg: '#1d4ed8', fg: '#ffffff', border: '#ef4444', logo: 'Y' },
    'yifang': { name: '一芳水果茶', sub: '傳承古法 台灣水果茶專賣', bg: '#78350f', fg: '#fef08a', border: '#f59e0b', logo: '芳' }
  };

  function drawTaiwanBrandSign(ctx, brandKey, isVertical, width, height) {
    ctx.clearRect(0, 0, width, height);

    if (brandKey === '7eleven') {
      if (isVertical) {
        // 7-ELEVEN 直立側招 (白底大7 + 綠底白字 + 橘底24H)
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height * 0.44);

        const centerX = width / 2;
        ctx.fillStyle = '#008136';
        ctx.font = '900 110px "Arial Black", "Impact", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('7', centerX, height * 0.21);

        ctx.fillStyle = '#F58220';
        ctx.fillRect(16, height * 0.21 - 12, width - 32, 24);
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 16px "Arial Black", sans-serif';
        ctx.fillText('ELEVEN', centerX, height * 0.21);

        ctx.fillStyle = '#008136';
        ctx.fillRect(0, height * 0.44, width, height * 0.56);

        ctx.fillStyle = '#ffffff';
        ctx.font = '900 36px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
        ctx.fillText('７', centerX, height * 0.52);
        ctx.fillText('E', centerX, height * 0.59);
        ctx.fillText('L', centerX, height * 0.66);
        ctx.fillText('E', centerX, height * 0.73);
        ctx.fillText('V', centerX, height * 0.80);
        ctx.fillText('E', centerX, height * 0.87);
        ctx.fillText('N', centerX, height * 0.94);

        ctx.fillStyle = '#F58220';
        ctx.fillRect(10, height - 32, width - 20, 24);
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 18px "Arial Black", sans-serif';
        ctx.fillText('24H', centerX, height - 20);
      } else {
        // 7-ELEVEN 門面大橫招
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);

        ctx.fillStyle = '#F58220';
        ctx.fillRect(0, 0, width, 22);

        ctx.fillStyle = '#008136';
        ctx.fillRect(0, height - 22, width, 22);

        const midY = height / 2;
        ctx.fillStyle = '#008136';
        ctx.font = '900 84px "Arial Black", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('7', 95, midY);

        ctx.fillStyle = '#F58220';
        ctx.fillRect(45, midY - 9, 100, 18);
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 13px "Arial Black", sans-serif';
        ctx.fillText('ELEVEN', 95, midY);

        ctx.fillStyle = '#008136';
        ctx.font = '900 44px "Microsoft JhengHei", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('統一超商', 170, midY - 6);

        ctx.font = 'bold 20px "Microsoft JhengHei", sans-serif';
        ctx.fillStyle = '#E51B24';
        ctx.fillText('OPEN!', 360, midY - 6);

        ctx.fillStyle = '#475569';
        ctx.font = 'bold 18px "Microsoft JhengHei", sans-serif';
        ctx.fillText('24H 鮮食咖啡・現萃茶・生活寄件服務', 170, midY + 28);
      }
    } else if (brandKey === 'familymart') {
      if (isVertical) {
        // 全家 FamilyMart 直立側招 (藍白綠經典三色)
        ctx.fillStyle = '#0090D7';
        ctx.fillRect(0, 0, width, height * 0.28);
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 24px "Arial Black", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Family', width / 2, height * 0.11);
        ctx.fillText('Mart', width / 2, height * 0.19);

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, height * 0.28, width, height * 0.34);
        ctx.fillStyle = '#0090D7';
        ctx.font = '900 36px "Microsoft JhengHei", sans-serif';
        ctx.fillText('全', width / 2, height * 0.38);
        ctx.fillText('家', width / 2, height * 0.50);

        ctx.fillStyle = '#00A040';
        ctx.fillRect(0, height * 0.62, width, height * 0.38);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 26px "Microsoft JhengHei", sans-serif';
        ctx.fillText('便', width / 2, height * 0.70);
        ctx.fillText('利', width / 2, height * 0.78);
        ctx.fillText('店', width / 2, height * 0.86);

        ctx.font = '900 18px "Arial Black", sans-serif';
        ctx.fillText('24H', width / 2, height * 0.94);
      } else {
        // 全家門面大橫招
        const h3 = height / 3;
        ctx.fillStyle = '#0090D7';
        ctx.fillRect(0, 0, width, h3);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, h3, width, h3);
        ctx.fillStyle = '#00A040';
        ctx.fillRect(0, h3 * 2, width, h3);

        ctx.fillStyle = '#003366';
        ctx.font = '900 36px "Arial Black", sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('FamilyMart', 30, height / 2);

        ctx.fillStyle = '#ffffff';
        ctx.font = '900 24px "Microsoft JhengHei", sans-serif';
        ctx.fillText('全家便利商店', 30, h3 * 2 + h3 / 2);

        ctx.font = 'bold 18px "Microsoft JhengHei", sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText("Let's Café 鮮食甜點・Fami!ce 霜淇淋", width - 30, height / 2);
      }
    } else if (brandKey === '50lan') {
      // ５０嵐：亮黃底 + 海軍藍圓圈與粗字
      ctx.fillStyle = '#FFD100';
      ctx.fillRect(0, 0, width, height);

      if (isVertical) {
        ctx.strokeStyle = '#003366';
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.arc(width / 2, 90, 62, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#003366';
        ctx.font = '900 48px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('５０', width / 2, 70);
        ctx.fillText('嵐', width / 2, 115);

        ctx.font = '900 38px "Microsoft JhengHei", sans-serif';
        ctx.fillText('鮮', width / 2, 210);
        ctx.fillText('茶', width / 2, 265);
        ctx.fillText('專', width / 2, 320);
        ctx.fillText('賣', width / 2, 375);

        ctx.font = 'bold 22px "Microsoft JhengHei", sans-serif';
        ctx.fillText('四季春', width / 2, 445);
        ctx.fillText('波霸奶', width / 2, 485);
      } else {
        ctx.strokeStyle = '#003366';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.arc(90, height / 2, 54, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#003366';
        ctx.font = '900 44px "Microsoft JhengHei", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('５０嵐', 90, height / 2);

        ctx.textAlign = 'left';
        ctx.font = '900 46px "Microsoft JhengHei", sans-serif';
        ctx.fillText('５０嵐 鮮茶專賣', 175, height / 2 - 14);

        ctx.font = 'bold 22px "Microsoft JhengHei", sans-serif';
        ctx.fillText('KOI Thé 官方連鎖｜四季春青茶・波霸奶茶・燕麥紅茶拿鐵', 175, height / 2 + 28);
      }
    } else if (brandKey === 'chingshin') {
      // 清心福全：深墨綠 + 紅心 + 白楷書
      ctx.fillStyle = '#0D5B36';
      ctx.fillRect(0, 0, width, height);

      if (isVertical) {
        ctx.fillStyle = '#D62828';
        ctx.beginPath();
        ctx.arc(width / 2 - 18, 55, 22, 0, Math.PI * 2);
        ctx.arc(width / 2 + 18, 55, 22, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = '900 44px "Microsoft JhengHei", "DFKai-SB", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('清', width / 2, 135);
        ctx.fillText('心', width / 2, 205);
        ctx.fillText('福', width / 2, 275);
        ctx.fillText('全', width / 2, 345);

        ctx.font = 'bold 22px "Microsoft JhengHei", sans-serif';
        ctx.fillText('冷飲特約', width / 2, 420);
        ctx.fillText('特級綠茶', width / 2, 465);
        ctx.fillText('優多綠', width / 2, 505);
      } else {
        ctx.fillStyle = '#D62828';
        ctx.beginPath();
        ctx.arc(70, height / 2, 36, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 32px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('♥', 70, height / 2);

        ctx.textAlign = 'left';
        ctx.font = '900 50px "Microsoft JhengHei", "DFKai-SB", sans-serif';
        ctx.fillText('清 心 福 全', 135, height / 2 - 12);

        ctx.font = 'bold 22px "Microsoft JhengHei", sans-serif';
        ctx.fillText('冷飲站特約專賣店｜特級烏龍綠茶・珍珠奶茶・優多綠茶', 135, height / 2 + 30);
      }
    } else if (brandKey === 'lottery') {
      // 台灣彩券：金黃底 + 紅太極標 + 紅字
      ctx.fillStyle = '#FFB800';
      ctx.fillRect(0, 0, width, height);

      if (isVertical) {
        ctx.fillStyle = '#D62828';
        ctx.beginPath();
        ctx.arc(width / 2, 60, 36, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = '900 42px "Microsoft JhengHei", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('台', width / 2, 145);
        ctx.fillText('灣', width / 2, 215);
        ctx.fillText('彩', width / 2, 285);
        ctx.fillText('券', width / 2, 355);

        ctx.fillStyle = '#1D4ED8';
        ctx.fillRect(15, 410, width - 30, 32);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 20px "Microsoft JhengHei", sans-serif';
        ctx.fillText('大樂透', width / 2, 426);

        ctx.fillStyle = '#D62828';
        ctx.fillRect(15, 455, width - 30, 32);
        ctx.fillStyle = '#ffffff';
        ctx.fillText('威力彩', width / 2, 471);
      } else {
        ctx.fillStyle = '#D62828';
        ctx.beginPath();
        ctx.arc(80, height / 2, 44, 0, Math.PI * 2);
        ctx.fill();

        ctx.textAlign = 'left';
        ctx.font = '900 52px "Microsoft JhengHei", sans-serif';
        ctx.fillText('台灣彩券', 150, height / 2 - 12);

        ctx.font = 'bold 24px "Microsoft JhengHei", sans-serif';
        ctx.fillStyle = '#991B1B';
        ctx.fillText('大樂透 ｜ 威力彩 ｜ 今彩539 ｜ 刮刮樂 ｜ 雙贏彩', 150, height / 2 + 32);
      }
    } else if (brandKey === 'beef_noodles') {
      // 台灣正宗牛肉麵：深朱紅底 + 金雙線邊框 + 金字
      ctx.fillStyle = '#7F1D1D';
      ctx.fillRect(0, 0, width, height);

      ctx.strokeStyle = '#FBBF24';
      ctx.lineWidth = 6;
      ctx.strokeRect(8, 8, width - 16, height - 16);

      if (isVertical) {
        ctx.fillStyle = '#FDE047';
        ctx.font = 'bold 24px "Microsoft JhengHei", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('老 字 號', width / 2, 42);

        ctx.fillStyle = '#FACC15';
        ctx.font = '900 48px "Microsoft JhengHei", "DFKai-SB", sans-serif';
        ctx.fillText('牛', width / 2, 115);
        ctx.fillText('肉', width / 2, 185);
        ctx.fillText('麵', width / 2, 255);
        ctx.fillText('水', width / 2, 325);
        ctx.fillText('餃', width / 2, 395);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 20px "Microsoft JhengHei", sans-serif';
        ctx.fillText('半筋半肉', width / 2, 465);
        ctx.fillText('原汁紅燒', width / 2, 500);
      } else {
        ctx.fillStyle = '#FDE047';
        ctx.font = 'bold 22px "Microsoft JhengHei", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('★ 正 宗 傳 統 名 店 ★', width / 2, 26);

        ctx.fillStyle = '#FACC15';
        ctx.font = '900 52px "Microsoft JhengHei", "DFKai-SB", sans-serif';
        ctx.fillText('台 灣 正 宗 牛 肉 麵', width / 2, 68);

        ctx.fillStyle = '#FDE68A';
        ctx.font = 'bold 22px "Microsoft JhengHei", sans-serif';
        ctx.fillText('紅燒半筋半肉牛肉麵・清燉牛肉湯・手工水餃・各式精緻滷味', width / 2, 108);
      }
    } else if (brandKey === 'pork_rib') {
      // 正忠排骨飯：正忠亮橘 + 白字黑邊
      ctx.fillStyle = '#EA580C';
      ctx.fillRect(0, 0, width, height);

      if (isVertical) {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 22px "Microsoft JhengHei", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('創立於1991', width / 2, 40);

        ctx.font = '900 46px "Microsoft JhengHei", sans-serif';
        ctx.fillText('正', width / 2, 115);
        ctx.fillText('忠', width / 2, 180);
        ctx.fillText('排', width / 2, 245);
        ctx.fillText('骨', width / 2, 310);
        ctx.fillText('飯', width / 2, 375);

        ctx.fillStyle = '#FACC15';
        ctx.fillRect(15, 435, width - 30, 36);
        ctx.fillStyle = '#18181B';
        ctx.font = '900 22px "Microsoft JhengHei", sans-serif';
        ctx.fillText('便當快餐', width / 2, 453);
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = '900 52px "Microsoft JhengHei", sans-serif';
        ctx.fillText('正 忠 排 骨 飯', 35, height / 2 - 14);

        ctx.font = 'bold 22px "Microsoft JhengHei", sans-serif';
        ctx.fillStyle = '#FEF08A';
        ctx.fillText('特製正忠排骨便當 ｜ 黑胡椒雞腿飯 ｜ 酥炸燒肉飯 ｜ 鮮魚便當', 35, height / 2 + 28);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 20px "Microsoft JhengHei", sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('創立於 1991 年', width - 35, height / 2);
      }
    } else if (brandKey === 'soy_milk') {
      // 永和豆漿：暖黃底 + 正紅楷書
      ctx.fillStyle = '#F59E0B';
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = '#B45309';
      ctx.lineWidth = 5;
      ctx.strokeRect(6, 6, width - 12, height - 12);

      if (isVertical) {
        ctx.fillStyle = '#B91C1C';
        ctx.font = '900 44px "Microsoft JhengHei", "DFKai-SB", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('永', width / 2, 85);
        ctx.fillText('和', width / 2, 155);
        ctx.fillText('豆', width / 2, 225);
        ctx.fillText('漿', width / 2, 295);

        ctx.fillStyle = '#18181B';
        ctx.font = 'bold 24px "Microsoft JhengHei", sans-serif';
        ctx.fillText('小籠包', width / 2, 385);
        ctx.fillText('燒餅油條', width / 2, 435);

        ctx.fillStyle = '#B91C1C';
        ctx.font = '900 20px sans-serif';
        ctx.fillText('24H 營業', width / 2, 495);
      } else {
        ctx.fillStyle = '#B91C1C';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = '900 50px "Microsoft JhengHei", "DFKai-SB", sans-serif';
        ctx.fillText('永 和 豆 漿 大 王', 40, height / 2 - 12);

        ctx.fillStyle = '#1E293B';
        ctx.font = 'bold 22px "Microsoft JhengHei", sans-serif';
        ctx.fillText('24H 營業｜小籠湯包・手工燒餅夾蛋・香脆油條・香濃現磨豆漿米漿', 40, height / 2 + 28);
      }
    } else if (brandKey === 'kymco') {
      // 光陽機車：白底 + 紅色 KYMCO 斜體 + 藍色光陽機車
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = '#DC2626';
      ctx.fillRect(0, 0, width, 18);

      if (isVertical) {
        ctx.fillStyle = '#DC2626';
        ctx.font = '900 32px "Arial Black", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('KYMCO', width / 2, 55);

        ctx.fillStyle = '#0B3B60';
        ctx.font = '900 42px "Microsoft JhengHei", sans-serif';
        ctx.fillText('光', width / 2, 130);
        ctx.fillText('陽', width / 2, 195);
        ctx.fillText('機', width / 2, 260);
        ctx.fillText('車', width / 2, 325);

        ctx.fillStyle = '#DC2626';
        ctx.font = 'bold 22px "Microsoft JhengHei", sans-serif';
        ctx.fillText('原廠檢驗', width / 2, 415);
        ctx.fillText('噴射保修', width / 2, 465);
      } else {
        ctx.fillStyle = '#DC2626';
        ctx.font = '900 46px "Arial Black", sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('KYMCO', 40, height / 2);

        ctx.fillStyle = '#0B3B60';
        ctx.font = '900 46px "Microsoft JhengHei", sans-serif';
        ctx.fillText('光陽機車特約店', 260, height / 2 - 12);

        ctx.fillStyle = '#475569';
        ctx.font = 'bold 20px "Microsoft JhengHei", sans-serif';
        ctx.fillText('原廠專業噴射引擎保修・電腦排氣檢驗站・道路救援服務', 260, height / 2 + 28);
      }
    } else if (brandKey === 'watsons') {
      // 屈臣氏：湖水藍（#00838F）+ 白字
      ctx.fillStyle = '#00838F';
      ctx.fillRect(0, 0, width, height);

      if (isVertical) {
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 28px "Arial", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('watsons', width / 2, 45);

        ctx.font = '900 44px "Microsoft JhengHei", sans-serif';
        ctx.fillText('屈', width / 2, 125);
        ctx.fillText('臣', width / 2, 195);
        ctx.fillText('氏', width / 2, 265);

        ctx.fillStyle = '#10B981';
        ctx.fillRect(width / 2 - 8, 335, 16, 44);
        ctx.fillRect(width / 2 - 22, 349, 44, 16);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 22px "Microsoft JhengHei", sans-serif';
        ctx.fillText('健保特約', width / 2, 435);
        ctx.fillText('美妝保健', width / 2, 480);
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = '900 44px "Arial", sans-serif';
        ctx.fillText('watsons', 40, height / 2);

        ctx.font = '900 44px "Microsoft JhengHei", sans-serif';
        ctx.fillText('屈臣氏 健保藥局', 250, height / 2 - 12);

        ctx.font = 'bold 20px "Microsoft JhengHei", sans-serif';
        ctx.fillStyle = '#E0F2FE';
        ctx.fillText('健保特約處方箋・專業藥師諮詢・個人護理美妝保健', 250, height / 2 + 28);
      }
    } else if (brandKey === 'tainan_beef') {
      // 台南溫體牛肉湯：黑底 + 亮金黃書法字
      ctx.fillStyle = '#18181B';
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = '#DC2626';
      ctx.lineWidth = 6;
      ctx.strokeRect(6, 6, width - 12, height - 12);

      if (isVertical) {
        ctx.fillStyle = '#FACC15';
        ctx.font = '900 42px "Microsoft JhengHei", "DFKai-SB", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('台', width / 2, 85);
        ctx.fillText('南', width / 2, 150);
        ctx.fillText('牛', width / 2, 215);
        ctx.fillText('肉', width / 2, 280);
        ctx.fillText('湯', width / 2, 345);

        ctx.fillStyle = '#EF4444';
        ctx.font = 'bold 22px "Microsoft JhengHei", sans-serif';
        ctx.fillText('現宰溫體', width / 2, 425);
        ctx.fillText('當日直送', width / 2, 475);
      } else {
        ctx.fillStyle = '#FACC15';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = '900 52px "Microsoft JhengHei", "DFKai-SB", sans-serif';
        ctx.fillText('台 南 現 宰 溫 體 牛 肉 湯', 40, height / 2 - 12);

        ctx.fillStyle = '#EF4444';
        ctx.font = 'bold 22px "Microsoft JhengHei", sans-serif';
        ctx.fillText('當日現宰溫體牛・鮮甜清燙牛肉湯・熱炒芥蘭牛・肉燥飯免費', 40, height / 2 + 28);
      }
    } else if (brandKey === 'claw_machine') {
      // 24H 夾娃娃機：夜幕深紫黑 + 霓虹粉
      ctx.fillStyle = '#0F051D';
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = '#EC4899';
      ctx.lineWidth = 6;
      ctx.strokeRect(6, 6, width - 12, height - 12);

      if (isVertical) {
        ctx.fillStyle = '#06B6D4';
        ctx.font = '900 24px "Arial Black", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('24H 旗艦', width / 2, 45);

        ctx.fillStyle = '#EC4899';
        ctx.font = '900 46px "Microsoft JhengHei", sans-serif';
        ctx.fillText('夾', width / 2, 125);
        ctx.fillText('娃', width / 2, 195);
        ctx.fillText('娃', width / 2, 265);
        ctx.fillText('機', width / 2, 335);

        ctx.fillStyle = '#F43F5E';
        ctx.font = 'bold 22px "Microsoft JhengHei", sans-serif';
        ctx.fillText('零食公仔', width / 2, 425);
        ctx.fillText('保證取物', width / 2, 475);
      } else {
        ctx.fillStyle = '#EC4899';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = '900 52px "Microsoft JhengHei", sans-serif';
        ctx.fillText('24H 夾 娃 娃 旗 艦 場', 40, height / 2 - 12);

        ctx.fillStyle = '#06B6D4';
        ctx.font = 'bold 22px "Microsoft JhengHei", sans-serif';
        ctx.fillText('全館保證取物・零食專區・日系正版公仔景品・巨無霸機台', 40, height / 2 + 28);
      }
    } else {
      // Dynamic rendering for any registered or generic Taiwanese neighborhood brand
      const shopDef = TAIWAN_BRAND_REGISTRY[brandKey] || {
        name: brandKey.replace(/_/g, ' '),
        sub: '台灣在地名店 • 歡迎光臨',
        bg: '#1e3a8a',
        fg: '#ffffff',
        border: '#f59e0b',
        logo: '台'
      };
      if (isVertical) {
        ctx.fillStyle = shopDef.bg;
        ctx.fillRect(0, 0, width, height);
        ctx.strokeStyle = shopDef.border;
        ctx.lineWidth = 6;
        ctx.strokeRect(3, 3, width - 6, height - 6);

        // Top circular logo
        ctx.beginPath();
        ctx.arc(width / 2, 54, 34, 0, Math.PI * 2);
        ctx.fillStyle = shopDef.border;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(width / 2, 54, 30, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.fillStyle = shopDef.border;
        ctx.font = 'bold 26px "Microsoft JhengHei", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(shopDef.logo, width / 2, 55);

        // Vertical store name
        ctx.fillStyle = shopDef.fg;
        ctx.font = '900 36px "Microsoft JhengHei", sans-serif';
        ctx.textAlign = 'center';
        const chars = shopDef.name.replace(/[^一-龥a-zA-Z0-9]/g, '').split('');
        const startY = 125;
        const spacing = Math.min(52, (height - startY - 40) / Math.max(1, chars.length));
        chars.forEach((c, i) => {
          ctx.fillText(c, width / 2, startY + i * spacing);
        });
      } else {
        ctx.fillStyle = shopDef.bg;
        ctx.fillRect(0, 0, width, height);
        ctx.strokeStyle = shopDef.border;
        ctx.lineWidth = 6;
        ctx.strokeRect(3, 3, width - 6, height - 6);
        ctx.fillStyle = shopDef.border;
        ctx.fillRect(0, 0, width, 8);
        ctx.fillRect(0, height - 8, width, 8);

        // Left circular badge
        ctx.beginPath();
        ctx.arc(72, height / 2, 44, 0, Math.PI * 2);
        ctx.fillStyle = shopDef.border;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(72, height / 2, 40, 0, Math.PI * 2);
        ctx.fillStyle = shopDef.bg === '#ffffff' ? '#f1f5f9' : '#ffffff';
        ctx.fill();
        ctx.fillStyle = shopDef.border;
        ctx.font = 'bold 36px "Microsoft JhengHei", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(shopDef.logo, 72, height / 2);

        // Store main title
        ctx.fillStyle = shopDef.fg;
        ctx.font = '900 50px "Microsoft JhengHei", sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(shopDef.name, 140, height / 2 - 12);

        // Store subtitle / slogan
        ctx.fillStyle = shopDef.fg === '#ffffff' ? 'rgba(255,255,255,0.88)' : '#475569';
        ctx.font = 'bold 22px "Microsoft JhengHei", sans-serif';
        ctx.fillText(shopDef.sub, 142, height / 2 + 28);
      }
    }
  }

  function getShopSignTexture(brandKey, isVertical) {
    const key = `${brandKey}:${isVertical}`;
    if (signTextures.has(key)) return signTextures.get(key);
    const canvas = document.createElement('canvas');
    canvas.width = isVertical ? 180 : 560;
    canvas.height = isVertical ? 560 : 130;
    const ctx = canvas.getContext('2d');

    drawTaiwanBrandSign(ctx, brandKey, isVertical, canvas.width, canvas.height);

    const tex = new THREE.CanvasTexture(canvas);
    tex.encoding = THREE.sRGBEncoding;
    signTextures.set(key, tex);
    return tex;
  }

  function createCustomShopSignMat(brandKey, isVertical, emissiveHex) {
    const texture = getShopSignTexture(brandKey, isVertical);
    const emissiveColor = new THREE.Color(emissiveHex).multiplyScalar(0.75);
    const key = `${texture.id}:${emissiveColor.r},${emissiveColor.g},${emissiveColor.b}`;
    if (signMaterials.has(key)) return signMaterials.get(key);

    const mat = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.35,
      metalness: 0.08,
      emissive: emissiveColor,
      emissiveIntensity: state.timeOfDay === 'night' ? 1.85 : state.timeOfDay === 'sunset' ? 0.9 : 0.22,
      side: THREE.DoubleSide
    });
    signMaterials.set(key, mat);
    window.taiwanEmissiveMaterials.push(mat);
    return mat;
  }

  // AC Outdoor Unit Texture
  function createAcTex() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(0, 0, 128, 96);

    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.arc(88, 48, 34, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 4;
    for (let r = 8; r <= 28; r += 7) {
      ctx.beginPath();
      ctx.arc(88, 48, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.encoding = THREE.sRGBEncoding;
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 });
  }
  const acMat = createAcTex();

  // --------------------------------------------------------------------------
  // The Famous Taiwanese Shophouse Directory (中央大道台灣代表性店家清單)
  // --------------------------------------------------------------------------
  const taiwanShops = [
    // --- 1. Avenue 0 South & Helipad Approach (z = 21 to -67) ---
    { side: -1, z: 21, h: 8.2, wall: '#c5bcaf', brand: 'hongya', emissive: '#F97316', name: '弘爺漢堡 起飛坪店', roofType: 'parapet' },
    { side: 1, z: 21, h: 7.6, wall: '#bcc5bd', brand: 'meiemei', emissive: '#15803D', name: '早安美而美 起飛坪店', roofType: 'parapet' },
    { side: -1, z: 9, h: 8.5, wall: '#b9c1c4', brand: 'shopee', emissive: '#EA580C', name: '蝦皮店到店 門市', roofType: 'tin_green' },
    { side: 1, z: 9, h: 8.0, wall: '#c4b8ad', brand: 'showba', emissive: '#FACC15', name: '小北百貨 24H', roofType: 'parapet' },
    { side: -1, z: -3, h: 7.8, wall: '#cfc4b6', brand: 'hilife', emissive: '#DC2626', name: '萊爾富 Hi-Life', roofType: 'parapet' },
    { side: 1, z: -3, h: 8.2, wall: '#bfb5a8', brand: 'cosmed', emissive: '#EA580C', name: '康是美 COSMED', roofType: 'tin_blue' },
    { side: -1, z: -19, h: 8.5, wall: '#c8bfb0', brand: '7eleven', emissive: '#008136', name: '７-ELEVEN 統一超商', roofType: 'parapet' },
    { side: 1, z: -19, h: 7.8, wall: '#b8c0ba', brand: '50lan', emissive: '#FFD100', name: '５０嵐 鮮茶專賣', roofType: 'parapet' },
    { side: -1, z: -31, h: 8.8, wall: '#b6bec1', brand: 'beef_noodles', emissive: '#7F1D1D', name: '台灣正宗牛肉麵', roofType: 'tin_green' },
    { side: 1, z: -31, h: 8.0, wall: '#c2b8ad', brand: 'pork_rib', emissive: '#EA580C', name: '正忠排骨便當', roofType: 'parapet' },
    { side: -1, z: -43, h: 7.5, wall: '#c9bca9', brand: 'chingshin', emissive: '#0D5B36', name: '清心福全 冷飲站', roofType: 'parapet' },
    { side: 1, z: -43, h: 8.2, wall: '#bfb5a8', brand: 'lottery', emissive: '#FFB800', name: '台灣彩券', roofType: 'tin_blue' },
    { side: -1, z: -55, h: 8.5, wall: '#b8aca5', brand: 'familymart', emissive: '#0090D7', name: '全家便利商店', roofType: 'parapet' },
    { side: 1, z: -55, h: 7.6, wall: '#b2c0ba', brand: 'kymco', emissive: '#DC2626', name: '光陽機車 KYMCO', roofType: 'parapet' },
    { side: -1, z: -67, h: 8.0, wall: '#cfc4b6', brand: 'soy_milk', emissive: '#F59E0B', name: '永和豆漿大王', roofType: 'parapet' },
    { side: 1, z: -67, h: 8.2, wall: '#cbbdae', brand: 'bubble_tea', emissive: '#DC2626', name: '麻古茶坊 MACU', roofType: 'parapet' },

    // --- 2. Avenue 0 Mid (Station Front: z = -99 to -111) ---
    { side: -1, z: -99, h: 8.8, wall: '#cad0d3', brand: 'watsons', emissive: '#00838F', name: '屈臣氏 Watsons', roofType: 'parapet' },
    { side: 1, z: -99, h: 8.2, wall: '#cbbdae', brand: 'tainan_beef', emissive: '#FACC15', name: '台南溫體牛肉湯', roofType: 'tin_blue' },
    { side: -1, z: -111, h: 8.0, wall: '#bab5a8', brand: 'claw_machine', emissive: '#EC4899', name: '24H 夾娃娃旗艦店', roofType: 'parapet' },
    { side: 1, z: -111, h: 8.5, wall: '#c8bfb0', brand: 'braised_pork', emissive: '#EAB308', name: '鬍鬚張魯肉飯', roofType: 'parapet' },

    // --- 3. Street -120 North Side (Gate 3 -> Gate 4: facing South, rotY: 0, z: -133.9) ---
    { x: -36, z: -133.9, rotY: 0, h: 8.5, wall: '#c5bcaf', brand: 'bafang', emissive: '#F59E0B', name: '八方雲集 車站店', roofType: 'parapet' },
    { x: -24, z: -133.9, rotY: 0, h: 7.8, wall: '#b8c0ba', brand: 'fried_chicken', emissive: '#B91C1C', name: '台灣第一家鹽酥雞', roofType: 'tin_green' },
    { x: 18, z: -133.9, rotY: 0, h: 8.8, wall: '#b6bec1', brand: 'pxmart', emissive: '#1D4ED8', name: '全聯福利中心 市民店', roofType: 'parapet' },
    { x: 30, z: -133.9, rotY: 0, h: 8.2, wall: '#c2b8ad', brand: 'elife', emissive: '#DC2626', name: '全國電子 揪甘心', roofType: 'parapet' },
    { x: 42, z: -133.9, rotY: 0, h: 7.6, wall: '#c9bca9', brand: 'sym', emissive: '#B91C1C', name: 'SYM 三陽機車', roofType: 'parapet' },
    { x: 54, z: -133.9, rotY: 0, h: 8.0, wall: '#bfb5a8', brand: 'dahu', emissive: '#EAB308', name: '大呼過癮 臭臭鍋', roofType: 'tin_blue' },
    { x: 66, z: -133.9, rotY: 0, h: 8.5, wall: '#b8aca5', brand: 'chishang', emissive: '#78350F', name: '池上木片便當', roofType: 'parapet' },
    { x: 78, z: -133.9, rotY: 0, h: 8.0, wall: '#b2c0ba', brand: 'kobayashi', emissive: '#1E3A8A', name: '小林眼鏡 市民店', roofType: 'parapet' },
    { x: 90, z: -133.9, rotY: 0, h: 8.2, wall: '#cfc4b6', brand: 'taian', emissive: '#16A34A', name: '台安藥局 市民店', roofType: 'parapet' },
    { x: 102, z: -133.9, rotY: 0, h: 7.8, wall: '#cbbdae', brand: 'hardware', emissive: '#0284C7', name: '振宇五金 市民店', roofType: 'tin_green' },

    // --- 4. Street -120 South Side (Gate 3 -> Gate 4: facing North, rotY: Math.PI, z: -106.1) ---
    { x: -36, z: -106.1, rotY: Math.PI, h: 8.0, wall: '#cad0d3', brand: 'beef_soup', emissive: '#B45309', name: '阿宗麵線 車站店', roofType: 'parapet' },
    { x: -24, z: -106.1, rotY: Math.PI, h: 7.8, wall: '#cbbdae', brand: 'yifang', emissive: '#78350F', name: '一芳水果茶', roofType: 'tin_blue' },
    { x: 18, z: -106.1, rotY: Math.PI, h: 8.8, wall: '#bab5a8', brand: 'poya', emissive: '#F43F5E', name: '寶雅 POYA 生活館', roofType: 'parapet' },
    { x: 30, z: -106.1, rotY: Math.PI, h: 8.2, wall: '#c8bfb0', brand: 'louisa', emissive: '#EA580C', name: '路易莎咖啡 市民店', roofType: 'parapet' },
    { x: 42, z: -106.1, rotY: Math.PI, h: 8.6, wall: '#b8c0ba', brand: 'dintaifung', emissive: '#991B1B', name: '鼎泰豐 小籠包', roofType: 'parapet' },
    { x: 54, z: -106.1, rotY: Math.PI, h: 7.8, wall: '#b6bec1', brand: 'kebuke', emissive: '#064E3B', name: '可不可熟成紅茶', roofType: 'tin_green' },
    { x: 66, z: -106.1, rotY: Math.PI, h: 8.2, wall: '#c2b8ad', brand: 'chunghwa', emissive: '#0284C7', name: '中華電信 門市', roofType: 'parapet' },
    { x: 78, z: -106.1, rotY: Math.PI, h: 8.0, wall: '#c9bca9', brand: 'yamaha', emissive: '#1D4ED8', name: '山葉機車 YAMAHA', roofType: 'parapet' },
    { x: 90, z: -106.1, rotY: Math.PI, h: 7.8, wall: '#bfb5a8', brand: 'sanma', emissive: '#DC2626', name: '三媽臭臭鍋 市民店', roofType: 'tin_blue' },
    { x: 102, z: -106.1, rotY: Math.PI, h: 8.2, wall: '#b8aca5', brand: 'four_seas', emissive: '#EA580C', name: '四海遊龍 鍋貼水餃', roofType: 'parapet' },

    // --- 5. Avenue 72 West Side (Gate 4 -> Gate 5: facing East, rotY: Math.PI / 2, x: 58.1) ---
    { x: 58.1, z: -132, rotY: Math.PI / 2, h: 8.2, wall: '#b2c0ba', brand: '7eleven', emissive: '#008136', name: '７-ELEVEN 市民東門市', roofType: 'parapet' },
    { x: 58.1, z: -144, rotY: Math.PI / 2, h: 7.8, wall: '#cfc4b6', brand: '50lan', emissive: '#FFD100', name: '５０嵐 市民大道店', roofType: 'parapet' },
    { x: 58.1, z: -156, rotY: Math.PI / 2, h: 8.5, wall: '#cbbdae', brand: 'beef_noodles', emissive: '#7F1D1D', name: '老張牛肉麵', roofType: 'tin_green' },
    { x: 58.1, z: -168, rotY: Math.PI / 2, h: 8.0, wall: '#c5bcaf', brand: 'mwd', emissive: '#15803D', name: '麥味登 早午餐', roofType: 'parapet' },
    { x: 58.1, z: -180, rotY: Math.PI / 2, h: 7.6, wall: '#b8c0ba', brand: 'lottery', emissive: '#FFB800', name: '台灣彩券 公園店', roofType: 'tin_blue' },

    // --- 6. Avenue 72 East Side (Gate 4 -> Gate 5: facing West, rotY: -Math.PI / 2, x: 85.9) ---
    { x: 85.9, z: -132, rotY: -Math.PI / 2, h: 8.0, wall: '#b6bec1', brand: 'familymart', emissive: '#0090D7', name: '全家便利商店 市民東店', roofType: 'parapet' },
    { x: 85.9, z: -144, rotY: -Math.PI / 2, h: 8.5, wall: '#c2b8ad', brand: 'chingshin', emissive: '#0D5B36', name: '清心福全 市民東店', roofType: 'parapet' },
    { x: 85.9, z: -156, rotY: -Math.PI / 2, h: 7.8, wall: '#c9bca9', brand: 'pork_rib', emissive: '#EA580C', name: '正忠排骨 市民東店', roofType: 'parapet' },
    { x: 85.9, z: -168, rotY: -Math.PI / 2, h: 8.2, wall: '#bfb5a8', brand: 'kymco', emissive: '#DC2626', name: '光陽機車 市民東店', roofType: 'tin_blue' },
    { x: 85.9, z: -180, rotY: -Math.PI / 2, h: 8.0, wall: '#b8aca5', brand: 'soy_milk', emissive: '#F59E0B', name: '永和豆漿 市民東店', roofType: 'parapet' },

    // --- 7. Street -184 North Side (Gate 5 -> Gate 6: facing South, rotY: 0, z: -197.9) ---
    { x: 66, z: -197.9, rotY: 0, h: 8.5, wall: '#b2c0ba', brand: 'pxmart', emissive: '#1D4ED8', name: '全聯福利中心 公園門市', roofType: 'parapet' },
    { x: 54, z: -197.9, rotY: 0, h: 8.0, wall: '#cfc4b6', brand: 'bafang', emissive: '#F59E0B', name: '八方雲集 公園店', roofType: 'parapet' },
    { x: 42, z: -197.9, rotY: 0, h: 7.8, wall: '#cbbdae', brand: 'meiemei', emissive: '#15803D', name: '早安美而美 公園店', roofType: 'tin_green' },
    { x: 30, z: -197.9, rotY: 0, h: 8.2, wall: '#c5bcaf', brand: 'cosmed', emissive: '#EA580C', name: '康是美 公園店', roofType: 'parapet' },
    { x: 18, z: -197.9, rotY: 0, h: 8.8, wall: '#b8c0ba', brand: 'elife', emissive: '#DC2626', name: '全國電子 公園店', roofType: 'parapet' },
    { x: 6, z: -197.9, rotY: 0, h: 8.0, wall: '#b6bec1', brand: 'showba', emissive: '#FACC15', name: '小北百貨 公園店', roofType: 'tin_blue' },
    { x: -6, z: -197.9, rotY: 0, h: 7.6, wall: '#c2b8ad', brand: 'shopee', emissive: '#EA580C', name: '蝦皮店到店 公園店', roofType: 'parapet' },
    { x: -18, z: -197.9, rotY: 0, h: 8.2, wall: '#c9bca9', brand: 'hardware', emissive: '#0284C7', name: '振宇五金 市民店', roofType: 'parapet' },
    { x: -30, z: -197.9, rotY: 0, h: 8.0, wall: '#bfb5a8', brand: 'sym', emissive: '#B91C1C', name: 'SYM 三陽機車 市民店', roofType: 'parapet' },

    // --- 8. Avenue 0 North (Gate 6 -> North Gate / return: z = -135 to -225) ---
    { side: -1, z: -135, h: 8.2, wall: '#b8aca5', brand: 'hongya', emissive: '#F97316', name: '弘爺漢堡 北門店', roofType: 'parapet' },
    { side: 1, z: -135, h: 8.0, wall: '#b2c0ba', brand: 'taian', emissive: '#16A34A', name: '台安藥局 北門店', roofType: 'parapet' },
    { side: -1, z: -150, h: 8.5, wall: '#cfc4b6', brand: 'chishang', emissive: '#78350F', name: '池上木片便當 北門店', roofType: 'tin_green' },
    { side: 1, z: -150, h: 7.8, wall: '#cbbdae', brand: 'dahu', emissive: '#EAB308', name: '大呼過癮 北門店', roofType: 'parapet' },
    { side: -1, z: -165, h: 8.0, wall: '#c5bcaf', brand: 'sanma', emissive: '#DC2626', name: '三媽臭臭鍋 北門店', roofType: 'parapet' },
    { side: 1, z: -165, h: 8.2, wall: '#b8c0ba', brand: 'louisa', emissive: '#EA580C', name: '路易莎咖啡 北門店', roofType: 'tin_blue' },
    { side: -1, z: -195, h: 8.8, wall: '#b6bec1', brand: 'watsons', emissive: '#00838F', name: '屈臣氏 北門店', roofType: 'parapet' },
    { side: 1, z: -195, h: 8.2, wall: '#c2b8ad', brand: 'poya', emissive: '#F43F5E', name: '寶雅 POYA 北門店', roofType: 'parapet' },
    { side: -1, z: -210, h: 8.0, wall: '#c9bca9', brand: 'beef_noodles', emissive: '#7F1D1D', name: '老王牛肉麵', roofType: 'parapet' },
    { side: 1, z: -210, h: 7.6, wall: '#bfb5a8', brand: 'bubble_tea', emissive: '#DC2626', name: '麻古茶坊 北門店', roofType: 'parapet' },
    { side: -1, z: -225, h: 8.5, wall: '#b8aca5', brand: '7eleven', emissive: '#008136', name: '７-ELEVEN 北門門市', roofType: 'parapet' },
    { side: 1, z: -225, h: 8.0, wall: '#b2c0ba', brand: 'familymart', emissive: '#0090D7', name: '全家便利商店 北門店', roofType: 'tin_blue' }
  ];
  // --------------------------------------------------------------------------
  // Build Sidewalks & Curb Lines along All Major Circuit Streets
  // --------------------------------------------------------------------------
  function addSidewalkStrip(cx, cz, w, d, isHorizontal = false) {
    addBox(street, concreteMat, cx, 0.12, cz, w, 0.24, d);
    if (!isHorizontal) {
      const curbX = cx > 0 ? (cx - w / 2 + 0.13) : (cx + w / 2 - 0.13);
      const redX = cx > 0 ? (curbX - 0.18) : (curbX + 0.18);
      addBox(street, curbMat, curbX, 0.14, cz, 0.26, 0.28, d);
      addBox(street, noParkingRed, redX, 0.065, cz, 0.10, 0.015, d);
    } else {
      const curbZ = cz > 0 ? (cz - d / 2 + 0.13) : (cz + d / 2 - 0.13);
      const redZ = cz > 0 ? (curbZ - 0.18) : (curbZ + 0.18);
      addBox(street, curbMat, cx, 0.14, curbZ, w, 0.28, 0.26);
      addBox(street, noParkingRed, cx, 0.065, redZ, w, 0.015, 0.10);
    }
  }

  // Avenue 0 (Helipad approach, Central Ave South & North)
  for (const side of [-1, 1]) {
    addSidewalkStrip(side * 8.45, 8, 2.9, 28);
    addSidewalkStrip(side * 8.45, -43, 2.9, 52);
    addSidewalkStrip(side * 8.45, -105, 2.9, 30);
    addSidewalkStrip(side * 8.45, -180, 2.9, 96);
  }

  // Street -120 (Station Front & Civic Avenue South: Gate 3 -> Gate 4)
  addSidewalkStrip(36, -128.5, 150, 2.9, true);
  addSidewalkStrip(36, -111.5, 150, 2.9, true);

  // Avenue 72 (Civic Avenue East: Gate 4 -> Gate 5)
  addSidewalkStrip(63.55, -156, 2.9, 64);
  addSidewalkStrip(80.45, -156, 2.9, 64);

  // Street -184 (Civic Park North & Civic Center: Gate 5 -> Gate 6)
  addSidewalkStrip(20, -192.5, 120, 2.9, true);
  addSidewalkStrip(-20, -175.5, 50, 2.9, true);

  // --------------------------------------------------------------------------
  // Assemble Each Shophouse (透天店屋結構：女兒牆平頂、官方客製招牌、冷氣鐵窗嵌合)
  // --------------------------------------------------------------------------
  for (const [sIdx, shop] of taiwanShops.entries()) {
    yield;
    const storefront = new THREE.Group();
    const x = shop.x !== undefined ? shop.x : (shop.side * 13.9);
    const z = shop.z;
    const rotY = shop.rotY !== undefined ? shop.rotY : (-shop.side * Math.PI / 2);
    storefront.position.set(x, 0, z);
    storefront.rotation.y = rotY;
    street.add(storefront);

    const cosR = Math.cos(rotY);
    const sinR = Math.sin(rotY);
    const toWorldX = (lx, lz) => x + (lx * cosR + lz * sinR);
    const toWorldZ = (lx, lz) => z + (-lx * sinR + lz * cosR);
    const isAlongStreet = Math.abs(Math.cos(rotY)) > 0.5;
    const colW = isAlongStreet ? 11.2 : 8.0;
    const colD = isAlongStreet ? 8.0 : 11.2;

    const arcadeHeight = 3.4;
    const houseW = 11.2;
    const houseD = 8.0;
    const houseH = shop.h;

    const tileTex = createTileTexture(shop.wall);
    const wallMat = material(shop.wall, 0.85, 0.1, tileTex);

    // 1. Upper Building Mass (2F~4F 建築主體，從騎樓上方起算)
    addBox(storefront, wallMat, 0, (houseH + arcadeHeight) / 2, 0, houseW, houseH - arcadeHeight, houseD, true, true);

    // 2. Ground Floor Shop Back Wall (1F 店面後牆與店鋪空間)
    addBox(storefront, wallMat, 0, arcadeHeight / 2, -1.0, houseW, arcadeHeight, 6.0, true, true);

    // 3. Arcade Piers & Columns (騎樓堅固立柱，Z = 3.65)
    for (const u of [-4.95, 4.95]) {
      addBox(storefront, wallMat, u, arcadeHeight / 2, 3.65, 0.75, arcadeHeight, 0.75, true, true);
      addBox(storefront, concreteMat, u, 0.35, 3.65, 0.82, 0.7, 0.82);

      // Pillar Sign Lightbox
      const pSignMat = createCustomShopSignMat(shop.brand, true, shop.emissive);
      addBox(storefront, pSignMat, u, 2.1, 4.08, 0.55, 1.25, 0.08);

      registerBoxCollider(toWorldX(u, 3.65), arcadeHeight / 2, toWorldZ(u, 3.65),
        0.8, arcadeHeight, 0.8, shop.name + ' 騎樓柱', shop.emissive, false);
    }

    // 4. Arcade Ceiling & Beams (騎樓天花板與過梁)
    addBox(storefront, concreteMat, 0, arcadeHeight - 0.15, 1.8, houseW, 0.3, 3.8);

    // 5. Storefront Glass & Warm Interior
    addBox(storefront, darkMetalMat, 0, 1.6, 2.05, 10.4, 3.0, 0.12);
    for (const u of [-3.5, 0, 3.5]) {
      addBox(storefront, glassMat, u, 1.55, 2.14, 2.85, 2.65, 0.06);
      addBox(storefront, material(0xfffbeb, 0.4), u, 1.55, 2.11, 2.5, 2.4, 0.02);
    }

    // 6. FRONT HORIZONTAL FASCIA SIGN (客製化店面大橫招牌)
    const hSignMat = createCustomShopSignMat(shop.brand, false, shop.emissive);
    addBox(storefront, hSignMat, 0, arcadeHeight + 0.85, 4.14, 8.8, 1.45, 0.14, true, true);
    addBox(storefront, darkMetalMat, 0, arcadeHeight + 1.62, 4.18, 9.1, 0.12, 0.35);

    // 7. OVERHANGING VERTICAL BLADE SIGN (客製化雙面突出看板，厚重槽鋼深植外牆)
    const vSignMat = createCustomShopSignMat(shop.brand, true, shop.emissive);
    const vSignW = 1.05;
    const vSignH = 3.8;
    const vSignD = 0.18;
    const vSignU = 4.75;
    const vSignY = arcadeHeight + 2.2;
    const vSignZ = 4.85;

    // Steel Cantilever Mounting Brackets firmly into wall
    [-1.2, 1.2].forEach((armOff) => {
      addBox(storefront, steelMat, vSignU, vSignY + armOff, 4.25, 0.08, 0.08, 1.2);
    });

    addBox(storefront, darkMetalMat, vSignU, vSignY, vSignZ, 0.1, vSignH + 0.1, vSignD + 0.1, true, true);
    addBox(storefront, vSignMat, vSignU, vSignY, vSignZ, 0.08, vSignH, vSignD);

    // 8. EXTERIOR AIR CONDITIONER OUTDOOR UNITS (緊貼外牆)
    const acU = -2.2;
    const acY = arcadeHeight + 1.1;
    const acZ = 4.28;
    addBox(storefront, acMat, acU, acY, acZ, 0.95, 0.65, 0.38, true);
    addBox(storefront, steelMat, acU, acY - 0.36, acZ - 0.05, 0.75, 0.08, 0.32);

    // 9. WINDOW GRILLES (不鏽鋼外推鐵窗)
    for (const winU of [-3.2, 2.4]) {
      addBox(storefront, steelMat, winU, arcadeHeight + 2.4, 4.22, 2.1, 1.5, 0.32);
      addBox(storefront, glassMat, winU, arcadeHeight + 2.4, 4.08, 1.9, 1.35, 0.05);
    }

    // 10. AUTHENTIC ROOFTOPS: PARAPET WALLS & WEATHERED WATER TANKS (台灣標準女兒牆平頂)
    const parapetH = 0.95;
    const roofFloorY = houseH;
    // Parapet perimeter walls (周圍女兒牆，水泥丁掛磚色)
    addBox(storefront, wallMat, 0, roofFloorY + parapetH / 2, houseD / 2 - 0.18, houseW, parapetH, 0.36); // front
    addBox(storefront, wallMat, 0, roofFloorY + parapetH / 2, -houseD / 2 + 0.18, houseW, parapetH, 0.36); // back
    addBox(storefront, wallMat, -houseW / 2 + 0.18, roofFloorY + parapetH / 2, 0, 0.36, parapetH, houseD - 0.72); // left
    addBox(storefront, wallMat, houseW / 2 - 0.18, roofFloorY + parapetH / 2, 0, 0.36, parapetH, houseD - 0.72); // right

    // Flat roof concrete floor (水泥防水深灰地坪)
    const roofFloorMat = material(0x52565a, 0.95);
    addBox(storefront, roofFloorMat, 0, roofFloorY + 0.05, 0, houseW - 0.72, 0.1, houseD - 0.72);

    if (shop.roofType === 'parapet') {
      // Stairhead penthouse on roof (屋頂樓梯間突出物)
      const pentH = 2.2;
      addBox(storefront, concreteMat, -2.4, roofFloorY + pentH / 2, 0, 3.2, pentH, 3.0);

      // Stainless Steel Water Tank (真實直立圓柱水塔，緊密架設於水泥基座上)
      const tankR = 1.05;
      const tankH = 1.9;
      const tankX = 2.4;
      const tankZ = 0;
      addBox(storefront, steelMat, tankX, roofFloorY + 0.25, tankZ, tankR * 1.5, 0.5, tankR * 1.5);

      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(tankR, tankR, tankH, 20), waterTankMat);
      cyl.position.set(tankX, roofFloorY + 0.5 + tankH / 2, tankZ);
      cyl.castShadow = true;
      storefront.add(cyl);

      const dome = new THREE.Mesh(new THREE.SphereGeometry(tankR, 16, 8, 0, Math.PI * 2, 0, Math.PI / 4), waterTankMat);
      dome.position.set(tankX, roofFloorY + 0.5 + tankH, tankZ);
      storefront.add(dome);

      registerBoxCollider(toWorldX(tankX, 0), roofFloorY + 1.5, toWorldZ(tankX, 0), tankR * 2.2, 2.8, tankR * 2.2, '頂樓不鏽鋼水塔', '#d8dde2', false);
    } else if (shop.roofType === 'tin_green' || shop.roofType === 'tin_blue') {
      // Corrugated steel addition with muted industrial colors (低飽和鐵灰綠 / 暗鐵灰藍浪板加蓋)
      const tinColor = shop.roofType === 'tin_green' ? 0x47544b : 0x48535e;
      const tinMat = material(tinColor, 0.65);
      const tinH = 2.4;
      addBox(storefront, tinMat, 0, roofFloorY + tinH / 2, 0, houseW - 1.2, tinH, houseD - 1.2, true, true);

      const slope = addBox(storefront, tinMat, 0, roofFloorY + tinH + 0.12, 0, houseW - 0.6, 0.15, houseD - 0.6);
      slope.rotation.x = 0.06;

      registerBoxCollider(x, roofFloorY + tinH / 2, shop.z, houseW, tinH, houseD, '頂樓鐵皮加蓋', '#48535e', false);
    }

    // 11. PARKED SCOOTERS
    if (shop.name.includes('機車') || shop.name.includes('超商') || shop.name.includes('牛肉麵')) {
      for (const scU of [-2.4, 1.8]) {
        const scGroup = new THREE.Group();
        scGroup.position.set(scU, 0.08, 4.45);
        storefront.add(scGroup);

        const scColor = material(shop.emissive, 0.45, 0.2);
        [-0.52, 0.52].forEach((wz) => {
          const w = new THREE.Mesh(scooterWheelGeo, scooterRubber);
          w.rotation.z = Math.PI / 2;
          w.position.set(0, 0.24, wz);
          scGroup.add(w);
        });
        addBox(scGroup, scColor, 0, 0.55, -0.15, 0.42, 0.45, 0.72, true);
        addBox(scGroup, scooterRubber, 0, 0.78, -0.18, 0.36, 0.12, 0.65);
        addBox(scGroup, scColor, 0, 0.68, 0.46, 0.38, 0.62, 0.24);
        addBox(scGroup, steelMat, 0, 1.02, 0.44, 0.62, 0.06, 0.06);

        registerBoxCollider(toWorldX(scU, 4.45), 0.65, toWorldZ(scU, 4.45), 1.2, 1.1, 1.2, '路邊停放機車', shop.emissive, false);
      }
    }

    registerBoxCollider(x, (houseH + arcadeHeight) / 2, z, colW, houseH - arcadeHeight, colD, shop.name, shop.emissive, true);
    registerBoxCollider(toWorldX(0, 4.14), arcadeHeight + 0.85, toWorldZ(0, 4.14), isAlongStreet ? 8.8 : 0.4, 1.5, isAlongStreet ? 0.4 : 8.8, shop.name + ' 店面橫招', shop.emissive, false);
    registerBoxCollider(toWorldX(vSignU, vSignZ), vSignY, toWorldZ(vSignU, vSignZ), 0.8, vSignH, 0.8, shop.name + ' 突出招牌', shop.emissive, false);
  }

  // --------------------------------------------------------------------------
  // TAIWAN ROAD MARKINGS (十字路口機車停等區、慢字、停字)
  // --------------------------------------------------------------------------
  function createRoadTex(type) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (type === 'scooter_box') {
      canvas.width = 512;
      canvas.height = 320;
      ctx.clearRect(0, 0, 512, 320);

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 16;
      ctx.strokeRect(10, 10, 492, 300);

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(170, 155, 34, 0, Math.PI * 2);
      ctx.arc(342, 155, 34, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(170, 155);
      ctx.lineTo(220, 105);
      ctx.lineTo(290, 105);
      ctx.lineTo(340, 75);
      ctx.lineTo(330, 155);
      ctx.closePath();
      ctx.fill();

      ctx.font = '900 46px "Microsoft JhengHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('機 車 停 等 區', 256, 275);
    } else if (type === 'word_slow') {
      canvas.width = 256;
      canvas.height = 384;
      ctx.clearRect(0, 0, 256, 384);
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 240px "Microsoft JhengHei", "DFKai-SB", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('慢', 128, 192);
    } else if (type === 'word_stop') {
      canvas.width = 256;
      canvas.height = 384;
      ctx.clearRect(0, 0, 256, 384);
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 240px "Microsoft JhengHei", "DFKai-SB", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('停', 128, 192);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  const scooterBoxMat = new THREE.MeshBasicMaterial({ map: createRoadTex('scooter_box'), transparent: true, opacity: 0.94 });
  const slowMat = new THREE.MeshBasicMaterial({ map: createRoadTex('word_slow'), transparent: true, opacity: 0.92 });
  const stopMat = new THREE.MeshBasicMaterial({ map: createRoadTex('word_stop'), transparent: true, opacity: 0.92 });

  const scooterBoxLocations = [
    { x: 0, z: -17, w: 5.6, d: 3.4 },
    { x: 0, z: -76, w: 5.6, d: 3.4 },
    { x: 0, z: -121, w: 5.6, d: 3.4 }
  ];

  scooterBoxLocations.forEach((loc) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(loc.w, loc.d), scooterBoxMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(loc.x, 0.058, loc.z);
    street.add(mesh);
  });

  const roadWords = [
    { mat: slowMat, x: 2.2, z: -70 },
    { mat: slowMat, x: -2.2, z: -105 },
    { mat: stopMat, x: 2.2, z: -27 }
  ];
  roadWords.forEach((rw) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3.6), rw.mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(rw.x, 0.058, rw.z);
    street.add(mesh);
  });

  // --------------------------------------------------------------------------
  // GROUNDED PUBLIC UTILITIES
  // --------------------------------------------------------------------------
  // Taipower Green Transformer Box
  function createTransformer(x, z) {
    const tGroup = new THREE.Group();
    tGroup.position.set(x, 0.12, z);
    street.add(tGroup);

    addBox(tGroup, concreteMat, 0, 0.15, 0, 1.45, 0.3, 0.9);
    const greenMat = material(0x1a4d2e, 0.5);
    addBox(tGroup, greenMat, 0, 0.85, 0, 1.35, 1.1, 0.8, true);
    addBox(tGroup, material(0xeab308, 0.4), 0, 0.38, 0.41, 1.35, 0.15, 0.02);

    registerBoxCollider(x, 0.65, z, 1.45, 1.2, 0.9, '台電變電箱', '#1a4d2e', false);
  }
  createTransformer(7.6, -18);
  createTransformer(-7.6, -55);

  // Taiwan Post Dual Postboxes
  function createPostboxes(x, z) {
    const pGroup = new THREE.Group();
    pGroup.position.set(x, 0.12, z);
    street.add(pGroup);

    addBox(pGroup, concreteMat, 0, 0.06, 0, 1.35, 0.12, 0.65);
    const boxes = [
      { off: -0.32, col: 0x15803d, name: '一般信件' },
      { off: 0.32, col: 0xb91c1c, name: '航空掛號' }
    ];
    boxes.forEach((b) => {
      const bMat = material(b.col, 0.35, 0.3);
      addBox(pGroup, steelMat, b.off, 0.36, 0, 0.12, 0.55, 0.12);
      addBox(pGroup, bMat, b.off, 0.92, 0, 0.48, 0.55, 0.38, true);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.38, 14), bMat);
      cap.rotation.z = Math.PI / 2;
      cap.position.set(b.off, 1.2, 0);
      pGroup.add(cap);
    });

    registerBoxCollider(x, 0.7, z, 1.4, 1.3, 0.7, '中華郵政郵筒', '#15803d', false);
  }
  createPostboxes(7.6, -21);

  // Authentic Taiwanese Concrete Utility Poles & Overhead Infrastructure across entire city
  const poleBaseMat = material(0xeab308, 0.6);
  const poleMat = material(0x8a9096, 0.85);

  function addSingleUtilityPole(px, pz, hasTrans = false) {
    const poleGroup = new THREE.Group();
    poleGroup.position.set(px, 0.12, pz);
    street.add(poleGroup);

    const bP = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 1.8, 12), poleBaseMat);
    bP.position.y = 0.9;
    bP.castShadow = true;
    poleGroup.add(bP);

    for (let ring = 0.3; ring < 1.7; ring += 0.4) {
      addBox(poleGroup, darkMetalMat, 0, ring, 0, 0.48, 0.16, 0.48);
    }

    const uP = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 6.7, 12), poleMat);
    uP.position.y = 1.8 + 3.35;
    uP.castShadow = true;
    poleGroup.add(uP);

    addBox(poleGroup, steelMat, 0, 8.2, 0, 1.6, 0.12, 0.12);

    if (hasTrans) {
      const trans = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 1.1, 14), darkMetalMat);
      trans.position.set(px > 0 ? 0.38 : -0.38, 6.2, 0);
      trans.castShadow = true;
      poleGroup.add(trans);
    }

    registerBoxCollider(px, 4.3, pz, 0.6, 8.5, 0.6, '路邊電線桿', '#eab308', false);
  }

  // Avenue 0 Poles
  for (const pz of [16, -8, -24, -48, -72, -104, -136, -164, -192, -220]) {
    for (const px of [-7.6, 7.6]) {
      addSingleUtilityPole(px, pz, Math.abs(pz) === 48 || Math.abs(pz) === 104 || Math.abs(pz) === 164);
    }
  }

  // Street -120 Poles (Gate 3 -> Gate 4)
  for (const px of [-36, -12, 16, 40, 64, 88, 108]) {
    addSingleUtilityPole(px, -127.5, px === 40 || px === 88);
    addSingleUtilityPole(px, -112.5, px === 16 || px === 64);
  }

  // Avenue 72 Poles (Gate 4 -> Gate 5)
  for (const pz of [-132, -156, -180]) {
    addSingleUtilityPole(64.4, pz, pz === -156);
    addSingleUtilityPole(79.6, pz, pz === -132);
  }

  // Street -184 Poles (Gate 5 -> Gate 6)
  for (const px of [60, 36, 12, -12, -30]) {
    addSingleUtilityPole(px, -191.5, px === 36);
  }

  // Sausage Food Cart (台灣經典香腸攤)
  const cartGroup = new THREE.Group();
  cartGroup.position.set(7.6, 0.12, -40);
  street.add(cartGroup);
  addBox(cartGroup, steelMat, 0, 0.65, 0, 1.6, 0.85, 1.0, true, true);
  addBox(cartGroup, steelMat, -0.5, 1.5, 0, 0.06, 2.0, 0.06);
  const umb = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.6, 12), material(0xb91c1c, 0.6));
  umb.position.set(-0.5, 2.5, 0);
  cartGroup.add(umb);
  registerBoxCollider(7.6, 1.1, -40, 1.8, 2.0, 1.5, '大腸包小腸攤車', '#b91c1c', false);

  cityGroup.add(street);
}

let skyDomeMesh = null;
let toweringCumulusGroup = null;
let wildernessLandMat = null;
let wildernessRoadMat = null;

function buildAnimeSky() {
  const skyGeo = new THREE.SphereGeometry(1100, 48, 32);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x0284c7) },
      midColor: { value: new THREE.Color(0x7dd3fc) },
      bottomColor: { value: new THREE.Color(0xe0f2fe) },
      sunDir: { value: new THREE.Vector3(130, 160, 90).normalize() },
      sunColor: { value: new THREE.Color(0xfff7ed) },
      mieStrength: { value: 1.0 },
      cirrusStrength: { value: 0.28 },
      cloudCoverage: { value: 0.22 },
      cloudType: { value: 0.0 },
      cloudBrightColor: { value: new THREE.Color(0xffffff) },
      cloudDarkColor: { value: new THREE.Color(0x94a3b8) },
      cloudOffset: { value: new THREE.Vector2(0, 0) }
    },
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 midColor;
      uniform vec3 bottomColor;
      uniform vec3 sunDir;
      uniform vec3 sunColor;
      uniform float mieStrength;
      uniform float cirrusStrength;
      uniform float cloudCoverage;
      uniform float cloudType;
      uniform vec3 cloudBrightColor;
      uniform vec3 cloudDarkColor;
      uniform vec2 cloudOffset;
      varying vec3 vWorldPos;

      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      float noise2D(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash21(i);
        float b = hash21(i + vec2(1.0, 0.0));
        float c = hash21(i + vec2(0.0, 1.0));
        float d = hash21(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      float fbm4(vec2 p) {
        float v = 0.0;
        v += noise2D(p) * 0.50;
        v += noise2D(p * 2.07 + vec2(3.1, 1.7)) * 0.25;
        v += noise2D(p * 4.19 - vec2(2.4, 5.3)) * 0.15;
        v += noise2D(p * 8.41 + vec2(6.2, 3.8)) * 0.10;
        return v;
      }

      float billowFbm(vec2 p) {
        float v = 0.0;
        float n1 = 1.0 - abs(noise2D(p) * 2.0 - 1.0);
        float n2 = 1.0 - abs(noise2D(p * 2.13 + vec2(4.2, 1.9)) * 2.0 - 1.0);
        float n3 = noise2D(p * 4.35 - vec2(1.8, 3.4));
        v = n1 * 0.54 + n2 * 0.30 + n3 * 0.16;
        return v;
      }

      float sampleCloudField(vec2 uv, float cType) {
        // cType = 0.0: puffy fair-weather Cumulus
        // cType = 0.5: layered horizontal Stratus / Altostratus
        // cType = 1.0: turbulent domain-warped Cumulonimbus / Typhoon bands
        vec2 cumulusUv = uv * 1.35;
        float cumulusVal = billowFbm(cumulusUv) * 0.62 + fbm4(cumulusUv * 0.85) * 0.38;

        vec2 stratusUv = uv * vec2(0.95, 2.15);
        float stratusVal = fbm4(stratusUv);

        vec2 warp = vec2(
          fbm4(uv * 1.15 + vec2(1.7, 9.2)),
          fbm4(uv * 1.15 + vec2(8.3, 2.8))
        ) - 0.5;
        vec2 stormUv = uv * vec2(1.25, 1.75) + warp * 0.68;
        float stormVal = fbm4(stormUv) * 0.65 + billowFbm(stormUv * 1.6) * 0.35;

        float lowToMid = mix(cumulusVal, stratusVal, clamp(cType * 1.8, 0.0, 1.0));
        return mix(lowToMid, stormVal, clamp((cType - 0.45) * 1.82, 0.0, 1.0));
      }

      void main() {
        vec3 dir = normalize(vWorldPos);
        float h = dir.y;
        vec3 col = mix(bottomColor, midColor, smoothstep(-0.06, 0.28, h));
        col = mix(col, topColor, smoothstep(0.28, 0.85, h));

        // Physical Mie forward solar scattering & crisp solar disc (algebraic powers avoid pow(0, y) NaN)
        float mu = clamp(dot(dir, sunDir), 0.0, 1.0);
        float mu2 = mu * mu;
        float mu4 = mu2 * mu2;
        float mu8 = mu4 * mu4;
        float mu16 = mu8 * mu8;
        float mu64 = mu16 * mu16 * mu16 * mu16;
        float horizonMask = smoothstep(-0.04, 0.06, h);
        float mieHalo = mu8 * 0.26 + mu64 * 0.55;
        float solarDisc = smoothstep(0.9991, 0.9997, mu) * 1.8;
        col += sunColor * (mieHalo + solarDisc) * mieStrength * horizonMask;

        // Layer 1: High-altitude ice-crystal cirrus cloud wisps
        if (h > 0.05 && cirrusStrength > 0.01) {
          vec2 cirrusUv = (dir.xz / (h + 0.18)) * vec2(2.6, 1.05) + cloudOffset * 0.25;
          float cn = noise2D(cirrusUv) * 0.52 + noise2D(cirrusUv * 2.4 + 4.1) * 0.32 + noise2D(cirrusUv * 5.2 - 2.7) * 0.16;
          float cirrusMask = smoothstep(0.55, 0.85, cn) * smoothstep(0.06, 0.24, h) * (1.0 - smoothstep(0.62, 0.96, h));
          vec3 cirrusCol = mix(cloudBrightColor, sunColor, 0.30);
          col = mix(col, cirrusCol, cirrusMask * cirrusStrength);
        }

        // Layer 2: Dynamic weather cloud deck (Cumulus / Stratocumulus / Stratus / Cumulonimbus / Typhoon)
        if (h > -0.02 && cloudCoverage > 0.01) {
          vec2 skyUv = (dir.xz / (max(h, 0.0) + 0.22)) * 1.15 + cloudOffset;
          float n = sampleCloudField(skyUv, cloudType);

          // Threshold & edge softness adapt to cloudCoverage and cloudType
          float edgeSoftness = mix(0.14, 0.26, cloudType);
          float threshold = mix(0.74, 0.20, cloudCoverage);
          float cloudDensity = smoothstep(threshold, threshold + edgeSoftness, n);
          float horizonFade = smoothstep(-0.02, 0.11, h);
          float cloudAlpha = cloudDensity * horizonFade * clamp(cloudCoverage * 1.35, 0.0, 0.97);

          if (cloudAlpha > 0.005) {
            // Directional self-shadowing along solar azimuth + vertical cloud thickness
            vec2 sunStep = normalize(sunDir.xz + vec2(0.0001, 0.0001)) * 0.13;
            float nSun = sampleCloudField(skyUv + sunStep, cloudType);
            float selfShadow = clamp((nSun - n) * 2.8 + (n - threshold) * mix(0.65, 1.45, cloudType), 0.0, 1.0);
            float lightFactor = clamp(1.0 - selfShadow, 0.0, 1.0);

            vec3 cCol = mix(cloudDarkColor, cloudBrightColor, lightFactor);
            // Silver-lining forward scatter around cloud edges near the sun
            float silverLining = (1.0 - cloudDensity * 0.7) * mu4 * mieStrength * 0.45;
            cCol += sunColor * silverLining;

            // Blend distant horizon clouds gently into horizon atmosphere
            cCol = mix(bottomColor, cCol, smoothstep(0.0, 0.22, h));
            col = mix(col, cCol, cloudAlpha);
          }
        }

        gl_FragColor = vec4(col, 1.0);
      }
    `
  });
  skyDomeMesh = new THREE.Mesh(skyGeo, skyMat);
  scene.add(skyDomeMesh);

  toweringCumulusGroup = null;
}

// ============================================================================

// ============================================================================
// 10.9 WEATHER DYNAMICS & PARTICLES (CLEAR, CLOUDY, DRIZZLE, HEAVY RAIN, FOG, TYPHOON)
// ============================================================================
const WEATHER_PROFILES = {
  clear: {
    id: 'clear',
    name: '晴天',
    hudLabel: '晴朗無風',
    windSpeed: 0,
    gustSpeed: 0,
    windAngle: 0.4,
    downforce: 0.0,
    dragMult: 1.0,
    batteryMult: 1.0,
    turbulence: 0.0,
    rainCount: 0,
    fogDensityBonus: 0.0,
    lightScale: 1.0,
    difficulty: '平穩良好'
  },
  cloudy: {
    id: 'cloudy',
    name: '陰天',
    hudLabel: '陰天微風',
    windSpeed: 1.6,
    gustSpeed: 2.4,
    windAngle: 0.8,
    downforce: 0.0,
    dragMult: 1.05,
    batteryMult: 1.06,
    turbulence: 0.12,
    rainCount: 0,
    fogDensityBonus: 0.0006,
    lightScale: 0.88,
    difficulty: '微有擾動'
  },
  drizzle: {
    id: 'drizzle',
    name: '細雨',
    hudLabel: '綿綿細雨',
    windSpeed: 3.2,
    gustSpeed: 4.8,
    windAngle: 1.2,
    downforce: 0.35,
    dragMult: 1.15,
    batteryMult: 1.18,
    turbulence: 0.22,
    rainCount: 1600,
    rainSpeed: 20,
    fogDensityBonus: 0.0012,
    lightScale: 0.82,
    difficulty: '微下沉/易推漂'
  },
  heavy_rain: {
    id: 'heavy_rain',
    name: '豪雨',
    hudLabel: '持續豪雨',
    windSpeed: 6.2,
    gustSpeed: 8.5,
    windAngle: 1.9,
    downforce: 0.85,
    dragMult: 1.28,
    batteryMult: 1.38,
    turbulence: 0.48,
    rainCount: 3600,
    rainSpeed: 32,
    fogDensityBonus: 0.0028,
    lightScale: 0.68,
    difficulty: '下沉氣流/強陣風'
  },
  fog: {
    id: 'fog',
    name: '濃霧',
    hudLabel: '低能見度',
    windSpeed: 1.2,
    gustSpeed: 1.8,
    windAngle: 0.2,
    downforce: 0.08,
    dragMult: 1.22,
    batteryMult: 1.12,
    turbulence: 0.06,
    rainCount: 0,
    fogDensityBonus: 0.012,
    lightScale: 0.85,
    difficulty: '視距極低/阻力大'
  },
  typhoon: {
    id: 'typhoon',
    name: '颱風',
    hudLabel: '颱風驟雨',
    windSpeed: 10.5,
    gustSpeed: 14.0,
    windAngle: 2.3,
    downforce: 1.45,
    dragMult: 1.45,
    batteryMult: 1.65,
    turbulence: 0.88,
    rainCount: 5200,
    rainSpeed: 40,
    fogDensityBonus: 0.0035,
    lightScale: 0.55,
    difficulty: '極度惡劣/急下墜'
  }
};

let rainPointsMesh = null;
let rainMistMesh = null;
const RAIN_BOX_W = 68;
const RAIN_BOX_H = 44;
const RAIN_BOX_D = 68;
const MAX_RAIN_PARTICLES = 5200;
const MAX_RAIN_MIST = 64;

let rainMistTexture = null;

function createRainMistTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0.0, 'rgba(215, 228, 240, 0.32)');
  g.addColorStop(0.5, 'rgba(195, 212, 228, 0.14)');
  g.addColorStop(1.0, 'rgba(195, 212, 228, 0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

function buildRainSystem() {
  // Fine atmospheric rain streaks with per-vertex alpha taper & camera-distance fade
  const lineGeo = new THREE.BufferGeometry();
  const linePositions = new Float32Array(MAX_RAIN_PARTICLES * 6);
  const lineAlphas = new Float32Array(MAX_RAIN_PARTICLES * 2);
  const headPositions = new Float32Array(MAX_RAIN_PARTICLES * 3);
  const velocities = new Float32Array(MAX_RAIN_PARTICLES);
  const phaseJitter = new Float32Array(MAX_RAIN_PARTICLES);

  for (let i = 0; i < MAX_RAIN_PARTICLES; i++) {
    const hx = (Math.random() - 0.5) * RAIN_BOX_W;
    const hy = Math.random() * RAIN_BOX_H;
    const hz = (Math.random() - 0.5) * RAIN_BOX_D;
    headPositions[i * 3 + 0] = hx;
    headPositions[i * 3 + 1] = hy;
    headPositions[i * 3 + 2] = hz;
    velocities[i] = 22 + Math.random() * 10;
    phaseJitter[i] = Math.random() * Math.PI * 2;

    const vIdx = i * 6;
    linePositions[vIdx + 0] = hx;
    linePositions[vIdx + 1] = hy;
    linePositions[vIdx + 2] = hz;
    linePositions[vIdx + 3] = hx;
    linePositions[vIdx + 4] = hy + 0.8;
    linePositions[vIdx + 5] = hz;

    // Leading droplet tip has soft variation; trailing tail fades to 0.0 alpha
    lineAlphas[i * 2 + 0] = 0.55 + Math.random() * 0.45;
    lineAlphas[i * 2 + 1] = 0.0;
  }

  lineGeo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
  lineGeo.setAttribute('aAlpha', new THREE.BufferAttribute(lineAlphas, 1));

  const lineMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    uniforms: {
      uColor: { value: new THREE.Color(0xdbeafe) },
      uOpacity: { value: 0.24 },
      uCamPos: { value: new THREE.Vector3() }
    },
    vertexShader: `
      attribute float aAlpha;
      uniform vec3 uCamPos;
      varying float vAlpha;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        float dist = distance(wp.xyz, uCamPos);
        // Smooth near-clip fade (1.8m..4.2m) and far atmospheric fade (12m..32m)
        float distFade = smoothstep(1.8, 4.2, dist) * (1.0 - smoothstep(12.0, 32.0, dist));
        vAlpha = aAlpha * distFade;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vAlpha;
      void main() {
        if (vAlpha <= 0.004) discard;
        gl_FragColor = vec4(uColor, vAlpha * uOpacity);
      }
    `
  });

  rainPointsMesh = new THREE.LineSegments(lineGeo, lineMat);
  rainPointsMesh.frustumCulled = false;
  rainPointsMesh.userData.headPositions = headPositions;
  rainPointsMesh.userData.velocities = velocities;
  rainPointsMesh.userData.phaseJitter = phaseJitter;
  rainPointsMesh.visible = false;
  scene.add(rainPointsMesh);

  // Subtle wind-driven rain mist curtains in heavy rain & typhoon
  if (!rainMistTexture) rainMistTexture = createRainMistTexture();
  const mistGeo = new THREE.BufferGeometry();
  const mistPos = new Float32Array(MAX_RAIN_MIST * 3);
  for (let i = 0; i < MAX_RAIN_MIST; i++) {
    mistPos[i * 3 + 0] = (Math.random() - 0.5) * RAIN_BOX_W;
    mistPos[i * 3 + 1] = Math.random() * 32 + 2;
    mistPos[i * 3 + 2] = (Math.random() - 0.5) * RAIN_BOX_D;
  }
  mistGeo.setAttribute('position', new THREE.BufferAttribute(mistPos, 3));
  const mistMat = new THREE.PointsMaterial({
    color: 0xcbd5e1,
    size: 14.0,
    map: rainMistTexture,
    transparent: true,
    opacity: 0.07,
    depthWrite: false
  });
  rainMistMesh = new THREE.Points(mistGeo, mistMat);
  rainMistMesh.frustumCulled = false;
  rainMistMesh.visible = false;
  scene.add(rainMistMesh);
}

function updateRain(dt) {
  if (!rainPointsMesh || !rainPointsMesh.visible) return;
  const w = WEATHER_PROFILES[state.weather];
  if (!w || !w.rainCount) return;

  const tNow = performance.now() * 0.001;
  const inWilderness = state.gameMode === 'tactical_strike';
  const groundRef = inWilderness ? wildernessHeight(drone.pos.x, drone.pos.z) : 0;
  const agl = Math.max(1.5, drone.pos.y - groundRef);
  const shearMult = computeWindShearMultiplier(agl);

  // Instantaneous wind + multi-frequency Dryden gust envelope + wind veering
  const gustWave = Math.max(0, Math.sin(tNow * 1.15) * 0.45 + Math.cos(tNow * 2.35) * 0.35 + Math.sin(tNow * 3.95) * 0.20);
  const gustSpread = Math.max(0, (w.gustSpeed || w.windSpeed || 0) - (w.windSpeed || 0));
  const instWindSpeed = ((w.windSpeed || 0) + gustWave * gustSpread) * shearMult;
  const turb = (w.turbulence || 0) * shearMult;
  const wAng = (w.windAngle || 0.4) + (Math.sin(tNow * 0.85) * 0.14 + Math.cos(tNow * 1.95) * 0.08) * Math.min(1, turb * 1.2);

  // Horizontal raindrop advection velocity matched to natural wind slant (~12 deg in drizzle, ~22 deg in heavy rain, ~32-38 deg in typhoon)
  const windAdvectMult = w.id === 'typhoon' ? 1.85 : (w.id === 'heavy_rain' ? 1.55 : 1.25);
  const windVx = Math.cos(wAng) * instWindSpeed * windAdvectMult;
  const windVz = Math.sin(wAng) * instWindSpeed * windAdvectMult;
  const relVx = windVx - drone.vel.x * 0.22;
  const relVz = windVz - drone.vel.z * 0.22;

  rainPointsMesh.material.uniforms.uCamPos.value.copy(camera.position);

  const camFwdX = -Math.sin(drone.yaw) * 8;
  const camFwdZ = -Math.cos(drone.yaw) * 8;
  const cx = camera.position.x + camFwdX;
  const cy = camera.position.y;
  const cz = camera.position.z + camFwdZ;

  const halfW = RAIN_BOX_W * 0.5;
  const halfD = RAIN_BOX_D * 0.5;
  const count = Math.min(w.rainCount, MAX_RAIN_PARTICLES);
  const speedBase = w.rainSpeed || 24;

  // Natural motion-blur exposure length (~0.6m in drizzle, ~0.95m in heavy rain, ~1.35m in typhoon)
  const isTyphoon = w.id === 'typhoon';
  const isHeavy = w.id === 'heavy_rain';
  const streakShutter = isTyphoon ? (0.032 + gustWave * 0.006) : (isHeavy ? (0.028 + gustWave * 0.004) : 0.024);

  const lineGeo = rainPointsMesh.geometry;
  const linePos = lineGeo.attributes.position.array;
  const headPos = rainPointsMesh.userData.headPositions;
  const vArr = rainPointsMesh.userData.velocities;
  const jitterArr = rainPointsMesh.userData.phaseJitter;

  for (let i = 0; i < count; i++) {
    const hIdx = i * 3;
    const fallSpeed = speedBase + (vArr[i] - 22);
    const jPhase = jitterArr[i];
    const flutterX = Math.sin(tNow * 6.5 + jPhase) * turb * 1.1;
    const flutterZ = Math.cos(tNow * 5.8 + jPhase) * turb * 1.1;

    const vx = windVx + flutterX;
    const vz = windVz + flutterZ;

    let hx = headPos[hIdx + 0] + vx * dt;
    let hy = headPos[hIdx + 1] - fallSpeed * dt;
    let hz = headPos[hIdx + 2] + vz * dt;

    if (hy < cy - 20 || hy < groundRef - 1.0) {
      hy = cy + 22 + Math.random() * 8;
      hx = cx + (Math.random() - 0.5) * RAIN_BOX_W;
      hz = cz + (Math.random() - 0.5) * RAIN_BOX_D;
    }
    if (Math.abs(hx - cx) > halfW) {
      hx = cx - Math.sign(hx - cx) * halfW;
    }
    if (Math.abs(hz - cz) > halfD) {
      hz = cz - Math.sign(hz - cz) * halfD;
    }

    headPos[hIdx + 0] = hx;
    headPos[hIdx + 1] = hy;
    headPos[hIdx + 2] = hz;

    const svx = relVx + flutterX;
    const svz = relVz + flutterZ;
    const vIdx = i * 6;
    linePos[vIdx + 0] = hx;
    linePos[vIdx + 1] = hy;
    linePos[vIdx + 2] = hz;
    linePos[vIdx + 3] = hx - svx * streakShutter;
    linePos[vIdx + 4] = hy + fallSpeed * streakShutter;
    linePos[vIdx + 5] = hz - svz * streakShutter;
  }
  lineGeo.attributes.position.needsUpdate = true;

  // Update Wind-Driven Rain Curtain Mist Sheets in Heavy Rain & Typhoon
  if (rainMistMesh && rainMistMesh.visible) {
    const mPos = rainMistMesh.geometry.attributes.position.array;
    rainMistMesh.material.opacity = (isTyphoon ? 0.08 : 0.045) + gustWave * (isTyphoon ? 0.05 : 0.025);
    for (let i = 0; i < MAX_RAIN_MIST; i++) {
      const idx = i * 3;
      mPos[idx + 0] += windVx * 1.05 * dt;
      mPos[idx + 1] -= 2.6 * dt;
      mPos[idx + 2] += windVz * 1.05 * dt;

      if (mPos[idx + 1] < groundRef + 1.0) {
        mPos[idx + 1] = cy + 20 + Math.random() * 12;
      }
      if (Math.abs(mPos[idx + 0] - cx) > halfW) {
        mPos[idx + 0] = cx - Math.sign(mPos[idx + 0] - cx) * halfW;
      }
      if (Math.abs(mPos[idx + 2] - cz) > halfD) {
        mPos[idx + 2] = cz - Math.sign(mPos[idx + 2] - cz) * halfD;
      }
    }
    rainMistMesh.geometry.attributes.position.needsUpdate = true;
  }
}

function applyWeather(weatherId) {
  if (!WEATHER_PROFILES[weatherId]) weatherId = 'clear';
  state.weather = weatherId;
  const w = WEATHER_PROFILES[weatherId];

  const labelEl = document.getElementById('weather-label');
  if (labelEl) labelEl.textContent = w.hudLabel;

  document.querySelectorAll('#opt-weather .opt-pill').forEach((pill) => {
    pill.classList.toggle('active', pill.dataset.val === weatherId);
  });

  const badgeEl = document.getElementById('weather-impact-badge');
  if (badgeEl) {
    badgeEl.innerHTML = `
      <span class="impact-item"><svg class="menu-icon" aria-hidden="true"><use href="#menu-icon-wind"></use></svg> 風速: <b>${w.windSpeed.toFixed(1)} m/s (陣風 ${w.gustSpeed.toFixed(1)})</b></span>
      <span class="impact-item"><svg class="menu-icon" aria-hidden="true"><use href="#menu-icon-rain"></use></svg> 下壓氣流: <b>${w.downforce > 0 ? '-' + w.downforce.toFixed(2) + ' m/s²' : '無'}</b></span>
      <span class="impact-item"><svg class="menu-icon" aria-hidden="true"><use href="#menu-icon-battery"></use></svg> 耗電負載: <b>${w.batteryMult.toFixed(2)}x</b></span>
      <span class="impact-item"><svg class="menu-icon" aria-hidden="true"><use href="#menu-icon-check"></use></svg> 操控評估: <b>${w.difficulty}</b></span>
    `;
  }

  if (rainPointsMesh) {
    if (w.rainCount > 0) {
      const activeDrops = Math.min(w.rainCount, MAX_RAIN_PARTICLES);
      rainPointsMesh.visible = true;
      // Strictly match setDrawRange to activeDrops * 2 so zero un-updated vertices are ever drawn!
      rainPointsMesh.geometry.setDrawRange(0, activeDrops * 2);
      rainPointsMesh.material.uniforms.uOpacity.value = weatherId === 'typhoon' ? 0.34 : (weatherId === 'heavy_rain' ? 0.25 : 0.16);

      if (rainMistMesh) {
        rainMistMesh.visible = weatherId === 'typhoon' || weatherId === 'heavy_rain';
        rainMistMesh.material.size = weatherId === 'typhoon' ? 16.0 : 12.0;
        rainMistMesh.material.opacity = weatherId === 'typhoon' ? 0.09 : 0.05;
      }
      // Perform one immediate rain step so positions & slant are initialized before first render
      updateRain(0.016);
    } else {
      rainPointsMesh.visible = false;
      if (rainMistMesh) rainMistMesh.visible = false;
    }
  }

  applyTimeOfDay(state.timeOfDay || 'day');
}

function cycleWeather() {
  const keys = Object.keys(WEATHER_PROFILES);
  const nextIdx = (keys.indexOf(state.weather) + 1) % keys.length;
  applyWeather(keys[nextIdx]);
}

// 11. ATMOSPHERE / TIME OF DAY (SUMMER NOON, SHINKAI SUNSET, SUMMER NIGHT)
// ============================================================================
function applyTimeOfDay(mode) {
  state.timeOfDay = mode;

  const presets = {
    day: {
      label: '夏日晴空',
      skyTop: 0x0284c7,
      skyMid: 0x7dd3fc,
      skyBot: 0xe0f2fe,
      fogColor: 0x93c5fd,
      fogDensity: 0.0012,
      sunColor: 0xfff7ed,
      sunIntensity: 1.15,
      sunPos: [130, 160, 90],
      hemiSky: 0xbae6fd,
      hemiGround: 0x1e3a1f,
      hemiIntensity: 0.55,
      cloudColor: 0xffffff,
      exposure: 0.88
    },
    sunset: {
      label: '城市夕陽',
      skyTop: 0x243b55,
      skyMid: 0xc28d64,
      skyBot: 0xf2c57c,
      fogColor: 0xcfa57a,
      fogDensity: 0.0018,
      sunColor: 0xffb866,
      sunIntensity: 1.32,
      sunPos: [-180, 75, 140],
      hemiSky: 0xe8c396,
      hemiGround: 0x383228,
      hemiIntensity: 0.76,
      cloudColor: 0xffe4b8,
      exposure: 0.92
    },
    night: {
      label: '靜謐夏夜',
      skyTop: 0x02050e,
      skyMid: 0x060c18,
      skyBot: 0x0e1726,
      fogColor: 0x070c14,
      fogDensity: 0.0019,
      sunColor: 0x38bdf8,
      sunIntensity: 0.075,
      sunPos: [60, 160, 80],
      hemiSky: 0x223042,
      hemiGround: 0x111c18,
      hemiIntensity: 0.14,
      cloudColor: 0x243042,
      exposure: 0.60
    }
  };

  const p = presets[mode] || presets.day;
  document.getElementById('time-label').textContent = p.label;

  document.querySelectorAll('#opt-time .opt-pill').forEach((pill) => {
    pill.classList.toggle('active', pill.dataset.val === mode);
  });
  const timeSummary = document.getElementById('menu-summary-time');
  const timeOption = document.querySelector('#opt-time .opt-pill.active');
  if (timeSummary && timeOption) timeSummary.textContent = timeOption.dataset.description;

  const w = (typeof WEATHER_PROFILES !== 'undefined' && WEATHER_PROFILES[state.weather]) ? WEATHER_PROFILES[state.weather] : null;
  const weatherId = w ? w.id : 'clear';
  const weatherLightScale = w ? (w.lightScale || 1.0) : 1.0;
  const isOvercastOrRain = weatherId !== 'clear';

  // Weather-specific atmospheric sky tint, cloud coverage, cloud type & 3D cloud shading
  const weatherAtmosphere = {
    clear: {
      skyBlend: 0.0,
      daySky: [0x0284c7, 0x7dd3fc, 0xe0f2fe, 0x93c5fd],
      sunsetSky: [0x243b55, 0xc28d64, 0xf2c57c, 0xcfa57a],
      nightSky: [0x02050e, 0x060c18, 0x0e1726, 0x070c14],
      cirrus: mode === 'night' ? 0.08 : (mode === 'sunset' ? 0.34 : 0.28),
      coverage: 0.22,
      cType: 0.0, // Puffy fair-weather Cumulus Humilis
      mieMult: 1.0,
      dayCloud: [0xffffff, 0x94a3b8],
      sunsetCloud: [0xffe8c2, 0x7c6a60],
      nightCloud: [0x334155, 0x111827]
    },
    cloudy: {
      skyBlend: 0.38,
      daySky: [0x3b6998, 0x89a7c2, 0xcbd8e6, 0xa8bacb],
      sunsetSky: [0x2d3e52, 0x9e7b66, 0xd4b08c, 0xb09278],
      nightSky: [0x050a14, 0x0c1524, 0x162233, 0x0c1420],
      cirrus: mode === 'night' ? 0.06 : 0.20,
      coverage: 0.64,
      cType: 0.32, // Voluminous Stratocumulus & Towering Cumulus
      mieMult: 0.55,
      dayCloud: [0xf8fafc, 0x64748b],
      sunsetCloud: [0xfcd9a8, 0x5c5356],
      nightCloud: [0x2e3b4e, 0x0f1722]
    },
    drizzle: {
      skyBlend: 0.74,
      daySky: [0x516375, 0x7c8ea0, 0xadbcc9, 0x94a3b3],
      sunsetSky: [0x36414f, 0x7d6b61, 0xa8927e, 0x8c796a],
      nightSky: [0x070c14, 0x0f1722, 0x192330, 0x101722],
      cirrus: 0.05,
      coverage: 0.80,
      cType: 0.65, // Flat layered Altostratus / Rain Stratus
      mieMult: 0.22,
      dayCloud: [0xdbe3ec, 0x526071],
      sunsetCloud: [0xc9ae96, 0x474349],
      nightCloud: [0x242f3d, 0x0c121b]
    },
    heavy_rain: {
      skyBlend: 0.90,
      daySky: [0x2c3847, 0x465466, 0x68778a, 0x556475],
      sunsetSky: [0x222933, 0x4f4645, 0x70625b, 0x594e4a],
      nightSky: [0x04070c, 0x080d14, 0x101722, 0x080d14],
      cirrus: 0.0,
      coverage: 0.92,
      cType: 0.86, // Heavy dark-bellied Cumulonimbus / Nimbostratus
      mieMult: 0.08,
      dayCloud: [0x8b9bb0, 0x26313f],
      sunsetCloud: [0x8c7669, 0x242329],
      nightCloud: [0x18212b, 0x070b10]
    },
    fog: {
      skyBlend: 0.95,
      daySky: [0x8d9eab, 0xa6b5c2, 0xc4d0da, 0xb8c5d0],
      sunsetSky: [0x6e737b, 0x9e8f84, 0xc2b29f, 0xb5a492],
      nightSky: [0x0d131c, 0x141d29, 0x1c2736, 0x16202b],
      cirrus: 0.0,
      coverage: 0.95,
      cType: 0.52, // Smooth enveloping Stratus Nebulosus fog blanket
      mieMult: 0.20,
      dayCloud: [0xd5dfe8, 0x93a3b1],
      sunsetCloud: [0xc7b5a3, 0x7d726c],
      nightCloud: [0x232e3c, 0x131b24]
    },
    typhoon: {
      skyBlend: 0.96,
      daySky: [0x1b2430, 0x2d3846, 0x455262, 0x364252],
      sunsetSky: [0x161b24, 0x383236, 0x544947, 0x403838],
      nightSky: [0x020408, 0x05080f, 0x0a1018, 0x05080f],
      cirrus: 0.0,
      coverage: 0.97,
      cType: 1.0, // Swirling Typhoon Eyewall supercell storm bands
      mieMult: 0.04,
      dayCloud: [0x607082, 0x151e28],
      sunsetCloud: [0x665652, 0x14151c],
      nightCloud: [0x121922, 0x04070b]
    }
  };

  const wa = weatherAtmosphere[weatherId] || weatherAtmosphere.clear;
  const targetSky = mode === 'night' ? wa.nightSky : (mode === 'sunset' ? wa.sunsetSky : wa.daySky);
  const targetCloud = mode === 'night' ? wa.nightCloud : (mode === 'sunset' ? wa.sunsetCloud : wa.dayCloud);

  const blendHex = (hexA, hexB, t) => new THREE.Color(hexA).lerp(new THREE.Color(hexB), t).getHex();
  const effSkyTop = blendHex(p.skyTop, targetSky[0], wa.skyBlend);
  const effSkyMid = blendHex(p.skyMid, targetSky[1], wa.skyBlend);
  const effSkyBot = blendHex(p.skyBot, targetSky[2], wa.skyBlend);
  const effFogColor = blendHex(p.fogColor, targetSky[3], wa.skyBlend);
  const effHemiSky = blendHex(p.hemiSky, targetSky[1], wa.skyBlend * 0.75);

  if (skyDomeMesh) {
    const u = skyDomeMesh.material.uniforms;
    u.topColor.value.setHex(effSkyTop);
    u.midColor.value.setHex(effSkyMid);
    u.bottomColor.value.setHex(effSkyBot);
    u.sunDir.value.set(...p.sunPos).normalize();
    u.sunColor.value.setHex(p.sunColor);
    const baseMie = mode === 'night' ? 0.15 : (mode === 'sunset' ? 1.15 : 0.95);
    u.mieStrength.value = baseMie * wa.mieMult;
    u.cirrusStrength.value = wa.cirrus;
    u.cloudCoverage.value = wa.coverage;
    u.cloudType.value = wa.cType;
    u.cloudBrightColor.value.setHex(targetCloud[0]);
    u.cloudDarkColor.value.setHex(targetCloud[1]);
  }

  scene.background.setHex(effSkyMid);
  scene.fog.color.setHex(effFogColor);
  const fogDensityBonus = w ? (w.fogDensityBonus || 0) : 0;
  if (scene.fog.isFogExp2) {
    scene.fog.density = p.fogDensity + fogDensityBonus;
  } else {
    scene.fog.near = (w && w.id === 'fog') ? 10 : 180;
    scene.fog.far = (w && w.id === 'fog') ? 140 : Math.max(160, 1120 / (1 + fogDensityBonus * 350));
  }

  dirLight.color.setHex(p.sunColor);
  dirLight.intensity = p.sunIntensity * weatherLightScale;
  currentSunOffset.set(...p.sunPos);
  updateShadowFrustum();

  hemiLight.color.setHex(effHemiSky);
  hemiLight.groundColor.setHex(p.hemiGround);
  hemiLight.intensity = p.hemiIntensity * THREE.MathUtils.lerp(1.0, 0.78, wa.skyBlend);

  // Wet-surface specular sheen on terrain & roads during rainy weather
  const isWet = w && (w.id === 'drizzle' || w.id === 'heavy_rain' || w.id === 'typhoon');
  const wetSeverity = !isWet ? 0 : (w.id === 'typhoon' ? 1.0 : (w.id === 'heavy_rain' ? 0.8 : 0.45));
  if (wildernessLandMat) {
    wildernessLandMat.roughness = THREE.MathUtils.lerp(0.95, 0.56, wetSeverity);
    wildernessLandMat.metalness = THREE.MathUtils.lerp(0.02, 0.12, wetSeverity);
  }
  if (wildernessRoadMat) {
    wildernessRoadMat.roughness = THREE.MathUtils.lerp(0.94, 0.38, wetSeverity);
    wildernessRoadMat.metalness = THREE.MathUtils.lerp(0.03, 0.18, wetSeverity);
  }

  if (toweringCumulusGroup) {
    toweringCumulusGroup.traverse((c) => {
      if (c.isMesh && c.material) c.material.color.setHex(p.cloudColor);
    });
  }

  // Update Taiwan illuminated commercial signs & lanterns
  if (window.taiwanEmissiveMaterials && window.taiwanEmissiveMaterials.length) {
    const intensity = state.sensorMode === 'flir_white' ? 0 : mode === 'night' ? 1.85 : mode === 'sunset' ? 0.9 : 0.22;
    window.taiwanEmissiveMaterials.forEach((m) => {
      if (m && m.emissive) m.emissiveIntensity = intensity;
    });
  }

  const thermal = state.sensorMode === 'flir_white';
  const nightVision = state.sensorMode === 'nvg' && mode === 'night';
  if (thermal) {
    dirLight.intensity = 0.018;
    hemiLight.intensity = 0.22;
    hemiLight.color.setHex(0xa1abb0);
    hemiLight.groundColor.setHex(0x282c30);
    scene.fog.color.setHex(0x0c1218);
    scene.environment = null;
    if (skyDomeMesh) {
      for (const key of ['topColor','midColor','bottomColor']) {
        skyDomeMesh.material.uniforms[key].value.setHex(0x080f14);
      }
      skyDomeMesh.material.uniforms.mieStrength.value = 0.0;
      skyDomeMesh.material.uniforms.cirrusStrength.value = 0.0;
      skyDomeMesh.material.uniforms.cloudCoverage.value = 0.0;
    }
  } else {
    const iblSunStrength = mode === 'night' ? 0.08 : wa.mieMult;
    scene.environment = getProceduralEnvMap(
      `${mode}_${weatherId}_${nightVision ? 'nvg' : 'vis'}`,
      nightVision ? 0x16261c : effSkyTop,
      nightVision ? 0x263d2d : effSkyMid,
      nightVision ? 0x34523d : effSkyBot,
      nightVision ? 0x142017 : p.hemiGround,
      p.sunPos,
      nightVision ? 0x567360 : p.sunColor,
      iblSunStrength
    );
    if (nightVision) {
      // Balanced Gen 2/3 NVG photocathode amplification:
      // Clear terrain, ridge lines and road contours for flight navigation,
      // with authentic phosphor green tint and grain.
      dirLight.intensity = Math.max(0.045, p.sunIntensity * 1.6);
      hemiLight.intensity = Math.max(0.18, p.hemiIntensity * 1.7);
      hemiLight.color.setHex(0x567360);
      hemiLight.groundColor.setHex(0x1e2b20);
    }
  }
  if (rainPointsMesh && rainPointsMesh.material && rainPointsMesh.material.uniforms) {
    const rainTint = thermal ? 0x334155 : (nightVision ? 0x6ee7b7 : (mode === 'sunset' ? 0xfed7aa : (mode === 'night' ? 0x64748b : 0xdbeafe)));
    rainPointsMesh.material.uniforms.uColor.value.setHex(rainTint);
    if (rainMistMesh && rainMistMesh.material) {
      rainMistMesh.material.color.setHex(thermal ? 0x1e293b : (nightVision ? 0x34d399 : (mode === 'sunset' ? 0xd6b094 : (mode === 'night' ? 0x334155 : 0xcbd5e1))));
    }
  }
  renderer.toneMappingExposure = thermal ? 0.64 : (nightVision ? 0.94 : p.exposure);
}

function cycleTimeOfDay() {
  const order = ['day', 'sunset', 'night'];
  const next = order[(order.indexOf(state.timeOfDay) + 1) % order.length];
  applyTimeOfDay(next);
}

// ============================================================================
// 12. QUADCOPTER MODEL & RACING GATES
// ============================================================================
const gateObjects = [];

function createGateNumberSprite(numStr, subText) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.strokeStyle = '#00f0ff';
  ctx.lineWidth = 5;
  ctx.fillRect(8, 8, 496, 112);
  ctx.strokeRect(8, 8, 496, 112);

  ctx.fillStyle = '#00f0ff';
  ctx.font = 'bold 36px "Segoe UI", "Microsoft JhengHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`GATE 0${numStr}`, 256, 52);

  ctx.fillStyle = '#f8fafc';
  ctx.font = '600 22px "Segoe UI", "Microsoft JhengHei", sans-serif';
  ctx.fillText(subText, 256, 94);

  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(12, 3.0, 1);
  return sprite;
}


// ============================================================================
// TRAINING ACADEMY CONFIGURATION & HOVER HELPER
// ============================================================================
const TRAINING_TASKS = [
  {
    step: 1,
    title: '任務一：油門起飛與定高懸停',
    shortName: '起飛與定高懸停',
    descDual: '按住 <kbd>W</kbd> 垂直爬升至 10 公尺，放開按鍵或按 <kbd>Space</kbd> 保持懸停 2 秒',
    descSingle: '按住 <kbd>Shift</kbd> 或 <kbd>U</kbd> 爬升至 10 公尺，放開或按 <kbd>Space</kbd> 保持懸停 2 秒',
    keysDual: ['key-top-l2'],
    keysSingle: ['key-top-l2'],
    targetText: '起降坪正上方 10m 定高懸停目標區',
    successMsg: 'EXCELLENT! 垂直起飛與定高懸停掌握成功！'
  },
  {
    step: 2,
    title: '任務二：俯仰前進與等速巡航',
    shortName: '俯仰前進推進',
    descDual: '按住右手方向鍵 <kbd>↑</kbd> 壓低機頭向前推進，穿過前方的【1號訓練光圈】',
    descSingle: '按住 <kbd>W</kbd> 向前推進飛行，穿過前方的【1號訓練光圈】',
    keysDual: ['key-top-r1'],
    keysSingle: ['key-top-l2'],
    targetText: '穿過 1 號訓練光圈（騎樓商圈入口）',
    successMsg: 'GREAT! 掌握俯仰前進與等速巡航速度！'
  },
  {
    step: 3,
    title: '任務三：機頭旋轉偏航轉向',
    shortName: '航向偏航轉向',
    descDual: '使用左手 <kbd>A</kbd> 或 <kbd>D</kbd> 轉動機頭朝向，對準並穿過【2號光圈】',
    descSingle: '使用 <kbd>Q</kbd> 或 <kbd>E</kbd> 轉動機頭朝向，對準並穿過【2號光圈】',
    keysDual: ['key-bot-l1', 'key-bot-l3', 'key-top-l1', 'key-top-l3'],
    keysSingle: ['key-top-l1', 'key-top-l3'],
    targetText: '偏航轉動機頭，對準並穿過 2 號訓練光圈（平交道上方）',
    successMsg: 'PERFECT! 航向校正與偏航轉向操作精準！'
  },
  {
    step: 4,
    title: '任務四：橫滾左右平移避障',
    shortName: '橫滾側飛平移',
    descDual: '按方向鍵 <kbd>←</kbd> 或 <kbd>→</kbd> 進行側移，不轉機頭側身平移穿過【3號光圈】',
    descSingle: '按 <kbd>A</kbd> 或 <kbd>D</kbd> 側移，側身平移穿過【3號光圈】',
    keysDual: ['key-bot-r1', 'key-bot-r3'],
    keysSingle: ['key-bot-l1', 'key-bot-l3'],
    targetText: '橫滾側移平飛，穿過 3 號訓練光圈（中央車站轉角）',
    successMsg: 'SMOOTH! 橫滾側移操作靈活完成！'
  },
  {
    step: 5,
    title: '任務五：增壓加速與空中急煞',
    shortName: '增壓衝刺與煞車',
    descDual: '按住 <kbd>Shift</kbd> 衝刺加速，接近目標時按 <kbd>Space</kbd> 氣動煞車穿過【4號光圈】',
    descSingle: '按住 <kbd>F</kbd> 推進加速，接近目標時按 <kbd>Space</kbd> 氣動煞車穿過【4號光圈】',
    keysDual: ['key-top-r1'],
    keysSingle: ['key-top-l2'],
    targetText: '高速衝刺穿過 4 號訓練光圈，並在周邊按 Space 急煞懸停',
    successMsg: 'AWESOME! 掌握高機動衝刺與急煞懸停！'
  },
  {
    step: 6,
    title: '任務六：綜合返航與精準降落',
    shortName: '返航精準降落',
    descDual: '綜合運用操控飛回中央 [H] 起降坪！高度低於 2 米後按 <kbd>S</kbd> 緩降接地',
    descSingle: '綜合運用操控飛回中央 [H] 起降坪！按 <kbd>Ctrl</kbd> 或 <kbd>J</kbd> 緩降接地',
    keysDual: ['key-bot-l2'],
    keysSingle: ['key-bot-l2'],
    targetText: '返航飛回市區中央 H 起降坪，緩慢接地並保持靜止降落',
    successMsg: 'CONGRATULATIONS! 恭喜全數合格，取得飛行合格證書！'
  }
];

let trainingHoverRingGroup = null;
let trainingHoverRingMat = null;

function buildTrainingHoverRing() {
  trainingHoverRingGroup = new THREE.Group();
  trainingHoverRingGroup.position.set(0, 10, 0);

  const geom = new THREE.TorusGeometry(4.2, 0.28, 16, 48);
  geom.rotateX(Math.PI / 2);
  trainingHoverRingMat = new THREE.MeshBasicMaterial({
    color: 0x10b981,
    transparent: true,
    opacity: 0.85
  });
  const mesh = new THREE.Mesh(geom, trainingHoverRingMat);
  trainingHoverRingGroup.add(mesh);

  const discGeom = new THREE.CylinderGeometry(4.1, 4.1, 0.04, 32);
  const discMat = new THREE.MeshBasicMaterial({
    color: 0x10b981,
    transparent: true,
    opacity: 0.18,
    side: THREE.DoubleSide
  });
  trainingHoverRingGroup.add(new THREE.Mesh(discGeom, discMat));

  const sprite = createGateNumberSprite(1, '定高懸停目標 (高度 10m)');
  sprite.position.set(0, 2.8, 0);
  trainingHoverRingGroup.add(sprite);

  cityGroup.add(trainingHoverRingGroup);
  trainingHoverRingGroup.visible = false;
}

function buildCourseGates() {
  COURSE_GATES.forEach((g, idx) => {
    const group = new THREE.Group();
    group.position.set(g.pos.x, g.pos.y, g.pos.z);
    group.rotation.y = g.rotY;

    // Torus Ring
    const outerRing = new THREE.Mesh(
      new THREE.TorusGeometry(g.radius, 0.45, 16, 42),
      new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.7, roughness: 0.3 })
    );
    group.add(outerRing);

    const innerMat = new THREE.MeshBasicMaterial({ color: idx === 0 ? 0x10b981 : 0x00f0ff });
    const innerRing = new THREE.Mesh(
      new THREE.TorusGeometry(g.radius - 0.48, 0.22, 12, 42),
      innerMat
    );
    group.add(innerRing);

    const labelSprite = createGateNumberSprite(g.id, g.name);
    labelSprite.position.set(0, g.radius + 2.8, 0);
    group.add(labelSprite);

    cityGroup.add(group);
    gateObjects.push({ data: g, group, innerRing, innerMat });
  });
}

function updateGateVisualStates() {
  const isTraining = state.gameMode === 'training' || state.gameMode === 'single_race';

  if (trainingHoverRingGroup) {
    trainingHoverRingGroup.visible = isTraining && state.raceActive && state.trainingStep === 1;
  }

  gateObjects.forEach((obj, idx) => {
    if (state.gameMode === 'free_flight') {
      obj.innerMat.color.setHex(0x00f0ff);
      obj.group.scale.setScalar(1.0);
      return;
    }

    if (isTraining) {
      if (state.trainingStep === 1) {
        obj.innerMat.color.setHex(0x334155);
        obj.group.scale.setScalar(0.9);
      } else if (state.trainingStep >= 2 && state.trainingStep <= 5) {
        const targetGateIdx = state.trainingStep - 2;
        if (idx < targetGateIdx) {
          obj.innerMat.color.setHex(0x64748b);
          obj.group.scale.setScalar(0.95);
        } else if (idx === targetGateIdx) {
          obj.innerMat.color.setHex(0x10b981);
          obj.group.scale.setScalar(1.08);
        } else {
          obj.innerMat.color.setHex(0x0284c7);
          obj.group.scale.setScalar(1.0);
        }
      } else {
        // Step 6: Helipad landing
        obj.innerMat.color.setHex(0x64748b);
        obj.group.scale.setScalar(0.95);
      }
      return;
    }

    if (idx < state.currentGateIndex) {
      obj.innerMat.color.setHex(0x64748b);
      obj.group.scale.setScalar(0.95);
    } else if (idx === state.currentGateIndex) {
      obj.innerMat.color.setHex(0x10b981);
      obj.group.scale.setScalar(1.06);
    } else {
      obj.innerMat.color.setHex(0x0284c7);
      obj.group.scale.setScalar(1.0);
    }
  });
}


// ============================================================================
// 12.5 TACTICAL STRIKE: WILDERNESS TANK BOMBING & CCIP SYSTEM
// ============================================================================

let wildernessGroup = null;
let dronePayloadGroup = null;
let bellyBombMeshes = [];
let ccipMarkerMesh = null;
let ccipMarkerMat = null;
let ccipLineMat = null;

function createTankMesh(colorHex, number) {
  const root = new THREE.Group();
  const detailTransform = new THREE.Object3D();
  function detailBatch(geometry, material, transforms) {
    const batch = new THREE.InstancedMesh(geometry, material, transforms.length);
    transforms.forEach(([x,y,z,angle], i) => {
      detailTransform.position.set(x,y,z);
      detailTransform.rotation.set(angle,0,0);
      detailTransform.updateMatrix();
      batch.setMatrixAt(i,detailTransform.matrix);
    });
    batch.frustumCulled = false;
    batch.userData.visualOnly = true;
    root.add(batch);
    return batch;
  }

  // An open track loop keeps the road wheels visible under the skirts.
  const trackMat = new THREE.MeshStandardMaterial({ color: 0x242a25, roughness: .88 });
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x6d715b, roughness: .72 });
  const trackOutline = new THREE.Shape();
  function trackLoop(path, radius) {
    path.moveTo(-2.13, radius);
    path.lineTo(2.13, radius);
    path.absarc(2.13, 0, radius, Math.PI / 2, -Math.PI / 2, true);
    path.lineTo(-2.13, -radius);
    path.absarc(-2.13, 0, radius, -Math.PI / 2, Math.PI / 2, true);
    path.closePath();
  }
  trackLoop(trackOutline, .43);
  const opening = new THREE.Path();
  trackLoop(opening, .35);
  trackOutline.holes.push(opening);
  const trackGeometry = new THREE.ExtrudeGeometry(trackOutline, {
    depth: .61, bevelEnabled: false, curveSegments: 12
  });
  trackGeometry.rotateY(Math.PI / 2);
  trackGeometry.translate(-.305, 0, 0);
  const wheelGeometry = new THREE.CylinderGeometry(.30, .30, .46, 24).rotateZ(Math.PI / 2);
  const rimGeometry = new THREE.CylinderGeometry(.22, .22, .08, 24).rotateZ(Math.PI / 2);
  const hubGeometry = new THREE.CylinderGeometry(.095, .095, .06, 16).rotateZ(Math.PI / 2);
  const treadTransforms = [];
  const boltTransforms = [];
  const wheelGroups = [];
  for (const side of [-1, 1]) {
    const track = new THREE.Mesh(trackGeometry, trackMat);
    track.position.set(side * 1.45, .44, 0);
    root.add(track);
    for (let i = 0; i < 26; i++) {
      const z = -2.08 + i * (4.16 / 25);
      treadTransforms.push([side * 1.45,.883,z,0],[side * 1.45,.012,z,0]);
    }
    for (const end of [-1,1]) {
      for (let i = 1; i < 8; i++) {
        const angle = end * i * Math.PI / 8;
        treadTransforms.push([
          side * 1.45,.44 + Math.cos(angle) * .435,end * 2.13 + Math.sin(angle) * .435,angle
        ]);
      }
    }
    for (let i = 0; i < 6; i++) {
      const z = -2.1 + i * .84;
      const wheel = new THREE.Mesh(wheelGeometry, trackMat);
      const rim = new THREE.Mesh(rimGeometry, wheelMat);
      const hub = new THREE.Mesh(hubGeometry, trackMat);
      const axle = new THREE.Group();
      axle.position.set(side * 1.45,.39,z);
      rim.position.x = side * .26;
      hub.position.x = side * .31;
      axle.add(wheel,rim,hub);
      root.add(axle);
      wheelGroups.push(axle);
      for (let j = 0; j < 6; j++) {
        const angle = j * Math.PI / 3;
        boltTransforms.push([side * 1.758,.39 + .151 * Math.cos(angle),z + .151 * Math.sin(angle),0]);
      }
    }
  }

  const treadMat = new THREE.MeshStandardMaterial({color:0x444338,roughness:.91,metalness:.12});
  detailBatch(new THREE.BoxGeometry(.60,.026,.115),treadMat,treadTransforms);
  const bolts = detailBatch(new THREE.CylinderGeometry(.022,.022,.034,6).rotateZ(Math.PI / 2),
    trackMat,boltTransforms);
  bolts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  let wheelAngle = 0;
  function rollWheels(distance) {
    if (distance === 0) return;
    wheelAngle = (wheelAngle - distance / .30) % (Math.PI * 2);
    for (const axle of wheelGroups) axle.rotation.x = wheelAngle;
    const sin = Math.sin(wheelAngle), cos = Math.cos(wheelAngle);
    detailTransform.rotation.set(wheelAngle,0,0);
    boltTransforms.forEach(([x,y,z],i) => {
      const center = wheelGroups[Math.floor(i / 6)].position;
      const dy = y - center.y, dz = z - center.z;
      detailTransform.position.set(x,center.y+dy*cos-dz*sin,center.z+dy*sin+dz*cos);
      detailTransform.updateMatrix();
      bolts.setMatrixAt(i,detailTransform.matrix);
    });
    bolts.instanceMatrix.needsUpdate = true;
  }

  // 2. Main Armored Hull
  const hullGeo = new THREE.BoxGeometry(2.5, 0.72, 4.9);
  const camouflage = document.createElement('canvas');
  camouflage.width = camouflage.height = 256;
  const paint = camouflage.getContext('2d');
  paint.fillStyle = `#${colorHex.toString(16).padStart(6,'0')}`;
  paint.fillRect(0,0,256,256);
  const patches = [
    ['#777154',-12,34,68,28,.6], ['#777154',146,134,79,34,-.35],
    ['#777154',235,230,52,27,.24], ['#2e342d',92,15,64,19,-.48],
    ['#2e342d',44,163,55,22,.62], ['#30362d',206,184,56,20,-.57]
  ];
  for (const [color,x,y,width,height,angle] of patches) {
    paint.fillStyle = color;
    for (const dx of [-256,0,256]) {
      for (const dy of [-256,0,256]) {
        paint.save();
        paint.translate(x+dx,y+dy);
        paint.rotate(angle);
        paint.beginPath();
        paint.moveTo(-width,0);
        paint.bezierCurveTo(-width,-height,-width*.1,-height*.4,width*.2,-height);
        paint.bezierCurveTo(width*.9,-height*1.2,width,height*.14,width*.67,height*.65);
        paint.bezierCurveTo(width*.3,height,-width*.73,height*1.17,-width,0);
        paint.fill();
        paint.restore();
      }
    }
  }
  const camouflageTexture = new THREE.CanvasTexture(camouflage);
  camouflageTexture.encoding = THREE.sRGBEncoding;
  camouflageTexture.wrapS = camouflageTexture.wrapT = THREE.RepeatWrapping;
  camouflageTexture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const armorMat = new THREE.MeshStandardMaterial({map:camouflageTexture,roughness:.8,metalness:.19});
  const hull = new THREE.Mesh(hullGeo, armorMat);
  hull.position.set(0, 0.86, 0);
  root.add(hull);
  const underbody = vehicleProfile([
    [-2.43,.54],[-2.10,.20],[1.90,.20],[2.47,.49],[2.47,.72],[-2.43,.72]
  ], 2.58, .06);
  vehiclePart(root, underbody, trackMat, 0, 0, 0, true).rotation.y = Math.PI / 2;

  // Sloping frontal glacis plate
  const glacisGeo = new THREE.BoxGeometry(2.45, 0.48, 1.3);
  const glacis = new THREE.Mesh(glacisGeo, armorMat);
  glacis.position.set(0, 0.78, -2.25);
  glacis.rotation.x = -Math.PI / 6;
  root.add(glacis);

  // 3. Rotating Turret
  const turretGroup = new THREE.Group();
  turretGroup.position.set(0, 1.38, -0.2);

  const outline = new THREE.Shape();
  outline.moveTo(-.60, -1.58);
  for (const [x, z] of [[.60,-1.58],[1.17,-.58],[1.08,1.45],[-1.08,1.45],[-1.17,-.58]]) {
    outline.lineTo(x, z);
  }
  outline.closePath();
  const turretGeo = new THREE.ExtrudeGeometry(outline, {
    depth: .58, bevelThickness: .07, bevelSize: .10, bevelSegments: 3
  });
  turretGeo.rotateX(Math.PI / 2);
  turretGeo.translate(0, .30, 0);
  const turret = new THREE.Mesh(turretGeo, armorMat);
  turretGroup.add(turret);

  // Commander Cupola & Hinged Hatch
  const cupolaMat = new THREE.MeshStandardMaterial({ color: 0x222c1e, roughness: 0.78, metalness: 0.25 });
  const cupolaGeo = new THREE.CylinderGeometry(0.35, 0.38, 0.22, 16);
  const cupola = new THREE.Mesh(cupolaGeo, cupolaMat);
  cupola.position.set(0.45, 0.42, 0.4);
  turretGroup.add(cupola);

  const cupolaInterior = new THREE.Mesh(
    new THREE.CircleGeometry(0.28, 16).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x070606, polygonOffset: true, polygonOffsetFactor: -3 })
  );
  cupolaInterior.position.set(0.45, 0.535, 0.4);
  turretGroup.add(cupolaInterior);

  const cupolaHatch = new THREE.Group();
  cupolaHatch.position.set(0.76, 0.54, 0.4); // Hinge pivot at right edge of cupola
  const hatchLid = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.33, 0.045, 16),
    cupolaMat
  );
  hatchLid.position.set(-0.31, 0.02, 0);
  cupolaHatch.add(hatchLid);
  turretGroup.add(cupolaHatch);

  // Turret Underside Ring & Cannon Breech Basket (visible when turret flips off hull)
  const charMetalMat = new THREE.MeshStandardMaterial({ color: 0x1a1816, roughness: 0.92, metalness: 0.32, side: THREE.DoubleSide });
  const turretUnderRing = new THREE.Group();
  turretUnderRing.position.set(0, -0.02, 0.05);
  const underCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.88, 0.78, 0.24, 22), charMetalMat);
  underCollar.position.y = -0.10;
  const breechBlock = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.34, 0.92), charMetalMat);
  breechBlock.position.set(0, -0.12, -0.18);
  turretUnderRing.add(underCollar, breechBlock);
  turretGroup.add(turretUnderRing);

  // Main gun silhouette
  const barrelGeo = new THREE.CylinderGeometry(0.09, 0.12, 4.2, 16);
  barrelGeo.rotateX(Math.PI / 2);
  const barrelMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.3 });
  const barrel = new THREE.Mesh(barrelGeo, barrelMat);
  barrel.position.set(0, 0.05, -2.6);
  turretGroup.add(barrel);

  function detail(parent, geometry, material, x, y, z) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }
  const skirt = new THREE.BoxGeometry(.18, .48, .87);
  const cheek = new THREE.BoxGeometry(.40, .52, .81);
  const deckTile = new THREE.BoxGeometry(.44, .12, .39);
  const vent = new THREE.BoxGeometry(1.48, .04, .08);
  const stowage = new THREE.BoxGeometry(.44, .31, 1.34);
  const seam = new THREE.BoxGeometry(.028,.055,.62);
  const lensMaterial = new THREE.MeshStandardMaterial({color:0x344e50,roughness:.21,metalness:.45});
  const optic = new THREE.BoxGeometry(.19,.095,.033);
  const towEye = new THREE.TorusGeometry(.105,.026,7,14);

  const skirts = [];
  const stowageBoxes = [];
  const deckTiles = [];
  const engineVents = [];

  for (const side of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const z = -2.27 + i * .91;
      const skirtMesh = detail(root, skirt, armorMat, side * 1.84, .97, z);
      const seamMesh = detail(root, seam, trackMat, side * 1.938, 1.12, z);
      seamMesh.userData.visualOnly = true;
      skirts.push({ mesh: skirtMesh, seamMesh, side, index: i, z, detached: false });
    }
    detail(turretGroup, cheek, armorMat, side * .83, .02, -1.03).rotation.y = side * .52;
    const stowMesh = detail(turretGroup, stowage, armorMat, side * .91, .12, .75);
    stowageBoxes.push(stowMesh);
    detail(turretGroup, optic, lensMaterial, side * .42,.38,-.86).userData.visualOnly = true;
    detail(root, towEye, trackMat,side * .84,.62,-2.82).userData.visualOnly = true;
    detail(root, towEye, trackMat,side * .84,.60,2.46).userData.visualOnly = true;
    for (let i = 0; i < 3; i++) {
      const tileMesh = detail(root, deckTile, armorMat, side * (.24 + i * .45), 1.04, -2.35);
      tileMesh.rotation.x = -.32;
      deckTiles.push(tileMesh);
    }
  }
  for (let i = 0; i < 7; i++) {
    engineVents.push(detail(root, vent, trackMat, 0, 1.24, 1.26 + i * .15));
  }
  const bustleBox = detail(turretGroup, new THREE.BoxGeometry(1.58, .37, .64), armorMat, 0, -.04, 1.64);
  stowageBoxes.push(bustleBox);
  detail(turretGroup, new THREE.BoxGeometry(.32, .36, .34), trackMat, -.62, .46, -.52);
  detail(turretGroup, new THREE.BoxGeometry(.38, .25, .48), armorMat, -.49, .56, .61);
  detail(turretGroup, new THREE.CylinderGeometry(.045, .045, .79, 8).rotateX(Math.PI / 2),
    barrelMat, -.49, .64, .22);
  const fumeExtractor = detail(turretGroup, new THREE.CylinderGeometry(.14, .14, .58, 12).rotateX(Math.PI / 2),
    barrelMat, 0, .05, -2.82);
  const antennaMesh = detail(turretGroup, new THREE.CylinderGeometry(.018, .027, 1.12, 6),
    barrelMat, .66, .81, 1.36);
  antennaMesh.rotation.z = -.18;

  // 4. Hull Turret-Ring Abyss & Internal Autoloader Wreckage (Exposed when Turret is Blown Off)
  const turretRingWell = new THREE.Group();
  turretRingWell.position.set(0, 1.224, -0.2);
  turretRingWell.visible = false;
  root.add(turretRingWell);

  // Deep pitch-black void floor overriding hull top face via polygonOffset
  const abyssVoidMat = new THREE.MeshBasicMaterial({
    color: 0x040404,
    polygonOffset: true,
    polygonOffsetFactor: -5,
    polygonOffsetUnits: -5
  });
  const abyssFloor = new THREE.Mesh(new THREE.CircleGeometry(0.98, 28).rotateX(-Math.PI / 2), abyssVoidMat);
  abyssFloor.position.y = 0.002;
  turretRingWell.add(abyssFloor);

  // Outer soot scorch halo around the blown turret ring
  const ringScorchMat = new THREE.MeshBasicMaterial({
    color: 0x110f0d,
    transparent: true,
    opacity: 0.92,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3
  });
  const ringScorchHalo = new THREE.Mesh(new THREE.RingGeometry(0.92, 1.26, 28).rotateX(-Math.PI / 2), ringScorchMat);
  ringScorchHalo.position.y = 0.001;
  turretRingWell.add(ringScorchHalo);

  // Glowing internal ammo carousel embers at the bottom of the breach
  const emberGlowMat = new THREE.MeshBasicMaterial({
    color: 0xe8590c,
    transparent: true,
    opacity: 0.9,
    polygonOffset: true,
    polygonOffsetFactor: -7,
    polygonOffsetUnits: -7
  });
  const emberCoreMat = new THREE.MeshBasicMaterial({
    color: 0xffb703,
    transparent: true,
    opacity: 0.95,
    polygonOffset: true,
    polygonOffsetFactor: -9,
    polygonOffsetUnits: -9
  });
  const emberBed = new THREE.Mesh(new THREE.CircleGeometry(0.66, 22).rotateX(-Math.PI / 2), emberGlowMat);
  emberBed.position.y = 0.005;
  const emberHotCore = new THREE.Mesh(new THREE.CircleGeometry(0.34, 18).rotateX(-Math.PI / 2), emberCoreMat);
  emberHotCore.position.y = 0.008;
  turretRingWell.add(emberBed, emberHotCore);

  // Charred cylindrical turret-ring pit wall & mangled autoloader carousel ring
  const ringWall = new THREE.Mesh(
    new THREE.CylinderGeometry(0.97, 0.86, 0.20, 28, 1, true),
    charMetalMat
  );
  ringWall.position.y = 0.08;
  const ringCollar = new THREE.Mesh(
    new THREE.TorusGeometry(0.97, 0.068, 9, 28).rotateX(Math.PI / 2),
    charMetalMat
  );
  ringCollar.position.y = 0.045;
  const mangledCarousel = new THREE.Mesh(
    new THREE.TorusGeometry(0.58, 0.052, 8, 20).rotateX(Math.PI / 2 + 0.19),
    charMetalMat
  );
  mangledCarousel.position.set(0.05, 0.09, -0.04);
  turretRingWell.add(ringWall, ringCollar, mangledCarousel);

  // 12 outward-peeled jagged steel armor petals & 8 twisted internal structural ribs
  const petalGeo = new THREE.BoxGeometry(0.26, 0.032, 0.24);
  const ribGeo = new THREE.BoxGeometry(0.06, 0.34, 0.07);
  for (let i = 0; i < 12; i++) {
    const ang = (i / 12) * Math.PI * 2 + (i % 3) * 0.08;
    const r = 0.97 + (i % 2) * 0.04;
    const petal = new THREE.Mesh(petalGeo, charMetalMat);
    petal.position.set(Math.cos(ang) * r, 0.09 + (i % 3) * 0.025, Math.sin(ang) * r);
    petal.rotation.y = -ang + Math.PI / 2;
    petal.rotation.x = -0.45 - (i % 4) * 0.16; // Bent outward by internal blast
    petal.rotation.z = ((i % 3) - 1) * 0.18;
    turretRingWell.add(petal);
  }
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2 + 0.22;
    const r = 0.42 + (i % 3) * 0.16;
    const rib = new THREE.Mesh(ribGeo, charMetalMat);
    rib.position.set(Math.cos(ang) * r, 0.11, Math.sin(ang) * r);
    rib.rotation.set((i % 2 ? 0.38 : -0.42), ang, (i % 3 - 1) * 0.35);
    turretRingWell.add(rib);
  }

  // 5. Rear Engine Deck Penetration Breach (Exposed on Engine Kill or Cook-Off)
  const engineBreachWell = new THREE.Group();
  engineBreachWell.position.set(0, 1.226, 1.68);
  engineBreachWell.visible = false;
  root.add(engineBreachWell);

  const engVoid = new THREE.Mesh(new THREE.CircleGeometry(0.58, 20).rotateX(-Math.PI / 2), abyssVoidMat);
  engVoid.scale.set(1.22, 1, 0.86);
  const engEmber = new THREE.Mesh(new THREE.CircleGeometry(0.36, 16).rotateX(-Math.PI / 2), emberGlowMat);
  engEmber.scale.set(1.18, 1, 0.80);
  engEmber.position.y = 0.004;
  engineBreachWell.add(engVoid, engEmber);
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2 + 0.15;
    const shard = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.03, 0.14), charMetalMat);
    shard.position.set(Math.cos(ang) * 0.56, 0.08, Math.sin(ang) * 0.42);
    shard.rotation.set(0.52 * Math.sin(ang), -ang, 0.48 * Math.cos(ang));
    engineBreachWell.add(shard);
  }

  // 6. Dynamic Battle-Damage Group (Impact craters, broken track links, persistent wreck fire)
  const damageGroup = new THREE.Group();
  root.add(damageGroup);

  const markings = document.createElement('canvas');
  markings.width = 128;
  markings.height = 64;
  const markingCtx = markings.getContext('2d');
  markingCtx.fillStyle = '#dad9bb';
  markingCtx.font = 'bold 50px monospace';
  markingCtx.textAlign = 'center';
  markingCtx.textBaseline = 'middle';
  markingCtx.fillText(number,64,34);
  const markingTexture = new THREE.CanvasTexture(markings);
  markingTexture.encoding = THREE.sRGBEncoding;
  const markingMat = new THREE.MeshStandardMaterial({
    map:markingTexture,transparent:true,depthWrite:false,roughness:.88
  });
  const markingPlane = new THREE.PlaneGeometry(.68,.34);
  for (const side of [-1,1]) {
    const marking = detail(turretGroup,markingPlane,markingMat,side * 1.137,.12,.79);
    marking.rotation.y = side * Math.PI / 2;
    marking.userData.visualOnly = true;
  }

  root.add(turretGroup);
  root.traverse((part) => {
    if (part.isMesh) part.receiveShadow = true;
  });

  return {
    root,
    turretGroup,
    hull,
    glacis,
    armorMat,
    trackMat,
    barrel,
    fumeExtractor,
    antennaMesh,
    cupola,
    cupolaHatch,
    skirts,
    stowageBoxes,
    deckTiles,
    engineVents,
    wheelGroups,
    turretRingWell,
    emberBed,
    emberHotCore,
    engineBreachWell,
    damageGroup,
    camouflageCanvas: camouflage,
    camouflageCtx: paint,
    camouflageTexture,
    rollWheels
  };
}

function buildTankThermalSignature(tankRoot, plumeMap) {
  const group = new THREE.Group();
  group.visible = false;
  group.userData.visualOnly = true;
  tankRoot.add(group);
  const warm = new THREE.MeshBasicMaterial({
    color:0xc8c4be,map:plumeMap,transparent:true,depthWrite:false,toneMapped:false
  });
  const hot = new THREE.MeshBasicMaterial({color:0xfff8ec,toneMapped:false});
  const deck = vehiclePart(group,new THREE.PlaneGeometry(1.68,1.38),warm,0,1.292,1.76);
  deck.rotation.x = -Math.PI / 2;
  deck.userData.visualOnly = true;
  const exhaust = vehiclePart(group,new THREE.BoxGeometry(.23,.11,.06),hot,-.86,.81,2.53);
  exhaust.userData.visualOnly = true;

  const puffs = Array.from({length:5},() => {
    const material = new THREE.SpriteMaterial({
      map:plumeMap,color:0xfff3df,transparent:true,depthWrite:false,toneMapped:false
    });
    const sprite = new THREE.Sprite(material);
    group.add(sprite);
    return sprite;
  });
  return {group,warm,exhaust,puffs};
}

function updateTankThermalSignature(tank, elapsed) {
  const signature = tank.thermal;
  const heat = tank.destroyed ? Math.exp(-Math.max(0,elapsed-(tank.stoppedAt ?? elapsed))/16) : 1;
  signature.group.visible = state.sensorMode === 'flir_white' && heat > .04;
  if (!signature.group.visible) return;
  signature.warm.opacity = heat * .84;
  signature.exhaust.visible = !tank.destroyed;
  signature.puffs.forEach((puff,i) => {
    const age = (elapsed*.85 + i/signature.puffs.length) % 1;
    puff.position.set(-.86 - age*.42,.82 + age*.61,2.59 + age*1.4);
    puff.scale.setScalar(.28 + age*1.12);
    puff.visible = !tank.destroyed;
    puff.material.opacity = (1-age)**2*.32;
  });
}

function buildRadarThermalSignature(radarRoot, plumeMap) {
  const group = new THREE.Group();
  group.visible = false;
  group.userData.visualOnly = true;
  radarRoot.add(group);

  const warm = new THREE.MeshBasicMaterial({
    color: 0xe2e8f0,
    map: plumeMap,
    transparent: true,
    depthWrite: false,
    toneMapped: false
  });
  const hot = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });

  // Electronics cabinet heat glow on front & top
  const cabinetHeat = vehiclePart(group, new THREE.PlaneGeometry(2.3, 1.1), warm, 0, 0.92, 1.52);
  cabinetHeat.userData.visualOnly = true;

  // Generator exhaust port on rear
  const exhaust = vehiclePart(group, new THREE.BoxGeometry(0.24, 0.24, 0.08), hot, -0.95, 0.85, -0.78);
  exhaust.userData.visualOnly = true;

  // Transmitter horn heat
  const feedHeat = vehiclePart(group, new THREE.BoxGeometry(0.18, 0.18, 0.25), hot, 0, 2.68, 0.55);
  feedHeat.userData.visualOnly = true;

  const puffs = Array.from({ length: 4 }, () => {
    const mat = new THREE.SpriteMaterial({
      map: plumeMap,
      color: 0xfff8ee,
      transparent: true,
      depthWrite: false,
      toneMapped: false
    });
    const sprite = new THREE.Sprite(mat);
    group.add(sprite);
    return sprite;
  });

  return { group, warm, exhaust, feedHeat, puffs };
}

function updateRadarThermalSignature(radar, elapsed) {
  if (!radar || !radar.thermal) return;
  const sig = radar.thermal;
  const heat = radar.destroyed ? Math.exp(-Math.max(0, elapsed - (radar.stoppedAt ?? elapsed)) / 16) : 1;
  sig.group.visible = state.sensorMode === 'flir_white' && heat > 0.04;
  if (!sig.group.visible) return;
  sig.warm.opacity = heat * 0.82;
  sig.exhaust.visible = !radar.destroyed;
  sig.feedHeat.visible = !radar.destroyed;
  sig.puffs.forEach((puff, i) => {
    const age = (elapsed * 0.75 + i / sig.puffs.length) % 1;
    puff.position.set(-0.95, 0.95 + age * 1.8, -0.78 - age * 0.35);
    puff.scale.setScalar(0.35 + age * 1.25);
    puff.visible = !radar.destroyed;
    puff.material.opacity = (1 - age) ** 2 * 0.35;
  });
}

function createMilitaryCamoTexture(baseHex, patch1Hex, patch2Hex, stencilText = '') {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 256, 256);

  const blobs = [
    [patch1Hex, 42, 58, 72, 34, 0.42],
    [patch1Hex, 178, 142, 84, 38, -0.35],
    [patch1Hex, 115, 224, 66, 29, 0.28],
    [patch2Hex, 134, 44, 62, 26, -0.52],
    [patch2Hex, 56, 168, 68, 30, 0.61],
    [patch2Hex, 214, 210, 58, 25, -0.44]
  ];
  for (const [col, x, y, w, h, ang] of blobs) {
    ctx.fillStyle = col;
    for (const dx of [-256, 0, 256]) {
      for (const dy of [-256, 0, 256]) {
        ctx.save();
        ctx.translate(x + dx, y + dy);
        ctx.rotate(ang);
        ctx.beginPath();
        ctx.moveTo(-w, 0);
        ctx.bezierCurveTo(-w, -h, -w * 0.2, -h * 1.1, w * 0.35, -h * 0.85);
        ctx.bezierCurveTo(w * 1.05, -h * 0.5, w * 0.95, h * 0.6, w * 0.4, h * 0.9);
        ctx.bezierCurveTo(-w * 0.25, h * 1.15, -w * 0.85, h * 0.7, -w, 0);
        ctx.fill();
        ctx.restore();
      }
    }
  }
  // Subtle panel seam lines & rivet weathering
  ctx.strokeStyle = 'rgba(18, 22, 16, 0.36)';
  ctx.lineWidth = 2;
  ctx.strokeRect(6, 6, 244, 244);
  ctx.beginPath();
  ctx.moveTo(128, 0);
  ctx.lineTo(128, 256);
  ctx.stroke();

  if (stencilText) {
    ctx.fillStyle = '#e5c453';
    ctx.font = 'bold 20px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(stencilText, 128, 42);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.encoding = THREE.sRGBEncoding;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return { canvas, ctx, tex };
}

function createHazardStripeMaterial() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#d99b16';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#1c1d1a';
  for (let i = -128; i < 256; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 16, 0);
    ctx.lineTo(i - 48, 128);
    ctx.lineTo(i - 64, 128);
    ctx.closePath();
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.encoding = THREE.sRGBEncoding;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.78, metalness: 0.18 });
}

function createRadarMesh() {
  const root = new THREE.Group();

  // Authentic Military Materials: 3-Color NATO Woodland Camo, Gunmetal Truss, Composite Tan Radome & Open Mesh Grid
  const camoData = createMilitaryCamoTexture('#3d4e36', '#65543e', '#222821', 'SAM-RADAR 36D6');
  const cabinetMat = new THREE.MeshStandardMaterial({ map: camoData.tex, roughness: 0.80, metalness: 0.22 });
  const concreteMat = new THREE.MeshStandardMaterial({ color: 0x7b7c72, roughness: 0.94 });
  const darkConcreteMat = new THREE.MeshStandardMaterial({ color: 0x565850, roughness: 0.96 });
  const gunmetalMat = new THREE.MeshStandardMaterial({ color: 0x333b35, metalness: 0.62, roughness: 0.48 });
  const oliveSteelMat = new THREE.MeshStandardMaterial({ color: 0x4b5744, metalness: 0.48, roughness: 0.56 });
  const radomeTanMat = new THREE.MeshStandardMaterial({ color: 0xc8b892, roughness: 0.58, metalness: 0.08 });
  const hazardMat = createHazardStripeMaterial();

  // See-through Perforated Metallic Parabolic Radar Grid Texture
  const gridCanvas = document.createElement('canvas');
  gridCanvas.width = gridCanvas.height = 256;
  const gCtx = gridCanvas.getContext('2d');
  gCtx.clearRect(0, 0, 256, 256);
  gCtx.fillStyle = 'rgba(84, 94, 76, 0.22)';
  gCtx.fillRect(0, 0, 256, 256);
  gCtx.strokeStyle = '#8b967f';
  gCtx.lineWidth = 3.2;
  for (let y = 0; y <= 256; y += 16) {
    gCtx.beginPath();
    gCtx.moveTo(0, y);
    gCtx.lineTo(256, y);
    gCtx.stroke();
  }
  gCtx.strokeStyle = '#5c6653';
  gCtx.lineWidth = 4.0;
  for (let x = 0; x <= 256; x += 32) {
    gCtx.beginPath();
    gCtx.moveTo(x, 0);
    gCtx.lineTo(x, 256);
    gCtx.stroke();
  }
  // Outer structural frame border
  gCtx.strokeStyle = '#363d34';
  gCtx.lineWidth = 10;
  gCtx.strokeRect(4, 4, 248, 248);
  const gridTex = new THREE.CanvasTexture(gridCanvas);
  gridTex.encoding = THREE.sRGBEncoding;
  const reflectorMat = new THREE.MeshStandardMaterial({
    map: gridTex,
    color: 0x9aa68e,
    metalness: 0.58,
    roughness: 0.42,
    alphaTest: 0.18,
    transparent: true,
    side: THREE.DoubleSide
  });

  // 1. Octagonal Reinforced Concrete Radar Pad & Hazard Safety Curbing
  vehiclePart(root, new THREE.BoxGeometry(6.2, 0.26, 6.0), concreteMat, 0, 0.13, 0, true);
  vehiclePart(root, new THREE.CylinderGeometry(2.45, 2.65, 0.18, 8), darkConcreteMat, 0, 0.32, 0, true);
  for (const side of [-1, 1]) {
    vehiclePart(root, new THREE.BoxGeometry(0.24, 0.12, 5.8), hazardMat, side * 2.95, 0.28, 0);
    vehiclePart(root, new THREE.BoxGeometry(5.6, 0.12, 0.24), hazardMat, 0, 0.28, side * 2.85);
  }

  // 2. Mobile Tactical Radar Electronics Shelter Cabin & 4 Hydraulic Leveling Outrigger Jacks
  vehiclePart(root, new THREE.BoxGeometry(3.1, 0.24, 2.5), gunmetalMat, 0, 0.52, 0.25, true); // Chassis frame
  const mainCabin = vehiclePart(root, new THREE.BoxGeometry(2.85, 1.42, 2.35), cabinetMat, 0, 1.32, 0.25, true);

  // 4 Heavy Hydraulic Leveling Outriggers planted on concrete pad
  const outriggerBeam = new THREE.BoxGeometry(0.65, 0.14, 0.16);
  const outriggerJack = new THREE.CylinderGeometry(0.08, 0.09, 0.62, 10);
  const outriggerPad = new THREE.CylinderGeometry(0.24, 0.28, 0.06, 12);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const ox = sx * 1.72, oz = 0.25 + sz * 1.05;
      const beam = vehiclePart(root, outriggerBeam, gunmetalMat, sx * 1.48, 0.54, oz);
      beam.rotation.z = -sx * 0.18;
      vehiclePart(root, outriggerJack, oliveSteelMat, ox, 0.34, oz);
      vehiclePart(root, outriggerPad, hazardMat, ox, 0.27, oz);
    }
  }

  // HVAC Heat-Exchanger Units, Louver Grilles, Generator Exhaust & Status Control Panel
  vehiclePart(root, new THREE.BoxGeometry(0.92, 0.94, 0.48), oliveSteelMat, 1.65, 1.18, 0.35, true);
  vehiclePart(root, new THREE.BoxGeometry(0.78, 0.82, 0.42), gunmetalMat, -1.62, 1.12, 0.45, true);
  const louverGeo = new THREE.BoxGeometry(0.76, 0.038, 0.06);
  for (let i = 0; i < 8; i++) {
    vehiclePart(root, louverGeo, gunmetalMat, -0.68, 0.82 + i * 0.085, -0.94);
  }
  // Diesel generator vertical exhaust pipe & rain cap on rear left
  vehiclePart(root, new THREE.CylinderGeometry(0.065, 0.065, 1.45, 10), gunmetalMat, -1.18, 1.65, -0.98);
  const ledGreen = new THREE.MeshStandardMaterial({ color: 0x34d399, emissive: 0x10b981, emissiveIntensity: 0.9 });
  const ledAmber = new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xd97706, emissiveIntensity: 0.9 });
  vehiclePart(root, new THREE.BoxGeometry(0.08, 0.08, 0.04), ledGreen, 0.35, 1.52, -0.94);
  vehiclePart(root, new THREE.BoxGeometry(0.08, 0.08, 0.04), ledGreen, 0.52, 1.52, -0.94);
  vehiclePart(root, new THREE.BoxGeometry(0.08, 0.08, 0.04), ledAmber, 0.69, 1.52, -0.94);

  // 3. Elevated Steel Lattice Mast Tower & Maintenance Catwalk Ring
  const mastPostGeo = new THREE.BoxGeometry(0.15, 1.55, 0.15);
  for (const x of [-0.62, 0.62]) {
    for (const z of [-0.42, 0.42]) {
      vehiclePart(root, mastPostGeo, gunmetalMat, x, 2.52, z, true);
    }
  }
  const braceGeo = new THREE.BoxGeometry(0.075, 1.52, 0.075);
  for (const z of [-0.42, 0.42]) {
    vehiclePart(root, braceGeo, oliveSteelMat, 0, 2.52, z).rotation.z = 0.68;
    vehiclePart(root, braceGeo, oliveSteelMat, 0, 2.52, z).rotation.z = -0.68;
  }
  for (const x of [-0.62, 0.62]) {
    vehiclePart(root, braceGeo, oliveSteelMat, x, 2.52, 0).rotation.x = 0.52;
    vehiclePart(root, braceGeo, oliveSteelMat, x, 2.52, 0).rotation.x = -0.52;
  }
  // Circular maintenance catwalk & azimuth slewing ring
  vehiclePart(root, new THREE.CylinderGeometry(1.08, 1.08, 0.08, 16), gunmetalMat, 0, 3.18, 0);
  vehiclePart(root, new THREE.TorusGeometry(1.06, 0.028, 6, 16).rotateX(Math.PI / 2), hazardMat, 0, 3.62, 0);
  vehiclePart(root, new THREE.CylinderGeometry(0.62, 0.72, 0.30, 20), oliveSteelMat, 0, 3.34, 0);

  // 4. Rotating 3D Surveillance & Fire-Control Radar Array (`dishGroup`)
  const dishGroup = new THREE.Group();
  dishGroup.position.y = 3.48;

  // Azimuth turntable yoke & dual hydraulic elevation rams
  vehiclePart(dishGroup, new THREE.CylinderGeometry(0.56, 0.60, 0.22, 18), gunmetalMat, 0, 0.11, 0);
  for (const sx of [-0.36, 0.36]) {
    vehiclePart(dishGroup, new THREE.BoxGeometry(0.18, 0.86, 0.38), oliveSteelMat, sx, 0.56, 0);
  }
  // Rear High-Power Microwave Transmitter Counterweight Pod
  vehiclePart(dishGroup, new THREE.BoxGeometry(0.96, 0.58, 0.82), cabinetMat, 0, 0.78, -0.64, true);
  vehiclePart(dishGroup, new THREE.BoxGeometry(0.72, 0.38, 0.24), gunmetalMat, 0, 0.78, -1.12);

  const antenna = new THREE.Group();
  antenna.position.set(0, 1.08, 0.14);
  antenna.rotation.x = -0.24; // Tilted upward to scan airspace
  dishGroup.add(antenna);

  // Curved Open-Mesh Parabolic Reflector (Truncated Rectangular/Elliptical Military Profile)
  const rimRadius = 2.08;
  const profile = Array.from({ length: 10 }, (_, i) => {
    const t = i / 9;
    return new THREE.Vector2(rimRadius * t, 0.58 * (t * t - 1));
  });
  const bowlGeo = new THREE.LatheGeometry(profile, 36).rotateX(Math.PI / 2);
  // Scale vertically so it has the authentic wide horizontal aspect ratio of a 3D air-surveillance radar!
  bowlGeo.scale(1.12, 0.72, 1.0);
  vehiclePart(antenna, bowlGeo, reflectorMat, 0, 0, 0, true);

  const rimGeo = new THREE.TorusGeometry(rimRadius, 0.045, 8, 36);
  rimGeo.scale(1.12, 0.72, 1.0);
  vehiclePart(antenna, rimGeo, gunmetalMat, 0, 0, 0);

  // 7 Rear Structural Truss Ribs behind the parabolic mesh
  for (let i = -3; i <= 3; i++) {
    const rx = i * 0.58;
    const ribH = Math.sqrt(Math.max(0.1, 1 - (rx / 2.3) ** 2)) * 2.65;
    vehiclePart(antenna, new THREE.BoxGeometry(0.055, ribH, 0.14), gunmetalMat, rx, 0, -0.28);
  }
  vehiclePart(antenna, new THREE.BoxGeometry(4.1, 0.09, 0.16), gunmetalMat, 0, 0, -0.34);

  // Forward Waveguide Feed Boom, Tripod Struts & Dual S/L-Band Feed Horns
  vehiclePart(antenna, new THREE.CylinderGeometry(0.13, 0.18, 0.44, 14).rotateX(Math.PI / 2), oliveSteelMat, 0, 0, 0.86);
  vehiclePart(antenna, new THREE.BoxGeometry(0.34, 0.24, 0.28), radomeTanMat, 0, 0, 1.04); // Dielectric feed window
  const brace = new THREE.CylinderGeometry(0.036, 0.036, 1, 8);
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2 + Math.PI / 4;
    const edge = new THREE.Vector3(Math.cos(angle) * 1.85, Math.sin(angle) * 1.18, -0.14);
    const axis = new THREE.Vector3(0, 0, 0.86).sub(edge);
    const center = edge.addScaledVector(axis, 0.5);
    const strut = vehiclePart(antenna, brace, gunmetalMat, center.x, center.y, center.z);
    strut.scale.y = axis.length();
    strut.quaternion.setFromUnitVectors(up, axis.normalize());
  }

  // Top-Mounted IFF (Identification Friend or Foe) Phased-Array Interrogator Bar Antenna
  const iffGroup = new THREE.Group();
  iffGroup.position.set(0, 1.62, -0.08);
  antenna.add(iffGroup);
  vehiclePart(iffGroup, new THREE.BoxGeometry(2.85, 0.28, 0.18), radomeTanMat, 0, 0, 0, true);
  vehiclePart(iffGroup, new THREE.BoxGeometry(2.92, 0.06, 0.22), gunmetalMat, 0, -0.15, 0);
  for (const sx of [-0.95, 0, 0.95]) {
    vehiclePart(iffGroup, new THREE.BoxGeometry(0.06, 0.34, 0.08), gunmetalMat, sx, -0.26, -0.04);
  }
  // Red Aviation Obstruction Warning Beacon on top of the radar array
  const beaconMat = new THREE.MeshStandardMaterial({
    color: 0xff2222,
    emissive: 0xff1111,
    emissiveIntensity: 1.35,
    roughness: 0.25
  });
  vehiclePart(iffGroup, new THREE.CylinderGeometry(0.055, 0.065, 0.14, 10), beaconMat, 0, 0.22, 0);

  const damageGroup = new THREE.Group();
  root.add(damageGroup);
  root.add(dishGroup);
  return { root, dishGroup, mainCabin, cabinetMat, camoData, damageGroup };
}

function createAmmoDepotMesh(shelter = false) {
  const root = new THREE.Group();

  // Procedural Military Ordnance Stencil Texture for Ammunition Crates
  const crateCanvas = document.createElement('canvas');
  crateCanvas.width = 256;
  crateCanvas.height = 128;
  const cCtx = crateCanvas.getContext('2d');
  cCtx.fillStyle = '#4a5437'; // Authentic Olive-Drab ordnance crate wood
  cCtx.fillRect(0, 0, 256, 128);
  // Horizontal wood plank grooves
  cCtx.fillStyle = 'rgba(20, 24, 15, 0.42)';
  for (let y = 24; y < 128; y += 26) cCtx.fillRect(0, y, 256, 3);
  // Yellow NATO Ordnance Stencil Markings
  cCtx.fillStyle = '#eab308';
  cCtx.font = 'bold 16px "JetBrains Mono", monospace';
  cCtx.fillText('155MM HE M795', 18, 46);
  cCtx.font = 'bold 13px "JetBrains Mono", monospace';
  cCtx.fillText('LOT TW-082  WT 98KG', 18, 72);
  // Orange 1.1 High-Explosive Diamond Placard on crate
  cCtx.save();
  cCtx.translate(212, 54);
  cCtx.rotate(Math.PI / 4);
  cCtx.fillStyle = '#f97316';
  cCtx.fillRect(-18, -18, 36, 36);
  cCtx.strokeStyle = '#111827';
  cCtx.lineWidth = 2.5;
  cCtx.strokeRect(-18, -18, 36, 36);
  cCtx.restore();
  cCtx.fillStyle = '#111827';
  cCtx.font = 'bold 13px monospace';
  cCtx.textAlign = 'center';
  cCtx.fillText('1.1', 212, 58);

  const crateTex = new THREE.CanvasTexture(crateCanvas);
  crateTex.encoding = THREE.sRGBEncoding;
  const crateMat = new THREE.MeshStandardMaterial({ map: crateTex, roughness: 0.86, metalness: 0.08 });
  const earthCrateMat = new THREE.MeshStandardMaterial({ color: 0x6b583e, roughness: 0.88 });
  const palletWoodMat = new THREE.MeshStandardMaterial({ color: 0x9c764c, roughness: 0.92 });
  const strapMat = new THREE.MeshStandardMaterial({ color: 0x262925, roughness: 0.65, metalness: 0.45 });
  const missileTubeMat = new THREE.MeshStandardMaterial({ color: 0x34422c, roughness: 0.68, metalness: 0.32 });
  const yellowBandMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.55 });
  const redBandMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.55 });

  // 1. Palletized High-Explosive Artillery Crates & SAM/ATGM Missile Canister Racks (`wreckPart = 'crate'`)
  const crateGeo = new THREE.BoxGeometry(1.52, 0.78, 1.38);
  const palletGeo = new THREE.BoxGeometry(1.66, 0.14, 1.50);
  const strapGeo = new THREE.BoxGeometry(0.065, 0.81, 1.41);

  for (let i = 0; i < 6; i++) {
    const stackGroup = new THREE.Mesh(crateGeo, i % 2 === 0 ? crateMat : earthCrateMat);
    const col = i % 3;
    const tier = Math.floor(i / 3);
    const rowZ = (i % 2) * 1.75 - 0.85;
    stackGroup.position.set(col * 1.82 - 1.85, 0.52 + tier * 0.92, rowZ);

    // Timber forklift pallet underneath bottom tier
    if (tier === 0) {
      vehiclePart(stackGroup, palletGeo, palletWoodMat, 0, -0.45, 0);
    }
    for (const sx of [-0.48, 0.48]) {
      vehiclePart(stackGroup, strapGeo, strapMat, sx, 0, 0);
    }
    // On upper tier, mount cylindrical SAM/ATGM twin missile launch canisters with yellow HE warhead rings!
    if (tier === 1 && col !== 1) {
      const tubeGeo = new THREE.CylinderGeometry(0.19, 0.19, 1.65, 14).rotateZ(Math.PI / 2);
      const ringGeo = new THREE.CylinderGeometry(0.196, 0.196, 0.08, 14).rotateZ(Math.PI / 2);
      for (const tz of [-0.26, 0.26]) {
        vehiclePart(stackGroup, tubeGeo, missileTubeMat, 0, 0.58, tz);
        vehiclePart(stackGroup, ringGeo, yellowBandMat, -0.45, 0.58, tz);
        vehiclePart(stackGroup, ringGeo, redBandMat, 0.35, 0.58, tz);
      }
    }
    stackGroup.castShadow = true;
    stackGroup.receiveShadow = true;
    stackGroup.userData.wreckPart = 'crate';
    root.add(stackGroup);
  }

  // 2. Color-Coded 200L POL Fuel & Liquid Propellant Drums (`wreckPart = 'drum'`)
  const drumGeo = new THREE.CylinderGeometry(0.42, 0.42, 1.18, 18);
  const hoopGeo = new THREE.CylinderGeometry(0.438, 0.438, 0.045, 18);
  const drumRedMat = new THREE.MeshStandardMaterial({ color: 0x8c281c, metalness: 0.48, roughness: 0.46 });
  const drumOliveMat = new THREE.MeshStandardMaterial({ color: 0x3e4c34, metalness: 0.48, roughness: 0.46 });
  const drumOchreMat = new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.45, roughness: 0.48 });

  for (let j = 0; j < 6; j++) {
    const dMat = j % 3 === 0 ? drumRedMat : (j % 3 === 1 ? drumOliveMat : drumOchreMat);
    const d = new THREE.Mesh(drumGeo, dMat);
    const col = Math.floor(j / 3);
    const row = j % 3;
    d.position.set(2.25 + col * 0.94, 0.59, row * 1.05 - 1.15);
    for (const y of [-0.32, 0.32]) {
      vehiclePart(d, hoopGeo, strapMat, 0, y, 0);
    }
    // Hazard identification band around middle of drum
    vehiclePart(d, new THREE.CylinderGeometry(0.426, 0.426, 0.14, 18), yellowBandMat, 0, 0, 0);
    d.castShadow = true;
    d.receiveShadow = true;
    d.userData.wreckPart = 'drum';
    root.add(d);
  }

  // 3. Hardened Reinforced Concrete & Camo Corrugated Steel Munitions Bunker (`shelter === true`)
  if (shelter) {
    const concrete = new THREE.MeshStandardMaterial({ color: 0x7b7d72, roughness: 0.95 });
    const darkConcrete = new THREE.MeshStandardMaterial({ color: 0x55574f, roughness: 0.96 });
    const camoRoofData = createMilitaryCamoTexture('#45543b', '#63533d', '#282e26');
    const panels = new THREE.MeshStandardMaterial({ map: camoRoofData.tex, roughness: 0.82, metalness: 0.22 });
    const frame = new THREE.MeshStandardMaterial({ color: 0x2f352c, roughness: 0.78, metalness: 0.38 });
    const hazardMat = createHazardStripeMaterial();
    const fireRedMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.55, metalness: 0.25 });

    // Heavy reinforced concrete bunker foundation & rear blast wall with buttresses
    vehiclePart(root, new THREE.BoxGeometry(8.2, 0.22, 7.0), concrete, 0, 0.11, 0, true);
    vehiclePart(root, new THREE.BoxGeometry(7.8, 2.85, 0.36), concrete, 0, 1.52, 3.12, true);
    for (const bx of [-2.8, 0, 2.8]) {
      vehiclePart(root, new THREE.BoxGeometry(0.38, 2.75, 0.55), darkConcrete, bx, 1.48, 3.45, true);
    }

    const sideWall = new THREE.BoxGeometry(0.34, 2.85, 6.4);
    const buttress = new THREE.BoxGeometry(0.42, 2.25, 0.48);
    const roofPanel = new THREE.BoxGeometry(4.15, 0.16, 6.85, 6, 1, 8);
    const rib = new THREE.BoxGeometry(0.055, 0.085, 6.82);

    for (const side of [-1, 1]) {
      vehiclePart(root, sideWall, concrete, side * 3.75, 1.52, 0, true);
      // External sloped concrete blast buttresses along side walls
      for (const bz of [-2.1, 0, 2.1]) {
        const bMesh = vehiclePart(root, buttress, darkConcrete, side * 4.02, 1.18, bz, true);
        bMesh.rotation.z = side * 0.14;
      }
      // Front armored portal columns with yellow-black hazard warning stripes
      vehiclePart(root, new THREE.BoxGeometry(0.38, 2.92, 0.42), frame, side * 3.55, 1.56, -3.08, true);
      vehiclePart(root, new THREE.BoxGeometry(0.41, 1.35, 0.44), hazardMat, side * 3.55, 0.78, -3.08);

      const roof = vehiclePart(root, roofPanel, panels, side * 1.98, 3.22, 0, true);
      roof.rotation.z = -side * 0.13;
      roof.userData.wreckPart = 'roof';
      for (let i = 0; i < 10; i++) {
        const dx = 0.20 + i * 0.385;
        const strip = vehiclePart(root, rib, frame, side * dx, 3.56 - dx * 0.13, 0);
        strip.rotation.z = -side * 0.13;
        strip.userData.visualOnly = true;
      }
    }

    // Front Steel Portal Header Beam & High-Visibility "DANGER 1.1 EXPLOSIVES" Signboard
    vehiclePart(root, new THREE.BoxGeometry(7.45, 0.36, 0.34), frame, 0, 2.92, -3.12, true);

    const signCanvas = document.createElement('canvas');
    signCanvas.width = 512;
    signCanvas.height = 96;
    const sCtx = signCanvas.getContext('2d');
    sCtx.fillStyle = '#1e241e';
    sCtx.fillRect(0, 0, 512, 96);
    sCtx.strokeStyle = '#eab308';
    sCtx.lineWidth = 5;
    sCtx.strokeRect(4, 4, 504, 88);
    // Left & Right Orange 1.1 Explosive Diamonds
    for (const dx of [54, 458]) {
      sCtx.save();
      sCtx.translate(dx, 48);
      sCtx.rotate(Math.PI / 4);
      sCtx.fillStyle = '#f97316';
      sCtx.fillRect(-24, -24, 48, 48);
      sCtx.strokeStyle = '#111827';
      sCtx.lineWidth = 3;
      sCtx.strokeRect(-24, -24, 48, 48);
      sCtx.restore();
      sCtx.fillStyle = '#111827';
      sCtx.font = 'bold 18px monospace';
      sCtx.textAlign = 'center';
      sCtx.fillText('1.1', dx, 54);
    }
    sCtx.fillStyle = '#ef4444';
    sCtx.font = 'bold 26px "Segoe UI", sans-serif';
    sCtx.textAlign = 'center';
    sCtx.fillText('高爆彈藥庫 DANGER EXPLOSIVES', 256, 44);
    sCtx.fillStyle = '#fde047';
    sCtx.font = 'bold 18px "JetBrains Mono", monospace';
    sCtx.fillText('NO SMOKING / 嚴禁煙火 · KEEP CLEAR 50M', 256, 74);

    const signTex = new THREE.CanvasTexture(signCanvas);
    signTex.encoding = THREE.sRGBEncoding;
    const signMat = new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.55 });
    const signMesh = vehiclePart(root, new THREE.PlaneGeometry(3.8, 0.56), signMat, 0, 2.96, -3.30);
    signMesh.userData.visualOnly = true;

    // Rooftop Ventilation Turbines & Interior Explosion-Proof Amber Work Lights
    for (const vx of [-1.4, 1.4]) {
      vehiclePart(root, new THREE.CylinderGeometry(0.24, 0.20, 0.34, 12), frame, vx, 3.68, 0.4);
    }
    const bunkerLightMat = new THREE.MeshStandardMaterial({
      color: 0xffd166,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.95
    });
    for (const lx of [-1.8, 1.8]) {
      vehiclePart(root, new THREE.BoxGeometry(0.45, 0.08, 0.22), bunkerLightMat, lx, 2.76, -0.4);
    }

    // Red Fire-Suppression Sand Drums & Extinguisher Post outside left portal
    for (const fz of [-2.4, -1.6]) {
      vehiclePart(root, new THREE.CylinderGeometry(0.28, 0.28, 0.72, 14), fireRedMat, -4.25, 0.46, fz);
    }
    const threshold = vehiclePart(root, new THREE.BoxGeometry(6.2, 0.045, 0.28), hazardMat, 0, 0.22, -3.22);
    threshold.userData.visualOnly = true;
  }
  return root;
}

function createBombMesh() {
  const group = new THREE.Group();

  // 82mm Modern Air-Drop Modified Mortar Round (O-832DU / NATO 81-82mm hybrid)
  // Axis convention: Local -Z is forward (Nose & Impact Fuze), +Z is rear (Tail Boom & Shroud).
  // 1. Aerodynamic Teardrop Cast-Iron Body (Ogive profile via LatheGeometry)
  const bodyPoints = [
    new THREE.Vector2(0.008, -0.32), // striker needle tip
    new THREE.Vector2(0.022, -0.28), // fuze cone
    new THREE.Vector2(0.038, -0.23), // fuze-body junction
    new THREE.Vector2(0.065, -0.16), // expanding front ogive
    new THREE.Vector2(0.092, -0.06), // shoulder curve
    new THREE.Vector2(0.104, 0.02),  // maximum bourrelet guidance diameter
    new THREE.Vector2(0.100, 0.10),  // cylindrical midsection
    new THREE.Vector2(0.076, 0.18),  // boat-tail taper begins
    new THREE.Vector2(0.046, 0.25),  // narrowing to neck
    new THREE.Vector2(0.026, 0.29),  // tail boom collar
    new THREE.Vector2(0.024, 0.46)   // slender tail boom tube
  ];
  const bodyGeo = new THREE.LatheGeometry(bodyPoints, 22);
  bodyGeo.rotateX(Math.PI / 2); // maps Y to Z: nose (y<0) at -Z, tail boom (y>0) at +Z
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x3d4734, // Olive Drab cast iron
    roughness: 0.72,
    metalness: 0.38
  });
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  group.add(bodyMesh);

  // 2. Nose Striker Needle & Metal Fuze Collar (碰炸引信)
  const strikerGeo = new THREE.CylinderGeometry(0.016, 0.006, 0.07, 12);
  strikerGeo.rotateX(Math.PI / 2);
  const strikerMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.95, roughness: 0.18 });
  const striker = new THREE.Mesh(strikerGeo, strikerMat);
  striker.position.z = -0.34;
  group.add(striker);

  // 3. 3D-Printed Arming Vane / Spinner (解保風輪)
  const vaneGeo = new THREE.CylinderGeometry(0.038, 0.038, 0.016, 8);
  vaneGeo.rotateX(Math.PI / 2);
  const vaneMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.45 }); // Safety orange PLA
  const armingVane = new THREE.Mesh(vaneGeo, vaneMat);
  armingVane.position.z = -0.27;
  group.add(armingVane);

  // 4. Yellow High-Explosive Stencil Band (TNT黃色高爆色環)
  const tntRingGeo = new THREE.CylinderGeometry(0.082, 0.086, 0.035, 22);
  tntRingGeo.rotateX(Math.PI / 2);
  const tntRingMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.65 });
  const tntRing = new THREE.Mesh(tntRingGeo, tntRingMat);
  tntRing.position.z = -0.11;
  group.add(tntRing);

  // 5. Copper Guidance / Driving Band (紫銅定心導帶)
  const copperBandGeo = new THREE.CylinderGeometry(0.105, 0.105, 0.026, 22);
  copperBandGeo.rotateX(Math.PI / 2);
  const copperBandMat = new THREE.MeshStandardMaterial({ color: 0xcd7f32, metalness: 0.88, roughness: 0.28 });
  const copperBand = new THREE.Mesh(copperBandGeo, copperBandMat);
  copperBand.position.z = 0.04;
  group.add(copperBand);

  // 6. 6-Blade Aerodynamic Radial Tail Fins (6片式金屬薄尾翼)
  const finGeo = new THREE.BoxGeometry(0.008, 0.18, 0.13);
  const finMat = new THREE.MeshStandardMaterial({ color: 0x27272a, metalness: 0.8, roughness: 0.5 });
  for (let i = 0; i < 6; i++) {
    const fin = new THREE.Mesh(finGeo, finMat);
    fin.position.z = 0.41;
    fin.rotation.z = (i * Math.PI) / 3;
    group.add(fin);
  }

  // 7. 3D-Printed Circular Air-Drop Shroud Ring (烏克蘭實戰經典空投環形導流罩)
  const shroudGeo = new THREE.CylinderGeometry(0.094, 0.094, 0.075, 22, 1, true);
  shroudGeo.rotateX(Math.PI / 2);
  const shroudMat = new THREE.MeshStandardMaterial({
    color: 0xeb5e28, // High-vis military PLA orange
    roughness: 0.52,
    side: THREE.DoubleSide
  });
  const shroud = new THREE.Mesh(shroudGeo, shroudMat);
  shroud.position.z = 0.41;
  group.add(shroud);

  return group;
}

function buildCCIPMarker() {
  ccipMarkerMesh = new THREE.Group();
  // CCIP is flight symbology, so every component draws above scene geometry.
  ccipMarkerMesh.renderOrder = 1000;

  const ringGeo = new THREE.RingGeometry(2.0, 2.28, 32);
  ringGeo.rotateX(-Math.PI / 2);
  ccipMarkerMat = new THREE.MeshBasicMaterial({
    color: 0xef4444,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.88,
    depthTest: false,
    depthWrite: false,
    fog: false,
    toneMapped: false
  });
  const ring = new THREE.Mesh(ringGeo, ccipMarkerMat);
  ccipMarkerMesh.add(ring);

  ccipLineMat = new THREE.LineBasicMaterial({
    color: 0xef4444, transparent: true, opacity: .88, depthTest: false,
    depthWrite: false, fog: false, toneMapped: false
  });
  const lineGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-3.2, 0, 0), new THREE.Vector3(-1.6, 0, 0),
    new THREE.Vector3(1.6, 0, 0), new THREE.Vector3(3.2, 0, 0),
    new THREE.Vector3(0, 0, -3.2), new THREE.Vector3(0, 0, -1.6),
    new THREE.Vector3(0, 0, 1.6), new THREE.Vector3(0, 0, 3.2)
  ]);
  const lines = new THREE.LineSegments(lineGeo, ccipLineMat);
  ccipMarkerMesh.add(lines);

  const pipGeo = new THREE.CircleGeometry(0.22, 16);
  pipGeo.rotateX(-Math.PI / 2);
  const pip = new THREE.Mesh(pipGeo, ccipMarkerMat);
  ccipMarkerMesh.add(pip);

  scene.add(ccipMarkerMesh);
  ccipMarkerMesh.visible = false;
}

const wildernessRadarSite = { x: -116, z: -182, radius: 14.5, height: 33.8 };
const wildernessDepotSite = { x: 42, z: -248, radius: 15.5, height: 5.8 };
const wildernessRoads = [
  // Access roads end outside the concrete pads; the road material fades at each end.
  [[10,4],[25,-8],[31,-34],[18,-66],[10,-110],[32,-148],[55,-195],[44,-222],[42,-234]],
  [[-65,-110],[10,-110],[65,-110]],
  [[55,-195],[135,-195]],
  [[-34,-110],[-56,-132],[-82,-150],[-102,-166],[wildernessRadarSite.x + 8, wildernessRadarSite.z + 13]]
];
const wildernessSites = [
  {x:0,z:0,radius:18,height:0},
  wildernessRadarSite,
  wildernessDepotSite
];
const wildernessColliders = [];
const wildernessColliderCells = new Map();
const WILDERNESS_COLLIDER_CELL_SIZE = 12;

function wildernessColliderCell(coordinate) {
  return Math.floor(coordinate / WILDERNESS_COLLIDER_CELL_SIZE);
}

function indexWildernessColliders() {
  wildernessColliders.forEach((box, index) => {
    // Include adjacent cells wherever the drone sphere can reach the box.
    const minX = wildernessColliderCell(box.minX - drone.radius);
    const maxX = wildernessColliderCell(box.maxX + drone.radius);
    const minZ = wildernessColliderCell(box.minZ - drone.radius);
    const maxZ = wildernessColliderCell(box.maxZ + drone.radius);
    for (let x = minX; x <= maxX; x++) {
      for (let z = minZ; z <= maxZ; z++) {
        const key = `${x},${z}`;
        if (!wildernessColliderCells.has(key)) wildernessColliderCells.set(key, []);
        wildernessColliderCells.get(key).push(index);
      }
    }
  });
}

function resolveWildernessContacts() {
  let lastIndex = -1;
  let cellX = wildernessColliderCell(drone.pos.x);
  let cellZ = wildernessColliderCell(drone.pos.z);
  let candidates = wildernessColliderCells.get(`${cellX},${cellZ}`);
  for (let i = 0; candidates && i < candidates.length; i++) {
    const index = candidates[i];
    if (index <= lastIndex) continue;
    resolveBoxContact(wildernessColliders[index]);
    lastIndex = index;

    // A collision can push the drone into another cell. Resume in the original
    // collider order so later contacts match the full scan.
    const nextX = wildernessColliderCell(drone.pos.x);
    const nextZ = wildernessColliderCell(drone.pos.z);
    if (nextX !== cellX || nextZ !== cellZ) {
      cellX = nextX;
      cellZ = nextZ;
      candidates = wildernessColliderCells.get(`${cellX},${cellZ}`);
      i = -1;
    }
  }
}
const tacticalTargetColliders = [];
const wildernessBounds = new THREE.Box3();
const WILDERNESS_TERRAIN_SIZE = 700;
const WILDERNESS_TERRAIN_CELLS = 180;
const WILDERNESS_TERRAIN_Z = -140;
const WILDERNESS_ROAD_LIFT = .18;
let wildernessTerrainPositions = null;

function setColliderBounds(collider, bounds) {
  collider.minX = bounds.min.x;
  collider.maxX = bounds.max.x;
  collider.minY = bounds.min.y;
  collider.maxY = bounds.max.y;
  collider.minZ = bounds.min.z;
  collider.maxZ = bounds.max.z;
}

function addWildernessCollider(geometry, matrix, label) {
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const collider = { label };
  setColliderBounds(collider, wildernessBounds.copy(geometry.boundingBox).applyMatrix4(matrix));
  wildernessColliders.push(collider);
}

function wildernessRoadDistance(x, z) {
  let nearest = Infinity;
  for (const road of wildernessRoads) {
    for (let i = 1; i < road.length; i++) {
      const [ax,az] = road[i-1], [bx,bz] = road[i];
      const dx = bx-ax, dz = bz-az;
      const t = THREE.MathUtils.clamp(((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz),0,1);
      nearest = Math.min(nearest,(x-ax-dx*t)**2+(z-az-dz*t)**2);
    }
  }
  return Math.sqrt(nearest);
}

function wildernessHeight(x,z) {
  const west = 30 * Math.exp(-(((x + 117 + 25 * Math.sin(z * .016)) / 57) ** 2));
  const east = 23 * Math.exp(-(((x - 119 + 21 * Math.cos(z * .018)) / 64) ** 2));
  const valley = 2.3 * Math.sin(z * .024) + 1.4 * Math.sin((x + z) * .051);
  const roadCut = 1 - .34 * (1 - THREE.MathUtils.smoothstep(wildernessRoadDistance(x,z),3,18));
  const screenRidge = 13 * Math.exp(-(((x+14)/30)**2 + ((z+33)/10)**2));
  let height = Math.max(-1.5, (west + east) * roadCut + valley + screenRidge);
  for (const site of wildernessSites) {
    const blend = THREE.MathUtils.smoothstep(Math.hypot(x-site.x,z-site.z),site.radius,site.radius+18);
    height = THREE.MathUtils.lerp(site.height,height,blend);
  }
  return height;
}

// ============================================================================
// VEGETATION PROCEDURAL GEOMETRIES & GPU WIND SWAY DYNAMICS
// ============================================================================
const treeWindUniforms = {
  uWindTime: { value: 0 },
  uWindSpeed: { value: 1.0 },
  uWindDir: { value: new THREE.Vector2(1, 0) },
  uGust: { value: 0.0 }
};

function applyTreeWindShader(material, isCanopy = false) {
  if (!material) return material;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = treeWindUniforms.uWindTime;
    shader.uniforms.uWindSpeed = treeWindUniforms.uWindSpeed;
    shader.uniforms.uWindDir = treeWindUniforms.uWindDir;
    shader.uniforms.uGust = treeWindUniforms.uGust;

    shader.vertexShader = `
      uniform float uWindTime;
      uniform float uWindSpeed;
      uniform vec2 uWindDir;
      uniform float uGust;
    ` + shader.vertexShader;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `
      vec4 mvPosition = vec4( transformed, 1.0 );

      #ifdef USE_INSTANCING
        mvPosition = instanceMatrix * mvPosition;
      #endif

      float windH = max(0.0, transformed.y);
      float bendExp = ${isCanopy ? '1.35' : '1.75'};
      float windBend = pow(windH * 0.32, bendExp) * (uWindSpeed * 0.052 + uGust * 0.040);
      float windPhase = uWindTime * (1.15 + uWindSpeed * 0.08) + (mvPosition.x * 0.045 + mvPosition.z * 0.038);
      float windSway = sin(windPhase) * 0.72 + sin(windPhase * 2.14 + 1.2) * 0.28;
      float windFlutter = sin(uWindTime * 4.6 + mvPosition.x * 0.32) * cos(uWindTime * 3.7 + mvPosition.z * 0.32) * (uWindSpeed * 0.016);
      vec2 disp = uWindDir * (windBend * (1.0 + windSway * 0.45) + windFlutter * windH * 0.35);
      mvPosition.x += disp.x;
      mvPosition.z += disp.y;
      mvPosition.y -= length(disp) * 0.16;

      mvPosition = modelViewMatrix * mvPosition;

      gl_Position = projectionMatrix * mvPosition;
      `
    );
  };
  return material;
}

function updateTreeWind(dt) {
  const w = (typeof WEATHER_PROFILES !== 'undefined' && WEATHER_PROFILES[state.weather])
    ? WEATHER_PROFILES[state.weather]
    : { windSpeed: 2.5, gustSpeed: 4.0, windAngle: 0.4 };

  const tNow = performance.now() * 0.001;
  const gustWave = Math.max(0, Math.sin(tNow * 1.15) * 0.45 + Math.cos(tNow * 2.35) * 0.35 + Math.sin(tNow * 3.95) * 0.20);
  const gustSpread = Math.max(0, (w.gustSpeed || w.windSpeed || 0) - (w.windSpeed || 0));
  const instSpeed = (w.windSpeed || 0) + gustWave * gustSpread;
  const wAng = w.windAngle || 0.4;

  treeWindUniforms.uWindTime.value = tNow;
  treeWindUniforms.uWindSpeed.value = instSpeed;
  treeWindUniforms.uWindDir.value.set(Math.cos(wAng), Math.sin(wAng));
  treeWindUniforms.uGust.value = gustWave * gustSpread;
}

function mergeBufferGeometriesSimple(geos) {
  let totalPos = 0, totalIdx = 0;
  for (const g of geos) {
    totalPos += g.attributes.position.count;
    totalIdx += g.index ? g.index.count : g.attributes.position.count;
  }
  const posArr = new Float32Array(totalPos * 3);
  const normArr = new Float32Array(totalPos * 3);
  const uvArr = new Float32Array(totalPos * 2);
  const idxArr = totalPos > 65535 ? new Uint32Array(totalIdx) : new Uint16Array(totalIdx);

  let posOff = 0, idxOff = 0, vertCount = 0;
  for (const g of geos) {
    const pos = g.attributes.position;
    const norm = g.attributes.normal;
    const uv = g.attributes.uv;
    posArr.set(pos.array, posOff * 3);
    if (norm) normArr.set(norm.array, posOff * 3);
    if (uv) uvArr.set(uv.array, posOff * 2);

    if (g.index) {
      for (let i = 0; i < g.index.count; i++) {
        idxArr[idxOff + i] = g.index.array[i] + vertCount;
      }
      idxOff += g.index.count;
    } else {
      for (let i = 0; i < pos.count; i++) {
        idxArr[idxOff + i] = vertCount + i;
      }
      idxOff += pos.count;
    }
    vertCount += pos.count;
    posOff += pos.count;
    g.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normArr, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
  merged.setIndex(new THREE.BufferAttribute(idxArr, 1));
  return merged;
}

function createVolumetricCanopyGeometry() {
  const geos = [];
  // 3 vertical cross-planes at 0, 60, 120 degrees
  for (let a = 0; a < 3; a++) {
    const angle = (a * Math.PI) / 3;
    const plane = new THREE.PlaneGeometry(1.0, 1.0);
    plane.rotateY(angle);
    geos.push(plane);
  }
  // Upper horizontal leaf cap (convex dome)
  const topCap = new THREE.PlaneGeometry(0.92, 0.92);
  topCap.rotateX(-Math.PI / 2);
  topCap.translate(0, 0.28, 0);
  geos.push(topCap);

  // Lower horizontal leaf cap
  const midCap = new THREE.PlaneGeometry(0.85, 0.85);
  midCap.rotateX(Math.PI / 2);
  midCap.translate(0, -0.18, 0);
  geos.push(midCap);

  return mergeBufferGeometriesSimple(geos);
}

function createConiferFoliageGeometry() {
  const geos = [];
  // 4 tiered 8-sided conical branch skirts tapering upwards
  const tiers = [
    { r: 0.62, h: 0.38, y: -0.32 },
    { r: 0.50, h: 0.38, y: -0.06 },
    { r: 0.36, h: 0.38, y: 0.18 },
    { r: 0.20, h: 0.44, y: 0.44 }
  ];
  tiers.forEach((t) => {
    const cone = new THREE.ConeGeometry(t.r, t.h, 8, 1, false);
    cone.translate(0, t.y, 0);
    geos.push(cone);
  });
  // 2 crossed vertical interior needle cards for dense shadow core
  for (let a = 0; a < 2; a++) {
    const card = new THREE.PlaneGeometry(0.85, 1.15);
    card.rotateY((a * Math.PI) / 2 + Math.PI / 4);
    geos.push(card);
  }
  return mergeBufferGeometriesSimple(geos);
}

function createShrubFoliageGeometry() {
  const geos = [];
  for (let a = 0; a < 2; a++) {
    const plane = new THREE.PlaneGeometry(1.3, 0.72);
    plane.rotateY((a * Math.PI) / 2);
    plane.translate(0, 0.36, 0);
    geos.push(plane);
  }
  const top = new THREE.PlaneGeometry(1.1, 1.1);
  top.rotateX(-Math.PI / 2);
  top.translate(0, 0.42, 0);
  geos.push(top);
  return mergeBufferGeometriesSimple(geos);
}

function createWeatheredBoulderGeometry() {
  const geo = new THREE.DodecahedronGeometry(1.0, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i);
    if (vy < -0.15) vy = -0.15 + (vy + 0.15) * 0.28; // flattened underside
    const erosion = 1.0 + 0.24 * Math.sin(vx * 4.1 + vy * 3.3) * Math.cos(vz * 3.7);
    pos.setXYZ(i, vx * erosion * 1.18, vy * erosion * 0.85, vz * erosion * 0.98);
  }
  geo.computeVertexNormals();
  return geo;
}

function* buildWildernessLandscape(group) {
  let seed = 719;
  const random = () => {
    seed = (Math.imul(seed,1664525)+1013904223) >>> 0;
    return seed / 4294967296;
  };
  const canvas = document.createElement('canvas');
  const tileSize = 256;
  canvas.width = canvas.height = tileSize;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#d8ceba';
  ctx.fillRect(0,0,tileSize,tileSize);
  let textureSeed = 1287;
  const detailRandom = () => {
    textureSeed = (Math.imul(textureSeed,1664525)+1013904223) >>> 0;
    return textureSeed / 4294967296;
  };
  for (let i = 0; i < 2600; i++) {
    const x = detailRandom()*tileSize, y = detailRandom()*tileSize;
    const stone = i % 8 === 0;
    const w = stone ? 1.5 + detailRandom()*3.7 : .5 + detailRandom()*1.65;
    const h = w * (.43 + detailRandom()*.45);
    const angle = detailRandom()*Math.PI;
    ctx.fillStyle = stone ? '#7367595e' : i%2 ? '#6d614e32' : '#f8f0dc48';
    ctx.beginPath();
    ctx.ellipse(x,y,w,h,angle,0,Math.PI*2);
    ctx.fill();
    if (stone) {
      ctx.fillStyle = '#f2e6d377';
      ctx.beginPath();
      ctx.ellipse(x-w*.18,y-h*.28,w*.77,h*.55,angle,0,Math.PI*2);
      ctx.fill();
    }
  }
  // Preserve the seeded terrain, road and vegetation layout.
  for (let i = 0; i < 3600 * 5; i++) random();
  const grain = new THREE.CanvasTexture(canvas);
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
  grain.encoding = THREE.sRGBEncoding;
  grain.repeat.set(132,132);
  grain.anisotropy = Math.min(8,renderer.capabilities.getMaxAnisotropy());
  const ground = new THREE.PlaneGeometry(WILDERNESS_TERRAIN_SIZE,WILDERNESS_TERRAIN_SIZE,WILDERNESS_TERRAIN_CELLS,WILDERNESS_TERRAIN_CELLS);
  ground.rotateX(-Math.PI/2);
  ground.translate(0,0,WILDERNESS_TERRAIN_Z);
  const position = ground.attributes.position;
  const colors = [];
  const turf = new THREE.Color(0x63724a), slope = new THREE.Color(0x465b3d);
  const rockFace = new THREE.Color(0x7c7463), valleyShade = new THREE.Color(0x3a4731);
  const soil = new THREE.Color(0x9b825c), gravel = new THREE.Color(0xb19d7c), tint = new THREE.Color();
  for (let i=0;i<position.count;i++) {
    if (i % 128 === 0) yield;
    const x=position.getX(i), z=position.getZ(i), y=wildernessHeight(x,z);
    position.setY(i,y);
    // Compute topographic gradient (dh/dx, dh/dz) for slope steepness, solar aspect & valley AO
    const dhdx = (wildernessHeight(x + 1.5, z) - wildernessHeight(x - 1.5, z)) / 3.0;
    const dhdz = (wildernessHeight(x, z + 1.5) - wildernessHeight(x, z - 1.5)) / 3.0;
    const gradMag = Math.hypot(dhdx, dhdz);
    const steepness = THREE.MathUtils.smoothstep(gradMag, 0.24, 0.72);
    const solarAspect = THREE.MathUtils.clamp((-dhdx * 0.65 - dhdz * 0.45) * 0.22, -0.10, 0.12);
    const valleyAO = THREE.MathUtils.smoothstep(y, -1.2, 6.5) * 0.12 + 0.88;

    const patch = .5+.25*Math.sin(x*.067+z*.035)+.22*Math.cos(z*.076-x*.023);
    const exposedSoil = THREE.MathUtils.smoothstep(
      .55*Math.sin(x*.12+z*.055)+.45*Math.cos(z*.16-x*.083),.20,.88);
    tint.copy(turf).lerp(slope,THREE.MathUtils.clamp(y/35,0,.85))
      .lerp(soil,Math.min(.85,patch*.32+exposedSoil*.51))
      .lerp(rockFace, steepness * 0.68);
    if (y < 4.5) tint.lerp(valleyShade, (1.0 - THREE.MathUtils.clamp((y + 1.5) / 6.0, 0, 1)) * 0.28);
    tint.lerp(gravel,1-THREE.MathUtils.smoothstep(wildernessRoadDistance(x,z),2.8,6.3));
    const clearing = 1 - THREE.MathUtils.smoothstep(Math.hypot(x*.91,z),5.6,10);
    const rutDistance = Math.abs(Math.abs(x) - 2.6);
    const rut = Math.exp(-((rutDistance/.60)**2)) * clearing;
    tint.lerp(soil,clearing*.72);
    const erosion = (.97 + .07 * Math.sin(x * .51 + z * .22) * Math.cos(z * .34) - rut*.19) * valleyAO + solarAspect;
    tint.multiplyScalar((.91+random()*.18) * erosion);
    colors.push(tint.r,tint.g,tint.b);
  }
  wildernessTerrainPositions = position;
  ground.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  ground.computeVertexNormals();
  wildernessLandMat = new THREE.MeshStandardMaterial({map:grain,bumpMap:grain,bumpScale:.095,vertexColors:true,roughness:.95,metalness:.02});
  const land = new THREE.Mesh(ground,wildernessLandMat);
  land.receiveShadow = true;
  group.add(land);

  yield '鋪設戰場道路';
  const pathMaterial = new THREE.MeshStandardMaterial({color:0x947d60,roughness:.94,metalness:.03,vertexColors:true});
  wildernessRoadMat = pathMaterial;
  const roadOffsets = [-3.6,-2.6,-1.8,-1.25,-.7,0,.7,1.25,1.8,2.6,3.6];
  const fadeSize = 64;
  const fade = new Uint8Array(fadeSize * fadeSize * 4);
  for (let y = 0; y < fadeSize; y++) {
    for (let x = 0; x < fadeSize; x++) {
      const edge = Math.min(x,fadeSize-1-x) / (fadeSize-1);
      const end = Math.min(y,fadeSize-1-y) / (fadeSize-1);
      const i = (y * fadeSize + x) * 4;
      fade[i+1] = Math.round(255 * THREE.MathUtils.smoothstep(edge,0,.19) * THREE.MathUtils.smoothstep(end,0,.035));
      fade[i+3] = 255;
    }
  }
  const fadeTexture = new THREE.DataTexture(fade,fadeSize,fadeSize);
  fadeTexture.magFilter = fadeTexture.minFilter = THREE.LinearFilter;
  fadeTexture.needsUpdate = true;
  pathMaterial.alphaMap = fadeTexture;
  pathMaterial.transparent = true;
  pathMaterial.depthWrite = false;
  for (const [roadIndex,road] of wildernessRoads.entries()) {
    const points = new THREE.BufferGeometry();
    const vertices=[], shades=[], triangles=[], roadUvs=[];
    const curve = new THREE.CatmullRomCurve3(road.map(([x,z]) => new THREE.Vector3(x,0,z)));
    const steps = Math.ceil(curve.getLength() / .8);
    const rows = curve.getSpacedPoints(steps);
    for (let i = 0; i < rows.length; i++) {
      const { x, z } = rows[i];
      const previous = rows[Math.max(0, i - 1)];
      const next = rows[Math.min(steps, i + 1)];
      const dx = next.x - previous.x, dz = next.z - previous.z;
      const length = Math.hypot(dx, dz);
      const start = vertices.length / 3;
      for (const offset of roadOffsets) {
        const px = x - dz / length * offset;
        const pz = z + dx / length * offset;
        vertices.push(px, wildernessRoadBaseHeight(px,pz) + WILDERNESS_ROAD_LIFT + roadIndex * .009, pz);
        roadUvs.push((offset + 3.6) / 7.2, i / steps);
        const rut = Math.exp(-(((Math.abs(offset)-1.25)/.43)**2));
        const gravel = .055*Math.sin(px*7.3+pz*6.1)*Math.cos(pz*3.9-px*4.1);
        const damp = .04*Math.sin(px*.62+pz*.44);
        const value = (1-.23*rut-(Math.abs(offset)>3 ? .13 : 0)) * (.94+gravel+damp);
        shades.push(value,value,value);
      }
      if (i > 0) {
        for (let k = 0; k < roadOffsets.length - 1; k++) {
          const a = start - roadOffsets.length + k, b = start + k;
          triangles.push(a,a+1,b,a+1,b+1,b);
        }
      }
    }
    points.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    points.setAttribute('color',new THREE.Float32BufferAttribute(shades,3));
    points.setAttribute('uv',new THREE.Float32BufferAttribute(roadUvs,2));
    points.setIndex(triangles);
    points.computeVertexNormals();
    const path=new THREE.Mesh(points,pathMaterial);
    path.receiveShadow=true;
    path.renderOrder = 1 + roadIndex;
    group.add(path);
  }

  yield '配置植被與岩石';
  const trees = [], stones = [], shrubs = [];
  for (let i = 0; i < 2450; i++) {
    if (i % 128 === 0) yield;
    const x = (random() - .5) * 535, z = 32 - random() * 365;
    const y = wildernessHeight(x, z);
    if (wildernessRoadDistance(x, z) < 7 || wildernessSites.some((site) => Math.hypot(x - site.x, z - site.z) < site.radius + 4)) continue;
    const scale = .48 + random() * 1.27;
    const forest = Math.sin(x * .051 + z * .024) + Math.cos(z * .054 - x * .031);
    if (y > 7 && forest > .04) {
      trees.push([x, y, z, scale]);
    } else {
      // Topographic gradient steepness for natural rock placement on crags and slopes
      const dhdx = (wildernessHeight(x + 1.5, z) - wildernessHeight(x - 1.5, z)) / 3.0;
      const dhdz = (wildernessHeight(x, z + 1.5) - wildernessHeight(x, z - 1.5)) / 3.0;
      const steepness = Math.hypot(dhdx, dhdz);
      // Stones only on rocky ridges or steep slope outcrops (steepness > 0.30 or crest y > 15), NOT flat meadows!
      if ((y > 15 || steepness > 0.30) && (i % 24 === 0)) {
        stones.push([x, y, z, 0.55 + random() * 0.70]);
      } else if (i % 7 === 0) {
        // Natural leafy bushes/shrubs clustered in hollows and forest fringes
        shrubs.push([x, y, z, 0.60 + random() * 0.65]);
      }
    }
  }

  function scatter(positions, geometry, color, height, width, vertical, shadow = false, leafMap = null, colliderLabel = null, barkMap = null, windType = 'none') {
    const material = new THREE.MeshStandardMaterial({
      color, roughness: .96, vertexColors: geometry.hasAttribute('color'),
      map: leafMap || barkMap, bumpMap: barkMap, bumpScale: barkMap ? .055 : 0,
      alphaTest: leafMap ? .44 : 0, side: leafMap ? THREE.DoubleSide : THREE.FrontSide
    });
    if (windType !== 'none') {
      applyTreeWindShader(material, windType === 'canopy');
    }
    const mesh = new THREE.InstancedMesh(geometry, material, positions.length);
    const transform = new THREE.Object3D(), tint = new THREE.Color();
    positions.forEach(([x, y, z, scale], i) => {
      transform.position.set(x, y + height * scale, z);
      transform.scale.set(width * scale, vertical * scale, width * scale);
      transform.rotation.y = random() * Math.PI * 2;
      transform.updateMatrix();
      mesh.setMatrixAt(i, transform.matrix);
      if (colliderLabel) addWildernessCollider(geometry, transform.matrix, colliderLabel);
      tint.setScalar(.68 + random() * .40);
      mesh.setColorAt(i, tint);
    });
    mesh.castShadow = shadow;
    if (shadow) {
      const depthMat = new THREE.MeshDepthMaterial({
        map: leafMap || undefined,
        alphaTest: leafMap ? .44 : 0,
        side: leafMap ? THREE.DoubleSide : THREE.FrontSide,
        depthPacking: THREE.RGBADepthPacking
      });
      if (windType !== 'none') {
        applyTreeWindShader(depthMat, windType === 'canopy');
      }
      mesh.customDepthMaterial = depthMat;
    }
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    group.add(mesh);
  }

  const broadleaf = [], conifers = [], sparseTrees = [];
  for (const tree of trees) {
    const [x, y, z] = tree;
    const zone = Math.sin(x * .026 + z * .019) + .38 * Math.cos(z * .049 - x * .022);
    if (y > 13 && zone > .24) conifers.push(tree);
    else if (zone < -.42) sparseTrees.push(tree);
    else broadleaf.push(tree);
  }

  // Bark Texture with deep vertical furrow lines & moss patches
  const barkCanvas = document.createElement('canvas');
  barkCanvas.width = 128;
  barkCanvas.height = 256;
  const bark = barkCanvas.getContext('2d');
  bark.fillStyle = '#5c4837';
  bark.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 180; i++) {
    const x = (i * 67) % 128, y = (i * 109) % 256;
    const length = 22 + i % 52;
    bark.strokeStyle = i % 3 ? 'rgba(28,20,15,0.48)' : 'rgba(175,142,105,0.45)';
    bark.lineWidth = 1.2 + i % 3;
    for (const wrap of [-256, 0, 256]) {
      bark.beginPath();
      bark.moveTo(x, y + wrap);
      bark.quadraticCurveTo(x + Math.sin(i) * 8, y + wrap + length * .55, x + Math.cos(i) * 4, y + wrap + length);
      bark.stroke();
    }
  }
  for (let i = 0; i < 48; i++) {
    bark.fillStyle = i % 3 ? '#9c927b40' : '#4d634255';
    bark.beginPath();
    bark.ellipse((i * 37) % 128, (i * 59) % 256, 1.5 + i % 4, 2.5 + i % 8, .12, 0, Math.PI * 2);
    bark.fill();
  }
  const barkMap = new THREE.CanvasTexture(barkCanvas);
  barkMap.encoding = THREE.sRGBEncoding;

  const lobes = broadleaf.flatMap(([x, y, z, s], i) => {
    const a = i * 2.39996;
    const dx = Math.cos(a) * s * 0.8, dz = Math.sin(a) * s * 0.8;
    return [[x + dx, y + s * .35, z + dz, s * .72], [x - dz, y + s * .85, z + dx, s * .62], [x - dx, y + s * .18, z - dz, s * .82]];
  });

  // Trunks with natural root flare translated so base sits at y = 0
  const broadTrunk = new THREE.CylinderGeometry(.12, .26, 1, 10);
  broadTrunk.translate(0, 0.5, 0);
  const coniferTrunk = new THREE.CylinderGeometry(.06, .20, 1, 9);
  coniferTrunk.translate(0, 0.5, 0);
  const sparseTrunk = new THREE.CylinderGeometry(.07, .18, 1, 9);
  sparseTrunk.translate(0, 0.5, 0);

  scatter(broadleaf, broadTrunk, 0xcec3ae, 0, 1.0, 3.8, true, null, '樹幹', barkMap, 'trunk');
  scatter(conifers, coniferTrunk, 0xaf9c83, 0, 1.0, 5.0, true, null, '樹幹', barkMap, 'trunk');
  scatter(sparseTrees, sparseTrunk, 0xd5c5ab, 0, 1.0, 4.4, true, null, '樹幹', barkMap, 'trunk');

  const branchMat = new THREE.MeshStandardMaterial({ color: 0xb5a78e, map: barkMap, roughness: .95 });
  applyTreeWindShader(branchMat, false);
  const branchMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(.032, .092, 1, 6), branchMat, lobes.length);
  const branchTransform = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0);
  lobes.forEach(([x, y, z, s], i) => {
    const [tx, ty, tz, scale] = broadleaf[Math.floor(i / 3)];
    const from = new THREE.Vector3(tx, ty + scale * (2.35 + i % 3 * .25), tz);
    const to = new THREE.Vector3(x, y + 3.65 * s, z);
    const axis = to.clone().sub(from);
    branchTransform.position.copy(from).addScaledVector(axis, .5);
    branchTransform.scale.set(scale, axis.length(), scale);
    branchTransform.quaternion.setFromUnitVectors(up, axis.normalize());
    branchTransform.updateMatrix();
    branchMesh.setMatrixAt(i, branchTransform.matrix);
  });
  branchMesh.frustumCulled = false;
  branchMesh.castShadow = true;
  const branchDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  applyTreeWindShader(branchDepth, false);
  branchMesh.customDepthMaterial = branchDepth;
  group.add(branchMesh);

  // Dense, crisp ovate leaf canvas texture
  const leafCanvas = document.createElement('canvas');
  leafCanvas.width = leafCanvas.height = 256;
  const leaves = leafCanvas.getContext('2d');
  for (let i = 0; i < 750; i++) {
    const angle = i * 2.39996, radius = Math.sqrt(random());
    const x = 128 + Math.cos(angle) * radius * 116, y = 128 + Math.sin(angle) * radius * 102;
    if (radius > .84 && Math.sin(angle * 7 + radius * 9) > .28) continue;
    const tone = 30 + Math.floor(random() * 34);
    const hue = 86 + random() * 26;
    leaves.fillStyle = `hsl(${hue} 38% ${tone}%)`;
    leaves.beginPath();
    leaves.ellipse(x, y, 3.5 + random() * 5.5, 1.8 + random() * 3.2, angle + random() * 0.4, 0, Math.PI * 2);
    leaves.fill();
    if (i % 3 === 0) {
      leaves.strokeStyle = `hsl(${hue + 4} 42% ${tone + 14}%)`;
      leaves.lineWidth = 1;
      leaves.beginPath();
      leaves.moveTo(x - 2, y - 1);
      leaves.lineTo(x + 2, y + 1);
      leaves.stroke();
    }
  }
  const leafMap = new THREE.CanvasTexture(leafCanvas);
  leafMap.encoding = THREE.sRGBEncoding;

  // Alpine needle canvas texture
  const needleCanvas = document.createElement('canvas');
  needleCanvas.width = needleCanvas.height = 256;
  const needles = needleCanvas.getContext('2d');
  for (let tier = 0; tier < 16; tier++) {
    const y = 28 + tier * 12.5;
    const extent = 15 + tier * 6.5;
    for (const side of [-1, 1]) {
      for (let j = 0; j < 18; j++) {
        const reach = extent * (.38 + j / 26);
        needles.strokeStyle = ['#2a3a1f', '#3a4f2c', '#546d3d', '#6f8a50'][j % 4];
        needles.lineWidth = 1.6 + j % 3;
        needles.beginPath();
        needles.moveTo(128 + side * j * .82, y - 4);
        needles.quadraticCurveTo(128 + side * reach * .62, y + 6, 128 + side * reach, y + 18 + Math.sin(j) * 7);
        needles.stroke();
      }
    }
  }
  const needleMap = new THREE.CanvasTexture(needleCanvas);
  needleMap.encoding = THREE.sRGBEncoding;

  // 3D Volumetric Canopies with Wind Sway
  const broadCanopyGeo = createVolumetricCanopyGeometry();
  const coniferCanopyGeo = createConiferFoliageGeometry();
  const shrubGeo = createShrubFoliageGeometry();

  scatter(broadleaf, broadCanopyGeo, 0xd8e8bf, 3.2, 4.4, 3.9, true, leafMap, '樹冠', null, 'canopy');
  scatter(lobes, broadCanopyGeo, 0xe4f0cb, 3.4, 3.1, 2.7, false, leafMap, '樹冠', null, 'canopy');
  scatter(conifers, coniferCanopyGeo, 0xc2d1a8, 1.6, 3.8, 5.2, true, needleMap, '針葉樹冠', null, 'canopy');
  scatter(sparseTrees, broadCanopyGeo, 0xbfcda0, 2.8, 3.6, 3.2, true, leafMap, '疏葉樹冠', null, 'canopy');

  // Realistic Weathered Mountain Boulders & Leafy Shrubs (Cleaned up giant round stones!)
  function clearOfCanopy(x, z, margin) {
    return !trees.some(([tx, , tz, treeScale]) => {
      const radius = 3.7 * treeScale + margin;
      return (x - tx) ** 2 + (z - tz) ** 2 < radius ** 2;
    });
  }
  const groundStones = stones.filter(([x, , z, scale]) => clearOfCanopy(x, z, .65 * scale));
  const rock = createWeatheredBoulderGeometry();
  rock.computeBoundingBox();
  const rockBase = -rock.boundingBox.min.y * 0.55;
  for (const stone of groundStones) {
    const [x, , z, scale] = stone;
    const edge = 0.5 * scale;
    stone[1] = Math.min(
      wildernessMeshHeight(x, z), wildernessMeshHeight(x - edge, z), wildernessMeshHeight(x + edge, z),
      wildernessMeshHeight(x, z - edge), wildernessMeshHeight(x, z + edge)
    ) + (rockBase - 0.12) * scale;
  }
  scatter(groundStones, rock, 0x5e584c, 0, 0.95, 0.58, true, null, '岩石');
  scatter(shrubs, shrubGeo, 0x768f56, 0.2, 1.4, 0.9, false, leafMap, '灌木', null, 'canopy');

  yield '配置野草與路肩碎石';

  const grass = new THREE.BufferGeometry();
  const blades = [];
  for (let i = 0; i < 7; i++) {
    const angle = i * 2.39996, dx = Math.cos(angle), dz = Math.sin(angle);
    const spread = .045+(i%4)*.035, height = .34+(i%5)*.10;
    const x = dx*spread, z = dz*spread;
    const baseL = [x-dz*.042,0,z+dx*.042], baseR = [x+dz*.042,0,z-dx*.042];
    const midL = [x+dx*.12-dz*.027,height*.61,z+dz*.12+dx*.027];
    const midR = [x+dx*.12+dz*.027,height*.61,z+dz*.12-dx*.027];
    const tip = [x+dx*.32,height,z+dz*.32];
    blades.push(...baseL,...baseR,...midL,...baseR,...midR,...midL,...midL,...midR,...tip);
  }
  grass.setAttribute('position',new THREE.Float32BufferAttribute(blades,3));
  grass.computeVertexNormals();

  const grasses = [], gravelPatches = [];
  function detailClear(x,z) {
    return !wildernessSites.some(site => Math.hypot(x-site.x,z-site.z)<site.radius+1);
  }
  for (const [x,,z,scale] of shrubs) {
    for (let i = 0; i < 4; i++) {
      const angle = i * Math.PI/2 + random();
      const px = x + Math.cos(angle)*(1.1+random()*2);
      const pz = z + Math.sin(angle)*(1.1+random()*2);
      if (detailClear(px,pz) && wildernessRoadDistance(px,pz)>3.9) {
        grasses.push([px,wildernessMeshHeight(px,pz),pz,scale]);
      }
    }
  }
  for (let i = 0; i < 2200; i++) {
    if (i%128 === 0) yield;
    const x = (random()-.5)*510, z = 27-random()*350;
    if (!detailClear(x,z)) continue;
    const roadDistance = wildernessRoadDistance(x,z);
    const y = wildernessMeshHeight(x,z);
    if (roadDistance > 3.8 && roadDistance < 10) {
      gravelPatches.push([x,y,z,.18+random()*.30]);
      if (roadDistance>4.5 && i%3===0) grasses.push([x,y,z,.55+random()*.48]);
    } else if (roadDistance>9 && Math.sin(x*.11+z*.08)+Math.cos(z*.19)>1.13) {
      grasses.push([x,y,z,.52+random()*.63]);
      if (i%4===0) gravelPatches.push([x,y,z,.12+random()*.30]);
    }
  }

  const grassMaterial = new THREE.MeshStandardMaterial({side:THREE.DoubleSide,roughness:1});
  const tufts = new THREE.InstancedMesh(grass,grassMaterial,grasses.length);
  const grassTransform = new THREE.Object3D(), color = new THREE.Color();
  grasses.forEach(([x,y,z,scale],i) => {
    grassTransform.position.set(x,y-.018,z);
    grassTransform.scale.setScalar(scale);
    grassTransform.rotation.y = random()*Math.PI*2;
    grassTransform.updateMatrix();
    tufts.setMatrixAt(i,grassTransform.matrix);
    const dryness = .5+.5*Math.sin(x*.086+z*.13);
    color.setHSL(.22-dryness*.10,.26+random()*.13,.28+random()*.14);
    tufts.setColorAt(i,color);
  });
  tufts.receiveShadow = true;
  tufts.frustumCulled = false;
  group.add(tufts);

  const pebble = new THREE.IcosahedronGeometry(1,0);
  const groundGravel = gravelPatches.filter(([x,,z,scale]) => clearOfCanopy(x,z,.44*scale));
  scatter(groundGravel,pebble,0xa0947b,.08,.44,.17);

}

function dressWildernessSites(group) {
  const concrete = new THREE.MeshStandardMaterial({ color: 0x828378, roughness: 0.94 });
  const darkConcrete = new THREE.MeshStandardMaterial({ color: 0x585a52, roughness: 0.96 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x353b34, roughness: 0.88 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x676f64, roughness: 0.64, metalness: 0.38 });
  const gabion = new THREE.MeshStandardMaterial({ color: 0x86775c, roughness: 0.97 });
  const bermEarth = new THREE.MeshStandardMaterial({ color: 0x586641, roughness: 0.98 });
  const bermSoil = new THREE.MeshStandardMaterial({ color: 0x6b5b43, roughness: 0.98 });
  const hazardMat = createHazardStripeMaterial();
  const c2Camo = createMilitaryCamoTexture('#3f4f38', '#62523d', '#252a23', 'C2-LINK 04');
  const c2Mat = new THREE.MeshStandardMaterial({ map: c2Camo.tex, roughness: 0.82, metalness: 0.18 });
  const beaconRed = new THREE.MeshStandardMaterial({
    color: 0xff2626,
    emissive: 0xff1111,
    emissiveIntensity: 1.25
  });

  function box(material, x, y, z, w, h, d, rotY = 0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    if (rotY) mesh.rotation.y = rotY;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (h >= 1.2 || (y > 2.0 && w > 3.5 && d > 2.5)) {
      const halfW = Math.abs(w * Math.cos(rotY)) * 0.5 + Math.abs(d * Math.sin(rotY)) * 0.5;
      const halfD = Math.abs(w * Math.sin(rotY)) * 0.5 + Math.abs(d * Math.cos(rotY)) * 0.5;
      wildernessColliders.push({
        minX: x - halfW, maxX: x + halfW, minY: y - h / 2, maxY: y + h / 2,
        minZ: z - halfD, maxZ: z + halfD, label: '軍事陣地設施'
      });
    }
    return mesh;
  }

  // =========================================================================
  // SITE A: High-Mountain Crest Air-Defense Radar Station (`wildernessRadarSite`)
  // =========================================================================
  const { x: radarX, z: radarZ, radius: radarR, height: radarH } = wildernessRadarSite;
  // 1. Terraced Reinforced Concrete Summit Bastion & Retaining Base
  box(darkConcrete, radarX, radarH - 0.58, radarZ, radarR * 1.62, 1.05, radarR * 1.54);
  box(concrete, radarX, radarH - 0.06, radarZ, radarR * 1.48, 0.24, radarR * 1.40);

  // 2. Perimeter HESCO Earth-Filled Defensive Gabion Bastions around the Summit Crest
  for (let i = -4; i <= 4; i++) {
    // North crest wall
    const nx = radarX + i * 2.15, nz = radarZ - 8.8;
    box(gabion, nx, radarH + 0.68, nz, 1.95, 1.36, 1.32);
    box(bermSoil, nx, radarH + 1.38, nz, 1.78, 0.08, 1.16);
    // West cliff-side wall
    const wx = radarX - 9.4, wz = radarZ + i * 1.95;
    box(gabion, wx, radarH + 0.68, wz, 1.32, 1.36, 1.82);
    box(bermSoil, wx, radarH + 1.38, wz, 1.16, 0.08, 1.66);
  }
  // East & South HESCO flanks (leaving Southeast tactical road entrance open)
  for (let i = -4; i <= 1; i++) {
    const ex = radarX + 9.4, ez = radarZ + i * 1.95;
    box(gabion, ex, radarH + 0.68, ez, 1.32, 1.36, 1.82);
  }
  for (let i = -4; i <= 0; i++) {
    const sx = radarX + i * 2.15, sz = radarZ + 8.6;
    box(gabion, sx, radarH + 0.68, sz, 1.95, 1.36, 1.32);
  }

  // 3. Camouflaged C2 Command & Control Shelter, Diesel Generator & Telecom Mast
  const c2X = radarX - 5.6, c2Z = radarZ - 5.2;
  box(darkConcrete, c2X, radarH + 0.28, c2Z, 6.2, 0.56, 4.2);
  box(c2Mat, c2X, radarH + 1.56, c2Z, 5.6, 2.15, 3.6);
  box(dark, c2X, radarH + 2.72, c2Z, 5.85, 0.20, 3.85);
  // Rooftop HVAC units & Microwave Data-Link Dish aimed at valley
  box(steel, c2X - 1.4, radarH + 3.05, c2Z, 1.25, 0.48, 1.15);
  box(steel, c2X + 1.2, radarH + 3.02, c2Z - 0.4, 0.95, 0.42, 0.95);
  // Above-ground armored waveguide & power cable bridge from C2 shelter to Radar
  box(dark, radarX - 2.6, radarH + 0.42, radarZ - 2.4, 3.8, 0.22, 0.45, 0.68);
  // Auxiliary Diesel Generator Trailer on East side of summit
  box(c2Mat, radarX + 5.8, radarH + 0.95, radarZ - 4.8, 2.8, 1.65, 1.85);
  box(dark, radarX + 5.8, radarH + 1.84, radarZ - 4.8, 2.95, 0.14, 1.98);
  // Tall Tactical VHF/UHF Whip Antenna Mast & Red Aviation Obstruction Light
  const mastMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.11, 5.8, 10), steel);
  mastMesh.position.set(c2X - 2.2, radarH + 5.4, c2Z - 1.2);
  group.add(mastMesh);
  const mastLight = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), beaconRed);
  mastLight.position.set(c2X - 2.2, radarH + 8.35, c2Z - 1.2);
  group.add(mastLight);

  // Summit Entrance Hazard Bollards
  for (const offset of [0, 1.4, 2.8]) {
    const bx = radarX + 3.2 + offset;
    const bz = radarZ + 8.4;
    box(dark, bx, radarH + 0.42, bz, 0.20, 0.84, 0.20);
    box(hazardMat, bx, radarH + 0.74, bz, 0.22, 0.22, 0.22);
  }

  // =========================================================================
  // SITE B: Reverse-Slope Foothill Defilade Ammunition Depot (`wildernessDepotSite`)
  // =========================================================================
  const { x: depotX, z: depotZ, height: depotH } = wildernessDepotSite;
  // 1. Hardened Concrete Bunker Pad & South Logistics Loading Apron (connecting to supply road)
  box(concrete, depotX, depotH - 0.06, depotZ, 16.5, 0.24, 14.5);
  box(darkConcrete, depotX, depotH - 0.03, depotZ + 8.2, 11.5, 0.20, 6.8); // South truck apron
  for (const lx of [depotX - 3.4, depotX + 3.4]) {
    box(hazardMat, lx, depotH + 0.09, depotZ + 8.2, 0.16, 0.04, 5.4);
  }

  // 2. Three-Sided U-Shaped Earthen Blast Berm / Revetment (馬蹄形防爆土堤與內側 HESCO 防爆牆)
  // North/Rear Berm (shielding rear of bunker at z = depotZ - 6.6)
  box(bermEarth, depotX, depotH + 1.35, depotZ - 6.8, 18.8, 2.85, 3.6);
  box(bermSoil, depotX, depotH + 2.82, depotZ - 6.8, 16.4, 0.22, 1.8);
  // West Berm (x = depotX - 8.4) & East Berm (x = depotX + 8.4) backed into the eastern foothill
  for (const side of [-1, 1]) {
    const bx = depotX + side * 8.4;
    box(bermEarth, bx, depotH + 1.32, depotZ - 0.2, 3.4, 2.75, 14.2);
    box(bermSoil, bx, depotH + 2.74, depotZ - 0.2, 1.7, 0.20, 12.4);
    // Inner HESCO gabion blast wall lining the earthen berm
    for (let k = -3; k <= 2; k++) {
      box(gabion, depotX + side * 6.2, depotH + 0.78, depotZ + k * 1.85, 1.28, 1.56, 1.72);
    }
  }
  for (let k = -3; k <= 3; k++) {
    box(gabion, depotX + k * 1.85, depotH + 0.78, depotZ - 4.7, 1.72, 1.56, 1.28);
  }

  // 3. Dual Tall Lightning Arrestor Masts (雙座防雷避雷針高塔 — 標準彈藥庫防靜電設施)
  for (const side of [-1, 1]) {
    const lx = depotX + side * 7.6;
    const lz = depotZ - 6.2;
    box(darkConcrete, lx, depotH + 3.1, lz, 0.65, 0.65, 0.65);
    const rodMast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.14, 6.4, 8), steel);
    rodMast.position.set(lx, depotH + 6.3, lz);
    rodMast.castShadow = true;
    group.add(rodMast);
    const finial = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.65, 8), steel);
    finial.position.set(lx, depotH + 9.75, lz);
    group.add(finial);
    const warnBulb = new THREE.Mesh(new THREE.SphereGeometry(0.10, 8, 8), beaconRed);
    warnBulb.position.set(lx, depotH + 9.25, lz);
    group.add(warnBulb);
  }

  // 4. Security Guardhouse, Inspection Gate & Ready-Ammo Revetment Bay at South Entrance
  box(c2Mat, depotX - 5.8, depotH + 1.15, depotZ + 8.6, 2.4, 2.3, 2.4);
  box(dark, depotX - 5.8, depotH + 2.38, depotZ + 8.6, 2.65, 0.18, 2.65);
  // Drop-arm security barrier gate across entrance apron
  box(hazardMat, depotX - 4.1, depotH + 0.65, depotZ + 9.2, 0.28, 1.15, 0.28);
  box(hazardMat, depotX - 1.2, depotH + 0.98, depotZ + 9.2, 5.4, 0.11, 0.11);
  // Secondary HESCO Ready-Ammo Bay on East side of apron
  box(gabion, depotX + 6.4, depotH + 0.68, depotZ + 7.8, 3.2, 1.36, 0.95);
  box(gabion, depotX + 7.8, depotH + 0.68, depotZ + 9.2, 0.95, 1.36, 3.2);
}


function* buildWildernessBattlefield() {
  wildernessGroup = new THREE.Group();
  wildernessGroup.name = '野外戰場';

  yield '建立戰場地形';
  yield* buildWildernessLandscape(wildernessGroup);
  yield '部署補給坪與任務目標';
  dressWildernessSites(wildernessGroup);

  const farpGroup = new THREE.Group();
  farpGroup.name = '臨時放飛點';
  const marker = new THREE.BoxGeometry(.36,.15,.34);
  const markerMaterial = new THREE.MeshStandardMaterial({color:0xa49565,roughness:.94});
  for (const x of [-5.6,5.6]) {
    for (const z of [-5.0,5.0]) vehiclePart(farpGroup,marker,markerMaterial,x,.07,z);
  }
  const centerPaint = new THREE.MeshStandardMaterial({color:0xbcb293,roughness:1});
  vehiclePart(farpGroup,new THREE.PlaneGeometry(1.35,.12),centerPaint,0,.025,0).rotation.x = -Math.PI / 2;
  vehiclePart(farpGroup,new THREE.PlaneGeometry(.12,1.35),centerPaint,0,.026,0).rotation.x = -Math.PI / 2;
  const padLight = new THREE.MeshStandardMaterial({
    color: 0xffce7f, emissive: 0xb67328, emissiveIntensity: .75
  });
  for (const x of [-5.6, 5.6]) {
    for (const z of [-5, 5]) {
      vehiclePart(farpGroup, new THREE.BoxGeometry(.24, .055, .22), padLight, x, .17, z);
    }
    vehiclePart(farpGroup, new THREE.PlaneGeometry(.10, 8.8), centerPaint, x, .029, 0).rotation.x = -Math.PI / 2;
  }
  const bench = new THREE.MeshStandardMaterial({ color: 0x596653, roughness: .88 });
  vehiclePart(farpGroup, new THREE.BoxGeometry(2.7, .16, 1.1), bench, -8, .85, -4.8, true);
  for (const x of [-9, -7]) {
    vehiclePart(farpGroup, new THREE.BoxGeometry(.14, .78, .88), bench, x, .43, -4.8, true);
  }
  const cratesStack = createAmmoDepotMesh();
  cratesStack.position.set(-9.6,0,4.5);
  cratesStack.scale.setScalar(.58);
  farpGroup.add(cratesStack);
  wildernessGroup.add(farpGroup);
  farpGroup.updateWorldMatrix(true,true);
  cratesStack.traverse((part) => {
    if (part.isMesh) addWildernessCollider(part.geometry,part.matrixWorld,'放飛點物資');
  });

  // 3. Enemy Tactical Targets Array
  tacticalState.targets = [];
  tacticalState.tanks = [];

  const heatCanvas = document.createElement('canvas');
  heatCanvas.width = heatCanvas.height = 64;
  const heatCtx = heatCanvas.getContext('2d');
  const heat = heatCtx.createRadialGradient(32,32,0,32,32,32);
  heat.addColorStop(0,'rgba(255,255,255,.9)');
  heat.addColorStop(.42,'rgba(255,255,255,.38)');
  heat.addColorStop(1,'rgba(255,255,255,0)');
  heatCtx.fillStyle = heat;
  heatCtx.fillRect(0,0,64,64);
  const plumeMap = new THREE.CanvasTexture(heatCanvas);

  // Target 1: 巡邏重型坦克 Alpha
  const tankA = createTankMesh(0x3d4d35, '21');
  tankA.root.position.set(0, wildernessHeight(0,-110), -110);
  tankA.root.rotation.y = -Math.PI / 2;
  wildernessGroup.add(tankA.root);
  const targetTankA = {
    id: 'tank_alpha',
    type: 'tank',
    name: '巡邏坦克 Alpha',
    mesh: tankA.root,
    turret: tankA.turretGroup,
    armorMat: tankA.armorMat,
    rollWheels: tankA.rollWheels,
    tankParts: tankA,
    turretRingWell: tankA.turretRingWell,
    engineBreachWell: tankA.engineBreachWell,
    damageGroup: tankA.damageGroup,
    thermal: buildTankThermalSignature(tankA.root,plumeMap),
    pos: tankA.root.position,
    radius: 4.2,
    hp: 100,
    maxHp: 100,
    destroyed: false,
    cookOff: false,
    hitCount: 0,
    patrolMinX: -65,
    patrolMaxX: 65,
    patrolDir: 1,
    patrolSpeed: 7.2,
    baseSpeed: 7.2,
    trackDamaged: false
  };
  tacticalState.targets.push(targetTankA);
  tacticalState.tanks.push(targetTankA);
  alignTankToRoad(targetTankA);
  updateTankThermalSignature(targetTankA,0);

  // Target 2: 巡邏重型坦克 Bravo
  const tankB = createTankMesh(0x4b4336, '22');
  tankB.root.position.set(90, wildernessHeight(90,-195), -195);
  tankB.root.rotation.y = Math.PI / 2;
  wildernessGroup.add(tankB.root);
  const targetTankB = {
    id: 'tank_bravo',
    type: 'tank',
    name: '重裝坦克 Bravo',
    mesh: tankB.root,
    turret: tankB.turretGroup,
    armorMat: tankB.armorMat,
    rollWheels: tankB.rollWheels,
    tankParts: tankB,
    turretRingWell: tankB.turretRingWell,
    engineBreachWell: tankB.engineBreachWell,
    damageGroup: tankB.damageGroup,
    thermal: buildTankThermalSignature(tankB.root,plumeMap),
    pos: tankB.root.position,
    radius: 4.2,
    hp: 100,
    maxHp: 100,
    destroyed: false,
    cookOff: false,
    hitCount: 0,
    patrolMinX: 55,
    patrolMaxX: 135,
    patrolDir: -1,
    patrolSpeed: 6.5,
    baseSpeed: 6.5,
    trackDamaged: false
  };
  tacticalState.targets.push(targetTankB);
  tacticalState.tanks.push(targetTankB);
  alignTankToRoad(targetTankB);
  updateTankThermalSignature(targetTankB,0);

  // Target 3: 防空雷達站
  const radar = createRadarMesh();
  radar.root.position.set(wildernessRadarSite.x, wildernessRadarSite.height + .06, wildernessRadarSite.z);
  wildernessGroup.add(radar.root);
  const targetRadar = {
    id: 'radar',
    type: 'radar',
    name: '前線防空引導雷達',
    mesh: radar.root,
    dish: radar.dishGroup,
    armorMat: radar.cabinetMat,
    radarParts: radar,
    thermal: buildRadarThermalSignature(radar.root, plumeMap),
    pos: radar.root.position,
    radius: 4.5,
    hp: 80,
    maxHp: 80,
    destroyed: false
  };
  tacticalState.targets.push(targetRadar);
  updateRadarThermalSignature(targetRadar, 0);

  // Target 4: 前線彈藥庫
  const ammoDepot = createAmmoDepotMesh(true);
  ammoDepot.position.set(wildernessDepotSite.x, wildernessDepotSite.height + .06, wildernessDepotSite.z);
  ammoDepot.rotation.y = Math.PI; // Open bunker portal & hazard signage face South (+Z) toward approach road
  wildernessGroup.add(ammoDepot);
  const targetAmmo = {
    id: 'ammo_depot',
    type: 'ammo',
    name: '前線高爆彈藥庫',
    mesh: ammoDepot,
    pos: ammoDepot.position,
    radius: 5.2,
    hp: 60,
    maxHp: 60,
    destroyed: false
  };
  tacticalState.targets.push(targetAmmo);

  yield '建立戰場碰撞索引';
  indexWildernessColliders();
  scene.add(wildernessGroup);
  applyTimeOfDay(state.timeOfDay);
}

function buildDroneBellyPayload() {
  if (!playerDroneMesh || !playerDroneMesh.root) return;
  dronePayloadGroup = new THREE.Group();
  bellyBombMeshes = [];

  const bracket = new THREE.BoxGeometry(.14, .10, .44);
  const bracketMaterial = new THREE.MeshStandardMaterial({ color: 0x272e29, roughness: .7, metalness: .4 });
  const latchMaterial = new THREE.MeshStandardMaterial({ color: 0x8a9388, roughness: .35, metalness: .85 });
  const clampGeo = new THREE.CylinderGeometry(.02, .02, .08, 8);

  for (const side of [-1, 1]) {
    const x = side * .29;
    // Aerodynamic mounting pylon bracket under belly
    vehiclePart(dronePayloadGroup, bracket, bracketMaterial, x, -.30, .12);
    // Mechanical servo latch & quick-release pin details
    vehiclePart(dronePayloadGroup, clampGeo, latchMaterial, x, -.35, -.02);
    vehiclePart(dronePayloadGroup, clampGeo, latchMaterial, x, -.35, .26);

    const bomb = createBombMesh();
    // Horizontally slung under belly with a subtle 5.5 deg forward-downward rake
    bomb.position.set(x, -.42, .12);
    bomb.rotation.set(-0.095, 0, 0); // nose (-Z) forward and slightly tilted downward
    bomb.scale.setScalar(.68);
    dronePayloadGroup.add(bomb);
    bellyBombMeshes.push(bomb);
  }
  playerDroneMesh.tiltGroup.add(dronePayloadGroup);
  dronePayloadGroup.visible = false;
}

function updateDroneBellyBombs() {
  if (!bellyBombMeshes || bellyBombMeshes.length < 2) return;
  const isTactical = state.gameMode === 'tactical_strike';
  if (dronePayloadGroup) dronePayloadGroup.visible = isTactical;
  if (!isTactical) return;

  bellyBombMeshes[0].visible = tacticalState.bombsRemaining >= 1;
  bellyBombMeshes[1].visible = tacticalState.bombsRemaining >= 2;
}

function computeWindShearMultiplier(agl) {
  const h = Math.max(1.5, agl);
  return THREE.MathUtils.clamp(Math.pow(h / 18.0, 0.16), 0.68, 1.38);
}

function computeGroundEffectFactor(agl) {
  if (agl >= 3.4) return 1.0;
  const zRatio = 1.85 / (4.0 * Math.max(0.55, agl));
  return THREE.MathUtils.clamp(1.0 / (1.0 - zRatio * zRatio), 1.0, 1.28);
}

function sampleCanopyBallisticDrag(px, py, pz) {
  if (!wildernessColliderCells.size) return 1.0;
  const cellX = wildernessColliderCell(px);
  const cellZ = wildernessColliderCell(pz);
  const candidates = wildernessColliderCells.get(`${cellX},${cellZ}`);
  if (!candidates) return 1.0;
  let mult = 1.0;
  for (let i = 0; i < candidates.length; i++) {
    const box = wildernessColliders[candidates[i]];
    if (!box || !box.label || !box.label.includes('樹冠')) continue;
    if (px >= box.minX && px <= box.maxX && py >= box.minY && py <= box.maxY && pz >= box.minZ && pz <= box.maxZ) {
      const density = box.label === '針葉樹冠' ? 3.8 : (box.label === '疏葉樹冠' ? 2.4 : 3.2);
      if (density > mult) mult = density;
    }
  }
  return mult;
}

function getBombAtmosphere() {
  const w = WEATHER_PROFILES[state.weather] || WEATHER_PROFILES.clear;
  const timeSec = performance.now() * 0.001;
  const gustOsc = Math.sin(timeSec * 1.5) * 0.35 + Math.cos(timeSec * 3.7) * 0.25;
  const curWind = (w.windSpeed || 0) + (gustOsc > 0 && w.gustSpeed ? gustOsc * (w.gustSpeed - w.windSpeed) * 0.45 : 0);
  const wAng = w.windAngle || 0.4;
  const wx = Math.cos(wAng) * curWind;
  const wz = Math.sin(wAng) * curWind;
  const wy = -(w.downforce || 0) * 0.5;
  const dragCoeff = 0.0042 * (w.dragMult || 1.0);
  const turbulence = w.turbulence || 0;
  return { wx, wy, wz, dragCoeff, turbulence, windSpeed: curWind, wAng };
}

function nextBombMount() {
  return bellyBombMeshes[Math.max(0, tacticalState.bombsRemaining - 1)];
}

function computeBombReleaseVelocity(spawnPos) {
  const bodyDown = new THREE.Vector3(0, -0.9, 0).applyEuler(
    new THREE.Euler(drone.pitch, drone.yaw, drone.roll, 'YXZ')
  );
  const rX = spawnPos.x - drone.pos.x;
  const rY = spawnPos.y - drone.pos.y;
  const rZ = spawnPos.z - drone.pos.z;
  const wx = drone.pitchRate || 0;
  const wy = drone.yawRate || 0;
  const wz = drone.rollRate || 0;
  const tangX = wy * rZ - wz * rY;
  const tangY = wz * rX - wx * rZ;
  const tangZ = wx * rY - wy * rX;

  return {
    vx: drone.vel.x + bodyDown.x + tangX * 0.45,
    vy: drone.vel.y + bodyDown.y + tangY * 0.45,
    vz: drone.vel.z + bodyDown.z + tangZ * 0.45
  };
}

function evaluateBombAccel(px, py, pz, vx, vy, vz, tSec, env, includeTurbulence, outAcc) {
  const ground = wildernessHeight(px, pz);
  const agl = Math.max(0.5, py - ground);
  const shear = computeWindShearMultiplier(agl);
  const wx = env.wx * shear;
  const wy = env.wy;
  const wz = env.wz * shear;

  const vrx = vx - wx;
  const vry = vy - wy;
  const vrz = vz - wz;
  const vrel = Math.hypot(vrx, vry, vrz);

  const rhoFactor = Math.exp(-Math.max(0, py) / 8500.0);
  const finAlignDrag = vrel < 12.0 ? (1.16 - 0.015 * vrel) : (0.98 + 0.0018 * Math.min(45.0, vrel - 12.0));
  const canopyMult = sampleCanopyBallisticDrag(px, py, pz);
  const kDrag = env.dragCoeff * rhoFactor * finAlignDrag * canopyMult;

  const magnusCoeff = 0.00045 * rhoFactor;
  const magX = -vrz * magnusCoeff * vrel;
  const magZ = vrx * magnusCoeff * vrel;

  let turbX = 0;
  let turbZ = 0;
  if (includeTurbulence && env.turbulence > 0) {
    turbX = Math.sin(tSec * 9.7) * env.turbulence * 0.22;
    turbZ = Math.cos(tSec * 8.3) * env.turbulence * 0.22;
  }

  outAcc.ax = -kDrag * vrel * vrx + magX + turbX;
  outAcc.ay = -9.80665 - kDrag * vrel * vry;
  outAcc.az = -kDrag * vrel * vrz + magZ + turbZ;
}

const _rkAcc1 = { ax: 0, ay: 0, az: 0 };
const _rkAcc2 = { ax: 0, ay: 0, az: 0 };
const _rkAcc3 = { ax: 0, ay: 0, az: 0 };
const _rkAcc4 = { ax: 0, ay: 0, az: 0 };

function stepBombRK4(stateVec, dt, tSec, env, includeTurbulence) {
  const { px, py, pz, vx, vy, vz } = stateVec;
  const halfDt = dt * 0.5;

  evaluateBombAccel(px, py, pz, vx, vy, vz, tSec, env, includeTurbulence, _rkAcc1);

  const px2 = px + vx * halfDt;
  const py2 = py + vy * halfDt;
  const pz2 = pz + vz * halfDt;
  const vx2 = vx + _rkAcc1.ax * halfDt;
  const vy2 = vy + _rkAcc1.ay * halfDt;
  const vz2 = vz + _rkAcc1.az * halfDt;
  evaluateBombAccel(px2, py2, pz2, vx2, vy2, vz2, tSec + halfDt, env, includeTurbulence, _rkAcc2);

  const px3 = px + vx2 * halfDt;
  const py3 = py + vy2 * halfDt;
  const pz3 = pz + vz2 * halfDt;
  const vx3 = vx + _rkAcc2.ax * halfDt;
  const vy3 = vy + _rkAcc2.ay * halfDt;
  const vz3 = vz + _rkAcc2.az * halfDt;
  evaluateBombAccel(px3, py3, pz3, vx3, vy3, vz3, tSec + halfDt, env, includeTurbulence, _rkAcc3);

  const px4 = px + vx3 * dt;
  const py4 = py + vy3 * dt;
  const pz4 = pz + vz3 * dt;
  const vx4 = vx + _rkAcc3.ax * dt;
  const vy4 = vy + _rkAcc3.ay * dt;
  const vz4 = vz + _rkAcc3.az * dt;
  evaluateBombAccel(px4, py4, pz4, vx4, vy4, vz4, tSec + dt, env, includeTurbulence, _rkAcc4);

  const dt6 = dt / 6.0;
  stateVec.px = px + dt6 * (vx + 2.0 * (vx2 + vx3) + vx4);
  stateVec.py = py + dt6 * (vy + 2.0 * (vy2 + vy3) + vy4);
  stateVec.pz = pz + dt6 * (vz + 2.0 * (vz2 + vz3) + vz4);
  stateVec.vx = vx + dt6 * (_rkAcc1.ax + 2.0 * (_rkAcc2.ax + _rkAcc3.ax) + _rkAcc4.ax);
  stateVec.vy = vy + dt6 * (_rkAcc1.ay + 2.0 * (_rkAcc2.ay + _rkAcc3.ay) + _rkAcc4.ay);
  stateVec.vz = vz + dt6 * (_rkAcc1.az + 2.0 * (_rkAcc2.az + _rkAcc3.az) + _rkAcc4.az);
}

const _ccipSimState = { px: 0, py: 0, pz: 0, vx: 0, vy: 0, vz: 0 };

function calculateImpactPoint() {
  const env = getBombAtmosphere();
  const stepDt = 0.035;
  const release = nextBombMount().getWorldPosition(new THREE.Vector3());
  const relVel = computeBombReleaseVelocity(release);

  _ccipSimState.px = release.x;
  _ccipSimState.py = release.y;
  _ccipSimState.pz = release.z;
  _ccipSimState.vx = relVel.vx;
  _ccipSimState.vy = relVel.vy;
  _ccipSimState.vz = relVel.vz;

  const initialY = release.y;
  let prevX = release.x;
  let prevY = release.y;
  let prevZ = release.z;
  let prevGround = wildernessHeight(prevX, prevZ);

  for (let step = 1; step <= 230; step++) {
    const tSec = (step - 1) * stepDt;
    stepBombRK4(_ccipSimState, stepDt, tSec, env, false);

    const ground = wildernessHeight(_ccipSimState.px, _ccipSimState.pz);
    if (_ccipSimState.py <= ground + 0.25) {
      const prevClearance = Math.max(0, prevY - (prevGround + 0.25));
      const curPenetration = (ground + 0.25) - _ccipSimState.py;
      const denom = prevClearance + curPenetration;
      const frac = denom > 0.0001 ? THREE.MathUtils.clamp(prevClearance / denom, 0, 1) : 1.0;

      const hitX = prevX + (_ccipSimState.px - prevX) * frac;
      const hitZ = prevZ + (_ccipSimState.pz - prevZ) * frac;
      const hitGround = wildernessHeight(hitX, hitZ);
      const tti = (step - 1 + frac) * stepDt;
      const fallDist = initialY - (hitGround + 0.15);
      const isArmed = (tti >= 0.55) && (fallDist >= 6.0);
      return { x: hitX, y: hitGround + 0.15, z: hitZ, tti, armed: isArmed, fallDist };
    }

    prevX = _ccipSimState.px;
    prevY = _ccipSimState.py;
    prevZ = _ccipSimState.pz;
    prevGround = ground;
  }
  return null;
}

function dropBomb() {
  if (state.gameMode !== 'tactical_strike' || !state.raceActive || state.countdownActive) return;
  if (tacticalState.bombsDropped >= TACTICAL_BOMB_LIMIT) {
    showAnnouncement('MISSION AMMO EXPENDED', '任務彈藥已用完，請返回臨時放飛點降落。', '#f59e0b');
    return;
  }
  if (tacticalState.bombsRemaining <= 0) {
    showAnnouncement('OUT OF BOMBS', '彈藥已空！請返航臨時放飛點補給', '#ef4444');
    return;
  }

  const mountIndex = Math.max(0, tacticalState.bombsRemaining - 1);
  const mount = bellyBombMeshes[mountIndex];
  const spawnPos = mount.getWorldPosition(new THREE.Vector3());
  const spawnQuat = mount.getWorldQuaternion(new THREE.Quaternion());
  const relVel = computeBombReleaseVelocity(spawnPos);

  tacticalState.bombsRemaining -= 1;
  tacticalState.bombsDropped += 1;

  // Hardcore Release Recoil & Asymmetric CG Unloading Impulse
  drone.vel.y += 0.42;
  drone.rollRate = (drone.rollRate || 0) + (mountIndex === 0 ? 1 : -1) * 0.52;
  drone.pitchRate = (drone.pitchRate || 0) + 0.20;

  audioEngine.playBombRelease();

  const bombMesh = createBombMesh();
  bombMesh.scale.setScalar(.68);
  bombMesh.position.copy(spawnPos);
  bombMesh.quaternion.copy(spawnQuat);
  scene.add(bombMesh);

  tacticalState.activeBombs.push({
    mesh: bombMesh,
    pos: spawnPos.clone(),
    vel: new THREE.Vector3(relVel.vx, relVel.vy, relVel.vz),
    quaternion: spawnQuat.clone(),
    spawnY: spawnPos.y,
    life: 0,
    spinRate: (Math.random() > 0.5 ? 1 : -1) * (2.4 + Math.random() * 1.6),
    spinAngle: 0,
    armed: false
  });

  updateDroneBellyBombs();
  if (tacticalState.bombsDropped === TACTICAL_BOMB_LIMIT) {
    showAnnouncement('MISSION AMMO EXPENDED', '已投放最後一枚，請返回臨時放飛點降落。', '#f59e0b');
    return;
  }
  showAnnouncement('82mm MORTAR AWAY!', `82mm迫擊砲彈已投擲！剩餘：${tacticalState.bombsRemaining} 枚`, '#fbbf24');
}

const _bombStepState = { px: 0, py: 0, pz: 0, vx: 0, vy: 0, vz: 0 };

function updateActiveBombs(dt) {
  if (!tacticalState.activeBombs.length) return;

  const env = getBombAtmosphere();
  const subSteps = Math.max(1, Math.min(8, Math.ceil(dt / 0.018)));
  const subDt = dt / subSteps;

  for (let i = tacticalState.activeBombs.length - 1; i >= 0; i--) {
    const b = tacticalState.activeBombs[i];
    const baseLife = b.life;
    b.life += dt;

    if (b.life > 12.0) {
      disposeWorldObject(b.mesh);
      tacticalState.activeBombs.splice(i, 1);
      continue;
    }

    _bombStepState.px = b.pos.x;
    _bombStepState.py = b.pos.y;
    _bombStepState.pz = b.pos.z;
    _bombStepState.vx = b.vel.x;
    _bombStepState.vy = b.vel.y;
    _bombStepState.vz = b.vel.z;

    for (let s = 0; s < subSteps; s++) {
      stepBombRK4(_bombStepState, subDt, baseLife + s * subDt, env, true);
    }

    b.pos.set(_bombStepState.px, _bombStepState.py, _bombStepState.pz);
    b.vel.set(_bombStepState.vx, _bombStepState.vy, _bombStepState.vz);
    b.mesh.position.copy(b.pos);

    // Full Upgrade Aerodynamics: Pitch-Down Flip, Damped Oscillation Wobble, Axial Roll Spin
    const groundHere = wildernessHeight(b.pos.x, b.pos.z);
    const shearHere = computeWindShearMultiplier(Math.max(0.5, b.pos.y - groundHere));
    const vrx = b.vel.x - env.wx * shearHere;
    const vry = b.vel.y - env.wy;
    const vrz = b.vel.z - env.wz * shearHere;
    const relSpeed = Math.hypot(vrx, vry, vrz);

    if (relSpeed > 0.25) {
      const targetDir = new THREE.Vector3(vrx / relSpeed, vry / relSpeed, vrz / relSpeed);
      // Bomb local -Z points along nose tip/striker in world coordinates
      const currentNose = new THREE.Vector3(0, 0, -1).applyQuaternion(b.quaternion);

      const dot = Math.max(-1.0, Math.min(1.0, currentNose.dot(targetDir)));
      const angle = Math.acos(dot);

      if (angle > 0.001) {
        let rotAxis = new THREE.Vector3().crossVectors(currentNose, targetDir);
        if (rotAxis.lengthSq() < 0.000001) {
          // Antiparallel fallback axis perpendicular to currentNose
          rotAxis = Math.abs(currentNose.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
          rotAxis.cross(currentNose);
        }
        rotAxis.normalize();
        const airTurnSpeed = Math.min(10.0, 3.2 + relSpeed * 0.42);
        const stepAngle = Math.min(angle, airTurnSpeed * dt);
        const deltaQuat = new THREE.Quaternion().setFromAxisAngle(rotAxis, stepAngle);
        b.quaternion.premultiply(deltaQuat);
        b.quaternion.normalize();
      }

      // Post-release aerodynamic wobble & damping oscillation (e^-3.2t)
      const wobbleDecay = Math.exp(-3.2 * b.life);
      if (wobbleDecay > 0.02) {
        const wobblePitch = Math.sin(b.life * 14.0) * 0.18 * wobbleDecay;
        const wobbleYaw = Math.cos(b.life * 11.2) * 0.12 * wobbleDecay;
        const wobbleEuler = new THREE.Euler(wobblePitch, wobbleYaw, 0, 'YXZ');
        const wobbleQuat = new THREE.Quaternion().setFromEuler(wobbleEuler);
        b.mesh.quaternion.copy(b.quaternion).multiply(wobbleQuat);
      } else {
        b.mesh.quaternion.copy(b.quaternion);
      }

      // Axial roll spin around longitudinal axis (-Z)
      b.spinAngle += b.spinRate * dt;
      b.mesh.rotateZ(b.spinAngle);
    }

    const fallDist = b.spawnY - b.pos.y;
    if (!b.armed && b.life >= 0.55 && fallDist >= 6.0) {
      b.armed = true;
    }

    let impacted = b.pos.y <= wildernessHeight(b.pos.x, b.pos.z) + 0.25;
    let hitTarget = null;

    for (const t of tacticalState.targets) {
      if (t.destroyed) continue;
      const dist = Math.hypot(b.pos.x - t.pos.x, b.pos.z - t.pos.z);
      if (dist <= t.radius && b.pos.y <= t.pos.y + 3.5) {
        impacted = true;
        hitTarget = t;
        break;
      }
    }

    if (impacted) {
      if (b.armed) {
        if (triggerExplosionAt(b.pos.x, Math.max(0.1, b.pos.y), b.pos.z, hitTarget)) {
          tacticalState.directHitBombs += 1;
        }
      } else {
        triggerDudAt(b.pos.x, Math.max(0.1, b.pos.y), b.pos.z, fallDist, b.life);
      }
      disposeWorldObject(b.mesh);
      tacticalState.activeBombs.splice(i, 1);
    }
  }
}

let blastTexture;

function getBlastTexture() {
  if (blastTexture) return blastTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  for (let i=0;i<33;i++) {
    const angle=i*2.39996;
    const offset=i===0 ? 0 : 12+(i*17)%26;
    const x=64+Math.cos(angle)*offset, y=64+Math.sin(angle)*offset;
    const radius=14+(i*11)%13;
    const haze=ctx.createRadialGradient(x,y,0,x,y,radius);
    haze.addColorStop(0,'rgba(255,255,255,0.72)');
    haze.addColorStop(.46,'rgba(225,221,214,0.40)');
    haze.addColorStop(1,'rgba(210,205,195,0)');
    ctx.fillStyle=haze;
    ctx.fillRect(x-radius,y-radius,radius*2,radius*2);
  }
  blastTexture=new THREE.CanvasTexture(canvas);
  blastTexture.encoding=THREE.sRGBEncoding;
  return blastTexture;
}

function createBlastEffect(x,y,z,strength) {
  const group=new THREE.Group();
  group.position.set(x,Math.max(y,wildernessHeight(x,z)+.15),z);
  const ground=wildernessHeight(x,z)-group.position.y;
  const weather=WEATHER_PROFILES[state.weather] || WEATHER_PROFILES.clear;
  const driftX=Math.cos(weather.windAngle)*weather.windSpeed*.48;
  const driftZ=Math.sin(weather.windAngle)*weather.windSpeed*.48;
  const particles=[];
  function puff(color,x,y,z,size,life,delay,vx,vy,vz,spread,opacity,additive=false,flatten=1) {
    const material=new THREE.SpriteMaterial({
      color,map:getBlastTexture(),transparent:true,depthWrite:false,opacity:0,
      blending:additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      rotation:flatten<1 ? (Math.random()-.5)*.25 : Math.random()*Math.PI*2
    });
    const sprite=new THREE.Sprite(material);
    sprite.visible=false;
    group.add(sprite);
    particles.push({
      sprite,x,y,z,life,delay,opacity,flatten,
      size:size*strength,spread:spread*strength,vx:vx*strength,vy:vy*strength,vz:vz*strength
    });
  }
  puff(0xffe8ab,0,1,0,5.3,.23,0,0,0,0,18,.95,true);
  for(let i=0;i<9;i++) {
    const angle=i*2.39996, dx=Math.cos(angle), dz=Math.sin(angle);
    puff(i%3===0 ? 0xffd78d : 0xee6d28,dx*.65,.6+i*.15,dz*.65,
      3.7,.48+i*.035,i*.018,dx*5,3+i*.22,dz*5,7,.76);
  }
  for(let i=0;i<12;i++) {
    const angle=i*2.39996, dx=Math.cos(angle), dz=Math.sin(angle);
    puff(i%2===0 ? 0x433c37 : 0x696159,dx*(i%3),1+(i%4)*.48,dz*(i%3),
      3.1+(i%4)*.5,3.4+(i%5)*.43,.09+i*.064,dx*.9+driftX,1.8+i*.19,dz*.9+driftZ,1.85,.73);
    puff(i%2===0 ? 0xa38f6e : 0x8b7960,dx*1.4,ground+.62,dz*1.4,
      3.8,1.85+(i%4)*.16,i*.027,dx*6+driftX*.35,.47,dz*6+driftZ*.35,4.1,.64,false,.45);
  }
  // Dynamic fireball illumination PointLight + expanding Mach-stem shockwave ring
  const flashLight = new THREE.PointLight(0xff9436, 7.5 * strength, 46 * strength, 1.7);
  flashLight.position.set(0, 1.8, 0);
  group.add(flashLight);

  const ringGeo = new THREE.RingGeometry(0.85, 1.15, 32);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffedd5,
    transparent: true,
    opacity: 0.72,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const shockRing = new THREE.Mesh(ringGeo, ringMat);
  shockRing.position.set(0, ground + 0.32, 0);
  group.add(shockRing);

  scene.add(group);
  tacticalState.explosions.push({group,particles,flashLight,shockRing,strength,life:0,maxLife:6});
}

function removeBlastEffect(effect) {
  scene.remove(effect.group);
  for (const {sprite} of effect.particles) sprite.material.dispose();
  if (effect.shockRing) {
    effect.shockRing.geometry.dispose();
    effect.shockRing.material.dispose();
  }
}

function triggerDudAt(x, y, z, fallDist, fallTime) {
  audioEngine.playDudThud();
  createDudBlastEffect(x, y, z);
  showAnnouncement(
    'DUD IMPACT!',
    `安全引信未及解保 (下落 ${fallDist.toFixed(1)}m / ${fallTime.toFixed(2)}s，需≥6m/0.55s)！`,
    '#f59e0b'
  );
}

function createTrackDamageSmoke(x, y, z, patrolDir) {
  const group = new THREE.Group();
  group.position.set(x, Math.max(y, wildernessRoadBaseHeight(x, z) + 0.18), z);
  const particles = [];
  const weather = WEATHER_PROFILES[state.weather] || WEATHER_PROFILES.clear;
  const driftX = Math.cos(weather.windAngle) * weather.windSpeed * 0.45;
  const driftZ = Math.sin(weather.windAngle) * weather.windSpeed * 0.45;

  for (let i = 0; i < 3; i++) {
    const mat = new THREE.SpriteMaterial({
      color: i === 0 ? 0x221f1d : 0x4a433d,
      map: getBlastTexture(),
      transparent: true,
      depthWrite: false, // PREVENTS OCCLUSION OF ROAD & GROUND MESHES
      opacity: 0,
      blending: THREE.NormalBlending,
      rotation: Math.random() * Math.PI * 2
    });
    const sprite = new THREE.Sprite(mat);
    sprite.visible = false;
    group.add(sprite);
    particles.push({
      sprite,
      x: (Math.random() - 0.5) * 0.4,
      y: 0.08 + i * 0.12,
      z: (Math.random() - 0.5) * 0.5,
      size: 0.8 + i * 0.25,
      spread: 1.5,
      life: 1.3 + i * 0.2,
      delay: i * 0.06,
      vx: -patrolDir * 1.1 + driftX,
      vy: 1.1 + i * 0.25,
      vz: (Math.random() - 0.5) * 0.5 + driftZ,
      opacity: 0.52,
      flatten: 1
    });
  }
  scene.add(group);
  tacticalState.explosions.push({ group, particles, life: 0, maxLife: 2.0 });
}

function createDudBlastEffect(x, y, z) {
  const group = new THREE.Group();
  group.position.set(x, Math.max(y, wildernessHeight(x, z) + 0.1), z);
  for (let i = 0; i < 4; i++) {
    const mat = new THREE.SpriteMaterial({
      color: 0x9ca3af,
      map: getBlastTexture(),
      transparent: true,
      depthWrite: false, // PREVENTS DEPTH CUTOUT ARTIFACTS
      opacity: 0.55,
      blending: THREE.NormalBlending
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.8 + i * 0.4, 1.8 + i * 0.4, 1);
    sprite.position.set((Math.random() - 0.5) * 0.8, 0.4 + i * 0.3, (Math.random() - 0.5) * 0.8);
    group.add(sprite);
  }
  wildernessGroup.add(group);
  setTimeout(() => {
    if (group.parent === wildernessGroup) {
      wildernessGroup.remove(group);
      for (const sprite of group.children) sprite.material.dispose();
    }
  }, 1200);
}

function applyTankCamoBattleDamage(tank, localX, localZ, severity, isFatal) {
  const parts = tank.tankParts;
  if (!parts || !parts.camouflageCtx || !parts.camouflageTexture) return;
  const ctx = parts.camouflageCtx;

  if (isFatal) {
    // Heavy carbon-black & heat-oxidized rust patina across the entire hull & turret
    ctx.fillStyle = 'rgba(18, 15, 13, 0.72)';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 28; i++) {
      const bx = (i * 73 + 19) % 256;
      const by = (i * 113 + 41) % 256;
      const br = 22 + (i % 5) * 12;
      const grad = ctx.createRadialGradient(bx, by, 3, bx, by, br);
      if (i % 3 === 0) {
        grad.addColorStop(0, 'rgba(72, 36, 18, 0.75)'); // Heat-blistered oxide rust
        grad.addColorStop(0.55, 'rgba(32, 22, 16, 0.58)');
        grad.addColorStop(1, 'rgba(18, 15, 13, 0)');
      } else {
        grad.addColorStop(0, 'rgba(8, 7, 6, 0.92)'); // Deep black soot char
        grad.addColorStop(0.65, 'rgba(22, 19, 17, 0.64)');
        grad.addColorStop(1, 'rgba(22, 19, 17, 0)');
      }
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Localized blast scorch + shrapnel gouges mapped across hull/turret UVs
  const uBase = THREE.MathUtils.clamp((localX + 1.35) / 2.7, 0.08, 0.92);
  const vBase = THREE.MathUtils.clamp((localZ + 2.5) / 5.0, 0.08, 0.92);
  const centers = [
    [uBase * 256, vBase * 256],
    [((uBase + 0.42) % 1) * 256, ((vBase + 0.31) % 1) * 256],
    [((1 - uBase) * 256), ((vBase * 0.7 + 0.15) * 256)]
  ];
  const baseRadius = (isFatal ? 68 : 38 + severity * 28);
  centers.forEach(([cx, cy], idx) => {
    const r = baseRadius * (idx === 0 ? 1.0 : 0.72);
    const soot = ctx.createRadialGradient(cx, cy, 4, cx, cy, r);
    soot.addColorStop(0, 'rgba(6, 5, 5, 0.95)');
    soot.addColorStop(0.42, 'rgba(24, 18, 14, 0.82)');
    soot.addColorStop(0.75, 'rgba(58, 34, 20, 0.46)');
    soot.addColorStop(1, 'rgba(24, 18, 14, 0)');
    ctx.fillStyle = soot;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // Jagged metallic shrapnel scratches radiating from impact
    ctx.strokeStyle = idx === 0 ? 'rgba(148, 156, 164, 0.55)' : 'rgba(15, 13, 12, 0.78)';
    ctx.lineWidth = 1.8;
    for (let s = 0; s < 10; s++) {
      const ang = s * 0.628 + idx * 1.1;
      const len = r * (0.45 + (s % 3) * 0.25);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * 4, cy + Math.sin(ang) * 4);
      ctx.lineTo(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len);
      ctx.stroke();
    }
  });

  if (tank.armorMat) {
    if (isFatal) {
      tank.armorMat.color.setHex(0x575049);
      tank.armorMat.roughness = 0.96;
      tank.armorMat.metalness = 0.08;
    } else {
      tank.armorMat.color.setHex(0x7c766d);
      tank.armorMat.roughness = Math.min(0.94, tank.armorMat.roughness + 0.08);
    }
  }
  parts.camouflageTexture.needsUpdate = true;
}

function launchTankSubPartDebris(mesh, worldCenter, speed, clearance = 0.14) {
  const clone = mesh.clone();
  mesh.updateWorldMatrix(true, false);
  mesh.matrixWorld.decompose(clone.position, clone.quaternion, clone.scale);
  clone.visible = true;
  clone.castShadow = true;
  wildernessGroup.add(clone);
  const dx = clone.position.x - worldCenter.x;
  const dz = clone.position.z - worldCenter.z;
  const outAng = Math.atan2(dz, dx) + (Math.random() - 0.5) * 0.65;
  tacticalState.debris.push({
    mesh: clone,
    clearance,
    settled: false,
    ownsGeometry: false,
    velocity: new THREE.Vector3(
      Math.cos(outAng) * speed,
      2.1 + Math.random() * 2.2,
      Math.sin(outAng) * speed
    ),
    spin: new THREE.Vector3(
      (Math.random() - 0.5) * 5.2,
      (Math.random() - 0.5) * 4.4,
      (Math.random() - 0.5) * 5.6
    )
  });
}

function addTankImpactCrater(tank, localHit, severity, isFatal) {
  const parts = tank.tankParts;
  if (!parts || !parts.damageGroup) return;

  const craterGroup = new THREE.Group();
  const cx = THREE.MathUtils.clamp(localHit.x, -1.05, 1.05);
  const cz = THREE.MathUtils.clamp(localHit.z, -2.15, 2.15);
  // Place on hull roof (y ~ 1.224) or frontal glacis if z < -1.65
  const onGlacis = cz < -1.68;
  const cy = onGlacis ? 0.96 + (cz + 2.25) * 0.52 : 1.225;
  craterGroup.position.set(cx, cy, cz);
  if (onGlacis) craterGroup.rotation.x = -Math.PI / 6;

  const craterR = isFatal ? 0.52 : (0.30 + severity * 0.16);
  // 1. Outer charred blast soot ring on hull
  const scorchMat = new THREE.MeshBasicMaterial({
    color: 0x0e0c0a,
    transparent: true,
    opacity: 0.9,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3
  });
  const scorchDisc = new THREE.Mesh(new THREE.CircleGeometry(craterR * 2.15, 20).rotateX(-Math.PI / 2), scorchMat);
  craterGroup.add(scorchDisc);

  // 2. Deep pitch-black armor penetration hole
  const holeMat = new THREE.MeshBasicMaterial({
    color: 0x030303,
    polygonOffset: true,
    polygonOffsetFactor: -6,
    polygonOffsetUnits: -6
  });
  const holeDisc = new THREE.Mesh(new THREE.CircleGeometry(craterR, 18).rotateX(-Math.PI / 2), holeMat);
  holeDisc.position.y = 0.003;
  craterGroup.add(holeDisc);

  // 3. Glowing molten steel / internal fire core inside penetration hole
  const glowMat = new THREE.MeshBasicMaterial({
    color: isFatal ? 0xff5400 : 0xd9480f,
    transparent: true,
    opacity: 0.92,
    polygonOffset: true,
    polygonOffsetFactor: -8,
    polygonOffsetUnits: -8
  });
  const glowDisc = new THREE.Mesh(new THREE.CircleGeometry(craterR * 0.54, 14).rotateX(-Math.PI / 2), glowMat);
  glowDisc.position.y = 0.006;
  craterGroup.add(glowDisc);

  // 4. Jagged torn steel petals bent upward around the crater rim
  const tornSteelMat = new THREE.MeshStandardMaterial({
    color: 0x1e1b18,
    roughness: 0.9,
    metalness: 0.38,
    side: THREE.DoubleSide
  });
  const petalCount = isFatal ? 8 : 6;
  for (let i = 0; i < petalCount; i++) {
    const ang = (i / petalCount) * Math.PI * 2 + (i % 2) * 0.2;
    const petal = new THREE.Mesh(new THREE.BoxGeometry(craterR * 0.55, 0.028, craterR * 0.42), tornSteelMat);
    petal.position.set(Math.cos(ang) * craterR * 0.92, 0.045, Math.sin(ang) * craterR * 0.92);
    petal.rotation.y = -ang + Math.PI / 2;
    petal.rotation.x = -0.52 - (i % 3) * 0.18;
    craterGroup.add(petal);
  }

  parts.damageGroup.add(craterGroup);
}

function attachPersistentTankWreckFire(tank) {
  const parts = tank.tankParts;
  if (!parts || !parts.damageGroup || tank.wreckFire) return;

  const fireGroup = new THREE.Group();
  const fireSprites = [];
  // Position fire anchors at turret-ring hole / turret breach and rear engine deck breach
  const anchors = tank.cookOff
    ? [
        { x: 0, y: 1.48, z: -0.2, scale: 2.35 },
        { x: 0.18, y: 1.85, z: -0.15, scale: 1.95 },
        { x: -0.15, y: 1.55, z: 1.65, scale: 1.75 }
      ]
    : [
        { x: 0, y: 1.52, z: 1.62, scale: 2.15 },
        { x: 0.42, y: 2.02, z: 0.22, scale: 1.65 },
        { x: -0.22, y: 1.78, z: -0.35, scale: 1.55 }
      ];

  anchors.forEach((a, idx) => {
    const mat = new THREE.SpriteMaterial({
      map: getBlastTexture(),
      color: idx === 0 ? 0xff7b00 : (idx === 1 ? 0xffb703 : 0xe8590c),
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(a.x, a.y, a.z);
    sprite.scale.set(a.scale, a.scale * 1.25, 1);
    fireGroup.add(sprite);
    fireSprites.push({ sprite, baseX: a.x, baseY: a.y, baseZ: a.z, baseScale: a.scale, phase: idx * 2.1 });
  });

  const wreckLight = new THREE.PointLight(0xff6b1a, 3.6, 19, 1.65);
  wreckLight.position.set(0, 2.3, tank.cookOff ? -0.1 : 1.1);
  fireGroup.add(wreckLight);

  parts.damageGroup.add(fireGroup);
  tank.wreckFire = { group: fireGroup, sprites: fireSprites, light: wreckLight };
}

function inflictTankBattleDamage(tank, worldX, worldY, worldZ, severity, isFatal, isCookOff) {
  const parts = tank.tankParts;
  if (!parts) return;

  tank.mesh.updateWorldMatrix(true, true);
  const worldImpact = new THREE.Vector3(worldX, worldY, worldZ);
  const localHit = tank.mesh.worldToLocal(worldImpact.clone());

  // 1. Paint carbon-black blast scorching & shrapnel scars onto hull/turret camouflage texture
  applyTankCamoBattleDamage(tank, localHit.x, localHit.z, severity, isFatal);

  // 2. Punch 3D jagged armor impact crater + glowing ember core on the hull
  addTankImpactCrater(tank, localHit, severity, isFatal);

  // 3. Rip off nearest side skirts & warp adjacent skirts so side armor visibly shreds
  const availableSkirts = parts.skirts.filter((s) => !s.detached);
  availableSkirts.sort((a, b) => {
    const da = Math.hypot(a.side * 1.84 - localHit.x, a.z - localHit.z);
    const db = Math.hypot(b.side * 1.84 - localHit.x, b.z - localHit.z);
    return da - db;
  });
  const detachSkirtCount = isFatal
    ? (isCookOff ? Math.min(availableSkirts.length, 8) : Math.min(availableSkirts.length, 5))
    : Math.min(availableSkirts.length, Math.max(2, Math.round(severity * 4)));

  for (let i = 0; i < detachSkirtCount; i++) {
    const s = availableSkirts[i];
    s.detached = true;
    s.mesh.visible = false;
    if (s.seamMesh) s.seamMesh.visible = false;
    launchTankSubPartDebris(s.mesh, worldImpact, 2.4 + Math.random() * 2.2, 0.12);
  }
  // Bend/buckle remaining nearby side skirts
  availableSkirts.slice(detachSkirtCount, detachSkirtCount + 4).forEach((s, idx) => {
    s.mesh.rotation.z = s.side * (0.24 + (idx % 2) * 0.18);
    s.mesh.rotation.x = (idx % 2 === 0 ? 1 : -1) * 0.22;
    s.mesh.position.y = 0.91;
  });

  // 4. Skew/cant roadwheels & lay down broken track segment on mobility/hull hit
  if (parts.wheelGroups && parts.wheelGroups.length) {
    const sortedWheels = [...parts.wheelGroups].sort((a, b) => {
      const da = Math.hypot(a.position.x - localHit.x, a.position.z - localHit.z);
      const db = Math.hypot(b.position.x - localHit.x, b.position.z - localHit.z);
      return da - db;
    });
    const wheelDamageCount = isFatal ? 5 : Math.max(2, Math.round(severity * 3));
    for (let i = 0; i < Math.min(wheelDamageCount, sortedWheels.length); i++) {
      const axle = sortedWheels[i];
      const sideSign = axle.position.x < 0 ? -1 : 1;
      axle.rotation.z = sideSign * (0.25 + (i % 3) * 0.11);
      axle.rotation.y = (i % 2 === 0 ? 1 : -1) * 0.18;
      axle.position.y = 0.33;
    }
    if (!tank.brokenTrackRibbonAdded && (tank.trackDamaged || isFatal)) {
      tank.brokenTrackRibbonAdded = true;
      const hitSide = localHit.x < 0 ? -1 : 1;
      const brokenTrackMat = new THREE.MeshStandardMaterial({ color: 0x1c1a17, roughness: 0.94, metalness: 0.28 });
      const brokenRibbon = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.06, 1.95), brokenTrackMat);
      brokenRibbon.position.set(hitSide * 1.62, 0.08, THREE.MathUtils.clamp(localHit.z, -1.4, 1.4));
      brokenRibbon.rotation.set(0.08, hitSide * 0.28, hitSide * 0.16);
      parts.damageGroup.add(brokenRibbon);
    }
  }

  // 5. Blow off ERA deck tiles & turret stowage boxes on heavy or fatal hits
  if (severity >= 0.55 || isFatal) {
    const tileCount = isFatal ? 4 : 2;
    parts.deckTiles.slice(0, tileCount).forEach((tile) => {
      if (tile.visible) {
        tile.visible = false;
        launchTankSubPartDebris(tile, worldImpact, 2.8 + Math.random() * 1.8, 0.08);
      }
    });
    const stowCount = isFatal ? parts.stowageBoxes.length : 1;
    parts.stowageBoxes.slice(0, stowCount).forEach((box) => {
      if (box.visible) {
        box.visible = false;
        launchTankSubPartDebris(box, worldImpact, 2.2 + Math.random() * 1.9, 0.16);
      }
    });
  }

  // 6. Fatal Destruction States: Engine Breach + (Cook-Off Turret Toss OR Burn-Out Slumped Turret)
  if (isFatal) {
    if (parts.engineBreachWell) parts.engineBreachWell.visible = true;
    if (parts.engineVents) {
      parts.engineVents.forEach((v, idx) => {
        if (idx % 2 === 0) v.visible = false;
        else {
          v.rotation.z = (idx % 3 - 1) * 0.38;
          v.rotation.x = 0.45;
          v.position.y = 1.29;
        }
      });
    }

    if (isCookOff) {
      // Catastrophic Carousel Autoloader Cook-Off: Reveal gaping blackened turret-ring abyss in hull!
      if (parts.turretRingWell) parts.turretRingWell.visible = true;
    } else {
      // Penetration & Burn-Out Kill: Turret stays on hull, wrenched off-axis, gun barrel droops, hatch blown open
      tank.turret.visible = true;
      const wrenchSign = localHit.x < 0 ? 1 : -1;
      tank.turret.rotation.y += wrenchSign * (0.34 + Math.random() * 0.22);
      tank.turret.rotation.z = wrenchSign * 0.085;
      tank.turret.rotation.x = 0.055;
      if (parts.barrel) {
        parts.barrel.rotation.x = 0.23; // Slumped main gun barrel (-13 deg downward droop)
        parts.barrel.position.y = -0.34;
      }
      if (parts.fumeExtractor) {
        parts.fumeExtractor.rotation.x = 0.23;
        parts.fumeExtractor.position.y = -0.36;
      }
      if (parts.cupolaHatch) {
        parts.cupolaHatch.rotation.z = -2.1; // Commander hatch blown wide open
      }
      if (parts.antennaMesh) {
        parts.antennaMesh.rotation.z = -1.25;
      }
    }

    attachPersistentTankWreckFire(tank);
  }
}

function createWreckFireSmokePlume(x, y, z, isCookOff) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  const particles = [];
  const weather = WEATHER_PROFILES[state.weather] || WEATHER_PROFILES.clear;
  const driftX = Math.cos(weather.windAngle) * weather.windSpeed * 0.52;
  const driftZ = Math.sin(weather.windAngle) * weather.windSpeed * 0.52;

  // 1Rising orange flame tongue + 3 thick carbon-black oil smoke billows
  const count = isCookOff ? 4 : 3;
  for (let i = 0; i < count; i++) {
    const isFlame = i === 0;
    const mat = new THREE.SpriteMaterial({
      color: isFlame ? (Math.random() < 0.5 ? 0xff7b00 : 0xffaa00) : (i === 1 ? 0x141210 : 0x26221e),
      map: getBlastTexture(),
      transparent: true,
      depthWrite: false,
      opacity: 0,
      blending: isFlame ? THREE.AdditiveBlending : THREE.NormalBlending,
      rotation: Math.random() * Math.PI * 2
    });
    const sprite = new THREE.Sprite(mat);
    sprite.visible = false;
    group.add(sprite);
    particles.push({
      sprite,
      x: (Math.random() - 0.5) * 0.65,
      y: isFlame ? 0.15 : 0.35 + i * 0.25,
      z: (Math.random() - 0.5) * 0.65,
      size: isFlame ? 1.35 : 1.45 + i * 0.45,
      spread: isFlame ? 1.2 : 2.65,
      life: isFlame ? 0.65 : 2.4 + i * 0.45,
      delay: i * 0.05,
      vx: (Math.random() - 0.5) * 0.45 + driftX * (isFlame ? 0.25 : 0.85),
      vy: isFlame ? 2.4 : 2.1 + i * 0.35,
      vz: (Math.random() - 0.5) * 0.45 + driftZ * (isFlame ? 0.25 : 0.85),
      opacity: isFlame ? 0.78 : 0.68,
      flatten: 1
    });
  }
  scene.add(group);
  tacticalState.explosions.push({ group, particles, life: 0, maxLife: 3.4 });
}

function triggerExplosionAt(x, y, z, directHitTarget) {
  audioEngine.playExplosion(directHitTarget ? 1.25 : 0.9);
  createBlastEffect(x,y,z,directHitTarget ? 1.65 : 1.35);

  // Low-Altitude Blast Wave Shockwave on drone
  const distToDrone = Math.hypot(x - drone.pos.x, y - drone.pos.y, z - drone.pos.z);
  if (distToDrone < 18.0) {
    const severity = Math.max(0.15, 1 - distToDrone / 18.0);
    drone.vel.y += 7.5 * severity;
    const pushDirX = (drone.pos.x - x) || (Math.random() - 0.5);
    const pushDirZ = (drone.pos.z - z) || (Math.random() - 0.5);
    const pushDist = Math.hypot(pushDirX, pushDirZ) || 1;
    drone.vel.x += (pushDirX / pushDist) * 6.5 * severity;
    drone.vel.z += (pushDirZ / pushDist) * 6.5 * severity;
    drone.pitch += (Math.random() - 0.5) * 0.7 * severity;
    drone.roll += (Math.random() - 0.5) * 0.7 * severity;

    triggerDamageFlash();
    audioEngine.playShockwaveImpact();
    showAnnouncement(
      'BLAST WAVE IMPACT!',
      `受到近距爆炸氣流衝擊 (距離 ${distToDrone.toFixed(1)}m)！請保持安全投彈高度！`,
      '#ef4444'
    );
  }

  let directHit = false;
  tacticalState.targets.forEach((t) => {
    if (t.destroyed) return;
    const dist = Math.hypot(x - t.pos.x, z - t.pos.z);
    if (dist <= t.radius + 1.5 || t === directHitTarget) {
      if (t.type === 'tank') {
        // Realistic 82mm Air-Drop Mortar vs. Main Battle Tank Armor Mechanics
        t.mesh.updateWorldMatrix(true, true);
        const localHit = t.mesh.worldToLocal(new THREE.Vector3(x, y, z));
        const turretDist = Math.hypot(localHit.x, localHit.z + 0.2);
        const onThinRoofWeakspot =
          Math.abs(localHit.x) <= 1.25 &&
          localHit.z >= -1.38 &&
          localHit.z <= 2.38 &&
          dist <= 2.45;
        const isBullseyeCarouselHit = turretDist <= 1.48 && dist <= 1.95;
        const isDirectHullHit = dist <= 3.85 || t === directHitTarget;

        t.hitCount = (t.hitCount || 0) + 1;
        let dmg = 0;
        if (onThinRoofWeakspot) {
          // 82mm shaped-charge / HE top-attack perforates thin (20-30mm) turret roof or engine deck
          dmg = 100;
          directHit = true;
        } else if (isDirectHullHit) {
          // Direct hit on thick frontal glacis, side skirts, or outer track assembly:
          // Cannot 1-shot kill an MBT or flip its turret on first hit; cripples hull & tracks (62 dmg)
          dmg = 62;
          directHit = true;
        } else {
          // Near-miss fragmentation & blast wave splash (28 - 48 dmg)
          dmg = Math.max(26, Math.round((1 - dist / (t.radius + 1.8)) * 64));
        }

        t.hp = Math.max(0, t.hp - dmg);
        const willDestroy = t.hp <= 0;
        // Turret toss (Carousel Ammo Cook-Off) ONLY occurs if a precision top-attack hit
        // penetrates the central autoloader carousel OR a 2nd lethal hit strikes the turret/hull center!
        if (willDestroy) {
          t.cookOff = isBullseyeCarouselHit || (t.hitCount >= 2 && turretDist <= 1.95);
        }

        const severity = THREE.MathUtils.clamp(dmg / 85, 0.35, 1.0);
        inflictTankBattleDamage(t, x, y, z, severity, willDestroy, t.cookOff);
        addWreckScorchAt(x, z, willDestroy ? 4.4 : 2.8);

        if (willDestroy) {
          destroyTarget(t, x, y, z);
          if (t.cookOff) {
            showAnnouncement(
              'AMMO COOK-OFF!',
              `頂攻貫穿轉盤彈藥架！【${t.name}】內部裝藥引燃大殉爆掀飛砲塔！`,
              '#ef4444'
            );
          } else {
            showAnnouncement(
              'TOP-ARMOR PENETRATED!',
              `頂甲貫穿擊毀！【${t.name}】引擎室與戰鬥室起火焚毀癱瘓！`,
              '#ef4444'
            );
          }
        } else {
          if (!t.trackDamaged) {
            t.trackDamaged = true;
            t.patrolSpeed *= 0.28;
          }
          if (isDirectHullHit) {
            showAnnouncement(
              'ARMOR HIT - CRITICALLY DAMAGED!',
              `命中裝甲！【${t.name}】側裙炸飛、履帶重創冒煙 (殘餘 ${t.hp}%)，需補擊或命中頂甲弱點！`,
              '#f59e0b'
            );
          } else {
            showAnnouncement(
              'TRACK MOBILITY KILL!',
              `近距爆震！【${t.name}】側裙受損、履帶遭破片重創減速 (殘餘 ${t.hp}%)！`,
              '#f59e0b'
            );
          }
        }
      } else {
        const isDirect = dist <= 4.0 || t === directHitTarget;
        const dmg = isDirect ? 100 : Math.round((1 - dist / (t.radius + 2.0)) * 75);
        t.hp = Math.max(0, t.hp - dmg);

        if (isDirect) {
          directHit = true;
          if (t.type === 'radar') {
            showAnnouncement('RADAR DESTROYED!', `精準直擊！【${t.name}】天線與基座徹底粉碎！`, '#ef4444');
          } else {
            showAnnouncement('DIRECT HIT!', `精準直擊！【${t.name}】遭受致命摧毀！`, '#ef4444');
          }
        }

        if (t.hp <= 0) {
          destroyTarget(t, x, y, z);
        }
      }
    }
  });

  checkTacticalMissionProgress();
  return directHit;
}

const wreckShardMaterial = new THREE.MeshStandardMaterial({
  color:0x514a3f,roughness:.92,side:THREE.DoubleSide
});
const splinterMaterial = new THREE.MeshStandardMaterial({
  color:0x69503a,roughness:.97,side:THREE.DoubleSide
});
function makeTornFragment(seed, length, width, bend) {
  const count = 9;
  const thickness = Math.min(.075, width * .16);
  const points = [0, bend * .72, 0];
  const faces = [];
  for (let i = 0; i < count; i++) {
    const angle = i * Math.PI * 2 / count + .13 * Math.sin(seed + i * 4.1);
    const edge = .70 + .30 * Math.sin(seed * 2.1 + i * 3.7) ** 2;
    points.push(
      Math.cos(angle) * length * .5 * edge,
      bend * Math.sin(seed + i * 2.8),
      Math.sin(angle) * width * .5 * edge
    );
  }

  const bottom = count + 1;
  for (let i = 0; i < bottom; i++) {
    const j = i * 3;
    points.push(points[j], points[j + 1] - thickness, points[j + 2]);
  }
  for (let i = 0; i < count; i++) {
    const a = i + 1;
    const b = (i + 1) % count + 1;
    faces.push(0, b, a, bottom, a + bottom, b + bottom);
    faces.push(a, b, b + bottom, a, b + bottom, a + bottom);
  }

  const indexed = new THREE.BufferGeometry();
  indexed.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  indexed.setIndex(faces);
  const geometry = indexed.toNonIndexed();
  indexed.dispose();
  geometry.computeVertexNormals();
  return geometry;
}

function addWreckScorchAt(wx, wz, radius = 4.3) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const soot = ctx.createRadialGradient(64, 64, 7, 64, 64, 63);
  soot.addColorStop(0, 'rgba(18, 15, 12, 0.88)');
  soot.addColorStop(0.56, 'rgba(34, 27, 20, 0.62)');
  soot.addColorStop(1, 'rgba(39, 32, 24, 0)');
  ctx.fillStyle = soot;
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 90; i++) {
    const a = i * 2.39996, d = 59 * Math.sqrt(i / 90);
    ctx.fillStyle = `rgba(16, 14, 12, ${0.26 * (1 - d / 60)})`;
    ctx.fillRect(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 1 + (i % 5), 1 + (i % 3));
  }
  const map = new THREE.CanvasTexture(canvas);
  map.encoding = THREE.sRGBEncoding;
  const geometry = new THREE.PlaneGeometry(radius * 2, radius * 2, 14, 14).rotateX(-Math.PI / 2);
  const points = geometry.attributes.position;
  for (let i = 0; i < points.count; i++) {
    const x = wx + points.getX(i), z = wz + points.getZ(i);
    const roadLift = wildernessRoadDistance(x, z) < 4.1 ? WILDERNESS_ROAD_LIFT + 0.04 : 0.035;
    points.setY(i, wildernessRoadBaseHeight(x, z) + roadLift);
  }
  geometry.computeVertexNormals();
  const material = new THREE.MeshBasicMaterial({
    map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(wx, 0, wz);
  mesh.renderOrder = 6;
  wildernessGroup.add(mesh);
  tacticalState.debris.push({ mesh, settled: true, ownsResources: true });
}

function addWreckScorch(target) {
  const radius = target.type === 'ammo' ? 6.2 : 4.5;
  addWreckScorchAt(target.pos.x, target.pos.z, radius);
}

function scatterTargetWreck(target) {
  target.mesh.updateWorldMatrix(true,true);
  addWreckScorch(target);
  const wreckDirection = Math.random() * Math.PI * 2;
  const wreckSide = Math.cos(wreckDirection) < 0 ? -1 : 1;
  // For tanks: ONLY detach and launch the 12-ton turret if an internal Carousel Ammo Cook-Off occurred!
  const parts = target.type === 'ammo'
    ? target.mesh.children
    : (target.type === 'tank' ? (target.cookOff ? [target.turret] : []) : [target.dish]);
  function launch(mesh,index,speed,clearance,ownsGeometry = false,customVelY = null,customSpin = null) {
    const angle = wreckDirection + index * 2.39996;
    wildernessGroup.add(mesh);
    tacticalState.debris.push({
      mesh,clearance,settled:false,ownsGeometry,
      velocity:new THREE.Vector3(
        Math.cos(angle)*speed,
        customVelY !== null ? customVelY : (1.4+index%4*.6),
        Math.sin(angle)*speed
      ),
      spin:customSpin || new THREE.Vector3(.4+index%3*.65,-.5+index%4*.31,.4-index%4*.22)
    });
  }
  parts.forEach((part,index) => {
    const partType = part.userData.wreckPart;
    if (target.type === 'ammo' && !partType && !part.userData.visualOnly) return;
    part.visible = false;
    if (part.userData.visualOnly) return;
    if (partType === 'crate') {
      const center = new THREE.Vector3().setFromMatrixPosition(part.matrixWorld);
      for (let side = 0; side < 2; side++) {
        const panel = new THREE.Mesh(makeTornFragment(index * 2 + side, side ? 1.28 : .94, side ? .29 : .46, .065),splinterMaterial);
        panel.position.copy(center);
        panel.position.x += (side-.5)*.53;
        panel.rotation.set(side*.75,index*.48,side*.63);
        panel.castShadow = true;
        launch(panel,index*2+side,1.45+side*.65,.09,true);
      }
      return;
    }
    const piece = part.clone();
    if (partType === 'roof') {
      piece.geometry = part.geometry.clone();
      const points = piece.geometry.attributes.position;
      for (let i = 0; i < points.count; i++) {
        const x = points.getX(i), z = points.getZ(i);
        points.setY(i,points.getY(i)+.24*Math.sin(z*.8+x+index));
        if (z < 0) points.setZ(i,z+.25+.22*Math.sin(x*2.4+index));
      }
      piece.geometry.computeVertexNormals();
    }
    part.matrixWorld.decompose(piece.position,piece.quaternion,piece.scale);
    piece.visible = true;
    if (target.type === 'tank') {
      // Reveal gaping circular turret-ring abyss inside the tank hull
      if (target.turretRingWell) target.turretRingWell.visible = true;
      // Internal ammo cook-off launches the turret upward with heavy tumbling spin
      launch(
        piece,
        2,
        2.4 + Math.random() * 1.3,
        0.44,
        false,
        6.2 + Math.random() * 2.1,
        new THREE.Vector3(2.35, -1.45, 2.65)
      );
    } else if (target.type === 'radar' || partType === 'roof') {
      piece.position.x += wreckSide * (target.type === 'radar' ? 2.15 : (index % 2 ? .65 : -.52));
      piece.position.y = wildernessRoadBaseHeight(piece.position.x,piece.position.z)
        + (target.type === 'radar' ? .69 : .31);
      piece.rotateZ(wreckSide * (target.type === 'radar' ? 1.18 : (index % 2 ? .26 : -.31)));
      wildernessGroup.add(piece);
      tacticalState.debris.push({mesh:piece,settled:true,ownsGeometry:partType === 'roof'});
    } else {
      launch(piece,index,1.75,.47);
    }
  });
  const shardCount = target.type === 'ammo' ? 15 : (target.type === 'tank' ? 14 : 9);
  for (let i = 0; i < shardCount; i++) {
    const length = i % 5 === 0 ? .82 : .18 + (i % 6) * .11;
    const width = length*(.28+(i%4)*.15);
    const shard = new THREE.Mesh(makeTornFragment(i+.7,length,width,.055+(i%3)*.035),wreckShardMaterial);
    const angle = i*2.39996;
    const spread = 1.05+(i%5)*.34;
    shard.position.copy(target.pos);
    shard.position.x += Math.cos(angle)*spread;
    shard.position.z += Math.sin(angle)*spread;
    shard.position.y += .42+i%4*.24;
    shard.rotation.set(i*.72,angle,i*.21);
    shard.castShadow = true;
    launch(shard,i+2,1.15+i%5*.38,.055,true);
  }
}

function attachFacilityWreckFire(t) {
  if (t.wreckFire || !t.mesh) return;
  // Scorch & darken surviving bunker / radar electronics cabin materials
  t.mesh.traverse((child) => {
    if (!child.isMesh || !child.material || child.material.userData?.thermalProxy) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    mats.forEach((m) => {
      if (m && m.color && !m.userData?.wreckScorched) {
        const origHex = m.color.getHex();
        const origRough = m.roughness;
        m.color.multiplyScalar(0.46);
        if (typeof m.roughness === 'number') m.roughness = Math.min(1.0, m.roughness + 0.25);
        m.userData = { ...(m.userData || {}), wreckScorched: true, origHex, origRough };
      }
    });
  });

  const fireGroup = new THREE.Group();
  const fireSprites = [];
  const anchors = t.type === 'ammo'
    ? [
        { x: -1.4, y: 1.35, z: -0.2, scale: 2.35 },
        { x: 1.5, y: 1.25, z: 0.4, scale: 2.15 },
        { x: 0.1, y: 1.65, z: -0.9, scale: 2.55 },
        { x: -0.4, y: 1.15, z: 1.2, scale: 1.85 }
      ]
    : [
        { x: 0.0, y: 1.45, z: 0.0, scale: 1.95 },
        { x: -0.9, y: 1.15, z: 0.55, scale: 1.55 },
        { x: 0.85, y: 2.25, z: -0.35, scale: 1.65 }
      ];

  anchors.forEach((a, idx) => {
    const mat = new THREE.SpriteMaterial({
      map: getBlastTexture(),
      color: idx % 2 === 0 ? 0xff7b00 : 0xffb703,
      transparent: true,
      opacity: 0.84,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(a.x, a.y, a.z);
    sprite.scale.set(a.scale, a.scale * 1.28, 1);
    fireGroup.add(sprite);
    fireSprites.push({ sprite, baseX: a.x, baseY: a.y, baseZ: a.z, baseScale: a.scale, phase: idx * 1.9 });
  });

  const wreckLight = new THREE.PointLight(0xff6b1a, t.type === 'ammo' ? 4.4 : 3.4, 24, 1.6);
  wreckLight.position.set(0, 2.5, 0);
  fireGroup.add(wreckLight);

  t.mesh.add(fireGroup);
  t.wreckFire = { group: fireGroup, sprites: fireSprites, light: wreckLight };
  t.wreckSmokeTimer = 0;
}

function destroyTarget(t, x, y, z) {
  t.destroyed = true;
  if (t.thermal) {
    t.stoppedAt = state.elapsedTime;
    if (t.type === 'tank') updateTankThermalSignature(t, state.elapsedTime);
    else if (t.type === 'radar') updateRadarThermalSignature(t, state.elapsedTime);
  }
  t.hp = 0;

  if (t.armorMat) {
    t.armorMat.color.setHex(0x4b4742);
  }

  if (t.type === 'tank') {
    // Ensure full fatal battle damage & wreck fire are applied even if destroyTarget is invoked directly
    if (!t.wreckFire) {
      inflictTankBattleDamage(t, x ?? t.pos.x, y ?? t.pos.y + 1.2, z ?? t.pos.z, 1.0, true, !!t.cookOff);
    }
    // 50-ton Main Battle Tank forward kinetic momentum / coasting inertia
    t.coasting = !t.cookOff; // Cook-off halts the hull faster via massive internal impulse
    const curSpeed = t.speedX || (t.patrolDir * t.patrolSpeed * 0.25);
    t.coastSpeed = Math.abs(curSpeed) < 0.6 ? t.patrolDir * 1.4 : curSpeed;
    t.coastSmokeTimer = 0;
    t.wreckSmokeTimer = 0;

    if (t.cookOff) {
      // Secondary internal carousel propellant detonation & vertical flame column
      tacticalState.pendingExplosions.push(
        { x: t.pos.x, y: t.pos.y + 1.5, z: t.pos.z, delay: 0.14, visualStrength: 2.45 },
        { x: t.pos.x + (Math.random() - 0.5) * 0.8, y: t.pos.y + 2.1, z: t.pos.z + (Math.random() - 0.5) * 0.8, delay: 0.38, visualStrength: 1.85 }
      );
    }
  }

  scatterTargetWreck(t);

  if (t.type === 'radar' || t.type === 'ammo') {
    attachFacilityWreckFire(t);
  }

  if (t.type === 'ammo') {
    showAnnouncement('CHAIN REACTION!', '彈藥庫連鎖大殉爆！衝擊波瓦解周邊！', '#f59e0b');
    tacticalState.pendingExplosions.push(
      { x: x + 3, y, z: z - 2, delay: 0.28 },
      { x: x - 2.5, y, z: z + 3, delay: 0.55 },
      { x: x + 1.5, y, z: z + 3.8, delay: 0.85, visualStrength: 2.1 },
      { x: x - 3.7, y, z: z - 1.6, delay: 1.16, visualStrength: 2.35 },
      { x, y, z, delay: 1.58, visualStrength: 3.15 }
    );
  } else if (t.type !== 'tank') {
    showAnnouncement('TARGET DESTROYED!', `目標消滅！【${t.name}】已徹底擊毀！`, '#10b981');
  }

  checkTacticalMissionProgress();
}

function checkTacticalMissionProgress() {
  const remaining = tacticalState.targets.filter((t) => !t.destroyed).length;
  const scoreText = document.getElementById('tactical-score-text');
  if (scoreText) {
    const tanksKilled = tacticalState.targets.filter((t) => t.type === 'tank' && t.destroyed).length;
    const radarKilled = tacticalState.targets.filter((t) => t.type === 'radar' && t.destroyed).length;
    const ammoKilled = tacticalState.targets.filter((t) => t.type === 'ammo' && t.destroyed).length;
    scoreText.textContent = `坦克 ${tanksKilled}/2 ｜ 雷達 ${radarKilled}/1 ｜ 彈藥庫 ${ammoKilled}/1`;
  }

  if (remaining === 0 && !state.tacticalVictoryAnnounced) {
    state.tacticalVictoryAnnounced = true;
    audioEngine.playFinishFanfare();
    showAnnouncement('ALL TARGETS DESTROYED', '所有敵軍戰略目標全數殲滅！請返航臨時放飛點降落結算！', '#10b981');
  }
}

function updateExplosions(dt) {
  const pendingExplosions = tacticalState.pendingExplosions;
  for (let i = pendingExplosions.length - 1; i >= 0; i--) {
    const blast = pendingExplosions[i];
    blast.delay -= dt;
    if (blast.delay <= 0) {
      pendingExplosions.splice(i, 1);
      if (blast.visualStrength) {
        createBlastEffect(blast.x, blast.y, blast.z, blast.visualStrength);
        audioEngine.playExplosion(blast.visualStrength >= 3 ? .95 : .65);
      } else {
        triggerExplosionAt(blast.x, blast.y, blast.z, null);
      }
    }
  }

  for (const piece of tacticalState.debris) {
    if (piece.settled) continue;
    const {mesh,velocity,spin}=piece;
    velocity.y-=9.8*dt;
    mesh.position.addScaledVector(velocity,dt);
    mesh.rotation.x+=spin.x*dt;
    mesh.rotation.y+=spin.y*dt;
    mesh.rotation.z+=spin.z*dt;
    const floor=wildernessRoadBaseHeight(mesh.position.x,mesh.position.z)+piece.clearance;
    if (mesh.position.y<=floor) {
      mesh.position.y=floor;
      piece.settled=velocity.length()<2;
      velocity.multiplyScalar(.36);
      velocity.y=Math.abs(velocity.y)*.39;
      spin.multiplyScalar(.48);
    }
  }
  for (let i = tacticalState.explosions.length - 1; i >= 0; i--) {
    const exp = tacticalState.explosions[i];
    exp.life += dt;
    if (exp.flashLight) {
      if (exp.life < 0.55) {
        const flashPhase = exp.life / 0.55;
        const flicker = 0.88 + 0.12 * Math.sin(exp.life * 65.0);
        exp.flashLight.intensity = (7.5 * (exp.strength || 1)) * Math.pow(1.0 - flashPhase, 2.2) * flicker;
      } else {
        exp.flashLight.intensity = 0;
        exp.flashLight.visible = false;
      }
    }
    if (exp.shockRing) {
      if (exp.life < 0.42) {
        const rPhase = exp.life / 0.42;
        const rScale = 1.0 + rPhase * 15.5 * (exp.strength || 1);
        exp.shockRing.scale.set(rScale, rScale, 1);
        exp.shockRing.material.opacity = 0.72 * Math.pow(1.0 - rPhase, 1.8);
      } else {
        exp.shockRing.visible = false;
      }
    }
    for (const p of exp.particles) {
      const time=exp.life-p.delay;
      const phase=time/p.life;
      p.sprite.visible=phase>=0 && phase<1;
      if (!p.sprite.visible) continue;
      const growth=p.size+p.spread*time/(1+time*.3);
      p.sprite.scale.set(growth,growth*p.flatten,1);
      const x=p.x+p.vx*time, z=p.z+p.vz*time;
      const ground=p.flatten<1 ? wildernessHeight(exp.group.position.x+x,exp.group.position.z+z)-exp.group.position.y+.45 : -Infinity;
      p.sprite.position.set(x,Math.max(ground,p.y+p.vy*time),z);
      p.sprite.material.opacity=p.opacity*Math.min(1,.38+phase*7)*(1-phase)**1.25;
    }
    if (exp.life >= exp.maxLife) {
      removeBlastEffect(exp);
      tacticalState.explosions.splice(i, 1);
    }
  }
}

// Sample the same triangle surface that the terrain mesh renders.
function wildernessMeshHeight(x, z) {
  const cells = WILDERNESS_TERRAIN_CELLS;
  const size = WILDERNESS_TERRAIN_SIZE;
  const u = THREE.MathUtils.clamp((x + size / 2) * cells / size, 0, cells);
  const v = THREE.MathUtils.clamp((z - WILDERNESS_TERRAIN_Z + size / 2) * cells / size, 0, cells);
  const col = Math.min(cells - 1, Math.floor(u));
  const row = Math.min(cells - 1, Math.floor(v));
  const fx = u - col, fz = v - row;
  const a = row * (cells + 1) + col;
  const b = a + cells + 1;
  const position = wildernessTerrainPositions;
  const northWest = position.getY(a), northEast = position.getY(a + 1);
  const southWest = position.getY(b), southEast = position.getY(b + 1);
  return fx + fz <= 1
    ? northWest + (northEast - northWest) * fx + (southWest - northWest) * fz
    : southEast + (southWest - southEast) * (1 - fx) + (northEast - southEast) * (1 - fz);
}

function wildernessRoadBaseHeight(x, z) {
  return Math.max(wildernessMeshHeight(x,z), wildernessHeight(x,z));
}

const tankContactPoint = new THREE.Vector3();

function alignTankToRoad(tank) {
  const {x,z} = tank.pos;
  const yaw = -tank.patrolDir * Math.PI / 2;
  const sin = Math.sin(yaw), cos = Math.cos(yaw);
  const sample = (side, longitudinal) =>
    wildernessRoadBaseHeight(x + side * cos + longitudinal * sin, z - side * sin + longitudinal * cos);
  const lf = sample(-1.45,-2.2), rf = sample(1.45,-2.2);
  const lb = sample(-1.45,2.2), rb = sample(1.45,2.2);
  const pitch = -Math.atan2((lb + rb - lf - rf) / 2,4.4);
  const roll = Math.atan2((rf + rb - lf - lb) / 2,2.9);
  tank.mesh.rotation.set(pitch,yaw,roll,'YXZ');
  let supportHeight = -Infinity;
  for (const side of [-1.68,-1.22,1.22,1.68]) {
    for (const along of [-2.2,-1.1,0,1.1,2.2]) {
      tankContactPoint.set(side,0,along).applyQuaternion(tank.mesh.quaternion);
      const surface = wildernessRoadBaseHeight(x+tankContactPoint.x,z+tankContactPoint.z);
      supportHeight = Math.max(supportHeight,surface-tankContactPoint.y);
    }
  }
  tank.pos.y = supportHeight + WILDERNESS_ROAD_LIFT + .03;
}

function updateTacticalTargets(dt) {
  if (state.gameMode !== 'tactical_strike') return;

  const nowSec = performance.now() * 0.001;
  tacticalState.tanks.forEach((tank) => {
    updateTankThermalSignature(tank,state.elapsedTime);
    if (tank.destroyed) {
      // Animate persistent 3D wreck flames & glowing turret-ring/engine embers
      if (tank.wreckFire) {
        const wf = tank.wreckFire;
        const pulse = 0.82 + 0.18 * Math.sin(nowSec * 17.0) * Math.cos(nowSec * 29.0);
        if (wf.light) wf.light.intensity = (tank.cookOff ? 4.2 : 3.2) * pulse;
        wf.sprites.forEach((s, idx) => {
          const flk = Math.sin(nowSec * (11.0 + idx * 3.7) + s.phase);
          const scaleX = s.baseScale * (0.88 + 0.18 * flk);
          const scaleY = s.baseScale * (1.15 + 0.28 * Math.cos(nowSec * 14.3 + s.phase));
          s.sprite.scale.set(scaleX, scaleY, 1);
          s.sprite.position.set(
            s.baseX + Math.sin(nowSec * 8.5 + s.phase) * 0.08,
            s.baseY + Math.abs(flk) * 0.14,
            s.baseZ + Math.cos(nowSec * 7.2 + s.phase) * 0.08
          );
          s.sprite.material.opacity = 0.68 + 0.24 * Math.abs(flk);
        });
      }
      if (tank.tankParts && tank.tankParts.emberBed) {
        tank.tankParts.emberBed.material.opacity = 0.78 + 0.18 * Math.sin(nowSec * 9.5);
      }
      // Continuously emit rising black oil smoke & flame column from burning tank hulk
      tank.wreckSmokeTimer = (tank.wreckSmokeTimer || 0) + dt;
      if (tank.wreckSmokeTimer >= 0.32) {
        tank.wreckSmokeTimer = 0;
        createWreckFireSmokePlume(tank.pos.x, tank.pos.y + 1.35, tank.pos.z, !!tank.cookOff);
      }

      if (tank.coasting) {
        // 50-ton heavy tank rolling drag and coasting deceleration (~2 seconds to stop)
        const decelRate = 0.82;
        const speedSign = Math.sign(tank.coastSpeed);
        tank.coastSpeed -= speedSign * decelRate * dt;
        if (speedSign * tank.coastSpeed <= 0.04) {
          tank.coastSpeed = 0;
          tank.coasting = false;
          addWreckScorch(tank);
        } else {
          const travel = tank.coastSpeed * dt;
          tank.pos.x += travel;
          tank.rollWheels(Math.abs(travel));
          alignTankToRoad(tank);
          tank.coastSmokeTimer = (tank.coastSmokeTimer || 0) + dt;
          if (tank.coastSmokeTimer >= 0.22) {
            tank.coastSmokeTimer = 0;
            createDudBlastEffect(tank.pos.x, tank.pos.y + 0.6, tank.pos.z);
          }
        }
      }
      return;
    }
    const previousX = tank.pos.x;
    tank.pos.x += tank.patrolDir * tank.patrolSpeed * 0.25 * dt;
    if (tank.pos.x > tank.patrolMaxX) {
      tank.pos.x = tank.patrolMaxX;
      tank.patrolDir = -1;
    } else if (tank.pos.x < tank.patrolMinX) {
      tank.pos.x = tank.patrolMinX;
      tank.patrolDir = 1;
    }
    const travel = tank.pos.x - previousX;
    tank.speedX = dt > 0 ? travel / dt : 0;
    tank.rollWheels(Math.abs(travel));
    alignTankToRoad(tank);

    if ((tank.trackDamaged || tank.hp < tank.maxHp) && !tank.destroyed) {
      tank.trackSmokeTimer = (tank.trackSmokeTimer || 0) + dt;
      const smokeInterval = tank.hp <= 45 ? 0.28 : 0.42;
      if (tank.trackSmokeTimer >= smokeInterval) {
        tank.trackSmokeTimer = 0;
        createTrackDamageSmoke(tank.pos.x - tank.patrolDir * 1.2, tank.pos.y + 0.55, tank.pos.z + (Math.random() - 0.5) * 1.1, tank.patrolDir);
      }
    }

    const angle = tank.turret.rotation.y;
    if (angle !== tank.turretTargetYaw) {
      const step = .30 * dt;
      tank.turret.rotation.y += THREE.MathUtils.clamp(tank.turretTargetYaw - angle,-step,step);
      if (Math.abs(tank.turretTargetYaw - angle) <= step) tank.turret.rotation.y = tank.turretTargetYaw;
    } else {
      tank.turretWait -= dt;
      if (tank.turretWait <= 0) {
        const limit = 1.12;
        const sweep = .20 + Math.random() * .68;
        const direction = Math.random() < .5 ? -1 : 1;
        const next = angle + direction * sweep;
        tank.turretTargetYaw = Math.abs(next) <= limit ? next : angle - direction * sweep;
        tank.turretWait = 9 + Math.random() * 14;
      }
    }
  });

  const radar = tacticalState.targets.find((t) => t.type === 'radar');
  if (radar) {
    if (radar.thermal) updateRadarThermalSignature(radar, state.elapsedTime);
    if (!radar.destroyed && radar.dish) {
      radar.dish.rotation.y += 1.8 * dt;
      if (radar.radarParts?.beaconMat) {
        const beaconPulse = 0.55 + 0.45 * Math.sin(nowSec * 6.2);
        radar.radarParts.beaconMat.emissiveIntensity = 0.9 + 1.8 * beaconPulse;
      }
    }
  }

  // Animate persistent wreck fire & black smoke plumes for destroyed Radar & Ammo Depot facilities
  tacticalState.targets.forEach((t) => {
    if ((t.type === 'radar' || t.type === 'ammo') && t.destroyed && t.wreckFire) {
      const wf = t.wreckFire;
      const pulse = 0.84 + 0.16 * Math.sin(nowSec * 15.0) * Math.cos(nowSec * 23.0);
      if (wf.light) wf.light.intensity = (t.type === 'ammo' ? 4.4 : 3.4) * pulse;
      wf.sprites.forEach((s, idx) => {
        const flk = Math.sin(nowSec * (10.5 + idx * 3.1) + s.phase);
        const scaleX = s.baseScale * (0.9 + 0.16 * flk);
        const scaleY = s.baseScale * (1.18 + 0.26 * Math.cos(nowSec * 13.7 + s.phase));
        s.sprite.scale.set(scaleX, scaleY, 1);
        s.sprite.position.set(
          s.baseX + Math.sin(nowSec * 7.8 + s.phase) * 0.1,
          s.baseY + Math.abs(flk) * 0.16,
          s.baseZ + Math.cos(nowSec * 6.9 + s.phase) * 0.1
        );
        s.sprite.material.opacity = 0.70 + 0.22 * Math.abs(flk);
      });
      t.wreckSmokeTimer = (t.wreckSmokeTimer || 0) + dt;
      if (t.wreckSmokeTimer >= (t.type === 'ammo' ? 0.28 : 0.36)) {
        t.wreckSmokeTimer = 0;
        createWreckFireSmokePlume(
          t.pos.x + (Math.random() - 0.5) * (t.type === 'ammo' ? 2.6 : 1.4),
          t.pos.y + 1.4,
          t.pos.z + (Math.random() - 0.5) * (t.type === 'ammo' ? 2.2 : 1.4),
          t.type === 'ammo'
        );
      }
    }
  });
}

function updateCCIP() {
  if (!ccipMarkerMesh) return;
  const ccipGroup = document.getElementById('nadir-ccip-group');
  const ccipLine = document.getElementById('nadir-ccip-line');
  const ccipPip = document.getElementById('nadir-ccip-pip');
  const ccipDot = document.getElementById('nadir-ccip-dot');
  const ccipLbl = document.getElementById('nadir-ccip-lbl');

  if (state.gameMode !== 'tactical_strike' || !state.raceActive) {
    ccipMarkerMesh.visible = false;
    if (ccipGroup) ccipGroup.style.display = 'none';
    return;
  }

  const impact = calculateImpactPoint();
  if (impact) {
    ccipMarkerMesh.position.set(impact.x, impact.y, impact.z);
    ccipMarkerMesh.visible = true;

    // Check if impact is locked on any target
    let lockedTarget = null;
    for (const t of tacticalState.targets) {
      if (t.destroyed) continue;
      const dist = Math.hypot(impact.x - t.pos.x, impact.z - t.pos.z);
      if (dist <= t.radius + 1.2) {
        lockedTarget = t;
        break;
      }
    }

    const ccipInfo = document.getElementById('tactical-ccip-info');
    let col = '#ef4444';
    let hexCol = 0xef4444;

    if (!impact.armed) {
      col = '#f59e0b';
      hexCol = 0xf59e0b;
      if (ccipInfo) ccipInfo.textContent = `CCIP: 投彈高度過低 (預估啞彈 TTI: ${impact.tti.toFixed(1)}s)`;
    } else if (lockedTarget) {
      col = '#10b981';
      hexCol = 0x10b981;
      if (ccipInfo) ccipInfo.textContent = `CCIP: 鎖定 ${lockedTarget.name} (TTI: ${impact.tti.toFixed(1)}s)`;
    } else {
      if (ccipInfo) ccipInfo.textContent = `CCIP: 預測瞄準 (TTI: ${impact.tti.toFixed(1)}s)`;
    }

    ccipMarkerMat.color.setHex(hexCol);
    if (ccipLineMat) ccipLineMat.color.setHex(hexCol);

    // Item 6: Real Military ASL (Azimuth Steering Line / Bomb Fall Line) in Downward Optic Reticle
    if (state.cameraMode === 'down' && ccipGroup) {
      ccipGroup.style.display = '';

      const dx = impact.x - drone.pos.x;
      const dz = impact.z - drone.pos.z;
      const fX = -Math.sin(drone.yaw);
      const fZ = -Math.cos(drone.yaw);
      const rX = Math.cos(drone.yaw);
      const rZ = -Math.sin(drone.yaw);
      const relRight = dx * rX + dz * rZ;
      const relForward = dx * fX + dz * fZ;

      const alt = Math.max(1.0, drone.pos.y - impact.y);
      const fovMap = { 1: 62, 2: 32, 4: 16 };
      const curFov = fovMap[state.downZoom] || 62;
      const halfFovRad = (curFov * Math.PI / 180) * 0.5;
      const scale = 180 / (alt * Math.tan(halfFovRad));

      const rawSvgX = relRight * scale;
      const rawSvgY = -relForward * scale;

      const maxR = 210;
      const distSvg = Math.hypot(rawSvgX, rawSvgY);
      const isCapped = distSvg > maxR;
      const svgX = isCapped ? (rawSvgX / distSvg) * maxR : rawSvgX;
      const svgY = isCapped ? (rawSvgY / distSvg) * maxR : rawSvgY;

      if (ccipLine) {
        ccipLine.setAttribute('x1', '0');
        ccipLine.setAttribute('y1', '0');
        ccipLine.setAttribute('x2', svgX.toFixed(1));
        ccipLine.setAttribute('y2', svgY.toFixed(1));
        ccipLine.setAttribute('stroke', col);
      }
      if (ccipPip) {
        ccipPip.setAttribute('cx', svgX.toFixed(1));
        ccipPip.setAttribute('cy', svgY.toFixed(1));
        ccipPip.setAttribute('stroke', col);
      }
      if (ccipDot) {
        ccipDot.setAttribute('cx', svgX.toFixed(1));
        ccipDot.setAttribute('cy', svgY.toFixed(1));
        ccipDot.setAttribute('fill', col);
      }
      if (ccipLbl) {
        const lblX = svgX + (svgX >= 0 ? 8 : -34);
        const lblY = svgY + (svgY >= 0 ? 12 : -8);
        ccipLbl.setAttribute('x', lblX.toFixed(1));
        ccipLbl.setAttribute('y', lblY.toFixed(1));
        ccipLbl.setAttribute('fill', col);
        ccipLbl.textContent = lockedTarget ? `LOCK [${lockedTarget.name.slice(0, 2)}]` : (!impact.armed ? 'DUD' : 'CCIP');
      }
    } else if (ccipGroup) {
      ccipGroup.style.display = 'none';
    }
  } else {
    ccipMarkerMesh.visible = false;
    if (ccipGroup) ccipGroup.style.display = 'none';
  }
}

function createQuadcopter() {
  const root = new THREE.Group();
  const tiltGroup = new THREE.Group();
  root.add(tiltGroup);
  const shell = new THREE.MeshStandardMaterial({ color: 0x626c59, roughness: .79, metalness: .12 });
  const frame = new THREE.MeshStandardMaterial({ color: 0x252c27, roughness: .74, metalness: .18 });
  const motorMetal = new THREE.MeshStandardMaterial({ color: 0x7c8d99, roughness: .28, metalness: .56 });
  const lens = new THREE.MeshStandardMaterial({ color: 0x172f45, roughness: .11, metalness: .42 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x355974, roughness: .2, metalness: .28 });
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x343b40, roughness: .5, side: THREE.DoubleSide });
  const housing = vehicleProfile([[-.78,-.12],[-.67,-.22],[.59,-.22],[.83,-.09],[.68,.23],[.40,.29],[-.44,.28],[-.69,.17]], .91, .075);
  vehiclePart(tiltGroup, housing, shell, 0, 0, 0, true).rotation.y = Math.PI / 2;
  const battery = vehicleProfile([[-.51,-.11],[.50,-.11],[.55,.07],[.37,.16],[-.43,.16]], .47, .05);
  vehiclePart(tiltGroup, battery, frame, 0, -.17, .16).rotation.y = Math.PI / 2;
  const sensor = new THREE.SphereGeometry(.067, 12, 8);
  for (const side of [-1,1]) {
    vehiclePart(tiltGroup, sensor, lens, side * .19, .06, -.74);
    vehiclePart(tiltGroup, new THREE.BoxGeometry(.075,.22,.12), frame, side * .19, -.20, -.62);
    for (let slot = 0; slot < 4; slot++) {
      vehiclePart(tiltGroup, new THREE.BoxGeometry(.021,.036,.14), frame, side * .456, .03, .20 + slot * .08);
    }
  }
  vehiclePart(tiltGroup, new THREE.BoxGeometry(.25,.18,.22), frame, 0, -.20, -.66);
  vehiclePart(tiltGroup, new THREE.SphereGeometry(.19, 24, 16), frame, 0, -.37, -.73);
  const lensRing = vehiclePart(tiltGroup, new THREE.CylinderGeometry(.108,.12,.05,20),
    motorMetal, 0, -.38, -.888);
  lensRing.rotation.x = Math.PI / 2;
  vehiclePart(tiltGroup, new THREE.SphereGeometry(.086,20,12), glass, 0, -.38, -.922).scale.z = .37;
  vehiclePart(tiltGroup, new THREE.SphereGeometry(.069,16,10), lens, .06, -.51, -.79).scale.y = .48;

  const skid = new THREE.CylinderGeometry(.037,.037,1.34,12).rotateX(Math.PI / 2);
  const foot = new THREE.SphereGeometry(.037, 10, 8);
  const antenna = new THREE.CylinderGeometry(.014,.025,.28,10);
  for (const side of [-1, 1]) {
    vehiclePart(tiltGroup, skid, frame, side * .57, -.84, .04);
    for (const z of [-.63, .71]) vehiclePart(tiltGroup, foot, frame, side * .57, -.84, z);
    for (const z of [-.47, .47]) {
      const top = new THREE.Vector3(side * .36, -.15, z * .83);
      const bottom = new THREE.Vector3(side * .57, -.84, z);
      const axis = bottom.clone().sub(top);
      const mid = top.clone().lerp(bottom, .5);
      const strut = vehiclePart(tiltGroup, new THREE.CylinderGeometry(.027,.036,axis.length(),10),
        frame, mid.x, mid.y, mid.z);
      strut.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),axis.normalize());
    }
    vehiclePart(tiltGroup, antenna, frame, side * .31, .34, .52).rotation.z = side * -.23;
  }

  const numberCanvas = document.createElement('canvas');
  numberCanvas.width = 128;
  numberCanvas.height = 64;
  const numberCtx = numberCanvas.getContext('2d');
  numberCtx.fillStyle = '#e4e6d8';
  numberCtx.font = 'bold 42px monospace';
  numberCtx.textAlign = 'center';
  numberCtx.textBaseline = 'middle';
  numberCtx.fillText('07', 64, 33);
  const numberTexture = new THREE.CanvasTexture(numberCanvas);
  numberTexture.encoding = THREE.sRGBEncoding;
  const numberPlate = vehiclePart(tiltGroup, new THREE.PlaneGeometry(.31,.155),
    new THREE.MeshStandardMaterial({map:numberTexture,transparent:true,roughness:.85}), 0, .37, -.15);
  numberPlate.rotation.x = -Math.PI / 2;

  const rotors = [];
  const motorBase = new THREE.CylinderGeometry(.145,.16,.12,20);
  const motorCap = new THREE.CylinderGeometry(.135,.145,.085,20);
  const spinner = new THREE.CylinderGeometry(.072,.092,.055,16);
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(.04,-.038);
  bladeShape.quadraticCurveTo(.32,-.095,.52,-.043);
  bladeShape.quadraticCurveTo(.58,-.025,.56,.012);
  bladeShape.quadraticCurveTo(.33,.057,.04,.029);
  bladeShape.closePath();
  const blade = new THREE.ShapeGeometry(bladeShape,10);
  blade.rotateX(-Math.PI / 2);

  for (const [x,z] of [[-1,-.76],[1,-.76],[-.91,.77],[.91,.77]]) {
    const inboard = new THREE.Vector3(Math.sign(x)*.24,-.07,z*.44);
    const motor = new THREE.Vector3(x,.015,z);
    const axis = motor.clone().sub(inboard);
    const mid = inboard.clone().addScaledVector(axis,.5);
    const arm = vehiclePart(tiltGroup, new THREE.CylinderGeometry(.102,.132,axis.length(),10), frame, mid.x,mid.y,mid.z);
    arm.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),axis.normalize());
    vehiclePart(tiltGroup,motorBase,frame,x,.04,z);
    vehiclePart(tiltGroup,motorCap,motorMetal,x,.13,z);
    vehiclePart(tiltGroup,new THREE.CylinderGeometry(.08,.09,.26,10),frame,x,-.12,z);
    vehiclePart(tiltGroup,sensor,new THREE.MeshBasicMaterial({color:z<0?0xf05a45:0x53c995}),x,-.11,z-.09);
    const rotor = new THREE.Group();
    rotor.position.set(x,.205,z);
    tiltGroup.add(rotor);
    vehiclePart(rotor,spinner,motorMetal,0,.027,0);
    vehiclePart(rotor,blade,bladeMat,0,.012,0);
    vehiclePart(rotor,blade,bladeMat,0,.012,0).rotation.y = Math.PI;
    rotors.push(rotor);
  }
  return {root,tiltGroup,rotors};
}

const playerDroneMesh = createQuadcopter();
scene.add(playerDroneMesh.root);

const ghostDroneMesh = {root: playerDroneMesh.root.clone()};
const ghostMaterial = new THREE.MeshBasicMaterial({color:0xa855f7,wireframe:true,transparent:true,opacity:.45});
ghostDroneMesh.root.traverse(mesh => {
  if (mesh.isMesh) {
    mesh.material = ghostMaterial;
    mesh.castShadow = mesh.receiveShadow = false;
  }
});
ghostDroneMesh.root.visible = false;
scene.add(ghostDroneMesh.root);
try { buildDroneBellyPayload(); } catch (e) { console.warn('buildDroneBellyPayload:', e); }

const TRAIL_MAX = 40;
const trailPointsL = [];
const trailPointsR = [];
const trailGeoL = new THREE.BufferGeometry();
const trailGeoR = new THREE.BufferGeometry();
const trailMat = new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.5 });
const trailLineL = new THREE.Line(trailGeoL, trailMat);
const trailLineR = new THREE.Line(trailGeoR, trailMat);
scene.add(trailLineL, trailLineR);

function updateWingtipTrails() {
  const speed = Math.hypot(drone.vel.x, drone.vel.z);
  if (speed > 3.5 && state.cameraMode === 'chase') {
    const leftOffset = new THREE.Vector3(-0.88, 0, 0.85)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), drone.yaw)
      .add(drone.pos);
    const rightOffset = new THREE.Vector3(0.88, 0, 0.85)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), drone.yaw)
      .add(drone.pos);

    trailPointsL.push(leftOffset);
    trailPointsR.push(rightOffset);
    if (trailPointsL.length > TRAIL_MAX) {
      trailPointsL.shift();
      trailPointsR.shift();
    }
  } else if (trailPointsL.length > 0) {
    trailPointsL.shift();
    trailPointsR.shift();
  }

  trailGeoL.setFromPoints(trailPointsL);
  trailGeoR.setFromPoints(trailPointsR);
}

// ============================================================================
// 13. FLIGHT PHYSICS, COLLISION & RACE LOGIC
// ============================================================================
function resetDroneTransform(x, y, z, yaw = 0) {
  drone.pos.set(x, y, z);
  drone.vel.set(0, 0, 0);
  drone.yaw = yaw;
  drone.yawRate = 0;
  drone.pitch = 0;
  drone.pitchRate = 0;
  drone.roll = 0;
  drone.rollRate = 0;
  drone.groundEffectFactor = 1.0;
  drone.vrsSeverity = 0;
  drone.massRatio = 1.0;
  drone.collisionCooldown = 0;
  trailPointsL.length = 0;
  trailPointsR.length = 0;

  playerDroneMesh.root.position.copy(drone.pos);
  playerDroneMesh.root.rotation.set(0, drone.yaw, 0);
  playerDroneMesh.tiltGroup.rotation.set(0, 0, 0);

  document.getElementById('landing-indicator').classList.remove('visible');
}

function respawnAtLastCheckpoint(withPenalty = false) {
  if (state.gameMode === 'tactical_strike') {
    resetDroneTransform(0, 1.2, 0, 0);
    showAnnouncement('FARP RESPAWN', '已重置回臨時放飛點', '#ef4444');
    return;
  }
  const isTraining = state.gameMode === 'training' || state.gameMode === 'single_race';
  if (isTraining) {
    let spawnPos = { x: 0, y: 1.2, z: 0 };
    let spawnYaw = 0;
    if (state.trainingStep === 1) {
      spawnPos = { x: 0, y: 1.2, z: 0 };
      spawnYaw = 0;
    } else if (state.trainingStep === 2) {
      spawnPos = { x: 0, y: 10, z: -10 };
      spawnYaw = 0;
    } else if (state.trainingStep === 3) {
      spawnPos = { x: COURSE_GATES[0].pos.x, y: COURSE_GATES[0].pos.y, z: COURSE_GATES[0].pos.z };
      spawnYaw = 0;
    } else if (state.trainingStep === 4) {
      spawnPos = { x: COURSE_GATES[1].pos.x, y: COURSE_GATES[1].pos.y, z: COURSE_GATES[1].pos.z };
      spawnYaw = 0;
    } else if (state.trainingStep === 5) {
      spawnPos = { x: COURSE_GATES[2].pos.x, y: COURSE_GATES[2].pos.y, z: COURSE_GATES[2].pos.z };
      spawnYaw = -Math.PI / 2;
    } else if (state.trainingStep === 6) {
      spawnPos = { x: COURSE_GATES[3].pos.x, y: COURSE_GATES[3].pos.y, z: COURSE_GATES[3].pos.z };
      spawnYaw = -Math.PI;
    }
    resetDroneTransform(spawnPos.x, spawnPos.y, spawnPos.z, spawnYaw);
    showAnnouncement('TRAINING RESET', '已重置回當前訓練步驟起點', '#00f0ff');
    return;
  }

  const cp = state.lastCheckpoint;
  resetDroneTransform(cp.pos.x, cp.pos.y, cp.pos.z, cp.yaw);

  if (withPenalty && state.raceActive && state.gameMode !== 'free_flight') {
    state.penaltyTime += 3.0;
    state.collisionCount += 1;
    showAnnouncement('CHECKPOINT +3.0s', '已重置至上一檢查點', '#f59e0b');
  } else {
    showAnnouncement('POSITION RESET', '位置已重置', '#00f0ff');
  }
}

function triggerDamageFlash() {
  const flash = document.getElementById('damage-flash');
  if (!flash) return;
  if (window.gsap) {
    gsap.killTweensOf(flash);
    gsap.fromTo(flash, { opacity: 0.75 }, { opacity: 0, duration: 0.45, ease: 'power2.out' });
  } else {
    flash.style.opacity = '0.75';
    setTimeout(() => { flash.style.opacity = '0'; }, 300);
  }
}

function triggerGateFlash() {
  const flash = document.getElementById('gate-flash');
  if (!flash) return;
  if (window.gsap) {
    gsap.killTweensOf(flash);
    gsap.fromTo(flash, { opacity: 0.55 }, { opacity: 0, duration: 0.4, ease: 'power2.out' });
  } else {
    flash.style.opacity = '0.55';
    setTimeout(() => { flash.style.opacity = '0'; }, 300);
  }
}

function showAnnouncement(mainText, subText, colorHex = '#00f0ff') {
  const wrap = document.getElementById('center-announcement');
  const mainEl = document.getElementById('announce-main');
  const subEl = document.getElementById('announce-sub');

  if (mainEl) {
    mainEl.textContent = mainText;
    mainEl.style.color = colorHex;
  }
  if (subEl) subEl.textContent = subText;

  if (wrap) {
    if (window.gsap) {
      gsap.killTweensOf(wrap);
      gsap.fromTo(
        wrap,
        { opacity: 0, scale: 0.8, y: -12 },
        {
          opacity: 1,
          scale: 1,
          y: 0,
          duration: 0.28,
          ease: 'back.out(1.7)',
          onComplete: () => {
            gsap.to(wrap, { opacity: 0, y: 10, duration: 0.35, delay: 0.85 });
          }
        }
      );
    } else {
      wrap.style.opacity = '1';
      setTimeout(() => { wrap.style.opacity = '0'; }, 1100);
    }
  }
}

function reportImpact(label, speed) {
  const tactical = state.gameMode === 'tactical_strike';
  if (speed < (tactical ? 0.5 : 2.4) || drone.collisionCooldown > 0) return;
  drone.collisionCooldown = 1.1;
  triggerDamageFlash();
  audioEngine.playCollisionAlert();
  if (state.raceActive && state.gameMode !== 'free_flight') {
    state.collisionCount++;
    if (tactical) {
      showAnnouncement(`碰撞 −${TACTICAL_COLLISION_COST} 分`, label, '#ef4444');
    } else {
      state.penaltyTime += 2;
      showAnnouncement('COLLISION +2.0s', label, '#ef4444');
    }
  }
}

function resolveBoxContact(box) {
  const { pos, vel, radius } = drone;
  let x = pos.x - THREE.MathUtils.clamp(pos.x, box.minX, box.maxX);
  let y = pos.y - THREE.MathUtils.clamp(pos.y, box.minY, box.maxY);
  let z = pos.z - THREE.MathUtils.clamp(pos.z, box.minZ, box.maxZ);
  const distanceSquared = x * x + y * y + z * z;
  if (distanceSquared >= radius * radius) return;

  let depth;
  if (distanceSquared > 0) {
    const distance = Math.sqrt(distanceSquared);
    x /= distance;
    y /= distance;
    z /= distance;
    depth = radius - distance;
  } else {
    const faces = [
      [pos.x - box.minX, -1, 0, 0], [box.maxX - pos.x, 1, 0, 0],
      [pos.y - box.minY, 0, -1, 0], [box.maxY - pos.y, 0, 1, 0],
      [pos.z - box.minZ, 0, 0, -1], [box.maxZ - pos.z, 0, 0, 1]
    ];
    [depth, x, y, z] = faces.reduce((nearest, face) => face[0] < nearest[0] ? face : nearest);
    depth += radius;
  }
  pos.x += x * (depth + .001);
  pos.y += y * (depth + .001);
  pos.z += z * (depth + .001);
  const closingSpeed = -((vel.x - (box.speedX ?? 0)) * x + vel.y * y + vel.z * z);
  if (closingSpeed > 0) {
    const impulse = closingSpeed * (closingSpeed >= 2.4 ? 1.25 : 1);
    vel.x += impulse * x;
    vel.y += impulse * y;
    vel.z += impulse * z;
    reportImpact(box.label, closingSpeed);
  }
}

const colliderCenter = new THREE.Vector3();
function updateDronePhysics(dt) {
  const ctrl = sampleFlightControls();
  updateKeyboardVisualizer(ctrl);

  const p = PHYSICS[state.flightMode];
  const boostMult = ctrl.boost ? p.boostMultiplier : 1.0;
  const inWilderness = state.gameMode === 'tactical_strike';
  const groundHeightNow = inWilderness ? wildernessHeight(drone.pos.x, drone.pos.z) : 0;
  const agl = Math.max(0, drone.pos.y - groundHeightNow - 0.95);

  // Payload Mass Ratio: 2x 82mm mortar bombs (1.6kg each on 8.5kg empty airframe)
  const bombLoadKg = inWilderness ? (tacticalState.bombsRemaining * 1.6) : 0;
  drone.massRatio = (8.5 + bombLoadKg) / 8.5;
  const inertiaScale = 1.0 / Math.pow(drone.massRatio, 0.38);
  const tNow = performance.now() * 0.001;

  // 0. Vortex Ring State (VRS 渦環狀態 / 槳洗亂流) Evaluation
  // Real military flight controllers protect vertical descent in Stabilized mode and require
  // sustained vertical descent into the wake column (>1.2s at low horizontal airspeed) before a vortex ring forms.
  const hSpeedPre = Math.hypot(drone.vel.x, drone.vel.z);
  const cyclicEscapeInput = Math.hypot(ctrl.pitch, ctrl.roll);
  const isSport = state.flightMode === 'sport';
  const vrsCap = isSport ? 0.85 : 0.44;
  if (drone.vel.y < -5.8 && hSpeedPre < 2.8 && agl > 4.5) {
    const descentExcess = Math.min(1.0, (-drone.vel.y - 5.5) / (isSport ? 6.0 : 2.3));
    const hoverProximity = Math.pow(1.0 - (hSpeedPre / 2.8), 0.85);
    const targetVrs = THREE.MathUtils.clamp(descentExcess * hoverProximity * vrsCap, 0, vrsCap);
    // Gradual toroidal wake build-up (~1.4 to 2.0s of sustained vertical drop)
    drone.vrsSeverity = THREE.MathUtils.lerp(drone.vrsSeverity, targetVrs, Math.min(1, dt * 1.35));
  } else if (drone.vrsSeverity > 0.01) {
    // In Sport mode with deep VRS, mashing climb throttle without horizontal movement prolongs the vortex slightly;
    // in Stabilized mode or with any horizontal airspeed, the flight controller sheds the wake smoothly.
    if (isSport && ctrl.throttle > 0.1 && hSpeedPre < 2.5 && cyclicEscapeInput < 0.25 && agl > 4.5 && drone.vrsSeverity > 0.42) {
      drone.vrsSeverity = THREE.MathUtils.lerp(drone.vrsSeverity, 0.58, Math.min(1, dt * 1.2));
    } else {
      const escapingHorizontally = hSpeedPre >= 2.8 || cyclicEscapeInput > 0.35 || agl <= 4.0;
      const decayRate = escapingHorizontally ? 6.5 : 1.65;
      drone.vrsSeverity = THREE.MathUtils.lerp(drone.vrsSeverity, 0, Math.min(1, dt * decayRate));
      if (drone.vrsSeverity < 0.015) drone.vrsSeverity = 0;
    }
  } else {
    drone.vrsSeverity = 0;
  }
  const vrs = drone.vrsSeverity;

  // 0.5 Pre-compute 3D Boundary-Layer Wind, Gust Envelope & Turbulence in World & Body Frames
  const fX = -Math.sin(drone.yaw);
  const fZ = -Math.cos(drone.yaw);
  const rX = Math.cos(drone.yaw);
  const rZ = -Math.sin(drone.yaw);

  const weatherEff = (typeof WEATHER_PROFILES !== 'undefined' && WEATHER_PROFILES[state.weather]) ? WEATHER_PROFILES[state.weather] : null;
  const shearMult = computeWindShearMultiplier(agl);
  const airborneBlend = (agl > 0.12 || ctrl.throttle > 0.05) ? THREE.MathUtils.smoothstep(agl, 0.04, 0.70) : 0;
  let meanWind = 0, gustDelta = 0, curWind = 0, turb = 0, wAng = 0.4;
  let meanWindX = 0, meanWindZ = 0, gustWindX = 0, gustWindZ = 0;
  let meanFwd = 0, meanRight = 0, gustFwd = 0, gustRight = 0;

  if (weatherEff) {
    meanWind = weatherEff.windSpeed * shearMult * airborneBlend;
    const gustWave = Math.max(0, Math.sin(tNow * 1.15) * 0.45 + Math.cos(tNow * 2.35) * 0.35 + Math.sin(tNow * 3.95) * 0.20);
    const gustSpread = Math.max(0, weatherEff.gustSpeed - weatherEff.windSpeed);
    gustDelta = gustWave * gustSpread * shearMult * airborneBlend;
    curWind = meanWind + gustDelta;
    turb = weatherEff.turbulence * shearMult * airborneBlend;
    wAng = (weatherEff.windAngle || 0.4) + (Math.sin(tNow * 0.85) * 0.14 + Math.cos(tNow * 1.95) * 0.08) * Math.min(1, turb * 1.2);

    meanWindX = Math.cos(wAng) * meanWind;
    meanWindZ = Math.sin(wAng) * meanWind;
    gustWindX = Math.cos(wAng) * gustDelta;
    gustWindZ = Math.sin(wAng) * gustDelta;

    meanFwd = meanWindX * fX + meanWindZ * fZ;
    meanRight = meanWindX * rX + meanWindZ * rZ;
    gustFwd = gustWindX * fX + gustWindZ * fZ;
    gustRight = gustWindX * rX + gustWindZ * rZ;
  }

  // 1. Yaw (scaled by payload rotational inertia + Crosswind Weathercocking Torque + VRS torque)
  const vrsYawTwitch = vrs > 0.14
    ? (Math.sin(tNow * 8.2) * 0.42 + Math.cos(tNow * 15.1) * 0.28) * vrs
    : 0;
  const weathercockYaw = -(meanRight * 0.008 + gustRight * 0.024) * THREE.MathUtils.clamp(curWind / 8.0, 0, 1.4) * inertiaScale;
  const turbYaw = (Math.sin(tNow * 5.4) * 0.22 + Math.cos(tNow * 9.7) * 0.14) * turb * inertiaScale;
  const yawAuthority = 1.0 - vrs * 0.28;
  const targetYawRate = ctrl.yaw * p.yawMaxRate * inertiaScale * yawAuthority + weathercockYaw + turbYaw + vrsYawTwitch;
  drone.yawRate += (targetYawRate - drone.yawRate) * Math.min(1, p.yawResponse * inertiaScale * dt);
  drone.yaw += drone.yawRate * dt;

  // 2. 2nd-Order Rotational Spring-Damper Attitude Dynamics (Pitch & Roll + Wind Lean + Blade-Flapping Gusts + VRS)
  const vrsPitchBuffet = vrs > 0.12
    ? (Math.sin(tNow * 10.4) * 0.075 + Math.cos(tNow * 18.7) * 0.052 + Math.sin(tNow * 27.1) * 0.028) * vrs
    : 0;
  const vrsRollBuffet = vrs > 0.12
    ? (Math.cos(tNow * 9.8) * 0.092 + Math.sin(tNow * 17.9) * 0.064 + Math.cos(tNow * 25.8) * 0.032) * vrs
    : 0;

  // In Stabilized mode, flight controller leans INTO the mean wind (Wind-Compensation Crab Angle) to counter drift;
  // sudden gusts induce rotor blade-flapping dihedral tilt (-gust) and eddy attitude perturbations.
  const fcWindLeanPitch = isSport ? 0 : THREE.MathUtils.clamp(meanFwd * 0.0175, -0.23, 0.23);
  const fcWindLeanRoll = isSport ? 0 : THREE.MathUtils.clamp(meanRight * 0.0175, -0.23, 0.23);
  const windPitchPerturb = fcWindLeanPitch - gustFwd * 0.022 + (Math.sin(tNow * 6.3) * 0.052 + Math.cos(tNow * 11.4) * 0.034) * turb;
  const windRollPerturb = fcWindLeanRoll - gustRight * 0.022 + (Math.cos(tNow * 5.8) * 0.058 + Math.sin(tNow * 10.9) * 0.038) * turb;

  const cyclicAuthority = 1.0 - vrs * 0.25;
  const targetPitch = (ctrl.brake ? fcWindLeanPitch : -ctrl.pitch * p.maxTiltAngle * cyclicAuthority + windPitchPerturb) + vrsPitchBuffet;
  const targetRoll = (ctrl.brake ? fcWindLeanRoll : -ctrl.roll * p.maxTiltAngle * cyclicAuthority + windRollPerturb) + vrsRollBuffet;
  const omegaN = p.tiltResponse * 2.15 * inertiaScale * (1.0 - vrs * 0.24);
  const zeta = (isSport ? 0.76 : 0.88) * (1.0 - vrs * 0.28);
  const attSubSteps = 2;
  const subDt = Math.min(dt, 0.05) / attSubSteps;
  for (let s = 0; s < attSubSteps; s++) {
    const pitchAcc = (omegaN * omegaN) * (targetPitch - drone.pitch) - (2 * zeta * omegaN) * drone.pitchRate;
    const rollAcc = (omegaN * omegaN) * (targetRoll - drone.roll) - (2 * zeta * omegaN) * drone.rollRate;
    drone.pitchRate += pitchAcc * subDt;
    drone.rollRate += rollAcc * subDt;
    drone.pitch += drone.pitchRate * subDt;
    drone.roll += drone.rollRate * subDt;
  }
  if (turb > 0.01) {
    drone.pitchRate += (Math.cos(tNow * 8.7) * 1.35 + Math.sin(tNow * 14.9) * 0.85) * turb * inertiaScale * dt;
    drone.rollRate += (Math.sin(tNow * 9.2) * 1.50 + Math.cos(tNow * 15.7) * 0.95) * turb * inertiaScale * dt;
  }
  if (vrs > 0.14) {
    drone.rollRate += Math.sin(tNow * 21.3) * vrs * 1.85 * dt;
    drone.pitchRate += Math.cos(tNow * 18.7) * vrs * 1.65 * dt;
  }

  // 3. Thrust-Vector Tilting Propulsion & Quadratic Airframe Drag
  if (ctrl.brake) {
    // Active aerodynamic flare braking
    const brakeEff = 6.5 * inertiaScale * (1.0 - vrs * 0.35);
    drone.vel.x *= Math.max(0, 1 - brakeEff * dt);
    drone.vel.z *= Math.max(0, 1 - brakeEff * dt);
    drone.vel.y *= Math.max(0, 1 - brakeEff * (1.0 - vrs * 0.45) * dt);
  } else {
    const maxTiltSin = Math.max(0.15, Math.sin(p.maxTiltAngle));
    const tiltForward = THREE.MathUtils.clamp(-Math.sin(drone.pitch) / maxTiltSin, -1.25, 1.25);
    const tiltRight = THREE.MathUtils.clamp(-Math.sin(drone.roll) / maxTiltSin, -1.25, 1.25);
    const vrsThrustLoss = 1.0 - vrs * (cyclicEscapeInput < 0.2 ? 0.55 : 0.15);
    const effPitchDrive = (tiltForward * 0.72 + ctrl.pitch * 0.28) * vrsThrustLoss;
    const effRollDrive = (tiltRight * 0.72 + ctrl.roll * 0.28) * vrsThrustLoss;

    const accelMag = (p.maxHorizontalAccel * boostMult) / Math.pow(drone.massRatio, 0.28);
    drone.vel.x += (fX * effPitchDrive + rX * effRollDrive) * accelMag * dt;
    drone.vel.z += (fZ * effPitchDrive + rZ * effRollDrive) * accelMag * dt;

    // Subtle horizontal wake drift while inside VRS
    if (vrs > 0.14) {
      const vrsDriftX = (Math.sin(tNow * 5.3) * 1.8 + Math.cos(tNow * 11.7) * 1.1) * vrs;
      const vrsDriftZ = (Math.cos(tNow * 6.1) * 1.8 + Math.sin(tNow * 12.9) * 1.1) * vrs;
      drone.vel.x += vrsDriftX * dt;
      drone.vel.z += vrsDriftZ * dt;
    }

    // Linear rotor blade-flapping drag + quadratic parasitic frame drag
    const hSpeed = Math.hypot(drone.vel.x, drone.vel.z);
    const quadDrag = 0.012 * hSpeed;
    const totalHDrag = p.horizontalDrag + quadDrag;
    drone.vel.x -= drone.vel.x * totalHDrag * dt;
    drone.vel.z -= drone.vel.z * totalHDrag * dt;
  }

  // 4. Vertical Lift, Flight-Controller Descent Envelope Protection, Ground Effect (IGE) & VRS Sink
  drone.groundEffectFactor = computeGroundEffectFactor(agl);
  const cosTilt = Math.max(0.45, Math.cos(drone.pitch) * Math.cos(drone.roll));
  const tiltLossCompensation = state.flightMode === 'stabilized' ? 0.85 : 0.42;
  const uncompensatedTiltDrop = (1.0 - cosTilt) * (1.0 - tiltLossCompensation) * 9.81;

  if (Math.abs(ctrl.throttle) > 0.05) {
    if (ctrl.throttle > 0) {
      // Climbing: reduced efficiency if currently inside VRS wake
      const climbEfficiency = (drone.groundEffectFactor / Math.pow(drone.massRatio, 0.25)) * (1.0 - vrs * 0.68);
      const targetVy = ctrl.throttle * p.maxClimbSpeed * climbEfficiency;
      const climbResp = p.verticalAccel * 0.25 * (1.0 - vrs * 0.52);
      drone.vel.y += (targetVy - drone.vel.y) * Math.min(1, climbResp * dt);
    } else {
      // Descending: Flight controller blends between hoverDescentLimit (pure vertical) and maxDescentSpeed (oblique forward descent)
      const cleanAirBlend = THREE.MathUtils.clamp(hSpeedPre / 4.2, 0, 1);
      const allowedDescentSpeed = THREE.MathUtils.lerp(p.hoverDescentLimit, p.maxDescentSpeed, cleanAirBlend) * Math.pow(drone.massRatio, 0.18);
      const targetVy = ctrl.throttle * (allowedDescentSpeed / drone.groundEffectFactor);
      drone.vel.y += (targetVy - drone.vel.y) * Math.min(1, p.verticalAccel * 0.22 * dt);
    }
  } else {
    // Auto-leveling altitude hold: sluggish vertical braking when inside VRS wake
    const effectiveDamping = p.verticalDamping * drone.groundEffectFactor * Math.max(0.28, 1.0 - vrs * 0.65);
    drone.vel.y -= drone.vel.y * effectiveDamping * dt;
  }
  // Downward wake suction inside VRS
  if (vrs > 0.10) {
    const vrsSinkPull = (3.4 + Math.sin(tNow * 16.5) * 1.4) * vrs;
    drone.vel.y -= vrsSinkPull * dt;
  }
  // Apply high-G bank lift loss & subtle ground-effect buoyant cushion near terrain
  drone.vel.y -= uncompensatedTiltDrop * dt;
  if (drone.groundEffectFactor > 1.02 && drone.vel.y < 0) {
    drone.vel.y *= Math.max(0, 1 - (drone.groundEffectFactor - 1.0) * 3.8 * dt);
  }

  // 5. Environmental Weather Translational Forces, Gust Drift & Vertical Wind Shear
  if (weatherEff && airborneBlend > 0.001) {
    const windMassScale = 1.0 / Math.pow(drone.massRatio, 0.30);
    // In Stabilized mode, fcWindLean already generates ~0.96*meanWind of opposing rotor thrust;
    // windAccel applies the full physical airmass drag (1.08*meanWind + 1.35*gustWind), resulting in
    // realistic station-keeping crab in Stabilized mode and full downwind drift in unassisted Sport mode.
    const windForceX = (meanWindX * 1.08 + gustWindX * 1.35) * windMassScale;
    const windForceZ = (meanWindZ * 1.08 + gustWindZ * 1.35) * windMassScale;
    drone.vel.x += windForceX * dt;
    drone.vel.z += windForceZ * dt;

    // Translational turbulent eddies & vertical shear pockets
    if (turb > 0) {
      const turbX = (Math.sin(tNow * 7.1) * 0.65 + Math.cos(tNow * 11.3) * 0.35) * turb * 1.15 * windMassScale;
      const turbZ = (Math.cos(tNow * 8.3) * 0.65 + Math.sin(tNow * 13.1) * 0.35) * turb * 1.15 * windMassScale;
      const vertShear = (Math.sin(tNow * 4.6) * 0.58 + Math.cos(tNow * 8.9) * 0.42) * turb * 1.35 * windMassScale;
      drone.vel.x += turbX * dt;
      drone.vel.z += turbZ * dt;
      drone.vel.y += vertShear * dt;
    }

    // Moisture & high-density rain drag resistance
    if (weatherEff.dragMult > 1.0) {
      const extraDrag = (weatherEff.dragMult - 1.0) * 0.85 * airborneBlend;
      drone.vel.x -= drone.vel.x * extraDrag * dt;
      drone.vel.z -= drone.vel.z * extraDrag * dt;
    }

    // Rain downdraft aerodynamic weight (partially compensated by altitude-hold PID in Stabilized mode)
    if (weatherEff.downforce > 0) {
      const downforceFactor = isSport ? 1.0 : 0.48;
      drone.vel.y -= weatherEff.downforce * downforceFactor * airborneBlend * dt;
    }
  }

  drone.collisionCooldown = Math.max(0, drone.collisionCooldown - dt);
  if (inWilderness) {
    tacticalTargetColliders.length = 0;
    for (const target of tacticalState.targets) {
      target.mesh.updateWorldMatrix(true, true);
      target.mesh.traverseVisible((part) => {
        if (!part.isMesh || part.userData.visualOnly) return;
        if (!part.geometry.boundingBox) part.geometry.computeBoundingBox();
        const box = { label: target.name, speedX: target.destroyed ? 0 : target.speedX };
        setColliderBounds(box, wildernessBounds.copy(part.geometry.boundingBox).applyMatrix4(part.matrixWorld));
        tacticalTargetColliders.push(box);
      });
    }
  }
  const collisionGroups = inWilderness
    ? [tacticalTargetColliders]
    : [buildingColliders, movingColliders, crossingBarrierColliders];
  for (const box of inWilderness ? [] : crossingBarrierColliders) {
    box.object.updateWorldMatrix(true, false);
    if (!box.object.geometry.boundingBox) box.object.geometry.computeBoundingBox();
    const bounds = crossingBarrierBounds.copy(box.object.geometry.boundingBox).applyMatrix4(box.object.matrixWorld);
    box.minX = bounds.min.x;
    box.maxX = bounds.max.x;
    box.minY = bounds.min.y;
    box.maxY = bounds.max.y;
    box.minZ = bounds.min.z;
    box.maxZ = bounds.max.z;
  }
  for (const box of inWilderness ? [] : movingColliders) {
    box.object.getWorldPosition(colliderCenter);
    const travel = colliderCenter.x - (box.previousX ?? colliderCenter.x);
    box.speedX = dt > 0 && Math.abs(travel) < 3 ? travel / dt : 0;
    box.previousX = colliderCenter.x;
    box.minX = colliderCenter.x - box.w / 2;
    box.maxX = colliderCenter.x + box.w / 2;
    box.minY = colliderCenter.y;
    box.maxY = colliderCenter.y + box.h;
    box.minZ = colliderCenter.z - box.d / 2;
    box.maxZ = colliderCenter.z + box.d / 2;
  }
  // Short steps keep narrow posts and roof edges from being skipped at speed.
  const steps = Math.max(1, Math.ceil(drone.vel.length() * dt / (drone.radius * .35)));
  for (let step = 0; step < steps; step++) {
    drone.pos.addScaledVector(drone.vel, dt / steps);
    if (inWilderness) resolveWildernessContacts();
    for (const boxes of collisionGroups) {
      for (const box of boxes) resolveBoxContact(box);
    }
    if (!inWilderness) {
      const { halfWidth, north, south } = CITY_BOUNDS;
      const x = THREE.MathUtils.clamp(drone.pos.x, -halfWidth, halfWidth);
      const z = THREE.MathUtils.clamp(drone.pos.z, north, south);
      if (x !== drone.pos.x) drone.vel.x = 0;
      if (z !== drone.pos.z) drone.vel.z = 0;
      drone.pos.x = x;
      drone.pos.z = z;
    }
    const ground = inWilderness ? wildernessHeight(drone.pos.x,drone.pos.z) : 0;
    if (drone.pos.y < ground + .95) {
      drone.pos.y = ground + .95;
      if (drone.vel.y < 0) {
        const speed = -drone.vel.y;
        drone.vel.y = speed >= 5 ? speed * .18 : 0;
        if (speed >= 5) reportImpact('地面重著陸', speed);
      }
    }
    if (drone.pos.y > PHYSICS.maxAltitude) {
      drone.pos.y = PHYSICS.maxAltitude;
      drone.vel.y = Math.min(0, drone.vel.y);
    }
  }

  // Update Mesh & Rotors
  playerDroneMesh.root.position.copy(drone.pos);
  playerDroneMesh.root.rotation.set(0, drone.yaw, 0);
  playerDroneMesh.tiltGroup.rotation.order = 'YXZ';
  playerDroneMesh.tiltGroup.rotation.set(drone.pitch, 0, drone.roll);

  const hSpeed = Math.hypot(drone.vel.x, drone.vel.z);
  drone.rotorAngle += (38 + hSpeed * 1.5) * dt;
  playerDroneMesh.rotors.forEach((rg, idx) => {
    rg.rotation.y = drone.rotorAngle * (idx % 2 === 0 ? 1 : -1);
  });

  audioEngine.updateRotorSound(hSpeed, ctrl.throttle, ctrl.boost);
  updateWingtipTrails();
}

function checkTrainingObjectives(dt) {
  const landingIndicator = document.getElementById('landing-indicator');
  if (!state.raceActive) return;

  // Task 1: 垂直升空與定高懸停 (8~13m, 懸停 2 秒)
  if (state.trainingStep === 1) {
    if (landingIndicator) landingIndicator.classList.remove('visible');
    const agl = drone.pos.y - 0.95;
    const distCenter = Math.hypot(drone.pos.x, drone.pos.z);
    const isHovering = agl >= 7.5 && agl <= 13.5 && distCenter <= 10.0 && Math.abs(drone.vel.y) < 2.0;

    if (isHovering) {
      state.trainingHoverTime += dt;
      if (trainingHoverRingMat) trainingHoverRingMat.color.setHex(0x34d399);
      if (state.trainingHoverTime >= 2.0) {
        audioEngine.playGateChime();
        triggerGateFlash();
        showAnnouncement('MISSION 01 PASS!', '垂直起飛與定高懸停掌握成功！', '#10b981');
        state.trainingStep = 2;
        state.trainingHoverTime = 0;
        state.currentGateIndex = 0;
        state.lastCheckpoint = { pos: { x: drone.pos.x, y: drone.pos.y, z: drone.pos.z }, yaw: drone.yaw };
        updateGateVisualStates();
      }
    } else {
      state.trainingHoverTime = Math.max(0, state.trainingHoverTime - dt * 0.8);
      if (trainingHoverRingMat) trainingHoverRingMat.color.setHex(0x10b981);
    }
    return;
  }

  // Task 2 ~ 5: 依序穿過指定訓練光圈
  if (state.trainingStep >= 2 && state.trainingStep <= 5) {
    if (landingIndicator) landingIndicator.classList.remove('visible');
    const targetGateIdx = state.trainingStep - 2;
    const gate = COURSE_GATES[targetGateIdx];
    const dist = Math.hypot(
      drone.pos.x - gate.pos.x,
      drone.pos.y - gate.pos.y,
      drone.pos.z - gate.pos.z
    );

    if (dist <= gate.radius + 1.2) {
      audioEngine.playGateChime();
      triggerGateFlash();
      const task = TRAINING_TASKS[state.trainingStep - 1];
      showAnnouncement(`MISSION 0${state.trainingStep} PASS!`, task.successMsg, '#10b981');

      state.trainingStep += 1;
      state.currentGateIndex = targetGateIdx + 1;
      state.lastCheckpoint = {
        pos: { x: gate.pos.x, y: gate.pos.y, z: gate.pos.z },
        yaw: gate.rotY
      };
      updateGateVisualStates();
    }
    return;
  }

  // Task 6: 返航中央停機坪精準降落
  if (state.trainingStep === 6) {
    const distToPad = Math.hypot(drone.pos.x - HELIPAD_POS.x, drone.pos.z - HELIPAD_POS.z);
    const agl = drone.pos.y - 0.95;
    const totalSpeed = drone.vel.length();

    if (distToPad <= LANDING_RADIUS && agl < 5.0) {
      landingIndicator.classList.add('visible');
      const statusText = document.getElementById('landing-status-text');
      const barFill = document.getElementById('landing-bar-fill');

      if (agl <= 1.2 && totalSpeed <= 3.2) {
        state.landingHoldTimer += dt;
        statusText.textContent = '接地穩定中... 保持靜止完成考核';
        const pct = Math.min(100, (state.landingHoldTimer / 1.1) * 100);
        barFill.style.width = `${pct}%`;

        if (state.landingHoldTimer >= 1.1) {
          landingIndicator.classList.remove('visible');
          completeRaceRun();
        }
      } else {
        state.landingHoldTimer = Math.max(0, state.landingHoldTimer - dt * 1.5);
        statusText.textContent = '進入降落坪 — 請按 S 緩慢下降並接地';
        barFill.style.width = `${(state.landingHoldTimer / 1.1) * 100}%`;
      }
    } else {
      state.landingHoldTimer = 0;
      landingIndicator.classList.remove('visible');
    }
  }
}

function checkTacticalObjectives(dt) {
  const landingIndicator = document.getElementById('landing-indicator');
  if (!state.raceActive) return;

  const distToFarp = Math.hypot(drone.pos.x, drone.pos.z);
  const agl = drone.pos.y - wildernessHeight(drone.pos.x,drone.pos.z) - .95;
  const totalSpeed = drone.vel.length();
  const remainingTargets = tacticalState.targets.filter((t) => !t.destroyed).length;
  const unusedBombs = TACTICAL_BOMB_LIMIT - tacticalState.bombsDropped;

  if (distToFarp <= FARP_LANDING_RADIUS && agl < 5.0) {
    if (landingIndicator) landingIndicator.classList.add('visible');
    const statusText = document.getElementById('landing-status-text');
    const barFill = document.getElementById('landing-bar-fill');

    if (remainingTargets === 0 || unusedBombs === 0) {
      const impactsPending = tacticalState.activeBombs.length > 0 || tacticalState.pendingExplosions.length > 0;
      if (impactsPending) {
        state.landingHoldTimer = 0;
        if (statusText) statusText.textContent = '等待最後彈著與連鎖爆炸判定…';
        if (barFill) barFill.style.width = '0%';
      } else if (agl <= 1.2 && totalSpeed <= 3.2) {
        state.landingHoldTimer += dt;
        if (statusText) statusText.textContent = '接地穩定中，即將結算…';
        const pct = Math.min(100, (state.landingHoldTimer / 1.1) * 100);
        if (barFill) barFill.style.width = `${pct}%`;
        if (state.landingHoldTimer >= 1.1) {
          if (landingIndicator) landingIndicator.classList.remove('visible');
          completeRaceRun();
        }
      } else {
        state.landingHoldTimer = 0;
        if (statusText) statusText.textContent = '已抵達臨時放飛點 — 請降低高度並穩定降落結算';
        if (barFill) barFill.style.width = '0%';
      }
    } else {
      // Rearming mode
      const loadLimit = Math.min(tacticalState.maxBombs, unusedBombs);
      if (tacticalState.bombsRemaining < loadLimit) {
        tacticalState.rearmTimer += dt;
        const rearmPct = Math.min(100, (tacticalState.rearmTimer / 1.5) * 100);
        if (statusText) statusText.textContent = `放飛點補給裝填中... (${rearmPct.toFixed(0)}%)`;
        if (barFill) barFill.style.width = `${rearmPct}%`;
        if (tacticalState.rearmTimer >= 1.5) {
          tacticalState.bombsRemaining = loadLimit;
          tacticalState.rearmTimer = 0;
          updateDroneBellyBombs();
          audioEngine.playGateChime();
          showAnnouncement('REARM COMPLETE!', `已補給至 ${loadLimit} 枚，可繼續任務。`, '#10b981');
        }
      } else {
        if (statusText) statusText.textContent = '臨時放飛點：彈藥充足，請出擊摧毀敵軍目標';
        if (barFill) barFill.style.width = '100%';
      }
    }
  } else {
    state.landingHoldTimer = 0;
    tacticalState.rearmTimer = 0;
    if (landingIndicator) landingIndicator.classList.remove('visible');
  }
}

function checkCourseObjectives(dt) {
  if (state.gameMode === 'tactical_strike') {
    checkTacticalObjectives(dt);
    return;
  }
  const isTraining = state.gameMode === 'training' || state.gameMode === 'single_race';
  if (isTraining) {
    checkTrainingObjectives(dt);
    return;
  }

  const landingIndicator = document.getElementById('landing-indicator');

  // Strictly hide landing indicator unless all 6 gates are cleared in active race
  if (!state.raceActive || state.gameMode === 'free_flight' || state.currentGateIndex < COURSE_GATES.length) {
    landingIndicator.classList.remove('visible');
  }

  if (!state.raceActive || state.gameMode === 'free_flight') return;

  // Pass Checkpoint Gates
  if (state.currentGateIndex < COURSE_GATES.length) {
    const gate = COURSE_GATES[state.currentGateIndex];
    const dist = Math.hypot(
      drone.pos.x - gate.pos.x,
      drone.pos.y - gate.pos.y,
      drone.pos.z - gate.pos.z
    );

    if (dist <= gate.radius + 1.1) {
      state.currentGateIndex += 1;
      state.lastCheckpoint = {
        pos: { x: gate.pos.x, y: gate.pos.y, z: gate.pos.z },
        yaw: gate.rotY
      };

      triggerGateFlash();
      audioEngine.playGateChime();
      updateGateVisualStates();

      if (state.currentGateIndex < COURSE_GATES.length) {
        showAnnouncement(
          `GATE ${state.currentGateIndex} / ${COURSE_GATES.length}`,
          `下一目標：${COURSE_GATES[state.currentGateIndex].name}`,
          '#10b981'
        );
      } else {
        showAnnouncement(
          'FINAL APPROACH',
          '全數檢查門通過！請飛回市區 H 起降坪降落',
          '#f59e0b'
        );
      }
    }
    return;
  }

  // All 6 Gates Cleared -> Final Helipad Landing
  const distToPad = Math.hypot(drone.pos.x - HELIPAD_POS.x, drone.pos.z - HELIPAD_POS.z);
  const agl = drone.pos.y - 0.95;
  const totalSpeed = drone.vel.length();

  if (distToPad <= LANDING_RADIUS && agl < 5.0) {
    landingIndicator.classList.add('visible');
    const statusText = document.getElementById('landing-status-text');
    const barFill = document.getElementById('landing-bar-fill');

    if (agl <= 1.2 && totalSpeed <= 3.2) {
      state.landingHoldTimer += dt;
      statusText.textContent = '接地穩定中... 請保持懸停完成降落';
      const pct = Math.min(100, (state.landingHoldTimer / 1.1) * 100);
      barFill.style.width = `${pct}%`;

      if (state.landingHoldTimer >= 1.1) {
        landingIndicator.classList.remove('visible');
        completeRaceRun();
      }
    } else {
      state.landingHoldTimer = Math.max(0, state.landingHoldTimer - dt * 1.5);
      statusText.textContent = '進入降落坪 — 請按 S 緩慢下降並減速接地';
      barFill.style.width = `${(state.landingHoldTimer / 1.1) * 100}%`;
    }
  } else {
    state.landingHoldTimer = 0;
    landingIndicator.classList.remove('visible');
  }
}

// ============================================================================
// 14. CAMERA & SHONAN COASTAL ANIMATIONS (ENODEN TRAIN & WAVES)
// ============================================================================
const smoothCamPos = new THREE.Vector3(0, 3.3, 6.8);
const smoothLookAt = new THREE.Vector3(0, 2.1, -16);

function updateCameraAndWorldAnimations(dt) {
  updateShadowFrustum();
  updateTreeWind(dt);
  // 1. Camera Follow / FPV / 3-Axis Gimbal Nadir (with subtle VRS propwash vibration)
  const fX = -Math.sin(drone.yaw);
  const fZ = -Math.cos(drone.yaw);
  const vrs = drone.vrsSeverity || 0;
  const tShake = performance.now() * 0.001;
  const shakeX = vrs > 0.12 ? (Math.sin(tShake * 27.3) * 0.048 + Math.cos(tShake * 41.7) * 0.028) * vrs : 0;
  const shakeY = vrs > 0.12 ? (Math.cos(tShake * 31.1) * 0.042 + Math.sin(tShake * 47.9) * 0.024) * vrs : 0;
  const shakeZ = vrs > 0.12 ? (Math.sin(tShake * 23.9) * 0.048 + Math.cos(tShake * 37.3) * 0.028) * vrs : 0;
  const shakeRoll = vrs > 0.12 ? (Math.sin(tShake * 21.5) * 0.014 + Math.cos(tShake * 35.1) * 0.008) * vrs : 0;

  if (state.cameraMode === 'chase') {
    const targetCam = new THREE.Vector3(
      drone.pos.x - fX * 6.8 + shakeX,
      drone.pos.y + 2.1 + shakeY,
      drone.pos.z - fZ * 6.8 + shakeZ
    );
    const targetLook = new THREE.Vector3(
      drone.pos.x + fX * 16.0 - shakeX * 1.2,
      drone.pos.y + 0.9 - shakeY * 1.2,
      drone.pos.z + fZ * 16.0 - shakeZ * 1.2
    );

    smoothCamPos.lerp(targetCam, Math.min(1, 9.5 * dt));
    smoothLookAt.lerp(targetLook, Math.min(1, 12.0 * dt));

    camera.position.copy(smoothCamPos);
    camera.lookAt(smoothLookAt);
    if (vrs > 0.12) camera.rotation.z += shakeRoll;
    playerDroneMesh.root.visible = true;
  } else if (state.cameraMode === 'down') {
    // 3-Axis Gyro-Stabilized EO/IR Targeting Pod: isolates 85%+ of airframe roll/pitch vibration
    camera.position.set(drone.pos.x + shakeX * 0.25, drone.pos.y + shakeY * 0.2, drone.pos.z + shakeZ * 0.25);
    camera.rotation.set(-Math.PI / 2 + shakeY * 0.12, drone.yaw + shakeRoll * 0.25, shakeRoll * 0.3, 'YXZ');
    playerDroneMesh.root.visible = false;
  } else {
    // FPV View (hard-mounted nose camera shows airframe attitude + subtle high-freq vibration)
    camera.position.set(drone.pos.x + fX * 0.8 + shakeX * 0.25, drone.pos.y + 0.06 + shakeY * 0.25, drone.pos.z + fZ * 0.8 + shakeZ * 0.25);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = drone.yaw + shakeRoll * 0.3;
    camera.rotation.x = drone.pitch * 0.65 + shakeY * 0.08;
    camera.rotation.z = drone.roll * 0.55 + shakeRoll * 0.6;
    playerDroneMesh.root.visible = false;
  }

  for (const {car, direction, speed} of roadVehicles) {
    car.position.x += direction * speed * dt;
    if (car.position.x > CITY_BOUNDS.halfWidth) car.position.x = -CITY_BOUNDS.halfWidth;
    if (car.position.x < -CITY_BOUNDS.halfWidth) car.position.x = CITY_BOUNDS.halfWidth;
  }

  if (cityTrain) {
    if (trainStopRemaining > 0) {
      trainStopRemaining -= dt;
    } else {
      const previousX = cityTrain.position.x;
      cityTrain.position.x -= 16.5 * dt;
      if (previousX > 26 && cityTrain.position.x <= 26) {
        cityTrain.position.x = 26;
        trainStopRemaining = 4;
      }
      if (cityTrain.position.x < -CITY_BOUNDS.halfWidth - 28) cityTrain.position.x = CITY_BOUNDS.halfWidth + 10;
    }
    for (const { arm, side, crossX } of crossingArms) {
      const trainAtCrossing = cityTrain.position.x < crossX + 20 && cityTrain.position.x > crossX - 56;
      const target = trainAtCrossing ? 0 : -side * Math.PI / 2;
      arm.rotation.z += (target - arm.rotation.z) * Math.min(1, dt * 4);
    }
  }
}

// ============================================================================
// 15. HUD TELEMETRY, COMPASS & COASTAL RADAR MINIMAP
// ============================================================================
const compassCanvas = document.getElementById('compass-canvas');
const compassCtx = compassCanvas.getContext('2d');
const minimapCanvas = document.getElementById('minimap-canvas');
const minimapCtx = minimapCanvas.getContext('2d');
const fullmapCanvas = document.getElementById('fullmap-canvas');
const fullmapCtx = fullmapCanvas.getContext('2d');

function formatRaceTime(sec) {
  const mins = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${String(mins).padStart(2, '0')}:${rem.toFixed(2).padStart(5, '0')}`;
}

function updateHUD(dt) {
  if (state.raceActive && !state.countdownActive && state.gameMode !== 'free_flight') {
    state.elapsedTime += dt;

    if (state.gameMode === 'versus_race' && state.currentPlayer === 1) {
      state.recordSampleAccum += dt;
      if (state.recordSampleAccum >= 0.05) {
        state.recordSampleAccum = 0;
        state.currentRecording.push({
          t: state.elapsedTime,
          x: drone.pos.x,
          y: drone.pos.y,
          z: drone.pos.z,
          yaw: drone.yaw
        });
      }
    }

    if (
      state.gameMode === 'versus_race' &&
      state.currentPlayer === 2 &&
      state.p1GhostRecording.length > 1
    ) {
      ghostDroneMesh.root.visible = true;
      const rec = state.p1GhostRecording;
      let sample = rec[rec.length - 1];
      for (let i = 0; i < rec.length; i++) {
        if (rec[i].t >= state.elapsedTime) {
          sample = rec[i];
          break;
        }
      }
      ghostDroneMesh.root.position.set(sample.x, sample.y, sample.z);
      ghostDroneMesh.root.rotation.set(0, sample.yaw, 0);
    } else {
      ghostDroneMesh.root.visible = false;
    }
  }

  const isTraining = state.gameMode === 'training' || state.gameMode === 'single_race';
  const totalTime = state.elapsedTime + state.penaltyTime;
  document.getElementById('hud-timer').textContent = formatRaceTime(totalTime);

  const isTactical = state.gameMode === 'tactical_strike';
  const progLabel = document.getElementById('hud-progress-label');
  const penLabel = document.getElementById('hud-penalty-label');
  const penEl = document.getElementById('hud-penalty');

  if (isTactical) {
    const tanksDestroyed = tacticalState.targets.filter(t => t.type === 'tank' && t.destroyed).length;
    const radarDestroyed = tacticalState.targets.filter(t => t.type === 'radar' && t.destroyed).length;
    const depotDestroyed = tacticalState.targets.filter(t => t.type === 'ammo' && t.destroyed).length;
    const totalDestroyed = tanksDestroyed + radarDestroyed + depotDestroyed;
    const totalTargets = tacticalState.targets.length;

    if (progLabel) progLabel.textContent = '打擊戰果';
    document.getElementById('hud-gate-progress').textContent = `${totalDestroyed} / ${totalTargets}`;
    if (penLabel) penLabel.textContent = '任務剩餘配額';
    if (penEl) {
      penEl.textContent = `${TACTICAL_BOMB_LIMIT - tacticalState.bombsDropped} / ${TACTICAL_BOMB_LIMIT}`;
      penEl.style.color = 'var(--cyan)';
    }

    // Tactical Command HUD Banner update
    const tacCard = document.getElementById('tactical-hud-card');
    if (tacCard) {
      if (state.raceActive) {
        tacCard.classList.remove('hidden');
        updateCCIP();
        const bombCountEl = document.getElementById('tactical-bomb-count');
        if (bombCountEl) {
          bombCountEl.textContent = `剩餘持彈 ${tacticalState.bombsRemaining} / ${tacticalState.maxBombs}`;
        }
        const chipTank = document.getElementById('tac-chip-tank');
        if (chipTank) {
          chipTank.textContent = `TANK 坦克 ${tanksDestroyed}/2`;
          chipTank.classList.toggle('done', tanksDestroyed === 2);
        }
        const chipRadar = document.getElementById('tac-chip-radar');
        if (chipRadar) {
          chipRadar.textContent = `RADAR 雷達 ${radarDestroyed}/1`;
          chipRadar.classList.toggle('done', radarDestroyed === 1);
        }
        const chipDepot = document.getElementById('tac-chip-depot');
        if (chipDepot) {
          chipDepot.textContent = `DEPOT 彈藥庫 ${depotDestroyed}/1`;
          chipDepot.classList.toggle('done', depotDestroyed === 1);
        }
        checkTacticalMissionProgress();
      } else {
        tacCard.classList.add('hidden');
        if (ccipMarkerMesh) ccipMarkerMesh.visible = false;
      }
    }
  } else if (isTraining) {
    if (progLabel) progLabel.textContent = '任務進度';
    document.getElementById('hud-gate-progress').textContent = `${state.trainingStep} / 6`;
    if (penLabel) penLabel.textContent = '碰撞';
    if (penEl) {
      penEl.textContent = `${state.collisionCount} 次`;
      penEl.style.color = 'var(--amber)';
    }
    const tacCard = document.getElementById('tactical-hud-card');
    if (tacCard) tacCard.classList.add('hidden');
  } else {
    if (progLabel) progLabel.textContent = '通過檢查門';
    document.getElementById('hud-gate-progress').textContent = `${state.currentGateIndex} / ${COURSE_GATES.length}`;
    if (penLabel) penLabel.textContent = '罰時';
    if (penEl) {
      penEl.textContent = `+${state.penaltyTime.toFixed(1)}s`;
      penEl.style.color = '#f87171';
    }
    const tacCard = document.getElementById('tactical-hud-card');
    if (tacCard) tacCard.classList.add('hidden');
  }

  // Update Minimap Title Header dynamically
  const mapTitle = document.getElementById('minimap-title-text');
  if (mapTitle) {
    mapTitle.textContent = isTactical ? '戰術態勢雷達 (北方朝上)' : '城市航圖 (北方朝上)';
  }

  // Interactive Training Guide Card update
  const trainCard = document.getElementById('training-guide-card');
  if (trainCard) {
    if (isTraining && state.raceActive) {
      trainCard.classList.remove('hidden');
      const curTask = TRAINING_TASKS[state.trainingStep - 1] || TRAINING_TASKS[0];
      const stepBadge = document.getElementById('training-step-badge');
      if (stepBadge) stepBadge.textContent = `TASK 0${state.trainingStep} / 06`;
      const stepTitle = document.getElementById('training-task-title');
      if (stepTitle) stepTitle.textContent = curTask.title;
      const stepInst = document.getElementById('training-instruction');
      if (stepInst) {
        stepInst.innerHTML = state.keymapMode === 'dual' ? `${curTask.descDual}` : `${curTask.descSingle}`;
      }

      const barFill = document.getElementById('training-bar-fill');
      const statusText = document.getElementById('training-status-text');

      if (state.trainingStep === 1) {
        const pct = Math.min(100, (state.trainingHoverTime / 2.0) * 100);
        if (barFill) barFill.style.width = `${pct}%`;
        const curAgl = Math.max(0, drone.pos.y - 0.95);
        if (statusText) statusText.textContent = `高度 ${curAgl.toFixed(1)}m (懸停 ${pct.toFixed(0)}%)`;
      } else if (state.trainingStep >= 2 && state.trainingStep <= 5) {
        const gateIdx = state.trainingStep - 2;
        const g = COURSE_GATES[gateIdx];
        const dist = Math.round(Math.hypot(drone.pos.x - g.pos.x, drone.pos.y - g.pos.y, drone.pos.z - g.pos.z));
        if (statusText) statusText.textContent = `距離目標: ${dist}m`;
        const pct = Math.max(0, Math.min(100, (1 - dist / 75) * 100));
        if (barFill) barFill.style.width = `${pct}%`;
      } else if (state.trainingStep === 6) {
        const distPad = Math.round(Math.hypot(drone.pos.x - HELIPAD_POS.x, drone.pos.z - HELIPAD_POS.z));
        const curAgl = Math.max(0, drone.pos.y - 0.95);
        if (statusText) statusText.textContent = `距離起降坪: ${distPad}m (高度 ${curAgl.toFixed(1)}m)`;
        const pct = Math.max(0, Math.min(100, (1 - distPad / 150) * 100));
        if (barFill) barFill.style.width = `${pct}%`;
      }

      // Visualizer key hint highlighting
      const hintKeys = state.keymapMode === 'dual' ? curTask.keysDual : curTask.keysSingle;
      document.querySelectorAll('.k-cap').forEach(el => {
        el.classList.toggle('hint-active', hintKeys.includes(el.id));
      });
    } else {
      trainCard.classList.add('hidden');
      document.querySelectorAll('.k-cap').forEach(el => el.classList.remove('hint-active'));
    }
  }

  const hMps = Math.hypot(drone.vel.x, drone.vel.z);
  const kmh = Math.round(hMps * 3.6);
  const ground = isTactical ? wildernessHeight(drone.pos.x,drone.pos.z) : 0;
  const agl = Math.max(0, drone.pos.y - ground - .95);

  document.getElementById('hud-mps').textContent = `${hMps.toFixed(1)} m/s`;
  document.getElementById('hud-speed').textContent = kmh;
  document.getElementById('bar-speed').style.width = `${Math.min(100, (kmh / 100) * 100)}%`;

  document.getElementById('hud-altitude').textContent = agl.toFixed(1);
  document.getElementById('bar-altitude').style.width = `${Math.min(100, (agl / PHYSICS.maxAltitude) * 100)}%`;

  document.getElementById('hud-vspeed').textContent = drone.vel.y.toFixed(1);
  const throttleStateEl = document.getElementById('hud-throttle-state');
  if (throttleStateEl) {
    if (drone.vrsSeverity > 0.25) {
      throttleStateEl.textContent = '渦環亂流 VRS';
      throttleStateEl.style.color = '#ef4444';
    } else if (drone.groundEffectFactor > 1.04) {
      throttleStateEl.textContent = `地面效應 IGE +${Math.round((drone.groundEffectFactor - 1) * 100)}%`;
      throttleStateEl.style.color = '#10b981';
    } else if (isTactical && tacticalState.bombsRemaining > 0) {
      throttleStateEl.textContent = `掛載 +${(tacticalState.bombsRemaining * 1.6).toFixed(1)}kg`;
      throttleStateEl.style.color = '#cbd5e1';
    } else {
      throttleStateEl.textContent = state.flightMode === 'sport' ? '運動手動' : '自動定高';
      throttleStateEl.style.color = '';
    }
  }
  const pitchDeg = Math.round((-drone.pitch * 180) / Math.PI);
  const rollDeg = Math.round((-drone.roll * 180) / Math.PI);
  document.getElementById('hud-attitude').textContent = `P: ${pitchDeg}° / R: ${rollDeg}°`;

  const horizonGroup = document.getElementById('horizon-dynamic-group');
  if (horizonGroup) {
    horizonGroup.setAttribute(
      'transform',
      `translate(0, ${pitchDeg * 1.45}) rotate(${rollDeg})`
    );
  }

  // Downward Military Optic Reticle & Wind Vector Integration
  const horizonSvg = document.getElementById('horizon-svg');
  const nadirOpticsSvg = document.getElementById('nadir-optics-svg');
  const reticleContainer = document.getElementById('reticle-container');
  const btnZoom = document.getElementById('btn-zoom');
  const isDownCam = state.cameraMode === 'down';


  // Item 5: Telemetry card dimming in downward optic view
  const telemCard = document.getElementById('hud-telemetry-card');
  if (telemCard) telemCard.classList.toggle('dimmed', isDownCam);

  if (isDownCam) {
    if (horizonSvg) horizonSvg.classList.add('hidden');
    if (nadirOpticsSvg) nadirOpticsSvg.classList.remove('hidden');
    if (reticleContainer) reticleContainer.classList.add('down-mode');
    if (btnZoom) btnZoom.classList.remove('hidden');

    const magEl = document.getElementById('nadir-mag-val');
    if (magEl) magEl.textContent = `${(state.downZoom || 1).toFixed(1)}X`;

    const zoomLabel = document.getElementById('zoom-label');
    if (zoomLabel) zoomLabel.textContent = `${(state.downZoom || 1).toFixed(1)}X`;

    const nadirAgl = document.getElementById('nadir-agl-val');
    if (nadirAgl) nadirAgl.textContent = `${agl.toFixed(1)}m`;

    const nadirArm = document.getElementById('nadir-arm-status');
    if (nadirArm) {
      if (agl >= 6.0) {
        nadirArm.textContent = 'READY (≥6m)';
        nadirArm.setAttribute('fill', '#10b981');
      } else {
        nadirArm.textContent = 'DUD RISK (<6m)';
        nadirArm.setAttribute('fill', '#f59e0b');
      }
    }

    // Dynamic wind deflection vector on reticle (with altitude wind shear)
    const w = (typeof WEATHER_PROFILES !== 'undefined' && WEATHER_PROFILES[state.weather]) ? WEATHER_PROFILES[state.weather] : null;
    if (w) {
      const curWind = (w.windSpeed || 0) * computeWindShearMultiplier(agl);
      const wAng = w.windAngle || 0.4;
      const wx = Math.cos(wAng) * curWind;
      const wz = Math.sin(wAng) * curWind;

      // Drone forward and right vectors
      const fX = -Math.sin(drone.yaw);
      const fZ = -Math.cos(drone.yaw);
      const rX = Math.cos(drone.yaw);
      const rZ = -Math.sin(drone.yaw);

      const windRight = wx * rX + wz * rZ;
      const windForward = wx * fX + wz * fZ;

      const zScale = state.downZoom || 1;
      const pX = windRight * 4.2 * zScale;
      const pY = -windForward * 4.2 * zScale;
      const len = Math.hypot(pX, pY);
      const maxL = 110;
      const clX = len > maxL ? (pX / len) * maxL : pX;
      const clY = len > maxL ? (pY / len) * maxL : pY;

      const windLine = document.getElementById('nadir-wind-line');
      if (windLine) {
        windLine.setAttribute('x2', clX.toFixed(1));
        windLine.setAttribute('y2', clY.toFixed(1));
      }
      const windPip = document.getElementById('nadir-wind-pip');
      if (windPip) {
        windPip.setAttribute('cx', clX.toFixed(1));
        windPip.setAttribute('cy', clY.toFixed(1));
      }
      const windGroup = document.getElementById('nadir-wind-group');
      if (windGroup) {
        windGroup.style.display = curWind > 0.3 ? '' : 'none';
      }
      const windVal = document.getElementById('nadir-wind-val');
      if (windVal) {
        windVal.textContent = curWind > 0.1 ? `W: ${curWind.toFixed(1)}m/s` : 'W: CALM';
      }
    }

    // Item 7: Off-Screen Target Pointers (Beyond Visual Range Target Cueing)
    const offscreenGroup = document.getElementById('nadir-offscreen-group');
    if (offscreenGroup) {
      if (isTactical && state.raceActive) {
        let pointersHtml = '';
        const fovMap = { 1: 62, 2: 32, 4: 16 };
        const curFov = fovMap[state.downZoom] || 62;
        const halfFovRad = (curFov * Math.PI / 180) * 0.5;

        const fX = -Math.sin(drone.yaw);
        const fZ = -Math.cos(drone.yaw);
        const rX = Math.cos(drone.yaw);
        const rZ = -Math.sin(drone.yaw);

        const boundX = 182;
        const boundY = 116;

        tacticalState.targets.forEach((t) => {
          if (t.destroyed) return;

          const dx = t.pos.x - drone.pos.x;
          const dz = t.pos.z - drone.pos.z;
          const dist = Math.hypot(dx, dz);
          const alt = Math.max(1.0, drone.pos.y - t.pos.y);
          const scale = 180 / (alt * Math.tan(halfFovRad));

          const relRight = dx * rX + dz * rZ;
          const relForward = dx * fX + dz * fZ;
          const svgTargetX = relRight * scale;
          const svgTargetY = -relForward * scale;

          // Target is off-screen when outside optical reticle frame
          const isOffScreen = Math.abs(svgTargetX) > boundX || Math.abs(svgTargetY) > boundY;
          if (isOffScreen && dist > 3.0) {
            const dirX = relRight / dist;
            const dirY = -relForward / dist; // In SVG, Up is -Y

            const s = Math.min(boundX / Math.abs(dirX), boundY / Math.abs(dirY));
            const px = dirX * s;
            const py = dirY * s;
            const angleDeg = Math.atan2(dirY, dirX) * (180 / Math.PI);

            let tName = 'TGT';
            let col = '#ef4444';
            if (t.id === 'tank_alpha') { tName = 'T1'; col = '#ef4444'; }
            else if (t.id === 'tank_bravo') { tName = 'T2'; col = '#ef4444'; }
            else if (t.type === 'radar') { tName = 'RADAR'; col = '#f59e0b'; }
            else if (t.type === 'ammo') { tName = 'DEPOT'; col = '#38bdf8'; }

            const labelStr = `${tName} ${Math.round(dist)}m`;
            const badgeW = labelStr.length * 6.0 + 8;
            const tagX = px - dirX * 15;
            const tagY = py - dirY * 15;

            pointersHtml += `
              <g class="offscreen-pointer" opacity="0.95">
                <polygon points="5,0 -4,-3.5 -2,0 -4,3.5" fill="${col}" stroke="rgba(0,0,0,0.8)" stroke-width="0.8" transform="translate(${px.toFixed(1)}, ${py.toFixed(1)}) rotate(${angleDeg.toFixed(1)})" />
                <rect x="${(tagX - badgeW / 2).toFixed(1)}" y="${(tagY - 6.5).toFixed(1)}" width="${badgeW.toFixed(1)}" height="13" rx="3" fill="rgba(10, 17, 28, 0.88)" stroke="${col}" stroke-width="0.8" />
                <text x="${tagX.toFixed(1)}" y="${(tagY + 3.2).toFixed(1)}" text-anchor="middle" fill="#f8fafc" font-size="8.5" font-family="'JetBrains Mono', monospace" font-weight="700">${labelStr}</text>
              </g>
            `;
          }
        });
        offscreenGroup.innerHTML = pointersHtml;
      } else {
        offscreenGroup.innerHTML = '';
      }
    }
  } else {
    if (horizonSvg) horizonSvg.classList.remove('hidden');
    if (nadirOpticsSvg) nadirOpticsSvg.classList.add('hidden');
    if (reticleContainer) reticleContainer.classList.remove('down-mode');
    if (btnZoom) btnZoom.classList.add('hidden');
    const offscreenGroup = document.getElementById('nadir-offscreen-group');
    if (offscreenGroup) offscreenGroup.innerHTML = '';
  }

  const nextBanner = document.getElementById('hud-next-target');
  nextBanner.parentElement.style.display = isTactical ? 'none' : '';
  if (!isTactical) {
    if (state.gameMode === 'free_flight') {
      nextBanner.textContent = '自由空拍模式 — 探索車站、街廓與市民公園';
    } else if (isTraining) {
      const curTask = TRAINING_TASKS[state.trainingStep - 1] || TRAINING_TASKS[0];
      nextBanner.textContent = curTask.targetText;
    } else if (state.currentGateIndex < COURSE_GATES.length) {
      const g = COURSE_GATES[state.currentGateIndex];
      const dist = Math.round(
        Math.hypot(drone.pos.x - g.pos.x, drone.pos.y - g.pos.y, drone.pos.z - g.pos.z)
      );
      nextBanner.textContent = `${g.name} (距離 ${dist}m / 高度 ${g.pos.y}m)`;
    } else {
      const distPad = Math.round(Math.hypot(drone.pos.x - HELIPAD_POS.x, drone.pos.z - HELIPAD_POS.z));
      nextBanner.textContent = `返回市區 H 起降坪降落 (距離 ${distPad}m)`;
    }
  }

  document.getElementById('hud-coords').textContent = `X:${Math.round(drone.pos.x)}m Z:${Math.round(drone.pos.z)}m`;

  drawCompassTape();
  drawTacticalMap(minimapCtx, minimapCanvas.width, minimapCanvas.height, false);
}

function drawCompassTape() {
  const w = compassCanvas.width;
  const h = compassCanvas.height;
  compassCtx.clearRect(0, 0, w, h);

  let heading = ((-drone.yaw * 180) / Math.PI) % 360;
  if (heading < 0) heading += 360;

  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const cardDir = dirs[Math.round(heading / 45) % 8];
  document.getElementById('hud-heading-text').textContent = `${String(Math.round(heading)).padStart(3, '0')}° ${cardDir}`;

  const pxPerDeg = 3.2;
  compassCtx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
  compassCtx.fillStyle = '#e2e8f0';
  compassCtx.font = '600 11px "Segoe UI", sans-serif';
  compassCtx.textAlign = 'center';

  for (let deg = -90; deg <= 450; deg += 15) {
    const diff = deg - heading;
    const x = w / 2 + diff * pxPerDeg;
    if (x < 0 || x > w) continue;

    const normDeg = ((deg % 360) + 360) % 360;
    const isCardinal = normDeg % 45 === 0;
    compassCtx.beginPath();
    compassCtx.moveTo(x, h - (isCardinal ? 14 : 8));
    compassCtx.lineTo(x, h);
    compassCtx.stroke();

    if (isCardinal) {
      const label = dirs[Math.round(normDeg / 45) % 8];
      compassCtx.fillStyle = label === 'N' ? '#00f0ff' : '#cbd5e1';
      compassCtx.fillText(label, x, 15);
    }
  }
}

function drawTacticalMap(ctx, w, h, isFull) {
  ctx.fillStyle = '#0b1329';
  ctx.fillRect(0, 0, w, h);

  const width = CITY.maxX - CITY.minX;
  const depth = CITY.maxZ - CITY.minZ;
  const centerZ = (CITY.minZ + CITY.maxZ) / 2;
  const wilderness = state.gameMode === 'tactical_strike';
  const mapCenterZ = wilderness ? -133 : (CITY_BOUNDS.north + CITY_BOUNDS.south) / 2;
  const mapWidth = wilderness ? 400 : CITY_BOUNDS.halfWidth * 2;
  const mapDepth = wilderness ? 365 : CITY_BOUNDS.south - CITY_BOUNDS.north;
  const scale = Math.min((w - 16) / mapWidth, (h - 16) / mapDepth);
  const toMapX = wx => w / 2 + wx * scale;
  const toMapY = wz => h / 2 + (wz - mapCenterZ) * scale;

  function rectangle(x, z, width, depth, color) {
    ctx.fillStyle = color;
    ctx.fillRect(toMapX(x - width / 2), toMapY(z - depth / 2), width * scale, depth * scale);
  }
  if (wilderness) {
    rectangle(0, mapCenterZ, mapWidth, mapDepth, '#374a35');
    ctx.strokeStyle = '#bb9d74';
    ctx.lineWidth = Math.max(1.2, 5 * scale);
    ctx.lineJoin = 'round';
    for (const road of wildernessRoads) {
      ctx.beginPath();
      road.forEach(([x,z],i) => {
        if (i === 0) ctx.moveTo(toMapX(x),toMapY(z));
        else ctx.lineTo(toMapX(x),toMapY(z));
      });
      ctx.stroke();
    }
    ctx.lineJoin = 'miter';
  } else {
    rectangle(0, mapCenterZ, mapWidth, mapDepth, '#273549');
    for (const [x, z, w, d, green] of outerMapCourtyards) {
      rectangle(x, z, w, d, green ? '#395c4a' : '#343f4e');
    }
    ctx.strokeStyle = '#526173';
    ctx.lineCap = 'round';
    for (const [x1, z1, x2, z2, roadWidth] of outerMapRoads) {
      ctx.lineWidth = roadWidth * scale;
      ctx.beginPath();
      ctx.moveTo(toMapX(x1), toMapY(z1));
      ctx.lineTo(toMapX(x2), toMapY(z2));
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
    rectangle(0, centerZ, width, depth, '#273549');
    CITY.avenues.forEach(x => rectangle(x, centerZ, CITY.avenueWidth, depth, '#526173'));
    CITY.streets.forEach(z => rectangle(0, z, width, CITY.streetWidth, '#526173'));
    cityMapAreas.forEach(area => rectangle(area.x, area.z, area.w, area.d, area.color));
    townMapFeatures.forEach(feature => rectangle(feature.x, feature.z, feature.w, feature.d, feature.color));
    rectangle(0, RAILWAY_Z, CITY_BOUNDS.halfWidth * 2, 3.2, '#e6ad57');
    if (isFull) {
      ctx.font = 'bold 12px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#172232';
      ctx.fillStyle = '#f2eee6';
      const overviewLabels = ['中央車站', '市民公園', '商辦區', '起降廣場'];
      cityLandmarks.forEach(({name, x, z}) => {
        if (!overviewLabels.includes(name)) return;
        ctx.strokeText(name, toMapX(x), toMapY(z) - 6);
        ctx.fillText(name, toMapX(x), toMapY(z) - 6);
      });
      ctx.textAlign = 'start';
    }

    // 4. Course Path Dashed Line
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(toMapX(HELIPAD_POS.x), toMapY(HELIPAD_POS.z));
    COURSE_GATES.forEach((g) => {
      ctx.lineTo(toMapX(g.pos.x), toMapY(g.pos.z));
    });
    ctx.lineTo(toMapX(HELIPAD_POS.x), toMapY(HELIPAD_POS.z));
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (state.gameMode === 'tactical_strike') {
    // Draw FARP
    const returnX = toMapX(0), returnY = toMapY(0);
    const landingRing = Math.max(5,FARP_LANDING_RADIUS * scale);
    const returning = state.raceActive && (tacticalState.bombsDropped >= TACTICAL_BOMB_LIMIT
      || tacticalState.targets.every((target) => target.destroyed));
    ctx.strokeStyle = returning ? '#fcd34d' : '#34d399';
    ctx.lineWidth = returning ? 2.6 : 1.4;
    ctx.beginPath();
    ctx.arc(returnX,returnY,landingRing,0,Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.arc(returnX,returnY,2,0,Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 9px sans-serif';
    ctx.fillText(returning ? '返航降落' : '返航點', returnX + landingRing + 3, returnY + 3);

    // Draw Tactical Targets with Military Symbols
    tacticalState.targets.forEach((t) => {
      const tx = toMapX(t.pos.x);
      const ty = toMapY(t.pos.z);

      if (t.destroyed) {
        // Destroyed target mark: dark grey X
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(tx - 4, ty - 4);
        ctx.lineTo(tx + 4, ty + 4);
        ctx.moveTo(tx + 4, ty - 4);
        ctx.lineTo(tx - 4, ty + 4);
        ctx.stroke();

        ctx.fillStyle = '#64748b';
        ctx.font = 'bold 8px "JetBrains Mono", sans-serif';
        const label = t.type === 'tank' ? 'T(滅)' : (t.type === 'radar' ? 'R(滅)' : 'A(滅)');
        ctx.fillText(t.type === 'ammo' ? 'DEPOT ×' : label, tx + 6, ty + 3);
      } else {
        // Active Enemy Target
        ctx.fillStyle = '#ef4444';
        ctx.strokeStyle = '#fca5a5';
        ctx.lineWidth = 1;

        if (t.type === 'tank') {
          // Tank: Red circle with border and T icon
          ctx.beginPath();
          ctx.arc(tx, ty, isFull ? 6 : 4.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#fef08a';
          ctx.font = 'bold 8.5px "JetBrains Mono", sans-serif';
          ctx.fillText(t.id === 'tank_alpha' ? 'T1' : 'T2', tx + 6, ty + 3);
        } else if (t.type === 'radar') {
          // Radar: Red diamond with pulse
          ctx.save();
          ctx.translate(tx, ty);
          ctx.rotate(Math.PI / 4);
          ctx.fillRect(-4.5, -4.5, 9, 9);
          ctx.strokeRect(-4.5, -4.5, 9, 9);
          ctx.restore();

          // Radar subtle wave arc
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.45)';
          ctx.beginPath();
          ctx.arc(tx, ty, 8, -Math.PI / 3, Math.PI / 3);
          ctx.stroke();

          ctx.fillStyle = '#fca5a5';
          ctx.font = 'bold 8.5px "JetBrains Mono", sans-serif';
          ctx.fillText('RADAR', tx + 7, ty + 3);
        } else if (t.type === 'ammo') {
          // Ammo Depot: Red square
          ctx.fillRect(tx - 4.5, ty - 4.5, 9, 9);
          ctx.strokeRect(tx - 4.5, ty - 4.5, 9, 9);

          ctx.fillStyle = '#fca5a5';
          ctx.font = 'bold 8.5px "JetBrains Mono", sans-serif';
          ctx.fillText('DEPOT', tx + 7, ty + 3);
        }
      }
    });

    // Draw CCIP projected crosshair on tactical radar
    if (ccipMarkerMesh && ccipMarkerMesh.visible) {
      const cx = toMapX(ccipMarkerMesh.position.x);
      const cy = toMapY(ccipMarkerMesh.position.z);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  if (!wilderness) {
    // 5. Helipad H-Pad Marker
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(toMapX(HELIPAD_POS.x), toMapY(HELIPAD_POS.z), isFull ? 7 : 4.5, 0, Math.PI * 2);
    ctx.fill();

    // 6. Course Gates
    const isTrainingMap = state.gameMode === 'training' || state.gameMode === 'single_race';
    COURSE_GATES.forEach((g, idx) => {
      const gx = toMapX(g.pos.x);
      const gy = toMapY(g.pos.z);
      if (isTrainingMap) {
        const targetGateIdx = state.trainingStep - 2;
        if (state.trainingStep === 1) {
          ctx.fillStyle = '#475569';
        } else if (idx < targetGateIdx) {
          ctx.fillStyle = '#64748b';
        } else if (idx === targetGateIdx) {
          ctx.fillStyle = '#10b981';
        } else {
          ctx.fillStyle = '#3b82f6';
        }
      } else {
        if (idx < state.currentGateIndex) {
          ctx.fillStyle = '#64748b';
        } else if (idx === state.currentGateIndex) {
          ctx.fillStyle = '#10b981';
        } else {
          ctx.fillStyle = '#3b82f6';
        }
      }
      ctx.beginPath();
      ctx.arc(gx, gy, isFull ? 4.5 : 4.2, 0, Math.PI * 2);
      ctx.fill();

      if (isFull) {
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 10px "Segoe UI", sans-serif';
        ctx.fillText('G' + g.id, gx + 6, gy + 3);
      }
    });
  }

  // 7. Drone Position & Heading Cone
  const dx = toMapX(drone.pos.x);
  const dy = toMapY(drone.pos.z);
  ctx.save();
  ctx.translate(dx, dy);
  ctx.rotate(-drone.yaw);

  ctx.fillStyle = 'rgba(0, 240, 255, 0.25)';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-10, -22);
  ctx.lineTo(10, -22);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#00f0ff';
  ctx.beginPath();
  ctx.arc(0, 0, isFull ? 6 : 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ============================================================================
// 16. UI CONTROLS & GAME FLOW (1P / 2P / FREE FLIGHT)
// ============================================================================
function updateKeyboardVisualizer(ctrl) {
  const setCap = (id, active) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('pressed', active);
  };

  if (state.keymapMode === 'dual') {
    setCap('key-top-l1', pressedKeys.has('KeyQ'));
    setCap('key-top-l2', ctrl.throttle > 0);
    setCap('key-top-l3', pressedKeys.has('KeyE'));
    setCap('key-bot-l1', ctrl.yaw > 0);
    setCap('key-bot-l2', ctrl.throttle < 0);
    setCap('key-bot-l3', ctrl.yaw < 0);

    setCap('key-top-r1', ctrl.pitch > 0);
    setCap('key-bot-r1', ctrl.roll < 0);
    setCap('key-bot-r2', ctrl.pitch < 0);
    setCap('key-bot-r3', ctrl.roll > 0);
  } else {
    setCap('key-top-l1', ctrl.yaw > 0);
    setCap('key-top-l2', ctrl.pitch > 0);
    setCap('key-top-l3', ctrl.yaw < 0);
    setCap('key-bot-l1', ctrl.roll < 0);
    setCap('key-bot-l2', ctrl.pitch < 0);
    setCap('key-bot-l3', ctrl.roll > 0);

    setCap('key-top-r1', ctrl.throttle > 0);
    setCap('key-bot-r2', ctrl.throttle < 0);
  }
}

function setSensorMode(mode) {
  const allowed = ['visible', 'flir_white', 'nvg'];
  state.sensorMode = allowed.includes(mode) ? mode : 'visible';

  const canvasContainer = document.getElementById('canvas-container');
  if (canvasContainer) {
    canvasContainer.className = state.sensorMode === 'visible' ? '' : `sensor-${state.sensorMode}`;
  }

  const labelMap = {
    visible: '彩色',
    flir_white: '白熱熱成像',
    nvg: '微光夜視'
  };
  const shortMap = {
    visible: 'VIS-RGB',
    flir_white: 'FLIR-WH',
    nvg: 'NVG-GRN'
  };

  const sensorLabel = document.getElementById('sensor-label');
  if (sensorLabel) sensorLabel.textContent = labelMap[state.sensorMode];

  const nadirSensor = document.getElementById('nadir-sensor-val');
  if (nadirSensor) nadirSensor.textContent = shortMap[state.sensorMode];


  applyTimeOfDay(state.timeOfDay);
  for (const t of tacticalState.targets) {
    if (t.type === 'tank') updateTankThermalSignature(t, state.elapsedTime);
    else if (t.type === 'radar' && t.thermal) updateRadarThermalSignature(t, state.elapsedTime);
  }

  audioEngine.playIRCutClick();
  showAnnouncement('OPTIC SENSOR', `切換感光模式：【${labelMap[state.sensorMode]}】`, state.sensorMode === 'flir_white' ? '#f59e0b' : (state.sensorMode === 'nvg' ? '#10b981' : '#00f0ff'));
}

function cycleSensorMode() {
  const modes = ['visible', 'flir_white', 'nvg'];
  const next = modes[(modes.indexOf(state.sensorMode) + 1) % modes.length];
  setSensorMode(next);
}

let vtxCanvas = null;
let vtxCtx = null;
let vtxNoiseCanvas = null;
let vtxNoisePattern = null;
let nvgNoisePatterns = [];

function initVTXOverlay() {
  vtxCanvas = document.getElementById('vtx-overlay-canvas');
  if (!vtxCanvas) return;
  vtxCtx = vtxCanvas.getContext('2d');

  vtxNoiseCanvas = document.createElement('canvas');
  vtxNoiseCanvas.width = 64;
  vtxNoiseCanvas.height = 64;
  const nCtx = vtxNoiseCanvas.getContext('2d');
  const imgData = nCtx.createImageData(64, 64);
  for (let i = 0; i < imgData.data.length; i += 4) {
    const val = Math.random() * 255;
    imgData.data[i] = val;
    imgData.data[i + 1] = val;
    imgData.data[i + 2] = val;
    imgData.data[i + 3] = Math.random() < 0.28 ? 32 : 0;
  }
  nCtx.putImageData(imgData, 0, 0);
  vtxNoisePattern = vtxCtx.createPattern(vtxNoiseCanvas, 'repeat');

  // Multi-frame high-frequency dynamic scintillation noise for real Gen 2/3 NVG
  nvgNoisePatterns = [];
  for (let f = 0; f < 4; f++) {
    const nvgC = document.createElement('canvas');
    nvgC.width = nvgC.height = 128;
    const nvgCtx = nvgC.getContext('2d');
    const nvgData = nvgCtx.createImageData(128, 128);
    for (let i = 0; i < nvgData.data.length; i += 4) {
      const spark = Math.random();
      if (spark < 0.48) {
        const bright = 135 + Math.random() * 120;
        nvgData.data[i] = Math.round(bright * 0.65);      // R
        nvgData.data[i + 1] = Math.round(bright);          // G (Phosphor green)
        nvgData.data[i + 2] = Math.round(bright * 0.60);   // B
        nvgData.data[i + 3] = Math.round(75 + Math.random() * 165);
      } else {
        nvgData.data[i + 3] = 0;
      }
    }
    nvgCtx.putImageData(nvgData, 0, 0);
    nvgNoisePatterns.push(vtxCtx.createPattern(nvgC, 'repeat'));
  }
}

function updateVTXOverlay(dt) {
  if (!vtxCanvas) {
    initVTXOverlay();
    if (!vtxCanvas) return;
  }

  const w = window.innerWidth;
  const h = window.innerHeight;
  if (vtxCanvas.width !== w || vtxCanvas.height !== h) {
    vtxCanvas.width = w;
    vtxCanvas.height = h;
    if (vtxNoiseCanvas) vtxNoisePattern = vtxCtx.createPattern(vtxNoiseCanvas, 'repeat');
  }

  vtxCtx.clearRect(0, 0, w, h);

  // 1. In Chase (Third-Person) mode, keep the view completely clean (external camera, no onboard VTX overlays)
  if (state.cameraMode !== 'chase') {
    // Dynamic Optical Lens Vignette for onboard lenses
    const cx = w * 0.5;
    const cy = h * 0.5;
    const maxR = Math.max(w, h) * 0.72;
    const minR = Math.min(w, h) * (state.cameraMode === 'down' ? (state.downZoom === 4 ? 0.22 : (state.downZoom === 2 ? 0.28 : 0.36)) : 0.35);

    let vignetteOpacity = 0.30;
    if (state.cameraMode === 'down') {
      vignetteOpacity = state.downZoom === 4 ? 0.75 : (state.downZoom === 2 ? 0.55 : 0.40);
    } else if (state.cameraMode === 'fpv') {
      vignetteOpacity = 0.35;
    }

    const vigGrad = vtxCtx.createRadialGradient(cx, cy, minR, cx, cy, maxR);
    vigGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vigGrad.addColorStop(1, `rgba(4, 9, 18, ${vignetteOpacity})`);
    vtxCtx.fillStyle = vigGrad;
    vtxCtx.fillRect(0, 0, w, h);

    // High-Zoom Circular Lens Barrel Mask for 4X Optic
    if (state.cameraMode === 'down' && state.downZoom === 4) {
      vtxCtx.strokeStyle = 'rgba(0, 240, 255, 0.25)';
      vtxCtx.lineWidth = 2.5;
      vtxCtx.beginPath();
      vtxCtx.arc(cx, cy, Math.min(w, h) * 0.46, 0, Math.PI * 2);
      vtxCtx.stroke();
    }

    // 2. Sensor Noise & Grain (Only active in Night Vision & FLIR; Visible RGB is clean HD digital feed)
    if (state.sensorMode === 'nvg') {
      // Military NVG Eyepiece Circular Iris Vignette
      const nvgTubeGrad = vtxCtx.createRadialGradient(cx, cy, Math.min(w, h) * 0.44, cx, cy, Math.max(w, h) * 0.72);
      nvgTubeGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      nvgTubeGrad.addColorStop(0.68, 'rgba(4, 20, 11, 0.22)');
      nvgTubeGrad.addColorStop(1, 'rgba(1, 8, 4, 0.75)');
      vtxCtx.fillStyle = nvgTubeGrad;
      vtxCtx.fillRect(0, 0, w, h);

      // Dynamic Phosphor Scintillation (Boiling electron snow)
      if (nvgNoisePatterns.length) {
        const nvgFrame = (Math.floor(performance.now() * 0.045) + ((Math.random() * 2) | 0)) % nvgNoisePatterns.length;
        vtxCtx.save();
        vtxCtx.globalAlpha = 0.20;
        const ox = (Math.random() * 128) | 0;
        const oy = (Math.random() * 128) | 0;
        vtxCtx.translate(ox, oy);
        vtxCtx.fillStyle = nvgNoisePatterns[nvgFrame];
        vtxCtx.fillRect(-ox, -oy, w + 128, h + 128);
        vtxCtx.restore();
      }
    } else if (state.sensorMode === 'flir_white') {
      // Subtle Microbolometer Fixed Pattern Noise (FPN)
      if (vtxNoisePattern) {
        vtxCtx.save();
        vtxCtx.globalAlpha = 0.05;
        const ox = (Math.random() * 64) | 0;
        const oy = (Math.random() * 64) | 0;
        vtxCtx.translate(ox, oy);
        vtxCtx.fillStyle = vtxNoisePattern;
        vtxCtx.fillRect(-ox, -oy, w + 64, h + 64);
        vtxCtx.restore();
      }
    }
  }

  // 5. Update Dynamic OSD Telemetry
  const latSec = (42.0 + Math.abs(drone.pos.z * 0.025)).toFixed(1);
  const lonSec = (15.0 + Math.abs(drone.pos.x * 0.025)).toFixed(1);
  const gpsText = `N 24°58'${latSec}"  E 121°31'${lonSec}"`;
  const gpsEl = document.getElementById('nadir-gps-val');
  if (gpsEl) gpsEl.textContent = gpsText;

  const ctrl = sampleFlightControls();
  const sag = (ctrl && (ctrl.throttle > 0 || ctrl.pitch > 0)) ? 0.6 : 0;
  const batVolt = Math.max(20.5, (22.8 - sag - state.elapsedTime * 0.0015)).toFixed(1);
  const batEl = document.getElementById('nadir-bat-val');
  if (batEl) batEl.textContent = `${batVolt}V`;

  const distFromCenter = Math.hypot(drone.pos.x, drone.pos.z);
  const rssi = Math.round(-38 - (distFromCenter / 300) * 20 + Math.sin(performance.now() * 0.003) * 2);
  const linkEl = document.getElementById('nadir-link-val');
  if (linkEl) linkEl.textContent = `VTX: ${rssi}dBm`;
}

function setDownZoom(zoomLevel) {
  const allowed = [1, 2, 4];
  state.downZoom = allowed.includes(zoomLevel) ? zoomLevel : 1;
  applyCameraZoom();

  const magEl = document.getElementById('nadir-mag-val');
  if (magEl) magEl.textContent = `${(state.downZoom || 1).toFixed(1)}X`;

  const zoomLabel = document.getElementById('zoom-label');
  if (zoomLabel) zoomLabel.textContent = `${(state.downZoom || 1).toFixed(1)}X`;

}

function cycleDownZoom() {
  const next = state.downZoom === 1 ? 2 : (state.downZoom === 2 ? 4 : 1);
  setDownZoom(next);
}

function applyCameraZoom() {
  if (state.cameraMode === 'down') {
    const fovMap = { 1: 62, 2: 32, 4: 16 };
    const targetFov = fovMap[state.downZoom] || 62;
    if (camera.fov !== targetFov) {
      camera.fov = targetFov;
      camera.updateProjectionMatrix();
    }
  } else {
    if (camera.fov !== 62) {
      camera.fov = 62;
      camera.updateProjectionMatrix();
    }
  }
}

function toggleCameraMode(forceMode) {
  const modes = ['chase', 'fpv', 'down'];
  state.cameraMode = modes.includes(forceMode) ? forceMode : modes[(modes.indexOf(state.cameraMode) + 1) % modes.length];
  const camLabel = document.getElementById('cam-label');
  if (camLabel) {
    camLabel.textContent = { chase: '追蹤視角', fpv: '第一人稱視角', down: '垂直下視' }[state.cameraMode];
  }
  const fpvOverlay = document.getElementById('fpv-overlay');
  if (fpvOverlay) {
    fpvOverlay.className = state.cameraMode === 'fpv' ? 'fpv-mode' : (state.cameraMode === 'down' ? 'down-mode' : 'chase-mode');
  }
  document.querySelectorAll('#opt-camera .opt-pill').forEach((pill) => {
    pill.classList.toggle('active', pill.dataset.val === state.cameraMode);
  });
  const cameraSummary = document.getElementById('menu-summary-camera');
  const cameraOption = document.querySelector('#opt-camera .opt-pill.active');
  if (cameraSummary && cameraOption) cameraSummary.textContent = cameraOption.dataset.description;
  applyCameraZoom();
}

function toggleFlightMode() {
  state.flightMode = state.flightMode === 'stabilized' ? 'sport' : 'stabilized';
  document.getElementById('fmode-label').textContent =
    state.flightMode === 'stabilized' ? '自穩定高' : '運動競速';
}

function toggleKeymapMode() {
  state.keymapMode = state.keymapMode === 'dual' ? 'single' : 'dual';
  const dual = state.keymapMode === 'dual';
  document.getElementById('keymap-label').textContent = dual ? '雙手推薦' : '單手配置';
  document.getElementById('left-cluster-title').textContent = dual ? '左手：升降與轉向' : '平移與轉向';
  document.getElementById('right-cluster-title').textContent = dual ? '右手：前後左右平移' : '升降（Shift／Ctrl 或 U／J）';
  document.getElementById('key-top-r1').textContent = dual ? '↑' : 'U';
  document.getElementById('key-bot-r2').textContent = dual ? '↓' : 'J';
  document.getElementById('key-bot-r1').hidden = !dual;
  document.getElementById('key-bot-r3').hidden = !dual;
  document.getElementById('boost-hint-key').textContent = dual ? 'Shift' : 'F';
  clearAllKeys();
}

function toggleAudio() {
  state.audioEnabled = !state.audioEnabled;
  document.getElementById('btn-audio').classList.toggle('active', state.audioEnabled);
  audioEngine.setMuted(!state.audioEnabled);
}

function toggleFullMap(open) {
  state.mapOpen = open;
  clearAllKeys();
  document.getElementById('fullmap-modal').classList.toggle('open', open);
  if (open) drawTacticalMap(fullmapCtx, fullmapCanvas.width, fullmapCanvas.height, true);
}

function toggleMenuModal(open) {
  state.menuOpen = open;
  clearAllKeys();
  const m = document.getElementById('menu-modal');
  if (m) {
    m.classList.toggle('hidden', !open);
    m.style.display = open ? 'flex' : 'none';
  }
}

function togglePauseMenu(open) {
  state.pauseOpen = open;
  clearAllKeys();
  const panel = document.getElementById('pause-modal');
  if (!open && panel.contains(document.activeElement)) document.activeElement.blur();
  panel.classList.toggle('hidden', !open);
  if (open) {
    document.getElementById('btn-abort-tactical').hidden =
      state.gameMode !== 'tactical_strike' || !state.raceActive;
    document.getElementById('btn-resume').focus();
  }
}

async function startRunSequence(playerNum = 1) {
  if (worldLoading) return false;
  try {
    audioEngine.init();
  } catch (e) {}

  togglePauseMenu(false);
  toggleFullMap(false);
  tacticalState.explosions.forEach(removeBlastEffect);
  tacticalState.explosions.length = 0;
  for (const {mesh,ownsResources,ownsGeometry} of tacticalState.debris) {
    if (ownsResources) disposeWorldObject(mesh);
    else {
      wildernessGroup.remove(mesh);
      if (ownsGeometry) mesh.geometry.dispose();
    }
  }
  tacticalState.debris.length = 0;
  for (const bomb of tacticalState.activeBombs) disposeWorldObject(bomb.mesh);
  tacticalState.activeBombs.length = 0;
  tacticalState.pendingExplosions.length = 0;
  if (!await loadWorldForMode(state.gameMode)) return false;
  toggleMenuModal(false);
  state.scoreboardOpen = false;

  const scoreModal = document.getElementById('scoreboard-modal');
  if (scoreModal) {
    scoreModal.classList.add('hidden');
  }
  const landingInd = document.getElementById('landing-indicator');
  if (landingInd) {
    landingInd.classList.remove('visible');
  }

  state.currentPlayer = playerNum;
  state.elapsedTime = 0;
  state.penaltyTime = 0;
  state.collisionCount = 0;
  state.currentGateIndex = 0;
  state.landingHoldTimer = 0;
  state.currentRecording = [];
  state.recordSampleAccum = 0;
  state.lastCheckpoint = { pos: { x: 0, y: 1.2, z: 0 }, yaw: 0 };

  const isTrainingRun = state.gameMode === 'training' || state.gameMode === 'single_race';
  if (isTrainingRun) {
    state.trainingStep = 1;
    state.trainingHoverTime = 0;
    state.trainingBrakeTime = 0;
  }

  resetDroneTransform(0, 1.2, 0, 0);
  updateGateVisualStates();

  const modeLabels = {
    training: '新手飛行訓練',
    single_race: '單人競速挑戰',
    versus_race: '雙人競速',
    free_flight: '城市自由空拍',
    tactical_strike: '戰場投彈'
  };

  const isTacticalMode = state.gameMode === 'tactical_strike';
  if (ccipMarkerMesh) ccipMarkerMesh.visible = false;

  if (isTacticalMode) {
    tacticalState.bombsRemaining = tacticalState.maxBombs;
    tacticalState.bombsDropped = 0;
    tacticalState.directHitBombs = 0;
    tacticalState.rearmTimer = 0;
    state.tacticalVictoryAnnounced = false;

    // Reset all targets
    tacticalState.targets.forEach((t) => {
      t.destroyed = false;
      t.coasting = false;
      t.coastSpeed = 0;
      t.trackDamaged = false;
      if (t.baseSpeed) t.patrolSpeed = t.baseSpeed;
      if (t.thermal) {
        if (t.type === 'tank') updateTankThermalSignature(t, 0);
        else if (t.type === 'radar') updateRadarThermalSignature(t, 0);
      }
      t.hp = t.maxHp;
      if (t.wreckFire && (t.type === 'radar' || t.type === 'ammo')) {
        if (t.wreckFire.group && t.wreckFire.group.parent) {
          t.wreckFire.group.parent.remove(t.wreckFire.group);
        }
        t.wreckFire = null;
        t.mesh.traverse((child) => {
          if (!child.isMesh || !child.material) return;
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach((m) => {
            if (m && m.userData?.wreckScorched) {
              if (typeof m.userData.origHex === 'number') m.color.setHex(m.userData.origHex);
              if (typeof m.userData.origRough === 'number') m.roughness = m.userData.origRough;
              m.userData.wreckScorched = false;
            }
          });
        });
      }
      if (t.type === 'ammo') t.mesh.children.forEach(part => { part.visible = true; });
      if (t.dish) t.dish.visible = true;
      if (t.armorMat) t.armorMat.color.setHex(0xffffff);
      if (t.turret) {
        t.turret.visible = true;
        t.turret.position.y = 1.38;
        t.turret.rotation.set(0,0,0);
        t.turretTargetYaw = 0;
        t.turretWait = 9 + Math.random() * 14;
      }
    });

    updateDroneBellyBombs();
  }
  const mb = document.getElementById('hud-mode-badge');
  if (mb) mb.textContent = modeLabels[state.gameMode] || '飛行操控訓練';
  const pl = document.getElementById('hud-player-label');
  if (pl) pl.textContent = isTrainingRun ? 'TRAINEE' : `PLAYER ${playerNum}`;

  if (state.gameMode === 'free_flight') {
    state.raceActive = true;
    state.countdownActive = false;
    showAnnouncement('FREE FLIGHT', '自由空拍模式 — 探索車站、街廓與市民公園', '#00f0ff');
    return;
  }

  state.countdownActive = true;
  state.countdownRemaining = 1.1;
  state.raceActive = false;
  if (isTacticalMode) return true;
  if (isTrainingRun) {
    showAnnouncement('FLIGHT TRAINING', state.keymapMode === 'dual' ? '任務 1：起飛並爬升至 10 公尺定高懸停' : '任務 1：按 Shift 或 U 爬升至 10 公尺', '#10b981');
  } else {
    showAnnouncement(`PLAYER ${playerNum} READY`, state.keymapMode === 'dual' ? 'GO 後按 W 上升' : 'GO 後按 Shift 或 U 上升', '#00f0ff');
  }

}

function completeRaceRun({ aborted = false } = {}) {
  state.raceActive = false;
  clearAllKeys();
  if (!aborted) audioEngine.playFinishFanfare();

  const finalTime = state.elapsedTime + state.penaltyTime;
  const result = {
    rawTime: state.elapsedTime,
    penalty: state.penaltyTime,
    totalTime: finalTime,
    collisions: state.collisionCount
  };

  if (state.gameMode === 'tactical_strike') {
    state.p1Result = result;
    if (aborted) {
      for (const bomb of tacticalState.activeBombs) disposeWorldObject(bomb.mesh);
      tacticalState.activeBombs.length = 0;
      tacticalState.pendingExplosions.length = 0;
      document.getElementById('landing-indicator').classList.remove('visible');
    }
    showScoreboardModal('tactical_complete', { aborted });
  } else if (state.gameMode === 'training' || state.gameMode === 'single_race') {
    state.p1Result = result;
    showScoreboardModal('training_complete');
  } else if (state.gameMode === 'versus_race') {
    if (state.currentPlayer === 1) {
      state.p1Result = result;
      state.p1GhostRecording = state.currentRecording.slice();
      showScoreboardModal('p1_done');
    } else {
      state.p2Result = result;
      showScoreboardModal('versus_final');
    }
  }
}

function showScoreboardModal(stage, { aborted = false } = {}) {
  state.scoreboardOpen = true;
  const modal = document.getElementById('scoreboard-modal');
  const containerEl = document.getElementById('score-cards-container');
  const nextBtn = document.getElementById('btn-score-next');
  modal.classList.toggle('tactical-results', stage === 'tactical_complete');
  modal.classList.remove('hidden');

  if (stage === 'tactical_complete') {
    const { rawTime, collisions } = state.p1Result;
    const wholeSeconds = Math.floor(rawTime);
    const minutes = String(Math.floor(wholeSeconds / 60)).padStart(2, '0');
    const seconds = String(wholeSeconds % 60).padStart(2, '0');
    const { targets, directHitBombs, bombsDropped } = tacticalState;
    const killedCount = targets.filter((target) => target.destroyed).length;
    const allTargetsDestroyed = killedCount === targets.length;
    const accuracy = directHitBombs / Math.max(1, bombsDropped);
    const targetPoints = 60 * killedCount / targets.length;
    const accuracyPoints = 15 * accuracy;
    const timePoints = 10 * Math.max(0, Math.min(1, (360 - rawTime) / 180));
    const landingPoints = aborted ? 0 : 15;
    const collisionPenalty = collisions * TACTICAL_COLLISION_COST;
    const score = Math.max(0, Math.round(targetPoints + accuracyPoints + timePoints + landingPoints - collisionPenalty));
    let rank = 'C';
    if (score >= 90) rank = 'S';
    else if (score >= 75) rank = 'A';
    else if (score >= 55) rank = 'B';

    document.getElementById('score-eyebrow').textContent = 'TACTICAL STRIKE / AFTER-ACTION REPORT';
    document.getElementById('score-title').textContent = aborted ? '任務中止' : allTargetsDestroyed ? '任務達成' : '配額用盡，已返航';
    let outcome = '任務彈藥用盡，已返航降落，仍有目標未擊毀。';
    if (aborted) outcome = '任務已中止，依中止時的飛行紀錄與戰果結算。';
    else if (allTargetsDestroyed) outcome = '目標全數擊毀，已返航降落。';
    document.getElementById('score-subtitle').textContent = outcome;

    const scoreBreakdown = [
      ['目標戰果', targetPoints, 60],
      ['投放精準度', accuracyPoints, 15],
      ['任務耗時', timePoints, 10],
      ['返航降落', landingPoints, 15]
    ];
    containerEl.innerHTML = `
      <section class="combat-report-card" aria-label="戰場投彈任務報告">
        <header class="combat-header" data-rank="${rank}">
          <div class="combat-rating-badge"><span>任務評級</span><strong>${rank}<small> 級</small></strong></div>
          <div class="combat-total"><span>總得分</span><strong>${score}<small> / 100</small></strong></div>
          <p class="combat-scale">評級門檻<span>S ≥ 90 · A ≥ 75 · B ≥ 55 · C &lt; 55</span></p>
        </header>

        <dl class="combat-metrics">
          <div><dt>任務耗時</dt><dd>${minutes}:${seconds}</dd></div>
          <div><dt>投放彈數</dt><dd>${bombsDropped}<small> / ${TACTICAL_BOMB_LIMIT} 枚</small></dd></div>
          <div><dt>逐發直擊率</dt><dd>${bombsDropped ? `${Math.round(accuracy * 100)}%<small> ${directHitBombs}/${bombsDropped} 枚</small>` : '<small>尚未投放</small>'}</dd></div>
          <div><dt>碰撞次數</dt><dd>${collisions}<small> 次</small></dd></div>
        </dl>

        <div class="combat-details">
          <section>
            <h3>分數明細 <span>碰撞每次扣 ${TACTICAL_COLLISION_COST} 分</span></h3>
            <ul class="combat-score-list">
              ${scoreBreakdown.map(([label, points, maxPoints]) => `
                <li>
                  <span>${label}</span><strong>${points.toFixed(1)} <small>/ ${maxPoints}</small></strong>
                  <meter min="0" max="${maxPoints}" value="${points}" aria-label="${label}"></meter>
                </li>
              `).join('')}
              <li><span>碰撞扣分</span><strong>${collisionPenalty ? `−${collisionPenalty}` : '0'} 分</strong></li>
            </ul>
          </section>
          <section>
            <h3>目標戰果 <span>${killedCount} / ${targets.length} 擊毀</span></h3>
            <table class="combat-targets" aria-label="各目標戰果">
              <thead><tr><th scope="col">目標</th><th scope="col">狀態</th></tr></thead>
              <tbody>
                ${targets.map((target) => `
                  <tr><th scope="row">${target.name}</th><td><span data-met="${target.destroyed}">${target.destroyed ? '已擊毀' : '未擊毀'}</span></td></tr>
                `).join('')}
              </tbody>
            </table>
          </section>
        </div>
      </section>
    `;

    nextBtn.textContent = '重飛任務';
    nextBtn.onclick = () => startRunSequence(1);
    if (aborted) nextBtn.focus();
  } else if (stage === 'training_complete') {
    const r = state.p1Result;
    document.getElementById('score-eyebrow').textContent = 'FLIGHT TRAINING CERTIFICATE OF COMPLETION';
    document.getElementById('score-title').textContent = '🎓 台灣都會無人機飛行學院 — 結業考照證書';
    document.getElementById('score-subtitle').textContent = '恭喜！您已全數完成六大核心操控考驗，具備城市空域實戰飛行能力！';

    let ratingBadge = 'AAA 卓越飛行員';
    if (r.collisions >= 3) {
      ratingBadge = 'A 合格飛行員';
    } else if (r.collisions >= 1) {
      ratingBadge = 'AA 優良飛行員';
    }

    containerEl.innerHTML = `
      <div class="training-cert-card">
        <div class="cert-header">
          <div class="cert-title-group">
            <h3>四軸無人機基礎操控飛行員認證</h3>
            <p>AERO-X 3D TAIWAN URBAN UAV PILOT PROFICIENCY</p>
          </div>
          <div class="cert-rating-badge">${ratingBadge}</div>
        </div>

        <div class="cert-checklist-grid">
          <div class="cert-item">
            <div class="cert-item-label"><span>🟢</span> 任務一：垂直起飛與定高懸停</div>
            <span class="cert-item-tag">合格 PASS</span>
          </div>
          <div class="cert-item">
            <div class="cert-item-label"><span>🟢</span> 任務二：俯仰前進與等速巡航</div>
            <span class="cert-item-tag">合格 PASS</span>
          </div>
          <div class="cert-item">
            <div class="cert-item-label"><span>🟢</span> 任務三：機頭旋轉偏航轉向</div>
            <span class="cert-item-tag">合格 PASS</span>
          </div>
          <div class="cert-item">
            <div class="cert-item-label"><span>🟢</span> 任務四：橫滾左右平移避障</div>
            <span class="cert-item-tag">合格 PASS</span>
          </div>
          <div class="cert-item">
            <div class="cert-item-label"><span>🟢</span> 任務五：增壓加速與空中急煞</div>
            <span class="cert-item-tag">合格 PASS</span>
          </div>
          <div class="cert-item">
            <div class="cert-item-label"><span>🟢</span> 任務六：綜合返航與精準降落</div>
            <span class="cert-item-tag">合格 PASS</span>
          </div>
        </div>

        <div class="cert-telemetry-row">
          <div class="cert-telemetry-item">
            <span>培訓總耗時</span>
            <strong>${formatRaceTime(r.rawTime)}</strong>
          </div>
          <div class="cert-telemetry-item">
            <span>碰撞失誤次數</span>
            <strong style="color: ${r.collisions === 0 ? 'var(--emerald)' : 'var(--amber)'};">${r.collisions} 次</strong>
          </div>
          <div class="cert-telemetry-item">
            <span>考核評級</span>
            <strong>${ratingBadge.split(' ')[0]}</strong>
          </div>
        </div>
      </div>
    `;

    nextBtn.textContent = '🔄 再次培訓鞏固手感';
    nextBtn.onclick = () => startRunSequence(1);

    const ctaRow = document.getElementById('score-cta-row');
    let exploreBtn = document.getElementById('btn-score-explore');
    if (!exploreBtn) {
      exploreBtn = document.createElement('button');
      exploreBtn.id = 'btn-score-explore';
      exploreBtn.className = 'secondary-btn';
      exploreBtn.textContent = '🏙️ 前往自由空拍';
      exploreBtn.onclick = () => {
        state.gameMode = 'free_flight';
        startRunSequence(1);
      };
      ctaRow.insertBefore(exploreBtn, document.getElementById('btn-score-menu'));
    }
  } else if (stage === 'single') {
    const r = state.p1Result;
    document.getElementById('score-title').textContent = '台灣城市計時賽 — 完賽結算';
    containerEl.innerHTML = `
      <div class="score-player-card winner">
        <div class="score-player-title">PLAYER 1 完賽成績</div>
        <div class="score-big-time">${formatRaceTime(r.totalTime)}</div>
        <div class="score-detail-row"><span>純飛行時間</span><span>${formatRaceTime(r.rawTime)}</span></div>
        <div class="score-detail-row"><span>碰撞罰時 (${r.collisions} 次)</span><span>+${r.penalty.toFixed(1)}s</span></div>
      </div>
    `;
    nextBtn.textContent = '🚀 再挑戰一趟';
    nextBtn.onclick = () => startRunSequence(1);
  } else if (stage === 'p1_done') {
    const r = state.p1Result;
    document.getElementById('score-title').textContent = 'PLAYER 1 完成飛行 — 準備換手 P2';
    containerEl.innerHTML = `
      <div class="score-player-card">
        <div class="score-player-title">PLAYER 1 基準成績</div>
        <div class="score-big-time">${formatRaceTime(r.totalTime)}</div>
        <div class="score-detail-row"><span>純飛行時間</span><span>${formatRaceTime(r.rawTime)}</span></div>
        <div class="score-detail-row"><span>碰撞罰時</span><span>+${r.penalty.toFixed(1)}s</span></div>
      </div>
    `;
    nextBtn.textContent = '🕹️ 換手 PLAYER 2 起飛挑戰 (同場顯示 P1 影子無人機)';
    nextBtn.onclick = () => startRunSequence(2);
  } else {
    const r1 = state.p1Result;
    const r2 = state.p2Result;
    const p1Win = r1.totalTime <= r2.totalTime;
    document.getElementById('score-title').textContent = p1Win
      ? '🏆 PLAYER 1 奪得城市競速冠軍！'
      : '🏆 PLAYER 2 奪得城市競速冠軍！';
    containerEl.innerHTML = `
      <div class="score-player-card ${p1Win ? 'winner' : ''}">
        <div class="score-player-title">PLAYER 1 ${p1Win ? '👑 WINNER' : ''}</div>
        <div class="score-big-time">${formatRaceTime(r1.totalTime)}</div>
        <div class="score-detail-row"><span>純飛行時間</span><span>${formatRaceTime(r1.rawTime)}</span></div>
        <div class="score-detail-row"><span>碰撞罰時</span><span>+${r1.penalty.toFixed(1)}s</span></div>
      </div>
      <div class="score-player-card ${!p1Win ? 'winner' : ''}">
        <div class="score-player-title">PLAYER 2 ${!p1Win ? '👑 WINNER' : ''}</div>
        <div class="score-big-time">${formatRaceTime(r2.totalTime)}</div>
        <div class="score-detail-row"><span>純飛行時間</span><span>${formatRaceTime(r2.rawTime)}</span></div>
        <div class="score-detail-row"><span>碰撞罰時</span><span>+${r2.penalty.toFixed(1)}s</span></div>
      </div>
    `;
    nextBtn.textContent = '🔄 雙人再戰一局';
    nextBtn.onclick = () => startRunSequence(1);
  }
}

// ============================================================================
// 17. UI EVENT LISTENERS & ANIMATION LOOP
// ============================================================================
function bindUIEvents() {
  document.getElementById('btn-time').addEventListener('click', cycleTimeOfDay);
  const btnWeather = document.getElementById('btn-weather');
  if (btnWeather) btnWeather.addEventListener('click', cycleWeather);
  document.getElementById('btn-camera').addEventListener('click', () => toggleCameraMode());
  const btnZoom = document.getElementById('btn-zoom');
  if (btnZoom) btnZoom.addEventListener('click', () => cycleDownZoom());

  const btnSensor = document.getElementById('btn-sensor');
  if (btnSensor) btnSensor.addEventListener('click', () => cycleSensorMode());

  window.addEventListener('wheel', (e) => {
    if (state.cameraMode === 'down' && !state.menuOpen && !state.pauseOpen && !state.mapOpen && !state.scoreboardOpen) {
      if (e.deltaY < 0) {
        if (state.downZoom === 1) setDownZoom(2);
        else if (state.downZoom === 2) setDownZoom(4);
      } else if (e.deltaY > 0) {
        if (state.downZoom === 4) setDownZoom(2);
        else if (state.downZoom === 2) setDownZoom(1);
      }
    }
  }, { passive: true });

  document.querySelectorAll('#opt-weather .opt-pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      applyWeather(pill.dataset.val);
    });
  });
  document.getElementById('btn-map').addEventListener('click', () => toggleFullMap(true));
  document.getElementById('minimap-trigger').addEventListener('click', () => toggleFullMap(true));
  document.getElementById('btn-close-map').addEventListener('click', () => toggleFullMap(false));
  document.getElementById('btn-flight-mode').addEventListener('click', toggleFlightMode);
  document.getElementById('btn-keymap').addEventListener('click', toggleKeymapMode);
  document.getElementById('btn-reset').addEventListener('click', () => respawnAtLastCheckpoint(false));
  document.getElementById('btn-audio').addEventListener('click', toggleAudio);
  document.getElementById('btn-resume').addEventListener('click', () => togglePauseMenu(false));
  document.getElementById('btn-abort-tactical').addEventListener('click', () => {
    if (!state.pauseOpen || state.gameMode !== 'tactical_strike' || !state.raceActive) return;
    togglePauseMenu(false);
    completeRaceRun({ aborted: true });
  });
  document.getElementById('btn-return-menu').addEventListener('click', () => {
    togglePauseMenu(false);
    toggleMenuModal(true);
  });

  document.querySelectorAll('.mode-select-card').forEach((card) => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.mode-select-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
      state.gameMode = card.dataset.mode;
      document.getElementById('menu-summary-mode').textContent = card.dataset.description;
      document.getElementById('exercise-selector').classList.toggle('hidden', card.dataset.mode !== 'tactical_strike');
      document.querySelector('[data-mode="tactical_strike"]').setAttribute('aria-expanded', String(card.dataset.mode === 'tactical_strike'));
    });
  });

  document.querySelectorAll('.exercise-option').forEach((option) => {
    option.addEventListener('click', () => {
      document.querySelectorAll('.exercise-option').forEach((item) => {
        item.classList.remove('selected');
        item.setAttribute('aria-pressed', 'false');
      });
      option.classList.add('selected');
      option.setAttribute('aria-pressed', 'true');
      state.gameMode = option.dataset.exercise;
    });
  });

  document.querySelectorAll('#opt-time .opt-pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      applyTimeOfDay(pill.dataset.val);
    });
  });

  document.querySelectorAll('#opt-camera .opt-pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#opt-camera .opt-pill').forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      toggleCameraMode(pill.dataset.val);
    });
  });

  const briefing = document.getElementById('tactical-briefing');
  document.getElementById('btn-start-flight').addEventListener('click', async () => {
    if (state.gameMode === 'tactical_strike') {
      if (!await startRunSequence(1)) return;
      briefing.returnValue = '';
      briefing.showModal();
      return;
    }
    startRunSequence(1);
  });
  document.getElementById('btn-briefing-launch').addEventListener('click', () => {
    briefing.close('launch');
  });
  briefing.addEventListener('close', () => {
    if (briefing.returnValue === 'launch') return;
    state.countdownActive = false;
    toggleMenuModal(true);
  });

  document.getElementById('btn-score-menu').addEventListener('click', () => {
    document.getElementById('scoreboard-modal').classList.add('hidden');
    state.scoreboardOpen = false;
    toggleMenuModal(true);
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

window.startRunSequence = startRunSequence;
window.toggleMenuModal = toggleMenuModal;
window.toggleCameraMode = toggleCameraMode;
window.toggleFlightMode = toggleFlightMode;
window.toggleFullMap = toggleFullMap;

function disposeWorldObject(root) {
  if (root.parent) root.parent.remove(root);
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  root.traverse((object) => {
    if (object.isInstancedMesh) object.dispose();
    if (object.geometry && !object.isSprite) geometries.add(object.geometry);
    for (const material of [].concat(object.material || [])) materials.add(material);
    if (object.customDepthMaterial) materials.add(object.customDepthMaterial);
  });
  for (const material of materials) {
    for (const value of Object.values(material)) {
      if (value && value.isTexture && value !== blastTexture) textures.add(value);
    }
    material.dispose();
  }
  for (const geometry of geometries) geometry.dispose();
  for (const texture of textures) texture.dispose();
}

function* buildCityWorld() {
  cityGroup = new THREE.Group();
  cityGroup.name = '台灣城市';
  yield '建立城市外圍與道路';
  buildCityBackdrop();
  yield '建立街廓與公共設施';
  yield* buildCity();
  yield '建立起降坪與鐵道';
  buildCityHelipad();
  buildRailwayAndCrossing();
  yield '建立商店街與招牌';
  yield* buildTaiwanMarketStreet();
  yield '配置檢查門與交通';
  buildCourseGates();
  buildTrainingHoverRing();
  buildRoadVehicles();
  scene.add(cityGroup);
  applyTimeOfDay(state.timeOfDay);
}

function unloadCityWorld() {
  if (!cityGroup) return;
  disposeWorldObject(cityGroup);
  cityGroup = null;
  cityTrain = null;
  trainStopRemaining = 0;
  signalTime = 0;
  updateSignals = () => {};
  trainingHoverRingGroup = null;
  trainingHoverRingMat = null;
  for (const items of [
    buildingColliders, movingColliders, signalIntersections, outerMapRoads,
    outerMapCourtyards, townMapFeatures, cityMapAreas, cityLandmarks, crossingArms,
    crossingBarrierColliders, roadVehicles, gateObjects, window.taiwanEmissiveMaterials
  ]) items.length = 0;
}

function unloadWildernessWorld() {
  if (!wildernessGroup) return;
  disposeWorldObject(wildernessGroup);
  wildernessGroup = null;
  tacticalState.targets.length = 0;
  tacticalState.tanks.length = 0;
  wildernessTerrainPositions = null;
  wildernessLandMat = null;
  wildernessRoadMat = null;
  wildernessColliders.length = 0;
  wildernessColliderCells.clear();
  tacticalTargetColliders.length = 0;
  if (blastTexture) blastTexture.dispose();
  blastTexture = null;
}

function letLoadingScreenPaint() {
  return new Promise((resolve) => {
    // Schedule work after a paint while keeping loads able to finish in a background tab.
    const timer = setTimeout(resolve, 100);
    requestAnimationFrame(() => {
      clearTimeout(timer);
      setTimeout(resolve, 0);
    });
  });
}

async function loadWorldForMode(mode) {
  const tactical = mode === 'tactical_strike';
  if (tactical ? wildernessGroup : cityGroup) return true;

  const overlay = document.getElementById('world-loading');
  const title = document.getElementById('world-loading-title');
  const detail = document.getElementById('world-loading-detail');
  title.textContent = tactical ? '載入野外戰場' : '載入台灣城市';
  detail.textContent = '準備切換場景';
  worldLoading = true;
  clearAllKeys();
  overlay.classList.remove('hidden');

  try {
    await letLoadingScreenPaint();
    if (tactical) unloadCityWorld();
    else unloadWildernessWorld();

    const stages = tactical ? buildWildernessBattlefield() : buildCityWorld();
    let sliceStart = performance.now();
    for (const stage of stages) {
      if (stage) detail.textContent = stage;
      if (stage || performance.now() - sliceStart >= 12) {
        await letLoadingScreenPaint();
        sliceStart = performance.now();
      }
    }
    return true;
  } catch (error) {
    console.error('World load failed:', error);
    if (tactical) unloadWildernessWorld();
    else unloadCityWorld();
    toggleMenuModal(true);
    showAnnouncement('場景載入失敗', '請重新選擇模式並開始飛行。', '#ef4444');
    return false;
  } finally {
    worldLoading = false;
    overlay.classList.add('hidden');
  }
}

try { buildAnimeSky(); } catch (e) { console.warn('buildAnimeSky:', e); }
try { buildCCIPMarker(); } catch (e) { console.warn('buildCCIPMarker:', e); }
try { buildRainSystem(); } catch (e) { console.warn('buildRainSystem:', e); }
try { applyWeather('clear'); } catch (e) { console.warn('applyWeather:', e); }
try { applyTimeOfDay('day'); } catch (e) { console.warn('applyTimeOfDay:', e); }
try { bindUIEvents(); } catch (e) { console.warn('bindUIEvents:', e); }

window.applyWeather = applyWeather;
window.cycleWeather = cycleWeather;

updateCameraAndWorldAnimations(0);

let lastFrameTime = performance.now();
function animate(now) {
  requestAnimationFrame(animate);
  const frameSeconds = Math.max(0, (now - lastFrameTime) / 1000);
  const dt = Math.min(0.05, frameSeconds);
  lastFrameTime = now;

  const paused = worldLoading || state.menuOpen || state.pauseOpen || state.mapOpen || state.scoreboardOpen || document.getElementById('tactical-briefing').open || document.hidden;
  if (!paused) {
    if (state.countdownActive) {
      state.countdownRemaining -= frameSeconds;
      if (state.countdownRemaining <= 0) {
        state.countdownActive = false;
        state.raceActive = true;
        audioEngine.playGateChime();
        if (state.gameMode !== 'tactical_strike') {
          showAnnouncement('GO! 開始計時', '穿過全部 6 座檢查門並降落回市區起降坪', '#10b981');
        }
      }
    }
    updateSignals(dt);
    updateTacticalTargets(dt);
    updateDronePhysics(dt);
    checkCourseObjectives(dt);
    updateCameraAndWorldAnimations(dt);
    updateHUD(dt);
    updateActiveBombs(dt);
    updateExplosions(dt);
  }

  if (typeof updateRain === 'function') {
    updateRain(dt);
  }

  if (skyDomeMesh && skyDomeMesh.material && skyDomeMesh.material.uniforms && skyDomeMesh.material.uniforms.cloudOffset) {
    const w = WEATHER_PROFILES[state.weather];
    const windSpd = w ? Math.max(0.8, w.windSpeed) : 1.0;
    const windAng = w ? (w.windAngle || 0) : 0.4;
    skyDomeMesh.material.uniforms.cloudOffset.value.x += Math.cos(windAng) * windSpd * 0.0085 * dt;
    skyDomeMesh.material.uniforms.cloudOffset.value.y += Math.sin(windAng) * windSpd * 0.0085 * dt;
  }

  if (typeof updateVTXOverlay === 'function') {
    updateVTXOverlay(dt);
  }

  renderer.render(scene, camera);
}

requestAnimationFrame(animate);

