import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import './PomodoroWidget.css';

const POMODORO_LONG_BREAK = 15 * 60;
// eslint-disable-next-line no-unused-vars
const SESSIONS_BEFORE_LONG = 4;
const STORAGE_KEY = 'pomodoro_state';
const CONFIG_STORAGE_KEY = 'pomodoro_config';

const DEFAULT_POMODORO_CONFIG = Object.freeze({
  workDuration: 25,
  breakDuration: 5,
  longBreakDuration: 15,
  sessionsBeforeLongBreak: 4,
});

const TARGET_OPTIONS = {
  'Actividad Principal': [60, 75, 90],
  'Secundaria': [40, 43, 45],
  'Algoritmos': [15, 20],
  'Menor Prioridad': [20, 23, 25],
  'Conocimiento Pasivo': [10, 13, 15],
};

const ESTIMATED_LABELS = {
  'Actividad Principal': '60-90 min',
  'Secundaria': '40-45 min',
  'Algoritmos': '15-20 min',
  'Menor Prioridad': '20-25 min',
  'Conocimiento Pasivo': '10-15 min',
};

const ACTIVITY_ESTIMATED_RANGE = {
  'Actividad Principal': [60, 90],
  'Secundaria': [40, 45],
  'Algoritmos': [15, 20],
  'Menor Prioridad': [20, 25],
  'Conocimiento Pasivo': [10, 15],
};

export function getPomodoroDurationOptions(activityType) {
  const range = ACTIVITY_ESTIMATED_RANGE[activityType];
  if (!range) return [25];
  const [min, max] = range;
  if (max <= 20) return [max];
  let mid = Math.round((min + max) / 2);
  if (mid <= min) mid = min + 1;
  if (mid >= max) mid = max - 1;
  return [min, mid, max].sort((a, b) => a - b);
}

export function getEstimatedTargetMinutes(activityType) {
  const range = ACTIVITY_ESTIMATED_RANGE[activityType];
  if (!range) return 25;
  return range[1];
}

function normalizeConfig(raw = {}) {
  const toInt = (value, fallback, min, max) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, Math.round(parsed)));
  };

  return {
    workDuration: toInt(raw.workDuration, DEFAULT_POMODORO_CONFIG.workDuration, 10, 90),
    breakDuration: toInt(raw.breakDuration, DEFAULT_POMODORO_CONFIG.breakDuration, 3, 30),
    longBreakDuration: toInt(raw.longBreakDuration, DEFAULT_POMODORO_CONFIG.longBreakDuration, 10, 45),
    sessionsBeforeLongBreak: toInt(raw.sessionsBeforeLongBreak, DEFAULT_POMODORO_CONFIG.sessionsBeforeLongBreak, 2, 8),
  };
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function playBell() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(830, ctx.currentTime);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 1.5);
    setTimeout(() => {
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1046, ctx.currentTime);
      gain2.gain.setValueAtTime(0.3, ctx.currentTime);
      gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.5);
      osc2.start(ctx.currentTime);
      osc2.stop(ctx.currentTime + 1.5);
    }, 400);
  } catch {}
}

function sendNotification(title, body) {
  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: '🍅' });
  }
}

export function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

export function getPomodoroState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function savePomodoroState(state) {
  if (state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function clearPomodoroState() {
  localStorage.removeItem(STORAGE_KEY);
}

export function getPomodoroConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_POMODORO_CONFIG };
    const parsed = JSON.parse(raw);
    return normalizeConfig(parsed || {});
  } catch {
    return { ...DEFAULT_POMODORO_CONFIG };
  }
}

