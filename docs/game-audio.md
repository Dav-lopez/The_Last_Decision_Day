# Sound and music: first playable implementation

The Web Audio director generates an original, quiet score for Maple Street,
home, school and downtown. Footsteps follow actual movement; car hum follows
driving speed. Door, bus, food, lesson bell, wake-up, story-text and completion
cues connect to the existing gameplay events. There are no downloaded audio
files, music subscriptions, paid APIs, microphone permissions or external audio
requests in this implementation.

Audio starts only from **Enable audio**, never from mounting the scene. Players
can mute everything or independently adjust master, music, effects and ambience.
Preferences stay on the device. Music ducks while reading a dialogue or teacher
panel. Backgrounding stops scheduled sources and suspends the context; disposing
the scene closes its context and disconnects the graph.

Six local audio tests validate lazy activation, location-based score data,
dialogue ducking, footsteps/engine lifecycle, bounded scheduling, mute/background
cleanup, interrupted activation and blocked storage. The full local web suite
contains 184 passing tests and TypeScript/Vite builds successfully. Graph tests
do not establish speaker quality, mobile volume balance or browser autoplay
behavior. Audition Test sound, walk/run/stop, enter/exit a car, read a story text,
complete a class, switch location and background/restore on desktop and iPhone.

Future communication work must use actual authenticated shared rooms and server
identity. NPC conversations, player chat and eventual opt-in voice are separate
channels. Voice capture and relay services are outside this audio PR. Keep text
available independently of audio. Manual merge and deployment only.
