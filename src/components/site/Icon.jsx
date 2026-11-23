import {
  Bot,
  MessagesSquare,
  Cloud,
  Code2,
  ShieldCheck,
  BarChart3,
  PenTool,
  Server,
  Layers,
  FileText,
  Tablet,
  ShoppingCart,
  Zap,
  TrendingUp,
} from 'lucide-react';

const icons = {
  bot: Bot,
  messages: MessagesSquare,
  cloud: Cloud,
  code: Code2,
  shield: ShieldCheck,
  chart: BarChart3,
  pen: PenTool,
  server: Server,
  layers: Layers,
  file: FileText,
  tablet: Tablet,
  cart: ShoppingCart,
  zap: Zap,
  trend: TrendingUp,
};

export default function Icon({ name, className = 'h-5 w-5' }) {
  const Component = icons[name] || Layers;
  return <Component className={className} strokeWidth={1.6} aria-hidden="true" />;
}