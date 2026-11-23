import { useRef, useState } from 'react';
import { Mic, Sparkles, Volume2, VolumeX } from 'lucide-react';
import { Image } from '@/components/ui/image';

const SHOWCASE_LOGO =
  '/media/coinexa-logo.png';

const TONES = ['Professional', 'Friendly', 'Confident', 'Cinematic'];
const SPEAKERS = ['Nova', 'Atlas', 'Iris', 'Orion'];

export default function ShowcaseVideo({ src }) {
  const [tone, setTone] = useState(TONES[0]);
  const [speaker, setSpeaker] = useState(SPEAKERS[0]);
  const [muted, setMuted] = useState(true);
  const videoRef = useRef(null);

  const toggleSound = () => {
    const next = !muted;
    setMuted(next);
    if (videoRef.current) videoRef.current.muted = next;
  };

  return (
    <section className="relative">
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#070b12] shadow-[0_40px_90px_-50px_rgba(56,189,248,0.7)]">
          <video
            ref={videoRef}
            className="aspect-video w-full object-cover"
            src={src}
            poster={SHOWCASE_LOGO}
            autoPlay
            loop
            muted={muted}
            playsInline
            preload="auto"
            aria-label="How Coinexa.net agents work"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#05070a]/45 via-transparent to-transparent"
          />
          <div className="absolute bottom-4 left-4 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/55 px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-white backdrop-blur-md">
              <Sparkles className="h-3.5 w-3.5 text-sky-300" />
              {tone}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/55 px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-white backdrop-blur-md">
              <Mic className="h-3.5 w-3.5 text-sky-300" />
              {speaker}
            </span>
          </div>

          <button
            type="button"
            onClick={toggleSound}
            aria-pressed={!muted}
            className="absolute bottom-4 right-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/55 px-3.5 py-2 text-xs font-semibold text-white backdrop-blur-md transition-colors duration-300 hover:border-white/35"
          >
            {muted ? (
              <VolumeX className="h-4 w-4 text-sky-300" />
            ) : (
              <Volume2 className="h-4 w-4 text-sky-300" />
            )}
            {muted ? 'Sound off' : 'Sound on'}
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-5 rounded-2xl border border-white/[0.07] bg-[#0b0f18] p-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-7">
          <div className="flex shrink-0 items-center border-white/10 sm:border-r sm:pr-6">
            <Image
              src={SHOWCASE_LOGO}
              alt="Coinexa"
              fittingType="fit"
              originWidth={1671}
              originHeight={941}
              className="h-14 w-[100px] mix-blend-screen"
            />
          </div>

          <div>
            <span className="text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Tone of the video
            </span>
            <div className="mt-2 flex flex-wrap gap-2">
              {TONES.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setTone(option)}
                  aria-pressed={tone === option}
                  className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors duration-300 ${
                    tone === option
                      ? 'border-sky-400/60 bg-sky-400/15 text-white'
                      : 'border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/25 hover:text-white'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Speaker
            </span>
            <div className="mt-2 flex flex-wrap gap-2">
              {SPEAKERS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setSpeaker(option)}
                  aria-pressed={speaker === option}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors duration-300 ${
                    speaker === option
                      ? 'border-sky-400/60 bg-sky-400/15 text-white'
                      : 'border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/25 hover:text-white'
                  }`}
                >
                  <span
                    className={`grid h-5 w-5 place-items-center rounded-full text-[0.6rem] font-bold ${
                      speaker === option
                        ? 'bg-gradient-to-br from-sky-400 to-blue-600 text-white'
                        : 'bg-white/[0.08] text-slate-300'
                    }`}
                  >
                    {option.charAt(0)}
                  </span>
                  {option}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}