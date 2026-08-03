import { useCallback, useEffect, useRef, useState } from 'react';

const POWER_ZONE = { min: 40, max: 60 };
const DIRECTION_ZONE = { min: -15, max: 15 };

interface FieldGoalMinigameProps {
  onComplete: (success: boolean) => void;
}

export function FieldGoalMinigame({ onComplete }: FieldGoalMinigameProps) {
  const [phase, setPhase] = useState<'power' | 'direction' | 'result'>('power');
  const [power, setPower] = useState(50);
  const [direction, setDirection] = useState(0);
  const [powerLocked, setPowerLocked] = useState(false);
  const [directionLocked, setDirectionLocked] = useState(false);
  const [powerVel, setPowerVel] = useState(4);
  const [directionVel, setDirectionVel] = useState(3.75);
  const [result, setResult] = useState<boolean | null>(null);
  /** Swallows the click a touch device synthesizes after pointerdown. */
  const lastTriggerAt = useRef(0);

  useEffect(() => {
    if (phase !== 'power' || powerLocked) return;
    const t = setInterval(() => {
      setPower((p) => {
        const next = p + powerVel;
        if (next >= 100) return 100;
        if (next <= 0) return 0;
        return next;
      });
    }, 30);
    return () => clearInterval(t);
  }, [phase, powerLocked, powerVel]);

  useEffect(() => {
    if (phase !== 'power') return;
    setPowerVel((v) => (power >= 100 ? -4 : power <= 0 ? 4 : v));
  }, [phase, power]);

  useEffect(() => {
    if (phase !== 'direction' || directionLocked) return;
    const t = setInterval(() => {
      setDirection((d) => {
        const next = d + directionVel;
        if (next >= 50) return 50;
        if (next <= -50) return -50;
        return next;
      });
    }, 30);
    return () => clearInterval(t);
  }, [phase, directionLocked, directionVel]);

  useEffect(() => {
    if (phase !== 'direction') return;
    setDirectionVel((v) => (direction >= 50 ? -3.75 : direction <= -50 ? 3.75 : v));
  }, [phase, direction]);

  /** One "kick" input, however it arrived: space bar, mouse click or tap. */
  const trigger = useCallback(() => {
    const now = Date.now();
    if (now - lastTriggerAt.current < 150) return;
    lastTriggerAt.current = now;

    if (phase === 'power' && !powerLocked) {
      setPowerLocked(true);
      setTimeout(() => setPhase('direction'), 400);
    } else if (phase === 'direction' && !directionLocked) {
      setDirectionLocked(true);
      const success =
        power >= POWER_ZONE.min &&
        power <= POWER_ZONE.max &&
        direction >= DIRECTION_ZONE.min &&
        direction <= DIRECTION_ZONE.max;
      setResult(success);
      setPhase('result');
      setTimeout(() => onComplete(success), 1500);
    }
  }, [phase, powerLocked, directionLocked, power, direction, onComplete]);

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.code !== 'Enter' && e.code !== 'NumpadEnter') return;
      e.preventDefault();
      trigger();
    },
    [trigger]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  const handlePointerDown = (e: React.PointerEvent) => {
    // Stop the tap from scrolling the table underneath or double-firing as a click.
    e.preventDefault();
    trigger();
  };

  const armed = phase === 'power' ? !powerLocked : phase === 'direction' ? !directionLocked : false;

  return (
    <div
      className="fieldgoal-overlay"
      onPointerDown={phase === 'result' ? undefined : handlePointerDown}
      onContextMenu={(e) => e.preventDefault()}
      role="presentation"
    >
      <div className="fieldgoal-modal">
        <h2 className="fieldgoal-title">Field Goal</h2>
        {phase === 'power' && (
          <div className="fieldgoal-phase">
            <p className="fieldgoal-instruction">Tap anywhere (or press SPACE) to set power</p>
            <div className="fieldgoal-power-bar">
              <div className="fieldgoal-power-zone" />
              <div
                className="fieldgoal-power-needle"
                style={{ bottom: `${power}%` }}
              />
            </div>
          </div>
        )}
        {phase === 'direction' && (
          <div className="fieldgoal-phase">
            <p className="fieldgoal-instruction">Tap anywhere (or press SPACE) to set direction</p>
            <div className="fieldgoal-direction-wrap">
              <div className="fieldgoal-direction-zone" />
              <div
                className="fieldgoal-direction-needle"
                style={{ left: `${50 + direction}%` }}
              />
            </div>
          </div>
        )}
        {phase === 'result' && (
          <div className="fieldgoal-result">
            <div className="fieldgoal-uprights">
              <div className="fieldgoal-crossbar" />
              <div className="fieldgoal-post fieldgoal-post-left" />
              <div className="fieldgoal-post fieldgoal-post-right" />
            </div>
            <p className={result ? 'fieldgoal-success' : 'fieldgoal-miss'}>
              {result ? 'Good!' : 'No good'}
            </p>
          </div>
        )}
        {phase !== 'result' && (
          <button
            type="button"
            className="fieldgoal-kick-btn"
            onPointerDown={(e) => {
              e.stopPropagation();
              handlePointerDown(e);
            }}
            disabled={!armed}
          >
            {phase === 'power' ? 'Set power' : 'Kick'}
          </button>
        )}
      </div>
    </div>
  );
}
