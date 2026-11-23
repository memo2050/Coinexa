import {
  Bot,
  BookOpen,
  CalendarDays,
  Cloud,
  Compass,
  Database,
  FileText,
  HeartPulse,
  Layers,
  LineChart,
  Mail,
  MessagesSquare,
  Scale,
  Search,
  ShoppingCart,
  Sparkles,
  Truck,
  Users,
  Wrench,
  Zap,
} from 'lucide-react';

const registry = {
  bot: Bot,
  book: BookOpen,
  calendar: CalendarDays,
  cart: ShoppingCart,
  chart: LineChart,
  cloud: Cloud,
  compass: Compass,
  database: Database,
  file: FileText,
  heart: HeartPulse,
  home: Layers,
  layers: Layers,
  mail: Mail,
  messages: MessagesSquare,
  scale: Scale,
  search: Search,
  sparkles: Sparkles,
  truck: Truck,
  users: Users,
  wrench: Wrench,
  zap: Zap,
};

export default function AgentIcon({ name, className = 'h-5 w-5' }) {
  const Component = registry[name] || Sparkles;
  return <Component className={className} />;
}