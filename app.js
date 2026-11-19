/** AERO-X 3D UAV Simulator — Taiwan City Edition */
const COURSE_GATES = [
  { id: 1, pos: { x: -64, y: 12, z: -158 }, rotY: 0, radius: 10.0, name: '市立國小操場巡檢點' },
  { id: 2, pos: { x: 0, y: 14, z: -110 }, rotY: 0, radius: 11.0, name: '市中心圓環地標' },
  { id: 3, pos: { x: 64, y: 18, z: -156 }, rotY: -Math.PI / 4, radius: 10.0, name: '金融商辦外牆巡檢點' },
  { id: 4, pos: { x: 52, y: 16, z: -48 }, rotY: 0, radius: 10.0, name: '商業大樓頂樓空投點' },
  { id: 5, pos: { x: -56, y: 14, z: -56 }, rotY: Math.PI / 4, radius: 10.0, name: '老街騎樓商圈上空' },
  { id: 6, pos: { x: 0, y: 12, z: -45 }, rotY: 0, radius: 10.0, name: '中央林蔭大道返航點' }
];
const HELIPAD_POS = { x: 0, y: 0.85, z: 0 };
const LANDING_RADIUS = 6.5;

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
  aaSites: [],
  aaProjectiles: [],
  aaFlakBursts: [],
  rwrLevel: 'none',
  rwrBeepTimer: 0,
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
  hullHp: 100,
  damage: {
    rotorHealth: [1.0, 1.0, 1.0, 1.0],
    fuselageScorch: 0,
    controlGlitch: 0,
    cameraHealth: 1.0,
    smokeTimer: 0
  },
  collisionCooldown: 0,
  rotorAngle: 0,
  crashed: false,
  crashState: 'none', // 'none' | 'tumbling' | 'settled'
  crashCause: '',
  crashSpeed: 0,
  tumbleTimer: 0,
  tumbleSpinX: 0,
  tumbleSpinY: 0,
  tumbleSpinZ: 0,
  battery: {
    capacityMah: 6000,
    remainingMah: 6000,
    percent: 100,
    openCircuitVoltage: 25.20,
    voltage: 25.20,
    currentAmps: 0.8,
    internalResistance: 0.024,
    lowBattWarned: false,
    critBattWarned: false,
    emptyWarned: false
  }
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
  maxAltitude: 1500.0
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
      const wasCrashed = !!drone.crashed;
      respawnAtLastCheckpoint(wasCrashed);
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

const flightInput = document.getElementById('flight-input');
const flightInputButtons = flightInput.querySelectorAll('button[data-val]');
const gamepadHelp = document.getElementById('gamepad-help');
let gamepadSelected = false;

flightInputButtons.forEach((button) => {
  button.addEventListener('click', () => {
    gamepadSelected = button.dataset.val === 'gamepad';
    flightInputButtons.forEach((option) => {
      const selected = option === button;
      option.classList.toggle('active', selected);
      option.setAttribute('aria-pressed', String(selected));
    });
    gamepadHelp.hidden = !gamepadSelected;
    updateGamepadConnectionStatus();
    if (typeof window.updateTacticalBriefingDialog === 'function' && state.tacticalExercise) {
      window.updateTacticalBriefingDialog(state.tacticalExercise);
    }
  });
});

let gamepadCameraPressed = true;
let gamepadSensorPressed = true;
let gamepadBombPressed = true;
let gamepadZoomPressed = true;
const gamepadFlightModes = new Set(['training', 'free_flight', 'single_race', 'versus_race', 'tactical_strike']);

function getFlightGamepad() {
  if (!gamepadFlightModes.has(state.gameMode) || document.hidden || !document.hasFocus()) return null;
  return getSelectedGamepad();
}

function getSelectedGamepad() {
  if (!gamepadSelected || document.hidden) return null;

  return findCompatibleGamepad(readConnectedGamepads());
}

function findCompatibleGamepad(gamepads) {
  const compatible = gamepads.filter((pad) => pad.axes.length >= 4);
  return compatible.find((pad) => pad.mapping === 'standard') ?? compatible[0] ?? null;
}

function readConnectedGamepads() {
  try {
    return Array.from(navigator.getGamepads?.() ?? []).filter((pad) => pad?.connected);
  } catch {
    return [];
  }
}

function updateGamepadConnectionStatus() {
  if (!gamepadSelected) return;
  const status = document.getElementById('gamepad-connection-status');
  const gamepads = readConnectedGamepads();
  const pad = findCompatibleGamepad(gamepads);
  const savedMapping = pad && getSavedRightStickMapping(pad);
  const needsCalibration = pad && !savedMapping && pad.mapping !== 'standard';
  calibrateRightStickButton.hidden = !(needsCalibration || savedMapping);
  calibrateRightStickButton.textContent = savedMapping ? '重新校正' : '校正右搖桿';
  calibrateRightStickButton.classList.toggle('calibration-link', Boolean(savedMapping));
  if (pad) {
    status.textContent = savedMapping ? '已套用右搖桿校正。'
      : needsCalibration ? '已偵測到手把，建議校正右搖桿。'
      : '已偵測到標準配置手把，可直接使用。';
  } else if (gamepads.length > 0) {
    const axisCounts = gamepads.map((device) => device.axes.length).join('、');
    status.textContent = `瀏覽器回報的手把軸數：${axisCounts}。雙搖桿操作需要至少 4 軸。`;
  } else {
    status.textContent = '瀏覽器尚未偵測到手把。';
  }
}

window.addEventListener('gamepadconnected', updateGamepadConnectionStatus);
window.addEventListener('gamepaddisconnected', updateGamepadConnectionStatus);
window.addEventListener('focus', updateGamepadConnectionStatus);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) updateGamepadConnectionStatus();
});

const rightStickMappings = new Map();
const rightStickStorageKey = 'uav-simulator.right-stick-mappings';

try {
  const savedMappings = new Map(JSON.parse(localStorage.getItem(rightStickStorageKey) ?? '[]'));
  for (const [id, mapping] of savedMappings) {
    const validAxis = (axis) => Number.isInteger(axis?.index) && axis.index >= 2
      && (axis.direction === 1 || axis.direction === -1);
    if (typeof id === 'string' && validAxis(mapping?.horizontal) && validAxis(mapping?.vertical)
        && mapping.horizontal.index !== mapping.vertical.index) {
      rightStickMappings.set(id, mapping);
    }
  }
} catch {
  // Storage can be unavailable. Calibration still works for this page.
}
const calibrateRightStickButton = document.getElementById('calibrate-right-stick');
const rightStickStatus = document.getElementById('right-stick-status');

calibrateRightStickButton.addEventListener('click', openRightStickDialog);

const rightStickDialog = document.getElementById('right-stick-dialog');
const rightStickInstruction = document.getElementById('right-stick-instruction');
const rightStickStart = document.getElementById('right-stick-start');
const rightStickClose = document.getElementById('right-stick-close');
let calibrationFrame;

function setRightStickStep(step, message) {
  rightStickDialog.dataset.step = step;
  rightStickInstruction.textContent = message;
}

function openRightStickDialog() {
  rightStickStart.disabled = false;
  rightStickStart.textContent = '開始校正';
  rightStickClose.textContent = '取消';
  setRightStickStep('ready', '請放開右搖桿，讓它回到中央，再按「開始校正」。');
  rightStickDialog.showModal();
}

rightStickDialog.addEventListener('close', () => cancelAnimationFrame(calibrationFrame));

rightStickStart.addEventListener('click', () => {
  const pad = getSelectedGamepad();
  if (!pad) {
    setRightStickStep('ready', '尚未偵測到手把。請按一下手把按鍵後重試。');
    return;
  }

  const center = Array.from(pad.axes);
  let horizontal;
  let waitingForCenter = false;
  const start = performance.now();
  rightStickStart.disabled = true;
  rightStickClose.focus();
  setRightStickStep('right', '請將右搖桿向右推到底。');

  function finish(message) {
    setRightStickStep('ready', message);
    rightStickStart.disabled = false;
    rightStickStart.textContent = '重試';
    rightStickClose.textContent = '關閉';
  }

  function capture(now) {
    if (!rightStickDialog.open) return;
    const current = getSelectedGamepad();
    if (!current || current.index !== pad.index || current.id !== pad.id || now - start > 20000) {
      finish('校正已停止。請確認手把已連線，讓搖桿回中後再試。');
      return;
    }

    const movement = center.map((value, index) => current.axes[index] - value);
    if (waitingForCenter) {
      if (Math.abs(movement[horizontal.index]) < 0.2) {
        waitingForCenter = false;
        setRightStickStep('up', '請將右搖桿向上推到底。');
      }
    } else {
      let strongest = 0.6;
      let axis;
      for (let index = 2; index < movement.length; index++) {
        if (index === horizontal?.index || Math.abs(movement[index]) <= strongest) continue;
        strongest = Math.abs(movement[index]);
        axis = { index, direction: Math.sign(movement[index]) };
      }

      if (axis && !horizontal) {
        horizontal = axis;
        waitingForCenter = true;
        setRightStickStep('center', '請放開右搖桿，讓它回到中央。');
      } else if (axis) {
        rightStickMappings.set(pad.id, { horizontal, vertical: axis });
        try {
          localStorage.setItem(rightStickStorageKey, JSON.stringify([...rightStickMappings]));
          rightStickStatus.textContent = '';
        } catch {
          rightStickStatus.textContent = '校正僅在本次開啟的頁面有效。';
        }
        updateGamepadConnectionStatus();
        rightStickDialog.close();
        return;
      }
    }
    calibrationFrame = requestAnimationFrame(capture);
  }

  calibrationFrame = requestAnimationFrame(capture);
});

function getSavedRightStickMapping(gamepad) {
  const mapping = rightStickMappings.get(gamepad.id);
  return mapping && Math.max(mapping.horizontal.index, mapping.vertical.index) < gamepad.axes.length
    ? mapping : null;
}

function sampleGamepadControls() {
  const gamepad = getFlightGamepad();
  if (gamepad) {
    const rightStick = getSavedRightStickMapping(gamepad);
    const axis = (index) => {
      const value = gamepad.axes[index];
      const deadzone = 0.15;
      return Math.sign(value) * Math.max(0, (Math.min(1, Math.abs(value)) - deadzone) / (1 - deadzone));
    };

    // Use the standard shoulder button order for generic USB pads as well.
    const cameraPressed = gamepad.buttons[5]?.pressed ?? false;
    if (cameraPressed && !gamepadCameraPressed) toggleCameraMode();
    gamepadCameraPressed = cameraPressed;
    const sensorPressed = gamepad.buttons[4]?.pressed ?? false;
    if (sensorPressed && !gamepadSensorPressed) cycleSensorMode();
    gamepadSensorPressed = sensorPressed;

    // Face buttons: Button 1 (B / Circle) & Button 0 (A / Cross) for bomb release in tactical mode
    const bombPressed = ((gamepad.buttons[1]?.pressed ?? false) || (gamepad.buttons[0]?.pressed ?? false));
    if (bombPressed && !gamepadBombPressed) {
      if (state.gameMode === 'tactical_strike') {
        dropBomb();
      }
    }
    gamepadBombPressed = bombPressed;

    // Button 2 (X / Square) for Nadir camera optical zoom
    const zoomPressed = gamepad.buttons[2]?.pressed ?? false;
    if (zoomPressed && !gamepadZoomPressed) {
      if (state.cameraMode === 'down' && typeof cycleDownZoom === 'function') {
        cycleDownZoom();
      }
    }
    gamepadZoomPressed = zoomPressed;

    return {
      throttle: -axis(1),
      yaw: -axis(0),
      pitch: rightStick ? axis(rightStick.vertical.index) * rightStick.vertical.direction : -axis(3),
      roll: rightStick ? axis(rightStick.horizontal.index) * rightStick.horizontal.direction : axis(2),
      brake: gamepad.buttons[6]?.pressed ?? false,
      boost: gamepad.buttons[7]?.pressed ?? false
    };
  }

  gamepadCameraPressed = true;
  gamepadSensorPressed = true;
  gamepadBombPressed = true;
  gamepadZoomPressed = true;
  return null;
}

function sampleFlightControls() {
  if (state.menuOpen || state.pauseOpen || state.scoreboardOpen || state.mapOpen || state.countdownActive) {
    return { throttle: 0, yaw: 0, pitch: 0, roll: 0, brake: false, boost: false };
  }

  const gamepad = sampleGamepadControls();
  if (gamepad) return gamepad;

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

  _ensureMenuCtxRunning() {
    if (!state.audioEnabled) return false;
    this.init();
    if (!this.ctx) return false;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx.state === 'running';
  }

  playMenuHover() {
    if (!this._ensureMenuCtxRunning()) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1240, now);
      osc.frequency.exponentialRampToValueAtTime(1580, now + 0.04);
      g.gain.setValueAtTime(0.04, now);
      g.gain.exponentialRampToValueAtTime(0.0008, now + 0.045);
      osc.connect(g);
      g.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.05);
    } catch (e) {}
  }

  playMenuConfirm() {
    if (!this._ensureMenuCtxRunning()) return;
    try {
      const now = this.ctx.currentTime;
      [880, 1318.51].forEach((f, i) => {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, now + i * 0.055);
        g.gain.setValueAtTime(0.08, now + i * 0.055);
        g.gain.exponentialRampToValueAtTime(0.0008, now + i * 0.055 + 0.14);
        osc.connect(g);
        g.connect(this.ctx.destination);
        osc.start(now + i * 0.055);
        osc.stop(now + i * 0.055 + 0.15);
      });
    } catch (e) {}
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

  playAAAShot(distFactor = 1.0) {
    if (!state.audioEnabled || !this.ctx || distFactor <= 0.04) return;
    try {
      const now = this.ctx.currentTime;
      const vol = 0.24 * Math.min(1, distFactor);
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(165, now);
      osc.frequency.exponentialRampToValueAtTime(48, now + 0.09);
      g.gain.setValueAtTime(vol, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
      osc.connect(g);
      g.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.12);

      const bufSize = Math.floor(this.ctx.sampleRate * 0.08);
      const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(920, now);
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(vol * 0.85, now);
      ng.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      src.connect(bp);
      bp.connect(ng);
      ng.connect(this.ctx.destination);
      src.start(now);
      src.stop(now + 0.085);
    } catch (e) {}
  }

  playHMGShot(distFactor = 1.0) {
    if (!state.audioEnabled || !this.ctx || distFactor <= 0.04) return;
    try {
      const now = this.ctx.currentTime;
      const vol = 0.16 * Math.min(1, distFactor);
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(240, now);
      osc.frequency.exponentialRampToValueAtTime(72, now + 0.055);
      g.gain.setValueAtTime(vol, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
      osc.connect(g);
      g.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.07);
    } catch (e) {}
  }

  playRifleShot(distFactor = 1.0) {
    if (!state.audioEnabled || !this.ctx || distFactor <= 0.04) return;
    try {
      const now = this.ctx.currentTime;
      const vol = 0.14 * Math.min(1, distFactor);
      const bufSize = Math.floor(this.ctx.sampleRate * 0.055);
      const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, 2.2);
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1650 + (Math.random() - 0.5) * 320, now);
      bp.Q.setValueAtTime(1.1, now);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
      src.connect(bp);
      bp.connect(g);
      g.connect(this.ctx.destination);
      src.start(now);
      src.stop(now + 0.06);
    } catch (e) {}
  }

  playBulletHit(heavy = false) {
    if (!state.audioEnabled || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const intensity = heavy ? 1.15 : 0.9;

      // 1. Sharp metallic/composite airframe impact crack (filtered noise transient)
      const crackLen = Math.floor(this.ctx.sampleRate * 0.045);
      const crackBuf = this.ctx.createBuffer(1, crackLen, this.ctx.sampleRate);
      const crackData = crackBuf.getChannelData(0);
      for (let i = 0; i < crackLen; i++) {
        crackData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / crackLen, 2.6);
      }
      const crackSrc = this.ctx.createBufferSource();
      crackSrc.buffer = crackBuf;
      const crackFilter = this.ctx.createBiquadFilter();
      crackFilter.type = 'bandpass';
      crackFilter.frequency.setValueAtTime((heavy ? 1850 : 2350) + (Math.random() - 0.5) * 400, now);
      crackFilter.Q.setValueAtTime(1.3, now);
      const crackGain = this.ctx.createGain();
      crackGain.gain.setValueAtTime(0.55 * intensity, now);
      crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.044);
      crackSrc.connect(crackFilter);
      crackFilter.connect(crackGain);
      crackGain.connect(this.ctx.destination);
      crackSrc.start(now);
      crackSrc.stop(now + 0.048);

      // 2. Short kinetic hull thump (low-frequency damped punch, no laser sweep)
      const thumpOsc = this.ctx.createOscillator();
      const thumpGain = this.ctx.createGain();
      thumpOsc.type = 'sine';
      thumpOsc.frequency.setValueAtTime(heavy ? 108 : 132, now);
      thumpOsc.frequency.exponentialRampToValueAtTime(38, now + 0.06);
      thumpGain.gain.setValueAtTime(0.42 * intensity, now);
      thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);
      thumpOsc.connect(thumpGain);
      thumpGain.connect(this.ctx.destination);
      thumpOsc.start(now);
      thumpOsc.stop(now + 0.08);

      // 3. Brief shrapnel / structural rattle tail
      const rattleLen = Math.floor(this.ctx.sampleRate * 0.11);
      const rattleBuf = this.ctx.createBuffer(1, rattleLen, this.ctx.sampleRate);
      const rattleData = rattleBuf.getChannelData(0);
      for (let i = 0; i < rattleLen; i++) {
        rattleData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (rattleLen * 0.28));
      }
      const rattleSrc = this.ctx.createBufferSource();
      rattleSrc.buffer = rattleBuf;
      const rattleFilter = this.ctx.createBiquadFilter();
      rattleFilter.type = 'lowpass';
      rattleFilter.frequency.setValueAtTime(780, now);
      const rattleGain = this.ctx.createGain();
      rattleGain.gain.setValueAtTime(0.24 * intensity, now);
      rattleGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
      rattleSrc.connect(rattleFilter);
      rattleFilter.connect(rattleGain);
      rattleGain.connect(this.ctx.destination);
      rattleSrc.start(now);
      rattleSrc.stop(now + 0.115);
    } catch (e) {}
  }

  playRWRBeep(urgent = false) {
    if (!state.audioEnabled || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(urgent ? 2350 : 1760, now);
      g.gain.setValueAtTime(urgent ? 0.11 : 0.075, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + (urgent ? 0.075 : 0.09));
      osc.connect(g);
      g.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.1);
    } catch (e) {}
  }

  playCrashShatter() {
    if (!state.audioEnabled || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      // 1. Violent low-end impact crunch / thud
      const sub = this.ctx.createOscillator();
      const subGain = this.ctx.createGain();
      sub.type = 'sawtooth';
      sub.frequency.setValueAtTime(140, now);
      sub.frequency.exponentialRampToValueAtTime(28, now + 0.35);
      subGain.gain.setValueAtTime(0.85, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      sub.connect(subGain);
      subGain.connect(this.ctx.destination);
      sub.start(now);
      sub.stop(now + 0.36);

      // 2. High-speed noise shatter / debris crunch
      const bufLen = Math.floor(this.ctx.sampleRate * 0.45);
      const buf = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufLen * 0.22));
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buf;
      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(0.75, now);
      nGain.gain.exponentialRampToValueAtTime(0.01, now + 0.45);
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1800, now);
      filter.Q.value = 1.2;
      noise.connect(filter);
      filter.connect(nGain);
      nGain.connect(this.ctx.destination);
      noise.start(now);

      // 3. High pitch motor stall chirp
      const chirp = this.ctx.createOscillator();
      const cGain = this.ctx.createGain();
      chirp.type = 'triangle';
      chirp.frequency.setValueAtTime(1200, now);
      chirp.frequency.exponentialRampToValueAtTime(160, now + 0.25);
      cGain.gain.setValueAtTime(0.35, now);
      cGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      chirp.connect(cGain);
      cGain.connect(this.ctx.destination);
      chirp.start(now);
      chirp.stop(now + 0.26);
    } catch (e) {}
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
const crossingBarrierColliders = [];
const signalIntersections = [];
const outerMapRoads = [];
const outerMapCourtyards = [];
const CITY_BOUNDS = { halfWidth: 150, north: -250, south: 50 };
let updateSignals = () => {};
let signalTime = 0;
const townMapFeatures = [];
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

  const taxiMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.28, metalness: 0.25 });
  const taxiSignMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
  const taxiEmptyMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
  const truckCabMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.34, metalness: 0.30 });
  const truckBedMat = new THREE.MeshStandardMaterial({ color: 0xd4d4d8, roughness: 0.60, metalness: 0.25 });
  const busGreenMat = new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.34, metalness: 0.24 });
  const busLedMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
  const amberMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.85, roughness: 0.18 });
  const riderJacketMat = new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.78 });
  const backpackMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.82 });
  const deliveryBoxMat = new THREE.MeshStandardMaterial({ color: 0xdb2777, roughness: 0.55 });
  const helmetMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.28 });

  // Sculpted moving scooter geometry + rider
  const mvScShape = new THREE.Shape();
  mvScShape.moveTo(-0.74, 0.46);
  mvScShape.quadraticCurveTo(-0.78, 0.64, -0.54, 0.72);
  mvScShape.lineTo(-0.14, 0.68);
  mvScShape.quadraticCurveTo(-0.04, 0.42, 0.06, 0.36);
  mvScShape.lineTo(0.28, 0.36);
  mvScShape.quadraticCurveTo(0.36, 0.66, 0.38, 0.90);
  mvScShape.quadraticCurveTo(0.46, 0.99, 0.56, 0.90);
  mvScShape.quadraticCurveTo(0.68, 0.64, 0.64, 0.42);
  mvScShape.lineTo(0.48, 0.33);
  mvScShape.lineTo(0.24, 0.24);
  mvScShape.lineTo(-0.38, 0.26);
  mvScShape.quadraticCurveTo(-0.56, 0.42, -0.74, 0.46);
  const mvScBodyGeo = new THREE.ExtrudeGeometry(mvScShape, {
    depth: 0.28, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2
  });
  mvScBodyGeo.translate(0, 0, -0.14);
  const mvScWheelGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.12, 14);
  const mvScFenderGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.14, 12, 1, false, -Math.PI * 0.35, Math.PI * 0.7);
  mvScFenderGeo.rotateX(Math.PI / 2);

  const vanWindshield = new THREE.BoxGeometry(.045, .94, 1.52);
  const busWindshield = new THREE.BoxGeometry(.045, 1.14, 2.02);

  for (const [index, z] of CITY.streets.entries()) {
    for (const direction of [-1, 1]) {
      // Spawn 2 varied 4-wheel vehicles per lane (Taxi, Private Car, Truck, Bus)
      for (let slot = 0; slot < 2; slot++) {
        const vehicleKind = (index * 2 + (direction > 0 ? 1 : 0) + slot) % 5; // 0: Private, 1: Taxi, 2: SUV, 3: Blue Truck, 4: City Bus
        const car = new THREE.Group();
        let vLen = 4.35, vH = 1.65, vW = 1.77, label = '道路車輛';

        if (vehicleKind === 3) {
          // Taiwanese Classic Blue Cargo Truck (中華菱利/堅達風格藍色小貨車 - 流線車頭＋護欄貨斗＋貨物)
          vLen = 4.85; vH = 2.15; vW = 1.82; label = '貨車';
          const cabGeo = vehicleProfile([[0.68, 0.56], [0.68, 1.98], [1.65, 1.98], [2.22, 1.24], [2.26, 0.56]], 1.72, 0.08);
          vehiclePart(car, cabGeo, truckCabMat, 0, 0, 0, true);
          const cabGlass = vehiclePart(car, new THREE.BoxGeometry(0.06, 0.66, 1.54), glass, 1.96, 1.58, 0);
          cabGlass.rotation.z = 0.62;
          // Windshield wipers
          for (const wz of [-0.36, 0.28]) {
            const wp = vehiclePart(car, new THREE.BoxGeometry(0.02, 0.38, 0.025), rubber, 2.04, 1.42, wz);
            wp.rotation.z = 0.62;
            wp.rotation.x = 0.35;
          }
          vehiclePart(car, new THREE.BoxGeometry(0.08, 0.24, 1.38), rubber, 2.26, 0.92, 0); // Front grille
          vehiclePart(car, new THREE.BoxGeometry(0.09, 0.04, 1.28), chromeMat, 2.27, 0.96, 0); // Grille chrome bar
          vehiclePart(car, new THREE.BoxGeometry(0.18, 0.20, 1.78), rubber, 2.24, 0.52, 0); // Front bumper
          vehiclePart(car, new THREE.BoxGeometry(3.05, 0.14, 1.82), rubber, -0.92, 0.58, 0); // Chassis bed
          vehiclePart(car, new THREE.BoxGeometry(3.02, 0.44, 1.78), truckBedMat, -0.92, 0.86, 0, true); // Flatbed sides
          // Flatbed cargo guard rails (貨斗護欄)
          for (const railZ of [-0.87, 0.87]) {
            vehiclePart(car, new THREE.BoxGeometry(2.96, 0.04, 0.04), truckBedMat, -0.92, 1.24, railZ);
            for (const postX of [-2.35, -1.4, -0.45, 0.48]) {
              vehiclePart(car, new THREE.BoxGeometry(0.045, 0.26, 0.045), truckBedMat, postX, 1.12, railZ);
            }
          }
          vehiclePart(car, new THREE.BoxGeometry(0.05, 0.65, 1.72), truckBedMat, 0.56, 1.40, 0); // Cab-guard headboard
          // Cargo boxes & strapped blue tarp load inside truck bed
          vehiclePart(car, new THREE.BoxGeometry(1.38, 0.82, 1.48), new THREE.MeshStandardMaterial({ color: 0x1e40af, roughness: 0.72 }), -1.55, 1.38, 0, true);
          vehiclePart(car, new THREE.BoxGeometry(1.15, 0.56, 1.35), new THREE.MeshStandardMaterial({ color: 0xb48a5a, roughness: 0.88 }), -0.15, 1.24, 0, true);
          vehiclePart(car, models[0].plate, plate, 2.29, 0.54, 0);
          vehiclePart(car, models[0].plate, plate, -2.44, 0.56, 0);
          for (const side of [-1, 1]) {
            for (const x of [-1.45, 1.45]) {
              vehiclePart(car, models[0].tire, rubber, x, 0.36, side * 0.82).rotation.x = Math.PI / 2;
              vehiclePart(car, models[0].hub, rim, x, 0.36, side * 0.89).rotation.x = Math.PI / 2;
              vehiclePart(car, new THREE.CylinderGeometry(0.08, 0.08, 0.04, 8), chromeMat, x, 0.36, side * 0.90).rotation.x = Math.PI / 2;
            }
            vehiclePart(car, new THREE.BoxGeometry(0.04, 0.32, 0.28), rubber, -2.36, 0.40, side * 0.74); // Rear mudflap
            vehiclePart(car, models[0].lamp, white, 2.25, 0.82, side * 0.64);
            vehiclePart(car, new THREE.BoxGeometry(0.09, 0.14, 0.14), amberMat, 2.24, 0.82, side * 0.82); // Front amber blinker
            vehiclePart(car, models[0].lamp, red, -2.43, 0.74, side * 0.64);
            vehiclePart(car, new THREE.BoxGeometry(0.06, 0.12, 0.12), amberMat, -2.43, 0.74, side * 0.82); // Rear blinker
            vehiclePart(car, new THREE.BoxGeometry(0.03, 0.03, 0.22), rubber, 1.98, 1.45, side * 0.88); // Mirror arm
            vehiclePart(car, models[0].mirror, rubber, 2.02, 1.45, side * 0.98);
          }
        } else {
          const typeIndex = vehicleKind === 4 ? 2 : (vehicleKind === 2 ? 1 : 0);
          const type = types[typeIndex];
          const model = models[typeIndex];
          vLen = type.length; vH = type.roof[1] + 0.05; vW = type.width;
          const isTaxi = vehicleKind === 1;
          const isBus = vehicleKind === 4;
          label = isTaxi ? '計程車' : (isBus ? '市區公車' : '私家車');
          const body = isTaxi ? taxiMat : (isBus ? busGreenMat : paint[(index + direction + slot + paint.length) % paint.length]);
          vehiclePart(car, model.shell, body, 0, 0, 0, true);
          vehiclePart(car, model.glazing, glass, 0, 0, 0);
          if (typeIndex === 0) {
            // Front grille + chrome slat + shark-fin antenna on sedans/taxis
            vehiclePart(car, new THREE.BoxGeometry(0.08, 0.22, 0.84), rubber, type.length / 2 - 0.04, type.lightY - 0.08, 0);
            vehiclePart(car, new THREE.BoxGeometry(0.09, 0.035, 0.76), chromeMat, type.length / 2 - 0.03, type.lightY - 0.04, 0);
            vehiclePart(car, new THREE.BoxGeometry(0.22, 0.09, 0.04), body, -0.95, type.roof[1] + 0.07, 0); // Shark-fin antenna
          }
          if (typeIndex === 1) {
            vehiclePart(car, vanWindshield, glass, 1.04, 1.63, 0).rotation.z = .75;
            vehiclePart(car, new THREE.BoxGeometry(0.08, 0.26, 1.02), rubber, type.length / 2 - 0.04, type.lightY - 0.04, 0);
            vehiclePart(car, new THREE.BoxGeometry(0.09, 0.04, 0.92), chromeMat, type.length / 2 - 0.03, type.lightY, 0);
          }
          if (typeIndex === 2) {
            vehiclePart(car, busWindshield, glass, 4.88, 2.23, 0).rotation.z = .03;
            vehiclePart(car, new THREE.BoxGeometry(0.08, 0.26, 1.38), busLedMat, 4.90, 2.95, 0); // Front route LED
            vehiclePart(car, new THREE.BoxGeometry(1.10, 0.20, 0.04), busLedMat, 2.40, 2.55, 1.26); // Side route LED
            vehiclePart(car, new THREE.BoxGeometry(2.6, 0.24, 1.55), truckBedMat, 0.8, 3.36, 0); // Roof AC pod 1
            vehiclePart(car, new THREE.BoxGeometry(2.0, 0.24, 1.55), truckBedMat, -2.2, 3.36, 0); // Roof AC pod 2
            vehiclePart(car, new THREE.BoxGeometry(9.2, 0.22, 2.52), truckBedMat, 0, 1.38, 0); // Taipei bus waist stripe
            vehiclePart(car, new THREE.BoxGeometry(0.06, 0.65, 1.80), rubber, -4.90, 1.15, 0); // Rear engine louver grille
          }
          vehiclePart(car, model.roof, isBus ? truckBedMat : body, type.roof[0], type.roof[1], 0);
          if (isTaxi) {
            vehiclePart(car, new THREE.BoxGeometry(0.32, 0.05, 0.44), rubber, 0.1, type.roof[1] + 0.05, 0);
            vehiclePart(car, new THREE.BoxGeometry(0.24, 0.14, 0.36), taxiSignMat, 0.1, type.roof[1] + 0.13, 0);
            vehiclePart(car, new THREE.BoxGeometry(0.04, 0.09, 0.18), taxiEmptyMat, 1.05, 1.16, -0.32); // "空車" LED indicator
            vehiclePart(car, new THREE.BoxGeometry(3.15, 0.07, 1.80), rubber, -0.05, 0.72, 0); // Taxi side trim strip
          }
          for (const end of [-1, 1]) {
            vehiclePart(car, model.bumper, rubber, end * (type.length / 2 - .03), type.lightY - .23, 0);
            vehiclePart(car, model.plate, plate, end * (type.length / 2 + .07), type.lightY - .23, 0);
          }
          for (const side of [-1, 1]) {
            for (const x of [-type.axle, type.axle]) {
              vehiclePart(car, model.tire, rubber, x, type.wheel, side * (type.width / 2 - .08)).rotation.x = Math.PI / 2;
              vehiclePart(car, model.hub, rim, x, type.wheel,
                side * (type.width / 2 - .067 + type.wheel * .32)).rotation.x = Math.PI / 2;
              vehiclePart(car, new THREE.CylinderGeometry(type.wheel * 0.22, type.wheel * 0.22, 0.035, 8), chromeMat, x, type.wheel,
                side * (type.width / 2 - .062 + type.wheel * .32)).rotation.x = Math.PI / 2;
            }
            const glassSide = type.width / 2 + (typeIndex === 0 ? -.10 : .043);
            for (const [x, y] of type.pillars) vehiclePart(car, model.pillar, body, x, y, side * glassSide);
            if (!isBus) {
              // Door handles
              for (const hx of [-0.45, 0.42]) {
                vehiclePart(car, new THREE.BoxGeometry(0.16, 0.04, 0.04), chromeMat, hx, type.lightY + 0.14, side * (type.width / 2 + 0.01));
              }
            }
            vehiclePart(car, model.lamp, white, type.length / 2 - .06, type.lightY, side * type.width * .33);
            vehiclePart(car, new THREE.BoxGeometry(0.09, 0.12, 0.12), amberMat, type.length / 2 - .08, type.lightY, side * type.width * .43);
            vehiclePart(car, model.lamp, red, -type.length / 2 + .02, type.lightY, side * type.width * .33);
            vehiclePart(car, new THREE.BoxGeometry(0.09, 0.12, 0.12), amberMat, -type.length / 2 + .02, type.lightY, side * type.width * .43);
            const mx = typeIndex === 2 ? 4.35 : .80;
            const my = typeIndex === 2 ? 2.13 : 1.25;
            vehiclePart(car, new THREE.BoxGeometry(0.04, 0.04, 0.16), rubber, mx - 0.04, my, side * (type.width / 2));
            vehiclePart(car, model.mirror, body, mx, my, side * (type.width / 2 + .08));
          }
        }
        car.position.set(-110 + ((index * 53 + slot * 115 + direction * 23) % 220), .06, z + direction * 2.9);
        car.rotation.y = direction === 1 ? 0 : Math.PI;
        cityGroup.add(car);
        roadVehicles.push({ car, direction, speed: 7.2 + ((index + slot) % 3) * 1.4 });
        movingColliders.push({ object: car, w: vLen, h: vH, d: vW, label });
      }

      // Moving Detailed Taiwanese 125cc Scooter + Articulated Helmeted Rider
      const mScooter = new THREE.Group();
      const mScColor = paint[(index + direction + 2) % paint.length];
      vehiclePart(mScooter, mvScBodyGeo, mScColor, 0, 0, 0, true);
      vehiclePart(mScooter, mvScFenderGeo, mScColor, 0.48, 0.28, 0); // Front fender
      vehiclePart(mScooter, new THREE.BoxGeometry(0.46, 0.11, 0.24), new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.85 }), -0.31, 0.72, 0); // Saddle
      vehiclePart(mScooter, mvScWheelGeo, rubber, 0.48, 0.24, 0).rotation.x = Math.PI / 2;
      vehiclePart(mScooter, mvScWheelGeo, rubber, -0.48, 0.24, 0).rotation.x = Math.PI / 2;
      vehiclePart(mScooter, new THREE.CylinderGeometry(0.14, 0.14, 0.13, 10), rim, 0.48, 0.24, 0).rotation.x = Math.PI / 2;
      vehiclePart(mScooter, new THREE.CylinderGeometry(0.14, 0.14, 0.13, 10), rim, -0.48, 0.24, 0).rotation.x = Math.PI / 2;
      vehiclePart(mScooter, new THREE.BoxGeometry(0.06, 0.18, 0.16), white, 0.59, 0.76, 0); // Headlight
      vehiclePart(mScooter, new THREE.BoxGeometry(0.04, 0.15, 0.24), glass, 0.49, 1.03, 0).rotation.z = 0.35; // Dark windscreen visor
      vehiclePart(mScooter, new THREE.BoxGeometry(0.05, 0.10, 0.16), red, -0.75, 0.56, 0); // Taillight
      vehiclePart(mScooter, new THREE.BoxGeometry(0.02, 0.12, 0.22), plate, -0.76, 0.44, 0); // Rear plate
      vehiclePart(mScooter, new THREE.CylinderGeometry(0.045, 0.055, 0.56, 8), rim, -0.35, 0.30, 0.18).rotation.z = Math.PI / 2 - 0.14; // Exhaust
      vehiclePart(mScooter, new THREE.CylinderGeometry(0.022, 0.022, 0.64, 8), rubber, 0.44, 0.99, 0).rotation.x = Math.PI / 2; // Handlebar
      for (const side of [-1, 1]) {
        vehiclePart(mScooter, new THREE.CylinderGeometry(0.02, 0.02, 0.44, 6), rim, 0.44, 0.46, side * 0.09).rotation.z = 0.18; // Front fork
        vehiclePart(mScooter, new THREE.CylinderGeometry(0.01, 0.01, 0.16, 6), rubber, 0.44, 1.06, side * 0.24); // Mirror stem
        vehiclePart(mScooter, new THREE.CylinderGeometry(0.05, 0.05, 0.03, 10), rubber, 0.44, 1.14, side * 0.28).rotation.z = Math.PI / 2; // Round mirrors
        const arm = vehiclePart(mScooter, new THREE.CylinderGeometry(0.045, 0.055, 0.52, 8), riderJacketMat, 0.14, 1.14, side * 0.23);
        arm.rotation.z = 1.15;
        const leg = vehiclePart(mScooter, new THREE.CylinderGeometry(0.065, 0.055, 0.48, 8), rubber, 0.02, 0.64, side * 0.14);
        leg.rotation.z = -0.35;
      }
      const torso = vehiclePart(mScooter, new THREE.BoxGeometry(0.24, 0.52, 0.36), riderJacketMat, -0.16, 1.12, 0, true);
      torso.rotation.z = -0.18;
      // Delivery thermal box on every 2nd scooter, commuter backpack on others
      if (index % 2 === 0) {
        vehiclePart(mScooter, new THREE.BoxGeometry(0.36, 0.38, 0.38), deliveryBoxMat, -0.50, 0.96, 0, true);
      } else {
        vehiclePart(mScooter, new THREE.BoxGeometry(0.16, 0.36, 0.28), backpackMat, -0.32, 1.14, 0, true).rotation.z = -0.18;
      }
      vehiclePart(mScooter, new THREE.SphereGeometry(0.155, 12, 12), helmetMat, -0.08, 1.48, 0, true);
      vehiclePart(mScooter, new THREE.BoxGeometry(0.10, 0.08, 0.22), glass, 0.03, 1.47, 0); // Dark helmet visor
      mScooter.position.set(-80 + index * 37 + direction * 45, 0.06, z + direction * 5.2);
      mScooter.rotation.y = direction === 1 ? 0 : Math.PI;
      cityGroup.add(mScooter);
      roadVehicles.push({ car: mScooter, direction, speed: 9.2 + (index % 3) });
      movingColliders.push({ object: mScooter, w: 1.5, h: 1.7, d: 0.7, label: '行駛機車' });
    }
  }

  // Instanced Curbside Parked Cars along Outer Ring (-122 / 122) & E-W Arterials (-24 / -110)
  const parkedSpots = [];
  for (const ax of [-122, 122]) {
    for (const z of [-206, -186, -166, -146, -86, -66, -46, -4]) {
      parkedSpots.push({ x: ax - 5.4, z, rotY: -Math.PI / 2 });
      parkedSpots.push({ x: ax + 5.4, z: z + 4.5, rotY: Math.PI / 2 });
    }
  }
  for (const sz of [-24, -110]) {
    for (const x of [-104, -84, -54, -34, 34, 54, 84, 104]) {
      if (sz === -110 && Math.abs(x) < 28) continue;
      parkedSpots.push({ x, z: sz - 6.0, rotY: 0 });
      parkedSpots.push({ x: x + 4.5, z: sz + 6.0, rotY: Math.PI });
    }
  }
  if (parkedSpots.length > 0) {
    const sedan = models[0];
    const sedanType = types[0];
    const carPaintMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.28, metalness: 0.48 });
    const pShells = new THREE.InstancedMesh(sedan.shell, carPaintMat, parkedSpots.length);
    const pGlass = new THREE.InstancedMesh(sedan.glazing, glass, parkedSpots.length);
    const pBumpers = new THREE.InstancedMesh(sedan.bumper, rubber, parkedSpots.length * 2);
    const pHeadlamps = new THREE.InstancedMesh(sedan.lamp, white, parkedSpots.length * 2);
    const pTaillamps = new THREE.InstancedMesh(sedan.lamp, red, parkedSpots.length * 2);
    const pMirrors = new THREE.InstancedMesh(sedan.mirror, carPaintMat, parkedSpots.length * 2);
    const pWheels = new THREE.InstancedMesh(sedan.tire, rubber, parkedSpots.length * 4);
    const pRims = new THREE.InstancedMesh(sedan.hub, rim, parkedSpots.length * 4);
    const carColors = [0xd4d4d8, 0x334155, 0x1e293b, 0x9ca3af, 0x1e3a5f, 0x6b2c2c]
      .map(hex => new THREE.Color(hex).convertSRGBToLinear());
    const pt = new THREE.Object3D();
    const wMat = new THREE.Matrix4();
    const wRot = new THREE.Matrix4().makeRotationX(Math.PI / 2);

    const setParkedPart = (mesh, idx, ps, lx, ly, lz, rotMatrix = null) => {
      const c = Math.cos(ps.rotY), s = Math.sin(ps.rotY);
      pt.position.set(ps.x + lx * c + lz * s, 0.06 + ly, ps.z - lx * s + lz * c);
      pt.rotation.set(0, ps.rotY, 0);
      pt.scale.set(1, 1, 1);
      pt.updateMatrix();
      if (rotMatrix) {
        wMat.copy(pt.matrix).multiply(rotMatrix);
        mesh.setMatrixAt(idx, wMat);
      } else {
        mesh.setMatrixAt(idx, pt.matrix);
      }
    };

    parkedSpots.forEach((ps, i) => {
      const carCol = carColors[i % carColors.length];
      setParkedPart(pShells, i, ps, 0, 0, 0);
      pShells.setColorAt(i, carCol);
      setParkedPart(pGlass, i, ps, 0, 0, 0);
      setParkedPart(pBumpers, i * 2, ps, sedanType.length / 2 - 0.03, sedanType.lightY - 0.23, 0);
      setParkedPart(pBumpers, i * 2 + 1, ps, -sedanType.length / 2 + 0.03, sedanType.lightY - 0.23, 0);

      let wi = 0;
      let si = 0;
      for (const side of [-1, 1]) {
        setParkedPart(pHeadlamps, i * 2 + si, ps, sedanType.length / 2 - 0.06, sedanType.lightY, side * sedanType.width * 0.33);
        setParkedPart(pTaillamps, i * 2 + si, ps, -sedanType.length / 2 + 0.02, sedanType.lightY, side * sedanType.width * 0.33);
        setParkedPart(pMirrors, i * 2 + si, ps, 0.80, 1.25, side * (sedanType.width / 2 + 0.06));
        pMirrors.setColorAt(i * 2 + si, carCol);
        si++;
        for (const ax of [-sedanType.axle, sedanType.axle]) {
          const wzOff = side * (sedanType.width / 2 - 0.14);
          setParkedPart(pWheels, i * 4 + wi, ps, ax, sedanType.wheel, wzOff, wRot);
          setParkedPart(pRims, i * 4 + wi, ps, ax, sedanType.wheel, side * (sedanType.width / 2 - 0.067 + sedanType.wheel * 0.32), wRot);
          wi++;
        }
      }
      registerBoxCollider(ps.x, 0.85, ps.z,
        Math.abs(Math.cos(ps.rotY)) > 0.5 ? sedanType.length : sedanType.width,
        1.6,
        Math.abs(Math.cos(ps.rotY)) > 0.5 ? sedanType.width : sedanType.length,
        '路邊停放車輛', '#64748b', false);
    });
    if (pShells.instanceColor) pShells.instanceColor.needsUpdate = true;
    if (pMirrors.instanceColor) pMirrors.instanceColor.needsUpdate = true;
    [pShells, pGlass, pBumpers, pHeadlamps, pTaillamps, pMirrors, pWheels, pRims].forEach((m) => {
      m.castShadow = m.receiveShadow = true;
      m.frustumCulled = false;
      cityGroup.add(m);
    });
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
  minX: -136, maxX: 136, minZ: -236, maxZ: 42,
  avenues: [-122, 0, 122],
  streets: [-224, -110, -24, 24],
  avenueWidth: 14, streetWidth: 15
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
    new THREE.MeshLambertMaterial({ color: new THREE.Color(0x2e3237).convertSRGBToLinear() }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -.04, centerZ);
  backdrop.add(ground);

  const west = [-halfWidth, CITY.minX];
  const east = [CITY.maxX, halfWidth];
  const north = [northEdge, CITY.minZ];
  const south = [CITY.maxZ, southEdge];
  const xs = [...west, ...CITY.avenues, ...east];
  const zs = [...north, ...CITY.streets, ...south].sort((a, b) => a - b);

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
    if (z === CITY.minZ || z === CITY.maxZ || z === northEdge || z === southEdge) continue;
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
      if (z === CITY.minZ || z === CITY.maxZ) continue;
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
      const isOuterX = xs[col] === -halfWidth || xs[col + 1] === halfWidth;
      const isOuterZ = zs[row] === northEdge || zs[row + 1] === southEdge;
      const lotWidth = xs[col + 1] - xs[col] - (isOuterX ? 2.5 : 22);
      const lotDepth = zs[row + 1] - zs[row] - (isOuterZ ? 2.5 : 18);
      if (lotWidth < 5 || lotDepth < 5) continue;
      const shiftedX = x;
      const green = !isOuterX && !isOuterZ && ((row + col) % 8 === 0);
      outerMapCourtyards.push([shiftedX, z, lotWidth, lotDepth, green]);
      if (green) continue;
      const edgeDistance = Math.max(CITY.minX - x, x - CITY.maxX, CITY.minZ - z, z - CITY.maxZ);
      const tall = random() < .56 && lotDepth > 10;
      const count = (isOuterX || isOuterZ) ? 1 : 2;
      for (let si = 0; si < count; si++) {
        const side = count === 1 ? 0 : (si === 0 ? -1 : 1);
        const bx = shiftedX + side * lotWidth * .23;
        const bz = z + (random() - .5) * lotDepth * .14;
        const w = count === 1 ? lotWidth * (.76 + random() * .16) : lotWidth * (.32 + random() * .13);
        const d = count === 1 ? lotDepth * (.76 + random() * .16) : lotDepth * (.58 + random() * .24);
        const h = tall ? 34 + random() * 46 : 16 + random() * 22;
        const color = palette[Math.floor(random() * palette.length)];
        const profile = (row + col * 2 + si) % 4;
        if (profile === 0 || tall) {
          const podium = h * .30;
          buildings.push([bx, podium / 2, bz, w, podium, d, color]);
          buildings.push([bx - w * .07, (h + podium) / 2, bz, w * .74, h - podium, d * .74, color]);
        } else if (profile === 1) {
          buildings.push([bx, h * .33, bz, w, h * .66, d, color]);
          buildings.push([bx + w * .16, h * .50, bz, w * .62, h, d * .78, color]);
        } else {
          const slabHeight = profile === 2 ? h * .64 : h;
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
    base: 0x45433f, asphalt: 0x2c3035, sidewalk: 0x7b746c, white: 0xd0cec6,
    yellow: 0xb88b3d, lawn: 0x3b5333, paving: 0x7c6556, court: 0x34625e,
    glass: 0x2e414d, metalRoof: 0x525a60, trim: 0x48525a, concrete: 0x7c766e,
    wood: 0x594235, leaves: 0x385432,
    slateRoof: 0x42464a, tealRoof: 0x4a5055, copperRoof: 0x52565a,
    tileRoof: 0x474b4f, greenRoof: 0x444c47, sandRoof: 0x5b5e62,
    puTrack: 0x7c362c, tinGreen: 0x324036, tinBlue: 0x394450,
    courtGreen: 0x244c3a, courtBlue: 0x1d3464, tankSteel: 0xb6bfc7, rimOrange: 0xc2480e
  };
  const materials = Object.fromEntries(Object.entries(colors).map(([key, color]) =>
    [key, new THREE.MeshStandardMaterial({ color: new THREE.Color(color).convertSRGBToLinear(), roughness: 0.88 })]));
  applyTreeWindShader(materials.leaves, true);
  function surfaceMaterial(asphalt) {
    const size = 512;
    const tile = document.createElement('canvas');
    tile.width = tile.height = size;
    const ctx = tile.getContext('2d');
    const rCanvas = document.createElement('canvas');
    rCanvas.width = rCanvas.height = size;
    const rCtx = rCanvas.getContext('2d');

    let seed = asphalt ? 2304 : 4096;
    const sample = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    if (asphalt) {
      // Realistic weathered Taiwanese urban asphalt
      ctx.fillStyle = '#3a3d42';
      ctx.fillRect(0, 0, size, size);
      rCtx.fillStyle = '#e6e6e6'; // ~0.90 roughness
      rCtx.fillRect(0, 0, size, size);

      // Asphalt repair patches (柏油路面施工修補色塊與瀝青封縫)
      for (let p = 0; p < 5; p++) {
        const px = sample() * (size - 120);
        const py = sample() * (size - 120);
        const pw = 45 + sample() * 95;
        const ph = 30 + sample() * 80;
        ctx.fillStyle = p % 2 === 0 ? '#2b2d31' : '#33363b';
        ctx.fillRect(px, py, pw, ph);
        ctx.strokeStyle = '#1b1d20';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(px, py, pw, ph);
        rCtx.fillStyle = '#c4c4c4'; // slightly smoother patched tar
        rCtx.fillRect(px, py, pw, ph);
      }

      // Multi-scale mineral aggregate grain
      for (let i = 0; i < 16000; i++) {
        const x = sample() * size;
        const y = sample() * size;
        const s = 1 + sample() * 1.8;
        ctx.fillStyle = sample() > 0.52 ? 'rgba(225, 220, 210, 0.14)' : 'rgba(18, 20, 26, 0.24)';
        ctx.fillRect(x, y, s, s);
      }

      // Subtle tire wear & oil grime streaks
      for (let i = 0; i < 18; i++) {
        const gx = sample() * size;
        const gy = sample() * size;
        const gr = 14 + sample() * 28;
        const grad = ctx.createRadialGradient(gx, gy, 2, gx, gy, gr);
        grad.addColorStop(0, 'rgba(18, 20, 24, 0.16)');
        grad.addColorStop(1, 'rgba(18, 20, 24, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(gx - gr, gy - gr, gr * 2, gr * 2);
      }
    } else {
      // Authentic Taiwanese interlocking terracotta/concrete sidewalk bricks (紅磚人行道)
      ctx.fillStyle = '#8b7365';
      ctx.fillRect(0, 0, size, size);
      rCtx.fillStyle = '#ececec';
      rCtx.fillRect(0, 0, size, size);

      const brickW = 32;
      const brickH = 16;
      const brickPalette = ['#9c7563', '#8f6b5a', '#a47e6b', '#876758', '#967261', '#7d7771'];
      for (let row = 0; row < size / brickH; row++) {
        const offset = (row % 2) * (brickW / 2);
        for (let col = -1; col < size / brickW + 1; col++) {
          const bx = col * brickW + offset;
          const by = row * brickH;
          ctx.fillStyle = brickPalette[Math.floor(sample() * brickPalette.length)];
          ctx.fillRect(bx + 1, by + 1, brickW - 2, brickH - 2);
        }
      }
      // Fine surface weathering & mortar grime
      for (let i = 0; i < 7000; i++) {
        ctx.fillStyle = sample() > 0.5 ? 'rgba(255,245,230,0.08)' : 'rgba(25,22,20,0.16)';
        ctx.fillRect(sample() * size, sample() * size, 1.5, 1.5);
      }
      // Subtle damp moss/stain patches
      for (let i = 0; i < 10; i++) {
        const mx = sample() * size;
        const my = sample() * size;
        const mr = 18 + sample() * 34;
        const grad = ctx.createRadialGradient(mx, my, 2, mx, my, mr);
        grad.addColorStop(0, 'rgba(38, 44, 34, 0.18)');
        grad.addColorStop(1, 'rgba(38, 44, 34, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(mx - mr, my - mr, mr * 2, mr * 2);
      }
    }

    const texture = new THREE.CanvasTexture(tile);
    texture.encoding = THREE.sRGBEncoding;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

    const rTex = new THREE.CanvasTexture(rCanvas);
    rTex.wrapS = rTex.wrapT = THREE.RepeatWrapping;

    return new THREE.MeshStandardMaterial({
      map: texture,
      roughnessMap: rTex,
      bumpMap: texture,
      bumpScale: asphalt ? 0.045 : 0.065,
      roughness: asphalt ? 0.94 : 0.92
    });
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
  block('sidewalk', 0, .01, centerZ, cityWidth, .04, cityDepth);
  surface(walkSurface, 0, .035, centerZ, cityWidth, cityDepth, 5.2);

  // Brand-New Radial + Roundabout + Diagonal + Outer Ring Road Masterplan (全新放射圓環＋斜向大道＋外環道城市路網)
  const NEW_ROAD_SEGMENTS = [
    [0, -24, 0, -110, 16],        // 中央林蔭大道 (South -> Central Roundabout)
    [0, -110, 0, -224, 14],       // 北側市政大道 (Central Roundabout -> North Ring)
    [0, -110, 122, -110, 15],     // 東側商業大道
    [0, -110, -122, -110, 15],    // 西側老街大道
    [0, -110, 122, -224, 14],     // 東北金融斜向大道
    [0, -110, -122, -224, 14],    // 西北文教斜向大道
    [0, -24, 122, -110, 12],      // 東南斜向商街
    [0, -24, -122, -110, 12],     // 西南騎樓老街
    [-124, -224, 124, -224, 14],  // 北外環道
    [-124, 24, 124, 24, 14],      // 南外環道
    [-122, -226, -122, 26, 14],   // 西外環道
    [122, -226, 122, 26, 14],     // 東外環道
    [-122, -24, 122, -24, 14]     // 中南橫向聯絡道
  ];

  function pointToSegDist(px, pz, x1, z1, x2, z2) {
    const vx = x2 - x1, vz = z2 - z1;
    const lenSq = vx * vx + vz * vz;
    if (lenSq < 1e-6) return Math.hypot(px - x1, pz - z1);
    const t = Math.max(0, Math.min(1, ((px - x1) * vx + (pz - z1) * vz) / lenSq));
    return Math.hypot(px - (x1 + t * vx), pz - (z1 + t * vz));
  }

  function isClearOfRoads(cx, cz, radius) {
    if (Math.hypot(cx - 0, cz - (-110)) < 26.5 + radius) return false; // Central Roundabout
    if (Math.hypot(cx - 0, cz - 0) < 16.5 + radius) return false;       // Helipad Plaza
    for (const [x1, z1, x2, z2, rw] of NEW_ROAD_SEGMENTS) {
      if (pointToSegDist(cx, cz, x1, z1, x2, z2) < rw * 0.5 + radius) return false;
    }
    return true;
  }

  // Render every road segment with asphalt surface, yellow double centerline, and white edge markings
  NEW_ROAD_SEGMENTS.forEach(([x1, z1, x2, z2, rw], segIdx) => {
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    const ang = Math.atan2(dx, dz);
    const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;

    const rGeo = new THREE.PlaneGeometry(rw, len);
    const rUv = rGeo.attributes.uv;
    for (let i = 0; i < rUv.count; i++) {
      rUv.setXY(i, rUv.getX(i) * rw / 6, rUv.getY(i) * len / 6);
    }
    const rMesh = new THREE.Mesh(rGeo, roadSurface);
    rMesh.rotation.order = 'YXZ';
    rMesh.rotation.y = ang;
    rMesh.rotation.x = -Math.PI / 2;
    rMesh.position.set(mx, 0.055 + segIdx * 0.0005, mz);
    rMesh.receiveShadow = true;
    group.add(rMesh);

    // Double yellow centerline + white lane edge stripes
    const lineGrp = new THREE.Group();
    lineGrp.position.set(mx, 0.068 + segIdx * 0.0005, mz);
    lineGrp.rotation.y = ang;
    for (const yOff of [-0.16, 0.16]) {
      const yLine = new THREE.Mesh(new THREE.PlaneGeometry(0.12, Math.max(4, len - 14)), materials.yellow);
      yLine.rotation.x = -Math.PI / 2;
      yLine.position.x = yOff;
      lineGrp.add(yLine);
    }
    for (const eSide of [-1, 1]) {
      const eLine = new THREE.Mesh(new THREE.PlaneGeometry(0.14, Math.max(4, len - 10)), materials.white);
      eLine.rotation.x = -Math.PI / 2;
      eLine.position.x = eSide * (rw * 0.46);
      lineGrp.add(eLine);
    }
    group.add(lineGrp);
    outerMapRoads.push([x1, z1, x2, z2, rw]);
  });

  // Grand Central Landscaped Roundabout at (0, -110) (市中心景觀大圓環)
  const rbX = 0, rbZ = -110;
  const rbRoad = new THREE.Mesh(new THREE.CylinderGeometry(24.5, 24.5, 0.14, 40), roadSurface);
  rbRoad.position.set(rbX, 0.015, rbZ);
  rbRoad.receiveShadow = true;
  group.add(rbRoad);
  const rbRing = new THREE.Mesh(new THREE.RingGeometry(17.2, 17.6, 40), materials.yellow);
  rbRing.rotation.x = -Math.PI / 2;
  rbRing.position.set(rbX, 0.095, rbZ);
  group.add(rbRing);
  const rbCurb = new THREE.Mesh(new THREE.CylinderGeometry(11.6, 11.9, 0.38, 36), materials.concrete);
  rbCurb.position.set(rbX, 0.19, rbZ);
  rbCurb.receiveShadow = true;
  group.add(rbCurb);
  const rbLawn = new THREE.Mesh(new THREE.CylinderGeometry(10.8, 10.8, 0.40, 36), materials.lawn);
  rbLawn.position.set(rbX, 0.21, rbZ);
  rbLawn.receiveShadow = true;
  group.add(rbLawn);
  block('concrete', rbX, 1.2, rbZ, 4.2, 2.0, 4.2);
  block('trim', rbX, 5.4, rbZ, 1.6, 6.8, 1.6);
  block('white', rbX, 9.2, rbZ, 1.1, 1.1, 1.1);
  registerBoxCollider(rbX, 4.6, rbZ, 4.4, 9.2, 4.4, '市中心圓環紀念碑', '#94a3b8', false);
  cityLandmarks.push({ name: '市中心圓環', x: rbX, z: rbZ });
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
    const cw = 256;
    const floorH = 32;
    const ch = Math.max(32, floors * floorH);
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    const office = kind === 'office';
    const bays = office && variant === 2 ? 4 : kind === 'housing' && variant === 1 ? 5 : 6;
    const bayWidth = cw / bays;

    let fSeed = 701 + floors * 37 + variant * 113;
    const fRand = () => {
      fSeed = (Math.imul(1664525, fSeed) + 1013904223) >>> 0;
      return fSeed / 4294967296;
    };

    // Taiwanese weathered ceramic tile & 5 distinct commercial office palettes
    const twTileColors = ['#cfc8ba', '#c2bcb0', '#a8715d', '#aeb5a8'];
    const officeColors = ['#344656', '#948b7e', '#262b30', '#4f4339', '#b8b0a2'];
    ctx.fillStyle = office ? officeColors[variant % 5] : twTileColors[variant % 4];
    ctx.fillRect(0, 0, cw, ch);

    if (!office) {
      // Subtle per-tile tonal variation (二丁掛磁磚深淺色差)
      for (let ty = 0; ty < ch; ty += 4) {
        for (let tx = 0; tx < cw; tx += 12) {
          if (fRand() > 0.65) {
            ctx.fillStyle = fRand() > 0.5 ? 'rgba(255,250,240,0.08)' : 'rgba(30,25,20,0.08)';
            ctx.fillRect(tx, ty, 11, 3);
          }
        }
      }
      // Horizontal & vertical ceramic tile grout lines
      ctx.fillStyle = 'rgba(28, 25, 22, 0.13)';
      for (let ty = 0; ty < ch; ty += 4) {
        ctx.fillRect(0, ty, cw, 1);
      }
      ctx.fillStyle = 'rgba(28, 25, 22, 0.06)';
      for (let tx = 0; tx < cw; tx += 12) {
        ctx.fillRect(tx, 0, 1, ch);
      }

      // Top parapet rain-streak weathering (頂樓女兒牆滲水黑斑)
      const topGrime = ctx.createLinearGradient(0, 0, 0, 26);
      topGrime.addColorStop(0, 'rgba(28, 26, 24, 0.34)');
      topGrime.addColorStop(1, 'rgba(28, 26, 24, 0)');
      ctx.fillStyle = topGrime;
      ctx.fillRect(0, 0, cw, 26);

      for (let s = 0; s < 14; s++) {
        const sx = fRand() * cw;
        const sy = fRand() * ch * 0.65;
        const sh = 18 + fRand() * 42;
        const sg = ctx.createLinearGradient(0, sy, 0, sy + sh);
        sg.addColorStop(0, 'rgba(24, 22, 20, 0.18)');
        sg.addColorStop(1, 'rgba(24, 22, 20, 0)');
        ctx.fillStyle = sg;
        ctx.fillRect(sx, sy, 3 + fRand() * 6, sh);
      }
    }

    for (let floor = 0; floor < floors; floor++) {
      const y = floor * floorH;
      // Floor slab / spandrel shadow line
      ctx.fillStyle = office ? '#253440' : '#7b766d';
      ctx.fillRect(0, y + floorH - 3, cw, office ? 3 : 2);

      // Ground floor (bottom of canvas, floor === floors - 1): Taiwanese roll-up shutter & shopfront
      if (!office && floor === floors - 1) {
        ctx.fillStyle = '#334155';
        ctx.fillRect(0, y, cw, floorH);
        for (let bay = 0; bay < bays; bay++) {
          const bx = bay * bayWidth + 3;
          const bw = bayWidth - 6;
          if ((bay + variant) % 3 === 0) {
            // Warm lit convenience / shop glass bay
            ctx.fillStyle = '#fef3c7';
            ctx.fillRect(bx, y + 4, bw, floorH - 5);
            ctx.fillStyle = 'rgba(30, 41, 59, 0.35)';
            ctx.fillRect(bx, y + 4, bw, 4);
          } else {
            // Roll-up steel shutter (鐵捲門)
            ctx.fillStyle = '#475569';
            ctx.fillRect(bx, y + 4, bw, floorH - 5);
            ctx.fillStyle = '#64748b';
            for (let sy = y + 6; sy < y + floorH - 2; sy += 3) {
              ctx.fillRect(bx, sy, bw, 1);
            }
          }
        }
        continue;
      }

      for (let bay = 0; bay < bays; bay++) {
        const inset = office ? 3 : 7;
        const x = inset + bay * bayWidth;
        const width = bayWidth - inset * 2;
        const winY = y + 5;
        const winH = office ? 22 : 19;

        // Deep baked window recess AO shadow
        ctx.fillStyle = '#141c24';
        ctx.fillRect(x - 2, winY - 1, width + 4, winH + 2);

        // Glass pane
        if (office) {
          const gGrad = ctx.createLinearGradient(0, winY, 0, winY + winH);
          gGrad.addColorStop(0, ['#386685', '#2a4654', '#374151', '#785a40', '#2d4b5a'][variant % 5]);
          gGrad.addColorStop(1, '#14202b');
          ctx.fillStyle = gGrad;
          ctx.fillRect(x, winY, width, winH);
          // Subtle interior venetian blind / ceiling light hint
          if ((floor * 5 + bay) % 4 === 0) {
            ctx.fillStyle = 'rgba(254, 243, 199, 0.22)';
            ctx.fillRect(x + 1, winY + 2, width - 2, 7);
          }
          // Crisp aluminum mullion highlight
          ctx.fillStyle = 'rgba(203, 213, 225, 0.32)';
          ctx.fillRect(x, winY, width, 1.5);
        } else {
          // Residential window with dark interior & subtle sky reflection
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(x, winY, width, winH);
          if ((floor + bay) % 5 === 0) {
            // Warm interior light
            ctx.fillStyle = 'rgba(253, 230, 138, 0.38)';
            ctx.fillRect(x + 2, winY + 2, width - 4, winH - 4);
          }
          ctx.fillStyle = (floor + bay) % 3 === 0 ? 'rgba(186, 230, 253, 0.28)' : 'rgba(255, 255, 255, 0.14)';
          ctx.fillRect(x + 1, winY + 1, width - 2, 5);

          // Concrete window sill + water-streak stain underneath (窗台滴水黑漬)
          ctx.fillStyle = '#d6d3cd';
          ctx.fillRect(x - 2, winY + winH, width + 4, 2.5);
          const sillStain = ctx.createLinearGradient(0, winY + winH + 2, 0, winY + winH + 9);
          sillStain.addColorStop(0, 'rgba(25, 22, 20, 0.26)');
          sillStain.addColorStop(1, 'rgba(25, 22, 20, 0)');
          ctx.fillStyle = sillStain;
          ctx.fillRect(x - 1, winY + winH + 2, width + 2, 7);

          // Taiwanese Stainless / Green Iron Window Grille (外推防盜鐵窗花網格)
          if ((floor + bay) % 2 === 0) {
            ctx.strokeStyle = (floor + variant) % 3 === 0 ? '#6b7c74' : '#94a3b8';
            ctx.lineWidth = 1.2;
            ctx.strokeRect(x, winY, width, winH);
            for (let gx = x + 5; gx < x + width; gx += 6) {
              ctx.beginPath();
              ctx.moveTo(gx, winY);
              ctx.lineTo(gx, winY + winH);
              ctx.stroke();
            }
          }

          // Wall-mounted AC outdoor unit (外掛冷氣室外機)
          if ((floor * 3 + bay) % 4 === 0) {
            ctx.fillStyle = '#e2e8f0';
            ctx.fillRect(x + width - 6, winY + winH - 9, 10, 8);
            ctx.fillStyle = '#334155';
            ctx.fillRect(x + width - 4, winY + winH - 7, 4, 4);
          }
        }
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      bumpMap: texture,
      bumpScale: office ? 0.04 : 0.09,
      roughness: office ? 0.24 : 0.86,
      metalness: office ? 0.42 : 0.04
    });
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
    { name: '四方雲集', sub: '鍋貼 • 水餃 專賣名店', bg: '#e69908', fg: '#991b1b', border: '#991b1b', logo: '餃' },
    { name: '早安美又美', sub: '中西式活力精緻早午餐', bg: '#f5f3ee', fg: '#15803d', border: '#b91c1c', logo: '美' },
    { name: '全民福利中心', sub: 'QM MART 買進美好生活', bg: '#1e40af', fg: '#ffffff', border: '#dc2626', logo: 'QM' },
    { name: '全臺電子', sub: '足感心 3C 家電專賣', bg: '#c81e1e', fg: '#ffffff', border: '#f8fafc', logo: '全' },
    { name: '康是好', sub: 'COSGOOD 藥妝生活館', bg: '#d94e0c', fg: '#ffffff', border: '#fed7aa', logo: 'C' },
    { name: 'SYK 三洋機車', sub: '專業維修 排氣定檢 買賣', bg: '#991b1b', fg: '#ffffff', border: '#f8fafc', logo: 'SYK' },
    { name: '大喊過癮', sub: '百元風味臭臭小火鍋', bg: '#d9a406', fg: '#7f1d1d', border: '#7f1d1d', logo: '火' },
    { name: '清心福泉', sub: '特級純茶 • 手搖冷飲專賣', bg: '#15803d', fg: '#ffffff', border: '#dc2626', logo: '泉' },
    { name: '池下木片便當', sub: '正宗池下米 現做現包', bg: '#6b2f0e', fg: '#fef08a', border: '#fef08a', logo: '米' },
    { name: '大林眼鏡', sub: '專業驗光配鏡 • 隱形眼鏡', bg: '#1e3a8a', fg: '#ffffff', border: '#60a5fa', logo: '鏡' },
    { name: '屈臣士', sub: 'Watso 美麗與健康生活', bg: '#0e7490', fg: '#ffffff', border: '#ffffff', logo: 'W' },
    { name: '台康藥局', sub: '健保特約 處方調劑 慢性病', bg: '#f5f3ee', fg: '#1d4ed8', border: '#16a34a', logo: '✚' },
    { name: '振華五金', sub: '水電衛浴 五金工具 配件', bg: '#0369a1', fg: '#ffffff', border: '#facc15', logo: '華' },
    { name: '弘叔漢堡', sub: '美味活力早餐 連鎖專賣', bg: '#ea580c', fg: '#ffffff', border: '#ffffff', logo: '弘' },
    { name: '小南百貨', sub: '24H 生活五金 • 百貨批發', bg: '#eab308', fg: '#1e3a8a', border: '#b91c1c', logo: '南' },
    { name: '蝦殼店到店', sub: '包裹寄取 便利生活取件門市', bg: '#dc4e0c', fg: '#ffffff', border: '#ffffff', logo: 'S' }
  ];

  function applyLightboxWeathering(ctx, w, h) {
    // Internal fluorescent/LED lightbox hotspot gradient (中心燈管亮、邊緣鋁框暗)
    const grad = ctx.createRadialGradient(w * 0.5, h * 0.5, w * 0.08, w * 0.5, h * 0.5, Math.max(w, h) * 0.72);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.14)');
    grad.addColorStop(0.65, 'rgba(255, 255, 255, 0.0)');
    grad.addColorStop(1, 'rgba(15, 23, 42, 0.26)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Top-edge rain streaks & street dust weathering (上方雨水流痕與風化)
    ctx.fillStyle = 'rgba(15, 23, 42, 0.16)';
    for (let sx = 12; sx < w; sx += 22) {
      const len = 10 + ((sx * 17) % 24);
      ctx.fillRect(sx, 0, 2, len);
    }
    // Metallic aluminum frame rim + corner rivets
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, w - 4, h - 4);
    ctx.fillStyle = '#cbd5e1';
    for (const [rx, ry] of [[8, 8], [w - 8, 8], [8, h - 8], [w - 8, h - 8]]) {
      ctx.beginPath();
      ctx.arc(rx, ry, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  let interiorShopTex = null;
  function getInteriorShopTexture() {
    if (interiorShopTex) return interiorShopTex;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const bg = ctx.createLinearGradient(0, 0, 0, 128);
    bg.addColorStop(0, '#451a03');
    bg.addColorStop(0.55, '#78350f');
    bg.addColorStop(1, '#1e293b');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 256, 128);
    // Warm ceiling pendant lights
    ctx.fillStyle = '#fef3c7';
    for (const lx of [42, 108, 174, 224]) {
      ctx.beginPath();
      ctx.arc(lx, 18, 9, 0, Math.PI * 2);
      ctx.fill();
    }
    // Merchandise shelves & counter silhouettes
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 86, 256, 42);
    ctx.fillStyle = '#334155';
    for (let sx = 16; sx < 240; sx += 44) {
      ctx.fillRect(sx, 38, 32, 48);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(sx + 2, 46, 28, 4);
      ctx.fillRect(sx + 2, 60, 28, 4);
      ctx.fillRect(sx + 2, 74, 28, 4);
      ctx.fillStyle = '#334155';
    }
    interiorShopTex = new THREE.CanvasTexture(canvas);
    interiorShopTex.encoding = THREE.sRGBEncoding;
    return interiorShopTex;
  }

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

    applyLightboxWeathering(ctx, 512, 128);

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

    applyLightboxWeathering(ctx, 128, 384);

    const texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    genericVerticalTextures.set(shop.name, texture);
    return texture;
  }

  const storefrontGlassMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    transparent: true,
    opacity: 0.42,
    roughness: 0.08,
    metalness: 0.72
  });
  let interiorShopMat = null;

  function addGenericStreetStorefront(bx, bz, bw, bd, brandIndex, facing = 'S') {
    const shop = TAIWAN_LOCAL_SHOPS[brandIndex % TAIWAN_LOCAL_SHOPS.length];
    const spanAlong = (facing === 'E' || facing === 'W') ? bd : bw;
    const halfDepth = ((facing === 'E' || facing === 'W') ? bw : bd) / 2;
    const signW = Math.min(spanAlong * 0.78, 12.0);
    const signH = 1.85;
    const signY = 3.95;

    if (!interiorShopMat) {
      const iTex = getInteriorShopTexture();
      interiorShopMat = new THREE.MeshStandardMaterial({
        map: iTex,
        emissiveMap: iTex,
        emissive: new THREE.Color(0xffe8b8),
        emissiveIntensity: state.timeOfDay === 'night' ? 0.95 : 0.42,
        roughness: 0.6
      });
      window.taiwanEmissiveMaterials.push(interiorShopMat);
    }

    const sfGroup = new THREE.Group();
    sfGroup.position.set(bx, 0, bz);
    sfGroup.rotation.y = facing === 'N' ? Math.PI : facing === 'E' ? Math.PI / 2 : facing === 'W' ? -Math.PI / 2 : 0;
    group.add(sfGroup);

    // 1F Recessed Interior Depth (一樓室內景深貨架＋暖光吊燈 + 外層反光落地玻璃＋鋁框＋鐵捲門箱)
    const interiorMesh = new THREE.Mesh(new THREE.PlaneGeometry(signW * 0.90, 2.50), interiorShopMat);
    interiorMesh.position.set(0, 1.50, halfDepth + 0.03);
    sfGroup.add(interiorMesh);

    const winMesh = new THREE.Mesh(cube, storefrontGlassMat);
    winMesh.position.set(0, 1.50, halfDepth + 0.16);
    winMesh.scale.set(signW * 0.92, 2.52, 0.03);
    sfGroup.add(winMesh);

    // Vertical aluminum mullions + top roll-up shutter box
    for (const mx of [-0.45, 0, 0.45]) {
      const mul = new THREE.Mesh(cube, materials.trim);
      mul.position.set(mx * signW, 1.50, halfDepth + 0.18);
      mul.scale.set(0.08, 2.55, 0.08);
      sfGroup.add(mul);
    }
    const shutterBox = new THREE.Mesh(cube, materials.trim);
    shutterBox.position.set(0, 2.88, halfDepth + 0.16);
    shutterBox.scale.set(signW * 0.96, 0.24, 0.24);
    sfGroup.add(shutterBox);

    // 3D Steel Lightbox Cabinet + Acrylic Face (立體鋁框壓克力燈箱招牌)
    const signBox = new THREE.Mesh(cube, materials.trim);
    signBox.position.set(0, signY, halfDepth + 0.12);
    signBox.scale.set(signW + 0.16, signH + 0.14, 0.22);
    sfGroup.add(signBox);

    const signGeo = new THREE.PlaneGeometry(signW, signH);
    const signTex = getGenericStoreTexture(shop);
    const signMat = new THREE.MeshStandardMaterial({
      map: signTex,
      roughness: 0.20,
      metalness: 0.12,
      emissiveMap: signTex,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: state.timeOfDay === 'night' ? 0.72 : (state.timeOfDay === 'sunset' ? 0.30 : 0.08),
      side: THREE.DoubleSide
    });
    const signMesh = new THREE.Mesh(signGeo, signMat);
    signMesh.position.set(0, signY, halfDepth + 0.25);
    signMesh.castShadow = signMesh.receiveShadow = true;
    sfGroup.add(signMesh);

    // Gooseneck Spotlight Arms above signboard (招牌上方投射燈臂)
    for (const lx of [-0.30, 0.30]) {
      const arm = new THREE.Mesh(cube, materials.asphalt);
      arm.position.set(lx * signW, signY + signH / 2 + 0.18, halfDepth + 0.34);
      arm.scale.set(0.06, 0.06, 0.42);
      sfGroup.add(arm);
      const lamp = new THREE.Mesh(cube, materials.white);
      lamp.position.set(lx * signW, signY + signH / 2 + 0.12, halfDepth + 0.52);
      lamp.scale.set(0.14, 0.08, 0.14);
      sfGroup.add(lamp);
    }

    // Sloped Taiwanese Fabric Awning / Canopy below sign (彩色帆布遮雨棚)
    const awningPalette = [0xb91c1c, 0x15803d, 0x1d4ed8, 0xc2410c, 0x0f766e, 0x991b1b];
    const awningMat = new THREE.MeshStandardMaterial({
      color: awningPalette[brandIndex % awningPalette.length],
      roughness: 0.78,
      metalness: 0.05
    });
    const awningMesh = new THREE.Mesh(cube, awningMat);
    awningMesh.position.set(0, 2.92, halfDepth + 0.72);
    awningMesh.scale.set(signW + 0.3, 0.12, 1.4);
    awningMesh.rotation.x = 0.24;
    awningMesh.castShadow = awningMesh.receiveShadow = true;
    sfGroup.add(awningMesh);

    // Protruding Vertical Double-Sided Blade Sign
    const vertW = 1.15;
    const vertH = 3.2;
    const vertY = 5.1;
    const vertX = spanAlong * 0.40;
    const vertZ = halfDepth + vertW / 2 + 0.12;

    const vertGeo = new THREE.PlaneGeometry(vertW, vertH);
    const vertTex = getGenericVerticalTexture(shop);
    const vertMat = new THREE.MeshStandardMaterial({
      map: vertTex,
      roughness: 0.42,
      metalness: 0.05,
      emissiveMap: vertTex,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: state.timeOfDay === 'night' ? 0.65 : (state.timeOfDay === 'sunset' ? 0.25 : 0.04),
      side: THREE.DoubleSide
    });
    const vertMesh = new THREE.Mesh(vertGeo, vertMat);
    vertMesh.position.set(vertX, vertY, vertZ);
    vertMesh.rotation.y = Math.PI / 2;
    vertMesh.castShadow = vertMesh.receiveShadow = true;
    sfGroup.add(vertMesh);

    // Steel Wall Mounting Brackets
    for (const byOff of [1.1, -1.1]) {
      const br = new THREE.Mesh(cube, materials.trim);
      br.position.set(vertX, vertY + byOff, halfDepth + vertW / 2);
      br.scale.set(0.08, 0.08, vertW);
      sfGroup.add(br);
    }
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

    const CORP_SIGNS = [
      { name: '國安世華金控', sub: 'KATHY FINANCIAL', bg: '#14532d', accent: '#4ade80', emblem: 'K' },
      { name: '台興金融大樓', sub: 'TAIXING BANK', bg: '#991b1b', accent: '#fca5a5', emblem: '興' },
      { name: '富安商辦中心', sub: 'FUAN TOWER', bg: '#1e3a8a', accent: '#60a5fa', emblem: 'F' },
      { name: '遠方科技廣場', sub: 'FARTECH PLAZA', bg: '#0f766e', accent: '#5eead4', emblem: '遠' },
      { name: '誠信生活商場', sub: 'CHENGXIN LIFE', bg: '#292524', accent: '#fbbf24', emblem: '誠' },
      { name: '星光商業大樓', sub: 'STARLIGHT TOWER', bg: '#b91c1c', accent: '#fde047', emblem: '★' },
      { name: '玉峰金融總部', sub: 'YUFENG HOLDING', bg: '#15803d', accent: '#bbf7d0', emblem: '玉' },
      { name: '中臺電信大樓', sub: 'ZHONGTAI 5G+', bg: '#1d4ed8', accent: '#38bdf8', emblem: 'T' },
      { name: '宏基科技中心', sub: 'HONGJI TECH', bg: '#166534', accent: '#86efac', emblem: 'H' },
      { name: '兆盛國際大樓', sub: 'ZHAOSHENG INTL', bg: '#7f1d1d', accent: '#fdba74', emblem: '兆' }
    ];

    const ov = variant % 5;
    if (office && ov !== 0) {
      if (ov === 1) {
        // Granite Podium + Octagonal Glass Skyscraper (花崗岩基座＋八角形玻璃帷幕塔樓)
        const podium = 2;
        const bottom = .2 + podium * 3.2;
        mass(x, z, w, d, .2, podium);
        const rad = Math.min(w, d) * 0.40;
        const cylH = (floors - podium) * 3.2;
        const cylMat = facade('office', floors - podium, 1);
        const cylMesh = new THREE.Mesh(
          new THREE.CylinderGeometry(rad, rad * 1.03, cylH, 8),
          [cylMat, materials[roof], materials.concrete]
        );
        cylMesh.position.set(x, bottom + cylH / 2, z);
        cylMesh.rotation.y = Math.PI / 8;
        cylMesh.castShadow = cylMesh.receiveShadow = true;
        group.add(cylMesh);
        registerBoxCollider(x, bottom + cylH / 2, z, rad * 1.85, cylH, rad * 1.85, label, color, false);
        topW = rad * 1.5;
        topD = rad * 1.5;
      } else if (ov === 2) {
        // Twin-Tower Skybridge Complex + Spire (雙塔空中連廊＋天線尖塔)
        const podium = 2;
        const bottom = .2 + podium * 3.2;
        mass(x, z, w, d, .2, podium);
        const towerW = w * 0.38;
        const towerD = d * 0.78;
        const remFloors = Math.max(4, floors - podium);
        mass(x - w * 0.25, z, towerW, towerD, bottom, remFloors, false);
        mass(x + w * 0.25, z, towerW, towerD, bottom, remFloors, false);
        // Elevated Glass Skybridge at 60% height
        const bridgeY = bottom + remFloors * 3.2 * 0.62;
        block('trim', x, bridgeY, z, w * 0.34, 2.8, towerD * 0.45);
        topX = x + w * 0.25;
        topW = towerW;
        topD = towerD;
        block('concrete', topX, height + 1.35, z, topW * .42, 2.2, topD * .42);
        block('trim', topX, height + 4.2, z, .25, 4.6, .25);
      } else if (ov === 3) {
        // 3-Tier Stepped Terraced Financial Tower with Horizontal Sunshades (三段退縮金融大樓)
        const f1 = Math.max(3, Math.floor(floors * 0.45));
        const f2 = Math.max(2, Math.floor(floors * 0.32));
        const f3 = Math.max(2, floors - f1 - f2);
        mass(x, z, w, d, .2, f1);
        mass(x, z, w * 0.80, d * 0.82, .2 + f1 * 3.2, f2, false);
        topW = w * 0.60;
        topD = d * 0.64;
        mass(x, z, topW, topD, .2 + (f1 + f2) * 3.2, f3, false);
        for (let f = 2; f < f1; f += 2) {
          const fy = 0.2 + f * 3.2;
          block('trim', x, fy, z + d / 2 + 0.22, w + 0.25, 0.14, 0.42);
          block('trim', x, fy, z - d / 2 - 0.22, w + 0.25, 0.14, 0.42);
        }
      } else {
        // Bold Corner-Pier & Horizontal Banded Modern Tower with Glowing Crown (柱列退縮＋發光冠頂)
        mass(x, z, w * 0.92, d * 0.92, .2, floors);
        for (const sx of [-1, 1]) {
          for (const sz of [-1, 1]) {
            block('concrete', x + sx * w * 0.44, .2 + height / 2, z + sz * d * 0.44, 0.72, height + 0.8, 0.72);
          }
        }
        block('trim', x, .2 + height - 0.8, z, w * 0.98, 1.2, d * 0.98);
        topW = w * 0.92;
        topD = d * 0.92;
      }
    } else if (office && ov === 0) {
      // Modern Glass Curtain-Wall Tower with Vertical Aluminum Fins & Cooling Crown
      mass(x, z, w, d, .2, floors);
      for (const fOff of [-0.34, -0.11, 0.11, 0.34]) {
        block('trim', x + fOff * w, .2 + height / 2, z + d / 2 + 0.16, 0.20, height, 0.32);
        block('trim', x + fOff * w, .2 + height / 2, z - d / 2 - 0.16, 0.20, height, 0.32);
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

      if (kind === 'housing') {
        // 3D Concrete floor-slab ledges & window rain canopies (水泥層間線腳與雨遮)
        for (let floor = 1; floor < floors; floor++) {
          const fy = 0.2 + floor * 3.2;
          block('concrete', x, fy, z + d / 2 + 0.14, w + 0.12, 0.18, 0.28);
          block('concrete', x, fy, z - d / 2 - 0.14, w + 0.12, 0.18, 0.28);
          // 3D Exterior AC outdoor units mounted along facade
          if (floor % 2 === (variant % 2)) {
            block('white', x - w * 0.28, fy + 1.0, z + d / 2 + 0.24, 0.85, 0.58, 0.36);
            block('white', x + w * 0.28, fy + 1.0, z - d / 2 - 0.24, 0.85, 0.58, 0.36);
          }
          // Protruding balconies with railings
          if (variant !== 0 || floor % 2 === 1) {
            for (const side of [-1, 1]) {
              const front = z + d / 2 + 0.38;
              const bay = x + side * w * 0.22;
              block('concrete', bay, fy + 0.24, front, w * 0.28, 0.22, 0.88);
              block(variant === 1 ? 'trim' : 'wood', bay, fy + 0.62, front + 0.40, w * 0.28, 0.56, 0.08);
            }
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

    // 5. Commercial AC Chillers, 3D Framed Corporate Rooftop Signage & LED Video Walls (商辦立體企業招牌與 LED 電視牆)
    if (office) {
      for (let i = 0; i < 2; i++) {
        block('trim', topX + (i - 0.5) * 3.2, topY + 0.6, topZ + topD * 0.2, 1.8, 1.2, 1.4);
      }
      const corpIdx = Math.abs(Math.round(x * 3 + z * 5 + variant)) % CORP_SIGNS.length;
      const corp = CORP_SIGNS[corpIdx];
      const corpW = Math.min(topW * 0.86, 10.5);

      // Build realistic 3D framed corporate sign texture with emblem + bilingual text
      const cCanvas = document.createElement('canvas');
      cCanvas.width = 512;
      cCanvas.height = 128;
      const cCtx = cCanvas.getContext('2d');
      cCtx.fillStyle = corp.bg;
      cCtx.fillRect(0, 0, 512, 128);
      cCtx.fillStyle = corp.accent;
      cCtx.fillRect(0, 0, 512, 8);
      cCtx.fillRect(0, 120, 512, 8);
      // Left geometric badge
      cCtx.beginPath();
      cCtx.arc(64, 64, 42, 0, Math.PI * 2);
      cCtx.fillStyle = '#ffffff';
      cCtx.fill();
      cCtx.fillStyle = corp.bg;
      cCtx.font = 'bold 42px "Microsoft JhengHei", sans-serif';
      cCtx.textAlign = 'center';
      cCtx.textBaseline = 'middle';
      cCtx.fillText(corp.emblem, 64, 66);
      // Chinese + English title
      cCtx.fillStyle = '#ffffff';
      cCtx.textAlign = 'left';
      cCtx.font = 'bold 50px "Microsoft JhengHei", sans-serif';
      cCtx.fillText(corp.name, 122, 50);
      cCtx.fillStyle = corp.accent;
      cCtx.font = 'bold 22px sans-serif';
      cCtx.fillText(corp.sub, 124, 96);

      const corpTex = new THREE.CanvasTexture(cCanvas);
      corpTex.encoding = THREE.sRGBEncoding;
      const corpMat = new THREE.MeshStandardMaterial({
        map: corpTex,
        emissiveMap: corpTex,
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: state.timeOfDay === 'night' ? 0.72 : 0.16,
        roughness: 0.35
      });
      window.taiwanEmissiveMaterials.push(corpMat);

      for (const side of [-1, 1]) {
        const szPos = topZ + side * (topD / 2 + 0.16);
        // Steel backing cabinet + mounting struts
        block('trim', topX, topY + 1.15, szPos - side * 0.14, corpW + 0.35, 2.0, 0.24);
        block('trim', topX - corpW * 0.32, topY + 0.3, szPos - side * 0.25, 0.18, 0.8, 0.35);
        block('trim', topX + corpW * 0.32, topY + 0.3, szPos - side * 0.25, 0.18, 0.8, 0.35);
        const cFace = new THREE.Mesh(new THREE.PlaneGeometry(corpW, 1.8), corpMat);
        cFace.position.set(topX, topY + 1.15, szPos + side * 0.02);
        if (side < 0) cFace.rotation.y = Math.PI;
        group.add(cFace);
      }

      // Large Exterior Glowing LED Video Wall (商辦外牆大型 LED 電視牆廣告)
      if (ov === 0 || ov === 2 || ov === 3) {
        const LED_ADS = [
          { headline: '中臺電信 5G+ 極速時代', sub: '全台覆蓋第一 • 智慧城市旗艦', c1: '#0284c7', c2: '#1e1b4b', tag: '5G LIVE' },
          { headline: '星光百貨 週年慶盛典', sub: '全館滿 5000 送 500 • VIP 尊榮禮遇', c1: '#be123c', c2: '#4c0519', tag: 'SALE 80%' },
          { headline: '台興行動銀行 智慧理財', sub: '24H 數位金融 • 跨行轉帳零手續費', c1: '#b91c1c', c2: '#18181b', tag: 'FINTECH' },
          { headline: '遠方雲端 AI 企業高峰會', sub: '算力新紀元 • 台北信義旗艦館', c1: '#0f766e', c2: '#0f172a', tag: 'AI EXPO' },
          { headline: '誠信生活 城市閱讀季', sub: '24小時書店 • 精選文創設計展', c1: '#b45309', c2: '#1c1917', tag: 'CULTURE' }
        ];
        const ad = LED_ADS[corpIdx % LED_ADS.length];
        const lCanvas = document.createElement('canvas');
        lCanvas.width = 512;
        lCanvas.height = 256;
        const lCtx = lCanvas.getContext('2d');
        const grad = lCtx.createLinearGradient(0, 0, 512, 256);
        grad.addColorStop(0, ad.c1);
        grad.addColorStop(1, ad.c2);
        lCtx.fillStyle = grad;
        lCtx.fillRect(0, 0, 512, 256);
        // Diagonal graphic accent
        lCtx.fillStyle = 'rgba(255,255,255,0.12)';
        lCtx.beginPath();
        lCtx.moveTo(320, 0); lCtx.lineTo(512, 0); lCtx.lineTo(512, 256); lCtx.lineTo(220, 256);
        lCtx.closePath();
        lCtx.fill();
        // Top tag pill
        lCtx.fillStyle = '#facc15';
        lCtx.fillRect(28, 28, 128, 34);
        lCtx.fillStyle = '#0f172a';
        lCtx.font = 'bold 22px sans-serif';
        lCtx.textAlign = 'center';
        lCtx.textBaseline = 'middle';
        lCtx.fillText(ad.tag, 92, 46);
        // Main ad headline
        lCtx.fillStyle = '#ffffff';
        lCtx.textAlign = 'left';
        lCtx.font = 'bold 42px "Microsoft JhengHei", sans-serif';
        lCtx.fillText(ad.headline, 28, 128);
        lCtx.fillStyle = '#e2e8f0';
        lCtx.font = 'bold 22px "Microsoft JhengHei", sans-serif';
        lCtx.fillText(ad.sub, 28, 186);
        // Subtle LED matrix scanline overlay
        lCtx.fillStyle = 'rgba(0,0,0,0.16)';
        for (let sy = 0; sy < 256; sy += 6) {
          lCtx.fillRect(0, sy, 512, 2);
        }
        const ledTex = new THREE.CanvasTexture(lCanvas);
        ledTex.encoding = THREE.sRGBEncoding;
        const ledMat = new THREE.MeshStandardMaterial({
          map: ledTex,
          emissiveMap: ledTex,
          emissive: new THREE.Color(0xffffff),
          emissiveIntensity: state.timeOfDay === 'night' ? 0.95 : 0.42,
          roughness: 0.22
        });
        window.taiwanEmissiveMaterials.push(ledMat);
        const ledW = Math.min(w * 0.72, 8.6);
        const ledH = ledW * 0.52;
        const ledY = 9.2;
        const ledZ = z + d / 2 + 0.24;
        block('asphalt', x, ledY, ledZ - 0.10, ledW + 0.4, ledH + 0.4, 0.22); // Aluminum bezel
        const ledFace = new THREE.Mesh(new THREE.PlaneGeometry(ledW, ledH), ledMat);
        ledFace.position.set(x, ledY, ledZ + 0.04);
        group.add(ledFace);
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
    ctx.fillStyle = '#f8f6f0';
    ctx.textAlign = 'center';
    ctx.font = 'bold 58px sans-serif';
    ctx.fillText(text, 256, 84);
    const texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(width, height),
      new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.48,
        emissiveMap: texture,
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: state.timeOfDay === 'night' ? 0.55 : (state.timeOfDay === 'sunset' ? 0.2 : 0.02),
        side: THREE.DoubleSide
      }));
    face.position.set(x, y, z);
    face.castShadow = face.receiveShadow = true;
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

    // 4. Organic Shade Trees & Park Benches
    const parkTrunkGeo = new THREE.CylinderGeometry(0.18, 0.27, 2.8, 8);
    const parkCrownGeo = new THREE.DodecahedronGeometry(1.45, 1);
    for (const side of [-1, 1]) {
      for (const dx of [-.38, -.15, .15, .38]) {
        const tx = x + w * dx;
        const tz = z + side * (d / 2 - 4.5);
        const trunk = new THREE.Mesh(parkTrunkGeo, materials.wood);
        trunk.position.set(tx, 1.55, tz);
        trunk.castShadow = trunk.receiveShadow = true;
        group.add(trunk);
        const puffs = [
          [0, 3.6, 0, 1.15, 0.95],
          [-0.75, 3.1, 0.45, 0.85, 0.8],
          [0.75, 3.2, -0.4, 0.9, 0.82],
          [0.15, 3.15, 0.75, 0.82, 0.78]
        ];
        for (const [ox, oy, oz, sx, sy] of puffs) {
          const crown = new THREE.Mesh(parkCrownGeo, materials.leaves);
          crown.position.set(tx + ox, oy, tz + oz);
          crown.scale.set(sx, sy, sx);
          crown.rotation.set(ox, oz, oy);
          crown.castShadow = crown.receiveShadow = true;
          group.add(crown);
        }
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

  function chamferCornerBuilding(label, cx, cz, bw, bd, cornerSignX, cornerSignZ, floors, variant = 0) {
    const h = floors * 3.2;
    const cut = 3.8;
    const hw = bw / 2, hd = bd / 2;
    const pts = [];
    // Build footprint in XZ plane (Shape XY -> rotated -PI/2 around X)
    if (cornerSignX > 0 && cornerSignZ > 0) {
      pts.push([-hw, -hd], [hw, -hd], [hw, hd - cut], [hw - cut, hd], [-hw, hd]);
    } else if (cornerSignX < 0 && cornerSignZ > 0) {
      pts.push([-hw, -hd], [hw, -hd], [hw, hd], [-hw + cut, hd], [-hw, hd - cut]);
    } else if (cornerSignX > 0 && cornerSignZ < 0) {
      pts.push([-hw, -hd], [hw - cut, -hd], [hw, -hd + cut], [hw, hd], [-hw, hd]);
    } else {
      pts.push([-hw + cut, -hd], [hw, -hd], [hw, hd], [-hw, hd], [-hw, -hd + cut]);
    }
    const shape = new THREE.Shape();
    pts.forEach(([px, pz], idx) => (idx === 0 ? shape.moveTo(px, -pz) : shape.lineTo(px, -pz)));
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    // Scale UVs so facade texture tiles cleanly around the chamfered building
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, uv.getX(i) / Math.max(bw, bd), uv.getY(i) / h);
    }
    const wallMat = facade('housing', floors, variant);
    const mesh = new THREE.Mesh(geo, [materials.slateRoof, wallMat]);
    mesh.position.set(cx, 0.2, cz);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    registerBoxCollider(cx, 0.2 + h / 2, cz, bw - 0.6, h, bd - 0.6, label, '#947b6f', true);

    // Rooftop water tank & stairhead
    const topY = 0.2 + h;
    addWaterTank(cx - cornerSignX * bw * 0.15, topY, cz - cornerSignZ * bd * 0.15);

    // 45-degree Chamfered Corner Signboard (三角窗斜角大招牌)
    const diagX = cx + cornerSignX * (hw - cut * 0.45);
    const diagZ = cz + cornerSignZ * (hd - cut * 0.45);
    const rotAngle = Math.atan2(cornerSignX, cornerSignZ);
    const sMesh = sign(label, diagX, 4.2, diagZ, cut * 1.35, 1.5, variant % 2 === 0 ? '#1d4ed8' : '#b91c1c');
    sMesh.rotation.y = rotAngle;
  }

  // 1. Place Major Civic Landmarks in Radial Sectors (各大分區公共地標)
  // 市立國民小學 at (-64, -158) (aligned with Option A Training Waypoint 1)
  {
    const sx = -64, sz = -158, sw = 40, sd = 32;
    block('concrete', sx, 1.1, sz + sd / 2 - 0.3, sw * 0.35, 1.8, 0.35);
    block('concrete', sx + sw * 0.28, 1.1, sz + sd / 2 - 0.3, sw * 0.35, 1.8, 0.35);
    block('concrete', sx + sw / 2 - 0.3, 1.1, sz, 0.35, 1.8, sd);
    sign('市立國民小學', sx - 2, 2.6, sz + sd / 2 - 0.1, 8.5, 1.35, '#1e3a8a');
    const wingX = sx, wingZ = sz - sd * 0.25, wingW = sw - 4, wingD = 10.5;
    building('市立國民小學', 'housing', wingX, wingZ, wingW, wingD, 4, 1);
    for (let cf = 1; cf < 4; cf++) {
      const cy = 0.2 + cf * 3.2;
      block('concrete', wingX, cy + 0.12, wingZ + wingD / 2 + 1.0, wingW, 0.24, 2.0);
      block('white', wingX, cy + 0.65, wingZ + wingD / 2 + 1.92, wingW, 0.85, 0.12);
    }
    const fieldZ = sz + sd * 0.18, fw = sw - 6, fd = sd * 0.44;
    block('puTrack', sx, 0.22, fieldZ, fw, 0.08, fd);
    block('lawn', sx, 0.26, fieldZ, fw - 5.5, 0.08, fd - 5.5);
    block('trim', sx - fw / 2 + 2.2, 4.2, fieldZ, 0.14, 8.0, 0.14);
    cityMapAreas.push({ x: sx, z: fieldZ, w: fw, d: fd, color: '#395c4a' });
    cityLandmarks.push({ name: '市立小學', x: sx, z: sz });
  }

  park('市民公園', 52, -196, 32, 24);
  building('市民服務中心', 'civic', -26, -196, 26, 20, 3);
  sign('市民服務中心', -26, 5.2, -184.5, 12, 2.1, '#5a5072');
  cityLandmarks.push({ name: '市民服務中心', x: -26, z: -196 });

  park('鄰里公園', -36, 2, 34, 16);
  building('市區派出所', 'civic', 36, 2, 26, 15, 3);
  sign('市區派出所', 36, 5.1, 10.2, 11, 1.8, '#344d79');
  cityLandmarks.push({ name: '市區派出所', x: 36, z: 2 });

  const landmarkZones = [
    { x: -64, z: -158, rx: 24, rz: 20 }, // 市立國民小學
    { x: 52, z: -196, rx: 20, rz: 16 },  // 市民公園
    { x: -26, z: -196, rx: 18, rz: 15 }, // 市民服務中心
    { x: -36, z: 2, rx: 21, rz: 12 },    // 鄰里公園
    { x: 36, z: 2, rx: 17, rz: 12 }      // 市區派出所
  ];

  // 2. Populate Entire Radial + Ring + Diagonal City with High-Density Downtown Buildings & 1F Storefronts
  let lotIdx = 0;
  for (let gz = -210; gz <= 10; gz += 17) {
    yield;
    for (let gx = -108; gx <= 108; gx += 17) {
      // Slight organic jitter so blocks follow radial/ring feel rather than rigid grid
      const jx = gx + (((lotIdx * 7) % 3) - 1) * 1.1;
      const jz = gz + (((lotIdx * 11) % 3) - 1) * 1.1;
      lotIdx++;

      if (!isClearOfRoads(jx, jz, 8.2)) continue;
      if (landmarkZones.some(lz => Math.abs(jx - lz.x) < lz.rx && Math.abs(jz - lz.z) < lz.rz)) continue;
      // Keep central avenue shophouse corridor (x in [-20..20], z in [-86..-30]) clear for taiwanShops
      if (Math.abs(jx) < 20 && jz > -88 && jz < -28) continue;

      const seedH = Math.abs(Math.round(jx * 3 + jz * 5 + lotIdx * 7));
      const bw = 13.0 + (seedH % 3) * 0.8;
      const bd = 12.8 + ((seedH >> 2) % 3) * 0.8;

      // Zoning: East/North-East Financial High-Rise Core; West/South-West Mixed Shophouse Core
      const isFinancial = jx > 16 || jz < -125;
      const isOfficeBldg = isFinancial ? (seedH % 5 !== 0) : (seedH % 3 === 0);
      const kind = isOfficeBldg ? 'office' : 'housing';
      const name = isOfficeBldg ? '商辦大樓' : '市中心住商大樓';
      const floors = isOfficeBldg ? (9 + (seedH % 14)) : (5 + (seedH % 7));
      const variant = isOfficeBldg ? (seedH % 5) : (seedH % 4);

      building(name, kind, jx, jz, bw, bd, floors, variant);

      // Attach 1F storefronts facing nearest cardinal direction
      const facing = jz > -110 ? (jx > 0 ? 'W' : 'E') : (jz > -170 ? 'S' : 'N');
      addGenericStreetStorefront(jx, jz, bw, bd, seedH % TAIWAN_LOCAL_SHOPS.length, facing);
      if (seedH % 2 === 0) {
        addGenericStreetStorefront(jx, jz, bw, bd, (seedH + 5) % TAIWAN_LOCAL_SHOPS.length, facing === 'S' ? 'E' : 'S');
      }
    }
  }

  // Authentic Taiwanese 45-deg Chamfered Corner Buildings ("三角窗") near key hubs
  chamferCornerBuilding('玉峰銀行', -22, -92, 10, 10, 1, -1, 5, 0);
  chamferCornerBuilding('全臺電子', 22, -92, 10, 10, -1, -1, 4, 2);
  chamferCornerBuilding('屈臣士', 22, -128, 10, 10, -1, 1, 5, 0);
  chamferCornerBuilding('叮叮藥局', -22, -128, 10, 10, 1, 1, 4, 1);

  // Pedestrian square around the Helipad
  block('paving', 0, .10, 0, 24, .20, 22);
  block('white', -10, .22, 0, .12, .018, 20);
  block('white', 10, .22, 0, .12, .018, 20);
  cityLandmarks.push({ name: '起降廣場', x: 0, z: 0 }, { name: '老街商圈', x: -56, z: -56 }, { name: '金融中心', x: 64, z: -156 });

  // Instanced Taipei Roadside Street Trees along ALL Radial, Diagonal & Ring Boulevards
  const treeSites = [];
  NEW_ROAD_SEGMENTS.forEach(([x1, z1, x2, z2, rw]) => {
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    const ux = dx / len, uz = dz / len;
    const nx = -uz, nz = ux;
    for (let d = 16; d < len - 14; d += 15) {
      const px = x1 + ux * d, pz = z1 + uz * d;
      if (Math.hypot(px, pz + 110) < 27) continue; // Keep Roundabout clear
      if (Math.hypot(px, pz) < 18) continue;       // Keep Helipad clear
      if (Math.abs(px) < 12 && pz > -85 && pz < -28) continue; // Keep market shophouses clear
      for (const side of [-1, 1]) {
        const tx = px + nx * side * (rw * 0.5 + 1.4);
        const tz = pz + nz * side * (rw * 0.5 + 1.4);
        if (isClearOfRoads(tx, tz, 0.8)) {
          treeSites.push([tx, tz]);
        }
      }
    }
  });
  if (treeSites.length > 0) {
    const stTrunkGeo = new THREE.CylinderGeometry(0.14, 0.20, 2.7, 7);
    const stCrownGeo = new THREE.DodecahedronGeometry(1.35, 1);
    const stTrunks = new THREE.InstancedMesh(stTrunkGeo, materials.wood, treeSites.length);
    const stCrowns = new THREE.InstancedMesh(stCrownGeo, materials.leaves, treeSites.length * 3);
    const tt = new THREE.Object3D();
    treeSites.forEach(([tx, tz], i) => {
      block('concrete', tx, 0.19, tz, 1.25, 0.06, 1.25);
      tt.position.set(tx, 1.5, tz);
      tt.rotation.set(0, i * 0.7, 0);
      tt.scale.set(1, 1, 1);
      tt.updateMatrix();
      stTrunks.setMatrixAt(i, tt.matrix);

      const offsets = [[0, 3.35, 0, 1.05], [-0.55, 2.9, 0.35, 0.78], [0.55, 2.95, -0.35, 0.82]];
      offsets.forEach(([ox, oy, oz, sc], j) => {
        tt.position.set(tx + ox, oy, tz + oz);
        tt.rotation.set(ox, i + j, oz);
        tt.scale.set(sc, sc * 0.88, sc);
        tt.updateMatrix();
        stCrowns.setMatrixAt(i * 3 + j, tt.matrix);
      });
    });
    stTrunks.castShadow = stTrunks.receiveShadow = true;
    stCrowns.castShadow = stCrowns.receiveShadow = true;
    stTrunks.frustumCulled = stCrowns.frustumCulled = false;
    group.add(stTrunks, stCrowns);
  }

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
    mesh.castShadow = ['wood', 'trim', 'concrete'].includes(key);
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
    new THREE.MeshStandardMaterial({ color: 0x3b4046, roughness: 0.86 })
  );
  padDisc.receiveShadow = true;
  padGroup.add(padDisc);

  const yellowRing = new THREE.Mesh(
    new THREE.RingGeometry(5.6, 6.2, 32),
    new THREE.MeshStandardMaterial({ color: 0xb88b3d, roughness: 0.88, side: THREE.DoubleSide })
  );
  yellowRing.rotation.x = -Math.PI / 2;
  yellowRing.position.y = 0.12;
  yellowRing.receiveShadow = true;
  padGroup.add(yellowRing);

  const hMat = new THREE.MeshStandardMaterial({ color: 0xd6d3cb, roughness: 0.88 });
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

    let tSeed = 919;
    const tRand = () => {
      tSeed = (Math.imul(1664525, tSeed) + 1013904223) >>> 0;
      return tSeed / 4294967296;
    };
    for (let y = 0; y < 256; y += 16) {
      const shift = (y / 16) % 2 === 0 ? 0 : 20;
      for (let x = shift - 20; x < 256 + 40; x += 40) {
        if (tRand() > 0.55) {
          ctx.fillStyle = tRand() > 0.5 ? 'rgba(255,250,240,0.06)' : 'rgba(20,18,16,0.08)';
          ctx.fillRect(x, y, 38, 14);
        }
      }
    }

    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    for (let y = 0; y < 256; y += 16) {
      ctx.fillRect(0, y, 256, 2);
    }
    for (let y = 0; y < 256; y += 16) {
      const shift = (y / 16) % 2 === 0 ? 0 : 20;
      for (let x = shift; x < 256 + 40; x += 40) {
        ctx.fillRect(x, y, 2, 16);
      }
    }

    // Subtle rain grime streaks
    for (let i = 0; i < 8; i++) {
      const sx = tRand() * 256;
      const g = ctx.createLinearGradient(0, 0, 0, 90 + tRand() * 140);
      g.addColorStop(0, 'rgba(20,18,16,0.14)');
      g.addColorStop(1, 'rgba(20,18,16,0)');
      ctx.fillStyle = g;
      ctx.fillRect(sx, 0, 4 + tRand() * 8, 256);
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
    'bafang': { name: '四方雲集', sub: '鍋貼 • 水餃 專賣店', bg: '#e69908', fg: '#991b1b', border: '#991b1b', logo: '餃' },
    'meiemei': { name: '早安美又美', sub: '中西式精緻活力早午餐', bg: '#f5f3ee', fg: '#15803d', border: '#b91c1c', logo: '美' },
    'pxmart': { name: '全民福利中心', sub: '買進美好生活 QM MART', bg: '#1e40af', fg: '#ffffff', border: '#dc2626', logo: 'QM' },
    'elife': { name: '全臺電子', sub: '足感心 3C 家電生活館', bg: '#c81e1e', fg: '#ffffff', border: '#f8fafc', logo: '全' },
    'cosmed': { name: '康是好', sub: 'COSGOOD 藥妝美彩生活館', bg: '#d94e0c', fg: '#ffffff', border: '#fed7aa', logo: 'C' },
    'sym': { name: 'SYK 三洋機車', sub: '專業維修 排氣定檢 買賣', bg: '#991b1b', fg: '#ffffff', border: '#f8fafc', logo: 'SYK' },
    'dahu': { name: '大喊過癮', sub: '百元風味臭臭小火鍋', bg: '#d9a406', fg: '#7f1d1d', border: '#7f1d1d', logo: '火' },
    'chishang': { name: '池下木片便當', sub: '正宗池下米 現包快餐', bg: '#6b2f0e', fg: '#fef08a', border: '#fef08a', logo: '米' },
    'kobayashi': { name: '大林眼鏡', sub: '專業驗光配鏡 • 隱形眼鏡', bg: '#1e3a8a', fg: '#ffffff', border: '#60a5fa', logo: '鏡' },
    'taian': { name: '台康藥局', sub: '健保特約 處方調劑 慢性病', bg: '#f5f3ee', fg: '#1d4ed8', border: '#16a34a', logo: '✚' },
    'hardware': { name: '振華五金', sub: '水電衛浴 五金工具 配件', bg: '#0369a1', fg: '#ffffff', border: '#facc15', logo: '華' },
    'hongya': { name: '弘叔漢堡', sub: '美味活力早餐 連鎖專賣', bg: '#ea580c', fg: '#ffffff', border: '#ffffff', logo: '弘' },
    'showba': { name: '小南百貨', sub: '24H 生活五金 • 百貨批發', bg: '#eab308', fg: '#1e3a8a', border: '#b91c1c', logo: '南' },
    'shopee': { name: '蝦殼店到店', sub: '包裹寄取 便利生活取件門市', bg: '#dc4e0c', fg: '#ffffff', border: '#ffffff', logo: 'S' },
    'louisa': { name: '露易莎咖啡', sub: 'Louisa Style 職人手沖', bg: '#2b1a11', fg: '#ea580c', border: '#ea580c', logo: 'L' },
    'poya': { name: '寶亞 BOYA', sub: 'BOYA 美妝生活流行館', bg: '#e11d48', fg: '#ffffff', border: '#ffffff', logo: 'B' },
    'hilife': { name: '來爾富', sub: 'Hi-Day 便利超商 24H', bg: '#c81e1e', fg: '#ffffff', border: '#fbbf24', logo: 'Hi' },
    'chunghwa': { name: '中台電信', sub: '中台電信 5G 行動門市', bg: '#0369a1', fg: '#ffffff', border: '#ffffff', logo: '中' },
    'fried_chicken': { name: '台灣第一攤鹽酥雞', sub: '特製胡椒鹽 宵夜第一首選', bg: '#991b1b', fg: '#fef08a', border: '#fef08a', logo: '雞' },
    'bubble_tea': { name: '麻吉茶坊', sub: 'MAJI 芝芝鮮果飲專賣', bg: '#c81e1e', fg: '#ffffff', border: '#fef08a', logo: '茶' },
    'dintaifung': { name: '鼎泰隆', sub: '黃金十八摺小籠包點心', bg: '#7f1d1d', fg: '#fef08a', border: '#fef08a', logo: '鼎' },
    'beef_soup': { name: '阿忠麵線', sub: '萬華老店 柴魚大腸麵線', bg: '#6b2f0e', fg: '#ffffff', border: '#f59e0b', logo: '麵' },
    'braised_pork': { name: '鬍鬚王魯肉飯', sub: '正宗經典 台灣魯肉便當', bg: '#d9a406', fg: '#7f1d1d', border: '#7f1d1d', logo: '王' },
    'sanma': { name: '三姨臭臭鍋', sub: '正宗平價 百元風味臭臭鍋', bg: '#991b1b', fg: '#ffffff', border: '#facc15', logo: '三' },
    'four_seas': { name: '五湖遊龍', sub: '鍋貼水餃 專賣名店', bg: '#d94e0c', fg: '#ffffff', border: '#ffffff', logo: '龍' },
    'kebuke': { name: '可以喝熟成紅茶', sub: '熟成純茶 • 冷飲專賣', bg: '#064e3b', fg: '#d1fae5', border: '#d97706', logo: '喝' },
    'mwd': { name: '麥味香', sub: 'My Warm Bistro 溫暖早午餐', bg: '#15803d', fg: '#ffffff', border: '#ffffff', logo: '麥' },
    'yamaha': { name: '山野機車', sub: 'YAMADA 專業保修定檢', bg: '#1e40af', fg: '#ffffff', border: '#ef4444', logo: 'Y' },
    'yifang': { name: '二芳水果茶', sub: '傳承古法 台灣水果茶專賣', bg: '#6b2f0e', fg: '#fef08a', border: '#f59e0b', logo: '芳' }
  };

  function drawTaiwanBrandSign(ctx, brandKey, isVertical, width, height) {
    ctx.clearRect(0, 0, width, height);

    if (brandKey === '7eleven') {
      if (isVertical) {
        // 8-TWELVE 直立側招 (白底大8 + 綠底白字 + 橘底24H)
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, width, height * 0.44);

        const centerX = width / 2;
        ctx.fillStyle = '#007a33';
        ctx.font = '900 108px "Arial Black", "Impact", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('8', centerX, height * 0.21);

        ctx.fillStyle = '#ea7317';
        ctx.fillRect(14, height * 0.21 - 12, width - 28, 24);
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 15px "Arial Black", sans-serif';
        ctx.fillText('TWELVE', centerX, height * 0.21);

        ctx.fillStyle = '#007a33';
        ctx.fillRect(0, height * 0.44, width, height * 0.56);

        ctx.fillStyle = '#ffffff';
        ctx.font = '900 34px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
        ctx.fillText('８', centerX, height * 0.52);
        ctx.fillText('T', centerX, height * 0.59);
        ctx.fillText('W', centerX, height * 0.66);
        ctx.fillText('E', centerX, height * 0.73);
        ctx.fillText('L', centerX, height * 0.80);
        ctx.fillText('V', centerX, height * 0.87);
        ctx.fillText('E', centerX, height * 0.94);

        ctx.fillStyle = '#ea7317';
        ctx.fillRect(10, height - 32, width - 20, 24);
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 18px "Arial Black", sans-serif';
        ctx.fillText('24H', centerX, height - 20);
      } else {
        // 8-TWELVE 門面大橫招
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, width, height);

        ctx.fillStyle = '#ea7317';
        ctx.fillRect(0, 0, width, 22);

        ctx.fillStyle = '#007a33';
        ctx.fillRect(0, height - 22, width, 22);

        const midY = height / 2;
        ctx.fillStyle = '#007a33';
        ctx.font = '900 82px "Arial Black", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('8', 95, midY);

        ctx.fillStyle = '#ea7317';
        ctx.fillRect(42, midY - 9, 106, 18);
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 13px "Arial Black", sans-serif';
        ctx.fillText('TWELVE', 95, midY);

        ctx.fillStyle = '#007a33';
        ctx.font = '900 44px "Microsoft JhengHei", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('統二超商', 170, midY - 6);

        ctx.font = 'bold 20px "Microsoft JhengHei", sans-serif';
        ctx.fillStyle = '#dc2626';
        ctx.fillText('8-12', 360, midY - 6);

        ctx.fillStyle = '#475569';
        ctx.font = 'bold 18px "Microsoft JhengHei", sans-serif';
        ctx.fillText('24H 鮮食咖啡・現萃茶・生活寄件服務', 170, midY + 28);
      }
    } else if (brandKey === 'familymart') {
      if (isVertical) {
        // 我家便利商店 OurMart 直立側招 (藍白綠經典三色)
        ctx.fillStyle = '#0086c9';
        ctx.fillRect(0, 0, width, height * 0.28);
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 24px "Arial Black", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Our', width / 2, height * 0.11);
        ctx.fillText('Mart', width / 2, height * 0.19);

        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, height * 0.28, width, height * 0.34);
        ctx.fillStyle = '#0086c9';
        ctx.font = '900 36px "Microsoft JhengHei", sans-serif';
        ctx.fillText('我', width / 2, height * 0.38);
        ctx.fillText('家', width / 2, height * 0.50);

        ctx.fillStyle = '#00963b';
        ctx.fillRect(0, height * 0.62, width, height * 0.38);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 26px "Microsoft JhengHei", sans-serif';
        ctx.fillText('便', width / 2, height * 0.70);
        ctx.fillText('利', width / 2, height * 0.78);
        ctx.fillText('店', width / 2, height * 0.86);

        ctx.font = '900 18px "Arial Black", sans-serif';
        ctx.fillText('24H', width / 2, height * 0.94);
      } else {
        // 我家便利商店門面大橫招
        const h3 = height / 3;
        ctx.fillStyle = '#0086c9';
        ctx.fillRect(0, 0, width, h3);
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, h3, width, h3);
        ctx.fillStyle = '#00963b';
        ctx.fillRect(0, h3 * 2, width, h3);

        ctx.fillStyle = '#003366';
        ctx.font = '900 36px "Arial Black", sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('OurMart', 30, height / 2);

        ctx.fillStyle = '#ffffff';
        ctx.font = '900 24px "Microsoft JhengHei", sans-serif';
        ctx.fillText('我家便利商店', 30, h3 * 2 + h3 / 2);

        ctx.font = 'bold 18px "Microsoft JhengHei", sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText("Our Café 鮮食甜點・現擠霜淇淋", width - 30, height / 2);
      }
    } else if (brandKey === '50lan') {
      // ６０嵐：亮黃底 + 海軍藍圓圈與粗字
      ctx.fillStyle = '#f5c400';
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
        ctx.fillText('６０', width / 2, 70);
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
        ctx.fillText('６０嵐', 90, height / 2);

        ctx.textAlign = 'left';
        ctx.font = '900 46px "Microsoft JhengHei", sans-serif';
        ctx.fillText('６０嵐 鮮茶專賣', 175, height / 2 - 14);

        ctx.font = 'bold 22px "Microsoft JhengHei", sans-serif';
        ctx.fillText('KOY Thé 連鎖茶飲｜四季春青茶・波霸奶茶・紅茶拿鐵', 175, height / 2 + 28);
      }
    } else if (brandKey === 'chingshin') {
      // 清心福泉：深墨綠 + 紅心 + 白楷書
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
        ctx.fillText('泉', width / 2, 345);

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
        ctx.fillText('清 心 福 泉', 135, height / 2 - 12);

        ctx.font = 'bold 22px "Microsoft JhengHei", sans-serif';
        ctx.fillText('冷飲站特約專賣店｜特級烏龍綠茶・珍珠奶茶・優多綠茶', 135, height / 2 + 30);
      }
    } else if (brandKey === 'lottery') {
      // 台彩樂透：金黃底 + 紅圓標 + 紅字
      ctx.fillStyle = '#e5a800';
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
        ctx.fillText('彩', width / 2, 215);
        ctx.fillText('樂', width / 2, 285);
        ctx.fillText('透', width / 2, 355);

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
      // 光明機車：白底 + 紅色 KYMKO 斜體 + 藍色光明機車
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = '#DC2626';
      ctx.fillRect(0, 0, width, 18);

      if (isVertical) {
        ctx.fillStyle = '#DC2626';
        ctx.font = '900 32px "Arial Black", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('KYMKO', width / 2, 55);

        ctx.fillStyle = '#0B3B60';
        ctx.font = '900 42px "Microsoft JhengHei", sans-serif';
        ctx.fillText('光', width / 2, 130);
        ctx.fillText('明', width / 2, 195);
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
        ctx.fillText('KYMKO', 40, height / 2);

        ctx.fillStyle = '#0B3B60';
        ctx.font = '900 46px "Microsoft JhengHei", sans-serif';
        ctx.fillText('光明機車特約店', 260, height / 2 - 12);

        ctx.fillStyle = '#475569';
        ctx.font = 'bold 20px "Microsoft JhengHei", sans-serif';
        ctx.fillText('專業噴射引擎保修・電腦排氣檢驗站・道路救援服務', 260, height / 2 + 28);
      }
    } else if (brandKey === 'watsons') {
      // 屈臣士：湖水藍（#00838F）+ 白字
      ctx.fillStyle = '#007a85';
      ctx.fillRect(0, 0, width, height);

      if (isVertical) {
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 28px "Arial", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('watso', width / 2, 45);

        ctx.font = '900 44px "Microsoft JhengHei", sans-serif';
        ctx.fillText('屈', width / 2, 125);
        ctx.fillText('臣', width / 2, 195);
        ctx.fillText('士', width / 2, 265);

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
        ctx.fillText('watso', 40, height / 2);

        ctx.font = '900 44px "Microsoft JhengHei", sans-serif';
        ctx.fillText('屈臣士 健保藥局', 250, height / 2 - 12);

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
      roughness: 0.42,
      metalness: 0.06,
      emissive: emissiveColor,
      emissiveIntensity: state.timeOfDay === 'night' ? 1.65 : state.timeOfDay === 'sunset' ? 0.75 : 0.04,
      side: THREE.DoubleSide
    });
    signMaterials.set(key, mat);
    window.taiwanEmissiveMaterials.push(mat);
    return mat;
  }

  // 4 Distinct Taiwanese AC Outdoor Unit Styles/Brands (日立/大金/雙風扇商業機/舊化禾聯)
  function createAcMat(style) {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = style === 2 ? 180 : 110;
    const ctx = canvas.getContext('2d');

    const bodyColors = ['#e7e5e0', '#d4d8dd', '#cbd2d9', '#dcd6c6'];
    ctx.fillStyle = bodyColors[style % 4];
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Top weather grime & panel seam
    const topGrime = ctx.createLinearGradient(0, 0, 0, 18);
    topGrime.addColorStop(0, 'rgba(30, 28, 26, 0.25)');
    topGrime.addColorStop(1, 'rgba(30, 28, 26, 0)');
    ctx.fillStyle = topGrime;
    ctx.fillRect(0, 0, canvas.width, 18);
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.22)';
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);

    // Brand badge on left panel
    const badges = [
      { bg: '#b91c1c', fg: '#ffffff', txt: 'HITAC' },
      { bg: '#0284c7', fg: '#ffffff', txt: 'DAIKN' },
      { bg: '#0f766e', fg: '#ffffff', txt: 'PANAS' },
      { bg: '#334155', fg: '#facc15', txt: 'HERON' }
    ][style % 4];
    ctx.fillStyle = badges.bg;
    ctx.fillRect(10, 14, 34, 12);
    ctx.fillStyle = badges.fg;
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(badges.txt, 27, 20);

    // Side heat-sink louvers
    ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
    for (let ly = 36; ly < canvas.height - 14; ly += 6) {
      ctx.fillRect(10, ly, 32, 3);
    }

    // Fan grille(s)
    const fanCenters = style === 2 ? [[104, 50], [104, 130]] : [[104, 55]];
    fanCenters.forEach(([fx, fy]) => {
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.arc(fx, fy, 36, 0, Math.PI * 2);
      ctx.fill();
      // Fan blades silhouette
      ctx.fillStyle = '#334155';
      for (let b = 0; b < 3; b++) {
        ctx.save();
        ctx.translate(fx, fy);
        ctx.rotate(b * (Math.PI * 2 / 3) + style);
        ctx.fillRect(-5, -30, 10, 28);
        ctx.restore();
      }
      // Protective wire mesh
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 2;
      for (let r = 9; r <= 32; r += 7) {
        ctx.beginPath();
        ctx.arc(fx, fy, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(fx - 34, fy); ctx.lineTo(fx + 34, fy);
      ctx.moveTo(fx, fy - 34); ctx.lineTo(fx, fy + 34);
      ctx.stroke();
    });

    const tex = new THREE.CanvasTexture(canvas);
    tex.encoding = THREE.sRGBEncoding;
    return new THREE.MeshStandardMaterial({ map: tex, bumpMap: tex, bumpScale: 0.03, roughness: 0.55 });
  }
  const acMats = [0, 1, 2, 3].map(createAcMat);

  // --------------------------------------------------------------------------
  // The Famous Taiwanese Shophouse Directory (中央大道台灣代表性店家清單)
  // --------------------------------------------------------------------------
  const taiwanShops = [
    // --- 1. Central Blvd South (起降廣場北側騎樓商圈: z = -38 to -76) ---
    { side: -1, z: -38, h: 8.8, wall: '#b6bec1', brand: 'beef_noodles', emissive: '#7F1D1D', name: '台灣正宗牛肉麵', roofType: 'tin_green' },
    { side: 1, z: -38, h: 8.0, wall: '#c2b8ad', brand: 'pork_rib', emissive: '#EA580C', name: '正忠排骨便當', roofType: 'parapet' },
    { side: -1, z: -50, h: 7.8, wall: '#c9bca9', brand: 'chingshin', emissive: '#0D5B36', name: '清心福全 冷飲站', roofType: 'parapet' },
    { side: 1, z: -50, h: 8.2, wall: '#bfb5a8', brand: 'lottery', emissive: '#FFB800', name: '台灣彩券', roofType: 'tin_blue' },
    { side: -1, z: -62, h: 8.5, wall: '#b8aca5', brand: 'familymart', emissive: '#0090D7', name: '我家便利商店', roofType: 'parapet' },
    { side: 1, z: -62, h: 7.8, wall: '#b2c0ba', brand: 'kymco', emissive: '#DC2626', name: '光明機車 KYMKO', roofType: 'parapet' },
    { side: -1, z: -74, h: 8.2, wall: '#cfc4b6', brand: '7eleven', emissive: '#008136', name: '8-TWELVE 統二超商', roofType: 'parapet' },
    { side: 1, z: -74, h: 8.0, wall: '#cbbdae', brand: '50lan', emissive: '#FFD100', name: '60嵐 鮮茶專賣', roofType: 'parapet' },

    // --- 2. East Commercial Avenue (東側商業大道: z = -124.5 & -95.5, x = 36 to 108) ---
    { x: 36, z: -124.5, rotY: 0, h: 8.8, wall: '#b6bec1', brand: 'pxmart', emissive: '#1D4ED8', name: '全民福利中心 商業店', roofType: 'parapet' },
    { x: 48, z: -124.5, rotY: 0, h: 8.2, wall: '#c2b8ad', brand: 'elife', emissive: '#DC2626', name: '全臺電子 足感心', roofType: 'parapet' },
    { x: 60, z: -124.5, rotY: 0, h: 7.8, wall: '#c9bca9', brand: 'sym', emissive: '#B91C1C', name: 'SYK 三洋機車', roofType: 'parapet' },
    { x: 72, z: -124.5, rotY: 0, h: 8.0, wall: '#bfb5a8', brand: 'dahu', emissive: '#EAB308', name: '大喊過癮 臭臭鍋', roofType: 'tin_blue' },
    { x: 84, z: -124.5, rotY: 0, h: 8.5, wall: '#b8aca5', brand: 'chishang', emissive: '#78350F', name: '池下木片便當', roofType: 'parapet' },
    { x: 96, z: -124.5, rotY: 0, h: 8.0, wall: '#b2c0ba', brand: 'kobayashi', emissive: '#1E3A8A', name: '大林眼鏡 商業店', roofType: 'parapet' },
    { x: 108, z: -124.5, rotY: 0, h: 8.2, wall: '#cfc4b6', brand: 'taian', emissive: '#16A34A', name: '台康藥局 商業店', roofType: 'parapet' },

    { x: 36, z: -95.5, rotY: Math.PI, h: 8.8, wall: '#bab5a8', brand: 'poya', emissive: '#F43F5E', name: '寶雅生活館', roofType: 'parapet' },
    { x: 48, z: -95.5, rotY: Math.PI, h: 8.2, wall: '#c8bfb0', brand: 'louisa', emissive: '#EA580C', name: '路易咖啡 商業店', roofType: 'parapet' },
    { x: 60, z: -95.5, rotY: Math.PI, h: 8.6, wall: '#b8c0ba', brand: 'bafang', emissive: '#F59E0B', name: '四方雲集 鍋貼水餃', roofType: 'parapet' },
    { x: 72, z: -95.5, rotY: Math.PI, h: 7.8, wall: '#b6bec1', brand: 'cosmed', emissive: '#EA580C', name: '康是好 藥妝館', roofType: 'tin_green' },
    { x: 84, z: -95.5, rotY: Math.PI, h: 8.2, wall: '#c2b8ad', brand: 'watsons', emissive: '#00838F', name: '屈臣士 Watso', roofType: 'parapet' },
    { x: 96, z: -95.5, rotY: Math.PI, h: 8.0, wall: '#c9bca9', brand: 'hilife', emissive: '#DC2626', name: '來爾富 Hi-Day', roofType: 'parapet' },
    { x: 108, z: -95.5, rotY: Math.PI, h: 8.2, wall: '#b8aca5', brand: 'shopee', emissive: '#EA580C', name: '蝦殼店到店', roofType: 'parapet' },

    // --- 3. North Civic Parkway (北側市政大道: z = -144 to -204) ---
    { side: -1, z: -144, h: 8.2, wall: '#b8aca5', brand: 'hongya', emissive: '#F97316', name: '弘叔漢堡 北門店', roofType: 'parapet' },
    { side: 1, z: -144, h: 8.0, wall: '#b2c0ba', brand: 'taian', emissive: '#16A34A', name: '台康藥局 北門店', roofType: 'parapet' },
    { side: -1, z: -158, h: 8.5, wall: '#cfc4b6', brand: 'chishang', emissive: '#78350F', name: '池下木片便當 北門店', roofType: 'tin_green' },
    { side: 1, z: -158, h: 7.8, wall: '#cbbdae', brand: 'dahu', emissive: '#EAB308', name: '大喊過癮 北門店', roofType: 'parapet' },
    { side: -1, z: -172, h: 8.0, wall: '#c5bcaf', brand: 'hardware', emissive: '#0284C7', name: '振華五金 北門店', roofType: 'parapet' },
    { side: 1, z: -172, h: 8.2, wall: '#b8c0ba', brand: 'showba', emissive: '#FACC15', name: '小南百貨 北門店', roofType: 'tin_blue' },
    { side: -1, z: -196, h: 8.5, wall: '#b8aca5', brand: '7eleven', emissive: '#008136', name: '8-TWELVE 北門門市', roofType: 'parapet' },
    { side: 1, z: -196, h: 8.0, wall: '#b2c0ba', brand: 'familymart', emissive: '#0090D7', name: '我家便利商店 北門店', roofType: 'tin_blue' }
  ];
  // --------------------------------------------------------------------------
  // Build Sidewalks & Curb Lines along Radial & Central Arterials
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

  for (const side of [-1, 1]) {
    addSidewalkStrip(side * 8.45, -56, 2.9, 52);
    addSidewalkStrip(side * 8.45, -172, 2.9, 68);
  }
  addSidewalkStrip(72, -118.5, 86, 2.9, true);
  addSidewalkStrip(72, -101.5, 86, 2.9, true);

  const shopIntCanvas = document.createElement('canvas');
  shopIntCanvas.width = 128;
  shopIntCanvas.height = 128;
  const sCtx = shopIntCanvas.getContext('2d');
  const sGrad = sCtx.createLinearGradient(0, 0, 0, 128);
  sGrad.addColorStop(0.0, '#fef3c7');
  sGrad.addColorStop(0.18, '#475569');
  sGrad.addColorStop(0.55, '#1e293b');
  sGrad.addColorStop(1.0, '#0f172a');
  sCtx.fillStyle = sGrad;
  sCtx.fillRect(0, 0, 128, 128);
  // Subtle interior shelf silhouettes & glass mullions
  sCtx.fillStyle = 'rgba(255, 251, 235, 0.24)';
  sCtx.fillRect(10, 6, 108, 7);
  sCtx.fillStyle = 'rgba(15, 23, 42, 0.55)';
  sCtx.fillRect(0, 0, 6, 128);
  sCtx.fillRect(122, 0, 6, 128);
  sCtx.fillRect(62, 0, 4, 128);
  const shopIntTex = new THREE.CanvasTexture(shopIntCanvas);
  shopIntTex.encoding = THREE.sRGBEncoding;
  const shopGlassMat = new THREE.MeshStandardMaterial({
    map: shopIntTex,
    roughness: 0.14,
    metalness: 0.45,
    emissiveMap: shopIntTex,
    emissive: new THREE.Color(0xfffbeb),
    emissiveIntensity: state.timeOfDay === 'night' ? 0.55 : 0.14
  });

  // --------------------------------------------------------------------------
  // Assemble Each Shophouse (4~6層台灣透天/華廈騎樓街屋：立體陽台窗框、可見側招、店面玻璃)
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

    const arcadeHeight = 3.5;
    const houseW = 11.2;
    const houseD = 8.0;
    const extraFloors = 2 + (sIdx % 3); // 4~6 stories total (14m ~ 21m)
    const houseH = shop.h + extraFloors * 3.2;

    const tileTex = createTileTexture(shop.wall);
    const wallMat = material(shop.wall, 0.85, 0.08, tileTex);

    // 1. Upper Building Mass (2F~6F 建築主體，從騎樓上方起算)
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

    // 5. Storefront Glass & Realistic Shop Interior
    addBox(storefront, darkMetalMat, 0, 1.6, 2.02, 10.4, 3.1, 0.08);
    for (const u of [-3.4, 0, 3.4]) {
      addBox(storefront, shopGlassMat, u, 1.55, 2.12, 3.1, 2.75, 0.06);
    }

    // 6. FRONT HORIZONTAL FASCIA SIGN (客製化店面大橫招牌)
    const hSignMat = createCustomShopSignMat(shop.brand, false, shop.emissive);
    addBox(storefront, hSignMat, 0, arcadeHeight + 0.85, 4.14, 8.8, 1.45, 0.14, true, true);
    addBox(storefront, darkMetalMat, 0, arcadeHeight + 1.62, 4.18, 9.1, 0.12, 0.35);

    // 7. OVERHANGING VERTICAL BLADE SIGN (修正黑盒遮擋：雙面看板寬度大於鐵架，完整顯色)
    const vSignMat = createCustomShopSignMat(shop.brand, true, shop.emissive);
    const vSignW = 1.05;
    const vSignH = 3.8;
    const vSignU = 4.75;
    const vSignY = arcadeHeight + 2.4;
    const vSignZ = 4.88;

    [-1.2, 1.2].forEach((armOff) => {
      addBox(storefront, steelMat, vSignU, vSignY + armOff, 4.25, 0.08, 0.08, 1.2);
    });
    addBox(storefront, darkMetalMat, vSignU, vSignY, vSignZ, 0.09, vSignH + 0.12, vSignW + 0.10, true, true);
    addBox(storefront, vSignMat, vSignU, vSignY, vSignZ, 0.13, vSignH, vSignW);

    // 8. UPPER FLOOR WINDOWS, CONCRETE LEDGES, IRON GRILLES & AC UNITS (2F~6F 完整立面)
    const upperFloorCount = Math.max(1, Math.floor((houseH - arcadeHeight - 0.6) / 3.2));
    for (let uf = 0; uf < upperFloorCount; uf++) {
      const fy = arcadeHeight + uf * 3.2;
      // Floor slab ledge (層間水泥線腳)
      if (uf > 0) {
        addBox(storefront, concreteMat, 0, fy + 0.1, 4.12, houseW + 0.1, 0.22, 0.30);
      }
      // Windows + Iron Grilles on upper floors (skip 2F behind fascia sign if uf === 0)
      if (uf >= 1) {
        for (const winU of [-3.3, 0.2, 3.1]) {
          addBox(storefront, steelMat, winU, fy + 1.65, 4.20, 2.0, 1.45, 0.30);
          addBox(storefront, glassMat, winU, fy + 1.65, 4.06, 1.8, 1.30, 0.05);
          addBox(storefront, concreteMat, winU, fy + 2.48, 4.24, 2.2, 0.14, 0.38);
        }
        // Multi-brand AC outdoor unit mounted logically between windows with L-brackets & pipe wrap
        const acStyle = (sIdx + uf) % acMats.length;
        const acH = acStyle === 2 ? 0.98 : 0.62;
        const acU = (uf % 2 === 0) ? -1.55 : 1.65;
        addBox(storefront, acMats[acStyle], acU, fy + 0.65 + acH / 2, 4.24, 0.92, acH, 0.36, true);
        addBox(storefront, steelMat, acU - 0.30, fy + 0.58, 4.20, 0.06, 0.12, 0.36);
        addBox(storefront, steelMat, acU + 0.30, fy + 0.58, 4.20, 0.06, 0.12, 0.36);
        addBox(storefront, darkMetalMat, acU + 0.48, fy + 0.92, 4.10, 0.07, 0.68, 0.07);
      } else {
        // 2F commercial AC mounted neatly beside left edge above fascia sign
        const acStyle = sIdx % acMats.length;
        addBox(storefront, acMats[acStyle], -4.2, fy + 2.35, 4.24, 0.92, 0.62, 0.36, true);
        addBox(storefront, steelMat, -4.2, fy + 1.98, 4.20, 0.72, 0.08, 0.32);
        addBox(storefront, darkMetalMat, -3.72, fy + 2.55, 4.10, 0.07, 0.55, 0.07);
      }
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

      registerBoxCollider(x, roofFloorY + tinH / 2, z, colW, tinH, colD, '頂樓鐵皮加蓋', '#48535e', false);
    }

    // (Boxy legacy storefront scooters removed; sculpted ExtrudeGeometry InstancedMesh scooters now populate roadside bays)

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

  // Avenue 0 Poles (South & North of Central Roundabout)
  for (const pz of [-36, -56, -76, -142, -166, -194]) {
    for (const px of [-7.6, 7.6]) {
      addSingleUtilityPole(px, pz, Math.abs(pz) === 56 || Math.abs(pz) === 166);
    }
  }

  // East-West Avenue (-110) Poles (Clear of Roundabout)
  for (const px of [-104, -76, -48, 36, 60, 84, 108]) {
    addSingleUtilityPole(px, -117.5, Math.abs(px) === 48 || px === 84);
    addSingleUtilityPole(px, -102.5, Math.abs(px) === 76 || px === 60);
  }

  // Outer Ring West & East Poles
  for (const pz of [-196, -156, -68, -4]) {
    addSingleUtilityPole(-114.5, pz, pz === -156);
    addSingleUtilityPole(114.5, pz, pz === -68);
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

  // --------------------------------------------------------------------------
  // INSTANCED TAIWANESE PARKED SCOOTERS & BAYS (機車停車格與成排機車群 - Single Draw Call)
  // --------------------------------------------------------------------------
  const scooterSpots = [];
  const bayLines = [];
  let scSeed = 515;
  const scRand = () => {
    scSeed = (Math.imul(1664525, scSeed) + 1013904223) >>> 0;
    return scSeed / 4294967296;
  };
  const scooterPalette = [
    0x1e293b, 0xcbd5e1, 0x881313, 0x334155,
    0x0f5e58, 0xd4d4d8, 0x27272a, 0x1e3a8a
  ].map(hex => new THREE.Color(hex).convertSRGBToLinear());

  // Parked scooter bays across Central/Outer Ring Avenues & E-W Arterials
  for (const ax of CITY.avenues) {
    for (const side of [-1, 1]) {
      for (let z = -34; z >= -212; z -= 1.45) {
        if (CITY.streets.some(s => Math.abs(z - s) < 16)) continue;
        if (ax === 0 && Math.abs(z + 110) < 28) continue;
        bayLines.push([ax + side * 8.1, z, 1.4, 0.08]);
        if (scRand() > 0.28) {
          scooterSpots.push({
            x: ax + side * 8.1 + (scRand() - 0.5) * 0.14,
            z: z + (scRand() - 0.5) * 0.12,
            rotY: (side > 0 ? Math.PI / 2 : -Math.PI / 2) + (scRand() - 0.5) * 0.18,
            color: scooterPalette[Math.floor(scRand() * scooterPalette.length)]
          });
        }
      }
    }
  }
  // Street -110 & -224 parked scooter bays
  for (const sz of [-110, -224]) {
    for (const side of [-1, 1]) {
      const zBay = sz + side * 8.0;
      for (let x = -108; x <= 108; x += 1.45) {
        if (CITY.avenues.some(a => Math.abs(x - a) < 16)) continue;
        if (sz === -110 && Math.abs(x) < 29) continue;
        bayLines.push([x, zBay, 0.08, 1.4]);
        if (scRand() > 0.30) {
          scooterSpots.push({
            x: x + (scRand() - 0.5) * 0.12,
            z: zBay + (scRand() - 0.5) * 0.14,
            rotY: (side < 0 ? 0 : Math.PI) + (scRand() - 0.5) * 0.18,
            color: scooterPalette[Math.floor(scRand() * scooterPalette.length)]
          });
        }
      }
    }
  }

  if (bayLines.length > 0) {
    const lineMat = new THREE.MeshStandardMaterial({ color: 0xc8c5bc, roughness: 0.92 });
    const bayMesh = new THREE.InstancedMesh(cubeGeo, lineMat, bayLines.length);
    const bt = new THREE.Object3D();
    bayLines.forEach(([bx, bz, bw, bd], i) => {
      bt.position.set(bx, 0.245, bz);
      bt.scale.set(bw, 0.015, bd);
      bt.updateMatrix();
      bayMesh.setMatrixAt(i, bt.matrix);
    });
    bayMesh.receiveShadow = true;
    bayMesh.frustumCulled = false;
    street.add(bayMesh);
  }

  if (scooterSpots.length > 0) {
    // Sculpted 125cc Taiwanese Scooter Body Profile (流線速克達車殼外型)
    const scShape = new THREE.Shape();
    scShape.moveTo(-0.74, 0.46);
    scShape.quadraticCurveTo(-0.78, 0.64, -0.54, 0.72);
    scShape.lineTo(-0.14, 0.68);
    scShape.quadraticCurveTo(-0.04, 0.42, 0.06, 0.36);
    scShape.lineTo(0.28, 0.36);
    scShape.quadraticCurveTo(0.36, 0.66, 0.38, 0.90);
    scShape.quadraticCurveTo(0.46, 0.99, 0.56, 0.90);
    scShape.quadraticCurveTo(0.68, 0.64, 0.64, 0.42);
    scShape.lineTo(0.48, 0.33);
    scShape.lineTo(0.24, 0.24);
    scShape.lineTo(-0.38, 0.26);
    scShape.quadraticCurveTo(-0.56, 0.42, -0.74, 0.46);
    const scBodyGeo = new THREE.ExtrudeGeometry(scShape, {
      depth: 0.28, bevelEnabled: true, bevelSize: 0.065, bevelThickness: 0.065, bevelSegments: 3
    });
    scBodyGeo.translate(0, 0, -0.14);
    scBodyGeo.rotateY(-Math.PI / 2);

    // Sculpted Ergonomic Saddle Profile
    const seatShape = new THREE.Shape();
    seatShape.moveTo(-0.56, 0.71);
    seatShape.quadraticCurveTo(-0.32, 0.80, -0.06, 0.72);
    seatShape.lineTo(-0.10, 0.65);
    seatShape.lineTo(-0.52, 0.65);
    seatShape.closePath();
    const scSeatGeo = new THREE.ExtrudeGeometry(seatShape, {
      depth: 0.24, bevelEnabled: true, bevelSize: 0.035, bevelThickness: 0.035, bevelSegments: 2
    });
    scSeatGeo.translate(0, 0, -0.12);
    scSeatGeo.rotateY(-Math.PI / 2);

    const scHandleGeo = new THREE.CylinderGeometry(0.024, 0.024, 0.66, 8);
    scHandleGeo.rotateZ(Math.PI / 2);
    const scMirrorGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.026, 10);
    scMirrorGeo.rotateX(Math.PI / 2);
    const scStemGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.16, 6);
    const scVisorGeo = new THREE.CylinderGeometry(0.14, 0.16, 0.16, 10, 1, false, -Math.PI * 0.45, Math.PI * 0.9);
    const scFenderGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.15, 12, 1, false, -Math.PI * 0.35, Math.PI * 0.7);
    scFenderGeo.rotateZ(Math.PI / 2);
    const scRimGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.125, 12);
    const scHeadlightGeo = new THREE.CylinderGeometry(0.085, 0.095, 0.05, 12);
    scHeadlightGeo.rotateX(Math.PI / 2);
    scHeadlightGeo.scale(1.25, 0.85, 1);
    const scExhaustGeo = new THREE.CylinderGeometry(0.045, 0.055, 0.44, 10);
    scExhaustGeo.rotateX(Math.PI / 2);
    const scTailGeo = new THREE.BoxGeometry(0.16, 0.075, 0.04);
    const scPlateGeo = new THREE.BoxGeometry(0.22, 0.12, 0.018);

    const scBodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.28, metalness: 0.38 });
    const scSeatMat = new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.85 });
    const scHeadlightMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.12, metalness: 0.2 });
    const scVisorMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.15, metalness: 0.6 });
    const scTailMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.25, emissive: 0x7f1d1d, emissiveIntensity: 0.25 });
    const scPlateMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.55 });

    const scBodyMesh = new THREE.InstancedMesh(scBodyGeo, scBodyMat, scooterSpots.length);
    const scSeatMesh = new THREE.InstancedMesh(scSeatGeo, scSeatMat, scooterSpots.length);
    const scHandleMesh = new THREE.InstancedMesh(scHandleGeo, darkMetalMat, scooterSpots.length);
    const scMirrorMesh = new THREE.InstancedMesh(scMirrorGeo, darkMetalMat, scooterSpots.length * 2);
    const scStemMesh = new THREE.InstancedMesh(scStemGeo, darkMetalMat, scooterSpots.length * 2);
    const scVisorMesh = new THREE.InstancedMesh(scVisorGeo, scVisorMat, scooterSpots.length);
    const scFenderMesh = new THREE.InstancedMesh(scFenderGeo, scBodyMat, scooterSpots.length);
    const scHeadMesh = new THREE.InstancedMesh(scHeadlightGeo, scHeadlightMat, scooterSpots.length);
    const scExhaustMesh = new THREE.InstancedMesh(scExhaustGeo, steelMat, scooterSpots.length);
    const scTailMesh = new THREE.InstancedMesh(scTailGeo, scTailMat, scooterSpots.length);
    const scPlateMesh = new THREE.InstancedMesh(scPlateGeo, scPlateMat, scooterSpots.length);
    const scWheelMesh = new THREE.InstancedMesh(scooterWheelGeo, scooterRubber, scooterSpots.length * 2);
    const scRimMesh = new THREE.InstancedMesh(scRimGeo, steelMat, scooterSpots.length * 2);

    const st = new THREE.Object3D();
    const sMat = new THREE.Matrix4();
    const rotW = new THREE.Matrix4().makeRotationZ(Math.PI / 2);

    const placeScooterPart = (mesh, idx, lx, ly, lz, rx, ry, rz, spot, extraRot = null) => {
      const c = Math.cos(spot.rotY), s = Math.sin(spot.rotY);
      st.position.set(spot.x + lx * c + lz * s, 0.24 + ly, spot.z - lx * s + lz * c);
      st.rotation.set(rx, spot.rotY + ry, rz);
      st.scale.set(1, 1, 1);
      st.updateMatrix();
      if (extraRot) {
        sMat.copy(st.matrix).multiply(extraRot);
        mesh.setMatrixAt(idx, sMat);
      } else {
        mesh.setMatrixAt(idx, st.matrix);
      }
    };

    scooterSpots.forEach((spot, i) => {
      // Slight natural kickstand lean (roll ~ 0.07 rad)
      const lean = (i % 2 === 0 ? 1 : -1) * 0.07;
      placeScooterPart(scBodyMesh, i, 0, 0, 0, 0, 0, lean, spot);
      scBodyMesh.setColorAt(i, spot.color);
      placeScooterPart(scFenderMesh, i, 0, 0.28, 0.49, 0.25, 0, lean, spot);
      scFenderMesh.setColorAt(i, spot.color);
      placeScooterPart(scSeatMesh, i, 0, 0, 0, 0, 0, lean, spot);
      placeScooterPart(scHandleMesh, i, 0, 0.98, 0.44, 0, 0, lean, spot);
      placeScooterPart(scVisorMesh, i, 0, 1.03, 0.50, -0.35, 0, lean, spot);
      placeScooterPart(scHeadMesh, i, 0, 0.78, 0.59, -0.18, 0, lean, spot);
      placeScooterPart(scStemMesh, i * 2, -0.24, 1.06, 0.44, 0, 0, lean + 0.18, spot);
      placeScooterPart(scStemMesh, i * 2 + 1, 0.24, 1.06, 0.44, 0, 0, lean - 0.18, spot);
      placeScooterPart(scMirrorMesh, i * 2, -0.28, 1.14, 0.44, 0, 0.18, lean, spot);
      placeScooterPart(scMirrorMesh, i * 2 + 1, 0.28, 1.14, 0.44, 0, -0.18, lean, spot);
      placeScooterPart(scExhaustMesh, i, 0.21, 0.26, -0.44, -0.16, 0, lean, spot);
      placeScooterPart(scTailMesh, i, 0, 0.62, -0.73, 0.12, 0, lean, spot);
      placeScooterPart(scPlateMesh, i, 0, 0.46, -0.76, 0.18, 0, lean, spot);
      placeScooterPart(scWheelMesh, i * 2, 0, 0.24, 0.48, 0, 0, lean, spot, rotW);
      placeScooterPart(scWheelMesh, i * 2 + 1, 0, 0.24, -0.48, 0, 0, lean, spot, rotW);
      placeScooterPart(scRimMesh, i * 2, 0, 0.24, 0.48, 0, 0, lean, spot, rotW);
      placeScooterPart(scRimMesh, i * 2 + 1, 0, 0.24, -0.48, 0, 0, lean, spot, rotW);
    });
    if (scBodyMesh.instanceColor) scBodyMesh.instanceColor.needsUpdate = true;
    if (scFenderMesh.instanceColor) scFenderMesh.instanceColor.needsUpdate = true;
    [
      scBodyMesh, scFenderMesh, scSeatMesh, scHandleMesh, scVisorMesh,
      scStemMesh, scMirrorMesh, scHeadMesh, scExhaustMesh, scTailMesh,
      scPlateMesh, scWheelMesh, scRimMesh
    ].forEach((m) => {
      m.frustumCulled = false;
      m.castShadow = true;
      m.receiveShadow = true;
      street.add(m);
    });
  }

  // --------------------------------------------------------------------------
  // INSTANCED TAIWANESE STREETLIGHTS (鋁合金彎臂路燈 - Single Draw Call)
  // --------------------------------------------------------------------------
  const lampPosts = [];
  for (const ax of CITY.avenues) {
    for (const lz of [-18, -56, -92, -148, -206]) {
      lampPosts.push({ x: ax - 7.5, z: lz, dirX: 1, dirZ: 0 });
      lampPosts.push({ x: ax + 7.5, z: lz, dirX: -1, dirZ: 0 });
    }
  }
  for (const sz of [-184, -120, -28]) {
    for (const lx of [-104, -44, -24, 24, 52, 94]) {
      lampPosts.push({ x: lx, z: sz - 7.6, dirX: 0, dirZ: 1 });
      lampPosts.push({ x: lx, z: sz + 7.6, dirX: 0, dirZ: -1 });
    }
  }
  if (lampPosts.length > 0) {
    const postGeo = new THREE.CylinderGeometry(0.08, 0.12, 6.8, 8);
    const lampHeadMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      emissive: 0xffd28a,
      emissiveIntensity: state.timeOfDay === 'night' ? 2.2 : (state.timeOfDay === 'sunset' ? 1.1 : 0.08),
      roughness: 0.3
    });
    window.taiwanEmissiveMaterials.push(lampHeadMat);

    const postMesh = new THREE.InstancedMesh(postGeo, steelMat, lampPosts.length);
    const armMesh = new THREE.InstancedMesh(cubeGeo, steelMat, lampPosts.length);
    const headMesh = new THREE.InstancedMesh(cubeGeo, lampHeadMat, lampPosts.length);
    const lt = new THREE.Object3D();

    lampPosts.forEach((lp, i) => {
      lt.position.set(lp.x, 3.6, lp.z);
      lt.rotation.set(0, 0, 0);
      lt.scale.set(1, 1, 1);
      lt.updateMatrix();
      postMesh.setMatrixAt(i, lt.matrix);

      const angle = Math.atan2(lp.dirX, lp.dirZ);
      lt.position.set(lp.x + lp.dirX * 0.9, 6.95, lp.z + lp.dirZ * 0.9);
      lt.rotation.set(0, angle, 0);
      lt.scale.set(0.10, 0.10, 1.9);
      lt.updateMatrix();
      armMesh.setMatrixAt(i, lt.matrix);

      lt.position.set(lp.x + lp.dirX * 1.75, 6.88, lp.z + lp.dirZ * 1.75);
      lt.scale.set(0.32, 0.12, 0.58);
      lt.updateMatrix();
      headMesh.setMatrixAt(i, lt.matrix);
    });
    [postMesh, armMesh, headMesh].forEach((m) => {
      m.frustumCulled = false;
      street.add(m);
    });
  }

  // --------------------------------------------------------------------------
  // LONGITUDINAL OVERHEAD UTILITY WIRES (沿街高架電纜 - 避開飛行橫向航道)
  // --------------------------------------------------------------------------
  const wireSegments = [];
  const addWireRun = (pts) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, z1] = pts[i], [x2, z2] = pts[i + 1];
      for (const hOff of [7.85, 8.2]) {
        wireSegments.push([x1, hOff, z1, x2, hOff, z2]);
      }
      const wSpan = Math.max(0.12, Math.abs(x2 - x1));
      const dSpan = Math.max(0.12, Math.abs(z2 - z1));
      buildingColliders.push({
        minX: (x1 + x2) * 0.5 - wSpan * 0.5,
        maxX: (x1 + x2) * 0.5 + wSpan * 0.5,
        minY: 7.80,
        maxY: 8.25,
        minZ: (z1 + z2) * 0.5 - dSpan * 0.5,
        maxZ: (z1 + z2) * 0.5 + dSpan * 0.5,
        label: '高架電纜',
        isWire: true
      });
    }
  };
  const ave0Z = [16, -8, -24, -48, -72];
  addWireRun(ave0Z.map(z => [-7.6, z]));
  addWireRun(ave0Z.map(z => [7.6, z]));
  const ave0NZ = [-104, -136, -164, -192, -220];
  addWireRun(ave0NZ.map(z => [-7.6, z]));
  addWireRun(ave0NZ.map(z => [7.6, z]));
  const st120X = [-36, -12, 16, 40, 64, 88, 108];
  addWireRun(st120X.map(x => [x, -127.5]));
  addWireRun(st120X.map(x => [x, -112.5]));
  const ave72Z = [-132, -156, -180];
  addWireRun(ave72Z.map(z => [64.4, z]));
  addWireRun(ave72Z.map(z => [79.6, z]));
  const st184X = [60, 36, 12, -12, -30];
  addWireRun(st184X.map(x => [x, -191.5]));

  if (wireSegments.length > 0) {
    const wireMat = new THREE.MeshBasicMaterial({ color: 0x1e2024 });
    const wireMesh = new THREE.InstancedMesh(cubeGeo, wireMat, wireSegments.length);
    const wt = new THREE.Object3D();
    wireSegments.forEach(([x1, y1, z1, x2, y2, z2], i) => {
      const dx = x2 - x1, dz = z2 - z1;
      wt.position.set((x1 + x2) / 2, y1, (z1 + z2) / 2);
      wt.rotation.set(0, Math.atan2(dx, dz), 0);
      wt.scale.set(0.035, 0.035, Math.hypot(dx, dz));
      wt.updateMatrix();
      wireMesh.setMatrixAt(i, wt.matrix);
    });
    wireMesh.frustumCulled = false;
    street.add(wireMesh);
  }

  cityGroup.add(street);
}

let skyDomeMesh = null;
let toweringCumulusGroup = null;
let wildernessLandMat = null;
let wildernessRoadMat = null;
const wildernessJunctionMats = [];
const wildernessVegetationState = { trees: [], shrubs: [] };

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
    sunScale: 1.0,
    hemiScale: 1.0,
    shadowRadius: 1.0,
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
    sunScale: 0.16,
    hemiScale: 1.48,
    shadowRadius: 3.8,
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
    sunScale: 0.08,
    hemiScale: 1.28,
    shadowRadius: 4.8,
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
    sunScale: 0.002,
    hemiScale: 0.95,
    shadowRadius: 5.5,
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
    sunScale: 0.0001,
    hemiScale: 1.35,
    shadowRadius: 6.0,
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
    sunScale: 0.001,
    hemiScale: 0.72,
    shadowRadius: 6.0,
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

  const sunScale = (w && typeof w.sunScale === 'number') ? w.sunScale : weatherLightScale;
  const hemiScale = (w && typeof w.hemiScale === 'number') ? w.hemiScale : 1.0;
  const shadowRadius = (w && typeof w.shadowRadius === 'number') ? w.shadowRadius : 1.0;

  dirLight.color.setHex(p.sunColor);
  dirLight.intensity = p.sunIntensity * sunScale;
  if (dirLight.shadow) {
    dirLight.shadow.radius = shadowRadius;
  }
  currentSunOffset.set(...p.sunPos);
  updateShadowFrustum();

  hemiLight.color.setHex(effHemiSky);
  hemiLight.groundColor.setHex(p.hemiGround);
  hemiLight.intensity = p.hemiIntensity * hemiScale;

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
  for (const jm of wildernessJunctionMats) {
    jm.roughness = THREE.MathUtils.lerp(0.94, 0.38, wetSeverity);
    jm.metalness = THREE.MathUtils.lerp(0.03, 0.18, wetSeverity);
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
    const iblSunStrength = mode === 'night' ? 0.08 : (wa.mieMult * sunScale);
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
    descGamepad: '將 <kbd>左搖桿</kbd> 向上推至 10 公尺，鬆開或按 <kbd>L2</kbd> 保持懸停 2 秒',
    keysDual: ['key-top-l2'],
    keysSingle: ['key-top-l2'],
    targetText: '起降坪正上方 10m 定高懸停目標區',
    successMsg: 'EXCELLENT! 垂直起飛與定高懸停掌握成功！'
  },
  {
    step: 2,
    title: '任務二：校園低空巡檢（俯仰前進）',
    shortName: '校園低空巡檢',
    descDual: '按住右手方向鍵 <kbd>↑</kbd> 向前巡航，飛抵【市立國小操場】上方光標區',
    descSingle: '按住 <kbd>W</kbd> 向前推進飛行，飛抵【市立國小操場】上方光標區',
    descGamepad: '將 <kbd>右搖桿</kbd> 向上推，飛抵【市立國小操場】上方光標區',
    keysDual: ['key-top-r1'],
    keysSingle: ['key-top-l2'],
    targetText: '飛抵市立國小操場上空完成低空巡檢',
    successMsg: 'GREAT! 校園低空巡檢與前進巡航完成！'
  },
  {
    step: 3,
    title: '任務三：圓環地標航拍（偏航轉向）',
    shortName: '圓環地標航拍',
    descDual: '使用左手 <kbd>A</kbd> 或 <kbd>D</kbd> 轉動機頭，對準並飛抵【市中心圓環紀念碑】',
    descSingle: '使用 <kbd>Q</kbd> 或 <kbd>E</kbd> 轉動機頭，對準並飛抵【市中心圓環紀念碑】',
    descGamepad: '將 <kbd>左搖桿</kbd> 向左或向右推轉動機頭，飛抵【市中心圓環紀念碑】',
    keysDual: ['key-bot-l1', 'key-bot-l3', 'key-top-l1', 'key-top-l3'],
    keysSingle: ['key-top-l1', 'key-top-l3'],
    targetText: '偏航轉動機頭，對準並飛抵市中心圓環紀念碑上空',
    successMsg: 'PERFECT! 圓環地標航拍構圖與偏航對準精準！'
  },
  {
    step: 4,
    title: '任務四：商辦外牆巡檢（橫滾側飛）',
    shortName: '商辦外牆巡檢',
    descDual: '按方向鍵 <kbd>←</kbd> 或 <kbd>→</kbd> 側身平移，沿【金融商辦外牆】飛抵巡檢目標點',
    descSingle: '按 <kbd>A</kbd> 或 <kbd>D</kbd> 側移，沿【金融商辦外牆】飛抵巡檢目標點',
    descGamepad: '將 <kbd>右搖桿</kbd> 向左或向右推，沿【金融商辦外牆】側飛至巡檢點',
    keysDual: ['key-bot-r1', 'key-bot-r3'],
    keysSingle: ['key-bot-l1', 'key-bot-l3'],
    targetText: '橫滾側移平飛，完成金融商辦玻璃帷幕外牆巡檢',
    successMsg: 'SMOOTH! 高樓外牆橫滾側飛巡檢完成！'
  },
  {
    step: 5,
    title: '任務五：頂樓物資空投（衝刺急煞）',
    shortName: '頂樓物資空投',
    descDual: '按住 <kbd>Shift</kbd> 衝刺加速，接近【商業大樓頂樓空投點】時按 <kbd>Space</kbd> 急煞懸停',
    descSingle: '按住 <kbd>F</kbd> 推進加速，接近【商業大樓頂樓空投點】時按 <kbd>Space</kbd> 急煞懸停',
    descGamepad: '按住 <kbd>R2</kbd> 加速，接近【商業大樓頂樓空投點】時按 <kbd>L2</kbd> 煞車',
    keysDual: ['key-top-r1'],
    keysSingle: ['key-top-l2'],
    targetText: '高速飛抵商業大樓頂樓空投點並急煞懸停',
    successMsg: 'AWESOME! 緊急物資頂樓空投點精準抵達！'
  },
  {
    step: 6,
    title: '任務六：綜合返航與精準降落',
    shortName: '返航精準降落',
    descDual: '綜合運用操控飛回中央 [H] 起降坪！高度低於 2 米後按 <kbd>S</kbd> 緩降接地',
    descSingle: '綜合運用操控飛回中央 [H] 起降坪！按 <kbd>Ctrl</kbd> 或 <kbd>J</kbd> 緩降接地',
    descGamepad: '飛回中央 [H] 起降坪，將 <kbd>左搖桿</kbd> 輕輕向下推以接地',
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
  COURSE_GATES.forEach((g) => {
    const group = new THREE.Group();
    group.position.set(g.pos.x, g.pos.y, g.pos.z);
    group.rotation.y = g.rotY;

    // Option A: Realistic AR Inspection Target Beacon (無浮空大圓環，改用地面/空中 AR 光標導引)
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide
    });
    const ringGeo = new THREE.RingGeometry(3.8, 4.5, 36);
    ringGeo.rotateX(-Math.PI / 2);
    const innerRing = new THREE.Mesh(ringGeo, innerMat);
    innerRing.position.y = -g.pos.y + 0.35; // Ground/plaza projection ring
    group.add(innerRing);

    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.16,
      depthWrite: false
    });
    const beamMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 1.4, Math.max(8, g.pos.y), 16, 1, true), beamMat);
    beamMesh.position.y = -g.pos.y / 2;
    group.add(beamMesh);

    const diamondMesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.95, 0),
      innerMat
    );
    group.add(diamondMesh);

    const labelSprite = createGateNumberSprite(g.id, g.name);
    labelSprite.position.set(0, 2.8, 0);
    group.add(labelSprite);

    cityGroup.add(group);
    gateObjects.push({ data: g, group, innerRing, innerMat, beamMat });
  });
}

function updateGateVisualStates() {
  const isTraining = state.gameMode === 'training';
  const isFreeFlight = state.gameMode === 'free_flight';

  if (trainingHoverRingGroup) {
    trainingHoverRingGroup.visible = isTraining && state.raceActive && state.trainingStep === 1;
  }

  gateObjects.forEach((obj, idx) => {
    if (isFreeFlight) {
      obj.group.visible = false;
      return;
    }

    if (isTraining) {
      const targetIdx = state.trainingStep - 2;
      obj.group.visible = state.raceActive && state.trainingStep >= 2 && state.trainingStep <= 5 && idx === targetIdx;
      obj.innerMat.color.setHex(0x10b981);
      if (obj.beamMat) obj.beamMat.color.setHex(0x10b981);
      return;
    }

    // Time trial / race mode
    obj.group.visible = idx >= state.currentGateIndex;
    const isNext = idx === state.currentGateIndex;
    obj.innerMat.color.setHex(isNext ? 0x10b981 : 0x0284c7);
    if (obj.beamMat) obj.beamMat.color.setHex(isNext ? 0x10b981 : 0x0284c7);
    obj.group.scale.setScalar(isNext ? 1.05 : 0.9);
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

function drawPristineTankCamouflage(camouflage, paint, colorHex) {
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
}

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
  drawPristineTankCamouflage(camouflage, paint, colorHex);
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

  // 7. Roof-Mounted 12.7mm RWS / Commander Anti-Air Heavy Machine Gun
  const hmgPedestal = detail(turretGroup, new THREE.CylinderGeometry(0.16, 0.21, 0.14, 12), armorMat, 0.46, 0.49, 0.26);
  hmgPedestal.userData.visualOnly = true;
  const hmgYawGroup = new THREE.Group();
  hmgYawGroup.position.set(0.46, 0.57, 0.26);
  turretGroup.add(hmgYawGroup);

  const hmgGunMat = new THREE.MeshStandardMaterial({ color: 0x26292d, roughness: 0.42, metalness: 0.72 });
  const hmgBrassMat = new THREE.MeshStandardMaterial({ color: 0xc89d3c, roughness: 0.35, metalness: 0.85 });
  const hmgOpticMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.2, metalness: 0.6 });
  const hmgLensMat = new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x0891b2, emissiveIntensity: 0.4, roughness: 0.15 });
  // Traverse yoke & armored ammo canister
  vehiclePart(hmgYawGroup, new THREE.BoxGeometry(0.24, 0.08, 0.22), hmgGunMat, 0, 0.04, 0);
  vehiclePart(hmgYawGroup, new THREE.BoxGeometry(0.06, 0.20, 0.16), armorMat, -0.14, 0.14, 0.02);
  vehiclePart(hmgYawGroup, new THREE.BoxGeometry(0.06, 0.20, 0.16), armorMat, 0.14, 0.14, 0.02);
  vehiclePart(hmgYawGroup, new THREE.BoxGeometry(0.16, 0.18, 0.22), armorMat, -0.22, 0.14, 0.03); // 12.7mm ammo box
  vehiclePart(hmgYawGroup, new THREE.BoxGeometry(0.09, 0.03, 0.10), hmgBrassMat, -0.12, 0.17, 0.02); // brass belt feed
  // EO / Thermal RWS sight pod
  vehiclePart(hmgYawGroup, new THREE.BoxGeometry(0.15, 0.14, 0.20), hmgOpticMat, 0.20, 0.22, -0.02);
  vehiclePart(hmgYawGroup, new THREE.CylinderGeometry(0.04, 0.04, 0.03, 12).rotateX(Math.PI / 2), hmgLensMat, 0.20, 0.23, -0.125);

  const hmgPitchGroup = new THREE.Group();
  hmgPitchGroup.position.set(0, 0.20, 0.02);
  hmgYawGroup.add(hmgPitchGroup);
  // Receiver, fluted heavy barrel, perforated shroud & muzzle brake
  vehiclePart(hmgPitchGroup, new THREE.BoxGeometry(0.12, 0.13, 0.48), hmgGunMat, 0, 0, 0.02);
  vehiclePart(hmgPitchGroup, new THREE.CylinderGeometry(0.036, 0.042, 0.28, 10).rotateX(Math.PI / 2), hmgGunMat, 0, 0.01, -0.34);
  vehiclePart(hmgPitchGroup, new THREE.CylinderGeometry(0.022, 0.026, 0.72, 10).rotateX(Math.PI / 2), hmgGunMat, 0, 0.01, -0.76);
  vehiclePart(hmgPitchGroup, new THREE.BoxGeometry(0.065, 0.055, 0.09), hmgGunMat, 0, 0.01, -1.14);

  // Muzzle flash star for 12.7mm HMG
  const hmgMuzzleFlash = new THREE.Group();
  hmgMuzzleFlash.position.set(0, 0.01, -1.24);
  hmgMuzzleFlash.visible = false;
  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffd166,
    transparent: true,
    opacity: 0.92,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const flashCone = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.34, 6).rotateX(-Math.PI / 2), flashMat);
  const flashCross = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.26), flashMat.clone());
  flashCross.material.side = THREE.DoubleSide;
  hmgMuzzleFlash.add(flashCone, flashCross);
  hmgPitchGroup.add(hmgMuzzleFlash);

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
    colorHex,
    camouflageCanvas: camouflage,
    camouflageCtx: paint,
    camouflageTexture,
    rollWheels,
    hmgYawGroup,
    hmgPitchGroup,
    hmgMuzzleFlash
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

function createRifleSentryMesh(variant = 'radar') {
  const root = new THREE.Group();
  const dirtMat = new THREE.MeshStandardMaterial({ color: 0x4f4739, roughness: 0.98, metalness: 0.01 });
  const concreteMat = new THREE.MeshStandardMaterial({ color: 0x6f736e, roughness: 0.93, metalness: 0.05 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x5c4530, roughness: 0.92, metalness: 0.03 });
  const sandbagMats = [
    new THREE.MeshStandardMaterial({ color: 0x948565, roughness: 0.96, metalness: 0.02 }),
    new THREE.MeshStandardMaterial({ color: 0x7c7154, roughness: 0.96, metalness: 0.02 }),
    new THREE.MeshStandardMaterial({ color: 0x6b5f46, roughness: 0.96, metalness: 0.02 })
  ];
  const camoNetMat = new THREE.MeshStandardMaterial({
    color: variant === 'radar' ? 0x3b4a30 : 0x464e36,
    roughness: 0.94,
    metalness: 0.04,
    side: THREE.DoubleSide
  });
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x485437, roughness: 0.86, metalness: 0.1 });
  const woodCrateMat = new THREE.MeshStandardMaterial({ color: 0x695035, roughness: 0.9, metalness: 0.04 });
  const drumMat = new THREE.MeshStandardMaterial({ color: 0x33422e, roughness: 0.58, metalness: 0.38 });
  const steelWireMat = new THREE.MeshStandardMaterial({ color: 0x5c6369, roughness: 0.42, metalness: 0.82 });
  const corrugatedMat = new THREE.MeshStandardMaterial({ color: 0x565c59, roughness: 0.65, metalness: 0.45 });
  const brassAccentMat = new THREE.MeshStandardMaterial({ color: 0xb58d34, roughness: 0.38, metalness: 0.82 });
  const uniformMat = new THREE.MeshStandardMaterial({ color: variant === 'radar' ? 0x3b4834 : 0x45493a, roughness: 0.88, metalness: 0.05 });
  const vestMat = new THREE.MeshStandardMaterial({ color: 0x2a2e28, roughness: 0.85, metalness: 0.1 });
  const helmetMat = new THREE.MeshStandardMaterial({ color: 0x31382d, roughness: 0.65, metalness: 0.18 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0x9c7a62, roughness: 0.85, metalness: 0.02 });
  const gunmetalMat = new THREE.MeshStandardMaterial({ color: 0x1e2226, roughness: 0.4, metalness: 0.72 });

  // 1. Sunken Earth Berm, Duckboard Slats & Timber Interior Revetment
  const berm = new THREE.Mesh(new THREE.CylinderGeometry(3.45, 3.95, 2.25, 16), dirtMat);
  berm.position.y = -1.04;
  berm.receiveShadow = true;
  root.add(berm);

  const floorBase = new THREE.Mesh(new THREE.CylinderGeometry(1.95, 2.05, 0.08, 14), dirtMat);
  floorBase.position.y = 0.02;
  floorBase.receiveShadow = true;
  root.add(floorBase);

  // Duckboard wooden slats inside fighting pit
  for (let s = -4; s <= 4; s++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(2.65, 0.04, 0.22), woodMat);
    slat.position.set(0, 0.07, s * 0.30);
    slat.receiveShadow = true;
    root.add(slat);
  }

  // Vertical timber revetment stakes lining the inside of the sandbag wall
  const stakeGeo = new THREE.CylinderGeometry(0.05, 0.06, 0.88, 6);
  for (let i = 0; i < 14; i++) {
    if (i === 3 || i === 4) continue;
    const ang = (i / 14) * Math.PI * 2;
    const stake = new THREE.Mesh(stakeGeo, woodMat);
    stake.position.set(Math.cos(ang) * 1.98, 0.44, Math.sin(ang) * 1.98);
    stake.castShadow = true;
    root.add(stake);
  }

  // 2. Pillowy Organic Multi-Tier Sandbag Bunker Parapet (3 tiers + rear entry)
  const bagGeo = new THREE.SphereGeometry(0.42, 10, 6);
  bagGeo.scale(1.0, 0.33, 0.56);
  for (let tier = 0; tier < 3; tier++) {
    const count = 15;
    const radius = 2.30 - tier * 0.09;
    const y = 0.14 + tier * 0.22;
    for (let i = 0; i < count; i++) {
      if (i === 3 || (tier >= 1 && i === 4)) continue;
      const ang = (i / count) * Math.PI * 2 + tier * (Math.PI / count);
      const bag = new THREE.Mesh(bagGeo, sandbagMats[(i + tier) % sandbagMats.length]);
      bag.position.set(Math.cos(ang) * radius, y, Math.sin(ang) * radius);
      bag.rotation.y = -ang + Math.PI / 2 + (((i * 7 + tier * 3) % 5) - 2) * 0.04;
      bag.rotation.z = (((i + tier) % 3) - 1) * 0.03;
      bag.castShadow = true;
      bag.receiveShadow = true;
      root.add(bag);
    }
  }

  // 3. Timber Overhead Shelter, Corrugated Steel Roof, Braces & Draped Camo Netting
  const postGeo = new THREE.CylinderGeometry(0.075, 0.085, 1.92, 7);
  const postCoords = [
    [-1.48, -1.25], [1.48, -1.25],
    [-1.65, 0.35], [1.65, 0.35]
  ];
  for (const [px, pz] of postCoords) {
    const post = new THREE.Mesh(postGeo, woodMat);
    post.position.set(px, 0.94, pz);
    post.castShadow = true;
    root.add(post);
  }
  // Crossbeams
  for (const bz of [-1.25, 0.35]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(3.45, 0.11, 0.12), woodMat);
    beam.position.set(0, 1.84, bz);
    beam.castShadow = true;
    root.add(beam);
  }
  const roofPlank = new THREE.Mesh(new THREE.BoxGeometry(3.40, 0.08, 1.88), woodMat);
  roofPlank.position.set(0, 1.91, -0.45);
  roofPlank.rotation.x = 0.06;
  roofPlank.castShadow = true;
  roofPlank.receiveShadow = true;
  root.add(roofPlank);

  const roofSteel = new THREE.Mesh(new THREE.BoxGeometry(3.48, 0.04, 1.94), corrugatedMat);
  roofSteel.position.set(0, 1.96, -0.45);
  roofSteel.rotation.x = 0.06;
  root.add(roofSteel);

  const camoTarp = new THREE.Mesh(new THREE.BoxGeometry(3.65, 0.045, 2.12), camoNetMat);
  camoTarp.position.set(0, 2.00, -0.45);
  camoTarp.rotation.x = 0.06;
  camoTarp.castShadow = true;
  root.add(camoTarp);

  // Side draped camo net skirts
  for (const side of [-1, 1]) {
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.65, 1.85), camoNetMat);
    skirt.position.set(side * 1.78, 1.66, -0.45);
    skirt.rotation.z = side * -0.14;
    root.add(skirt);
  }

  // Roof ballast sandbags
  for (const [bx, bz, ry] of [[-1.1, -0.8, 0.2], [0.95, -0.95, -0.35], [0.1, -0.25, 0.12], [-0.55, -0.15, -0.2]]) {
    const rbag = new THREE.Mesh(bagGeo, sandbagMats[0]);
    rbag.position.set(bx, 2.09, bz);
    rbag.rotation.y = ry;
    rbag.castShadow = true;
    root.add(rbag);
  }

  // 4. Profiled Jersey Barriers, Stenciled Ammo Crates, Ribbed Fuel Drum, Field Radio & Concertina Wire
  for (const side of [-1, 1]) {
    const barrierGroup = new THREE.Group();
    barrierGroup.position.set(side * 2.60, 0, 1.92);
    barrierGroup.rotation.y = side * -0.44;
    const jBase = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.24, 0.58), concreteMat);
    jBase.position.y = 0.12;
    jBase.castShadow = true;
    jBase.receiveShadow = true;
    barrierGroup.add(jBase);
    const jMid = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.28, 0.40), concreteMat);
    jMid.position.y = 0.38;
    jMid.castShadow = true;
    barrierGroup.add(jMid);
    const jTop = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.30, 0.24), concreteMat);
    jTop.position.y = 0.66;
    jTop.castShadow = true;
    barrierGroup.add(jTop);
    root.add(barrierGroup);
  }

  // Ammo crates + brass latch accents
  for (const [cx, cy, cz, ry, mat] of [
    [-1.35, 0.24, 1.05, 0.35, crateMat],
    [-1.28, 0.56, 1.08, 0.18, woodCrateMat],
    [1.38, 0.24, 0.92, -0.48, crateMat]
  ]) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.30, 0.42), mat);
    crate.position.set(cx, cy, cz);
    crate.rotation.y = ry;
    crate.castShadow = true;
    crate.receiveShadow = true;
    root.add(crate);
    const latch = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 0.44), brassAccentMat);
    latch.position.set(cx, cy + 0.04, cz);
    latch.rotation.y = ry;
    root.add(latch);
  }

  // Ribbed 55-gallon fuel drum
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.84, 14), drumMat);
  drum.position.set(1.50, 0.48, -0.92);
  drum.castShadow = true;
  root.add(drum);
  for (const ry of [0.24, 0.48, 0.72]) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(0.285, 0.018, 6, 14).rotateX(Math.PI / 2), drumMat);
    rib.position.set(1.50, ry, -0.92);
    root.add(rib);
  }

  // Field Radio Transceiver + Whip Antenna
  const radioBox = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.24, 0.22), crateMat);
  radioBox.position.set(-1.32, 0.82, -1.08);
  radioBox.rotation.y = 0.4;
  root.add(radioBox);
  const whip = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.024, 1.75, 6), gunmetalMat);
  whip.position.set(-1.45, 2.75, -1.25);
  root.add(whip);

  // Concertina barbed wire (crossed pickets + overlapping steel torus coils)
  const wireRingGeo = new THREE.TorusGeometry(0.34, 0.016, 5, 14);
  const picketGeo = new THREE.CylinderGeometry(0.025, 0.03, 0.88, 5);
  for (let w = -2; w <= 2; w++) {
    const ang = Math.PI * 0.5 + w * 0.35;
    const wx = Math.cos(ang) * 3.38;
    const wz = Math.sin(ang) * 3.38;
    const p1 = new THREE.Mesh(picketGeo, woodMat);
    p1.position.set(wx, 0.34, wz);
    p1.rotation.z = 0.48;
    p1.rotation.y = -ang;
    root.add(p1);
    const p2 = new THREE.Mesh(picketGeo, woodMat);
    p2.position.set(wx, 0.34, wz);
    p2.rotation.z = -0.48;
    p2.rotation.y = -ang;
    root.add(p2);
    for (let c = -1; c <= 1; c++) {
      const coil = new THREE.Mesh(wireRingGeo, steelWireMat);
      coil.position.set(wx + Math.sin(ang) * c * 0.24, 0.34, wz - Math.cos(ang) * c * 0.24);
      coil.rotation.y = -ang + Math.PI / 2 + c * 0.22;
      coil.rotation.x = 0.18;
      root.add(coil);
    }
  }

  // 5. Dug-in Riflemen Braced Behind Sandbags
  const soldiersGroup = new THREE.Group();
  root.add(soldiersGroup);

  const yawGroup = new THREE.Group();
  yawGroup.position.set(0, 0, 0);
  soldiersGroup.add(yawGroup);

  const pitchGroup = new THREE.Group();
  pitchGroup.position.set(0, 1.12, 0);
  yawGroup.add(pitchGroup);

  const bootMat = new THREE.MeshStandardMaterial({ color: 0x221f1c, roughness: 0.9, metalness: 0.08 });
  const gearMat = new THREE.MeshStandardMaterial({ color: 0x363d30, roughness: 0.88, metalness: 0.08 });
  const balaclavaMat = new THREE.MeshStandardMaterial({ color: 0x232724, roughness: 0.92, metalness: 0.03 });
  const goggleMat = new THREE.MeshStandardMaterial({ color: 0x161b22, roughness: 0.25, metalness: 0.65 });
  const woodStockMat = new THREE.MeshStandardMaterial({ color: 0x4b3523, roughness: 0.82, metalness: 0.05 });

  const muzzleFlashes = [];
  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffd166,
    transparent: true,
    opacity: 0.92,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const flashGeo = new THREE.ConeGeometry(0.085, 0.34, 6).rotateX(-Math.PI / 2);

  const soldierConfigs = [
    { x: -0.58, z: 0.14, crouchOffset: -0.02, yawTrim: 0.06, kneeling: false },
    { x: 0.58, z: -0.06, crouchOffset: -0.18, yawTrim: -0.08, kneeling: true }
  ];
  const soldierUnits = [];

  for (const cfg of soldierConfigs) {
    const sx = cfg.x;
    const sz = cfg.z;
    const cy = cfg.crouchOffset;

    const bodyRoot = new THREE.Group();
    bodyRoot.position.set(sx, cy, sz);
    bodyRoot.rotation.y = cfg.yawTrim;
    yawGroup.add(bodyRoot);

    // 1. Articulated Legs, Kneepads & Combat Boots (Crouched vs One-Knee Kneeling)
    // Left leg (stepped forward, foot planted)
    const lThigh = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.074, 0.38, 10), uniformMat);
    lThigh.position.set(-0.11, cfg.kneeling ? 0.50 : 0.44, cfg.kneeling ? -0.14 : -0.08);
    lThigh.rotation.x = cfg.kneeling ? -0.68 : -0.34;
    lThigh.castShadow = true;
    bodyRoot.add(lThigh);

    const lShin = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.060, 0.38, 10), uniformMat);
    lShin.position.set(-0.11, cfg.kneeling ? 0.24 : 0.20, cfg.kneeling ? -0.24 : -0.14);
    lShin.rotation.x = cfg.kneeling ? 0.08 : 0.14;
    lShin.castShadow = true;
    bodyRoot.add(lShin);

    const lKnee = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.10, 0.06), vestMat);
    lKnee.position.set(-0.11, cfg.kneeling ? 0.40 : 0.34, cfg.kneeling ? -0.27 : -0.19);
    bodyRoot.add(lKnee);

    const lBoot = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.10, 0.22), bootMat);
    lBoot.position.set(-0.11, cfg.kneeling ? 0.09 : 0.05, cfg.kneeling ? -0.25 : -0.15);
    lBoot.castShadow = true;
    bodyRoot.add(lBoot);

    // Right leg (braced back or kneeling on right knee)
    const rThigh = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.074, 0.38, 10), uniformMat);
    rThigh.position.set(0.11, cfg.kneeling ? 0.36 : 0.42, cfg.kneeling ? 0.04 : 0.08);
    rThigh.rotation.x = cfg.kneeling ? 0.10 : 0.28;
    rThigh.castShadow = true;
    bodyRoot.add(rThigh);

    const rShin = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.060, 0.38, 10), uniformMat);
    rShin.position.set(0.11, cfg.kneeling ? 0.19 : 0.18, cfg.kneeling ? 0.22 : 0.16);
    rShin.rotation.x = cfg.kneeling ? -1.38 : -0.18;
    rShin.castShadow = true;
    bodyRoot.add(rShin);

    const rKnee = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.10, 0.06), vestMat);
    rKnee.position.set(0.11, cfg.kneeling ? 0.20 : 0.30, cfg.kneeling ? 0.04 : 0.09);
    bodyRoot.add(rKnee);

    const rBoot = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.10, 0.22), bootMat);
    rBoot.position.set(0.11, cfg.kneeling ? 0.22 : 0.05, cfg.kneeling ? 0.38 : 0.16);
    if (cfg.kneeling) rBoot.rotation.x = -1.25;
    rBoot.castShadow = true;
    bodyRoot.add(rBoot);

    // Pelvis & Tactical Belt
    const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.20), uniformMat);
    pelvis.position.set(0, 0.58, 0);
    pelvis.castShadow = true;
    bodyRoot.add(pelvis);

    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 0.22), bootMat);
    belt.position.set(0, 0.65, 0);
    bodyRoot.add(belt);

    // 2. Torso, Plate Carrier Vest, Shoulder Pauldrons, Mag Pouches, Canteen, Holster & Assault Pack
    const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.15, 0.46, 10), uniformMat);
    chest.scale.set(1.12, 1, 0.72);
    chest.position.set(0, 0.90, -0.02);
    chest.rotation.x = -0.12;
    chest.castShadow = true;
    bodyRoot.add(chest);

    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.38, 0.23), vestMat);
    vest.position.set(0, 0.92, -0.02);
    vest.rotation.x = -0.12;
    vest.castShadow = true;
    bodyRoot.add(vest);

    // Shoulder armor pauldrons & rifle sling
    for (const side of [-1, 1]) {
      const pauldron = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.13, 0.16), vestMat);
      pauldron.position.set(side * 0.20, 1.01, -0.02);
      pauldron.rotation.z = side * -0.25;
      bodyRoot.add(pauldron);
    }
    const sling = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.44, 0.24), bootMat);
    sling.position.set(-0.02, 0.92, -0.02);
    sling.rotation.z = -0.58;
    bodyRoot.add(sling);

    // Front MOLLE magazine pouches (3 across chest) + radio pouch
    for (const px of [-0.09, 0, 0.09]) {
      const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.13, 0.05), gearMat);
      pouch.position.set(px, 0.85, -0.15);
      pouch.rotation.x = -0.12;
      bodyRoot.add(pouch);
    }
    const chestRadio = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.11, 0.045), bootMat);
    chestRadio.position.set(-0.11, 1.02, -0.14);
    chestRadio.rotation.x = -0.12;
    bodyRoot.add(chestRadio);

    // Hip canteen & thigh holster
    const canteen = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.14, 8), gearMat);
    canteen.position.set(-0.18, 0.62, 0.02);
    bodyRoot.add(canteen);

    const holster = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.10), bootMat);
    holster.position.set(0.16, 0.46, 0.05);
    holster.rotation.x = 0.24;
    bodyRoot.add(holster);

    // Back assault pack + rolled sleeping mat
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.34, 0.14), gearMat);
    pack.position.set(0, 0.92, 0.16);
    pack.rotation.x = -0.12;
    pack.castShadow = true;
    bodyRoot.add(pack);

    const bedroll = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.28, 8).rotateZ(Math.PI / 2), uniformMat);
    bedroll.position.set(0, 0.72, 0.18);
    bodyRoot.add(bedroll);

    // 3. Neck-Pivoted Head Group (Balaclava, Helmet, NVG, Goggles, Headset + Boom Mic)
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 1.15, -0.04);
    bodyRoot.add(headGroup);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.072, 0.11, 8), balaclavaMat);
    neck.position.set(0, 0.0, 0);
    headGroup.add(neck);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.102, 12, 10), skinMat);
    head.position.set(0, 0.10, -0.01);
    headGroup.add(head);

    const mask = new THREE.Mesh(new THREE.CylinderGeometry(0.104, 0.096, 0.11, 10), balaclavaMat);
    mask.position.set(0, 0.07, -0.01);
    headGroup.add(mask);

    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.126, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.60), helmetMat);
    helmet.position.set(0, 0.12, -0.01);
    helmet.rotation.x = -0.08;
    helmet.castShadow = true;
    headGroup.add(helmet);

    // Goggles + wrap-around strap
    const goggles = new THREE.Mesh(new THREE.BoxGeometry(0.165, 0.052, 0.06), goggleMat);
    goggles.position.set(0, 0.14, -0.115);
    headGroup.add(goggles);

    const goggleStrap = new THREE.Mesh(new THREE.CylinderGeometry(0.124, 0.124, 0.026, 12, 1, true), bootMat);
    goggleStrap.position.set(0, 0.14, -0.01);
    headGroup.add(goggleStrap);

    // NVG mount & flipped-up dual tubes (on lead rifleman)
    const nvgMount = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.05, 0.03), gunmetalMat);
    nvgMount.position.set(0, 0.18, -0.128);
    headGroup.add(nvgMount);
    if (cfg.x < 0) {
      for (const nx of [-0.028, 0.028]) {
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.075, 8).rotateX(Math.PI / 2), gunmetalMat);
        tube.position.set(nx, 0.22, -0.135);
        tube.rotation.x = -0.48;
        headGroup.add(tube);
      }
    }

    // Comm headset earcups + boom mic
    for (const side of [-1, 1]) {
      const earcup = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.03, 8).rotateZ(Math.PI / 2), bootMat);
      earcup.position.set(side * 0.115, 0.10, -0.01);
      headGroup.add(earcup);
    }
    const boomMic = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.11, 5).rotateX(Math.PI / 2), gunmetalMat);
    boomMic.position.set(-0.085, 0.06, -0.07);
    boomMic.rotation.y = -0.52;
    headGroup.add(boomMic);

    // 4. Articulated Arms (with elbow joints) + Shouldered Rifle (parented to bodyRoot for independent soldier aim)
    const aimUnit = new THREE.Group();
    aimUnit.position.set(0, 1.12, 0);
    bodyRoot.add(aimUnit);

    // Right arm (trigger hand tucked to stock)
    const rShoulder = new THREE.Mesh(new THREE.SphereGeometry(0.062, 8, 6), uniformMat);
    rShoulder.position.set(0.19, -0.04, -0.02);
    aimUnit.add(rShoulder);

    const rUpperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.054, 0.048, 0.24, 8), uniformMat);
    rUpperArm.position.set(0.20, -0.14, -0.08);
    rUpperArm.rotation.x = 0.58;
    rUpperArm.rotation.z = -0.18;
    aimUnit.add(rUpperArm);

    const rElbow = new THREE.Mesh(new THREE.SphereGeometry(0.048, 7, 6), vestMat);
    rElbow.position.set(0.21, -0.22, -0.15);
    aimUnit.add(rElbow);

    const rForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.038, 0.24, 8), uniformMat);
    rForearm.position.set(0.17, -0.17, -0.22);
    rForearm.rotation.x = 1.32;
    rForearm.rotation.z = 0.22;
    aimUnit.add(rForearm);

    const rGlove = new THREE.Mesh(new THREE.SphereGeometry(0.038, 7, 6), bootMat);
    rGlove.position.set(0.12, -0.14, -0.28);
    aimUnit.add(rGlove);

    // Left arm (reaching forward to support handguard)
    const lShoulder = new THREE.Mesh(new THREE.SphereGeometry(0.062, 8, 6), uniformMat);
    lShoulder.position.set(-0.19, -0.04, -0.02);
    aimUnit.add(lShoulder);

    const lUpperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.054, 0.048, 0.26, 8), uniformMat);
    lUpperArm.position.set(-0.14, -0.12, -0.15);
    lUpperArm.rotation.x = 0.92;
    lUpperArm.rotation.z = -0.42;
    aimUnit.add(lUpperArm);

    const lElbow = new THREE.Mesh(new THREE.SphereGeometry(0.048, 7, 6), vestMat);
    lElbow.position.set(-0.08, -0.19, -0.26);
    aimUnit.add(lElbow);

    const lForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.038, 0.26, 8), uniformMat);
    lForearm.position.set(0.01, -0.14, -0.36);
    lForearm.rotation.x = 1.44;
    lForearm.rotation.z = -0.45;
    aimUnit.add(lForearm);

    const lGlove = new THREE.Mesh(new THREE.SphereGeometry(0.038, 7, 6), bootMat);
    lGlove.position.set(0.11, -0.09, -0.46);
    aimUnit.add(lGlove);

    // Detailed Assault Rifle (Stock + Pistol Grip + Receiver + Optic + PEQ + Curved Mag + Handguard + Barrel + Flash Hider)
    const rx = 0.12;
    const ry = -0.07;

    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.09, 0.24), woodStockMat);
    stock.position.set(rx, ry - 0.01, -0.11);
    aimUnit.add(stock);

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.10, 0.048), bootMat);
    grip.position.set(rx, ry - 0.07, -0.28);
    grip.rotation.x = 0.28;
    aimUnit.add(grip);

    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.078, 0.34), gunmetalMat);
    receiver.position.set(rx, ry, -0.36);
    aimUnit.add(receiver);

    const optic = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.042, 0.09), bootMat);
    optic.position.set(rx, ry + 0.055, -0.34);
    aimUnit.add(optic);

    const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.062, 0.22), woodStockMat);
    handguard.position.set(rx, ry, -0.58);
    aimUnit.add(handguard);

    const peq = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.026, 0.075), gearMat);
    peq.position.set(rx, ry + 0.04, -0.60);
    aimUnit.add(peq);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.018, 0.34, 6).rotateX(Math.PI / 2), gunmetalMat);
    barrel.position.set(rx, ry + 0.01, -0.82);
    aimUnit.add(barrel);

    const flashHider = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.018, 0.065, 6).rotateX(Math.PI / 2), gunmetalMat);
    flashHider.position.set(rx, ry + 0.01, -0.99);
    aimUnit.add(flashHider);

    // Curved 30-round magazine (two angled segments)
    const magTop = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.09, 0.056), gunmetalMat);
    magTop.position.set(rx, ry - 0.07, -0.41);
    magTop.rotation.x = 0.18;
    aimUnit.add(magTop);

    const magBot = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.09, 0.054), gunmetalMat);
    magBot.position.set(rx, ry - 0.14, -0.435);
    magBot.rotation.x = 0.38;
    aimUnit.add(magBot);

    const mf = new THREE.Mesh(flashGeo, flashMat);
    mf.position.set(rx, ry + 0.01, -1.07);
    mf.visible = false;
    aimUnit.add(mf);
    muzzleFlashes.push(mf);

    soldierUnits.push({
      bodyRoot,
      aimUnit,
      headGroup,
      muzzleFlash: mf,
      baseBodyY: cy,
      baseYawTrim: cfg.yawTrim,
      phase: cfg.x < 0 ? 0.0 : 2.1,
      slewRate: cfg.x < 0 ? 4.3 : 3.8,
      ammoInMag: 15,
      reloadTimer: 0,
      fireCooldown: cfg.x < 0 ? 0.0 : 0.75,
      burstLeft: 0,
      burstInterval: 0,
      lockTimer: 0,
      recoilTimer: 0,
      shotCount: 0,
      hasFiredAtTarget: false,
      burstAimDir: new THREE.Vector3()
    });
  }

  const damageGroup = new THREE.Group();
  root.add(damageGroup);

  return { root, yawGroup, pitchGroup, muzzleFlashes, damageGroup, soldiersGroup, soldierUnits, armorMat: vestMat };
}

function createAAEmplacementMesh(variant = 'radar') {
  const root = new THREE.Group();

  const concreteMat = new THREE.MeshStandardMaterial({ color: 0x6c706b, roughness: 0.94, metalness: 0.05 });
  const sandbagMat = new THREE.MeshStandardMaterial({ color: 0x8a7d5d, roughness: 0.96, metalness: 0.02 });
  const sandbagDarkMat = new THREE.MeshStandardMaterial({ color: 0x6f644a, roughness: 0.96, metalness: 0.02 });
  const armorMat = new THREE.MeshStandardMaterial({
    color: variant === 'radar' ? 0x3b4834 : 0x45493a,
    roughness: 0.62,
    metalness: 0.34
  });
  const gunmetalMat = new THREE.MeshStandardMaterial({ color: 0x24282c, roughness: 0.38, metalness: 0.78 });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xc29738, roughness: 0.34, metalness: 0.86 });
  const opticMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.2, metalness: 0.65 });
  const lensMat = new THREE.MeshStandardMaterial({
    color: variant === 'radar' ? 0xef4444 : 0x38bdf8,
    emissive: variant === 'radar' ? 0xb91c1c : 0x0284c7,
    emissiveIntensity: 0.75,
    roughness: 0.15
  });
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x4b5539, roughness: 0.86, metalness: 0.1 });

  // 1. Deep Concrete Octagonal Revetment Pad (sinks -2.2m so slopes never expose underside)
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(3.35, 3.65, 2.35, 10), concreteMat);
  pad.position.y = -1.02;
  pad.receiveShadow = true;
  root.add(pad);

  const innerRing = new THREE.Mesh(new THREE.CylinderGeometry(1.18, 1.32, 0.28, 16), concreteMat);
  innerRing.position.y = 0.24;
  innerRing.receiveShadow = true;
  root.add(innerRing);

  // 2. Staggered 2-Tier Sandbag Parapet Ring & Ordnance Crates
  const bagGeo = new THREE.BoxGeometry(0.92, 0.28, 0.48);
  for (let tier = 0; tier < 2; tier++) {
    const count = 16;
    const radius = 3.05 - tier * 0.14;
    const y = 0.28 + tier * 0.26;
    for (let i = 0; i < count; i++) {
      // Leave small rear access gap
      if (i === 7 && tier === 1) continue;
      const ang = (i / count) * Math.PI * 2 + tier * (Math.PI / count);
      const bag = new THREE.Mesh(bagGeo, (i + tier) % 2 === 0 ? sandbagMat : sandbagDarkMat);
      bag.position.set(Math.cos(ang) * radius, y, Math.sin(ang) * radius);
      bag.rotation.y = -ang + Math.PI / 2 + ((i % 3) - 1) * 0.04;
      bag.castShadow = true;
      bag.receiveShadow = true;
      root.add(bag);
    }
  }

  // Stacked 23mm ammo crates inside the pit
  for (const [cx, cz, ry] of [[-1.85, 1.45, 0.4], [1.9, 1.35, -0.35], [-1.95, -1.25, -0.6]]) {
    const crate = vehiclePart(root, new THREE.BoxGeometry(0.82, 0.44, 0.48), crateMat, cx, 0.37, cz, true);
    crate.rotation.y = ry;
  }

  // 3. Rotating Twin-23mm Turret Carriage (yawGroup)
  const yawGroup = new THREE.Group();
  yawGroup.position.set(0, 0.40, 0);
  root.add(yawGroup);

  // Turntable ring & trunnion cheeks
  vehiclePart(yawGroup, new THREE.CylinderGeometry(0.92, 1.02, 0.22, 16), gunmetalMat, 0, 0.11, 0, true);
  vehiclePart(yawGroup, new THREE.BoxGeometry(1.18, 0.18, 1.35), armorMat, 0, 0.28, 0.05, true);
  for (const side of [-1, 1]) {
    vehiclePart(yawGroup, new THREE.BoxGeometry(0.14, 0.68, 0.72), armorMat, side * 0.46, 0.66, 0.02, true);
    // Dual 23mm Drum / Box Ammo Magazines + brass belt chutes
    vehiclePart(yawGroup, new THREE.BoxGeometry(0.32, 0.42, 0.64), armorMat, side * 0.78, 0.72, 0.08, true);
    vehiclePart(yawGroup, new THREE.BoxGeometry(0.16, 0.06, 0.26), brassMat, side * 0.56, 0.84, 0.04);
  }

  // Sloped Armored Gun Shield (Front & Angled Side Wings)
  const frontShield = vehiclePart(yawGroup, new THREE.BoxGeometry(1.38, 0.88, 0.09), armorMat, 0, 0.88, -0.44, true);
  frontShield.rotation.x = 0.24;
  for (const side of [-1, 1]) {
    const wing = vehiclePart(yawGroup, new THREE.BoxGeometry(0.08, 0.82, 0.56), armorMat, side * 0.72, 0.84, -0.18, true);
    wing.rotation.y = side * -0.22;
  }

  // Fire-Control Director Pod (Radar-Linked Tracking Dish vs EO/IR Reflex Pod)
  const fcGroup = new THREE.Group();
  fcGroup.position.set(variant === 'radar' ? 0.54 : -0.52, 1.32, -0.16);
  yawGroup.add(fcGroup);
  vehiclePart(fcGroup, new THREE.BoxGeometry(0.28, 0.26, 0.34), opticMat, 0, 0, 0, true);
  vehiclePart(fcGroup, new THREE.CylinderGeometry(0.065, 0.065, 0.05, 12).rotateX(Math.PI / 2), lensMat, 0, 0.02, -0.18);
  if (variant === 'radar') {
    const miniDish = vehiclePart(fcGroup, new THREE.CylinderGeometry(0.24, 0.06, 0.10, 14).rotateX(Math.PI / 2), armorMat, 0, 0.24, -0.02, true);
    vehiclePart(fcGroup, new THREE.CylinderGeometry(0.02, 0.02, 0.18, 8).rotateX(Math.PI / 2), gunmetalMat, 0, 0.24, -0.11);
    miniDish.userData.visualOnly = true;
  }

  // 4. Elevating Twin-23mm Barrel Cradle (pitchGroup)
  const pitchGroup = new THREE.Group();
  pitchGroup.position.set(0, 0.92, -0.06);
  yawGroup.add(pitchGroup);

  vehiclePart(pitchGroup, new THREE.BoxGeometry(0.76, 0.24, 0.76), gunmetalMat, 0, 0, 0.04, true);
  const muzzleFlashes = [];
  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffb703,
    transparent: true,
    opacity: 0.94,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  for (const side of [-1, 1]) {
    const bx = side * 0.21;
    // Breech & Recoil Cylinder
    vehiclePart(pitchGroup, new THREE.BoxGeometry(0.18, 0.22, 0.88), gunmetalMat, bx, 0.02, 0.02, true);
    vehiclePart(pitchGroup, new THREE.CylinderGeometry(0.048, 0.048, 0.72, 10).rotateX(Math.PI / 2), armorMat, bx, -0.12, -0.42);
    // Perforated Barrel Jacket + Long 23mm Barrel + Conical Flash Suppressor
    vehiclePart(pitchGroup, new THREE.CylinderGeometry(0.055, 0.062, 0.85, 12).rotateX(Math.PI / 2), gunmetalMat, bx, 0.03, -0.78, true);
    vehiclePart(pitchGroup, new THREE.CylinderGeometry(0.034, 0.040, 1.55, 12).rotateX(Math.PI / 2), gunmetalMat, bx, 0.03, -1.86, true);
    vehiclePart(pitchGroup, new THREE.CylinderGeometry(0.064, 0.036, 0.20, 12).rotateX(Math.PI / 2), gunmetalMat, bx, 0.03, -2.70);

    // Dual Muzzle Flash Star
    const mf = new THREE.Group();
    mf.position.set(bx, 0.03, -2.84);
    mf.visible = false;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.62, 7).rotateX(-Math.PI / 2), flashMat.clone());
    const crossA = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.46), flashMat.clone());
    crossA.material.side = THREE.DoubleSide;
    const crossB = crossA.clone();
    crossB.rotation.z = Math.PI / 4;
    mf.add(cone, crossA, crossB);
    pitchGroup.add(mf);
    muzzleFlashes.push(mf);
  }

  const damageGroup = new THREE.Group();
  root.add(damageGroup);

  return { root, yawGroup, pitchGroup, muzzleFlashes, damageGroup, armorMat };
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
  wildernessDepotSite,
  {x:-107.5,z:-174.5,radius:6.2,height:wildernessRadarSite.height},
  {x:33.5,z:-234.5,radius:6.8,height:wildernessDepotSite.height}
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
  let hitRoof = false;
  let lastIndex = -1;
  let cellX = wildernessColliderCell(drone.pos.x);
  let cellZ = wildernessColliderCell(drone.pos.z);
  let candidates = wildernessColliderCells.get(`${cellX},${cellZ}`);
  for (let i = 0; candidates && i < candidates.length; i++) {
    const index = candidates[i];
    if (index <= lastIndex) continue;
    if (resolveBoxContact(wildernessColliders[index]) === 'roof') hitRoof = true;
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
  return hitRoof;
}
const tacticalTargetColliders = [];
const wildernessBounds = new THREE.Box3();
const WILDERNESS_TERRAIN_SIZE = 700;
const WILDERNESS_TERRAIN_CELLS = 240;
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
  const roadDist = wildernessRoadDistance(x, z);
  const roadCut = 1 - .34 * (1 - THREE.MathUtils.smoothstep(roadDist, 3, 18));
  const screenRidge = 13 * Math.exp(-(((x+14)/30)**2 + ((z+33)/10)**2));

  // Ridged multifractal mountain spurs, crags & eroded gullies (kept smooth near roads & valley floor)
  const ridgeMask = THREE.MathUtils.smoothstep(roadDist, 8, 28);
  const rawRidge1 = 1.0 - Math.abs(Math.sin(x * 0.031 + z * 0.019 + Math.cos(z * 0.014) * 1.6));
  const rawRidge2 = 1.0 - Math.abs(Math.cos(x * 0.058 - z * 0.044 + Math.sin(x * 0.023) * 1.2));
  const gully = Math.sin(x * 0.095 + z * 0.072) * Math.cos(z * 0.088 - x * 0.054);
  const mountainSlopeFactor = THREE.MathUtils.clamp((west + east + screenRidge) / 18.0, 0.08, 1.35);
  const ridgeDetail = ((rawRidge1 * rawRidge1 * 5.2 + rawRidge2 * 2.4 - 2.6) * mountainSlopeFactor + gully * 0.75) * ridgeMask;

  let height = Math.max(-1.5, (west + east) * roadCut + valley + screenRidge + ridgeDetail);
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
  const hasColors = geos.every((g) => g.attributes.color);
  for (const g of geos) {
    totalPos += g.attributes.position.count;
    totalIdx += g.index ? g.index.count : g.attributes.position.count;
  }
  const posArr = new Float32Array(totalPos * 3);
  const normArr = new Float32Array(totalPos * 3);
  const uvArr = new Float32Array(totalPos * 2);
  const colArr = hasColors ? new Float32Array(totalPos * 3) : null;
  const idxArr = totalPos > 65535 ? new Uint32Array(totalIdx) : new Uint16Array(totalIdx);

  let posOff = 0, idxOff = 0, vertCount = 0;
  for (const g of geos) {
    const pos = g.attributes.position;
    const norm = g.attributes.normal;
    const uv = g.attributes.uv;
    const col = g.attributes.color;
    posArr.set(pos.array, posOff * 3);
    if (norm) normArr.set(norm.array, posOff * 3);
    if (uv) uvArr.set(uv.array, posOff * 2);
    if (hasColors && col) colArr.set(col.array, posOff * 3);

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
  if (hasColors) merged.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
  merged.setIndex(new THREE.BufferAttribute(idxArr, 1));
  return merged;
}

function bakeGeometryVerticalAO(geo, minY, maxY, minShade = 0.48, maxShade = 1.0) {
  const pos = geo.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  const span = Math.max(0.001, maxY - minY);
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp((pos.getY(i) - minY) / span, 0, 1);
    const s = THREE.MathUtils.lerp(minShade, maxShade, Math.pow(t, 0.85));
    cols[i * 3] = s;
    cols[i * 3 + 1] = s * (0.96 + 0.04 * t);
    cols[i * 3 + 2] = s * (0.92 + 0.08 * t);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return geo;
}

function createVolumetricCanopyGeometry() {
  const geos = [];
  // Multi-lobe organic 3D foliage puffs (lush from both top-down UAV view & side view)
  const puffs = [
    { x: 0.0, y: 0.14, z: 0.0, rx: 0.42, ry: 0.34, rz: 0.42 },
    { x: 0.22, y: 0.02, z: 0.16, rx: 0.32, ry: 0.25, rz: 0.30 },
    { x: -0.24, y: 0.04, z: 0.14, rx: 0.30, ry: 0.26, rz: 0.32 },
    { x: 0.18, y: -0.02, z: -0.22, rx: 0.31, ry: 0.24, rz: 0.29 },
    { x: -0.18, y: 0.06, z: -0.20, rx: 0.33, ry: 0.26, rz: 0.31 },
    { x: 0.02, y: 0.28, z: -0.04, rx: 0.28, ry: 0.22, rz: 0.28 }
  ];
  for (let pIdx = 0; pIdx < puffs.length; pIdx++) {
    const pf = puffs[pIdx];
    const puff = new THREE.SphereGeometry(1.0, 7, 5);
    const pos = puff.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i);
      const bump = 1.0 + 0.16 * Math.sin(vx * 5.1 + pIdx * 1.7) * Math.cos(vz * 4.7 - vy * 3.9);
      pos.setXYZ(i, vx * pf.rx * bump + pf.x, vy * pf.ry * bump + pf.y, vz * pf.rz * bump + pf.z);
    }
    puff.computeVertexNormals();
    bakeGeometryVerticalAO(puff, -0.35, 0.50, 0.46, 1.05);
    geos.push(puff);
  }
  // 2 crossed interior leaf cards for dense silhouette breakup
  for (let a = 0; a < 2; a++) {
    const card = new THREE.PlaneGeometry(0.95, 0.78);
    card.rotateY((a * Math.PI) / 2 + 0.4);
    card.translate(0, 0.05, 0);
    bakeGeometryVerticalAO(card, -0.35, 0.50, 0.42, 0.92);
    geos.push(card);
  }
  return mergeBufferGeometriesSimple(geos);
}

function createConiferFoliageGeometry() {
  const geos = [];
  // 6 staggered, organically tilted/serrated conical branch skirts
  const tiers = [
    { r: 0.62, h: 0.32, y: -0.34, tiltX: 0.03, tiltZ: -0.02, rot: 0.0 },
    { r: 0.53, h: 0.32, y: -0.16, tiltX: -0.02, tiltZ: 0.03, rot: 0.35 },
    { r: 0.44, h: 0.30, y: 0.02, tiltX: 0.02, tiltZ: 0.02, rot: 0.70 },
    { r: 0.35, h: 0.28, y: 0.18, tiltX: -0.03, tiltZ: -0.02, rot: 1.05 },
    { r: 0.25, h: 0.28, y: 0.34, tiltX: 0.02, tiltZ: -0.01, rot: 1.40 },
    { r: 0.14, h: 0.30, y: 0.50, tiltX: 0.0, tiltZ: 0.0, rot: 1.75 }
  ];
  tiers.forEach((t, idx) => {
    const cone = new THREE.ConeGeometry(t.r, t.h, 9, 1, false);
    const pos = cone.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i);
      if (vy < 0) {
        const ang = Math.atan2(vz, vx);
        const serrate = 1.0 + 0.14 * Math.sin(ang * 5 + idx * 1.9);
        vx *= serrate;
        vz *= serrate;
        vy -= 0.03 * Math.abs(Math.sin(ang * 4 + idx));
      }
      pos.setXYZ(i, vx, vy, vz);
    }
    cone.rotateY(t.rot);
    cone.rotateX(t.tiltX);
    cone.rotateZ(t.tiltZ);
    cone.translate(0, t.y, 0);
    cone.computeVertexNormals();
    bakeGeometryVerticalAO(cone, -0.50, 0.65, 0.44, 1.04);
    geos.push(cone);
  });
  for (let a = 0; a < 2; a++) {
    const card = new THREE.PlaneGeometry(0.82, 1.15);
    card.rotateY((a * Math.PI) / 2 + Math.PI / 4);
    bakeGeometryVerticalAO(card, -0.50, 0.65, 0.38, 0.90);
    geos.push(card);
  }
  return mergeBufferGeometriesSimple(geos);
}

function createShrubFoliageGeometry() {
  const geos = [];
  const clusters = [
    { x: 0.0, y: 0.30, z: 0.0, rx: 0.50, ry: 0.34, rz: 0.48 },
    { x: 0.28, y: 0.22, z: 0.18, rx: 0.36, ry: 0.26, rz: 0.34 },
    { x: -0.26, y: 0.24, z: -0.15, rx: 0.38, ry: 0.28, rz: 0.36 },
    { x: 0.05, y: 0.20, z: -0.28, rx: 0.34, ry: 0.24, rz: 0.32 }
  ];
  clusters.forEach((c, idx) => {
    const dome = new THREE.SphereGeometry(1.0, 6, 4);
    const pos = dome.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i);
      const jitter = 1.0 + 0.18 * Math.sin(vx * 4.5 + idx) * Math.cos(vz * 4.2);
      pos.setXYZ(i, vx * c.rx * jitter + c.x, Math.max(0.02, vy * c.ry * jitter + c.y), vz * c.rz * jitter + c.z);
    }
    dome.computeVertexNormals();
    bakeGeometryVerticalAO(dome, 0.02, 0.65, 0.45, 1.02);
    geos.push(dome);
  });
  return mergeBufferGeometriesSimple(geos);
}

function createWeatheredBoulderGeometry() {
  const geo = new THREE.IcosahedronGeometry(1.0, 2);
  const pos = geo.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    let vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i);
    if (vy < -0.15) vy = -0.15 + (vy + 0.15) * 0.24; // flattened embedded underside
    // Angular rock cleavage planes & horizontal sedimentary strata
    const fracture1 = 0.20 * Math.abs(Math.sin(vx * 2.7 + vz * 2.1));
    const fracture2 = 0.14 * Math.cos(vy * 4.3 - vx * 2.5);
    const strata = 0.06 * Math.sin(vy * 11.0 + vx * 1.8);
    const scale = 0.88 + fracture1 + fracture2 + strata;
    const rx = vx * scale * 1.18, ry = vy * scale * 0.86, rz = vz * scale * 0.96;
    pos.setXYZ(i, rx, ry, rz);

    // Baked crevice & ground-contact AO
    const ao = THREE.MathUtils.clamp(0.55 + (vy + 0.3) * 0.42 + strata * 1.8, 0.45, 1.05);
    cols[i * 3] = ao;
    cols[i * 3 + 1] = ao * 0.99;
    cols[i * 3 + 2] = ao * 0.96;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
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
  const bumpCanvas = document.createElement('canvas');
  const tileSize = 512;
  canvas.width = canvas.height = tileSize;
  bumpCanvas.width = bumpCanvas.height = tileSize;
  const ctx = canvas.getContext('2d');
  const bCtx = bumpCanvas.getContext('2d');
  ctx.fillStyle = '#d4c9b2';
  ctx.fillRect(0, 0, tileSize, tileSize);
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, tileSize, tileSize);

  let textureSeed = 1287;
  const detailRandom = () => {
    textureSeed = (Math.imul(textureSeed,1664525)+1013904223) >>> 0;
    return textureSeed / 4294967296;
  };
  // Organic multi-scale soil mottling & moss patches (seamless wrap)
  for (let i = 0; i < 480; i++) {
    const x = detailRandom() * tileSize, y = detailRandom() * tileSize;
    const r = 8 + detailRandom() * 24;
    const isMoss = i % 3 === 0;
    ctx.fillStyle = isMoss ? 'rgba(92, 108, 66, 0.14)' : (i % 2 ? 'rgba(122, 102, 74, 0.12)' : 'rgba(222, 210, 184, 0.12)');
    for (const ox of [-tileSize, 0, tileSize]) {
      for (const oy of [-tileSize, 0, tileSize]) {
        if (x + ox < -r || x + ox > tileSize + r || y + oy < -r || y + oy > tileSize + r) continue;
        ctx.beginPath();
        ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  // Fine grit, dry litter, pebbles & crisp micro-bump
  for (let i = 0; i < 11000; i++) {
    const x = detailRandom() * tileSize, y = detailRandom() * tileSize;
    const stone = i % 9 === 0;
    const twig = i % 17 === 0;
    const w = stone ? 1.8 + detailRandom() * 4.2 : (twig ? 2.5 + detailRandom() * 4.5 : 0.7 + detailRandom() * 1.9);
    const h = twig ? 0.55 + detailRandom() * 0.45 : w * (0.45 + detailRandom() * 0.45);
    const angle = detailRandom() * Math.PI;
    ctx.fillStyle = stone ? '#6e63566a' : (twig ? '#5c4b3844' : (i % 2 ? '#6b5e4b38' : '#f5edd84a'));
    ctx.beginPath();
    ctx.ellipse(x, y, w, h, angle, 0, Math.PI * 2);
    ctx.fill();

    bCtx.fillStyle = stone ? 'rgba(235,235,235,0.52)' : (i % 2 ? 'rgba(40,40,40,0.28)' : 'rgba(195,195,195,0.24)');
    bCtx.beginPath();
    bCtx.ellipse(x, y, w, h, angle, 0, Math.PI * 2);
    bCtx.fill();

    if (stone) {
      ctx.fillStyle = '#efe2ce80';
      ctx.beginPath();
      ctx.ellipse(x - w * 0.18, y - h * 0.25, w * 0.72, h * 0.52, angle, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Preserve the seeded terrain, road and vegetation layout.
  for (let i = 0; i < 3600 * 5; i++) random();
  const grain = new THREE.CanvasTexture(canvas);
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
  grain.encoding = THREE.sRGBEncoding;
  grain.repeat.set(110, 110);
  grain.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const grainBump = new THREE.CanvasTexture(bumpCanvas);
  grainBump.wrapS = grainBump.wrapT = THREE.RepeatWrapping;
  grainBump.repeat.set(110, 110);
  grainBump.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const ground = new THREE.PlaneGeometry(WILDERNESS_TERRAIN_SIZE,WILDERNESS_TERRAIN_SIZE,WILDERNESS_TERRAIN_CELLS,WILDERNESS_TERRAIN_CELLS);
  ground.rotateX(-Math.PI/2);
  ground.translate(0,0,WILDERNESS_TERRAIN_Z);
  const position = ground.attributes.position;
  const colors = [];
  const turf = new THREE.Color(0x617247), slope = new THREE.Color(0x435739);
  const rockFace = new THREE.Color(0x787061), valleyShade = new THREE.Color(0x36442d);
  const alpineCrest = new THREE.Color(0x88846e), screeCol = new THREE.Color(0x6b6457);
  const soil = new THREE.Color(0x98805a), gravel = new THREE.Color(0xb09b7a), tint = new THREE.Color();
  for (let i=0;i<position.count;i++) {
    if (i % 128 === 0) yield;
    const x=position.getX(i), z=position.getZ(i), y=wildernessHeight(x,z);
    position.setY(i,y);
    // Compute topographic gradient (dh/dx, dh/dz) for slope steepness, solar aspect & valley AO
    const dhdx = (wildernessHeight(x + 1.5, z) - wildernessHeight(x - 1.5, z)) / 3.0;
    const dhdz = (wildernessHeight(x, z + 1.5) - wildernessHeight(x, z - 1.5)) / 3.0;
    const gradMag = Math.hypot(dhdx, dhdz);
    const steepness = THREE.MathUtils.smoothstep(gradMag, 0.22, 0.68);
    const screeBand = THREE.MathUtils.smoothstep(gradMag, 0.14, 0.34) * (1.0 - steepness);
    const solarAspect = THREE.MathUtils.clamp((-dhdx * 0.65 - dhdz * 0.45) * 0.24, -0.11, 0.13);
    const valleyAO = THREE.MathUtils.smoothstep(y, -1.2, 6.5) * 0.13 + 0.87;

    const patch = .5+.25*Math.sin(x*.067+z*.035)+.22*Math.cos(z*.076-x*.023);
    const exposedSoil = THREE.MathUtils.smoothstep(
      .55*Math.sin(x*.12+z*.055)+.45*Math.cos(z*.16-x*.083),.20,.88);
    tint.copy(turf).lerp(slope,THREE.MathUtils.clamp(y/32,0,.85))
      .lerp(alpineCrest, THREE.MathUtils.smoothstep(y, 22, 38) * 0.45)
      .lerp(soil,Math.min(.85,patch*.32+exposedSoil*.48))
      .lerp(screeCol, screeBand * 0.35)
      .lerp(rockFace, steepness * 0.76);
    if (y < 4.5) tint.lerp(valleyShade, (1.0 - THREE.MathUtils.clamp((y + 1.5) / 6.0, 0, 1)) * 0.30);
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
  wildernessLandMat = new THREE.MeshStandardMaterial({map:grain,bumpMap:grainBump,bumpScale:.14,vertexColors:true,roughness:.95,metalness:.02});
  wildernessLandMat.onBeforeCompile = (shader) => {
    shader.vertexShader = `
      varying vec3 vTerrainWorldPos;
      varying vec3 vTerrainWorldNormal;
    ` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `
      #include <project_vertex>
      vTerrainWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
      vTerrainWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
      `
    );
    shader.fragmentShader = `
      varying vec3 vTerrainWorldPos;
      varying vec3 vTerrainWorldNormal;
    ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `
      #include <map_fragment>
      float macroWave1 = sin(vTerrainWorldPos.x * 0.037 + vTerrainWorldPos.z * 0.029) * cos(vTerrainWorldPos.z * 0.043 - vTerrainWorldPos.x * 0.019);
      float macroWave2 = sin(vTerrainWorldPos.x * 0.13 + vTerrainWorldPos.z * 0.11) * cos(vTerrainWorldPos.z * 0.17 - vTerrainWorldPos.x * 0.09);
      diffuseColor.rgb *= (1.0 + macroWave1 * 0.09 + macroWave2 * 0.045);

      float cliffFactor = smoothstep(0.18, 0.44, 1.0 - abs(vTerrainWorldNormal.y));
      float strataPattern = sin(vTerrainWorldPos.y * 2.5 + sin(vTerrainWorldPos.x * 0.22 + vTerrainWorldPos.z * 0.18) * 1.4);
      float strataShade = 0.85 + 0.15 * strataPattern;
      vec3 cliffTint = vec3(0.41, 0.38, 0.34) * strataShade;
      diffuseColor.rgb = mix(diffuseColor.rgb, cliffTint, cliffFactor * 0.56);
      `
    );
  };
  const land = new THREE.Mesh(ground,wildernessLandMat);
  land.receiveShadow = true;
  group.add(land);

  yield '鋪設戰場道路';
  const TRACK_GAUGE_HALF = 1.35; // 2.7m military MBT / tactical truck track center-to-center gauge
  const roadCanvas = document.createElement('canvas');
  const roadBumpCanvas = document.createElement('canvas');
  roadCanvas.width = roadCanvas.height = 256;
  roadBumpCanvas.width = roadBumpCanvas.height = 256;
  const rCtx = roadCanvas.getContext('2d');
  const rbCtx = roadBumpCanvas.getContext('2d');
  rCtx.fillStyle = '#9b8668';
  rCtx.fillRect(0, 0, 256, 256);
  rbCtx.fillStyle = '#808080';
  rbCtx.fillRect(0, 0, 256, 256);
  // Smooth feathered compacted wheel tracks aligned to +-1.35m (u = 0.3125 / 0.6875) & soft center grass verge
  const rutGrad = rCtx.createLinearGradient(0, 0, 256, 0);
  rutGrad.addColorStop(0.00, 'rgba(155, 134, 104, 0.00)');
  rutGrad.addColorStop(0.16, 'rgba(130, 112, 84, 0.10)');
  rutGrad.addColorStop(0.31, 'rgba(76, 62, 46, 0.34)');
  rutGrad.addColorStop(0.41, 'rgba(125, 110, 82, 0.08)');
  rutGrad.addColorStop(0.50, 'rgba(102, 112, 68, 0.24)');
  rutGrad.addColorStop(0.59, 'rgba(125, 110, 82, 0.08)');
  rutGrad.addColorStop(0.69, 'rgba(76, 62, 46, 0.34)');
  rutGrad.addColorStop(0.84, 'rgba(130, 112, 84, 0.10)');
  rutGrad.addColorStop(1.00, 'rgba(155, 134, 104, 0.00)');
  rCtx.fillStyle = rutGrad;
  rCtx.fillRect(0, 0, 256, 256);
  // Subtle recessed wheel-rut depth in bump map
  const rutBumpGrad = rbCtx.createLinearGradient(0, 0, 256, 0);
  rutBumpGrad.addColorStop(0.00, 'rgba(128, 128, 128, 0)');
  rutBumpGrad.addColorStop(0.31, 'rgba(72, 72, 72, 0.46)');
  rutBumpGrad.addColorStop(0.50, 'rgba(156, 156, 156, 0.35)');
  rutBumpGrad.addColorStop(0.69, 'rgba(72, 72, 72, 0.46)');
  rutBumpGrad.addColorStop(1.00, 'rgba(128, 128, 128, 0)');
  rbCtx.fillStyle = rutBumpGrad;
  rbCtx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 2600; i++) {
    const px = detailRandom() * 256, py = detailRandom() * 256;
    const pr = 0.6 + detailRandom() * 2.0;
    rCtx.fillStyle = i % 3 === 0 ? 'rgba(214, 198, 170, 0.30)' : 'rgba(68, 57, 43, 0.26)';
    rCtx.beginPath();
    rCtx.arc(px, py, pr, 0, Math.PI * 2);
    rCtx.fill();
    rbCtx.fillStyle = i % 2 ? 'rgba(215,215,215,0.36)' : 'rgba(50,50,50,0.36)';
    rbCtx.beginPath();
    rbCtx.arc(px, py, pr, 0, Math.PI * 2);
    rbCtx.fill();
  }
  const roadTex = new THREE.CanvasTexture(roadCanvas);
  roadTex.wrapS = THREE.ClampToEdgeWrapping;
  roadTex.wrapT = THREE.RepeatWrapping;
  roadTex.encoding = THREE.sRGBEncoding;
  roadTex.repeat.set(1, 28);
  const roadBump = new THREE.CanvasTexture(roadBumpCanvas);
  roadBump.wrapS = THREE.ClampToEdgeWrapping;
  roadBump.wrapT = THREE.RepeatWrapping;
  roadBump.repeat.set(1, 28);

  const wildernessJunctionDefs = [
    { x: 10, z: -110, size: 24 },
    { x: 55, z: -195, size: 24 },
    { x: -34, z: -110, size: 24 }
  ];

  const pathMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: roadTex,
    bumpMap: roadBump,
    bumpScale: 0.08,
    roughness: .94,
    metalness: .03,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
  // Decouple road shoulder/endpoint/junction alpha fade from roadTex.repeat using raw UVs & world XZ
  pathMaterial.onBeforeCompile = (shader) => {
    shader.vertexShader = `
      varying vec2 vRoadRawUv;
      varying vec2 vRoadWorldXZ;
    ` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <uv_vertex>',
      `
      #include <uv_vertex>
      vRoadRawUv = uv;
      vRoadWorldXZ = (modelMatrix * vec4(position, 1.0)).xz;
      `
    );
    shader.fragmentShader = `
      varying vec2 vRoadRawUv;
      varying vec2 vRoadWorldXZ;
    ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `
      #include <map_fragment>
      float roadEdgeFade = smoothstep(0.0, 0.22, min(vRoadRawUv.x, 1.0 - vRoadRawUv.x));
      float roadEndFade = smoothstep(0.0, 0.04, min(vRoadRawUv.y, 1.0 - vRoadRawUv.y));
      float juncFade = 1.0;
      juncFade *= smoothstep(4.2, 6.8, length(vRoadWorldXZ - vec2(10.0, -110.0)));
      juncFade *= smoothstep(4.2, 6.8, length(vRoadWorldXZ - vec2(55.0, -195.0)));
      juncFade *= smoothstep(4.2, 6.8, length(vRoadWorldXZ - vec2(-34.0, -110.0)));
      diffuseColor.a *= roadEdgeFade * roadEndFade * juncFade;
      `
    );
  };
  wildernessRoadMat = pathMaterial;
  const roadOffsets = [-3.6,-2.6,-1.8,-1.35,-.7,0,.7,1.35,1.8,2.6,3.6];
  const roadCurves = [];
  for (const [roadIndex,road] of wildernessRoads.entries()) {
    const points = new THREE.BufferGeometry();
    const vertices=[], shades=[], triangles=[], roadUvs=[];
    const curve = new THREE.CatmullRomCurve3(road.map(([x,z]) => new THREE.Vector3(x,0,z)));
    roadCurves.push({ curve, roadIndex });
    const steps = Math.ceil(curve.getLength() / .8);
    const rows = curve.getSpacedPoints(steps);
    for (let i = 0; i < rows.length; i++) {
      const { x, z } = rows[i];
      const previous = rows[Math.max(0, i - 1)];
      const next = rows[Math.min(steps, i + 1)];
      const dx = next.x - previous.x, dz = next.z - previous.z;
      const length = Math.hypot(dx, dz);
      const start = vertices.length / 3;
      let nearestJuncDist = Infinity;
      for (const jd of wildernessJunctionDefs) {
        nearestJuncDist = Math.min(nearestJuncDist, Math.hypot(x - jd.x, z - jd.z));
      }
      const juncRutRelax = THREE.MathUtils.smoothstep(nearestJuncDist, 6.5, 10.5);
      for (const offset of roadOffsets) {
        const px = x - dz / length * offset;
        const pz = z + dx / length * offset;
        vertices.push(px, wildernessRoadBaseHeight(px,pz) + WILDERNESS_ROAD_LIFT + roadIndex * .009, pz);
        roadUvs.push((offset + 3.6) / 7.2, i / steps);
        const rut = Math.exp(-(((Math.abs(offset) - TRACK_GAUGE_HALF) / .44) ** 2)) * (0.25 + 0.75 * juncRutRelax);
        const gravel = .055*Math.sin(px*7.3+pz*6.1)*Math.cos(pz*3.9-px*4.1);
        const damp = .04*Math.sin(px*.62+pz*.44);
        const value = (1-.21*rut-(Math.abs(offset)>3 ? .13 : 0)) * (.94+gravel+damp);
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

  // Build Flared Compacted Junction Aprons with Sweeping Curved Turning Ruts
  wildernessJunctionMats.length = 0;
  for (const jDef of wildernessJunctionDefs) {
    const { x: jx, z: jz, size } = jDef;
    const texSize = 512;
    const m2px = texSize / size;
    const toPx = (wx, wz) => [((wx - jx) / size + 0.5) * texSize, ((wz - jz) / size + 0.5) * texSize];

    // 1. Extract exact world-space branch rays entering this junction from roadCurves
    const branches = [];
    for (const { curve, roadIndex } of roadCurves) {
      const len = curve.getLength();
      const samples = Math.max(80, Math.ceil(len / 0.5));
      let bestT = -1, bestDist = Infinity;
      for (let s = 0; s <= samples; s++) {
        const t = s / samples;
        const pt = curve.getPointAt(t);
        const d = Math.hypot(pt.x - jx, pt.z - jz);
        if (d < bestDist) {
          bestDist = d;
          bestT = t;
        }
      }
      if (bestDist > 2.0) continue;

      for (const dirSign of [-1, 1]) {
        if (dirSign < 0 && bestT < 0.02) continue;
        if (dirSign > 0 && bestT > 0.98) continue;
        const pts = [];
        const maxSteps = 28;
        for (let step = 0; step <= maxSteps; step++) {
          const distM = step * 0.45;
          const t = THREE.MathUtils.clamp(bestT + dirSign * (distM / len), 0, 1);
          const pt = curve.getPointAt(t);
          pts.push([pt.x, pt.z]);
          if (step > 0 && (Math.hypot(pt.x - jx, pt.z - jz) >= 11.4 || t === 0 || t === 1)) break;
        }
        if (pts.length < 3) continue;
        const last = pts[pts.length - 1];
        const prev = pts[Math.max(0, pts.length - 3)];
        const uxRaw = last[0] - prev[0], uzRaw = last[1] - prev[1];
        const uLen = Math.hypot(uxRaw, uzRaw) || 1;
        const ux = uxRaw / uLen, uz = uzRaw / uLen;
        // Outward right-hand normal
        const rx = -uz, rz = ux;
        // Point near outer edge (~10.4m) for Bézier track tangent anchor
        let anchorPt = last;
        for (const p of pts) {
          if (Math.hypot(p[0] - jx, p[1] - jz) >= 10.2) {
            anchorPt = p;
            break;
          }
        }
        branches.push({
          roadIndex,
          pts,
          anchor: anchorPt,
          ux, uz,
          rx, rz,
          angle: Math.atan2(uz, ux)
        });
      }
    }
    branches.sort((a, b) => a.angle - b.angle);

    // 2. Paint 512x512 Junction Alpha Mask (feathered road arms + flared turning corner fillets + radial cross-fade)
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = maskCanvas.height = texSize;
    const mCtx = maskCanvas.getContext('2d');
    mCtx.clearRect(0, 0, texSize, texSize);

    // Multi-pass soft road arm strokes matching roadEdgeFade (width 7.2m feathered across outer 22%)
    const strokeBranchMask = (widthM, alpha) => {
      mCtx.strokeStyle = `rgba(255,255,255,${alpha})`;
      mCtx.lineWidth = widthM * m2px;
      mCtx.lineCap = 'round';
      mCtx.lineJoin = 'round';
      for (const b of branches) {
        mCtx.beginPath();
        b.pts.forEach(([wx, wz], idx) => {
          const [px, py] = toPx(wx, wz);
          if (idx === 0) mCtx.moveTo(px, py);
          else mCtx.lineTo(px, py);
        });
        mCtx.stroke();
      }
    };
    strokeBranchMask(7.2, 0.18);
    strokeBranchMask(6.4, 0.30);
    strokeBranchMask(5.5, 0.55);
    strokeBranchMask(4.5, 1.0);

    // Flared corner fillets between adjacent branches so turning trucks/tanks widen corners naturally
    const drawFillets = (padRadius, insetScale, alpha) => {
      mCtx.fillStyle = `rgba(255,255,255,${alpha})`;
      const [cx, cy] = toPx(jx, jz);
      mCtx.beginPath();
      mCtx.arc(cx, cy, padRadius * m2px, 0, Math.PI * 2);
      mCtx.fill();

      for (let i = 0; i < branches.length; i++) {
        const b1 = branches[i];
        const b2 = branches[(i + 1) % branches.length];
        let gap = b2.angle - b1.angle;
        if (gap <= 0) gap += Math.PI * 2;
        if (gap > Math.PI * 0.85) continue; // Only flare real turning corners (<153 deg)

        const armD = 7.4;
        const halfW = 2.6 * insetScale;
        const p1x = jx + b1.ux * armD + b1.rx * halfW;
        const p1z = jz + b1.uz * armD + b1.rz * halfW;
        const p2x = jx + b2.ux * armD - b2.rx * halfW;
        const p2z = jz + b2.uz * armD - b2.rz * halfW;
        const midAng = b1.angle + gap * 0.5;
        const ctrlDist = Math.min(4.8, 3.2 / Math.max(0.45, Math.sin(gap * 0.5)));
        const ctrlX = jx + Math.cos(midAng) * ctrlDist * insetScale;
        const ctrlZ = jz + Math.sin(midAng) * ctrlDist * insetScale;

        const [x0, y0] = toPx(jx, jz);
        const [x1, y1] = toPx(p1x, p1z);
        const [xc, yc] = toPx(ctrlX, ctrlZ);
        const [x2, y2] = toPx(p2x, p2z);
        mCtx.beginPath();
        mCtx.moveTo(x0, y0);
        mCtx.lineTo(x1, y1);
        mCtx.quadraticCurveTo(xc, yc, x2, y2);
        mCtx.closePath();
        mCtx.fill();
      }
    };
    drawFillets(5.5, 1.18, 0.22);
    drawFillets(4.9, 1.04, 0.45);
    drawFillets(4.2, 0.90, 1.0);

    // Outer radial cross-fade (opaque inside r <= 7.0m, smoothly fading to 0 at r = 10.6m over full-opaque road ribbon)
    mCtx.globalCompositeOperation = 'destination-in';
    const [mcx, mcy] = toPx(jx, jz);
    const radFade = mCtx.createRadialGradient(mcx, mcy, 6.8 * m2px, mcx, mcy, 10.6 * m2px);
    radFade.addColorStop(0.0, 'rgba(255,255,255,1)');
    radFade.addColorStop(0.45, 'rgba(255,255,255,0.72)');
    radFade.addColorStop(0.80, 'rgba(255,255,255,0.22)');
    radFade.addColorStop(1.0, 'rgba(255,255,255,0)');
    mCtx.fillStyle = radFade;
    mCtx.fillRect(0, 0, texSize, texSize);
    mCtx.globalCompositeOperation = 'source-over';

    // 3. Paint 512x512 Junction Color & Bump Maps (Base soil + churned center + sweeping curved turning ruts)
    const jCanvas = document.createElement('canvas');
    const jBumpCanvas = document.createElement('canvas');
    jCanvas.width = jCanvas.height = texSize;
    jBumpCanvas.width = jBumpCanvas.height = texSize;
    const jCtx = jCanvas.getContext('2d');
    const jbCtx = jBumpCanvas.getContext('2d');

    jCtx.fillStyle = '#9b8668';
    jCtx.fillRect(0, 0, texSize, texSize);
    jbCtx.fillStyle = '#808080';
    jbCtx.fillRect(0, 0, texSize, texSize);

    // Subtle churned compacted dust/gravel wash in the heavily trafficked junction core (zero center grass)
    const coreWash = jCtx.createRadialGradient(mcx, mcy, 0.5 * m2px, mcx, mcy, 6.2 * m2px);
    coreWash.addColorStop(0.0, 'rgba(136, 117, 89, 0.32)');
    coreWash.addColorStop(0.65, 'rgba(145, 126, 97, 0.16)');
    coreWash.addColorStop(1.0, 'rgba(155, 134, 104, 0.0)');
    jCtx.fillStyle = coreWash;
    jCtx.fillRect(0, 0, texSize, texSize);

    // Soft center grass verge ONLY on outer branch approaches (fading out before d < 5.5m)
    for (const b of branches) {
      const outerPts = b.pts.filter(([wx, wz]) => Math.hypot(wx - jx, wz - jz) >= 5.2);
      if (outerPts.length < 2) continue;
      const [sx, sy] = toPx(outerPts[0][0], outerPts[0][1]);
      const [ex, ey] = toPx(outerPts[outerPts.length - 1][0], outerPts[outerPts.length - 1][1]);
      const vergeGrad = jCtx.createLinearGradient(sx, sy, ex, ey);
      vergeGrad.addColorStop(0.0, 'rgba(102, 112, 68, 0.0)');
      vergeGrad.addColorStop(0.45, 'rgba(102, 112, 68, 0.18)');
      vergeGrad.addColorStop(1.0, 'rgba(102, 112, 68, 0.24)');
      jCtx.strokeStyle = vergeGrad;
      jCtx.lineWidth = 1.25 * m2px;
      jCtx.lineCap = 'round';
      jCtx.beginPath();
      outerPts.forEach(([wx, wz], idx) => {
        const [px, py] = toPx(wx, wz);
        if (idx === 0) jCtx.moveTo(px, py);
        else jCtx.lineTo(px, py);
      });
      jCtx.stroke();
    }

    // Helper: draw one soft double-layered wheel rut along a quadratic curve (plus matching bump depression)
    const drawCurvedRut = (p0, ctrl, p1, strength, withCleats = false) => {
      const [x0, y0] = toPx(p0[0], p0[1]);
      const [xc, yc] = toPx(ctrl[0], ctrl[1]);
      const [x1, y1] = toPx(p1[0], p1[1]);

      // Wide soft compacted shoulder
      jCtx.strokeStyle = `rgba(92, 76, 56, ${(strength * 0.48).toFixed(3)})`;
      jCtx.lineWidth = 1.45 * m2px;
      jCtx.lineCap = 'round';
      jCtx.beginPath();
      jCtx.moveTo(x0, y0);
      jCtx.quadraticCurveTo(xc, yc, x1, y1);
      jCtx.stroke();

      // Core wheel/track rut
      jCtx.strokeStyle = `rgba(70, 56, 40, ${strength.toFixed(3)})`;
      jCtx.lineWidth = 0.72 * m2px;
      jCtx.beginPath();
      jCtx.moveTo(x0, y0);
      jCtx.quadraticCurveTo(xc, yc, x1, y1);
      jCtx.stroke();

      // Recessed rut groove in bump map
      jbCtx.strokeStyle = `rgba(68, 68, 68, ${(strength * 1.15).toFixed(3)})`;
      jbCtx.lineWidth = 0.85 * m2px;
      jbCtx.lineCap = 'round';
      jbCtx.beginPath();
      jbCtx.moveTo(x0, y0);
      jbCtx.quadraticCurveTo(xc, yc, x1, y1);
      jbCtx.stroke();

      // Faint armored tank tread impressions along heavy routes
      if (withCleats) {
        jCtx.strokeStyle = `rgba(54, 43, 30, ${(strength * 0.42).toFixed(3)})`;
        jCtx.lineWidth = 0.14 * m2px;
        const cleatCount = 26;
        for (let k = 1; k < cleatCount; k++) {
          const t = k / cleatCount;
          const it = 1 - t;
          const qx = it * it * x0 + 2 * it * t * xc + t * t * x1;
          const qy = it * it * y0 + 2 * it * t * yc + t * t * y1;
          const dtx = 2 * it * (xc - x0) + 2 * t * (x1 - xc);
          const dty = 2 * it * (yc - y0) + 2 * t * (y1 - yc);
          const dLen = Math.hypot(dtx, dty) || 1;
          const nx = (-dty / dLen) * 0.30 * m2px;
          const ny = (dtx / dLen) * 0.30 * m2px;
          jCtx.beginPath();
          jCtx.moveTo(qx - nx, qy - ny);
          jCtx.lineTo(qx + nx, qy + ny);
          jCtx.stroke();
        }
      }
    };

    // Draw sweeping curved wheel tracks between EVERY pair of branches (through-routes + turning arcs)
    for (let i = 0; i < branches.length; i++) {
      for (let j = i + 1; j < branches.length; j++) {
        const bA = branches[i];
        const bB = branches[j];
        const dot = bA.ux * bB.ux + bA.uz * bB.uz;
        const isThrough = (bA.roadIndex === bB.roadIndex) || dot < -0.58;
        const isTankRoute = (bA.roadIndex === 1 || bB.roadIndex === 1 || bA.roadIndex === 2 || bB.roadIndex === 2);
        const isThreeWayBranch = branches.length === 3 && !isThrough;
        const strength = isThrough
          ? (isTankRoute ? 0.27 : 0.24)
          : (isThreeWayBranch ? 0.22 : 0.18);

        for (const side of [-1, 1]) {
          // Track continuity rule: +side*A.right always pairs with -side*B.right
          const pA = [bA.anchor[0] + side * TRACK_GAUGE_HALF * bA.rx, bA.anchor[1] + side * TRACK_GAUGE_HALF * bA.rz];
          const pB = [bB.anchor[0] - side * TRACK_GAUGE_HALF * bB.rx, bB.anchor[1] - side * TRACK_GAUGE_HALF * bB.rz];

          // Compute exact tangent-ray intersection for seamless 0-deg entry/exit transition
          const cross = bA.ux * bB.uz - bA.uz * bB.ux;
          let ctrl;
          if (Math.abs(cross) > 0.22) {
            const dx = pB[0] - pA[0], dz = pB[1] - pA[1];
            const s = (dx * (-bB.uz) - dz * (-bB.ux)) / cross;
            let cxW = pA[0] - s * bA.ux;
            let czW = pA[1] - s * bA.uz;
            // Clamp overly wild control points on acute Y-angles
            const cDist = Math.hypot(cxW - jx, czW - jz);
            if (cDist > 5.4) {
              cxW = jx + ((cxW - jx) / cDist) * 5.4;
              czW = jz + ((czW - jz) / cDist) * 5.4;
            }
            ctrl = [cxW, czW];
          } else {
            ctrl = [(pA[0] + pB[0]) * 0.5, (pA[1] + pB[1]) * 0.5];
          }
          drawCurvedRut(pA, ctrl, pB, strength, isThrough && isTankRoute);
        }
      }
    }

    // Subtle compacted dust wash in dead-center so crossing tracks blend organically into churned dirt
    const blendWash = jCtx.createRadialGradient(mcx, mcy, 0.2 * m2px, mcx, mcy, 3.6 * m2px);
    blendWash.addColorStop(0.0, 'rgba(138, 120, 92, 0.24)');
    blendWash.addColorStop(0.65, 'rgba(138, 120, 92, 0.10)');
    blendWash.addColorStop(1.0, 'rgba(138, 120, 92, 0.0)');
    jCtx.fillStyle = blendWash;
    jCtx.fillRect(0, 0, texSize, texSize);

    // Scatter matching organic gravel & soil pebbles across the junction apron
    for (let i = 0; i < 6500; i++) {
      const px = detailRandom() * texSize, py = detailRandom() * texSize;
      const pr = 0.55 + detailRandom() * 1.9;
      jCtx.fillStyle = i % 3 === 0 ? 'rgba(214, 198, 170, 0.28)' : 'rgba(68, 57, 43, 0.24)';
      jCtx.beginPath();
      jCtx.arc(px, py, pr, 0, Math.PI * 2);
      jCtx.fill();
      jbCtx.fillStyle = i % 2 ? 'rgba(215,215,215,0.34)' : 'rgba(50,50,50,0.34)';
      jbCtx.beginPath();
      jbCtx.arc(px, py, pr, 0, Math.PI * 2);
      jbCtx.fill();
    }

    // Apply soft flared alpha mask to junction color canvas
    jCtx.globalCompositeOperation = 'destination-in';
    jCtx.drawImage(maskCanvas, 0, 0);
    jCtx.globalCompositeOperation = 'source-over';

    const jTex = new THREE.CanvasTexture(jCanvas);
    jTex.encoding = THREE.sRGBEncoding;
    jTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const jBump = new THREE.CanvasTexture(jBumpCanvas);
    jBump.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());

    // 4. Build Terrain-Conforming Junction Apron Mesh
    const jGeo = new THREE.PlaneGeometry(size, size, 32, 32);
    jGeo.rotateX(-Math.PI / 2);
    const jPos = jGeo.attributes.position;
    const jColors = [];
    for (let i = 0; i < jPos.count; i++) {
      const px = jx + jPos.getX(i);
      const pz = jz + jPos.getZ(i);
      jPos.setXYZ(i, px, wildernessRoadBaseHeight(px, pz) + WILDERNESS_ROAD_LIFT + 0.042, pz);
      const gravel = .055 * Math.sin(px * 7.3 + pz * 6.1) * Math.cos(pz * 3.9 - px * 4.1);
      const damp = .04 * Math.sin(px * .62 + pz * .44);
      const val = 0.94 + gravel + damp;
      jColors.push(val, val, val);
    }
    jGeo.setAttribute('color', new THREE.Float32BufferAttribute(jColors, 3));
    jGeo.computeVertexNormals();

    const jMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: jTex,
      bumpMap: jBump,
      bumpScale: 0.08,
      roughness: 0.94,
      metalness: 0.03,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    });
    wildernessJunctionMats.push(jMat);
    const jMesh = new THREE.Mesh(jGeo, jMat);
    jMesh.receiveShadow = true;
    jMesh.renderOrder = 6;
    group.add(jMesh);
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
    return mesh;
  }

  const broadleaf = [], conifers = [], sparseTrees = [];
  for (const tree of trees) {
    const [x, y, z] = tree;
    const zone = Math.sin(x * .026 + z * .019) + .38 * Math.cos(z * .049 - x * .022);
    if (y > 13 && zone > .24) conifers.push(tree);
    else if (zone < -.42) sparseTrees.push(tree);
    else broadleaf.push(tree);
  }

  // Bark Texture (256x512) with deep vertical furrow lines, ridges & moss patches
  const barkCanvas = document.createElement('canvas');
  barkCanvas.width = 256;
  barkCanvas.height = 512;
  const bark = barkCanvas.getContext('2d');
  bark.fillStyle = '#584434';
  bark.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 420; i++) {
    const x = (i * 67) % 256, y = (i * 109) % 512;
    const length = 32 + (i % 78);
    bark.strokeStyle = i % 3 ? 'rgba(26,18,13,0.52)' : 'rgba(178,145,108,0.44)';
    bark.lineWidth = 1.4 + (i % 4);
    for (const wrap of [-512, 0, 512]) {
      bark.beginPath();
      bark.moveTo(x, y + wrap);
      bark.quadraticCurveTo(x + Math.sin(i) * 12, y + wrap + length * .55, x + Math.cos(i) * 6, y + wrap + length);
      bark.stroke();
    }
  }
  for (let i = 0; i < 96; i++) {
    bark.fillStyle = i % 3 ? '#9a907a44' : '#4a613f5c';
    bark.beginPath();
    bark.ellipse((i * 37) % 256, (i * 59) % 512, 2.2 + (i % 5), 3.8 + (i % 10), .12, 0, Math.PI * 2);
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
  const broadTrunk = new THREE.CylinderGeometry(.12, .27, 1, 10);
  broadTrunk.translate(0, 0.5, 0);
  const coniferTrunk = new THREE.CylinderGeometry(.06, .21, 1, 9);
  coniferTrunk.translate(0, 0.5, 0);
  const sparseTrunk = new THREE.CylinderGeometry(.07, .19, 1, 9);
  sparseTrunk.translate(0, 0.5, 0);

  const broadTrunkMesh = scatter(broadleaf, broadTrunk, 0xcec3ae, 0, 1.0, 3.8, true, null, '樹幹', barkMap, 'trunk');
  const coniferTrunkMesh = scatter(conifers, coniferTrunk, 0xaf9c83, 0, 1.0, 5.0, true, null, '樹幹', barkMap, 'trunk');
  const sparseTrunkMesh = scatter(sparseTrees, sparseTrunk, 0xd5c5ab, 0, 1.0, 4.4, true, null, '樹幹', barkMap, 'trunk');

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

  // High-res 512x512 botanical ovate leaf canvas texture
  const leafCanvas = document.createElement('canvas');
  leafCanvas.width = leafCanvas.height = 512;
  const leaves = leafCanvas.getContext('2d');
  for (let i = 0; i < 2200; i++) {
    const angle = i * 2.39996, radius = Math.sqrt(random());
    const x = 256 + Math.cos(angle) * radius * 234, y = 256 + Math.sin(angle) * radius * 212;
    if (radius > .82 && Math.sin(angle * 8 + radius * 10) > .22) continue;
    const tone = 26 + Math.floor(random() * 38);
    const hue = 84 + random() * 28;
    leaves.fillStyle = `hsl(${hue} 40% ${tone}%)`;
    leaves.beginPath();
    leaves.ellipse(x, y, 5.5 + random() * 8.5, 2.8 + random() * 5.2, angle + random() * 0.45, 0, Math.PI * 2);
    leaves.fill();
    if (i % 3 === 0) {
      leaves.strokeStyle = `hsl(${hue + 4} 44% ${tone + 15}%)`;
      leaves.lineWidth = 1.2;
      leaves.beginPath();
      leaves.moveTo(x - 4, y - 2);
      leaves.lineTo(x + 4, y + 2);
      leaves.stroke();
    }
  }
  const leafMap = new THREE.CanvasTexture(leafCanvas);
  leafMap.encoding = THREE.sRGBEncoding;

  // High-res 512x512 alpine needle canvas texture
  const needleCanvas = document.createElement('canvas');
  needleCanvas.width = needleCanvas.height = 512;
  const needles = needleCanvas.getContext('2d');
  for (let tier = 0; tier < 24; tier++) {
    const y = 40 + tier * 18.5;
    const extent = 26 + tier * 9.5;
    for (const side of [-1, 1]) {
      for (let j = 0; j < 28; j++) {
        const reach = extent * (.35 + j / 34);
        needles.strokeStyle = ['#25361b', '#364b28', '#4f6839', '#6b864c'][j % 4];
        needles.lineWidth = 2.0 + (j % 3);
        needles.beginPath();
        needles.moveTo(256 + side * j * 1.1, y - 6);
        needles.quadraticCurveTo(256 + side * reach * .62, y + 10, 256 + side * reach, y + 28 + Math.sin(j) * 11);
        needles.stroke();
      }
    }
  }
  const needleMap = new THREE.CanvasTexture(needleCanvas);
  needleMap.encoding = THREE.sRGBEncoding;

  // Procedural Granite & Mossy Rock Texture (256x256)
  const rockCanvas = document.createElement('canvas');
  rockCanvas.width = rockCanvas.height = 256;
  const rTexCtx = rockCanvas.getContext('2d');
  rTexCtx.fillStyle = '#756f64';
  rTexCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1800; i++) {
    const rx = detailRandom() * 256, ry = detailRandom() * 256;
    const rw = 1.2 + detailRandom() * 6.5, rh = 0.8 + detailRandom() * 3.8;
    rTexCtx.fillStyle = i % 7 === 0 ? 'rgba(72, 88, 52, 0.32)' : (i % 2 ? 'rgba(42, 40, 36, 0.35)' : 'rgba(175, 168, 152, 0.28)');
    rTexCtx.beginPath();
    rTexCtx.ellipse(rx, ry, rw, rh, detailRandom() * Math.PI, 0, Math.PI * 2);
    rTexCtx.fill();
  }
  const rockMap = new THREE.CanvasTexture(rockCanvas);
  rockMap.encoding = THREE.sRGBEncoding;

  // 3D Volumetric Canopies with Wind Sway
  const broadCanopyGeo = createVolumetricCanopyGeometry();
  const coniferCanopyGeo = createConiferFoliageGeometry();
  const shrubGeo = createShrubFoliageGeometry();

  const broadCanopyMesh = scatter(broadleaf, broadCanopyGeo, 0xd8e8bf, 3.2, 4.4, 3.9, true, leafMap, '樹冠', null, 'canopy');
  const lobeCanopyMesh = scatter(lobes, broadCanopyGeo, 0xe4f0cb, 3.4, 3.1, 2.7, false, leafMap, '樹冠', null, 'canopy');
  const coniferCanopyMesh = scatter(conifers, coniferCanopyGeo, 0xc2d1a8, 1.6, 3.8, 5.2, true, needleMap, '針葉樹冠', null, 'canopy');
  const sparseCanopyMesh = scatter(sparseTrees, broadCanopyGeo, 0xbfcda0, 2.8, 3.6, 3.2, true, leafMap, '疏葉樹冠', null, 'canopy');

  // Realistic Weathered Mountain Boulders & Companion Scree Clusters
  function clearOfCanopy(x, z, margin) {
    return !trees.some(([tx, , tz, treeScale]) => {
      const radius = 3.7 * treeScale + margin;
      return (x - tx) ** 2 + (z - tz) ** 2 < radius ** 2;
    });
  }
  const groundStones = stones.filter(([x, , z, scale]) => clearOfCanopy(x, z, .65 * scale));
  const screeStones = [];
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
    // Add 2 smaller fallen scree rocks beside each main boulder
    for (let sIdx = 0; sIdx < 2; sIdx++) {
      const ang = random() * Math.PI * 2;
      const dist = (0.85 + random() * 1.15) * scale;
      const sx = x + Math.cos(ang) * dist;
      const sz = z + Math.sin(ang) * dist;
      const sScale = scale * (0.32 + random() * 0.25);
      const sy = wildernessMeshHeight(sx, sz) + (rockBase - 0.10) * sScale;
      screeStones.push([sx, sy, sz, sScale]);
    }
  }
  scatter(groundStones, rock, 0x767064, 0, 0.95, 0.58, true, null, '岩石', rockMap);
  scatter(screeStones, rock, 0x6c665a, 0, 0.92, 0.52, false, null, null, rockMap);
  const shrubMesh = scatter(shrubs, shrubGeo, 0x768f56, 0.12, 1.4, 0.95, false, leafMap, '灌木', null, 'canopy');

  // Register destructible wilderness trees & shrubs for blast damage effects
  wildernessVegetationState.trees.length = 0;
  wildernessVegetationState.shrubs.length = 0;
  broadleaf.forEach(([x, y, z, scale], idx) => {
    wildernessVegetationState.trees.push({
      x, y, z, scale, idx,
      trunkMesh: broadTrunkMesh,
      canopyMesh: broadCanopyMesh,
      branchMesh,
      lobeMesh: lobeCanopyMesh,
      lobeBaseIdx: idx * 3,
      damaged: 0
    });
  });
  conifers.forEach(([x, y, z, scale], idx) => {
    wildernessVegetationState.trees.push({
      x, y, z, scale, idx,
      trunkMesh: coniferTrunkMesh,
      canopyMesh: coniferCanopyMesh,
      damaged: 0
    });
  });
  sparseTrees.forEach(([x, y, z, scale], idx) => {
    wildernessVegetationState.trees.push({
      x, y, z, scale, idx,
      trunkMesh: sparseTrunkMesh,
      canopyMesh: sparseCanopyMesh,
      damaged: 0
    });
  });
  shrubs.forEach(([x, y, z, scale], idx) => {
    wildernessVegetationState.shrubs.push({
      x, y, z, scale, idx,
      mesh: shrubMesh,
      damaged: 0
    });
  });

  yield '配置野草與路肩碎石';

  const grass = new THREE.BufferGeometry();
  const blades = [];
  const bladeCols = [];
  for (let i = 0; i < 7; i++) {
    const angle = i * 2.39996, dx = Math.cos(angle), dz = Math.sin(angle);
    const spread = .045+(i%4)*.035, height = .36+(i%5)*.11;
    const x = dx*spread, z = dz*spread;
    const baseL = [x-dz*.042,0,z+dx*.042], baseR = [x+dz*.042,0,z-dx*.042];
    const midL = [x+dx*.12-dz*.027,height*.61,z+dz*.12+dx*.027];
    const midR = [x+dx*.12+dz*.027,height*.61,z+dz*.12-dx*.027];
    const tip = [x+dx*.32,height,z+dz*.32];
    blades.push(...baseL,...baseR,...midL,...baseR,...midR,...midL,...midL,...midR,...tip);
    const cRoot = [0.42, 0.48, 0.30], cMid = [0.78, 0.84, 0.62], cTip = [1.0, 1.0, 0.88];
    bladeCols.push(...cRoot,...cRoot,...cMid,...cRoot,...cMid,...cMid,...cMid,...cMid,...cTip);
  }
  grass.setAttribute('position',new THREE.Float32BufferAttribute(blades,3));
  grass.setAttribute('color',new THREE.Float32BufferAttribute(bladeCols,3));
  grass.computeVertexNormals();

  const grasses = [], gravelPatches = [];
  function detailClear(x,z) {
    return !wildernessSites.some(site => Math.hypot(x-site.x,z-site.z)<site.radius+1);
  }
  for (const [x,,z,scale] of shrubs) {
    for (let i = 0; i < 6; i++) {
      const angle = i * Math.PI/3 + random();
      const px = x + Math.cos(angle)*(1.0+random()*2.4);
      const pz = z + Math.sin(angle)*(1.0+random()*2.4);
      if (detailClear(px,pz) && wildernessRoadDistance(px,pz)>3.9) {
        grasses.push([px,wildernessMeshHeight(px,pz),pz,scale]);
      }
    }
  }
  for (let i = 0; i < 8200; i++) {
    if (i%256 === 0) yield;
    const x = (random()-.5)*510, z = 27-random()*350;
    if (!detailClear(x,z)) continue;
    const roadDistance = wildernessRoadDistance(x,z);
    const y = wildernessMeshHeight(x,z);
    if (roadDistance > 3.8 && roadDistance < 10.5) {
      if (i % 2 === 0) gravelPatches.push([x,y,z,.18+random()*.30]);
      if (roadDistance>4.3 && i%2===0) grasses.push([x,y,z,.55+random()*.52]);
    } else if (roadDistance>9 && Math.sin(x*.11+z*.08)+Math.cos(z*.19)>0.42) {
      grasses.push([x,y,z,.52+random()*.68]);
      if (i%6===0) gravelPatches.push([x,y,z,.12+random()*.30]);
    }
  }

  const grassMaterial = new THREE.MeshStandardMaterial({side:THREE.DoubleSide,roughness:0.96,vertexColors:true});
  applyTreeWindShader(grassMaterial, true);
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
    if (h >= 0.45 || (y > 0.5 && w > 1.5 && d > 1.5)) {
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
  tacticalState.aaSites = [];
  tacticalState.aaProjectiles = [];
  tacticalState.aaFlakBursts = [];
  tacticalState.rwrLevel = 'none';
  tacticalState.rwrBeepTimer = 0;

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

  // Target 1: 巡邏重型戰車 Alpha
  const tankA = createTankMesh(0x3d4d35, '21');
  tankA.root.position.set(0, wildernessHeight(0,-110), -110);
  tankA.root.rotation.y = -Math.PI / 2;
  wildernessGroup.add(tankA.root);
  const targetTankA = {
    id: 'tank_alpha',
    type: 'tank',
    name: '巡邏戰車 Alpha',
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
    trackDamaged: false,
    spawnPos: tankA.root.position.clone(),
    spawnDir: 1
  };
  tacticalState.targets.push(targetTankA);
  tacticalState.tanks.push(targetTankA);
  alignTankToRoad(targetTankA);
  updateTankThermalSignature(targetTankA,0);

  // Target 2: 巡邏重型戰車 Bravo
  const tankB = createTankMesh(0x4b4336, '22');
  tankB.root.position.set(90, wildernessHeight(90,-195), -195);
  tankB.root.rotation.y = Math.PI / 2;
  wildernessGroup.add(tankB.root);
  const targetTankB = {
    id: 'tank_bravo',
    type: 'tank',
    name: '重裝戰車 Bravo',
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
    trackDamaged: false,
    spawnPos: tankB.root.position.clone(),
    spawnDir: -1
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

  // 4. Ground Infantry Rifle Sentry Posts (Flat Pads Defending Radar Station & Ammo Depot)
  const aaRadarMesh = createRifleSentryMesh('radar');
  const aaRadarX = -107.5;
  const aaRadarZ = -174.5;
  aaRadarMesh.root.position.set(aaRadarX, wildernessHeight(aaRadarX, aaRadarZ), aaRadarZ);
  wildernessGroup.add(aaRadarMesh.root);
  tacticalState.aaSites.push({
    id: 'aa_radar',
    name: '雷達站外圍守軍',
    variant: 'rifle_squad',
    mesh: aaRadarMesh.root,
    yawGroup: aaRadarMesh.yawGroup,
    pitchGroup: aaRadarMesh.pitchGroup,
    muzzleFlashes: aaRadarMesh.muzzleFlashes,
    damageGroup: aaRadarMesh.damageGroup,
    soldiersGroup: aaRadarMesh.soldiersGroup,
    soldierUnits: aaRadarMesh.soldierUnits,
    armorMat: aaRadarMesh.armorMat,
    pos: aaRadarMesh.root.position,
    radius: 2.8,
    hp: 25,
    maxHp: 25,
    destroyed: false,
    linkedRadar: targetRadar,
    linkedDepot: null,
    lockTimer: 0,
    fireCooldown: 0,
    burstLeft: 0,
    burstInterval: 0,
    barrelIndex: 0,
    flashTimer: 0,
    recoilTimer: 0
  });

  const aaDepotMesh = createRifleSentryMesh('depot');
  const aaDepotX = 33.5;
  const aaDepotZ = -234.5;
  aaDepotMesh.root.position.set(aaDepotX, wildernessHeight(aaDepotX, aaDepotZ), aaDepotZ);
  wildernessGroup.add(aaDepotMesh.root);
  tacticalState.aaSites.push({
    id: 'aa_depot',
    name: '彈藥庫外圍守軍',
    variant: 'rifle_squad',
    mesh: aaDepotMesh.root,
    yawGroup: aaDepotMesh.yawGroup,
    pitchGroup: aaDepotMesh.pitchGroup,
    muzzleFlashes: aaDepotMesh.muzzleFlashes,
    damageGroup: aaDepotMesh.damageGroup,
    soldiersGroup: aaDepotMesh.soldiersGroup,
    soldierUnits: aaDepotMesh.soldierUnits,
    armorMat: aaDepotMesh.armorMat,
    pos: aaDepotMesh.root.position,
    radius: 2.8,
    hp: 25,
    maxHp: 25,
    destroyed: false,
    linkedRadar: null,
    linkedDepot: targetAmmo,
    lockTimer: 0,
    fireCooldown: 0,
    burstLeft: 0,
    burstInterval: 0,
    barrelIndex: 0,
    flashTimer: 0,
    recoilTimer: 0
  });

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

// 6S Lithium-Polymer (LiPo) Open-Circuit Voltage Discharge Curve
function computeOpenCircuitVoltage6S(soc) {
  soc = THREE.MathUtils.clamp(soc, 0, 1);
  if (soc > 0.80) {
    // 80% to 100%: 23.40V to 25.20V (upper plateau, ~3.90V to 4.20V/cell)
    const t = (soc - 0.80) / 0.20;
    return 23.40 + Math.pow(t, 0.85) * 1.80;
  } else if (soc > 0.20) {
    // 20% to 80%: 21.60V to 23.40V (flat linear discharge plateau, ~3.60V to 3.90V/cell)
    const t = (soc - 0.20) / 0.60;
    return 21.60 + t * 1.80;
  } else {
    // 0% to 20%: 19.50V to 21.60V (knee cliff drop, ~3.25V to 3.60V/cell)
    const t = soc / 0.20;
    return 19.50 + Math.pow(t, 0.65) * 2.10;
  }
}

function resetDroneBattery() {
  if (!drone.battery) return;
  drone.battery.remainingMah = drone.battery.capacityMah;
  drone.battery.percent = 100;
  drone.battery.openCircuitVoltage = 25.20;
  drone.battery.voltage = 25.20;
  drone.battery.currentAmps = 0.8;
  drone.battery.lowBattWarned = false;
  drone.battery.critBattWarned = false;
  drone.battery.emptyWarned = false;
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
  const dragCoeff = 0.0016 * (w.dragMult || 1.0);
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

  const magX = 0;
  const magZ = 0;

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
  pushGCSDamageFeed(`已投彈・82mm 迫擊砲彈脫離掛架（剩餘 ${tacticalState.bombsRemaining} 枚）`, 'info');
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
        if (triggerExplosionAt(b.pos.x, Math.max(0.1, b.pos.y), b.pos.z, hitTarget, b.vel)) {
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

function triggerExplosionAt(x, y, z, directHitTarget, impactVel = null) {
  audioEngine.playExplosion(directHitTarget ? 1.25 : 0.9);
  createBlastEffect(x,y,z,directHitTarget ? 1.65 : 1.35);
  if (!directHitTarget) {
    spawnSoilEjecta(x, y, z, impactVel);
  }

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
  let hitAnyStructure = false;
  tacticalState.targets.forEach((t) => {
    if (t.destroyed) return;
    const dist = Math.hypot(x - t.pos.x, z - t.pos.z);
    if (dist <= t.radius + 1.5 || t === directHitTarget) {
      hitAnyStructure = true;
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
        if (!isDirectHullHit) {
          spawnSoilEjecta(x, y, z, impactVel);
        }

        if (willDestroy) {
          destroyTarget(t, x, y, z);
          pushGCSDamageFeed(
            t.cookOff ? `擊毀目標・${t.name} 彈藥殉爆徹底癱瘓` : `擊毀目標・${t.name} 頂甲貫穿起火焚毀`,
            'ok'
          );
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
          pushGCSDamageFeed(`命中目標・${t.name} 履帶與側甲受創（完整度 ${t.hp}%）`, 'info');
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
          pushGCSDamageFeed(`擊毀目標・${t.name} 徹底摧毀`, 'ok');
        } else {
          t.damagedSmoke = true;
          addWreckScorchAt(x, z, 2.8);
          spawnSoilEjecta(x, y, z, impactVel);
          pushGCSDamageFeed(`命中目標・${t.name} 結構受損（完整度 ${t.hp}%）`, 'info');
        }
      }
    }
  });

  tacticalState.aaSites.forEach((aa) => {
    if (aa.destroyed) return;
    const dist = Math.hypot(x - aa.pos.x, z - aa.pos.z);
    if (dist <= aa.radius + 9.0 && aa.variant === 'rifle_squad') {
      aa.suppressedTimer = Math.max(aa.suppressedTimer || 0, dist <= aa.radius + 3.0 ? 4.5 : 3.2);
      aa.burstLeft = 0;
      aa.lockTimer = 0;
    }
    if (dist <= aa.radius + 2.4) {
      hitAnyStructure = true;
      const dmg = dist <= 2.8 ? 50 : Math.max(25, Math.round((1 - dist / (aa.radius + 2.6)) * 55));
      aa.hp = Math.max(0, aa.hp - dmg);
      if (dist <= 3.2) directHit = true;
      if (aa.hp <= 0) {
        destroyAAEmplacement(aa);
        pushGCSDamageFeed(`擊毀目標・${aa.name} 防空陣地癱瘓`, 'ok');
      } else {
        const aaPct = Math.round((aa.hp / aa.maxHp) * 100);
        pushGCSDamageFeed(`命中目標・${aa.name} 掩體受損（完整度 ${aaPct}%）`, 'info');
        showAnnouncement('AAA SUPPRESSED', `命中【${aa.name}】防空掩體！(殘餘 ${aaPct}%)`, '#f59e0b');
      }
    }
  });

  checkTacticalMissionProgress();
  damageWildernessVegetationAt(x, z);
  if (!hitAnyStructure) {
    addGroundShellCrater(x, z, impactVel);
  }
  return directHit;
}

function destroyAAEmplacement(aa) {
  if (!aa || aa.destroyed) return;
  aa.destroyed = true;
  aa.burstLeft = 0;
  aa.lockTimer = 0;
  if (aa.muzzleFlashes) aa.muzzleFlashes.forEach((mf) => { mf.visible = false; });
  if (aa.soldiersGroup) aa.soldiersGroup.visible = false;
  if (aa.armorMat) {
    aa.armorMat.color.setHex(0x23201e);
    aa.armorMat.roughness = 0.96;
  }
  if (aa.yawGroup) aa.yawGroup.rotation.z = (Math.random() > 0.5 ? 1 : -1) * 0.24;
  if (aa.pitchGroup) aa.pitchGroup.rotation.x = -0.35;
  addWreckScorchAt(aa.pos.x, aa.pos.z, 3.0);
  createBlastEffect(aa.pos.x, aa.pos.y + 0.8, aa.pos.z, 1.25);
  showAnnouncement(
    aa.variant === 'rifle_squad' ? 'SENTRY NEUTRALIZED!' : 'AAA NEUTRALIZED!',
    aa.variant === 'rifle_squad' ? `守軍火力壓制！【${aa.name}】已清除！` : `防空火力拔除！【${aa.name}】已癱瘓！`,
    '#10b981'
  );
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

let sharedSoilClodGeo = null;
let sharedSoilDarkMat = null;
let sharedSoilBrownMat = null;

function spawnSoilEjecta(wx, wy, wz, impactVel = null) {
  if (!wildernessGroup) return;
  if (!sharedSoilClodGeo) {
    sharedSoilClodGeo = new THREE.DodecahedronGeometry(0.095, 0);
    sharedSoilDarkMat = new THREE.MeshStandardMaterial({ color: 0x261e16, roughness: 0.97, metalness: 0.02 });
    sharedSoilBrownMat = new THREE.MeshStandardMaterial({ color: 0x5c4730, roughness: 0.95, metalness: 0.02 });
  }

  // Compute local terrain normal & slope gradient
  const dhdx = (wildernessHeight(wx + 0.8, wz) - wildernessHeight(wx - 0.8, wz)) / 1.6;
  const dhdz = (wildernessHeight(wx, wz + 0.8) - wildernessHeight(wx, wz - 0.8)) / 1.6;
  const normal = new THREE.Vector3(-dhdx, 1.0, -dhdz).normalize();

  const vx = impactVel ? impactVel.x : 0;
  const vy = impactVel ? impactVel.y : -24;
  const vz = impactVel ? impactVel.z : 0;
  const speed = Math.hypot(vx, vy, vz);
  // Calibrated for 82mm mortar (~450g HE filler): soil clods peak at ~2.0m - 6.2m height
  const energyMult = THREE.MathUtils.clamp(0.80 + (speed / 45.0) * 0.32, 0.80, 1.15);

  // Bias ejecta cone along terrain normal + subtle forward momentum + downhill slope
  const biasX = vx * 0.14 - dhdx * 2.4;
  const biasZ = vz * 0.14 - dhdz * 2.4;
  const groundY = wildernessRoadBaseHeight(wx, wz);

  const clodCount = 20;
  for (let i = 0; i < clodCount; i++) {
    const isOuterSpray = i % 3 === 0;
    const mat = i % 2 === 0 ? sharedSoilDarkMat : sharedSoilBrownMat;
    const clod = new THREE.Mesh(sharedSoilClodGeo, mat);
    const s = (0.55 + Math.random() * 0.95) * (isOuterSpray ? 0.82 : 1.05);
    clod.scale.set(s * (0.8 + Math.random() * 0.55), s * (0.55 + Math.random() * 0.45), s * (0.8 + Math.random() * 0.5));
    const ang = (i / clodCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.45;
    const startR = 0.22 + Math.random() * 0.65;
    clod.position.set(wx + Math.cos(ang) * startR, Math.max(groundY + 0.16, wy + 0.12), wz + Math.sin(ang) * startR);
    clod.rotation.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
    clod.castShadow = true;
    wildernessGroup.add(clod);

    const outSpeed = (isOuterSpray ? 4.2 + Math.random() * 3.8 : 1.8 + Math.random() * 2.8) * energyMult;
    const upSpeed = (isOuterSpray ? 3.8 + Math.random() * 2.8 : 6.2 + Math.random() * 3.8) * energyMult;
    const velocity = new THREE.Vector3(
      Math.cos(ang) * outSpeed + normal.x * upSpeed * 0.52 + biasX * 0.40,
      normal.y * upSpeed,
      Math.sin(ang) * outSpeed + normal.z * upSpeed * 0.52 + biasZ * 0.40
    );
    const spin = new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
    tacticalState.debris.push({
      mesh: clod,
      velocity,
      spin,
      clearance: 0.045 * s,
      settled: false,
      ownsResources: false,
      ownsGeometry: false
    });
  }
}

let sharedLeafChipGeo = null;
let sharedWoodSplinterGeo = null;
let sharedLeafGreenMat = null;
let sharedLeafCharMat = null;
let sharedWoodSplinterMat = null;

function spawnVegetationBlastDebris(tx, ty, tz, blastX, blastZ, severe) {
  if (!wildernessGroup) return;
  if (!sharedLeafChipGeo) {
    sharedLeafChipGeo = new THREE.PlaneGeometry(0.24, 0.14);
    sharedWoodSplinterGeo = new THREE.BoxGeometry(0.08, 0.55, 0.08);
    sharedLeafGreenMat = new THREE.MeshStandardMaterial({ color: 0x4c6e2f, roughness: 0.9, side: THREE.DoubleSide });
    sharedLeafCharMat = new THREE.MeshStandardMaterial({ color: 0x2a241b, roughness: 0.95, side: THREE.DoubleSide });
    sharedWoodSplinterMat = new THREE.MeshStandardMaterial({ color: 0x4a3828, roughness: 0.94 });
  }
  const dirX = tx - blastX;
  const dirZ = tz - blastZ;
  const dirLen = Math.hypot(dirX, dirZ) || 1;
  const nx = dirX / dirLen, nz = dirZ / dirLen;

  const leafCount = severe ? 14 : 8;
  for (let i = 0; i < leafCount; i++) {
    const leaf = new THREE.Mesh(sharedLeafChipGeo, i % 3 === 0 ? sharedLeafCharMat : sharedLeafGreenMat);
    const s = 0.7 + Math.random() * 0.9;
    leaf.scale.setScalar(s);
    leaf.position.set(tx + (Math.random() - 0.5) * 1.6, ty + 1.4 + Math.random() * 2.2, tz + (Math.random() - 0.5) * 1.6);
    leaf.rotation.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
    wildernessGroup.add(leaf);
    const spd = 2.5 + Math.random() * 4.5;
    tacticalState.debris.push({
      mesh: leaf,
      velocity: new THREE.Vector3(nx * spd + (Math.random() - 0.5) * 3.5, 2.2 + Math.random() * 4.2, nz * spd + (Math.random() - 0.5) * 3.5),
      spin: new THREE.Vector3((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18),
      clearance: 0.03,
      settled: false,
      ownsResources: false,
      ownsGeometry: false
    });
  }

  if (severe) {
    for (let i = 0; i < 6; i++) {
      const splinter = new THREE.Mesh(sharedWoodSplinterGeo, sharedWoodSplinterMat);
      const s = 0.7 + Math.random() * 0.9;
      splinter.scale.set(s, s * (0.8 + Math.random() * 0.6), s);
      splinter.position.set(tx + (Math.random() - 0.5) * 0.8, ty + 0.8 + Math.random() * 1.8, tz + (Math.random() - 0.5) * 0.8);
      splinter.castShadow = true;
      wildernessGroup.add(splinter);
      const spd = 3.0 + Math.random() * 4.8;
      tacticalState.debris.push({
        mesh: splinter,
        velocity: new THREE.Vector3(nx * spd + (Math.random() - 0.5) * 3.2, 3.8 + Math.random() * 4.5, nz * spd + (Math.random() - 0.5) * 3.2),
        spin: new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14),
        clearance: 0.05,
        settled: false,
        ownsResources: false,
        ownsGeometry: false
      });
    }
  }
}

function damageWildernessVegetationAt(wx, wz) {
  if (!wildernessVegetationState.trees.length && !wildernessVegetationState.shrubs.length) return;
  const _mat = new THREE.Matrix4();
  const _pos = new THREE.Vector3();
  const _quat = new THREE.Quaternion();
  const _scl = new THREE.Vector3();
  const _tiltQ = new THREE.Quaternion();
  const _axis = new THREE.Vector3();
  const _col = new THREE.Color();

  const saveAndModifyInst = (mesh, idx, record, key, modifyFn) => {
    if (!mesh) return;
    mesh.getMatrixAt(idx, _mat);
    if (!record[key]) record[key] = _mat.clone();
    const colKey = key + 'Col';
    if (!record[colKey]) {
      const c = new THREE.Color();
      if (mesh.instanceColor) mesh.getColorAt(idx, c);
      else c.setHex(0xffffff);
      record[colKey] = c;
    }
    modifyFn(_mat, _col.copy(record[colKey]));
    mesh.setMatrixAt(idx, _mat);
    mesh.setColorAt(idx, _col);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };

  for (const tree of wildernessVegetationState.trees) {
    if (tree.damaged >= 2) continue;
    const dist = Math.hypot(tree.x - wx, tree.z - wz);
    if (dist > 7.2) continue;
    const severe = dist <= 3.8;
    const targetState = severe ? 2 : 1;
    if (tree.damaged >= targetState) continue;
    tree.damaged = targetState;

    const dx = tree.x - wx, dz = tree.z - wz;
    const dLen = Math.hypot(dx, dz) || 1;
    // Tilt axis perpendicular to blast radial vector so tree leans away from blast
    _axis.set(-dz / dLen, 0, dx / dLen).normalize();
    const tiltRad = severe ? (0.48 + Math.random() * 0.25) : (0.16 + Math.random() * 0.14);
    _tiltQ.setFromAxisAngle(_axis, tiltRad);

    saveAndModifyInst(tree.trunkMesh, tree.idx, tree, 'origTrunk', (mat, col) => {
      mat.decompose(_pos, _quat, _scl);
      _quat.premultiply(_tiltQ);
      if (severe) _scl.y *= 0.28; // Snap trunk into charred stump
      mat.compose(_pos, _quat, _scl);
      col.multiplyScalar(severe ? 0.24 : 0.48);
    });

    saveAndModifyInst(tree.canopyMesh, tree.idx, tree, 'origCanopy', (mat, col) => {
      mat.decompose(_pos, _quat, _scl);
      if (severe) {
        _scl.set(0, 0, 0); // Canopy blown completely off
      } else {
        _quat.premultiply(_tiltQ);
        _scl.multiplyScalar(0.68); // Stripped/singed foliage
      }
      mat.compose(_pos, _quat, _scl);
      col.setRGB(col.r * 0.45, col.g * 0.36, col.b * 0.24);
    });

    if (tree.branchMesh && typeof tree.lobeBaseIdx === 'number') {
      for (let k = 0; k < 3; k++) {
        const bIdx = tree.lobeBaseIdx + k;
        saveAndModifyInst(tree.branchMesh, bIdx, tree, `origBranch${k}`, (mat, col) => {
          if (severe) {
            mat.decompose(_pos, _quat, _scl);
            _scl.set(0, 0, 0);
            mat.compose(_pos, _quat, _scl);
          }
          col.multiplyScalar(severe ? 0.24 : 0.48);
        });
        if (tree.lobeMesh) {
          saveAndModifyInst(tree.lobeMesh, bIdx, tree, `origLobe${k}`, (mat, col) => {
            mat.decompose(_pos, _quat, _scl);
            if (severe) _scl.set(0, 0, 0);
            else _scl.multiplyScalar(0.55);
            mat.compose(_pos, _quat, _scl);
            col.setRGB(col.r * 0.45, col.g * 0.36, col.b * 0.24);
          });
        }
      }
    }

    spawnVegetationBlastDebris(tree.x, tree.y, tree.z, wx, wz, severe);
  }

  for (const shrub of wildernessVegetationState.shrubs) {
    if (shrub.damaged >= 2) continue;
    const dist = Math.hypot(shrub.x - wx, shrub.z - wz);
    if (dist > 5.8) continue;
    const severe = dist <= 3.4;
    const targetState = severe ? 2 : 1;
    if (shrub.damaged >= targetState) continue;
    shrub.damaged = targetState;

    saveAndModifyInst(shrub.mesh, shrub.idx, shrub, 'origMat', (mat, col) => {
      mat.decompose(_pos, _quat, _scl);
      if (severe) _scl.set(0, 0, 0);
      else _scl.y *= 0.42;
      mat.compose(_pos, _quat, _scl);
      col.setRGB(col.r * 0.42, col.g * 0.34, col.b * 0.22);
    });

    if (severe) {
      spawnVegetationBlastDebris(shrub.x, shrub.y - 0.8, shrub.z, wx, wz, false);
    }
  }
}

function resetWildernessVegetation() {
  const restoreInst = (mesh, idx, record, key) => {
    if (!mesh || !record[key]) return;
    mesh.setMatrixAt(idx, record[key]);
    if (record[key + 'Col']) mesh.setColorAt(idx, record[key + 'Col']);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };
  for (const tree of wildernessVegetationState.trees) {
    if (!tree.damaged) continue;
    restoreInst(tree.trunkMesh, tree.idx, tree, 'origTrunk');
    restoreInst(tree.canopyMesh, tree.idx, tree, 'origCanopy');
    if (tree.branchMesh && typeof tree.lobeBaseIdx === 'number') {
      for (let k = 0; k < 3; k++) {
        restoreInst(tree.branchMesh, tree.lobeBaseIdx + k, tree, `origBranch${k}`);
        if (tree.lobeMesh) restoreInst(tree.lobeMesh, tree.lobeBaseIdx + k, tree, `origLobe${k}`);
      }
    }
    tree.damaged = 0;
  }
  for (const shrub of wildernessVegetationState.shrubs) {
    if (!shrub.damaged) continue;
    restoreInst(shrub.mesh, shrub.idx, shrub, 'origMat');
    shrub.damaged = 0;
  }
}

function addGroundShellCrater(wx, wz, impactVel = null) {
  if (!wildernessGroup) return;

  // 1. Derive crater size, elongation & directional ejecta from bomb velocity + ground slope
  const dhdx = (wildernessHeight(wx + 0.8, wz) - wildernessHeight(wx - 0.8, wz)) / 1.6;
  const dhdz = (wildernessHeight(wx, wz + 0.8) - wildernessHeight(wx, wz - 0.8)) / 1.6;
  const slopeMag = Math.hypot(dhdx, dhdz);

  const vx = impactVel ? impactVel.x : 0;
  const vy = impactVel ? impactVel.y : -24;
  const vz = impactVel ? impactVel.z : 0;
  const speed = Math.hypot(vx, vy, vz);
  const horizSpeed = Math.hypot(vx, vz);
  const obliquity = Math.atan2(horizSpeed, Math.max(1.0, -vy));

  const speedScale = THREE.MathUtils.clamp(0.76 + (speed / 34.0) * 0.36, 0.74, 1.30);
  const radius = 3.25 * speedScale;
  // Oversized plane & canvas margin so elongated downhill ejecta & clods NEVER clip at square texture edges
  const planeRadius = radius * 1.68;
  const rScale = radius / planeRadius;

  // Combined directional vector: bomb horizontal travel + downhill slope pull
  const dirX = vx * 0.35 - dhdx * 8.0;
  const dirZ = vz * 0.35 - dhdz * 8.0;
  const dirMag = Math.hypot(dirX, dirZ);
  const stretchAng = dirMag > 0.25 ? Math.atan2(dirZ, dirX) : Math.random() * Math.PI * 2;
  const elongation = THREE.MathUtils.clamp(obliquity * 0.36 + slopeMag * 0.34 + 0.08, 0.08, 0.42);

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size * 0.5, cy = size * 0.5;

  // Per-crater random angular harmonics + physics-driven oblique/downslope elongation
  const p1 = Math.random() * Math.PI * 2;
  const p2 = Math.random() * Math.PI * 2;
  const p3 = Math.random() * Math.PI * 2;
  const warpAt = (ang) => {
    const forwardAlign = Math.cos(ang - stretchAng);
    const oval = elongation * Math.cos(2 * (ang - stretchAng)) * 0.45 + elongation * 0.42 * forwardAlign;
    return THREE.MathUtils.clamp(
      1.0
      + oval
      + 0.15 * Math.sin(3 * ang + p1)
      + 0.10 * Math.cos(5 * ang + p2)
      + 0.06 * Math.sin(7 * ang + p3),
      0.62,
      1.48
    );
  };

  // Helper: trace an irregular jagged closed polygon matching warpAt(ang) scaled by rScale
  const drawJaggedLayer = (baseFrac, jitterAmp, fillStyle, blurPx = 0) => {
    ctx.save();
    if (blurPx > 0) ctx.filter = `blur(${blurPx}px)`;
    ctx.fillStyle = fillStyle;
    ctx.beginPath();
    const verts = 36;
    for (let i = 0; i <= verts; i++) {
      const ang = (i / verts) * Math.PI * 2;
      const micro = 1.0 + jitterAmp * Math.sin(11 * ang + p2) * Math.cos(9 * ang + p1);
      const rad = cx * rScale * baseFrac * warpAt(ang) * micro;
      const px = cx + Math.cos(ang) * rad;
      const py = cy + Math.sin(ang) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  // 1. Layered irregular soot halo, upturned earth rim & charred central blast pit
  drawJaggedLayer(0.84, 0.08, 'rgba(30, 24, 18, 0.24)', 10);
  drawJaggedLayer(0.64, 0.10, 'rgba(48, 37, 26, 0.52)', 6);
  drawJaggedLayer(0.46, 0.09, 'rgba(74, 56, 38, 0.82)', 3);
  drawJaggedLayer(0.28, 0.11, 'rgba(24, 19, 15, 0.90)', 3);
  drawJaggedLayer(0.18, 0.12, 'rgba(13, 10, 8, 0.96)', 2);

  // 2. Asymmetric radial blast ejecta rays biased along bomb trajectory & downhill slope
  for (let i = 0; i < 18; i++) {
    const ang = (i / 18) * Math.PI * 2 + (Math.random() - 0.5) * 0.34;
    const wFactor = warpAt(ang);
    const forwardBias = 1.0 + elongation * 0.72 * Math.max(0, Math.cos(ang - stretchAng));
    const len = Math.min(cx * 0.94, cx * rScale * (0.42 + Math.random() * 0.34) * (0.78 + 0.22 * wFactor) * forwardBias);
    const w = 2.2 + Math.random() * 5.5;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    const rayGrad = ctx.createLinearGradient(5, 0, len, 0);
    rayGrad.addColorStop(0.0, 'rgba(20, 16, 12, 0.72)');
    rayGrad.addColorStop(0.45, 'rgba(66, 51, 35, 0.44)');
    rayGrad.addColorStop(1.0, 'rgba(40, 32, 24, 0.00)');
    ctx.fillStyle = rayGrad;
    ctx.beginPath();
    ctx.moveTo(5, -w * 0.35);
    ctx.lineTo(len, -w * 1.05);
    ctx.lineTo(len, w * 1.05);
    ctx.lineTo(5, w * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // 3. Scattered clods & burnt pebbles following irregular crater rim
  for (let i = 0; i < 160; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = Math.min(cx * 0.90, (0.14 + Math.random() * 0.64) * cx * rScale * warpAt(a));
    const r = 0.9 + Math.random() * 2.4;
    ctx.fillStyle = i % 3 === 0 ? 'rgba(92, 72, 48, 0.66)' : 'rgba(18, 15, 12, 0.64)';
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // 4. Soft circular outer fade guarantee so alpha is strictly 0 before reaching square canvas edge
  ctx.globalCompositeOperation = 'destination-in';
  const edgeMask = ctx.createRadialGradient(cx, cy, cx * 0.72, cx, cy, cx * 0.98);
  edgeMask.addColorStop(0.0, 'rgba(255,255,255,1)');
  edgeMask.addColorStop(0.65, 'rgba(255,255,255,0.45)');
  edgeMask.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = edgeMask;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'source-over';

  const map = new THREE.CanvasTexture(canvas);
  map.encoding = THREE.sRGBEncoding;

  // Terrain-conforming irregular 3D crater rim matching warpAt(ang)
  const segs = 24;
  const geometry = new THREE.PlaneGeometry(planeRadius * 2, planeRadius * 2, segs, segs).rotateX(-Math.PI / 2);
  const points = geometry.attributes.position;
  for (let i = 0; i < points.count; i++) {
    const lx = points.getX(i), lz = points.getZ(i);
    const r = Math.hypot(lx, lz);
    const ang = Math.atan2(lz, lx);
    const rn = r / (radius * Math.max(0.65, warpAt(ang)));
    const x = wx + lx, z = wz + lz;
    const baseY = wildernessRoadBaseHeight(x, z);
    const roadLift = wildernessRoadDistance(x, z) < 4.1 ? WILDERNESS_ROAD_LIFT + 0.045 : 0.035;
    const bowlLift = 0.015 * Math.exp(-((rn / 0.24) ** 2));
    const rimBias = 1.0 + elongation * 0.65 * Math.cos(ang - stretchAng);
    const rim = (0.125 * speedScale * rimBias) * Math.exp(-(((rn - 0.44) / 0.14) ** 2));
    points.setY(i, baseY + roadLift + bowlLift + rim);
  }
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    map,
    roughness: 0.96,
    metalness: 0.02,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(wx, 0, wz);
  mesh.visible = false;
  mesh.receiveShadow = true;
  mesh.renderOrder = 7;
  wildernessGroup.add(mesh);
  tacticalState.debris.push({
    mesh,
    settled: true,
    ownsResources: true,
    revealDelay: 0.16,
    revealAge: 0,
    revealDuration: 0.28
  });
}

function addWreckScorchAt(wx, wz, radius = 4.3) {
  if (!wildernessGroup) return;
  const planeRadius = radius * 1.45;
  const rScale = radius / planeRadius;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 192;
  const ctx = canvas.getContext('2d');
  const cx = 96, cy = 96;
  const p1 = Math.random() * Math.PI * 2, p2 = Math.random() * Math.PI * 2;
  const drawJagged = (frac, fill, blurPx) => {
    ctx.save();
    if (blurPx > 0) ctx.filter = `blur(${blurPx}px)`;
    ctx.fillStyle = fill;
    ctx.beginPath();
    for (let i = 0; i <= 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const w = 1.0 + 0.16 * Math.sin(3 * a + p1) + 0.10 * Math.cos(5 * a + p2);
      const r = cx * rScale * frac * w;
      const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };
  drawJagged(0.82, 'rgba(34, 27, 20, 0.56)', 8);
  drawJagged(0.52, 'rgba(18, 15, 12, 0.86)', 4);
  for (let i = 0; i < 90; i++) {
    const a = i * 2.39996, d = Math.min(cx * 0.88, cx * rScale * 0.85 * Math.sqrt(i / 90));
    ctx.fillStyle = `rgba(16, 14, 12, ${0.28 * (1 - d / (cx * 0.92))})`;
    ctx.fillRect(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1 + (i % 5), 1 + (i % 3));
  }
  ctx.globalCompositeOperation = 'destination-in';
  const mask = ctx.createRadialGradient(cx, cy, cx * 0.68, cx, cy, cx * 0.98);
  mask.addColorStop(0, 'rgba(255,255,255,1)');
  mask.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = mask;
  ctx.fillRect(0, 0, 192, 192);
  ctx.globalCompositeOperation = 'source-over';

  const map = new THREE.CanvasTexture(canvas);
  map.encoding = THREE.sRGBEncoding;
  const geometry = new THREE.PlaneGeometry(planeRadius * 2, planeRadius * 2, 16, 16).rotateX(-Math.PI / 2);
  const points = geometry.attributes.position;
  for (let i = 0; i < points.count; i++) {
    const x = wx + points.getX(i), z = wz + points.getZ(i);
    const roadLift = wildernessRoadDistance(x, z) < 4.1 ? WILDERNESS_ROAD_LIFT + 0.04 : 0.035;
    points.setY(i, wildernessRoadBaseHeight(x, z) + roadLift);
  }
  geometry.computeVertexNormals();
  const material = new THREE.MeshBasicMaterial({
    map, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(wx, 0, wz);
  mesh.visible = false;
  mesh.renderOrder = 6;
  wildernessGroup.add(mesh);
  tacticalState.debris.push({
    mesh, settled: true, ownsResources: true,
    revealDelay: 0.14, revealAge: 0, revealDuration: 0.26
  });
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
      const isRadar = target.type === 'radar';
      launch(
        piece,
        index + (isRadar ? 1 : 0),
        isRadar ? 2.4 : (2.1 + (index % 2) * 0.9),
        isRadar ? 0.55 : 0.25,
        partType === 'roof',
        isRadar ? 3.8 : (4.8 + (index % 2) * 1.4),
        new THREE.Vector3(wreckSide * 1.4, (index % 2 ? 1.1 : -1.1), wreckSide * 1.6)
      );
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
    scoreText.textContent = `戰車 ${tanksKilled}/2 ｜ 雷達 ${radarKilled}/1 ｜ 彈藥庫 ${ammoKilled}/1`;
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
    if (piece.revealDuration) {
      piece.revealAge += dt;
      if (piece.revealAge >= piece.revealDelay) {
        piece.mesh.visible = true;
        const t = Math.min(1, (piece.revealAge - piece.revealDelay) / piece.revealDuration);
        piece.mesh.material.opacity = t * t * (3 - 2 * t);
        if (t >= 1) delete piece.revealDuration;
      }
    }
    if (piece.settled) continue;
    const {mesh,velocity,spin}=piece;
    velocity.multiplyScalar(Math.max(0, 1 - 0.55 * dt));
    velocity.y-=9.81*dt;
    mesh.position.addScaledVector(velocity,dt);
    mesh.rotation.x+=spin.x*dt;
    mesh.rotation.y+=spin.y*dt;
    mesh.rotation.z+=spin.z*dt;
    const dKey = `${wildernessColliderCell(mesh.position.x)},${wildernessColliderCell(mesh.position.z)}`;
    const dIndices = wildernessColliderCells.get(dKey);
    if (dIndices) {
      for (let di = 0; di < dIndices.length; di++) {
        const box = wildernessColliders[dIndices[di]];
        if (mesh.position.x >= box.minX && mesh.position.x <= box.maxX &&
            mesh.position.y >= box.minY && mesh.position.y <= box.maxY &&
            mesh.position.z >= box.minZ && mesh.position.z <= box.maxZ) {
          if (mesh.position.y - velocity.y * dt >= box.maxY - 0.15 && velocity.y < 0) {
            mesh.position.y = box.maxY + piece.clearance;
            velocity.y = Math.abs(velocity.y) * 0.35;
          } else {
            velocity.x *= -0.4;
            velocity.z *= -0.4;
          }
          break;
        }
      }
    }
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
  const yaw = typeof tank.yaw === 'number' ? tank.yaw : (-tank.patrolDir * Math.PI / 2);
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
    if (typeof tank.yaw !== 'number') {
      tank.yaw = -tank.patrolDir * Math.PI / 2;
    }
    if (!tank.turnState) {
      tank.turnState = 'cruising';
    }

    let travel = 0;
    if (tank.turnState === 'stopping') {
      tank.speedX = 0;
      tank.turnPauseTimer -= dt;
      if (tank.turnPauseTimer <= 0) {
        tank.turnState = 'turning';
        tank.turnProgress = 0;
        tank.turnStartYaw = tank.yaw;
        tank.turnSign = tank.patrolDir > 0 ? 1 : -1;
        tank.patrolDir *= -1;
      }
    } else if (tank.turnState === 'turning') {
      tank.speedX = 0;
      const turnDuration = tank.trackDamaged ? 6.2 : 4.6;
      tank.turnProgress = Math.min(1, tank.turnProgress + dt / turnDuration);
      const ease = tank.turnProgress * tank.turnProgress * (3 - 2 * tank.turnProgress);
      tank.yaw = tank.turnStartYaw + tank.turnSign * Math.PI * ease;
      // Tracks counter-rotate during neutral-steer pivot turn
      tank.rollWheels(0.85 * dt);
      if (tank.turnProgress >= 1) {
        tank.yaw = -tank.patrolDir * Math.PI / 2;
        tank.turnState = 'cruising';
      }
    } else {
      const previousX = tank.pos.x;
      const distToEnd = tank.patrolDir > 0 ? (tank.patrolMaxX - tank.pos.x) : (tank.pos.x - tank.patrolMinX);
      const distFromStart = tank.patrolDir > 0 ? (tank.pos.x - tank.patrolMinX) : (tank.patrolMaxX - tank.pos.x);
      const decelFactor = THREE.MathUtils.clamp(distToEnd / 4.5, 0.22, 1.0);
      const accelFactor = THREE.MathUtils.clamp((distFromStart + 0.4) / 3.5, 0.25, 1.0);
      const speedMult = Math.min(decelFactor, accelFactor);

      tank.pos.x += tank.patrolDir * tank.patrolSpeed * 0.25 * speedMult * dt;
      if (tank.pos.x >= tank.patrolMaxX && tank.patrolDir > 0) {
        tank.pos.x = tank.patrolMaxX;
        tank.turnState = 'stopping';
        tank.turnPauseTimer = 0.45;
      } else if (tank.pos.x <= tank.patrolMinX && tank.patrolDir < 0) {
        tank.pos.x = tank.patrolMinX;
        tank.turnState = 'stopping';
        tank.turnPauseTimer = 0.45;
      }
      travel = tank.pos.x - previousX;
      tank.speedX = dt > 0 ? travel / dt : 0;
      tank.rollWheels(Math.abs(travel));
    }
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
    } else if ((t.type === 'radar' || t.type === 'ammo') && !t.destroyed && t.damagedSmoke) {
      t.wreckSmokeTimer = (t.wreckSmokeTimer || 0) + dt;
      if (t.wreckSmokeTimer >= 0.55) {
        t.wreckSmokeTimer = 0;
        createTrackDamageSmoke(t.pos.x + (Math.random() - 0.5) * 1.4, t.pos.y + 1.6, t.pos.z + (Math.random() - 0.5) * 1.4, 0);
      }
    }
  });

  // Animate persistent smoke plumes for destroyed AA emplacements
  tacticalState.aaSites.forEach((aa) => {
    if (aa.destroyed) {
      aa.wreckSmokeTimer = (aa.wreckSmokeTimer || 0) + dt;
      if (aa.wreckSmokeTimer >= 0.42) {
        aa.wreckSmokeTimer = 0;
        createWreckFireSmokePlume(aa.pos.x, aa.pos.y + 0.85, aa.pos.z, false);
      }
    }
  });

  updateAirDefenseSystem(dt);
}

// ============================================================================
// 12.6 GROUND ANTI-AIR DEFENSE (RADAR-LINKED AAA, DEPOT AAA & TANK 12.7mm HMG)
// ============================================================================
const _aaVecA = new THREE.Vector3();
const _aaVecB = new THREE.Vector3();
const _aaLocalTarget = new THREE.Vector3();
const _aaUp = new THREE.Vector3(0, 1, 0);
const _aaForward = new THREE.Vector3(0, 0, -1);

let _aaaTracerGeoCore = null;
let _aaaTracerGeoTrail = null;
let _aaaTracerMatCore = null;
let _aaaTracerMatTrail = null;
let _hmgTracerGeoCore = null;
let _hmgTracerGeoTrail = null;
let _hmgTracerMatCore = null;
let _hmgTracerMatTrail = null;
let _rifleTracerGeoCore = null;
let _rifleTracerMatCore = null;
let _rifleBallGeo = null;
let _rifleBallMat = null;

function ensureAATracerAssets() {
  if (_aaaTracerGeoCore) return;
  _aaaTracerGeoCore = new THREE.CylinderGeometry(0.032, 0.032, 1.35, 6).rotateX(Math.PI / 2);
  _aaaTracerGeoTrail = new THREE.CylinderGeometry(0.075, 0.015, 2.8, 6).rotateX(Math.PI / 2);
  _aaaTracerMatCore = new THREE.MeshBasicMaterial({ color: 0xfff3b0 });
  _aaaTracerMatTrail = new THREE.MeshBasicMaterial({
    color: 0xff5400,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  _hmgTracerGeoCore = new THREE.CylinderGeometry(0.024, 0.015, 1.55, 6).rotateX(Math.PI / 2);
  _hmgTracerGeoTrail = new THREE.CylinderGeometry(0.042, 0.008, 2.25, 6).rotateX(Math.PI / 2);
  _hmgTracerMatCore = new THREE.MeshBasicMaterial({
    color: 0xffd166,
    transparent: true,
    opacity: 0.96,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  _hmgTracerMatTrail = new THREE.MeshBasicMaterial({
    color: 0xff6d00,
    transparent: true,
    opacity: 0.65,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  _rifleTracerGeoCore = new THREE.CylinderGeometry(0.011, 0.006, 0.78, 5).rotateX(Math.PI / 2);
  _rifleTracerMatCore = new THREE.MeshBasicMaterial({
    color: 0xff8844,
    transparent: true,
    opacity: 0.74,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  _rifleBallGeo = new THREE.CylinderGeometry(0.006, 0.004, 0.28, 4).rotateX(Math.PI / 2);
  _rifleBallMat = new THREE.MeshBasicMaterial({
    color: 0x8f826c,
    transparent: true,
    opacity: 0.36,
    depthWrite: false
  });
}

function hasTerrainLineOfSight(ax, ay, az, bx, by, bz) {
  const samples = 14;
  for (let i = 1; i < samples; i++) {
    const t = i / samples;
    const px = ax + (bx - ax) * t;
    const py = ay + (by - ay) * t;
    const pz = az + (bz - az) * t;
    if (py < wildernessHeight(px, pz) + 0.45) return false;
  }
  return true;
}

function spawnAATracer(origin, dir, speed, kind, sourceLabel, targetDist, isTracer = true) {
  ensureAATracerAssets();
  const group = new THREE.Group();
  if (kind === 'aaa') {
    const core = new THREE.Mesh(_aaaTracerGeoCore, _aaaTracerMatCore);
    const trail = new THREE.Mesh(_aaaTracerGeoTrail, _aaaTracerMatTrail);
    trail.position.z = 0.85;
    group.add(core, trail);
  } else if (kind === 'hmg') {
    const core = new THREE.Mesh(_hmgTracerGeoCore, _hmgTracerMatCore);
    const trail = new THREE.Mesh(_hmgTracerGeoTrail, _hmgTracerMatTrail);
    trail.position.z = 0.65;
    group.add(core, trail);
  } else if (isTracer) {
    const rTracer = new THREE.Mesh(_rifleTracerGeoCore, _rifleTracerMatCore);
    group.add(rTracer);
  } else {
    const rBall = new THREE.Mesh(_rifleBallGeo, _rifleBallMat);
    group.add(rBall);
  }
  group.position.copy(origin);
  group.quaternion.setFromUnitVectors(_aaForward, dir);
  scene.add(group);

  tacticalState.aaProjectiles.push({
    mesh: group,
    pos: origin.clone(),
    prevPos: origin.clone(),
    vel: dir.clone().multiplyScalar(speed),
    kind,
    sourceLabel,
    life: 0,
    maxLife: kind === 'aaa' ? 2.1 : 1.0,
    fuseDist: kind === 'aaa' ? targetDist + (Math.random() - 0.5) * 14 : 9999,
    traveled: 0
  });
}

function createBallisticPuff(x, y, z, kind = 'muzzle_smoke') {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  const tex = getBlastTexture();
  const puffs = [];
  const isSpark = kind === 'hit_spark';
  const isDust = kind === 'ground_dust';
  const count = isSpark ? 2 : 1;
  for (let i = 0; i < count; i++) {
    const color = isSpark ? (i === 0 ? 0xffd166 : 0xff7b00) : (isDust ? 0x7c6f59 : 0xcbd5e1);
    const mat = new THREE.SpriteMaterial({
      color,
      map: tex,
      transparent: true,
      depthWrite: false,
      opacity: isSpark ? 0.92 : (isDust ? 0.65 : 0.38),
      blending: isSpark ? THREE.AdditiveBlending : THREE.NormalBlending,
      rotation: Math.random() * Math.PI * 2
    });
    const sprite = new THREE.Sprite(mat);
    if (isSpark) {
      sprite.position.set((Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.25);
    }
    const baseScale = isSpark ? (i === 0 ? 0.65 : 0.45) : (isDust ? 1.15 : 0.55);
    sprite.scale.setScalar(baseScale * 0.5);
    group.add(sprite);
    puffs.push({ sprite, baseScale, isCore: isSpark && i === 0 });
  }
  scene.add(group);
  const maxLife = isSpark ? 0.22 : (isDust ? 0.45 : 0.36);
  tacticalState.aaFlakBursts.push({ group, puffs, life: 0, maxLife });
}

function createFlakBurst(x, y, z) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  const tex = getBlastTexture();
  const puffs = [];
  for (let i = 0; i < 4; i++) {
    const isCore = i === 0;
    const mat = new THREE.SpriteMaterial({
      color: isCore ? 0xff7b00 : 0x1c1917,
      map: tex,
      transparent: true,
      depthWrite: false,
      opacity: isCore ? 0.95 : 0.78,
      blending: isCore ? THREE.AdditiveBlending : THREE.NormalBlending,
      rotation: Math.random() * Math.PI * 2
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(
      (Math.random() - 0.5) * 1.4,
      (Math.random() - 0.5) * 1.2,
      (Math.random() - 0.5) * 1.4
    );
    const baseScale = isCore ? 2.4 : 2.6 + Math.random() * 1.4;
    sprite.scale.setScalar(baseScale * 0.45);
    group.add(sprite);
    puffs.push({ sprite, baseScale, isCore });
  }
  scene.add(group);
  tacticalState.aaFlakBursts.push({ group, puffs, life: 0, maxLife: 1.15 });
}

const _droneDamageParticles = [];
const _dmgVec = new THREE.Vector3();
const ROTOR_LABELS = ['左前旋翼', '右前旋翼', '左後旋翼', '右後旋翼'];

function clearGCSDamageFeed() {
  const feed = document.getElementById('gcs-damage-feed');
  if (feed) feed.innerHTML = '';
}

function pushGCSDamageFeed(message, severity = 'warn') {
  const feed = document.getElementById('gcs-damage-feed');
  if (!feed) return;

  const item = document.createElement('div');
  item.className = `gcs-feed-item sev-${severity}`;
  item.textContent = message;
  feed.appendChild(item);

  while (feed.children.length > 5) {
    feed.removeChild(feed.firstChild);
  }

  setTimeout(() => {
    if (!item.parentNode) return;
    item.classList.add('fading');
    setTimeout(() => {
      if (item.parentNode) item.parentNode.removeChild(item);
    }, 450);
  }, 10000);
}

function applyDroneVisualDamage() {
  if (!playerDroneMesh || !playerDroneMesh.rotorData) return;
  const dmg = drone.damage || { rotorHealth: [1, 1, 1, 1], fuselageScorch: 0 };

  // 1. Update fuselage scorch & roughness
  if (playerDroneMesh.shellMat) {
    const s = THREE.MathUtils.clamp(dmg.fuselageScorch || 0, 0, 1);
    const baseColor = new THREE.Color(0x626c59);
    const charColor = new THREE.Color(0x1f211e);
    playerDroneMesh.shellMat.color.copy(baseColor).lerp(charColor, s * 0.82);
    playerDroneMesh.shellMat.roughness = 0.79 + s * 0.2;
  }

  // 2. Update individual rotors (missing/bent blades, tilted dead motor, charred cap)
  playerDroneMesh.rotorData.forEach((rd, idx) => {
    const rh = dmg.rotorHealth[idx] ?? 1.0;
    const [bA, bB] = rd.blades;
    if (rh >= 0.99) {
      bA.visible = true;
      bB.visible = true;
      bA.rotation.set(0, 0, 0);
      bB.rotation.set(0, Math.PI, 0);
      rd.group.rotation.x = 0;
      rd.group.rotation.z = 0;
      rd.capMat.color.setHex(0x7c8d99);
    } else if (rh > 0.05) {
      // One blade sheared off, remaining blade bent
      bA.visible = true;
      bB.visible = false;
      bA.rotation.set(0, 0, 0.22);
      rd.group.rotation.x = 0.06;
      rd.capMat.color.setHex(0x4a4e52);
    } else {
      // Complete rotor assembly destroyed
      bA.visible = false;
      bB.visible = false;
      rd.group.rotation.x = 0.18;
      rd.group.rotation.z = idx % 2 === 0 ? 0.14 : -0.14;
      rd.capMat.color.setHex(0x1c1d1f);
    }
  });

  // 3. Update Nose EO/IR Gimbal Pod (tilted/charred housing & darkened/shattered optics)
  if (playerDroneMesh.eoPodGroup) {
    const ch = dmg.cameraHealth ?? 1.0;
    if (ch >= 0.99) {
      playerDroneMesh.eoPodGroup.rotation.set(0, 0, 0);
      playerDroneMesh.eoHousingMat?.color.setHex(0x282d30);
      playerDroneMesh.eoLensMat?.color.setHex(0x1b2b34);
      playerDroneMesh.eoDownLensMat?.color.setHex(0x1b4252);
    } else if (ch > 0.05) {
      playerDroneMesh.eoPodGroup.rotation.set(0.28, 0.22, -0.18);
      playerDroneMesh.eoHousingMat?.color.setHex(0x1f201d);
      playerDroneMesh.eoLensMat?.color.setHex(0x475569);
      playerDroneMesh.eoDownLensMat?.color.setHex(0x475569);
    } else {
      playerDroneMesh.eoPodGroup.rotation.set(0.62, -0.35, 0.42);
      playerDroneMesh.eoHousingMat?.color.setHex(0x141312);
      playerDroneMesh.eoLensMat?.color.setHex(0x09090b);
      playerDroneMesh.eoDownLensMat?.color.setHex(0x09090b);
    }
  }
}

function updateDroneDamageParticles(dt) {
  // Update existing particles
  for (let i = _droneDamageParticles.length - 1; i >= 0; i--) {
    const p = _droneDamageParticles[i];
    p.life += dt;
    const t = p.life / p.maxLife;
    if (t >= 1) {
      p.mesh.material.dispose();
      scene.remove(p.mesh);
      _droneDamageParticles.splice(i, 1);
      continue;
    }
    p.mesh.position.addScaledVector(p.vel, dt);
    p.vel.multiplyScalar(Math.max(0, 1 - 1.8 * dt));
    p.mesh.scale.setScalar(p.baseScale * (1 + t * (p.isSpark ? 0.4 : 2.6)));
    p.mesh.material.opacity = p.startOpacity * (1 - t);
  }

  if (drone.crashed || !playerDroneMesh || !playerDroneMesh.rotorData) return;
  const dmg = drone.damage;
  if (!dmg) return;

  const damagedRotors = [];
  for (let i = 0; i < 4; i++) {
    if (dmg.rotorHealth[i] < 0.99) damagedRotors.push(i);
  }
  const hasDamage = damagedRotors.length > 0 || dmg.fuselageScorch > 0.15 || (drone.hullHp ?? 100) < 85;
  if (!hasDamage) return;

  dmg.smokeTimer -= dt;
  if (dmg.smokeTimer > 0) return;
  const severity = 1 - Math.max(0, Math.min(1, (drone.hullHp ?? 100) / 100));
  dmg.smokeTimer = Math.max(0.035, 0.14 - severity * 0.09);

  // Emit from a damaged rotor if any, otherwise from fuselage
  let emitPos;
  let isDeadMotor = false;
  if (damagedRotors.length > 0) {
    const rIdx = damagedRotors[Math.floor(Math.random() * damagedRotors.length)];
    isDeadMotor = dmg.rotorHealth[rIdx] <= 0.05;
    playerDroneMesh.rotorData[rIdx].group.getWorldPosition(_dmgVec);
    emitPos = _dmgVec;
  } else {
    _dmgVec.copy(drone.pos);
    emitPos = _dmgVec;
  }

  const isSpark = isDeadMotor && Math.random() < 0.28;
  const mat = new THREE.SpriteMaterial({
    map: getGlowSpriteTexture(),
    color: isSpark ? 0xff7b29 : 0x26292e,
    transparent: true,
    opacity: isSpark ? 0.9 : 0.48,
    depthWrite: false
  });
  const sprite = new THREE.Sprite(mat);
  sprite.position.copy(emitPos);
  const baseScale = isSpark ? 0.28 : 0.45 + severity * 0.45;
  sprite.scale.setScalar(baseScale);
  scene.add(sprite);

  _droneDamageParticles.push({
    mesh: sprite,
    vel: new THREE.Vector3(
      (Math.random() - 0.5) * 1.4,
      isSpark ? (Math.random() - 0.3) * 2.2 : 0.8 + Math.random() * 0.9,
      (Math.random() - 0.5) * 1.4
    ),
    life: 0,
    maxLife: isSpark ? 0.25 : 0.75 + severity * 0.45,
    baseScale,
    startOpacity: isSpark ? 0.9 : 0.48,
    isSpark
  });
}

function damageDroneFromAA(dmg, sourceLabel, impactDir) {
  if (drone.crashed) return;
  drone.hullHp = Math.max(0, (drone.hullHp ?? 100) - dmg);
  triggerDamageFlash();
  audioEngine.playBulletHit(dmg >= 18);

  const weaponLabel = sourceLabel.includes('近炸破片')
    ? '23mm 防空砲近炸破片'
    : sourceLabel.includes('重機槍')
      ? '12.7mm 重機槍'
      : (sourceLabel.includes('步槍') || dmg <= 10)
        ? '敵軍步槍'
        : dmg <= 15
          ? '12.7mm 重機槍'
          : '23mm 防空砲彈';

  // Apply component-level damage & log to GCS feed
  const d = drone.damage;
  if (d) {
    const activeRotors = [];
    for (let i = 0; i < 4; i++) {
      if (d.rotorHealth[i] > 0.05) activeRotors.push(i);
    }

    const roll = Math.random();
    const canHitCamera = (d.cameraHealth ?? 1.0) > 0.05;
    if (canHitCamera && roll < 0.05) {
      d.cameraHealth = 0.0;
      if (state.downZoom > 1 && typeof setDownZoom === 'function') setDownZoom(1);
      pushGCSDamageFeed(`${weaponLabel}命中・機首光電吊艙損毀（FPV／下視圖傳中斷）`, 'crit');
      d.fuselageScorch = Math.min(1, d.fuselageScorch + 0.14);
    } else if (canHitCamera && (d.cameraHealth ?? 1.0) > 0.55 && roll < 0.17) {
      d.cameraHealth = 0.5;
      pushGCSDamageFeed(`${weaponLabel}命中・光電感測／圖傳模組受損（畫面雜訊干擾）`, 'warn');
      d.fuselageScorch = Math.min(1, d.fuselageScorch + 0.12);
    } else if (activeRotors.length > 0 && roll < 0.62) {
      const rIdx = activeRotors[Math.floor(Math.random() * activeRotors.length)];
      const prev = d.rotorHealth[rIdx];
      if (prev >= 0.99 && dmg < 25) {
        d.rotorHealth[rIdx] = 0.45;
        pushGCSDamageFeed(`${weaponLabel}命中・${ROTOR_LABELS[rIdx]}槳葉斷裂（推力下降／姿態偏轉）`, 'warn');
      } else {
        d.rotorHealth[rIdx] = 0.0;
        pushGCSDamageFeed(`${weaponLabel}命中・${ROTOR_LABELS[rIdx]}總成失效（推力嚴重衰減）`, 'crit');
      }
      d.fuselageScorch = Math.min(1, d.fuselageScorch + 0.18);
    } else {
      d.fuselageScorch = Math.min(1, d.fuselageScorch + 0.34);
      d.controlGlitch = Math.min(1, d.controlGlitch + 0.28);
      if (drone.hullHp < 35) {
        pushGCSDamageFeed(`${weaponLabel}命中・機體主結構重創（飛控響應遲滯）`, 'crit');
      } else {
        pushGCSDamageFeed(`${weaponLabel}命中・機體外殼受損（伺服響應下降）`, 'warn');
      }
    }
    applyDroneVisualDamage();
  }

  // Physical shock jolt on airframe
  if (impactDir) {
    drone.vel.addScaledVector(impactDir, 2.2);
  }
  drone.pitch += (Math.random() - 0.5) * 0.22;
  drone.roll += (Math.random() - 0.5) * 0.26;

  if (drone.hullHp <= 0) {
    pushGCSDamageFeed(`致命損傷・機體失控墜毀`, 'crit');
    triggerDroneCrash(`遭${weaponLabel}擊落`, drone.vel.length(), 'aa');
  }
}

function closestDistPointToSegment(p, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const lenSq = abx * abx + aby * aby + abz * abz;
  if (lenSq < 1e-6) return p.distanceTo(a);
  const t = THREE.MathUtils.clamp(
    ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / lenSq,
    0,
    1
  );
  const cx = a.x + abx * t;
  const cy = a.y + aby * t;
  const cz = a.z + abz * t;
  return Math.hypot(p.x - cx, p.y - cy, p.z - cz);
}

function updateRWRUI(level, text) {
  const pill = document.getElementById('rwr-warning-pill');
  const textEl = document.getElementById('rwr-warning-text');
  const hullWrap = document.getElementById('rwr-hull-wrap');
  const hullFill = document.getElementById('rwr-hull-fill');
  if (!pill || !textEl) return;

  const hullPct = Math.max(0, Math.round(drone.hullHp ?? 100));
  const showHullOnly = state.gameMode === 'tactical_strike' && hullPct < 100 && !drone.crashed;
  if (level === 'none' && !showHullOnly) {
    pill.classList.add('hidden');
    pill.classList.remove('threat-fire');
    return;
  }

  pill.classList.remove('hidden');
  pill.classList.toggle('threat-fire', level === 'fire' || hullPct < 35);
  textEl.textContent = level === 'none' ? '遙測告警・機體結構受損' : text;

  let statusClass = 'hull-ok';
  if (hullPct < 35) {
    statusClass = 'hull-crit';
  } else if (hullPct < 70) {
    statusClass = 'hull-warn';
  }

  if (hullWrap) {
    hullWrap.classList.remove('hull-ok', 'hull-warn', 'hull-crit');
    hullWrap.classList.add(statusClass);
  }
  if (hullFill) {
    hullFill.style.width = `${hullPct}%`;
  }
}

function getVisualAirDefenseModifiers() {
  let rangeMult = 1.0;
  let lockAdd = 0.0;
  let spreadAdd = 0.0;
  if (state.timeOfDay === 'night') {
    rangeMult *= 0.58;
    lockAdd += 0.45;
    spreadAdd += 0.025;
  } else if (state.timeOfDay === 'sunset') {
    rangeMult *= 0.85;
    lockAdd += 0.15;
    spreadAdd += 0.008;
  }
  if (state.weather === 'typhoon') {
    rangeMult *= 0.62;
    lockAdd += 0.35;
    spreadAdd += 0.022;
  } else if (state.weather === 'heavy_rain') {
    rangeMult *= 0.75;
    lockAdd += 0.20;
    spreadAdd += 0.012;
  } else if (state.weather !== 'clear') {
    rangeMult *= 0.88;
    lockAdd += 0.10;
    spreadAdd += 0.006;
  }
  return { rangeMult, lockAdd, spreadAdd };
}

function updateAirDefenseSystem(dt) {
  const activeCombat = state.gameMode === 'tactical_strike' && state.raceActive && !state.countdownActive && !drone.crashed;
  const agl = drone.pos.y - wildernessHeight(drone.pos.x, drone.pos.z);
  const inFarpSafeZone = Math.hypot(drone.pos.x, drone.pos.z) < 38 && agl < 14;

  let highestThreat = 'none'; // 'none' | 'track' | 'fire'
  let threatText = '';

  const nowSec = performance.now() * 0.001;

  // 1. Update Ground Defense Sites (Enemy Rifle Sentry Squads at Radar & Depot)
  for (const aa of tacticalState.aaSites) {
    if (aa.flashTimer > 0) {
      aa.flashTimer -= dt;
      if (aa.flashTimer <= 0) aa.muzzleFlashes.forEach((mf) => { mf.visible = false; });
    }
    if (aa.destroyed) continue;

    const isRifleSquad = aa.variant === 'rifle_squad';
    if (aa.suppressedTimer > 0) {
      aa.suppressedTimer = Math.max(0, aa.suppressedTimer - dt);
    }

    if (isRifleSquad && aa.soldierUnits) {
      const visMod = getVisualAirDefenseModifiers();
      const maxRange = Math.round(118 * visMod.rangeMult);
      const maxEngageAgl = 68;
      const lockRequired = 1.15 + visMod.lockAdd;
      const speedSpread = THREE.MathUtils.clamp(drone.vel.length() / 22, 0, 1.5) * 0.045;
      const muzzleOriginY = aa.pos.y + 1.4;
      const dist = Math.hypot(drone.pos.x - aa.pos.x, drone.pos.y - muzzleOriginY, drone.pos.z - aa.pos.z);
      const suppressed = aa.suppressedTimer > 0;
      const hasLOS = activeCombat && !inFarpSafeZone && !suppressed && dist <= maxRange && agl <= maxEngageAgl &&
        hasTerrainLineOfSight(aa.pos.x, muzzleOriginY + 0.5, aa.pos.z, drone.pos.x, drone.pos.y, drone.pos.z);

      const projSpeed = 148;
      const leadT = dist / projSpeed;
      _aaVecA.set(
        drone.pos.x + drone.vel.x * leadT * 0.65,
        drone.pos.y + drone.vel.y * leadT * 0.5,
        drone.pos.z + drone.vel.z * leadT * 0.65
      );
      const dx = _aaVecA.x - aa.pos.x;
      const dy = _aaVecA.y - muzzleOriginY;
      const dz = _aaVecA.z - aa.pos.z;
      const horiz = Math.max(0.1, Math.hypot(dx, dz));
      const targetYaw = Math.atan2(-dx, -dz);
      const rawPitch = Math.atan2(dy, horiz);
      const targetPitch = THREE.MathUtils.clamp(rawPitch, -0.05, 1.30);
      const blockedByRoof = dz < 0.35 && rawPitch > 0.62;
      const inZenithDeadzone = rawPitch > 1.30;

      for (const u of aa.soldierUnits) {
        if (u.recoilTimer > 0) u.recoilTimer = Math.max(0, u.recoilTimer - dt * 7.5);
        if (u.reloadTimer > 0) {
          u.reloadTimer = Math.max(0, u.reloadTimer - dt);
          if (u.reloadTimer <= 0) u.ammoInMag = 15;
        }
        const breath = Math.sin(nowSec * 2.1 + u.phase) * 0.011;
        const reloading = u.reloadTimer > 0;
        const reloadDip = reloading ? -0.07 + Math.sin(nowSec * 9.0 + u.phase) * 0.015 : 0;
        const suppressDip = suppressed ? -0.24 : 0;
        u.bodyRoot.position.y = u.baseBodyY + breath + reloadDip + suppressDip;

        if (!hasLOS || blockedByRoof || inZenithDeadzone) {
          u.lockTimer = Math.max(0, u.lockTimer - dt * 1.2);
          u.burstLeft = 0;
          if (!hasLOS) u.hasFiredAtTarget = false;
          if (suppressed) {
            u.headGroup.rotation.y = THREE.MathUtils.lerp(u.headGroup.rotation.y, 0, dt * 8);
            u.headGroup.rotation.z = THREE.MathUtils.lerp(u.headGroup.rotation.z, 0.14, dt * 8);
            u.headGroup.rotation.x = THREE.MathUtils.lerp(u.headGroup.rotation.x, 0.38, dt * 8);
            u.aimUnit.rotation.x = THREE.MathUtils.lerp(u.aimUnit.rotation.x, -0.35, dt * 8);
          } else if (reloading) {
            u.headGroup.rotation.y = THREE.MathUtils.lerp(u.headGroup.rotation.y, 0.12, dt * 5);
            u.headGroup.rotation.z = THREE.MathUtils.lerp(u.headGroup.rotation.z, 0.06, dt * 5);
            u.headGroup.rotation.x = THREE.MathUtils.lerp(u.headGroup.rotation.x, 0.24, dt * 5);
            u.aimUnit.rotation.x = THREE.MathUtils.lerp(u.aimUnit.rotation.x, -0.22, dt * 5);
          } else {
            u.headGroup.rotation.y = Math.sin(nowSec * 0.85 + u.phase) * 0.34;
            u.headGroup.rotation.z = THREE.MathUtils.lerp(u.headGroup.rotation.z, 0, dt * 4);
            u.headGroup.rotation.x = 0.04 + Math.sin(nowSec * 1.3 + u.phase) * 0.05;
            u.aimUnit.rotation.x = THREE.MathUtils.lerp(u.aimUnit.rotation.x, -0.08 + Math.sin(nowSec * 1.4 + u.phase) * 0.025, dt * 3);
            u.bodyRoot.rotation.y = THREE.MathUtils.lerp(u.bodyRoot.rotation.y, u.baseYawTrim + Math.sin(nowSec * 0.45 + u.phase) * 0.18, dt * 2.0);
          }
          continue;
        }

        // Independent soldier slewing
        let yawDiff = targetYaw - u.bodyRoot.rotation.y;
        while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
        while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
        u.bodyRoot.rotation.y += THREE.MathUtils.clamp(yawDiff, -u.slewRate * dt, u.slewRate * dt);
        u.aimUnit.rotation.x += THREE.MathUtils.clamp(targetPitch - u.aimUnit.rotation.x, -u.slewRate * dt, u.slewRate * dt);

        if (reloading) {
          u.burstLeft = 0;
          u.headGroup.rotation.y = THREE.MathUtils.lerp(u.headGroup.rotation.y, 0.12, dt * 5);
          u.headGroup.rotation.z = THREE.MathUtils.lerp(u.headGroup.rotation.z, 0.06, dt * 5);
          u.headGroup.rotation.x = THREE.MathUtils.lerp(u.headGroup.rotation.x, 0.24, dt * 5);
          u.aimUnit.rotation.x = THREE.MathUtils.lerp(u.aimUnit.rotation.x, -0.22, dt * 5);
          continue;
        }

        u.headGroup.rotation.y = THREE.MathUtils.lerp(u.headGroup.rotation.y, 0, dt * 6);
        u.headGroup.rotation.z = THREE.MathUtils.lerp(u.headGroup.rotation.z, -0.08, dt * 6);
        u.headGroup.rotation.x = THREE.MathUtils.lerp(u.headGroup.rotation.x, u.aimUnit.rotation.x * 0.35, dt * 6);
        u.aimUnit.position.z = u.recoilTimer * 0.055;

        if (Math.abs(yawDiff) > 0.16 || Math.abs(targetPitch - u.aimUnit.rotation.x) > 0.16) {
          u.burstLeft = 0;
          continue;
        }

        u.lockTimer = Math.min(lockRequired, u.lockTimer + dt);
        if (u.lockTimer < lockRequired) continue;

        highestThreat = 'fire';
        threatText = '地面輕兵器射擊告警';

        if (u.fireCooldown > 0) {
          u.fireCooldown -= dt;
        } else if (u.burstLeft <= 0) {
          u.burstLeft = Math.min(3, u.ammoInMag);
          u.burstInterval = 0;
          u.burstAimDir.set(dx, dy, dz).normalize();
        }

        if (u.burstLeft > 0) {
          u.burstInterval -= dt;
          if (u.burstInterval <= 0) {
            u.burstLeft -= 1;
            u.ammoInMag = Math.max(0, u.ammoInMag - 1);
            u.burstInterval = 0.14;
            if (u.ammoInMag <= 0) {
              u.burstLeft = 0;
              u.reloadTimer = 3.0;
              u.fireCooldown = 0;
              u.hasFiredAtTarget = true;
            } else if (u.burstLeft <= 0) {
              u.fireCooldown = 2.6;
              u.hasFiredAtTarget = true;
            }

            const mf = u.muzzleFlash;
            mf.visible = true;
            mf.rotation.z = Math.random() * Math.PI * 2;
            aa.flashTimer = 0.055;
            u.recoilTimer = 1.0;

            mf.getWorldPosition(_aaVecB);
            const firstPenalty = !u.hasFiredAtTarget ? 0.035 : 0;
            const spread = 0.068 + visMod.spreadAdd + speedSpread + firstPenalty;
            _aaVecA.copy(u.burstAimDir);
            _aaVecA.x += (Math.random() - 0.5) * spread;
            _aaVecA.y += (Math.random() - 0.5) * spread;
            _aaVecA.z += (Math.random() - 0.5) * spread;
            _aaVecA.normalize();

            const isTracer = (u.shotCount % 3) === 0;
            u.shotCount += 1;
            spawnAATracer(_aaVecB, _aaVecA, projSpeed, 'rifle', `${aa.name} 步槍`, dist, isTracer);
            createBallisticPuff(_aaVecB.x, _aaVecB.y, _aaVecB.z, 'muzzle_smoke');
            audioEngine.playRifleShot(1.1 - dist / 130);
          }
        }
      }
      continue;
    }

    const magCapacity = 30;
    const reloadDuration = 3.6;
    if (aa.ammoInMag === undefined) aa.ammoInMag = magCapacity;
    if (aa.reloadTimer > 0) {
      aa.reloadTimer = Math.max(0, aa.reloadTimer - dt);
      if (aa.reloadTimer <= 0) aa.ammoInMag = magCapacity;
    }

    if (!activeCombat || inFarpSafeZone) {
      aa.lockTimer = Math.max(0, aa.lockTimer - dt * 1.5);
      aa.burstLeft = 0;
      continue;
    }

    const radarOnline = aa.variant === 'radar' ? Boolean(aa.linkedRadar && !aa.linkedRadar.destroyed) : false;
    const maxRange = aa.variant === 'radar' ? (radarOnline ? 280 : 165) : 225;
    const maxEngageAgl = 9999;
    const lockRequired = aa.variant === 'radar' ? (radarOnline ? 1.15 : 2.5) : 1.45;
    const spread = aa.variant === 'radar' ? (radarOnline ? 0.028 : 0.072) : 0.036;
    const burstSize = aa.variant === 'radar' ? (radarOnline ? 6 : 4) : 5;
    const burstCooldown = aa.variant === 'radar' ? (radarOnline ? 1.55 : 2.5) : 1.75;
    const projSpeed = 175;

    const muzzleOriginY = aa.pos.y + 1.4;
    const dist = Math.hypot(drone.pos.x - aa.pos.x, drone.pos.y - muzzleOriginY, drone.pos.z - aa.pos.z);
    const hasLOS = dist <= maxRange && agl <= maxEngageAgl && hasTerrainLineOfSight(aa.pos.x, muzzleOriginY + 0.5, aa.pos.z, drone.pos.x, drone.pos.y, drone.pos.z);

    if (!hasLOS) {
      aa.lockTimer = Math.max(0, aa.lockTimer - dt * 1.2);
      aa.burstLeft = 0;
      aa.hasFiredAtTarget = false;
      continue;
    }

    // Lead target prediction
    const leadT = dist / projSpeed;
    _aaVecA.set(
      drone.pos.x + drone.vel.x * leadT * (isRifleSquad ? 0.65 : 0.85),
      drone.pos.y + drone.vel.y * leadT * (isRifleSquad ? 0.5 : 0.65),
      drone.pos.z + drone.vel.z * leadT * (isRifleSquad ? 0.65 : 0.85)
    );

    const dx = _aaVecA.x - aa.pos.x;
    const dy = _aaVecA.y - muzzleOriginY;
    const dz = _aaVecA.z - aa.pos.z;
    const horiz = Math.max(0.1, Math.hypot(dx, dz));
    const targetYaw = Math.atan2(-dx, -dz);
    const rawPitch = Math.atan2(dy, horiz);
    const targetPitch = THREE.MathUtils.clamp(rawPitch, -0.05, 1.30);

    // Smoothly slew turret / infantry aim
    const slewRate = isRifleSquad ? 4.2 : (radarOnline ? 3.2 : 1.85);
    let yawDiff = targetYaw - aa.yawGroup.rotation.y;
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
    aa.yawGroup.rotation.y += THREE.MathUtils.clamp(yawDiff, -slewRate * dt, slewRate * dt);
    aa.pitchGroup.rotation.x += THREE.MathUtils.clamp(targetPitch - aa.pitchGroup.rotation.x, -slewRate * dt, slewRate * dt);

    // Bunker overhead roof blind spot (rear half z < 0.35m) & zenith high-elevation deadzone (> ~74.5°)
    if (isRifleSquad) {
      const blockedByRoof = dz < 0.35 && rawPitch > 0.62;
      const inZenithDeadzone = rawPitch > 1.30;
      if (blockedByRoof || inZenithDeadzone) {
        aa.burstLeft = 0;
        aa.lockTimer = Math.max(0, aa.lockTimer - dt * 1.2);
        continue;
      }
      // Body & rifle alignment gate (~9 deg)
      if (Math.abs(yawDiff) > 0.16 || Math.abs(targetPitch - aa.pitchGroup.rotation.x) > 0.16) {
        aa.burstLeft = 0;
        continue;
      }
    }

    aa.lockTimer = Math.min(lockRequired, aa.lockTimer + dt);
    if (aa.lockTimer < lockRequired) {
      if (!isRifleSquad && highestThreat === 'none') {
        highestThreat = 'track';
        threatText = radarOnline ? '偵測射控雷達追蹤' : '偵測雷射測距照明';
      }
      continue;
    }

    if (aa.reloadTimer > 0) {
      aa.burstLeft = 0;
      continue;
    }

    highestThreat = 'fire';
    threatText = isRifleSquad
      ? '地面輕兵器射擊告警'
      : (radarOnline ? '射控雷達鎖定・防砲射擊中' : '地面防空火砲射擊告警');

    if (aa.fireCooldown > 0) {
      aa.fireCooldown -= dt;
    } else if (aa.burstLeft <= 0) {
      aa.burstLeft = Math.min(burstSize, aa.ammoInMag);
      aa.burstInterval = 0;
      if (!aa.burstAimDir) aa.burstAimDir = new THREE.Vector3();
      aa.burstAimDir.set(dx, dy, dz).normalize();
    }

    if (aa.burstLeft > 0) {
      aa.burstInterval -= dt;
      if (aa.burstInterval <= 0) {
        aa.burstLeft -= 1;
        aa.ammoInMag = Math.max(0, aa.ammoInMag - 1);
        aa.burstInterval = isRifleSquad ? 0.14 : 0.11;
        if (aa.ammoInMag <= 0) {
          aa.burstLeft = 0;
          aa.reloadTimer = reloadDuration;
          aa.fireCooldown = 0;
          aa.hasFiredAtTarget = true;
        } else if (aa.burstLeft <= 0) {
          aa.fireCooldown = burstCooldown;
          aa.hasFiredAtTarget = true;
        }

        const bIdx = aa.barrelIndex % aa.muzzleFlashes.length;
        aa.barrelIndex += 1;
        const mf = aa.muzzleFlashes[bIdx];
        mf.visible = true;
        mf.rotation.z = Math.random() * Math.PI * 2;
        aa.flashTimer = 0.055;

        mf.getWorldPosition(_aaVecB);
        if (isRifleSquad && aa.burstAimDir) {
          _aaVecA.copy(aa.burstAimDir);
        } else {
          _aaVecA.set(dx, dy, dz).normalize();
        }
        _aaVecA.x += (Math.random() - 0.5) * spread;
        _aaVecA.y += (Math.random() - 0.5) * spread;
        _aaVecA.z += (Math.random() - 0.5) * spread;
        _aaVecA.normalize();

        if (isRifleSquad) {
          aa.recoilTimer = 1.0;
          spawnAATracer(_aaVecB, _aaVecA, projSpeed, 'rifle', `${aa.name} 步槍`, dist);
          audioEngine.playRifleShot(1.1 - dist / 130);
        } else {
          spawnAATracer(_aaVecB, _aaVecA, projSpeed, 'aaa', aa.name, dist);
          audioEngine.playAAAShot(1.15 - dist / 320);
        }
      }
    }
  }

  // 2. Update Tank Roof 12.7mm Close-In HMG
  for (const tank of tacticalState.tanks) {
    const parts = tank.tankParts;
    if (!parts || !parts.hmgYawGroup || !parts.hmgPitchGroup) continue;

    if (tank.hmgFlashTimer > 0) {
      tank.hmgFlashTimer -= dt;
      if (tank.hmgFlashTimer <= 0 && parts.hmgMuzzleFlash) parts.hmgMuzzleFlash.visible = false;
    }
    if (tank.hmgAmmo === undefined) tank.hmgAmmo = 24;
    if (tank.hmgReloadTimer > 0) {
      tank.hmgReloadTimer = Math.max(0, tank.hmgReloadTimer - dt);
      if (tank.hmgReloadTimer <= 0) tank.hmgAmmo = 24;
    }
    if (tank.destroyed || !activeCombat || inFarpSafeZone) {
      tank.hmgBurstLeft = 0;
      tank.hmgLockTimer = Math.max(0, (tank.hmgLockTimer || 0) - dt * 1.4);
      tank.hmgHasFired = false;
      continue;
    }

    const tankVis = getVisualAirDefenseModifiers();
    const hmgMaxRange = Math.round(92 * tankVis.rangeMult);
    const dist = Math.hypot(drone.pos.x - tank.pos.x, drone.pos.y - (tank.pos.y + 2.1), drone.pos.z - tank.pos.z);
    if (dist > hmgMaxRange || agl > 54 || !hasTerrainLineOfSight(tank.pos.x, tank.pos.y + 2.2, tank.pos.z, drone.pos.x, drone.pos.y, drone.pos.z)) {
      tank.hmgBurstLeft = 0;
      tank.hmgLockTimer = Math.max(0, (tank.hmgLockTimer || 0) - dt * 1.4);
      tank.hmgHasFired = false;
      continue;
    }

    if (tank.hmgReloadTimer > 0) {
      tank.hmgBurstLeft = 0;
      parts.hmgPitchGroup.rotation.x = THREE.MathUtils.lerp(parts.hmgPitchGroup.rotation.x, 0.05, dt * 3.5);
      continue;
    }

    const projSpeed = 155;
    const leadT = dist / projSpeed;
    _aaVecA.set(
      drone.pos.x + drone.vel.x * leadT * 0.8,
      drone.pos.y + drone.vel.y * leadT * 0.6,
      drone.pos.z + drone.vel.z * leadT * 0.8
    );

    // Transform target lead point into tank turret local space
    tank.turret.updateWorldMatrix(true, false);
    _aaLocalTarget.copy(_aaVecA);
    tank.turret.worldToLocal(_aaLocalTarget);
    const ldx = _aaLocalTarget.x - parts.hmgYawGroup.position.x;
    const ldy = _aaLocalTarget.y - (parts.hmgYawGroup.position.y + 0.2);
    const ldz = _aaLocalTarget.z - parts.hmgYawGroup.position.z;
    const lHoriz = Math.max(0.1, Math.hypot(ldx, ldz));
    const desiredYaw = Math.atan2(-ldx, -ldz);
    const rawPitch = Math.atan2(ldy, lHoriz);
    const desiredPitch = THREE.MathUtils.clamp(rawPitch, -0.08, 1.25);

    let yDiff = desiredYaw - parts.hmgYawGroup.rotation.y;
    while (yDiff > Math.PI) yDiff -= Math.PI * 2;
    while (yDiff < -Math.PI) yDiff += Math.PI * 2;
    parts.hmgYawGroup.rotation.y += THREE.MathUtils.clamp(yDiff, -4.5 * dt, 4.5 * dt);
    parts.hmgPitchGroup.rotation.x += THREE.MathUtils.clamp(desiredPitch - parts.hmgPitchGroup.rotation.x, -4.5 * dt, 4.5 * dt);

    // Overhead high-elevation deadzone (> +71.6° / 1.25 rad) & below-depression blind spot
    if (rawPitch > 1.25 || rawPitch < -0.10) {
      tank.hmgBurstLeft = 0;
      tank.hmgLockTimer = Math.max(0, (tank.hmgLockTimer || 0) - dt * 1.4);
      continue;
    }

    // Gunner reaction delay (1.05s + visibility penalty) & barrel alignment check (~8 deg)
    const hmgLockReq = 1.05 + tankVis.lockAdd;
    tank.hmgLockTimer = Math.min(hmgLockReq, (tank.hmgLockTimer || 0) + dt);
    const yawAligned = Math.abs(yDiff) <= 0.14;
    const pitchAligned = Math.abs(desiredPitch - parts.hmgPitchGroup.rotation.x) <= 0.14;
    if (tank.hmgLockTimer < hmgLockReq || !yawAligned || !pitchAligned) {
      tank.hmgBurstLeft = 0;
      continue;
    }

    if (highestThreat !== 'fire') {
      highestThreat = 'fire';
      threatText = '近距地面火網射擊告警';
    }

    tank.hmgCooldown = (tank.hmgCooldown || 0) - dt;
    if (tank.hmgCooldown <= 0 && (tank.hmgBurstLeft || 0) <= 0) {
      tank.hmgBurstLeft = Math.min(4, tank.hmgAmmo);
      tank.hmgInterval = 0;
      if (!tank.hmgBurstDir) tank.hmgBurstDir = new THREE.Vector3();
      parts.hmgMuzzleFlash.getWorldPosition(_aaVecB);
      tank.hmgBurstDir.copy(_aaVecA).sub(_aaVecB).normalize();
    }
    if ((tank.hmgBurstLeft || 0) > 0) {
      tank.hmgInterval -= dt;
      if (tank.hmgInterval <= 0) {
        tank.hmgBurstLeft -= 1;
        tank.hmgAmmo = Math.max(0, tank.hmgAmmo - 1);
        tank.hmgInterval = 0.095;
        if (tank.hmgAmmo <= 0) {
          tank.hmgBurstLeft = 0;
          tank.hmgReloadTimer = 4.2;
          tank.hmgCooldown = 0;
          tank.hmgHasFired = true;
        } else if (tank.hmgBurstLeft <= 0) {
          tank.hmgCooldown = 2.3;
          tank.hmgHasFired = true;
        }

        if (parts.hmgMuzzleFlash) {
          parts.hmgMuzzleFlash.visible = true;
          parts.hmgMuzzleFlash.rotation.z = Math.random() * Math.PI * 2;
          tank.hmgFlashTimer = 0.045;
        }
        parts.hmgMuzzleFlash.getWorldPosition(_aaVecB);
        if (tank.hmgBurstDir) {
          _aaVecA.copy(tank.hmgBurstDir);
        } else {
          _aaVecA.sub(_aaVecB).normalize();
        }
        const isMoving = Math.abs(tank.patrolSpeed || 0) > 0.2;
        const speedPenalty = THREE.MathUtils.clamp(drone.vel.length() / 22, 0, 1.5) * 0.045;
        const firstHmgPenalty = !tank.hmgHasFired ? 0.032 : 0;
        const hmgSpread = 0.042 + tankVis.spreadAdd + speedPenalty + firstHmgPenalty + (isMoving ? 0.018 : 0) + (tank.trackDamaged ? 0.025 : 0);
        _aaVecA.x += (Math.random() - 0.5) * hmgSpread;
        _aaVecA.y += (Math.random() - 0.5) * hmgSpread;
        _aaVecA.z += (Math.random() - 0.5) * hmgSpread;
        _aaVecA.normalize();

        spawnAATracer(_aaVecB, _aaVecA, projSpeed, 'hmg', `${tank.name} 車頂重機槍`, dist);
        createBallisticPuff(_aaVecB.x, _aaVecB.y, _aaVecB.z, 'muzzle_smoke');
        audioEngine.playHMGShot(1.1 - dist / 110);
      }
    }
  }

  // 3. Update Active AA Projectiles & Collision
  for (let i = tacticalState.aaProjectiles.length - 1; i >= 0; i--) {
    const p = tacticalState.aaProjectiles[i];
    p.life += dt;
    p.prevPos.copy(p.pos);
    const drag = p.kind === 'aaa' ? 0.04 : p.kind === 'hmg' ? 0.14 : 0.22;
    p.vel.multiplyScalar(Math.max(0.2, 1 - drag * dt));
    p.vel.y -= 9.81 * dt;
    p.pos.addScaledVector(p.vel, dt);
    p.traveled += p.vel.length() * dt;
    p.mesh.position.copy(p.pos);
    _aaVecA.copy(p.vel).normalize();
    p.mesh.quaternion.setFromUnitVectors(_aaForward, _aaVecA);

    const hitGround = p.pos.y <= wildernessHeight(p.pos.x, p.pos.z) + 0.1;
    let remove = p.life >= p.maxLife || hitGround;
    if (hitGround) {
      createBallisticPuff(p.pos.x, p.pos.y + 0.12, p.pos.z, 'ground_dust');
    }

    if (!remove && p.life > 0.045) {
      const cKey = `${wildernessColliderCell(p.pos.x)},${wildernessColliderCell(p.pos.z)}`;
      const cIndices = wildernessColliderCells.get(cKey);
      if (cIndices) {
        for (let ci = 0; ci < cIndices.length; ci++) {
          const box = wildernessColliders[cIndices[ci]];
          if (p.pos.x >= box.minX && p.pos.x <= box.maxX &&
              p.pos.y >= box.minY && p.pos.y <= box.maxY &&
              p.pos.z >= box.minZ && p.pos.z <= box.maxZ) {
            createBallisticPuff(p.pos.x, p.pos.y, p.pos.z, 'hit_spark');
            remove = true;
            break;
          }
        }
      }
    }

    if (!remove && !drone.crashed) {
      const hitDist = closestDistPointToSegment(drone.pos, p.prevPos, p.pos);
      if (hitDist <= 0.80) {
        const dir = _aaVecA.copy(p.vel).normalize();
        let hitDmg = 28;
        if (p.kind === 'hmg') {
          const falloff = THREE.MathUtils.clamp((p.traveled - 25) / 67, 0, 1);
          hitDmg = Math.round(14 * (1 - falloff * 0.40));
        } else if (p.kind !== 'aaa') {
          const falloff = THREE.MathUtils.clamp((p.traveled - 30) / 88, 0, 1);
          hitDmg = Math.round(8 * (1 - falloff * 0.45));
        }
        damageDroneFromAA(hitDmg, p.sourceLabel, dir);
        createBallisticPuff(p.pos.x, p.pos.y, p.pos.z, 'hit_spark');
        if (p.kind === 'aaa') createFlakBurst(p.pos.x, p.pos.y, p.pos.z);
        remove = true;
      } else if (p.kind === 'aaa' && p.traveled >= p.fuseDist) {
        createFlakBurst(p.pos.x, p.pos.y, p.pos.z);
        if (p.pos.distanceTo(drone.pos) <= 4.8) {
          const dir = _aaVecA.subVectors(drone.pos, p.pos).normalize();
          damageDroneFromAA(18, `${p.sourceLabel} 近炸破片`, dir);
        }
        remove = true;
      }
    }

    if (remove) {
      scene.remove(p.mesh);
      tacticalState.aaProjectiles.splice(i, 1);
    }
  }

  // 4. Update Flak Bursts
  for (let i = tacticalState.aaFlakBursts.length - 1; i >= 0; i--) {
    const fb = tacticalState.aaFlakBursts[i];
    fb.life += dt;
    const t = fb.life / fb.maxLife;
    if (t >= 1) {
      fb.puffs.forEach((pf) => pf.sprite.material.dispose());
      scene.remove(fb.group);
      tacticalState.aaFlakBursts.splice(i, 1);
      continue;
    }
    fb.puffs.forEach((pf) => {
      if (pf.isCore) {
        const coreT = Math.min(1, t * 4.5);
        pf.sprite.scale.setScalar(pf.baseScale * (0.5 + coreT * 0.9));
        pf.sprite.material.opacity = Math.max(0, 0.95 * (1 - coreT));
      } else {
        pf.sprite.scale.setScalar(pf.baseScale * (0.55 + t * 1.15));
        pf.sprite.material.opacity = 0.72 * (1 - t);
      }
    });
  }

  // 5. Update RWR HUD & Audio Beep
  tacticalState.rwrLevel = highestThreat;
  if (highestThreat !== 'none') {
    tacticalState.rwrBeepTimer -= dt;
    if (tacticalState.rwrBeepTimer <= 0) {
      audioEngine.playRWRBeep(highestThreat === 'fire');
      tacticalState.rwrBeepTimer = highestThreat === 'fire' ? 0.36 : 0.85;
    }
  } else {
    tacticalState.rwrBeepTimer = 0;
  }
  updateRWRUI(highestThreat, threatText);
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

      // Compensate for optical pod transient pitch and roll
      const effForward = relForward - alt * Math.tan(gimbalPod.currentPitch || 0);
      const effRight = relRight - alt * Math.tan(gimbalPod.currentRoll || 0);

      const rawSvgX = effRight * scale;
      const rawSvgY = -effForward * scale;

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
  const eoPodGroup = new THREE.Group();
  eoPodGroup.position.set(0, -.37, -.73);
  tiltGroup.add(eoPodGroup);
  const eoHousingMat = frame.clone();
  const eoLensMat = glass.clone();
  const eoDownLensMat = lens.clone();
  vehiclePart(eoPodGroup, new THREE.SphereGeometry(.19, 24, 16), eoHousingMat, 0, 0, 0);
  const lensRing = vehiclePart(eoPodGroup, new THREE.CylinderGeometry(.108,.12,.05,20),
    motorMetal, 0, -.01, -.158);
  lensRing.rotation.x = Math.PI / 2;
  vehiclePart(eoPodGroup, new THREE.SphereGeometry(.086,20,12), eoLensMat, 0, -.01, -.192).scale.z = .37;
  vehiclePart(eoPodGroup, new THREE.SphereGeometry(.069,16,10), eoDownLensMat, .06, -.14, -.06).scale.y = .48;

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
  const rotorData = [];
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
    const capMat = motorMetal.clone();
    const capMesh = vehiclePart(tiltGroup,motorCap,capMat,x,.13,z);
    vehiclePart(tiltGroup,new THREE.CylinderGeometry(.08,.09,.26,10),frame,x,-.12,z);
    vehiclePart(tiltGroup,sensor,new THREE.MeshBasicMaterial({color:z<0?0xf05a45:0x53c995}),x,-.11,z-.09);
    const rotor = new THREE.Group();
    rotor.position.set(x,.205,z);
    tiltGroup.add(rotor);
    vehiclePart(rotor,spinner,motorMetal,0,.027,0);
    const bladeA = vehiclePart(rotor,blade,bladeMat,0,.012,0);
    const bladeB = vehiclePart(rotor,blade,bladeMat,0,.012,0);
    bladeB.rotation.y = Math.PI;
    rotors.push(rotor);
    rotorData.push({ group: rotor, blades: [bladeA, bladeB], capMat, capMesh, pos: new THREE.Vector3(x, .205, z) });
  }
  return { root, tiltGroup, rotors, rotorData, shellMat: shell, eoPodGroup, eoHousingMat, eoLensMat, eoDownLensMat };
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

// Realistic Aerodynamic Tip Vortex Wake (翼尖水氣渦流)
const TRAIL_MAX = 28;
const trailPointsL = [];
const trailPointsR = [];
const trailPositionsL = new Float32Array(TRAIL_MAX * 3);
const trailPositionsR = new Float32Array(TRAIL_MAX * 3);
const trailAlphasL = new Float32Array(TRAIL_MAX);
const trailAlphasR = new Float32Array(TRAIL_MAX);

const trailGeoL = new THREE.BufferGeometry();
trailGeoL.setAttribute('position', new THREE.BufferAttribute(trailPositionsL, 3));
trailGeoL.setAttribute('aAlpha', new THREE.BufferAttribute(trailAlphasL, 1));

const trailGeoR = new THREE.BufferGeometry();
trailGeoR.setAttribute('position', new THREE.BufferAttribute(trailPositionsR, 3));
trailGeoR.setAttribute('aAlpha', new THREE.BufferAttribute(trailAlphasR, 1));

const trailMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.NormalBlending,
  uniforms: {
    uBaseColor: { value: new THREE.Color(0xf8fafc) }, // Atmospheric translucent mist white
    uOpacity: { value: 0.0 }
  },
  vertexShader: `
    attribute float aAlpha;
    varying float vAlpha;
    void main() {
      vAlpha = aAlpha;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 uBaseColor;
    uniform float uOpacity;
    varying float vAlpha;
    void main() {
      float a = vAlpha * uOpacity;
      if (a < 0.005) discard;
      gl_FragColor = vec4(uBaseColor, a);
    }
  `
});

const trailLineL = new THREE.Line(trailGeoL, trailMat);
const trailLineR = new THREE.Line(trailGeoR, trailMat);
trailLineL.frustumCulled = false;
trailLineR.frustumCulled = false;
scene.add(trailLineL, trailLineR);

function updateWingtipTrails(dt = 0.016) {
  // Only render in Chase camera mode
  if (state.cameraMode !== 'chase' || !playerDroneMesh || !playerDroneMesh.rotors || playerDroneMesh.rotors.length < 4) {
    trailMat.uniforms.uOpacity.value = 0.0;
    trailPointsL.length = 0;
    trailPointsR.length = 0;
    trailGeoL.setDrawRange(0, 0);
    trailGeoR.setDrawRange(0, 0);
    return;
  }

  const speed = Math.hypot(drone.vel.x, drone.vel.z);
  const ctrl = sampleFlightControls();

  // 1. Aerodynamic Blade Loading & Maneuver G-Force Factor
  // Real blade tip vortices require high blade loading: sharp banking, rapid pitch/roll changes, or boost
  const turnG = Math.min(1.0, (Math.abs(drone.pitchRate) + Math.abs(drone.rollRate)) * 0.85 + Math.abs(drone.yawRate) * 0.45);
  const climbLoad = ctrl.throttle > 0 ? (ctrl.throttle * 0.45) : 0;
  const boostLoad = ctrl.boost ? 0.70 : 0;

  // 2. Weather Moisture Scaling
  const wName = state.weather;
  const humidity = (wName === 'heavy_rain' ? 1.0 : (wName === 'drizzle' ? 0.90 : (wName === 'fog' ? 0.85 : (wName === 'cloudy' ? 0.55 : 0.35))));

  // Dynamic Speed Inception: in dry weather, needs fast cruise (> 5.8 m/s); in rain/fog, threshold lowers (~3.6 m/s)
  const speedBaseline = 5.8 - (humidity - 0.35) * 3.4;
  const speedEnergy = THREE.MathUtils.clamp((speed - speedBaseline) / 8.5, 0, 1.0);

  // Total Aerodynamic Wake Intensity
  const wakeEnergy = speedEnergy * 0.50 + turnG * 0.38 + climbLoad * 0.25 + boostLoad;
  const moistureMult = 0.85 + humidity * 0.35;
  const totalIntensity = wakeEnergy * moistureMult;

  // Golden Ratio Balance between Realism and Visual Effect:
  // - Low-speed hover & gentle taxiing (< 5.0 m/s): ZERO trail (clean & realistic)
  // - Fast cruise (> 8.0 m/s): Subtle, elegant mist streamer starts to feather out (~0.16 ~ 0.25 opacity)
  // - High-G turns / sharp banking / boost: Dynamic, prominent vapor trails (~0.30 ~ 0.60 opacity)
  const threshold = 0.14;
  const isCondensing = totalIntensity >= threshold && speed > 3.0 && !drone.crashed;

  let targetOpacity = 0.0;
  if (isCondensing) {
    const norm = Math.min(1.0, (totalIntensity - threshold) / 0.70);
    targetOpacity = 0.15 + norm * 0.45; // Smooth transition: 0.15 up to 0.60
  }
  trailMat.uniforms.uOpacity.value = THREE.MathUtils.lerp(trailMat.uniforms.uOpacity.value, targetOpacity, Math.min(1, dt * 6.5));

  // Sample exact 3D rotor tips (rear left & rear right rotors: rotors[2] and rotors[3])
  if (isCondensing) {
    const leftTip = new THREE.Vector3();
    const rightTip = new THREE.Vector3();
    playerDroneMesh.rotors[2].getWorldPosition(leftTip);
    playerDroneMesh.rotors[3].getWorldPosition(rightTip);

    trailPointsL.push(leftTip);
    trailPointsR.push(rightTip);
    if (trailPointsL.length > TRAIL_MAX) {
      trailPointsL.shift();
      trailPointsR.shift();
    }
  } else if (trailPointsL.length > 0) {
    trailPointsL.shift();
    trailPointsR.shift();
  }

  const n = trailPointsL.length;
  if (n < 2 || trailMat.uniforms.uOpacity.value < 0.01) {
    trailGeoL.setDrawRange(0, 0);
    trailGeoR.setDrawRange(0, 0);
    return;
  }

  // Realistic Turbulent Downwash & Wake Dissipation Drift
  for (let i = 0; i < n; i++) {
    const age = (n - 1 - i); // 0 at head (newest), n-1 at tail (oldest)
    // Downwash suction pushes older trailing air downwards
    trailPointsL[i].y -= 1.15 * dt * (age / n);
    trailPointsR[i].y -= 1.15 * dt * (age / n);

    // Pack into BufferAttributes
    const idx = i * 3;
    trailPositionsL[idx + 0] = trailPointsL[i].x;
    trailPositionsL[idx + 1] = trailPointsL[i].y;
    trailPositionsL[idx + 2] = trailPointsL[i].z;

    trailPositionsR[idx + 0] = trailPointsR[i].x;
    trailPositionsR[idx + 1] = trailPointsR[i].y;
    trailPositionsR[idx + 2] = trailPointsR[i].z;

    // Organic non-linear vapor fading curve (fades softly as wake dissipates)
    const normalizedLife = i / (n - 1);
    const alphaVal = Math.pow(normalizedLife, 1.35);
    trailAlphasL[i] = alphaVal;
    trailAlphasR[i] = alphaVal;
  }

  trailGeoL.attributes.position.needsUpdate = true;
  trailGeoL.attributes.aAlpha.needsUpdate = true;
  trailGeoL.setDrawRange(0, n);

  trailGeoR.attributes.position.needsUpdate = true;
  trailGeoR.attributes.aAlpha.needsUpdate = true;
  trailGeoR.setDrawRange(0, n);
}

// ============================================================================
// 13. FLIGHT PHYSICS, COLLISION & RACE LOGIC
// ============================================================================
function resetDroneTransform(x, y, z, yaw = 0) {
  drone.crashed = false;
  drone.crashState = 'none';
  drone.tumbleTimer = 0;
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
  drone.hullHp = 100;
  if (drone.damage) {
    drone.damage.rotorHealth = [1.0, 1.0, 1.0, 1.0];
    drone.damage.fuselageScorch = 0;
    drone.damage.controlGlitch = 0;
    drone.damage.cameraHealth = 1.0;
    drone.damage.smokeTimer = 0;
  }
  drone.collisionCooldown = 0;
  trailPointsL.length = 0;
  trailPointsR.length = 0;
  if (typeof applyDroneVisualDamage === 'function') applyDroneVisualDamage();
  if (typeof clearGCSDamageFeed === 'function') clearGCSDamageFeed();
  if (typeof updateRWRUI === 'function') updateRWRUI('none', '');

  playerDroneMesh.root.position.copy(drone.pos);
  playerDroneMesh.root.rotation.set(0, drone.yaw, 0);
  playerDroneMesh.tiltGroup.rotation.set(0, 0, 0);

  if (typeof resetGimbalPod === 'function') resetGimbalPod();

  document.getElementById('landing-indicator').classList.remove('visible');
}

function respawnAtLastCheckpoint(withPenalty = false) {
  drone.crashed = false;
  drone.crashState = 'none';
  drone.tumbleTimer = 0;
  const crashOverlay = document.getElementById('crash-overlay');
  if (crashOverlay) crashOverlay.classList.add('hidden');
  if (state.cameraMode === 'down') {
    toggleCameraMode('chase');
  }

  if (state.gameMode === 'tactical_strike') {
    resetDroneTransform(0, 1.2, 0, 0);
    if (withPenalty && state.raceActive) {
      tacticalState.crashes = (tacticalState.crashes || 0) + 1;
      state.collisionCount += 5; // Catastrophic crash penalty (-25 pts)
      showAnnouncement('FARP RESPAWN', '已於前進基地重新整裝放飛 (墜毀扣分)', '#ef4444');
    } else {
      showAnnouncement('FARP RESPAWN', '已重置回臨時放飛點', '#00f0ff');
    }
    return;
  }
  const isTraining = state.gameMode === 'training';
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
    if (withPenalty && state.raceActive) {
      state.penaltyTime += 5.0;
      state.collisionCount += 1;
      showAnnouncement('CRASH RESPAWN +5.0s', '已於步驟起點重新起飛', '#ef4444');
    } else {
      showAnnouncement('TRAINING RESET', '已重置回當前訓練步驟起點', '#00f0ff');
    }
    return;
  }

  const cp = state.lastCheckpoint || { pos: { x: 0, y: 1.2, z: 0 }, yaw: 0 };
  resetDroneTransform(cp.pos.x, cp.pos.y, cp.pos.z, cp.yaw);

  if (withPenalty && state.raceActive && state.gameMode !== 'free_flight') {
    state.penaltyTime += 5.0;
    state.collisionCount += 1;
    showAnnouncement('CHECKPOINT +5.0s', '已重置至上一檢查點 (加罰5秒)', '#ef4444');
  } else {
    showAnnouncement('POSITION RESET', '位置已重置', '#00f0ff');
  }
}

function triggerDroneCrash(causeText, impactSpeed = 0, type = 'obstacle') {
  if (drone.crashed) return;
  drone.crashed = true;
  drone.crashCause = causeText;
  drone.crashSpeed = impactSpeed;
  drone.pitchRate = 0;
  drone.rollRate = 0;
  drone.yawRate = 0;

  const inWilderness = state.gameMode === 'tactical_strike';
  const ground = inWilderness ? wildernessHeight(drone.pos.x, drone.pos.z) : 0;
  const agl = drone.pos.y - ground - 0.95;

  // Mid-air collision at altitude (side walls/airframes/trees/wires): initiate violent uncontrolled tumble descent;
  // direct ground or solid building roof impact settles onto the surface instead of pushing downward through it.
  if (type !== 'ground' && type !== 'roof' && agl > 0.45) {
    drone.crashState = 'tumbling';
    drone.tumbleTimer = 0;
    // Initial asymmetric spin impulse: brief pitch/roll flip + sustained yaw spin
    drone.tumbleSpinX = (Math.random() > 0.5 ? 1 : -1) * (5.5 + Math.random() * 4.5);
    drone.tumbleSpinY = (Math.random() > 0.5 ? 1 : -1) * (5.5 + Math.random() * 5.5);
    drone.tumbleSpinZ = (Math.random() > 0.5 ? 1 : -1) * (6.5 + Math.random() * 5.0);

    // Aerodynamic tumble trajectory: retain deflected horizontal momentum, start downward plunge
    drone.vel.x *= 0.7;
    drone.vel.z *= 0.7;
    drone.vel.y = Math.min(drone.vel.y, -3.8);

    triggerDamageFlash();
    audioEngine.playCollisionAlert();
    showAnnouncement('OUT OF CONTROL', '姿態失控・失速墜落中！', '#ef4444');
    // Note: Do NOT display crash-overlay card yet! Wait until ground impact.
    return;
  }

  // Low altitude / direct ground crash: settle immediately
  settleDroneCrash();
}

function settleDroneCrash() {
  if (drone.crashState === 'settled') return;
  drone.crashState = 'settled';
  drone.vel.set(0, 0, 0);
  drone.pitchRate = 0;
  drone.rollRate = 0;
  drone.yawRate = 0;

  // Visual airframe wreckage tilt onto ground
  drone.pitch += (Math.random() - 0.5) * 0.45;
  drone.roll += (Math.random() < 0.5 ? 1 : -1) * (0.65 + Math.random() * 0.35);

  if (playerDroneMesh && playerDroneMesh.root && playerDroneMesh.tiltGroup) {
    playerDroneMesh.root.position.copy(drone.pos);
    playerDroneMesh.root.rotation.set(0, drone.yaw, 0);
    playerDroneMesh.tiltGroup.rotation.order = 'YXZ';
    playerDroneMesh.tiltGroup.rotation.set(drone.pitch, 0, drone.roll);
  }

  triggerDamageFlash();
  audioEngine.playCrashShatter();
  audioEngine.updateRotorSound(0, 0, false);

  // User requirement: Wait until ground touch, then show warning card after brief impact pause
  setTimeout(() => {
    if (drone.crashState !== 'settled') return;
    const crashOverlay = document.getElementById('crash-overlay');
    const causeEl = document.getElementById('crash-cause-text');
    const penEl = document.getElementById('crash-penalty-text');

    const isTactical = state.gameMode === 'tactical_strike';
    const kmh = (drone.crashSpeed * 3.6).toFixed(0);
    if (causeEl) causeEl.textContent = `${drone.crashCause} (${kmh} km/h)・機體結構受損斷槳`;
    if (penEl) {
      if (isTactical) {
        penEl.textContent = '戰場懲罰：墜毀失誤計入結算 (−25分)・按 R 於 FARP 重生';
      } else {
        penEl.textContent = '競速懲罰：加計 +5.0s 懲罰時間・失誤次數 +1';
      }
    }
    if (crashOverlay) crashOverlay.classList.remove('hidden');
  }, 450);
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
    const lbl = box.label || '';
    const isSolidSupport = !box.isWire &&
      (box.maxX - box.minX) >= 1.8 &&
      (box.maxZ - box.minZ) >= 1.8 &&
      !lbl.includes('樹') && !lbl.includes('號誌') && !lbl.includes('電線') && !lbl.includes('柵欄');
    const isRoof = y > 0.5 && isSolidSupport;
    const crashThreshold = box.isWire ? 3.2 : 7.2;
    if (closingSpeed >= crashThreshold) {
      const cause = box.isWire
        ? '旋翼纏繞高架電纜'
        : (box.label ? `撞擊${box.label}` : '高速撞擊結構障礙');
      triggerDroneCrash(cause, closingSpeed, isRoof ? 'roof' : 'obstacle');
      return isRoof ? 'roof' : 'side';
    }
    const impulse = closingSpeed * (closingSpeed >= 2.4 ? 1.25 : 1);
    vel.x += impulse * x;
    vel.y += impulse * y;
    vel.z += impulse * z;
    reportImpact(box.label, closingSpeed);
    return isRoof ? 'roof' : 'side';
  }
  return null;
}

function syncDynamicColliders(dt, inWilderness) {
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
    return [tacticalTargetColliders];
  }
  for (const box of movingColliders) {
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
  for (const box of crossingBarrierColliders) {
    box.object.updateWorldMatrix(true, false);
    setColliderBounds(box, wildernessBounds.setFromObject(box.object));
  }
  return [buildingColliders, movingColliders, crossingBarrierColliders];
}

const colliderCenter = new THREE.Vector3();
function updateDronePhysics(dt) {
  if (drone.crashed) {
    if (drone.crashState === 'tumbling') {
      drone.tumbleTimer += dt;
      // 1. Pitch/roll flip decays quickly via airframe drag; yaw spin persists longer with aerodynamic buffet
      const prDamp = Math.max(0, 1 - 1.35 * dt);
      const yawDamp = Math.max(0, 1 - 0.28 * dt);
      drone.tumbleSpinX *= prDamp;
      drone.tumbleSpinZ *= prDamp;
      drone.tumbleSpinY *= yawDamp;
      const buffet = Math.min(1, drone.tumbleTimer * 0.8);
      drone.pitch += (drone.tumbleSpinX + Math.sin(drone.tumbleTimer * 5.4) * 1.1 * buffet) * dt;
      drone.yaw += drone.tumbleSpinY * dt;
      drone.roll += (drone.tumbleSpinZ + Math.cos(drone.tumbleTimer * 4.8) * 1.3 * buffet) * dt;

      // 2. True gravitational acceleration (-9.81 m/s^2) + environmental wind drift + quadratic airframe drag
      const inWilderness = state.gameMode === 'tactical_strike';
      const groundNow = inWilderness ? wildernessHeight(drone.pos.x, drone.pos.z) : 0;
      const tumbleAgl = Math.max(0, drone.pos.y - groundNow - 0.95);
      const tumbleWeather = (typeof WEATHER_PROFILES !== 'undefined' && WEATHER_PROFILES[state.weather]) ? WEATHER_PROFILES[state.weather] : null;
      if (tumbleWeather && tumbleAgl > 0.2) {
        const tW = performance.now() * 0.001;
        const shearW = computeWindShearMultiplier(tumbleAgl);
        const wAngT = (tumbleWeather.windAngle || 0.4) + Math.sin(tW * 0.85) * 0.14;
        const wSpd = tumbleWeather.windSpeed * shearW;
        drone.vel.x += Math.cos(wAngT) * wSpd * 0.45 * dt;
        drone.vel.z += Math.sin(wAngT) * wSpd * 0.45 * dt;
      }
      drone.vel.y -= 9.81 * dt;
      const tumbleSpeed = drone.vel.length();
      if (tumbleSpeed > 0.01) {
        const dragRatio = Math.min(0.85, (0.014 * tumbleSpeed + 0.08) * dt);
        drone.vel.multiplyScalar(1 - dragRatio);
      }

      // 3. Sub-stepped position & obstacle/building collision during fall (syncs moving/tactical colliders)
      const tumbleColliders = syncDynamicColliders(dt, inWilderness);
      const steps = Math.max(1, Math.ceil(drone.vel.length() * dt / (drone.radius * 0.35)));
      let settledOnRoof = false;

      for (let step = 0; step < steps; step++) {
        drone.pos.addScaledVector(drone.vel, dt / steps);
        if (inWilderness && resolveWildernessContacts()) {
          settledOnRoof = true;
        }
        for (const boxes of tumbleColliders) {
          for (const box of boxes) {
            if (resolveBoxContact(box) === 'roof') settledOnRoof = true;
          }
        }
        if (!inWilderness) {
          const { halfWidth, north, south } = CITY_BOUNDS;
          const x = THREE.MathUtils.clamp(drone.pos.x, -halfWidth, halfWidth);
          const z = THREE.MathUtils.clamp(drone.pos.z, north, south);
          if (x !== drone.pos.x) drone.vel.x *= -0.35;
          if (z !== drone.pos.z) drone.vel.z *= -0.35;
          drone.pos.x = x;
          drone.pos.z = z;
        }
        if (settledOnRoof) break;
        const groundStep = inWilderness ? wildernessHeight(drone.pos.x, drone.pos.z) : 0;
        if (drone.pos.y <= groundStep + 0.95) {
          drone.pos.y = groundStep + 0.95;
          settledOnRoof = true;
          break;
        }
      }

      // Sputtering damaged motor sound
      const sputter = Math.max(0, (1 - drone.tumbleTimer * 0.45) * 0.35);
      audioEngine.updateRotorSound(sputter, 0, false);

      // 4. Actual surface/ground contact detection (no mid-air timeout teleport)
      const ground = inWilderness ? wildernessHeight(drone.pos.x, drone.pos.z) : 0;
      if (settledOnRoof || drone.pos.y <= ground + 0.95) {
        if (drone.pos.y < ground + 0.95) drone.pos.y = ground + 0.95;
        settleDroneCrash();
        return;
      }

      // Update 3D mesh for tumbling airframe
      if (playerDroneMesh && playerDroneMesh.root && playerDroneMesh.tiltGroup) {
        playerDroneMesh.root.position.copy(drone.pos);
        playerDroneMesh.root.rotation.set(0, drone.yaw, 0);
        playerDroneMesh.tiltGroup.rotation.order = 'YXZ';
        playerDroneMesh.tiltGroup.rotation.set(drone.pitch, 0, drone.roll);
      }
      return;
    }

    drone.vel.set(0, 0, 0);
    audioEngine.updateRotorSound(0, 0, false);
    return;
  }
  const ctrl = sampleFlightControls();
  const isPowerLost = !!(drone.battery && drone.battery.percent <= 0);
  if (isPowerLost) {
    ctrl.throttle = 0;
    ctrl.boost = false;
    ctrl.brake = false;
    if (!drone.battery.emptyWarned) {
      drone.battery.emptyWarned = true;
      if (typeof showAnnouncement === 'function') {
        showAnnouncement('BATTERY DEPLETED (0%)', '動力電池耗盡・馬達斷電自由墜落中！', '#ef4444');
      }
    }
  } else if (drone.battery && drone.battery.percent <= 6) {
    // Emergency power derating: limit climb throttle before lift/thrust calculation
    if (ctrl.throttle > 0.15) ctrl.throttle = 0.15;
  }
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

  // 0.1 Battle-Damage Aerodynamic & Propulsion Degradation
  const rh = (drone.damage && drone.damage.rotorHealth) ? drone.damage.rotorHealth : [1, 1, 1, 1];
  const avgRotorEff = (rh[0] + rh[1] + rh[2] + rh[3]) * 0.25;
  const deadRotors = rh.reduce((acc, h) => acc + (h <= 0.05 ? 1 : 0), 0);
  if (deadRotors >= 2 || avgRotorEff < 0.50) {
    if (agl > 1.8) {
      triggerDroneCrash('多軸動力失效・失控墜落', drone.vel.length(), 'propulsion');
      return;
    }
  }
  const hasMotorPower = !isPowerLost && deadRotors < 2 && avgRotorEff >= 0.50;
  const rollImbalance = ((rh[1] + rh[3]) - (rh[0] + rh[2])) * 0.5;   // >0 when left rotors damaged -> leans left
  const pitchImbalance = ((rh[2] + rh[3]) - (rh[0] + rh[1])) * 0.5;  // >0 when front rotors damaged -> pitches nose down
  const yawImbalance = ((rh[0] + rh[3]) - (rh[1] + rh[2])) * 0.5;    // CW vs CCW torque mismatch
  const hasChippedBlade = rh.some((h) => h > 0.05 && h < 0.99);
  const rotorShake = hasChippedBlade ? 1.0 : (avgRotorEff < 0.99 ? 0.45 : 0);
  const battPct = drone.battery ? drone.battery.percent : 100;
  const battSagFactor = battPct < 20 ? THREE.MathUtils.lerp(0.76, 1.0, Math.max(0, battPct) / 20) : 1.0;
  const airDensityFactor = Math.exp(-Math.max(0, drone.pos.y) / 8500.0);
  const damageThrustFactor = hasMotorPower ? (avgRotorEff * battSagFactor * airDensityFactor) : 0;
  const damageControlFactor = Math.max(0.55, 1.0 - (drone.damage?.controlGlitch || 0) * 0.35);

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

  // Ground contact & landing state: multi-rotor drones cannot yaw or drift against ground friction without airborne lift
  const isGrounded = agl <= 0.05 && drone.vel.y <= 0.15 && ctrl.throttle <= 0;

  // 1. Yaw (scaled by payload rotational inertia + Crosswind Weathercocking Torque + VRS torque)
  if (isGrounded) {
    drone.yawRate = 0;
  } else if (!hasMotorPower) {
    drone.yawRate *= Math.max(0, 1 - 0.65 * dt);
    drone.yaw += drone.yawRate * dt;
  } else {
    const vrsYawTwitch = vrs > 0.14
      ? (Math.sin(tNow * 8.2) * 0.42 + Math.cos(tNow * 15.1) * 0.28) * vrs
      : 0;
    const weathercockYaw = -(meanRight * 0.008 + gustRight * 0.024) * THREE.MathUtils.clamp(curWind / 8.0, 0, 1.4) * inertiaScale;
    const turbYaw = (Math.sin(tNow * 5.4) * 0.22 + Math.cos(tNow * 9.7) * 0.14) * turb * inertiaScale;
    const yawAuthority = (1.0 - vrs * 0.28) * damageControlFactor;
    const damageYawDrift = yawImbalance * 0.32;
    const targetYawRate = ctrl.yaw * p.yawMaxRate * inertiaScale * yawAuthority + weathercockYaw + turbYaw + vrsYawTwitch + damageYawDrift;
    drone.yawRate += (targetYawRate - drone.yawRate) * Math.min(1, p.yawResponse * inertiaScale * damageControlFactor * dt);
    drone.yaw += drone.yawRate * dt;
  }

  // 2. 2nd-Order Rotational Spring-Damper Attitude Dynamics (Pitch & Roll + Wind Lean + Blade-Flapping Gusts + VRS)
  if (isGrounded) {
    drone.pitch = 0;
    drone.roll = 0;
    drone.pitchRate = 0;
    drone.rollRate = 0;
  } else if (!hasMotorPower) {
    // Unpowered free-fall attitude: no flight-controller stabilization, slight aerodynamic instability
    drone.pitchRate += ((Math.sin(tNow * 3.1) * 1.4 + pitchImbalance * 2.5) - drone.pitchRate * 0.35) * dt;
    drone.rollRate += ((Math.cos(tNow * 2.7) * 1.6 - rollImbalance * 2.5) - drone.rollRate * 0.35) * dt;
    drone.pitch += drone.pitchRate * dt;
    drone.roll += drone.rollRate * dt;
  } else {
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

    const cyclicAuthority = (1.0 - vrs * 0.25) * damageControlFactor;
    const dmgPitchBias = pitchImbalance * 0.14 + (rotorShake > 0 ? Math.sin(tNow * 24.5) * 0.018 * rotorShake : 0);
    const dmgRollBias = -rollImbalance * 0.16 + (rotorShake > 0 ? Math.cos(tNow * 27.3) * 0.022 * rotorShake : 0);
    const targetPitch = (ctrl.brake ? fcWindLeanPitch : -ctrl.pitch * p.maxTiltAngle * cyclicAuthority + windPitchPerturb) + vrsPitchBuffet + dmgPitchBias;
    const targetRoll = (ctrl.brake ? fcWindLeanRoll : -ctrl.roll * p.maxTiltAngle * cyclicAuthority + windRollPerturb) + vrsRollBuffet + dmgRollBias;
    const omegaN = p.tiltResponse * 2.15 * inertiaScale * damageControlFactor * (1.0 - vrs * 0.24);
    // Critically damped attitude dynamic stabilization (zeta ~ 0.98 in Stabilized) to eliminate forward flight wobble
    const zeta = (isSport ? 0.78 : 0.98) * (1.0 - vrs * 0.28);
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
  }

  // 3. Thrust-Vector Tilting Propulsion & Quadratic Airframe Drag
  if (isGrounded) {
    drone.vel.x = 0;
    drone.vel.z = 0;
  } else if (!hasMotorPower) {
    // Unpowered ballistic trajectory: no rotor thrust, only aerodynamic frame drag
    const hSpeed = Math.hypot(drone.vel.x, drone.vel.z);
    const airDrag = (0.014 * hSpeed + 0.08) * dt;
    const damp = Math.max(0, 1 - airDrag);
    drone.vel.x *= damp;
    drone.vel.z *= damp;
  } else if (ctrl.brake) {
    // Active aerodynamic flare braking (horizontal axes only; vertical motion remains governed by lift/gravity)
    const brakeEff = 6.5 * inertiaScale * (1.0 - vrs * 0.35);
    drone.vel.x *= Math.max(0, 1 - brakeEff * dt);
    drone.vel.z *= Math.max(0, 1 - brakeEff * dt);
  } else {
    const maxTiltSin = Math.max(0.15, Math.sin(p.maxTiltAngle));
    const tiltForward = THREE.MathUtils.clamp(-Math.sin(drone.pitch) / maxTiltSin, -1.25, 1.25);
    const tiltRight = THREE.MathUtils.clamp(-Math.sin(drone.roll) / maxTiltSin, -1.25, 1.25);
    const vrsThrustLoss = 1.0 - vrs * (cyclicEscapeInput < 0.2 ? 0.55 : 0.15);
    const effPitchDrive = (tiltForward * 0.72 + ctrl.pitch * 0.28) * vrsThrustLoss;
    const effRollDrive = (tiltRight * 0.72 + ctrl.roll * 0.28) * vrsThrustLoss;

    const accelMag = ((p.maxHorizontalAccel * boostMult) / Math.pow(drone.massRatio, 0.28)) * (0.4 + 0.6 * damageThrustFactor);
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
  if (!hasMotorPower) {
    // True power cut: -9.81 m/s^2 gravity + quadratic vertical air drag (terminal velocity ~26 m/s)
    if (!isGrounded || drone.vel.y > 0) {
      drone.vel.y -= 9.81 * dt;
      const vDrag = (0.014 * Math.abs(drone.vel.y) + 0.08) * dt;
      drone.vel.y *= Math.max(0, 1 - vDrag);
    }
  } else {
    const cosTilt = Math.max(0.45, Math.cos(drone.pitch) * Math.cos(drone.roll));
    // In Stabilized mode, flight controller dynamically compensates tilt-induced vertical lift loss (~96%) to eliminate cruising altitude bobbing
    const tiltLossCompensation = state.flightMode === 'stabilized' ? 0.96 : 0.42;
    const uncompensatedTiltDrop = (1.0 - cosTilt) * (1.0 - tiltLossCompensation) * 9.81;

    if (Math.abs(ctrl.throttle) > 0.05) {
      if (ctrl.throttle > 0) {
        // Climbing: reduced efficiency if currently inside VRS wake or rotor damaged
        const climbEfficiency = (drone.groundEffectFactor / Math.pow(drone.massRatio, 0.25)) * (1.0 - vrs * 0.68) * damageThrustFactor;
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
    // Severe single/partial rotor damage lift deficit: unable to sustain full hover when thrust < 72%
    if (damageThrustFactor < 0.72 && !isGrounded) {
      drone.vel.y -= (0.72 - damageThrustFactor) * 14.0 * dt;
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
  }

  // 4.5 Dynamic 6S LiPo Battery Physics: Real-time Load Current, Voltage Sag & Capacity Drain
  if (drone.battery) {
    let currentDraw = 0.8; // Avionics + telemetry baseline load
    if (isGrounded) {
      currentDraw = 1.6; // Ground idle motor RPM
    } else {
      // Hover power: ~14.0A baseline at 23V, scaled by mass ratio and IGE cushion
      const baseHover = (14.2 * drone.massRatio) / Math.max(0.85, drone.groundEffectFactor);
      const climbCurrent = ctrl.throttle > 0 ? (ctrl.throttle * 12.5) : (ctrl.throttle < 0 ? -2.0 : 0);
      const tiltMag = Math.sin(Math.max(Math.abs(drone.pitch), Math.abs(drone.roll)));
      const maneuverCurrent = (tiltMag / 0.45) * 8.5 + (Math.hypot(drone.vel.x, drone.vel.z) / 25.0) * 6.5;
      const boostCurrent = ctrl.boost ? 18.5 : 0;
      const brakeCurrent = ctrl.brake ? 4.5 : 0;

      currentDraw = baseHover + climbCurrent + maneuverCurrent + boostCurrent + brakeCurrent;
      currentDraw = THREE.MathUtils.clamp(currentDraw, 3.2, 54.0);
    }

    // Low-pass filter load current for realistic electrical inertia
    drone.battery.currentAmps = THREE.MathUtils.lerp(drone.battery.currentAmps, currentDraw, Math.min(1, dt * 8.0));

    // Capacity integration: mAh = (Amps * dt / 3.6) * dischargeSpeedFactor
    // With 1.45x factor, 6000mAh pack provides ~10-12 mins of cruise or ~6-7 mins of high-G racing
    const drainMah = (drone.battery.currentAmps * dt / 3.6) * 1.45;
    drone.battery.remainingMah = Math.max(0, drone.battery.remainingMah - drainMah);
    const soc = drone.battery.remainingMah / drone.battery.capacityMah;
    drone.battery.percent = Math.max(0, Math.min(100, Math.round(soc * 100)));

    // Open circuit voltage (OCV) from 6S LiPo chemistry curve
    drone.battery.openCircuitVoltage = computeOpenCircuitVoltage6S(soc);

    // Instantaneous Voltage Sag under load (V = Voc - I * R_int)
    const voltageSag = drone.battery.currentAmps * drone.battery.internalResistance;
    const loadedV = Math.max(18.0, drone.battery.openCircuitVoltage - voltageSag);
    drone.battery.voltage = THREE.MathUtils.lerp(drone.battery.voltage, loadedV, Math.min(1, dt * 6.0));

    // Low battery audio-visual alerts
    if (drone.battery.percent <= 20 && !drone.battery.lowBattWarned) {
      drone.battery.lowBattWarned = true;
      if (typeof showAnnouncement === 'function') {
        showAnnouncement('LOW BATTERY (20%)', '動力電壓低於 21.6V，建議儘速返航 (RTH)', '#f59e0b');
      }
    }
    if (drone.battery.percent <= 10 && !drone.battery.critBattWarned) {
      drone.battery.critBattWarned = true;
      if (typeof showAnnouncement === 'function') {
        showAnnouncement('CRITICAL BATTERY (10%)', '電壓危險臨界！飛控已限制大油門輸出', '#ef4444');
      }
    }
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
  const collisionGroups = syncDynamicColliders(dt, inWilderness);
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
        const dropSpeed = -drone.vel.y;
        const horizSpeed = Math.hypot(drone.vel.x, drone.vel.z);
        const tiltAngle = Math.max(Math.abs(drone.pitch), Math.abs(drone.roll));

        // Catastrophic hard ground slam or inverted prop strike
        if (dropSpeed >= 6.8 || (horizSpeed >= 8.5 && tiltAngle > 0.38)) {
          triggerDroneCrash(dropSpeed >= 6.8 ? '超速垂直重砸地表' : '高速翻滾打地 (Prop Strike)', Math.max(dropSpeed, horizSpeed), 'ground');
          return;
        }

        drone.vel.y = dropSpeed >= 5 ? dropSpeed * .18 : 0;
        if (dropSpeed >= 4.2) reportImpact('地面重著陸', dropSpeed);
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
  if (hasMotorPower) {
    drone.rotorAngle += (38 + hSpeed * 1.5) * dt;
    playerDroneMesh.rotors.forEach((rg, idx) => {
      const rHealth = (drone.damage && drone.damage.rotorHealth) ? drone.damage.rotorHealth[idx] : 1.0;
      if (rHealth <= 0.05) {
        // Dead motor: rotor stopped
        return;
      }
      const speedScale = rHealth < 0.99 ? 0.58 : 1.0;
      rg.rotation.y = drone.rotorAngle * speedScale * (idx % 2 === 0 ? 1 : -1);
      if (rHealth < 0.99) {
        rg.rotation.x = Math.sin(drone.rotorAngle * 0.7) * 0.09;
      }
    });
    audioEngine.updateRotorSound(hSpeed, ctrl.throttle, ctrl.boost);
  } else {
    audioEngine.updateRotorSound(0, 0, false);
  }
  updateWingtipTrails(dt);
  updateDroneDamageParticles(dt);
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
          drone.hullHp = 100;
          if (drone.damage) {
            drone.damage.rotorHealth = [1.0, 1.0, 1.0, 1.0];
            drone.damage.fuselageScorch = 0;
            drone.damage.controlGlitch = 0;
            drone.damage.cameraHealth = 1.0;
            drone.damage.smokeTimer = 0;
          }
          if (typeof applyDroneVisualDamage === 'function') applyDroneVisualDamage();
          if (typeof clearGCSDamageFeed === 'function') clearGCSDamageFeed();
          updateRWRUI('none', '');
          updateDroneBellyBombs();
          audioEngine.playGateChime();
          showAnnouncement('REARM & REPAIR COMPLETE!', `已補給至 ${loadLimit} 枚並完成機體檢修。`, '#10b981');
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
  const isTraining = state.gameMode === 'training';
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

// 3-Axis Gyro-Stabilized EO/IR Targeting Pod Dynamic State
const gimbalPod = {
  currentPitch: 0,
  currentRoll: 0,
  mountOffsetX: 0,
  mountOffsetY: 0,
  mountOffsetZ: 0,
  prevVel: new THREE.Vector3(),
  hasPrevVel: false
};

function resetGimbalPod() {
  gimbalPod.currentPitch = 0;
  gimbalPod.currentRoll = 0;
  gimbalPod.mountOffsetX = 0;
  gimbalPod.mountOffsetY = 0;
  gimbalPod.mountOffsetZ = 0;
  gimbalPod.hasPrevVel = false;
  camera.up.set(0, 1, 0);
}

function updateGimbalPodPhysics(dt) {
  // 1. Airframe attitude inertia perturbation
  // High-performance brushless gimbals isolate ~93% of airframe tilt, leaving ~6.8% transient compliance lag
  const camDamaged = (drone.damage?.cameraHealth ?? 1.0) < 0.99;
  const lagPitchFactor = camDamaged ? 0.55 : 0.068;
  const lagRollFactor = camDamaged ? 0.55 : 0.068;
  const maxDeflection = camDamaged ? 0.28 : 0.040; // Damaged gimbal loses stabilization and sways with airframe
  const targetPitchLag = THREE.MathUtils.clamp(drone.pitch * lagPitchFactor, -maxDeflection, maxDeflection);
  const targetRollLag = THREE.MathUtils.clamp(drone.roll * lagRollFactor, -maxDeflection, maxDeflection);

  // Brushless motor restoring dynamics: critically damped recovery towards nadir (~14 rad/s)
  const motorStiffness = camDamaged ? 4.2 : 14.0;
  gimbalPod.currentPitch += (targetPitchLag - gimbalPod.currentPitch) * Math.min(1.0, motorStiffness * dt);
  gimbalPod.currentRoll += (targetRollLag - gimbalPod.currentRoll) * Math.min(1.0, motorStiffness * dt);
  if (camDamaged) {
    const jTime = performance.now() * 0.001;
    gimbalPod.currentPitch += Math.sin(jTime * 27.0) * 0.012;
    gimbalPod.currentRoll += Math.cos(jTime * 23.0) * 0.014;
  }

  // 2. Aerodynamic airflow flutter & weather disturbance at high airspeeds
  const airspeed = drone.vel.length();
  const aeroSpeedRatio = Math.min(2.0, airspeed / 12.0);
  const weatherMult = state.weather === 'typhoon' ? 2.4 : (state.weather === 'heavy_rain' ? 1.5 : (state.weather === 'drizzle' ? 1.1 : (state.weather === 'clear' ? 0.0 : 0.6)));
  const flutterAmp = (0.0005 + 0.0014 * aeroSpeedRatio) * weatherMult;
  const t = performance.now() * 0.001;
  const flutterPitch = (Math.sin(t * 19.3) * 0.58 + Math.cos(t * 31.7) * 0.42) * flutterAmp;
  const flutterRoll = (Math.cos(t * 22.7) * 0.58 + Math.sin(t * 28.3) * 0.42) * flutterAmp;

  // 3. Silicone damping ball bracket compliance (linear G-force inertia F = -ma)
  if (gimbalPod.hasPrevVel && dt > 0.0001) {
    const ax = (drone.vel.x - gimbalPod.prevVel.x) / dt;
    const ay = (drone.vel.y - gimbalPod.prevVel.y) / dt;
    const az = (drone.vel.z - gimbalPod.prevVel.z) / dt;
    const targetDispX = THREE.MathUtils.clamp(-ax * 0.0024, -0.035, 0.035);
    const targetDispY = THREE.MathUtils.clamp(-ay * 0.0020, -0.025, 0.025);
    const targetDispZ = THREE.MathUtils.clamp(-az * 0.0024, -0.035, 0.035);

    gimbalPod.mountOffsetX += (targetDispX - gimbalPod.mountOffsetX) * Math.min(1.0, 16.0 * dt);
    gimbalPod.mountOffsetY += (targetDispY - gimbalPod.mountOffsetY) * Math.min(1.0, 16.0 * dt);
    gimbalPod.mountOffsetZ += (targetDispZ - gimbalPod.mountOffsetZ) * Math.min(1.0, 16.0 * dt);
  } else {
    gimbalPod.hasPrevVel = true;
  }
  gimbalPod.prevVel.copy(drone.vel);

  return {
    totalPitch: gimbalPod.currentPitch + flutterPitch,
    totalRoll: gimbalPod.currentRoll + flutterRoll
  };
}

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
    camera.up.set(0, 1, 0);
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

    // Synchronous critically smoothed camera tracking (11.5x) eliminates visual pitch phase lag during acceleration
    smoothCamPos.lerp(targetCam, Math.min(1, 11.5 * dt));
    smoothLookAt.lerp(targetLook, Math.min(1, 11.5 * dt));

    camera.position.copy(smoothCamPos);
    camera.lookAt(smoothLookAt);
    if (vrs > 0.12) camera.rotation.z += shakeRoll;
    playerDroneMesh.root.visible = true;
  } else if (state.cameraMode === 'down') {
    if (drone.crashState === 'tumbling') {
      // Optical gimbal stabilizer power cut: tilts and tumbles locked with airframe
      camera.up.set(0, 1, 0);
      camera.position.set(drone.pos.x, drone.pos.y - 0.25, drone.pos.z);
      camera.rotation.order = 'YXZ';
      camera.rotation.y = drone.yaw;
      camera.rotation.x = drone.pitch - Math.PI * 0.5;
      camera.rotation.z = drone.roll;
      playerDroneMesh.root.visible = false;
    } else {
      // 3-Axis Gyro-Stabilized EO/IR Targeting Pod with Real Inertial Lag & Damping Dynamics
      const { totalPitch, totalRoll } = updateGimbalPodPhysics(dt);

      const hX = -Math.sin(drone.yaw);
      const hZ = -Math.cos(drone.yaw);
      const rX = Math.cos(drone.yaw);
      const rZ = -Math.sin(drone.yaw);

      // Optical boresight: nadir -Y plus transient pitch/roll deflections
      const camFwd = new THREE.Vector3(
        hX * totalPitch + rX * totalRoll,
        -1.0,
        hZ * totalPitch + rZ * totalRoll
      ).normalize();

      // Camera UP vector: drone forward plus subtle roll compensation
      const camUp = new THREE.Vector3(
        hX - rX * (totalRoll * 0.25),
        totalPitch,
        hZ - rZ * (totalRoll * 0.25)
      ).normalize();

      camera.position.set(
        drone.pos.x + gimbalPod.mountOffsetX + shakeX * 0.2,
        drone.pos.y + gimbalPod.mountOffsetY + shakeY * 0.15,
        drone.pos.z + gimbalPod.mountOffsetZ + shakeZ * 0.2
      );
      camera.up.copy(camUp);
      camera.lookAt(
        camera.position.x + camFwd.x,
        camera.position.y + camFwd.y,
        camera.position.z + camFwd.z
      );
      playerDroneMesh.root.visible = false;
    }
  } else {
    // FPV View (hard-mounted nose camera shows airframe attitude + subtle high-freq vibration)
    camera.up.set(0, 1, 0);
    camera.position.set(drone.pos.x + fX * 0.8 + shakeX * 0.25, drone.pos.y + 0.06 + shakeY * 0.25, drone.pos.z + fZ * 0.8 + shakeZ * 0.25);
    camera.rotation.order = 'YXZ';
    if (drone.crashState === 'tumbling') {
      camera.rotation.y = drone.yaw;
      camera.rotation.x = drone.pitch;
      camera.rotation.z = drone.roll;
    } else {
      camera.rotation.y = drone.yaw + shakeRoll * 0.3;
      camera.rotation.x = drone.pitch * 0.65 + shakeY * 0.08;
      camera.rotation.z = drone.roll * 0.55 + shakeRoll * 0.6;
    }
    playerDroneMesh.root.visible = false;
  }

  for (const {car, direction, speed} of roadVehicles) {
    car.position.x += direction * speed * dt;
    if (car.position.x > CITY_BOUNDS.halfWidth) car.position.x = -CITY_BOUNDS.halfWidth;
    if (car.position.x < -CITY_BOUNDS.halfWidth) car.position.x = CITY_BOUNDS.halfWidth;
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

  const isTraining = state.gameMode === 'training';
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
          chipTank.textContent = `TANK 戰車 ${tanksDestroyed}/2`;
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
        const instruction = getFlightGamepad() ? curTask.descGamepad
          : state.keymapMode === 'dual' ? curTask.descDual : curTask.descSingle;
        if (stepInst.innerHTML !== instruction) stepInst.innerHTML = instruction;
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
  document.getElementById('bar-altitude').style.width = `${Math.min(100, (agl / 500.0) * 100)}%`;

  document.getElementById('hud-vspeed').textContent = drone.vel.y.toFixed(1);
  const vsiArrowEl = document.getElementById('hud-vsi-arrow');
  if (vsiArrowEl) {
    if (drone.vel.y > 0.25) {
      vsiArrowEl.textContent = '▲';
      vsiArrowEl.style.color = 'var(--emerald)';
    } else if (drone.vel.y < -0.25) {
      vsiArrowEl.textContent = '▼';
      vsiArrowEl.style.color = 'var(--amber)';
    } else {
      vsiArrowEl.textContent = '―';
      vsiArrowEl.style.color = 'var(--text-muted)';
    }
  }

  const isGroundedNow = agl <= 0.06 && Math.abs(drone.vel.y) < 0.25;

  const throttleStateEl = document.getElementById('hud-throttle-state');
  if (throttleStateEl) {
    if (isGroundedNow) {
      throttleStateEl.textContent = '著陸地面';
      throttleStateEl.style.color = '#94a3b8';
    } else if (drone.vrsSeverity > 0.25) {
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

  // Real-time Tactical Payload Status Update
  const payloadBox = document.getElementById('hud-payload-display');
  const payloadName = document.getElementById('hud-payload-name');
  const payloadStatus = document.getElementById('hud-payload-status');
  if (payloadBox && payloadName && payloadStatus) {
    if (isTactical) {
      payloadBox.style.display = 'flex';
      payloadName.textContent = `82mm 迫彈 ×${tacticalState.bombsRemaining}`;
      if (tacticalState.bombsRemaining > 0) {
        payloadStatus.textContent = '[ARMED]';
        payloadStatus.className = 'osd-armed-tag';
      } else {
        payloadStatus.textContent = '[EMPTY]';
        payloadStatus.className = 'osd-armed-tag empty';
      }
    } else {
      payloadBox.style.display = 'none';
    }
  }

  // Real-time 6S LiPo Battery Telemetry Update
  if (drone.battery) {
    const battVoltEl = document.getElementById('hud-batt-volt');
    const battPctEl = document.getElementById('hud-batt-pct');
    const battSlotEl = document.getElementById('hud-battery-slot');
    if (battVoltEl && battPctEl) {
      battVoltEl.textContent = `${drone.battery.voltage.toFixed(1)}V`;
      battPctEl.textContent = `${drone.battery.percent}%`;

      if (drone.battery.percent <= 12) {
        battVoltEl.style.color = '#ef4444';
        battPctEl.style.color = '#ef4444';
        if (battSlotEl) battSlotEl.classList.add('batt-crit');
      } else if (drone.battery.percent <= 25) {
        battVoltEl.style.color = '#f59e0b';
        battPctEl.style.color = '#f59e0b';
        if (battSlotEl) battSlotEl.classList.remove('batt-crit');
      } else {
        battVoltEl.style.color = '#ffffff';
        battPctEl.style.color = '#ffffff';
        if (battSlotEl) battSlotEl.classList.remove('batt-crit');
      }
    }
  }

  // Real-time Environmental Wind Vector Calculation
  const w = (typeof WEATHER_PROFILES !== 'undefined' && WEATHER_PROFILES[state.weather]) ? WEATHER_PROFILES[state.weather] : null;
  const windLevelEl = document.getElementById('hud-wind-level');
  const windTextEl = document.getElementById('hud-wind-text');
  if (w && windTextEl) {
    const curWind = (w.windSpeed || 0) * computeWindShearMultiplier(agl);
    if (curWind < 0.3) {
      if (windLevelEl) {
        windLevelEl.textContent = '0級 靜風';
        windLevelEl.style.color = '#ffffff';
      }
      windTextEl.textContent = 'CALM 0.0 m/s';
      windTextEl.style.color = '#ffffff';
    } else {
      const wAng = w.windAngle || 0.4;
      const wx = Math.cos(wAng) * curWind;
      const wz = Math.sin(wAng) * curWind;

      // Meteorological direction: direction FROM which wind blows
      let fromDeg = (Math.atan2(-wx, wz) * (180 / Math.PI) + 360) % 360;
      const cardinals = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
      const card = cardinals[Math.round(fromDeg / 22.5) % 16];
      const arrowList = ['↓', '↙', '←', '↖', '↑', '↗', '→', '↘'];
      const arrow = arrowList[Math.round(fromDeg / 45) % 8];

      let beaufort = '1級 軟風';
      let bColor = '#ffffff'; // Professional monochrome baseline
      if (curWind >= 13.9) { beaufort = '7級 疾風'; bColor = '#ef4444'; }
      else if (curWind >= 10.8) { beaufort = '6級 強風'; bColor = '#f87171'; }
      else if (curWind >= 8.0) { beaufort = '5級 清風'; bColor = '#f59e0b'; }
      else if (curWind >= 5.5) { beaufort = '4級 和風'; bColor = '#ffffff'; }
      else if (curWind >= 3.4) { beaufort = '3級 微風'; bColor = '#ffffff'; }
      else if (curWind >= 1.6) { beaufort = '2級 輕風'; bColor = '#ffffff'; }

      if (windLevelEl) {
        windLevelEl.textContent = beaufort;
        windLevelEl.style.color = bColor;
      }
      const degStr = Math.round(fromDeg).toString().padStart(3, '0');
      windTextEl.textContent = `${arrow} ${degStr}° ${card} ${curWind.toFixed(1)}m/s`;
      windTextEl.style.color = bColor;
    }
  }

  const pitchDeg = Math.round((-drone.pitch * 180) / Math.PI);
  const rollDeg = Math.round((-drone.roll * 180) / Math.PI);
  const attEl = document.getElementById('hud-attitude');
  if (attEl) {
    // Constant character length and sign padding prevents jittering
    const pSign = pitchDeg > 0 ? '+' : (pitchDeg < 0 ? '-' : ' ');
    const rSign = rollDeg > 0 ? '+' : (rollDeg < 0 ? '-' : ' ');
    const pVal = Math.abs(pitchDeg).toString().padStart(2, '0');
    const rVal = Math.abs(rollDeg).toString().padStart(2, '0');
    attEl.textContent = `P:${pSign}${pVal}° R:${rSign}${rVal}°`;
  }

  const mb = document.getElementById('hud-mode-badge');
  if (mb) {
    mb.textContent = state.flightMode === 'sport' ? 'SPORT' : 'POS-HOLD';
  }

  const boostStatusEl = document.getElementById('hud-boost-status');
  if (boostStatusEl) {
    const isBoosting = pressedKeys.has('ShiftLeft') || pressedKeys.has('ShiftRight') || pressedKeys.has('KeyU');
    boostStatusEl.textContent = isBoosting ? 'BOOST' : (isGroundedNow ? 'GROUND' : (hMps < 0.2 ? 'HOVER' : 'CRUISE'));
    boostStatusEl.style.color = isBoosting ? '#f59e0b' : (isGroundedNow ? '#94a3b8' : '#ffffff');
  }

  updateGCSBottomHints();

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
  const altCard = document.getElementById('hud-altitude-card');
  if (altCard) altCard.classList.toggle('dimmed', isDownCam);

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
  compassCtx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
  compassCtx.fillStyle = '#ffffff';
  compassCtx.font = '700 11px "JetBrains Mono", monospace';
  compassCtx.textAlign = 'center';

  for (let deg = -90; deg <= 450; deg += 15) {
    const diff = deg - heading;
    const x = w / 2 + diff * pxPerDeg;
    if (x < 0 || x > w) continue;

    const normDeg = ((deg % 360) + 360) % 360;
    const isCardinal = normDeg % 45 === 0;
    compassCtx.beginPath();
    compassCtx.moveTo(x, h - (isCardinal ? 12 : 7));
    compassCtx.lineTo(x, h);
    compassCtx.stroke();

    if (isCardinal) {
      const label = dirs[Math.round(normDeg / 45) % 8];
      compassCtx.fillStyle = '#ffffff';
      compassCtx.fillText(label, x, 14);
    }
  }
}

function drawTacticalMap(ctx, w, h, isFull) {
  const wilderness = state.gameMode === 'tactical_strike';

  ctx.clearRect(0, 0, w, h);
  if (isFull) {
    ctx.fillStyle = wilderness ? '#374a35' : '#273549';
  } else {
    // Semi-transparent tactical minimap terrain
    ctx.fillStyle = wilderness ? 'rgba(55, 74, 53, 0.68)' : 'rgba(39, 53, 73, 0.68)';
  }
  ctx.fillRect(0, 0, w, h);

  const width = CITY.maxX - CITY.minX;
  const depth = CITY.maxZ - CITY.minZ;
  const centerZ = (CITY.minZ + CITY.maxZ) / 2;
  const mapCenterZ = wilderness ? -133 : (CITY_BOUNDS.north + CITY_BOUNDS.south) / 2;
  const mapWidth = wilderness ? 400 : CITY_BOUNDS.halfWidth * 2;
  const mapDepth = wilderness ? 365 : CITY_BOUNDS.south - CITY_BOUNDS.north;
  const scale = Math.min(w / mapWidth, h / mapDepth);
  const toMapX = wx => w / 2 + wx * scale;
  const toMapY = wz => h / 2 + (wz - mapCenterZ) * scale;

  function rectangle(x, z, width, depth, color) {
    ctx.fillStyle = color;
    ctx.fillRect(toMapX(x - width / 2), toMapY(z - depth / 2), width * scale, depth * scale);
  }
  if (wilderness) {
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
    if (isFull) {
      ctx.font = 'bold 12px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#172232';
      ctx.fillStyle = '#f2eee6';
      const overviewLabels = ['市立小學', '市民公園', '商辦區', '起降廣場'];
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
    ctx.font = '700 9px "JetBrains Mono", sans-serif';
    ctx.fillText(returning ? 'RTH' : 'HOME', returnX + landingRing + 3, returnY + 3);

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

    // Draw Anti-Air 23mm AAA Emplacements
    tacticalState.aaSites.forEach((aa) => {
      const ax = toMapX(aa.pos.x);
      const ay = toMapY(aa.pos.z);
      if (aa.destroyed) {
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(ax - 3, ay - 3);
        ctx.lineTo(ax + 3, ay + 3);
        ctx.moveTo(ax + 3, ay - 3);
        ctx.lineTo(ax - 3, ay + 3);
        ctx.stroke();
      } else {
        ctx.fillStyle = '#f59e0b';
        ctx.strokeStyle = '#fef3c7';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(ax, ay - 4.5);
        ctx.lineTo(ax + 4.2, ay + 3.5);
        ctx.lineTo(ax - 4.2, ay + 3.5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#fde68a';
        ctx.font = 'bold 7.5px "JetBrains Mono", sans-serif';
        ctx.fillText(aa.variant === 'rifle_squad' ? 'INF' : 'AAA', ax + 6, ay + 3);
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
    const isTrainingMap = state.gameMode === 'training';
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
  ctx.restore(); // Restore drone rotation transform
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

  if (drone.crashed) {
    if (drone.crashState === 'tumbling') {
      vtxCtx.save();
      // 1. Digital glitch tearing horizontal slices & sync drop
      const tG = performance.now() * 0.007;
      const tearCount = 4 + Math.floor(Math.random() * 4);
      for (let i = 0; i < tearCount; i++) {
        const sliceY = (Math.sin(tG * 6.5 + i * 2.1) * 0.5 + 0.5) * h;
        const sliceH = 8 + Math.random() * 32;
        vtxCtx.fillStyle = Math.random() < 0.4 ? 'rgba(255, 255, 255, 0.35)' : 'rgba(0, 0, 0, 0.45)';
        vtxCtx.fillRect(0, sliceY, w, sliceH);

        // Random digital glitch pixel blocks
        if (Math.random() < 0.6) {
          vtxCtx.fillStyle = 'rgba(239, 68, 68, 0.42)';
          vtxCtx.fillRect(Math.random() * (w - 140), sliceY, 140, sliceH);
        }
      }

      // 2. High-speed chromatic / scanline bars
      for (let i = 0; i < 3; i++) {
        const barY = ((tG * 260 + i * 190) % h);
        vtxCtx.fillStyle = 'rgba(255, 255, 255, 0.25)';
        vtxCtx.fillRect(0, barY, w, 4 + Math.random() * 12);
      }

      // 3. Urgent OSD Warnings
      vtxCtx.font = 'bold 22px monospace';
      vtxCtx.fillStyle = (Math.floor(performance.now() / 120) % 2 === 0) ? '#ef4444' : '#ffffff';
      vtxCtx.textAlign = 'center';
      vtxCtx.shadowColor = '#000';
      vtxCtx.shadowBlur = 8;
      vtxCtx.fillText('⚠️ CRITICAL SYSTEM FAILURE: LOSS OF CONTROL ⚠️', w * 0.5, h * 0.28);
      vtxCtx.font = 'bold 15px monospace';
      vtxCtx.fillStyle = '#f59e0b';
      vtxCtx.fillText('IMU DESYNC・MOTOR UNBALANCED・FREE FALLING', w * 0.5, h * 0.33);

      vtxCtx.restore();
      return;
    }

    // Heavy analog TV snow / static noise & rolling scanline glitch (VTX Signal Lost)
    vtxCtx.save();
    vtxCtx.fillStyle = 'rgba(8, 10, 14, 0.94)';
    vtxCtx.fillRect(0, 0, w, h);

    const step = 4;
    const nx = Math.ceil(w / step);
    const ny = Math.ceil(h / step);
    for (let y = 0; y < ny; y += 2) {
      for (let x = 0; x < nx; x += 2) {
        if (Math.random() < 0.38) {
          const lum = Math.floor(Math.random() * 210 + 35);
          vtxCtx.fillStyle = `rgb(${lum},${lum},${lum})`;
          vtxCtx.fillRect(x * step, y * step, step * 2, step * 2);
        }
      }
    }

    const tG = performance.now() * 0.005;
    for (let i = 0; i < 4; i++) {
      const barY = ((tG * 160 + i * 230) % h);
      const barH = 16 + Math.random() * 45;
      vtxCtx.fillStyle = Math.random() < 0.5 ? 'rgba(255, 255, 255, 0.22)' : 'rgba(0, 0, 0, 0.45)';
      vtxCtx.fillRect(0, barY, w, barH);
    }

    vtxCtx.font = 'bold 22px monospace';
    vtxCtx.fillStyle = '#ef4444';
    vtxCtx.textAlign = 'center';
    vtxCtx.shadowColor = '#000';
    vtxCtx.shadowBlur = 6;
    vtxCtx.fillText('--- [ VTX SIGNAL LOST / 訊號中斷 ] ---', w * 0.5, h * 0.34);
    vtxCtx.font = '15px monospace';
    vtxCtx.fillStyle = '#f59e0b';
    vtxCtx.fillText('TRANSMITTER RX: 0 dBm  |  TELEMETRY LINK DOWN', w * 0.5, h * 0.38);

    vtxCtx.restore();
    return;
  }

  // 1. In Chase (Third-Person) mode, keep the view completely clean (external camera, no onboard VTX overlays)
  if (state.cameraMode !== 'chase') {
    const camHp = drone.damage?.cameraHealth ?? 1.0;

    // 1A. Complete EO-Pod Destruction: VTX Static Blackout for Onboard Cameras (Chase remains visual)
    if (camHp <= 0.05) {
      vtxCtx.save();
      vtxCtx.fillStyle = 'rgba(8, 10, 14, 0.95)';
      vtxCtx.fillRect(0, 0, w, h);
      const step = 4;
      const nx = Math.ceil(w / step);
      const ny = Math.ceil(h / step);
      for (let y = 0; y < ny; y += 2) {
        for (let x = 0; x < nx; x += 2) {
          if (Math.random() < 0.36) {
            const lum = Math.floor(Math.random() * 200 + 35);
            vtxCtx.fillStyle = `rgb(${lum},${lum},${lum})`;
            vtxCtx.fillRect(x * step, y * step, step * 2, step * 2);
          }
        }
      }
      const tG = performance.now() * 0.006;
      for (let i = 0; i < 4; i++) {
        const barY = ((tG * 170 + i * 210) % h);
        vtxCtx.fillStyle = Math.random() < 0.5 ? 'rgba(255, 255, 255, 0.22)' : 'rgba(0, 0, 0, 0.45)';
        vtxCtx.fillRect(0, barY, w, 14 + Math.random() * 40);
      }
      vtxCtx.font = 'bold 22px monospace';
      vtxCtx.fillStyle = '#ef4444';
      vtxCtx.textAlign = 'center';
      vtxCtx.shadowColor = '#000';
      vtxCtx.shadowBlur = 8;
      vtxCtx.fillText('[ EO-POD OFFLINE / 機載鏡頭損毀 ]', w * 0.5, h * 0.34);
      vtxCtx.font = 'bold 14px monospace';
      vtxCtx.fillStyle = '#fbbf24';
      vtxCtx.fillText('請按 [C] 切換第三人稱視角目視返航 FARP 檢修', w * 0.5, h * 0.39);
      vtxCtx.restore();
      return;
    }

    // 1B. Partial EO/VTX Sensor Damage: Electronic Static Noise & Sync Glitch (No Lens Cracks)
    if (camHp < 0.99) {
      const dmgSeverity = THREE.MathUtils.clamp(1.0 - camHp, 0.25, 0.85);
      const tNoise = performance.now() * 0.008;
      vtxCtx.save();

      // Animated static snow pattern
      if (vtxNoisePattern) {
        vtxCtx.globalAlpha = 0.28 + dmgSeverity * 0.36;
        vtxCtx.translate((Math.random() * 64) | 0, (Math.random() * 64) | 0);
        vtxCtx.fillStyle = vtxNoisePattern;
        vtxCtx.fillRect(-64, -64, w + 128, h + 128);
        vtxCtx.setTransform(1, 0, 0, 1, 0, 0);
      }

      // Intermittent horizontal scanline sync-tear & digital glitch bars
      vtxCtx.globalAlpha = 1.0;
      const glitchBurst = Math.sin(tNoise * 2.7) * Math.cos(tNoise * 4.3) > 0.25 ? 2 : 1;
      for (let i = 0; i < glitchBurst; i++) {
        if (Math.random() < 0.42 * dmgSeverity) {
          const sliceY = Math.random() * h;
          const sliceH = 3 + Math.random() * 14;
          vtxCtx.fillStyle = Math.random() < 0.5
            ? `rgba(255, 255, 255, ${0.10 + Math.random() * 0.14})`
            : `rgba(10, 14, 20, ${0.22 + Math.random() * 0.18})`;
          vtxCtx.fillRect(0, sliceY, w, sliceH);
          if (Math.random() < 0.45) {
            vtxCtx.fillStyle = 'rgba(56, 189, 248, 0.16)';
            vtxCtx.fillRect(Math.random() * Math.max(1, w - 160), sliceY, 90 + Math.random() * 120, sliceH);
          }
        }
      }

      // Subtle rolling interference band
      const bandY = ((tNoise * 95) % (h + 80)) - 40;
      const bandGrad = vtxCtx.createLinearGradient(0, bandY - 24, 0, bandY + 24);
      bandGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
      bandGrad.addColorStop(0.5, `rgba(220, 235, 255, ${0.06 + dmgSeverity * 0.08})`);
      bandGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      vtxCtx.fillStyle = bandGrad;
      vtxCtx.fillRect(0, bandY - 24, w, 48);

      vtxCtx.restore();
    }

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
  if ((drone.damage?.cameraHealth ?? 1.0) < 0.99) {
    setDownZoom(1);
    showAnnouncement('ZOOM JAMMED', '光電變焦馬達受損卡死（僅維持 1.0X）', '#f59e0b');
    return;
  }
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
  updateGCSBottomHints();
}

function updateGCSBottomHints() {
  const hintsEl = document.getElementById('gcs-bottom-hints');
  if (!hintsEl) return;
  const isDual = state.keymapMode === 'dual';
  const isTactical = state.gameMode === 'tactical_strike';
  const bombSpan = isTactical ? '<span id="gcs-hint-bomb"><kbd>B</kbd> 投彈</span>' : '';

  const usingGamepad = Boolean(getFlightGamepad());
  const isDownCam = state.cameraMode === 'down';
  const cacheKey = `${state.keymapMode}_${isTactical}_${usingGamepad}_${isDownCam}`;
  if (hintsEl._lastKeymap === cacheKey) return;
  hintsEl._lastKeymap = cacheKey;

  if (usingGamepad) {
    const gamepadBombSpan = isTactical ? '<span id="gcs-hint-bomb"><kbd>B鈕 / A鈕</kbd> 投彈</span>' : '';
    const zoomSpan = isDownCam ? '<span><kbd>X鈕</kbd> 變焦</span>' : '';
    hintsEl.innerHTML = `
      <span><kbd>左搖桿</kbd> 升降／轉向</span>
      <span><kbd>右搖桿</kbd> 前後／平移</span>
      ${gamepadBombSpan}
      ${zoomSpan}
      <span><kbd>R1</kbd> 視角</span>
      <span><kbd>L1</kbd> 感光模式</span>
      <span><kbd>L2</kbd> 懸停</span>
      <span><kbd>R2</kbd> 衝刺</span>
    `;
    return;
  }

  if (isDual) {
    hintsEl.innerHTML = `
      <span><kbd>W</kbd>/<kbd>S</kbd> 升降</span>
      <span><kbd>A</kbd>/<kbd>D</kbd> 轉向</span>
      <span><kbd>↑</kbd>/<kbd>↓</kbd> 前後</span>
      <span><kbd>←</kbd>/<kbd>→</kbd> 平移</span>
      <span><kbd>Space</kbd> 懸停</span>
      ${bombSpan}
      <span><kbd>C</kbd> 視角</span>
      <span><kbd>X</kbd> 感光模式</span>
      <span><kbd>M</kbd> 航圖</span>
    `;
  } else {
    hintsEl.innerHTML = `
      <span><kbd>W</kbd>/<kbd>S</kbd> 前後</span>
      <span><kbd>A</kbd>/<kbd>D</kbd> 平移</span>
      <span><kbd>Q</kbd>/<kbd>E</kbd> 轉向</span>
      <span><kbd>Shift</kbd>/<kbd>Ctrl</kbd> 升降</span>
      <span><kbd>Space</kbd> 懸停</span>
      ${bombSpan}
      <span><kbd>C</kbd> 視角</span>
      <span><kbd>X</kbd> 感光模式</span>
      <span><kbd>M</kbd> 航圖</span>
    `;
  }
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
  if (open) {
    toggleCameraMode('chase');
  }
  const m = document.getElementById('menu-modal');
  if (m) {
    m.classList.toggle('hidden', !open);
    m.style.display = open ? 'flex' : 'none';
    if (!open) {
      if (typeof window.setSkyEyeMenuHologramVisible === 'function') {
        window.setSkyEyeMenuHologramVisible(false);
      }
      if (playerDroneMesh && playerDroneMesh.tiltGroup) {
        playerDroneMesh.tiltGroup.rotation.set(0, 0, 0);
      }
    } else if (typeof window.skipSkyEyeIntroToMenu === 'function' && window._skyEyeIntroCompletedOnce) {
      window.skipSkyEyeIntroToMenu();
    }
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

function resetTargetTank(tank) {
  const parts = tank.tankParts;
  if (!parts) return;

  // 1. Reset game state flags & kinematic metrics
  tank.hp = tank.maxHp;
  tank.destroyed = false;
  tank.cookOff = false;
  tank.coasting = false;
  tank.coastSpeed = 0;
  tank.speedX = 0;
  tank.trackDamaged = false;
  tank.brokenTrackRibbonAdded = false;
  tank.coastSmokeTimer = 0;
  tank.trackSmokeTimer = 0;
  tank.wreckSmokeTimer = 0;
  tank.hitCount = 0;
  tank.stoppedAt = undefined;
  if (tank.baseSpeed) tank.patrolSpeed = tank.baseSpeed;
  if (tank.spawnPos) {
    tank.mesh.position.copy(tank.spawnPos);
    tank.pos = tank.mesh.position;
  }
  if (typeof tank.spawnDir === 'number') {
    tank.patrolDir = tank.spawnDir;
  }
  tank.yaw = -tank.patrolDir * Math.PI / 2;
  tank.turnState = 'cruising';
  tank.turnProgress = 0;
  tank.turnPauseTimer = 0;
  alignTankToRoad(tank);
  updateTankThermalSignature(tank, 0);

  // 2. Remove persistent wreck fire & lights
  if (tank.wreckFire) {
    if (tank.wreckFire.group && tank.wreckFire.group.parent) {
      tank.wreckFire.group.parent.remove(tank.wreckFire.group);
    }
    if (tank.wreckFire.sprites) {
      tank.wreckFire.sprites.forEach(s => {
        if (s.sprite && s.sprite.material) s.sprite.material.dispose();
      });
    }
    if (tank.wreckFire.light) {
      tank.wreckFire.light.dispose();
    }
    tank.wreckFire = null;
  }

  // 3. Clear all dynamic damageGroup children (craters, broken track ribbons, fire groups)
  if (parts.damageGroup) {
    while (parts.damageGroup.children.length > 0) {
      const child = parts.damageGroup.children[0];
      parts.damageGroup.remove(child);
      disposeWorldObject(child);
    }
  }

  // 4. Reset turret, cannon barrel, fume extractor, cupola hatch & antenna
  if (tank.turret) {
    tank.turret.visible = true;
    tank.turret.position.set(0, 1.38, -0.2);
    tank.turret.rotation.set(0, 0, 0);
    tank.turretTargetYaw = 0;
    tank.turretWait = 9 + Math.random() * 14;
  }
  if (parts.barrel) {
    parts.barrel.position.set(0, 0.05, -2.6);
    parts.barrel.rotation.set(0, 0, 0);
  }
  if (parts.fumeExtractor) {
    parts.fumeExtractor.position.set(0, 0.05, -2.82);
    parts.fumeExtractor.rotation.set(0, 0, 0);
  }
  if (parts.cupolaHatch) {
    parts.cupolaHatch.position.set(0.76, 0.54, 0.4);
    parts.cupolaHatch.rotation.set(0, 0, 0);
  }
  if (parts.antennaMesh) {
    parts.antennaMesh.position.set(0.66, 0.81, 1.36);
    parts.antennaMesh.rotation.set(0, 0, -0.18);
  }

  // 5. Hide internal breach wells
  if (parts.turretRingWell) parts.turretRingWell.visible = false;
  if (parts.engineBreachWell) parts.engineBreachWell.visible = false;

  // 6. Reset side skirts, ERA deck tiles, stowage boxes & engine vents
  if (parts.skirts && Array.isArray(parts.skirts)) {
    parts.skirts.forEach((s) => {
      s.detached = false;
      s.mesh.visible = true;
      if (s.seamMesh) s.seamMesh.visible = true;
      s.mesh.position.set(s.side * 1.84, 0.97, s.z);
      s.mesh.rotation.set(0, 0, 0);
    });
  }
  if (parts.deckTiles && Array.isArray(parts.deckTiles)) {
    parts.deckTiles.forEach((tile) => {
      tile.visible = true;
      tile.rotation.set(-0.32, 0, 0);
    });
  }
  if (parts.stowageBoxes && Array.isArray(parts.stowageBoxes)) {
    parts.stowageBoxes.forEach((box) => {
      box.visible = true;
    });
  }
  if (parts.engineVents && Array.isArray(parts.engineVents)) {
    parts.engineVents.forEach((v, i) => {
      v.visible = true;
      v.position.set(0, 1.24, 1.26 + i * 0.15);
      v.rotation.set(0, 0, 0);
    });
  }

  // 7. Reset wheel groups (axle rotation & position)
  if (parts.wheelGroups && Array.isArray(parts.wheelGroups)) {
    parts.wheelGroups.forEach((axle) => {
      axle.rotation.set(0, 0, 0);
      axle.position.y = 0.39;
    });
  }

  // 8. Restore pristine factory camouflage texture & materials
  if (parts.camouflageCanvas && parts.camouflageCtx && parts.camouflageTexture) {
    drawPristineTankCamouflage(parts.camouflageCanvas, parts.camouflageCtx, parts.colorHex || 0x3d4d35);
    parts.camouflageTexture.needsUpdate = true;
  }
  if (tank.armorMat) {
    tank.armorMat.color.setHex(0xffffff);
    tank.armorMat.roughness = 0.8;
    tank.armorMat.metalness = 0.19;
    tank.armorMat.needsUpdate = true;
  }
}

function resetFacilityTarget(t) {
  t.destroyed = false;
  t.damagedSmoke = false;
  t.hp = t.maxHp;
  t.hitCount = 0;
  t.wreckSmokeTimer = 0;
  if (t.thermal) updateRadarThermalSignature(t, 0);

  if (t.wreckFire) {
    if (t.wreckFire.group && t.wreckFire.group.parent) {
      t.wreckFire.group.parent.remove(t.wreckFire.group);
    }
    if (t.wreckFire.sprites) {
      t.wreckFire.sprites.forEach(s => {
        if (s.sprite && s.sprite.material) s.sprite.material.dispose();
      });
    }
    if (t.wreckFire.light) t.wreckFire.light.dispose();
    t.wreckFire = null;
  }

  if (t.mesh) {
    t.mesh.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      child.visible = true;
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

  if (t.type === 'radar') {
    if (t.dish) t.dish.visible = true;
  }
  if (t.type === 'ammo') {
    if (t.mesh && t.mesh.children) {
      t.mesh.children.forEach(part => { part.visible = true; });
    }
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
  drone.crashed = false;
  drone.crashState = 'none';
  drone.tumbleTimer = 0;
  const crashOverlay = document.getElementById('crash-overlay');
  if (crashOverlay) crashOverlay.classList.add('hidden');

  state.currentPlayer = playerNum;
  state.elapsedTime = 0;
  state.penaltyTime = 0;
  state.collisionCount = 0;
  state.currentGateIndex = 0;
  state.landingHoldTimer = 0;
  state.currentRecording = [];
  state.recordSampleAccum = 0;
  state.lastCheckpoint = { pos: { x: 0, y: 1.2, z: 0 }, yaw: 0 };

  const isTrainingRun = state.gameMode === 'training';
  if (isTrainingRun) {
    state.trainingStep = 1;
    state.trainingHoverTime = 0;
    state.trainingBrakeTime = 0;
  }

  resetDroneTransform(0, 1.2, 0, 0);
  resetDroneBattery();
  updateGateVisualStates();

  const modeLabels = {
    training: '飛行訓練',
    single_race: '單人計時賽',
    versus_race: '雙人競速',
    free_flight: '城市自由空拍',
    tactical_strike: '實戰演練'
  };

  const isTacticalMode = state.gameMode === 'tactical_strike';
  if (ccipMarkerMesh) ccipMarkerMesh.visible = false;
  if (typeof resetGimbalPod === 'function') resetGimbalPod();

  if (isTacticalMode) {
    resetWildernessVegetation();
    tacticalState.bombsRemaining = tacticalState.maxBombs;
    tacticalState.bombsDropped = 0;
    tacticalState.directHitBombs = 0;
    tacticalState.rearmTimer = 0;
    state.tacticalVictoryAnnounced = false;

    // Reset all targets to 100% pristine condition
    tacticalState.targets.forEach((t) => {
      if (t.type === 'tank') {
        resetTargetTank(t);
      } else {
        resetFacilityTarget(t);
      }
    });

    updateDroneBellyBombs();
  }
  const mb = document.getElementById('hud-mode-badge');
  if (mb) mb.textContent = state.flightMode === 'sport' ? 'SPORT' : 'POS-HOLD';
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
    showAnnouncement('FLIGHT TRAINING', getFlightGamepad() ? '任務 1：左搖桿向上推至 10 公尺，鬆開或按 L2 懸停' : state.keymapMode === 'dual' ? '任務 1：起飛並爬升至 10 公尺定高懸停' : '任務 1：按 Shift 或 U 爬升至 10 公尺', '#10b981');
  } else {
    showAnnouncement(`PLAYER ${playerNum} READY`, getFlightGamepad() ? 'GO 後將左搖桿向上推以爬升' : state.keymapMode === 'dual' ? 'GO 後按 W 上升' : 'GO 後按 Shift 或 U 上升', '#00f0ff');
  }

}

function completeRaceRun({ aborted = false } = {}) {
  state.raceActive = false;
  clearAllKeys();
  drone.crashed = false;
  drone.crashState = 'none';
  drone.tumbleTimer = 0;
  const crashOverlay = document.getElementById('crash-overlay');
  if (crashOverlay) crashOverlay.classList.add('hidden');
  if (!aborted) audioEngine.playFinishFanfare();
  else toggleCameraMode('chase');

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
  } else if (state.gameMode === 'training') {
    state.p1Result = result;
    showScoreboardModal('training_complete');
  } else if (state.gameMode === 'single_race') {
    state.p1Result = result;
    showScoreboardModal('single');
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
  const btnCrashRespawn = document.getElementById('btn-crash-respawn');
  if (btnCrashRespawn) {
    btnCrashRespawn.addEventListener('click', () => respawnAtLastCheckpoint(true));
  }
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

  const TACTICAL_EXERCISE_BRIEFINGS = {
    tactical_strike: {
      eyebrow: '任務提示 // OP-01 標準實戰',
      title: '山谷前線行動：戰場投彈',
      bg: '山谷前線爆發交火。敵軍裝甲巡邏隊控制了谷底道路，山脊雷達站與坡腳彈藥庫仍在運作。你在山脊背坡的臨時放飛點待命，執行日間標準打擊任務。',
      label: '實戰演練 — 01 戰場投彈'
    },
    night_strike: {
      eyebrow: '任務提示 // OP-02 暗夜奇襲',
      title: '暗夜獵鷹行動：夜間突擊',
      bg: '夜幕籠罩山谷前線，敵軍裝甲與防空雷達於暗夜中持續運作。機載系統已自動切換為白熱熱成像（FLIR），請透過引擎與雷達高熱源特徵鎖定並摧毀敵方目標。',
      label: '實戰演練 — 02 夜間突擊'
    },
    extreme_weather: {
      eyebrow: '任務提示 // OP-03 惡劣天候',
      title: '風暴獵殺行動：極限飛行（惡劣天候）',
      bg: '強烈颱風驟雨席捲山谷前線，伴隨劇烈側風與亂流下壓氣流。請維持機體抗風穩定，並善用垂直光學鏡頭的風偏修正標記與 CCIP 預測彈道執行極限投彈。',
      label: '實戰演練 — 03 極限飛行（惡劣天候）'
    }
  };

  state.tacticalExercise = 'tactical_strike';
  state.selectedRaceSubmode = 'single_race';
  state.activeMenuCategory = 'training';

  const TIER2_BANNER_INFO = {
    training: {
      tag: 'SECTOR 01 // FLIGHT ACADEMY',
      title: '飛行訓練 — 六階段飛控考照課綱',
      color: '#10b981'
    },
    racing: {
      tag: 'SECTOR 02 // URBAN SPEED CIRCUIT',
      title: '飛行競速 — 台灣城市賽道模式選擇',
      color: '#00f0ff'
    },
    tactical: {
      tag: 'SECTOR 03 // FRONTIER STRIKE OPS',
      title: '實戰演練 — 山谷前線戰術科目部署',
      color: '#ef4444'
    }
  };

  function updateTacticalBriefingDialog(exerciseKey) {
    const info = TACTICAL_EXERCISE_BRIEFINGS[exerciseKey] || TACTICAL_EXERCISE_BRIEFINGS.tactical_strike;
    const eyebrowEl = document.getElementById('tactical-briefing-eyebrow');
    const titleEl = document.getElementById('tactical-briefing-title');
    const bgEl = document.getElementById('tactical-briefing-bg');
    if (eyebrowEl) eyebrowEl.textContent = info.eyebrow;
    if (titleEl) titleEl.textContent = info.title;
    if (bgEl) bgEl.textContent = info.bg;

    const briefingControlEl = document.querySelector('.briefing-control');
    if (briefingControlEl) {
      if (gamepadSelected) {
        briefingControlEl.innerHTML = '<span>使用</span><kbd>左/右搖桿</kbd><span>飛行，按</span><kbd>R1</kbd><span>切換鏡頭，按</span><kbd>L1</kbd><span>切換熱成像/夜視，按</span><kbd>X鈕</kbd><span>變焦，按</span><kbd>B鈕 / A鈕</kbd><span>投彈。</span>';
      } else {
        briefingControlEl.innerHTML = '<span>按</span><kbd>C</kbd><span>切換鏡頭，按</span><kbd>X</kbd><span>切換熱成像/夜視，按</span><kbd>Z</kbd><span>變焦，按</span><kbd>B</kbd><span>投彈。</span>';
      }
    }
  }
  window.updateTacticalBriefingDialog = updateTacticalBriefingDialog;

  function animateSubmenuPanelReveal(panelEl) {
    if (!panelEl || typeof gsap === 'undefined') return;
    gsap.killTweensOf(panelEl);
    gsap.fromTo(
      panelEl,
      { opacity: 0, y: 10 },
      { opacity: 1, y: 0, duration: 0.32, ease: 'power2.out', clearProps: 'transform' }
    );
    const items = panelEl.querySelectorAll('.submode-option, .syllabus-chip');
    if (items.length) {
      gsap.killTweensOf(items);
      gsap.fromTo(
        items,
        { opacity: 0, y: 12, scale: 0.96 },
        { opacity: 1, y: 0, scale: 1, duration: 0.36, stagger: 0.05, ease: 'back.out(1.4)', clearProps: 'transform' }
      );
    }
  }

  function applyCategoryVisualTheme(category) {
    const rpmText = document.getElementById('menu-rotor-rpm-text');
    const pill = document.getElementById('menu-rotor-status-pill');
    const bannerTag = document.getElementById('tier2-banner-tag');
    const bannerTitle = document.getElementById('tier2-banner-title');
    const bannerInfo = TIER2_BANNER_INFO[category] || TIER2_BANNER_INFO.training;

    if (bannerTag) {
      bannerTag.textContent = bannerInfo.tag;
      bannerTag.style.color = bannerInfo.color;
    }
    if (bannerTitle) {
      bannerTitle.textContent = bannerInfo.title;
    }

    document.querySelectorAll('.tier2-tab').forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.targetCategory === category);
    });

    if (category === 'training') {
      if (rpmText) rpmText.textContent = 'AVIONICS // ACADEMY LINK READY';
      if (pill) {
        pill.style.borderColor = 'rgba(16, 185, 129, 0.45)';
        pill.style.color = '#34d399';
        pill.style.background = 'rgba(16, 185, 129, 0.12)';
      }
    } else if (category === 'racing') {
      if (rpmText) rpmText.textContent = 'AVIONICS // SPORT TELEMETRY ARMED';
      if (pill) {
        pill.style.borderColor = 'rgba(0, 240, 255, 0.5)';
        pill.style.color = '#00f0ff';
        pill.style.background = 'rgba(0, 240, 255, 0.14)';
      }
    } else if (category === 'tactical') {
      if (rpmText) rpmText.textContent = 'AVIONICS // STRIKE WEAPONS ARMED';
      if (pill) {
        pill.style.borderColor = 'rgba(239, 68, 68, 0.5)';
        pill.style.color = '#f87171';
        pill.style.background = 'rgba(239, 68, 68, 0.14)';
      }
    }

    if (typeof window.setSkyEyeHudSectorAccent === 'function') {
      window.setSkyEyeHudSectorAccent(category);
    }
  }

  function selectRaceSubmode(raceMode, { animate = false } = {}) {
    state.selectedRaceSubmode = raceMode === 'versus_race' ? 'versus_race' : 'single_race';
    state.gameMode = state.selectedRaceSubmode;

    const raceCard = document.querySelector('.mode-select-card[data-category="racing"]');
    if (raceCard) raceCard.dataset.mode = state.selectedRaceSubmode;

    document.querySelectorAll('.race-sub-option').forEach((btn) => {
      const active = btn.dataset.raceMode === state.selectedRaceSubmode;
      btn.classList.toggle('selected', active);
      btn.setAttribute('aria-pressed', String(active));
      if (active && btn.dataset.description) {
        const sumEl = document.getElementById('menu-summary-mode');
        if (sumEl) sumEl.textContent = btn.dataset.description;
      }
    });

    if (animate && typeof gsap !== 'undefined') {
      const sumEl = document.getElementById('menu-summary-mode');
      if (sumEl) gsap.fromTo(sumEl, { opacity: 0.25, x: -6 }, { opacity: 1, x: 0, duration: 0.25 });
    }
  }

  function selectTacticalExercise(exerciseKey, { applyPresets = true } = {}) {
    const validKey = TACTICAL_EXERCISE_BRIEFINGS[exerciseKey] ? exerciseKey : 'tactical_strike';
    state.tacticalExercise = validKey;
    state.gameMode = 'tactical_strike';

    document.querySelectorAll('.exercise-option').forEach((item) => {
      const active = item.dataset.exercise === validKey;
      item.classList.toggle('selected', active);
      item.setAttribute('aria-pressed', String(active));
      if (active) {
        if (item.dataset.description) {
          const sumEl = document.getElementById('menu-summary-mode');
          if (sumEl) sumEl.textContent = item.dataset.description;
        }
        if (applyPresets) {
          if (item.dataset.presetTime) applyTimeOfDay(item.dataset.presetTime);
          if (item.dataset.presetWeather) applyWeather(item.dataset.presetWeather);
          if (item.dataset.presetSensor && typeof setSensorMode === 'function') {
            setSensorMode(item.dataset.presetSensor);
          }
        }
      }
    });

    updateTacticalBriefingDialog(validKey);
  }

  function selectMenuCategory(cardOrCategory, { applyPresets = false } = {}) {
    const card = typeof cardOrCategory === 'string'
      ? document.querySelector(`.mode-select-card[data-category="${cardOrCategory}"]`)
      : cardOrCategory;
    if (!card) return;

    const category = card.dataset.category || (
      card.dataset.mode === 'tactical_strike' ? 'tactical' :
      (card.dataset.mode === 'versus_race' || card.dataset.mode === 'single_race') ? 'racing' : 'training'
    );
    state.activeMenuCategory = category;

    document.querySelectorAll('.mode-select-card').forEach((c) => {
      const isSelected = c === card;
      c.classList.toggle('selected', isSelected);
      c.setAttribute('aria-selected', String(isSelected));
      if (c.hasAttribute('aria-expanded')) {
        c.setAttribute('aria-expanded', String(isSelected));
      }
    });

    const trainingPanel = document.getElementById('submenu-training');
    const racingPanel = document.getElementById('submenu-racing');
    const tacticalPanel = document.getElementById('exercise-selector');

    if (trainingPanel) trainingPanel.classList.toggle('hidden', category !== 'training');
    if (racingPanel) racingPanel.classList.toggle('hidden', category !== 'racing');
    if (tacticalPanel) tacticalPanel.classList.toggle('hidden', category !== 'tactical');

    applyCategoryVisualTheme(category);

    if (category === 'training') {
      state.gameMode = 'training';
      if (state.sensorMode !== 'visible' && typeof setSensorMode === 'function') {
        setSensorMode('visible');
      }
      const sumEl = document.getElementById('menu-summary-mode');
      if (sumEl && card.dataset.description) sumEl.textContent = card.dataset.description;
      animateSubmenuPanelReveal(trainingPanel);
    } else if (category === 'racing') {
      if (state.sensorMode !== 'visible' && typeof setSensorMode === 'function') {
        setSensorMode('visible');
      }
      selectRaceSubmode(state.selectedRaceSubmode || 'single_race');
      animateSubmenuPanelReveal(racingPanel);
    } else if (category === 'tactical') {
      selectTacticalExercise(state.tacticalExercise || 'tactical_strike', { applyPresets });
      animateSubmenuPanelReveal(tacticalPanel);
    }
  }

  // Transition from Stage 1 (Tier-1 3-Mode Hero Screen) -> Stage 2 (Tier-2 Advanced Details Deck)
  function enterTier2Screen(category) {
    const menuModal = document.getElementById('menu-modal');
    const introStage = document.getElementById('intro-cinematic-stage');
    const tier1Stage = document.getElementById('hero-tier1-stage');
    const commandDeck = document.getElementById('menu-command-deck');
    if (!commandDeck || !tier1Stage) return;

    if (menuModal) menuModal.classList.add('tier2-active');
    commandDeck.classList.remove('tier2-hidden');

    if (typeof window.setSkyEyeMenuStage === 'function') {
      window.setSkyEyeMenuStage('tier2', category || state.activeMenuCategory || 'training');
    }
    if (typeof window.setSkyEyeMenuHologramVisible === 'function') {
      window.setSkyEyeMenuHologramVisible(false);
    }

    if (typeof gsap !== 'undefined') {
      gsap.killTweensOf([introStage, tier1Stage, commandDeck]);
      if (introStage) {
        gsap.to(introStage, {
          autoAlpha: 0,
          duration: 0.3,
          ease: 'power2.out'
        });
      }
      gsap.to(tier1Stage, {
        autoAlpha: 0,
        scale: 1.05,
        duration: 0.3,
        ease: 'power3.inOut',
        onComplete: () => {
          tier1Stage.classList.add('tier1-hidden');
        }
      });

      gsap.fromTo(
        commandDeck,
        { autoAlpha: 0, y: 28, scale: 0.95 },
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          duration: 0.48,
          ease: 'expo.out',
          onStart: () => {
            commandDeck.style.pointerEvents = 'auto';
          }
        }
      );

      gsap.fromTo(
        ['#menu-command-deck .tier2-mode-banner', '#menu-command-deck #submenu-stage', '#menu-command-deck .menu-settings', '#menu-command-deck .menu-cta-bar'],
        { opacity: 0, y: 14 },
        { opacity: 1, y: 0, duration: 0.42, stagger: 0.055, ease: 'power3.out', clearProps: 'transform' }
      );
    } else {
      if (introStage) introStage.style.opacity = '0';
      tier1Stage.classList.add('tier1-hidden');
      commandDeck.style.opacity = '1';
      commandDeck.style.visibility = 'visible';
      commandDeck.style.pointerEvents = 'auto';
    }
  }

  // Transition from Stage 2 (Tier-2 Advanced Details Deck) -> Stage 1 (Tier-1 3-Mode Hero Screen)
  function returnToTier1Screen() {
    const menuModal = document.getElementById('menu-modal');
    const introStage = document.getElementById('intro-cinematic-stage');
    const tier1Stage = document.getElementById('hero-tier1-stage');
    const commandDeck = document.getElementById('menu-command-deck');
    if (!commandDeck || !tier1Stage) return;

    if (menuModal) menuModal.classList.remove('tier2-active');
    tier1Stage.classList.remove('tier1-hidden');

    if (typeof window.setSkyEyeMenuStage === 'function') {
      window.setSkyEyeMenuStage('tier1', state.activeMenuCategory || 'training');
    }
    if (typeof window.setSkyEyeMenuHologramVisible === 'function') {
      window.setSkyEyeMenuHologramVisible(true);
    }

    if (typeof gsap !== 'undefined') {
      gsap.killTweensOf([introStage, tier1Stage, commandDeck]);
      commandDeck.style.pointerEvents = 'none';
      gsap.to(commandDeck, {
        autoAlpha: 0,
        y: 22,
        scale: 0.96,
        duration: 0.3,
        ease: 'power3.inOut',
        onComplete: () => {
          commandDeck.classList.add('tier2-hidden');
        }
      });

      if (introStage) {
        gsap.to(introStage, {
          autoAlpha: 1,
          duration: 0.42,
          ease: 'power2.out'
        });
      }
      gsap.fromTo(
        tier1Stage,
        { autoAlpha: 0, scale: 0.96 },
        { autoAlpha: 1, scale: 1, duration: 0.44, ease: 'expo.out' }
      );
      gsap.fromTo(
        '.hero-mode-node',
        { autoAlpha: 0, y: 24, scale: 0.94 },
        { autoAlpha: 1, y: 0, scale: 1, duration: 0.44, stagger: 0.08, ease: 'back.out(1.5)' }
      );
    } else {
      if (introStage) introStage.style.opacity = '1';
      commandDeck.classList.add('tier2-hidden');
      tier1Stage.style.opacity = '1';
      tier1Stage.style.visibility = 'visible';
    }
  }

  window.enterSkyEyeTier2 = enterTier2Screen;
  window.returnToSkyEyeTier1 = returnToTier1Screen;

  // Bind Tier-1 Mode Nodes: Click enters Tier-2; Hover tilts 3D UAV & highlights leader lines
  document.querySelectorAll('.mode-select-card').forEach((card, idx) => {
    card.addEventListener('click', () => {
      const cat = card.dataset.category || 'training';
      audioEngine.playMenuConfirm();
      selectMenuCategory(card, { applyPresets: true });
      enterTier2Screen(cat);
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const cat = card.dataset.category || 'training';
        audioEngine.playMenuConfirm();
        selectMenuCategory(card, { applyPresets: true });
        enterTier2Screen(cat);
      }
    });
    card.addEventListener('pointerenter', () => {
      const cat = card.dataset.category || 'training';
      audioEngine.playMenuHover();
      if (typeof window.setSkyEyeHudHoverSector === 'function') {
        window.setSkyEyeHudHoverSector(idx + 1, cat);
      }
    });
    card.addEventListener('pointerleave', () => {
      if (typeof window.setSkyEyeHudHoverSector === 'function') {
        window.setSkyEyeHudHoverSector(0, state.activeMenuCategory);
      }
    });
  });

  // Bind Tier-2 Back button & Quick-Switch Tabs
  const btnBackTier1 = document.getElementById('btn-back-tier1');
  if (btnBackTier1) {
    btnBackTier1.addEventListener('click', () => {
      audioEngine.playMenuConfirm();
      returnToTier1Screen();
    });
  }

  document.querySelectorAll('.tier2-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const targetCat = tab.dataset.targetCategory;
      if (targetCat) {
        audioEngine.playMenuConfirm();
        selectMenuCategory(targetCat, { applyPresets: true });
        if (typeof window.setSkyEyeMenuStage === 'function') {
          window.setSkyEyeMenuStage('tier2', targetCat);
        }
      }
    });
  });

  document.querySelectorAll('.race-sub-option').forEach((option) => {
    option.addEventListener('click', () => {
      audioEngine.playMenuConfirm();
      selectRaceSubmode(option.dataset.raceMode, { animate: true });
    });
  });

  document.querySelectorAll('.exercise-option').forEach((option) => {
    option.addEventListener('click', () => {
      audioEngine.playMenuConfirm();
      selectTacticalExercise(option.dataset.exercise, { applyPresets: true });
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
      updateTacticalBriefingDialog(state.tacticalExercise);
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
  yield '建立起降坪與校園';
  buildCityHelipad();
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
  signalTime = 0;
  updateSignals = () => {};
  trainingHoverRingGroup = null;
  trainingHoverRingMat = null;
  for (const items of [
    buildingColliders, movingColliders, signalIntersections, outerMapRoads,
    outerMapCourtyards, townMapFeatures, cityMapAreas, cityLandmarks,
    roadVehicles, gateObjects, window.taiwanEmissiveMaterials
  ]) items.length = 0;
}

function unloadWildernessWorld() {
  if (!wildernessGroup) return;
  disposeWorldObject(wildernessGroup);
  wildernessGroup = null;
  tacticalState.targets.length = 0;
  tacticalState.tanks.length = 0;
  tacticalState.aaSites.length = 0;
  tacticalState.aaProjectiles.forEach((p) => scene.remove(p.mesh));
  tacticalState.aaProjectiles.length = 0;
  tacticalState.aaFlakBursts.forEach((fb) => {
    fb.puffs.forEach((pf) => pf.sprite.material.dispose());
    scene.remove(fb.group);
  });
  tacticalState.aaFlakBursts.length = 0;
  tacticalState.rwrLevel = 'none';
  if (typeof updateRWRUI === 'function') updateRWRUI('none', '');
  wildernessTerrainPositions = null;
  wildernessLandMat = null;
  wildernessRoadMat = null;
  wildernessJunctionMats.length = 0;
  wildernessVegetationState.trees.length = 0;
  wildernessVegetationState.shrubs.length = 0;
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
  const progressBar = document.getElementById('world-loading-progress') || (overlay ? overlay.querySelector('progress') : null);
  if (title) title.textContent = tactical ? '載入野外戰場' : '載入台灣城市';
  if (progressBar) progressBar.value = 5;
  if (detail) detail.textContent = '準備切換場景 (5%)';
  worldLoading = true;
  clearAllKeys();
  overlay.classList.remove('hidden');

  try {
    await letLoadingScreenPaint();
    if (tactical) unloadCityWorld();
    else unloadWildernessWorld();

    if (progressBar) progressBar.value = 15;
    if (detail) detail.textContent = '釋放舊場景資源 (15%)';
    await letLoadingScreenPaint();

    const stages = tactical ? buildWildernessBattlefield() : buildCityWorld();
    const totalStages = tactical ? 6 : 5;
    let stageCount = 0;
    let sliceStart = performance.now();
    for (const stage of stages) {
      stageCount++;
      const pct = Math.min(95, Math.round(15 + (stageCount / totalStages) * 75));
      if (progressBar) progressBar.value = pct;
      if (stage && detail) {
        detail.textContent = `${stage} (${pct}%)`;
      }
      if (stage || performance.now() - sliceStart >= 12) {
        await letLoadingScreenPaint();
        sliceStart = performance.now();
      }
    }
    if (progressBar) progressBar.value = 100;
    if (detail) detail.textContent = '場景載入完成 (100%)';
    await letLoadingScreenPaint();
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
    if (progressBar) progressBar.value = 0;
  }
}

function initSkyEyeIntroAndMenu() {
  if (typeof gsap === 'undefined') return;

  const menuModal = document.getElementById('menu-modal');
  const tier1Stage = document.getElementById('hero-tier1-stage');
  const commandDeck = document.getElementById('menu-command-deck');
  const phaseReadout = document.getElementById('intro-phase-readout');
  const thrustReadout = document.getElementById('intro-thrust-state');

  const imuTickerEl = document.getElementById('intro-imu-ticker');
  const attitudeTickerEl = document.getElementById('intro-attitude-ticker');
  const radarTickerEl = document.getElementById('intro-radar-ticker');
  const powerTickerEl = document.getElementById('intro-power-ticker');
  const coordsTickerEl = document.getElementById('intro-coords-ticker');

  const hdgEl = document.getElementById('intro-hdg-val');
  const altEl = document.getElementById('intro-alt-val');
  const spdEl = document.getElementById('intro-spd-val');
  const pitchEl = document.getElementById('intro-pitch-val');

  const hudReticleCore = document.getElementById('hud-reticle-core');
  const hudRingOuter = document.getElementById('hud-ring-outer');
  const hudRingInner = document.getElementById('hud-ring-inner');
  const hudRadarWedge = document.getElementById('hud-radar-wedge');
  const hudPitchGroup = document.getElementById('hud-pitch-group');
  const hudScaleBars = document.getElementById('hud-scale-bars');
  const hudDrawPaths = Array.from(document.querySelectorAll('.hud-draw-path'));
  const leaderLines = [1, 2, 3].map((i) => document.getElementById(`leader-line-${i}`));
  const sectorPins = [1, 2, 3].map((i) => document.getElementById(`sector-pin-${i}`));

  gsap.set([hudRingOuter, hudRingInner, hudRadarWedge, hudPitchGroup], {
    svgOrigin: '0 0'
  });

  // ===========================================================================
  // Build 3D Holographic Tactical Radar & Terrain Ring Platform inside Three.js Scene
  // ===========================================================================
  const menuHologramGroup = new THREE.Group();
  menuHologramGroup.name = 'SkyEyeMenuHologram';
  menuHologramGroup.position.set(0, 0.25, 0);

  const holoCyanMat = new THREE.LineBasicMaterial({
    color: 0x00f0ff,
    transparent: true,
    opacity: 0.45
  });
  const holoEmeraldMat = new THREE.LineBasicMaterial({
    color: 0x10b981,
    transparent: true,
    opacity: 0.35
  });

  // Concentric 3D radar rings beneath the live 3D quadcopter
  const ringRadii = [1.8, 3.4, 5.6, 8.5, 12.5];
  const holoRingMeshes = [];
  ringRadii.forEach((r, idx) => {
    const ringGeo = new THREE.RingGeometry(r, r + (idx === 1 ? 0.08 : 0.04), 64);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: idx % 2 === 0 ? 0x00f0ff : 0x10b981,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: idx === 1 ? 0.42 : 0.22
    });
    const mesh = new THREE.Mesh(ringGeo, ringMat);
    mesh.position.y = -idx * 0.08;
    menuHologramGroup.add(mesh);
    holoRingMeshes.push(mesh);
  });

  // 3D Wireframe Topographic Dome / Grid Floor beneath UAV
  const gridGeo = new THREE.PlaneGeometry(36, 36, 28, 28);
  gridGeo.rotateX(-Math.PI / 2);
  const posAttr = gridGeo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i);
    const vz = posAttr.getZ(i);
    const dist = Math.hypot(vx, vz);
    const wave = Math.sin(vx * 0.38) * Math.cos(vz * 0.38) * 0.65 + Math.cos(dist * 0.45) * 0.35;
    posAttr.setY(i, dist < 3.5 ? -0.35 : wave - 0.6);
  }
  gridGeo.computeVertexNormals();
  const wireGridMesh = new THREE.Mesh(
    gridGeo,
    new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      wireframe: true,
      transparent: true,
      opacity: 0.16
    })
  );
  wireGridMesh.position.y = -0.65;
  menuHologramGroup.add(wireGridMesh);

  // 3D Vertical Beacon Pillars corresponding to the 3 Tactical Sectors
  const beaconPositions = [
    { x: -3.2, z: 1.4, color: 0x10b981 },
    { x: 0.0, z: 2.2, color: 0x00f0ff },
    { x: 3.2, z: 1.4, color: 0xef4444 }
  ];
  beaconPositions.forEach((b) => {
    const beamGeo = new THREE.CylinderGeometry(0.03, 0.03, 2.6, 8);
    const beamMat = new THREE.MeshBasicMaterial({
      color: b.color,
      transparent: true,
      opacity: 0.42
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(b.x, 0.4, b.z);
    menuHologramGroup.add(beam);
  });

  scene.add(menuHologramGroup);

  window.setSkyEyeMenuHologramVisible = (visible) => {
    menuHologramGroup.visible = Boolean(visible);
  };

  // ===========================================================================
  // Live 3D Camera & UAV Choreography State
  // ===========================================================================
  const introState = {
    introPlaying: true,
    menuStage: 'tier1',
    hoverSector: 0,
    // 3D Camera Spherical / Orbital coordinates around the live 3D Drone
    camRadius: 2.1,
    camYaw: 2.75,
    camHeight: 0.18,
    lookAtOffsetY: 0.08,
    lookAtOffsetX: 0.0,
    // 3D Quadcopter pose
    droneX: 0,
    droneY: 1.85,
    droneZ: 0,
    droneYaw: 0.35,
    dronePitch: -0.18,
    droneRoll: -0.36,
    // Interactive hover & mouse offsets
    mouseNX: 0,
    mouseNY: 0,
    targetHoverRoll: 0,
    targetHoverPitch: -0.08,
    targetHoverCamX: 0,
    // HUD SVG rotations & telemetry values
    outerRingAngle: 0,
    innerRingAngle: 0,
    radarWedgeAngle: 0,
    holoScale: 0.01,
    telemetryHdg: 0,
    telemetryAlt: 0,
    telemetrySpd: 0,
    telemetryPitch: 0
  };

  function updateTelemetryReadouts() {
    if (hdgEl) hdgEl.textContent = `${String(Math.round((introState.telemetryHdg + 360) % 360)).padStart(3, '0')}°`;
    if (altEl) altEl.textContent = `${introState.telemetryAlt.toFixed(1)}m`;
    if (spdEl) spdEl.textContent = `${Math.round(introState.telemetrySpd)}km/h`;
    if (pitchEl) {
      const p = introState.telemetryPitch;
      pitchEl.textContent = `${p >= 0 ? '+' : ''}${p.toFixed(1)}°`;
    }
  }

  // Highlight SVG Leader Line & Tilt 3D UAV when hovering Tier-1 Mode Nodes
  window.setSkyEyeHudHoverSector = (sectorIdx, category) => {
    introState.hoverSector = sectorIdx;
    leaderLines.forEach((line, idx) => {
      if (!line) return;
      line.classList.toggle('active-leader', idx + 1 === sectorIdx);
    });

    if (sectorIdx === 1) {
      introState.targetHoverRoll = 0.24;
      introState.targetHoverPitch = -0.10;
      introState.targetHoverCamX = -0.35;
    } else if (sectorIdx === 2) {
      introState.targetHoverRoll = 0.0;
      introState.targetHoverPitch = -0.22;
      introState.targetHoverCamX = 0.0;
    } else if (sectorIdx === 3) {
      introState.targetHoverRoll = -0.24;
      introState.targetHoverPitch = -0.14;
      introState.targetHoverCamX = 0.35;
    } else {
      introState.targetHoverRoll = -0.05;
      introState.targetHoverPitch = -0.08;
      introState.targetHoverCamX = 0.0;
    }

    if (sectorIdx > 0 && category) {
      window.setSkyEyeHudSectorAccent(category);
    }
  };

  window.setSkyEyeHudSectorAccent = (category) => {
    const colorHex = category === 'training' ? 0x10b981 : (category === 'tactical' ? 0xef4444 : 0x00f0ff);
    if (holoRingMeshes[1] && holoRingMeshes[1].material) {
      holoRingMeshes[1].material.color.setHex(colorHex);
    }
  };

  // Smoothly shift 3D Camera between Tier-1 (Hero 3-Mode View) and Tier-2 (Advanced Config View)
  window.setSkyEyeMenuStage = (stageName, category) => {
    if (stageName === 'tier2' && introState.introPlaying) introTl.progress(1);
    introState.menuStage = stageName;
    if (introState.introPlaying) return;

    if (stageName === 'tier2') {
      const catYaw = category === 'training' ? 0.78 : (category === 'tactical' ? -0.58 : 0.18);
      gsap.to(introState, {
        camRadius: 2.55,
        camYaw: catYaw,
        camHeight: 0.48,
        lookAtOffsetY: -0.15,
        duration: 0.85,
        ease: 'expo.out'
      });
    } else {
      gsap.to(introState, {
        camRadius: 3.35,
        camYaw: 0.48,
        camHeight: 0.68,
        lookAtOffsetY: 0.0,
        duration: 0.75,
        ease: 'expo.out'
      });
    }
  };

  // Text Scramble Utility for Authentic Military Avionics Decoding
  const SCRAMBLE_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ//:#<>=';
  function scrambleDecodeText(el, finalStr, duration = 0.55) {
    if (!el) return;
    const stateObj = { p: 0 };
    gsap.to(stateObj, {
      p: 1,
      duration,
      ease: 'none',
      onUpdate: () => {
        const revealLen = Math.floor(stateObj.p * finalStr.length);
        let out = finalStr.slice(0, revealLen);
        for (let i = revealLen; i < finalStr.length; i++) {
          out += finalStr[i] === ' ' ? ' ' : SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
        }
        el.textContent = out;
      },
      onComplete: () => {
        el.textContent = finalStr;
      }
    });
  }

  // Pointer Parallax on 3D Camera only (keep HUD Reticle locked at exact screen center)
  if (menuModal) {
    menuModal.addEventListener('pointermove', (e) => {
      if (!state.menuOpen) return;
      introState.mouseNX = (e.clientX / Math.max(1, window.innerWidth)) - 0.5;
      introState.mouseNY = (e.clientY / Math.max(1, window.innerHeight)) - 0.5;
    });
  }

  // Continuous 60fps+ Live 3D UAV + Hologram + Avionics HUD Ticker while Menu is Open
  gsap.ticker.add((time, deltaTime) => {
    if (!state.menuOpen) {
      if (menuHologramGroup.visible) menuHologramGroup.visible = false;
      return;
    }
    const shouldShowHolo = introState.menuStage !== 'tier2';
    if (menuHologramGroup.visible !== shouldShowHolo) {
      menuHologramGroup.visible = shouldShowHolo;
    }

    const dt = Math.min(0.05, (deltaTime || 16.6) / 1000);
    const t = performance.now() * 0.001;

    // Spin 3D Hologram Rings
    menuHologramGroup.scale.setScalar(Math.max(0.001, introState.holoScale));
    holoRingMeshes.forEach((mesh, idx) => {
      mesh.rotation.y += (idx % 2 === 0 ? 0.22 : -0.18) * dt;
    });
    wireGridMesh.rotation.y += 0.04 * dt;

    // Position & Animate Live 3D Quadcopter (playerDroneMesh)
    if (playerDroneMesh && playerDroneMesh.root) {
      const bobY = Math.sin(t * 2.4) * 0.07;
      const bobRoll = Math.cos(t * 1.9) * 0.035;
      const bobPitch = Math.sin(t * 1.5) * 0.025;

      playerDroneMesh.root.position.set(
        introState.droneX,
        introState.droneY + bobY,
        introState.droneZ
      );
      playerDroneMesh.root.rotation.set(0, introState.droneYaw, 0);

      if (playerDroneMesh.tiltGroup) {
        if (!introState.introPlaying) {
          introState.droneRoll += (introState.targetHoverRoll - introState.droneRoll) * Math.min(1, dt * 6);
          introState.dronePitch += (introState.targetHoverPitch - introState.dronePitch) * Math.min(1, dt * 6);
        }
        playerDroneMesh.tiltGroup.rotation.set(
          introState.dronePitch + bobPitch - introState.mouseNY * 0.14,
          0,
          introState.droneRoll + bobRoll - introState.mouseNX * 0.18
        );
      }

      if (playerDroneMesh.rotors) {
        playerDroneMesh.rotors.forEach((r, idx) => {
          r.rotation.y += (idx % 2 === 0 ? 1 : -1) * 42 * dt;
        });
      }
    }

    // Orbit 3D Camera around Live 3D Quadcopter
    const parallaxYaw = introState.mouseNX * 0.22 + (introState.introPlaying ? 0 : introState.targetHoverCamX * 0.35);
    const parallaxH = introState.mouseNY * -0.24;
    const totalYaw = introState.camYaw + parallaxYaw;
    const cx = introState.droneX + Math.sin(totalYaw) * introState.camRadius;
    const cz = introState.droneZ + Math.cos(totalYaw) * introState.camRadius;
    const cy = introState.droneY + introState.camHeight + parallaxH;

    camera.position.set(cx, cy, cz);
    camera.lookAt(
      introState.droneX + introState.lookAtOffsetX,
      introState.droneY + introState.lookAtOffsetY,
      introState.droneZ
    );

    // Rotate Avionics HUD Rings & Radar Wedge
    introState.outerRingAngle = (introState.outerRingAngle + 5.5 * dt) % 360;
    introState.innerRingAngle = (introState.innerRingAngle - 4.0 * dt) % 360;
    introState.radarWedgeAngle = (introState.radarWedgeAngle + 68 * dt) % 360;

    if (hudRingOuter) gsap.set(hudRingOuter, { rotation: introState.outerRingAngle });
    if (hudRingInner) gsap.set(hudRingInner, { rotation: introState.innerRingAngle });
    if (hudRadarWedge) gsap.set(hudRadarWedge, { rotation: introState.radarWedgeAngle });

    // Rapid 14Hz Avionics Telemetry Ticking on All 4 Corners
    if (!introState._lastTickTime || (t - introState._lastTickTime) >= 0.07) {
      introState._lastTickTime = t;
      const deg = 180 / Math.PI;
      const livePitch = (introState.dronePitch * deg + (Math.random() - 0.5) * 0.4).toFixed(1);
      const liveRoll = (introState.droneRoll * deg + (Math.random() - 0.5) * 0.6).toFixed(1);
      const liveYaw = String(Math.round(((introState.droneYaw * deg + introState.radarWedgeAngle * 0.15) % 360 + 360) % 360)).padStart(3, '0');

      if (imuTickerEl) {
        const dg = (0.98 + (Math.random() - 0.5) * 0.06).toFixed(2);
        const lat = (1.1 + Math.random() * 0.5).toFixed(1);
        imuTickerEl.textContent = `IMU: 1000Hz // ${dg}G // LAT ${lat}ms`;
      }
      if (attitudeTickerEl) {
        const pStr = `${Number(livePitch) >= 0 ? '+' : ''}${livePitch}°`;
        const rStr = `${Number(liveRoll) >= 0 ? '+' : ''}${liveRoll}°`;
        attitudeTickerEl.textContent = `PITCH: ${pStr} // ROLL: ${rStr} // YAW: ${liveYaw}°`;
      }
      if (radarTickerEl) {
        const azm = String(Math.round(introState.radarWedgeAngle)).padStart(3, '0');
        const rng = (1.82 + Math.sin(t * 7.3) * 0.06 + (Math.random() - 0.5) * 0.03).toFixed(2);
        radarTickerEl.textContent = `AZM: ${azm}° // RNG: ${rng}km // LOCK: 3/3`;
      }
      if (powerTickerEl) {
        const volt = (25.18 + Math.sin(t * 4.1) * 0.04 + (Math.random() - 0.5) * 0.03).toFixed(2);
        const amp = (14.1 + Math.abs(introState.droneRoll) * 6.5 + (Math.random() - 0.5) * 0.4).toFixed(1);
        powerTickerEl.textContent = `PWR BUS // 6S LiPo ${volt}V · ${amp}A`;
      }
      if (coordsTickerEl) {
        const secN = (42.0 + Math.sin(t * 2.2) * 0.12).toFixed(1);
        const secE = (15.0 + Math.cos(t * 2.0) * 0.12).toFixed(1);
        coordsTickerEl.textContent = `GPS: N 24°58'${secN}" E 121°31'${secE}"`;
      }
    }
  });

  // ===========================================================================
  // Four-act GSAP opening timeline
  // ===========================================================================
  let introTl = null;

  function buildAndPlayIntroTimeline() {
    if (introTl) introTl.kill();

    introState.introPlaying = true;
    introState.menuStage = 'tier1';
    introState.hoverSector = 0;

    // Reset 3D Choreography initial keyframes (Act 1 Close-Up Optical Gimbal inspection)
    introState.camRadius = 1.95;
    introState.camYaw = 2.85;
    introState.camHeight = 0.12;
    introState.lookAtOffsetY = 0.06;
    introState.lookAtOffsetX = 0.0;
    introState.droneX = 0;
    introState.droneY = 1.85;
    introState.droneZ = 0;
    introState.droneYaw = 0.42;
    introState.dronePitch = -0.22;
    introState.droneRoll = -0.38;
    introState.holoScale = 0.01;
    introState.telemetryHdg = 0;
    introState.telemetryAlt = 0;
    introState.telemetrySpd = 0;
    introState.telemetryPitch = 0;
    updateTelemetryReadouts();

    if (menuModal) menuModal.classList.remove('tier2-active');
    gsap.set('#intro-cinematic-stage', { autoAlpha: 1 });
    if (tier1Stage) {
      tier1Stage.classList.remove('tier1-hidden');
      gsap.set(tier1Stage, { autoAlpha: 1, scale: 1 });
    }
    if (commandDeck) {
      commandDeck.classList.add('tier2-hidden');
      gsap.set(commandDeck, { autoAlpha: 0, pointerEvents: 'none' });
    }

    // Prepare SVG vector stroke-dasharray / stroke-dashoffset for HUD reticle & leader lines
    hudDrawPaths.forEach((path) => {
      const len = typeof path.getTotalLength === 'function' ? path.getTotalLength() : 600;
      gsap.set(path, {
        strokeDasharray: len,
        strokeDashoffset: len,
        opacity: 0.85
      });
    });

    leaderLines.forEach((line) => {
      if (!line) return;
      const len = typeof line.getTotalLength === 'function' ? line.getTotalLength() : 420;
      gsap.set(line, {
        strokeDasharray: len,
        strokeDashoffset: len,
        opacity: 0.72
      });
    });

    // Reset DOM/SVG elements for Act 1
    gsap.set('#intro-flash-shutter', { opacity: 0.92 });
    gsap.set('#intro-laser-line', { scaleX: 0, scaleY: 1, opacity: 0 });
    gsap.set('#intro-corner-tl', { opacity: 0, x: 46, y: 34 });
    gsap.set('#intro-corner-tr', { opacity: 0, x: -46, y: 34 });
    gsap.set('#intro-corner-bl', { opacity: 0, x: 46, y: -34 });
    gsap.set('#intro-corner-br', { opacity: 0, x: -46, y: -34 });
    gsap.set('.boot-line', { opacity: 0 });
    gsap.set([hudRingOuter, hudRingInner], { opacity: 0, scale: 0.78 });
    gsap.set(hudPitchGroup, { opacity: 0, scale: 0.88, rotation: -18 });
    gsap.set(hudScaleBars, { opacity: 0, scale: 1.08 });
    gsap.set(hudRadarWedge, { opacity: 0 });
    gsap.set(sectorPins, { opacity: 0, scale: 1.9 });
    gsap.set('#hero-title-cluster', { opacity: 0, y: -18, scale: 1.04 });
    gsap.set('#hero-main-title', { letterSpacing: '0.68em', filter: 'blur(10px)' });
    gsap.set('.hero-mode-node', { autoAlpha: 0, y: 38, scale: 0.92, pointerEvents: 'none' });

    if (phaseReadout) phaseReadout.textContent = 'PHASE 01 // OPTICAL SHUTTER & AVIONICS COLD BOOT';
    if (thrustReadout) thrustReadout.textContent = 'DATALINK // CALIBRATING EO-NADIR';

    introTl = gsap.timeline({
      defaults: { ease: 'power2.out' },
      onComplete: () => {
        introState.introPlaying = false;
        window._skyEyeIntroCompletedOnce = true;
        try { sessionStorage.setItem('skyEyeIntroSeen', '1'); } catch {}
        gsap.set('.hero-mode-node', { pointerEvents: 'auto' });
      }
    });

    // =========================================================================
    // ACT 1 (0.0s - 1.2s): Optical Flash Shutter, Horizon Laser & Avionics Cold Boot
    // =========================================================================
    introTl
      .to('#intro-flash-shutter', {
        opacity: 0,
        duration: 0.55,
        ease: 'power3.out'
      }, 0.0)
      .to('#intro-laser-line', {
        scaleX: 1,
        opacity: 1,
        duration: 0.36,
        ease: 'expo.out'
      }, 0.02)
      .to('#intro-laser-line', {
        scaleY: 20,
        opacity: 0,
        duration: 0.38,
        ease: 'power3.out'
      }, 0.38)
      .to(['#intro-corner-tl', '#intro-corner-tr', '#intro-corner-bl', '#intro-corner-br'], {
        opacity: 1,
        x: 0,
        y: 0,
        duration: 0.5,
        stagger: 0.05,
        ease: 'power4.out'
      }, 0.14)
      .call(() => {
        const b1 = document.getElementById('boot-line-1');
        if (b1) {
          gsap.set(b1, { opacity: 1 });
          scrambleDecodeText(b1, '[OK] KALMAN ATTITUDE FILTER CALIBRATED', 0.3);
        }
      }, null, 0.28)
      .call(() => {
        const b2 = document.getElementById('boot-line-2');
        if (b2) {
          gsap.set(b2, { opacity: 1 });
          scrambleDecodeText(b2, '[OK] EO-NADIR 90° + FLIR THERMAL OPTICS', 0.3);
        }
      }, null, 0.48)
      .call(() => {
        const b3 = document.getElementById('boot-line-3');
        if (b3) {
          gsap.set(b3, { opacity: 1 });
          scrambleDecodeText(b3, '[OK] FORMOSA URBAN & VALLEY DEM LOADED', 0.3);
        }
      }, null, 0.68)
      .call(() => {
        const b4 = document.getElementById('boot-line-4');
        if (b4) {
          gsap.set(b4, { opacity: 1 });
          scrambleDecodeText(b4, '[OK] CCIP BALLISTIC COMPUTER ONLINE', 0.3);
        }
      }, null, 0.88)
      .to(introState, {
        holoScale: 1,
        duration: 1.05,
        ease: 'expo.out'
      }, 0.25)
      .to(introState, {
        telemetryHdg: 142,
        telemetryAlt: 48.5,
        telemetrySpd: 68,
        telemetryPitch: -6.4,
        duration: 1.15,
        ease: 'power2.out',
        onUpdate: updateTelemetryReadouts
      }, 0.2);

    // =========================================================================
    // ACT 2 (1.1s - 3.0s): Avionics Reticle Vector Construction & 3D UAV Banking Flyby
    // =========================================================================
    introTl
      .call(() => {
        if (phaseReadout) phaseReadout.textContent = 'PHASE 02 // AVIONICS RETICLE & 3D FLIGHT MANEUVER';
        if (thrustReadout) thrustReadout.textContent = 'DATALINK // 3D TELEMETRY STREAMING';
      }, null, 1.1)
      .to(hudDrawPaths, {
        strokeDashoffset: 0,
        duration: 0.95,
        stagger: 0.05,
        ease: 'power2.inOut'
      }, 1.15)
      .to([hudRingOuter, hudRingInner], {
        opacity: 1,
        scale: 1,
        duration: 0.6,
        stagger: 0.08,
        ease: 'expo.out'
      }, 1.2)
      .to(hudPitchGroup, {
        opacity: 1,
        scale: 1,
        rotation: 0,
        duration: 0.65,
        ease: 'back.out(1.5)'
      }, 1.38)
      .to(hudScaleBars, {
        opacity: 1,
        scale: 1,
        duration: 0.55,
        ease: 'power3.out'
      }, 1.52)
      // 3D Camera sweeps in a dynamic orbital arc while 3D UAV banks
      .to(introState, {
        camRadius: 4.35,
        camYaw: 1.15,
        camHeight: 1.08,
        droneRoll: 0.34,
        dronePitch: -0.14,
        droneYaw: -0.18,
        telemetryHdg: 285,
        telemetryAlt: 112.0,
        telemetrySpd: 104,
        telemetryPitch: -8.2,
        duration: 1.85,
        ease: 'power2.inOut',
        onUpdate: updateTelemetryReadouts
      }, 1.12);

    // =========================================================================
    // ACT 3 (2.9s - 4.3s): Island Sector Radar Lock, Leader Lines & Hero Title Reveal
    // =========================================================================
    introTl
      .call(() => {
        if (phaseReadout) phaseReadout.textContent = 'PHASE 03 // FORMOSA 3-SECTOR TACTICAL LOCK';
        if (thrustReadout) thrustReadout.textContent = 'DATALINK // 3 MISSION SECTORS ACQUIRED';
      }, null, 2.88)
      .to(hudRadarWedge, {
        opacity: 0.9,
        duration: 0.38
      }, 2.92)
      .to(sectorPins, {
        opacity: 1,
        scale: 1,
        duration: 0.38,
        stagger: 0.14,
        ease: 'back.out(2.0)'
      }, 3.0)
      .to(leaderLines, {
        strokeDashoffset: 0,
        duration: 0.6,
        stagger: 0.12,
        ease: 'power3.out'
      }, 3.22)
      .to('#hero-title-cluster', {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 0.65,
        ease: 'expo.out'
      }, 3.38)
      .to('#hero-main-title', {
        letterSpacing: '0.24em',
        filter: 'blur(0px)',
        duration: 0.72,
        ease: 'expo.out'
      }, 3.38)
      .to(introState, {
        camRadius: 3.35,
        camYaw: 0.48,
        camHeight: 0.68,
        lookAtOffsetY: 0.0,
        droneRoll: -0.05,
        dronePitch: -0.08,
        droneYaw: 0.12,
        telemetryHdg: 38,
        telemetryAlt: 85.0,
        telemetrySpd: 72,
        telemetryPitch: -4.5,
        duration: 1.45,
        ease: 'power3.out',
        onUpdate: updateTelemetryReadouts
      }, 2.95);

    // =========================================================================
    // ACT 4: Mode cards become interactive as they appear
    // =========================================================================
    introTl
      .call(() => {
        if (phaseReadout) phaseReadout.textContent = 'PHASE 04 // TACTICAL HUD READY — SELECT MISSION MODE';
        if (thrustReadout) thrustReadout.textContent = 'DATALINK // TIER-1 MODE NODES ONLINE';
        gsap.set('.hero-mode-node', { pointerEvents: 'auto' });
      }, null, 3.65)
      .to('.hero-mode-node', {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        duration: 0.55,
        stagger: 0.1,
        ease: 'back.out(1.4)'
      }, 3.65)
      .to([hudRingOuter, hudRingInner, ...leaderLines].filter(Boolean), {
        opacity: 0.74,
        duration: 0.45
      }, 3.65);
    introTl.timeScale(introTl.totalDuration() / 3.8);
  }

  function skipSkyEyeIntroToMenu(quickAnimate = false) {
    if (introTl) {
      introTl.progress(1, false);
    }
    introState.introPlaying = false;
    introState.menuStage = 'tier1';
    window._skyEyeIntroCompletedOnce = true;

    if (menuModal) menuModal.classList.remove('tier2-active');
    gsap.set('#intro-cinematic-stage', { autoAlpha: 1 });
    if (commandDeck) {
      commandDeck.classList.add('tier2-hidden');
      gsap.set(commandDeck, { autoAlpha: 0, pointerEvents: 'none' });
    }
    if (tier1Stage) {
      tier1Stage.classList.remove('tier1-hidden');
      gsap.set(tier1Stage, { autoAlpha: 1, scale: 1 });
    }

    introState.camRadius = 3.35;
    introState.camYaw = 0.48;
    introState.camHeight = 0.68;
    introState.lookAtOffsetY = 0.0;
    introState.droneRoll = -0.05;
    introState.dronePitch = -0.08;
    introState.droneYaw = 0.12;
    introState.holoScale = 1;

    gsap.set('.hero-mode-node', { pointerEvents: 'auto' });
    if (quickAnimate) {
      gsap.fromTo(
        '.hero-mode-node',
        { autoAlpha: 0, y: 20, scale: 0.95 },
        { autoAlpha: 1, y: 0, scale: 1, duration: 0.38, stagger: 0.07, ease: 'power3.out' }
      );
    } else {
      gsap.set('.hero-mode-node', { autoAlpha: 1, y: 0, scale: 1 });
    }
  }

  window.skipSkyEyeIntroToMenu = skipSkyEyeIntroToMenu;
  window.replaySkyEyeIntro = buildAndPlayIntroTimeline;


  window.addEventListener('keydown', (e) => {
    if (!state.menuOpen) return;
    if (introState.introPlaying) {
      e.preventDefault();
      skipSkyEyeIntroToMenu();
    } else if (!introState.introPlaying && introState.menuStage === 'tier2' && e.code === 'Escape') {
      e.preventDefault();
      if (typeof window.returnToSkyEyeTier1 === 'function') {
        window.returnToSkyEyeTier1();
      }
    }
  });

  buildAndPlayIntroTimeline();
  try {
    if (sessionStorage.getItem('skyEyeIntroSeen') === '1') skipSkyEyeIntroToMenu();
  } catch {}
}

try { buildAnimeSky(); } catch (e) { console.warn('buildAnimeSky:', e); }
try { buildCCIPMarker(); } catch (e) { console.warn('buildCCIPMarker:', e); }
try { buildRainSystem(); } catch (e) { console.warn('buildRainSystem:', e); }
try { applyWeather('clear'); } catch (e) { console.warn('applyWeather:', e); }
try { applyTimeOfDay('day'); } catch (e) { console.warn('applyTimeOfDay:', e); }
updateCameraAndWorldAnimations(0);
try { bindUIEvents(); } catch (e) { console.warn('bindUIEvents:', e); }
try { initSkyEyeIntroAndMenu(); } catch (e) { console.warn('initSkyEyeIntroAndMenu:', e); }

window.applyWeather = applyWeather;
window.cycleWeather = cycleWeather;

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

