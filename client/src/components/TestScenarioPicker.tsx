import { TEST_SCENARIOS, getTestScenario } from 'shared/test-scenarios';
import './TestScenarioPicker.css';

interface TestScenarioPickerProps {
  isHost: boolean;
  pendingScenario?: string;
  onSelect: (scenarioId: string | null) => void;
}

/**
 * Test mode only. Lets the host stack the deck for the next hand so a house
 * rule can be checked on demand instead of waiting for the cards to show up.
 */
export function TestScenarioPicker({ isHost, pendingScenario, onSelect }: TestScenarioPickerProps) {
  const pending = getTestScenario(pendingScenario);

  if (!isHost) {
    return (
      <div className="test-panel">
        <div className="test-panel-title">Test mode</div>
        <p className="test-panel-note">
          {pending
            ? `Host queued "${pending.label}" for the next hand.`
            : 'The host can deal rigged hands to check house rules.'}
        </p>
      </div>
    );
  }

  return (
    <div className="test-panel">
      <div className="test-panel-title">Test mode – rig the next hand</div>
      <div className="test-scenario-list">
        {TEST_SCENARIOS.map((scenario) => {
          const selected = scenario.id === pendingScenario;
          return (
            <button
              key={scenario.id}
              type="button"
              className={`test-scenario-btn ${selected ? 'selected' : ''}`}
              onClick={() => onSelect(selected ? null : scenario.id)}
              title={scenario.expectation}
            >
              {scenario.label}
            </button>
          );
        })}
      </div>
      {pending ? (
        <p className="test-panel-note">
          Next hand is rigged: {pending.expectation} Seats are dealt in the order shown on the table.
        </p>
      ) : (
        <p className="test-panel-note">Pick a scenario, then start the next hand. Tap again to clear.</p>
      )}
    </div>
  );
}
