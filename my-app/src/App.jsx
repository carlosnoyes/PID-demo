import { useState } from 'react';
import { InvertedPendulumSimulator, DroneAltitudeSimulator, HotTubSimulator } from './simulators';
import { fonts } from './utils/styles';

const SIMULATORS = [
  { id: 'pendulum', label: 'Pendulum', component: InvertedPendulumSimulator },
  { id: 'drone', label: 'Drone', component: DroneAltitudeSimulator },
  { id: 'hottub', label: 'Hot Tub', component: HotTubSimulator }
];

function App() {
  const [activeSimulator, setActiveSimulator] = useState('pendulum');

  const ActiveComponent = SIMULATORS.find(s => s.id === activeSimulator)?.component;

  return (
    <div style={{
      height: '100vh',
      background: 'linear-gradient(135deg, #0a0f1a 0%, #1a2035 50%, #0f1a2a 100%)',
      padding: '20px',
      fontFamily: fonts.mono,
      overflow: 'hidden'
    }}>
      {/* Active Simulator */}
      {ActiveComponent && (
        <ActiveComponent
          simulators={SIMULATORS}
          activeSimulator={activeSimulator}
          onSimulatorChange={setActiveSimulator}
        />
      )}

    </div>
  );
}

export default App;