export function savePomodoroConfig(config) {
  const normalized = normalizeConfig(config || {});
  localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export { TARGET_OPTIONS, ESTIMATED_LABELS, DEFAULT_POMODORO_CONFIG };

export default function PomodoroWidget({
  pomodoroState,
  pomodoroConfig = DEFAULT_POMODORO_CONFIG,
  onUpdateConfig,
  onPause,
  onResume,
  onSkip,
  onCancel,
  onCompleteSession,
}) {
  const [remaining, setRemaining] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const intervalRef = useRef(null);
  const completedRef = useRef(false);

const phase = pomodoroState?.phase || 'work';
const totalDuration = phase === 'work'
  ? (pomodoroState?.workDuration || 25) * 60
  : phase === 'break'
    ? (pomodoroState?.breakDuration || 5) * 60
    : (pomodoroState?.longBreakDuration || pomodoroConfig.longBreakDuration || (POMODORO_LONG_BREAK / 60)) * 60;

  const handlePhaseComplete = useCallback(() => {
    playBell();
    if (phase === 'work') {
      sendNotification(
        '🍅 ¡Pomodoro completado!',
        `${pomodoroState?.activityName || 'Tarea'} — ${pomodoroState?.workDuration || 25} min`
      );
      onCompleteSession?.();
    } else {
      sendNotification(
        '☕ ¡Descanso terminado!',
        'Listo para la siguiente sesión'
      );
      onSkip?.();
    }
  }, [phase, pomodoroState?.activityName, pomodoroState?.workDuration, onCompleteSession, onSkip]);

  useEffect(() => {
    if (!pomodoroState) return;

    if (pomodoroState.pausedAt) {
      setRemaining(pomodoroState.remaining || totalDuration);
      setIsPaused(true);
      return;
    }

    const startedAt = new Date(pomodoroState.startedAt).getTime();
    const elapsed = Math.floor((Date.now() - startedAt) / 1000);
    const left = Math.max(0, totalDuration - elapsed);

    if (left <= 0 && !completedRef.current) {
      completedRef.current = true;
      handlePhaseComplete();
      return;
    }

    setRemaining(left);
    setIsPaused(false);
  }, [pomodoroState?.id, pomodoroState?.phase, totalDuration, handlePhaseComplete, pomodoroState]);

  useEffect(() => {
    if (!pomodoroState || isPaused) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          clearInterval(intervalRef.current);
          if (!completedRef.current) {
            completedRef.current = true;
            handlePhaseComplete();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [pomodoroState?.id, pomodoroState?.phase, isPaused, handlePhaseComplete, pomodoroState]);

  const handlePause = () => {
    setIsPaused(true);
    onPause?.(remaining);
  };

  const handleResume = () => {
    setIsPaused(false);
    onResume?.(remaining);
  };

  const handleConfigFieldChange = (event) => {
    const { name, value } = event.target;
    const nextValue = Number(value);
    if (!name || !Number.isFinite(nextValue)) return;
    onUpdateConfig?.({ [name]: nextValue });
  };

  if (!pomodoroState) return null;

  const progress = totalDuration > 0 ? ((totalDuration - remaining) / totalDuration) * 100 : 0;
  const isBreak = phase === 'break' || phase === 'long_break';
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  const targetMin = pomodoroState.targetMinutes || 0;
  const spentSoFar = pomodoroState.spentBefore || 0;
  const currentSessionMinutes = pomodoroState.workDuration || 25;
  const totalSpent = spentSoFar + (phase === 'work' ? (totalDuration - remaining) / 60 : currentSessionMinutes);
  const targetProgress = targetMin > 0 ? Math.min(100, (totalSpent / targetMin) * 100) : 0;

  const widget = (
    <div className={`pomodoro-widget${isBreak ? ' is-break' : ''}`}>
      <div className="pomodoro-header">
        <span className="pomodoro-icon">{isBreak ? '☕' : '🍅'}</span>
        <span className="pomodoro-label">
          {isBreak ? (phase === 'long_break' ? 'Descanso largo' : 'Descanso') : 'Pomodoro'}
        </span>
        <button
          className={`pomodoro-config-toggle ${showConfig ? 'is-open' : ''}`}
          onClick={() => setShowConfig(prev => !prev)}
          title="Configurar Pomodoro"
          aria-label="Configurar Pomodoro"
        >
          ⚙
        </button>
        <button className="pomodoro-close" onClick={onCancel} title="Cancelar">✕</button>
      </div>

      {showConfig && (
        <div className="pomodoro-config-panel">
          <label>
            Trabajo (min)
            <input
              type="number"
              name="workDuration"
              min="10"
              max="90"
              value={pomodoroConfig.workDuration}
              onChange={handleConfigFieldChange}
            />
          </label>
          <label>
            Descanso (min)
            <input
              type="number"
              name="breakDuration"
              min="3"
              max="30"
              value={pomodoroConfig.breakDuration}
              onChange={handleConfigFieldChange}
            />
          </label>
          <label>
            Descanso largo (min)
            <input
              type="number"
              name="longBreakDuration"
              min="10"
              max="45"
              value={pomodoroConfig.longBreakDuration}
              onChange={handleConfigFieldChange}
            />
          </label>
          <label>
            Sesiones para largo
            <input
              type="number"
              name="sessionsBeforeLongBreak"
              min="2"
              max="8"
              value={pomodoroConfig.sessionsBeforeLongBreak}
              onChange={handleConfigFieldChange}
            />
          </label>
        </div>
      )}

      <div className="pomodoro-activity-info">
        <span className="pomodoro-activity-icon">{pomodoroState.activityIcon || '📌'}</span>
        <div className="pomodoro-activity-copy">
          <span className="pomodoro-activity-name">{pomodoroState.activityName}</span>
          <span className="pomodoro-activity-type">{pomodoroState.activityType}</span>
        </div>
      </div>

      <div className="pomodoro-timer">
        <svg className="pomodoro-ring" viewBox="0 0 120 120">
          <circle
            className="pomodoro-ring-bg"
            cx="60" cy="60" r={radius}
            fill="none"
            strokeWidth="6"
          />
          <circle
            className="pomodoro-ring-progress"
            cx="60" cy="60" r={radius}
            fill="none"
            strokeWidth="6"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            transform="rotate(-90 60 60)"
          />
        </svg>
        <span className="pomodoro-countdown">{formatTime(remaining)}</span>
      </div>

      {!isBreak && pomodoroState.totalSessions > 0 && (
        <div className="pomodoro-session-info">
          Sesión {pomodoroState.totalSessions}
          {targetMin > 0 && (
            <> · {Math.round(totalSpent)}/{targetMin} min</>
          )}
        </div>
      )}

      {targetMin > 0 && (
        <div className="pomodoro-target-bar">
          <div
            className="pomodoro-target-fill"
            style={{ width: `${targetProgress}%` }}
          />
        </div>
      )}

      <div className="pomodoro-actions">
        {isPaused ? (
          <button className="pomodoro-btn pomodoro-btn-resume" onClick={handleResume}>
            ▶ Reanudar
          </button>
        ) : (
          <button className="pomodoro-btn pomodoro-btn-pause" onClick={handlePause}>
            ⏸ Pausar
          </button>
        )}
        {isBreak && (
          <button className="pomodoro-btn pomodoro-btn-skip" onClick={onSkip}>
            ⏭ Saltar
          </button>
        )}
      </div>
    </div>
  );

  return createPortal(widget, document.body);
}
