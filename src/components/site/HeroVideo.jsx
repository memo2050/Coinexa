import { useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

export default function HeroVideo({ src }) {
  const videoRef = useRef(null);
  const [muted, setMuted] = useState(true);

  const toggleSound = () => {
    const el = videoRef.current;
    if (!el) return;
    const next = !muted;
    el.muted = next;
    if (!next) {
      el.volume = 1;
      el.play().catch(() => {});
    }
    setMuted(next);
  };

  return (
    <div className="relative overflow-hidden rounded-l-2xl border border-r-0 border-white/10 bg-[#070b12] shadow-[0_30px_70px_-40px_rgba(56,189,248,0.65)]">
      <video
        ref={videoRef}
        className="aspect-video w-full object-cover"
        src={src}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        aria-label="Studio showreel"
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#05070a]/70 via-transparent to-transparent"
      />

      <button
        type="button"
        onClick={toggleSound}
        aria-pressed={!muted}
        aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
        className="absolute bottom-4 right-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/55 px-3.5 py-2 text-xs font-semibold text-white backdrop-blur-md transition-colors duration-300 hover:border-white/35 hover:bg-black/75"
      >
        {muted ? <VolumeX className="h-4 w-4 text-slate-300" /> : <Volume2 className="h-4 w-4 text-sky-300" />}
        {muted ? 'Sound off' : 'Sound on'}
      </button>
    </div>
  );
}