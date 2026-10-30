import { useEffect, useState, type MutableRefObject } from 'react';
import { createGameAudio, type AudioStatus, type GameAudio } from './director.mjs';
import { readAudioSettings, writeAudioSettings } from './settings.mjs';
import './audio.css';

export function AudioPanel({ director }: { director: MutableRefObject<GameAudio | null> }) {
  const [settings,setSettings]=useState(readAudioSettings);
  const [status,setStatus]=useState<AudioStatus>('off');
  useEffect(()=>{
    const audio=createGameAudio({onStatus:setStatus});director.current=audio;
    audio.setSettings(settings);
    const visibility=()=>audio.setHidden(document.hidden);
    visibility();document.addEventListener('visibilitychange',visibility);
    return ()=>{document.removeEventListener('visibilitychange',visibility);audio.dispose();director.current=null;};
  },[]);
  useEffect(()=>{director.current?.setSettings(settings);writeAudioSettings(settings);},[settings]);
  return <section className="game-audio" aria-label="Game sound and music">
    <div className="game-audio-heading"><strong>Sound & music</strong>
      <button type="button" onClick={()=>{
        if(status==='running') director.current?.disable();
        else void director.current?.enable();
      }}>{status==='running' ? 'Disable audio' : 'Enable audio'}</button>
      <button type="button" aria-pressed={settings.muted} onClick={()=>setSettings(current=>({...current,muted:!current.muted}))}>
        {settings.muted ? 'Unmute all' : 'Mute all'}</button>
      <button type="button" disabled={status!=='running'||settings.muted} onClick={()=>director.current?.cue('achievement')}>Test sound</button>
    </div>
    <p role="status">{status==='unavailable' ? 'Audio is unavailable in this browser. The game remains playable.'
      : status==='suspended' ? 'Audio paused. Tap Enable audio to resume.'
        : status==='running' ? settings.muted ? 'All sound muted.' : 'Audio enabled. Music softens during dialogue.' : 'Tap Enable audio to hear the game.'}</p>
    <div className="game-audio-sliders">{(['master','music','effects','ambience'] as const).map(channel=>
      <label key={channel}>{channel==='effects' ? 'Sound effects' : channel.charAt(0).toUpperCase()+channel.slice(1)} · {Math.round(settings[channel]*100)}%
        <input type="range" min="0" max="100" value={Math.round(settings[channel]*100)}
          onChange={event=>setSettings(current=>({...current,[channel]:Number(event.target.value)/100}))}/>
      </label>)}</div>
  </section>;
}
