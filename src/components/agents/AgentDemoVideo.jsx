import { Play } from 'lucide-react';

const DEMO_VIDEO =
  '/media/NewpersonalAgent.mp4';

export default function AgentDemoVideo() {
  return (
    <div className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
        <Play className="h-3.5 w-3.5 text-sky-300" />
        <p className="text-[0.68rem] uppercase tracking-[0.16em] text-slate-500">
          See your agent in action
        </p>
      </div>
      <div className="bg-black">
        <video
          className="aspect-video w-full"
          src={DEMO_VIDEO}
          controls
          playsInline
          preload="metadata"
        >
          Your browser does not support the video tag.
        </video>
      </div>
      <p className="px-4 py-3 text-sm leading-relaxed text-slate-400">
        A short look at how a Coinexa agent answers, qualifies and hands work back to you — the
        same engine your agent will run on, whatever your industry.
      </p>
    </div>
  );
}