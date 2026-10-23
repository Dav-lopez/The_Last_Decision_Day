import React from 'react';
import { createRoot } from 'react-dom/client';
import Phaser from 'phaser';

class IntroScene extends Phaser.Scene {
  constructor() { super('intro'); }
  create(): void {
    this.add.text(50, 60, 'THE LAST DECISION', { fontSize: '32px', color: '#ffffff' });
    this.add.text(50, 120, 'Your life. Your choices. Your consequences.', { fontSize: '18px', color: '#ffffff' });
  }
}

function App() {
  const container = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!container.current) return;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: container.current,
      width: 800,
      height: 450,
      backgroundColor: '#14213d',
      scene: IntroScene,
    });
    return () => { game.destroy(true); };
  }, []);
  return <main><h1>The Last Decision</h1><div ref={container} /></main>;
}

createRoot(document.getElementById('root')!).render(<App />);
