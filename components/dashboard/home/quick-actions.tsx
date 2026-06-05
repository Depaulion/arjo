import Link from "next/link";
import { ArrowDownToLine, Plus, Users, Vault } from "lucide-react";

type Action = {
  label: string;
  href: string;
  icon: React.ReactNode;
  tone: "primary" | "accent" | "neutral";
};

const ACTIONS: Action[] = [
  {
    label: "Save",
    href: "#save",
    icon: <Plus className="h-5 w-5" />,
    tone: "primary",
  },
  {
    label: "Withdraw",
    href: "/account/withdraw",
    icon: <ArrowDownToLine className="h-5 w-5" />,
    tone: "neutral",
  },
  {
    label: "Vaults",
    href: "#save",
    icon: <Vault className="h-5 w-5" />,
    tone: "neutral",
  },
  {
    label: "Join Circle",
    href: "#community",
    icon: <Users className="h-5 w-5" />,
    tone: "accent",
  },
];

const TONES: Record<Action["tone"], string> = {
  primary: "bg-primary/10 text-primary",
  accent: "bg-accent/10 text-accent",
  neutral: "bg-secondary text-foreground",
};

/** A 4-up grid of the most common next actions, thumb-friendly on mobile. */
export function QuickActions() {
  return (
    <div className="grid grid-cols-4 gap-3">
      {ACTIONS.map((a) => (
        <Link
          key={a.label}
          href={a.href}
          className="flex flex-col items-center gap-2 rounded-2xl border border-border/60 bg-card p-3 text-center shadow-sm transition-colors hover:border-primary/40"
        >
          <span
            className={`flex h-11 w-11 items-center justify-center rounded-2xl ${
              TONES[a.tone]
            }`}
          >
            {a.icon}
          </span>
          <span className="text-xs font-medium leading-tight">{a.label}</span>
        </Link>
      ))}
    </div>
  );
}
