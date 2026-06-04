import Link from "next/link";
import { Coins } from "lucide-react";

import { ARC_TESTNET } from "@/lib/arc";
import { Badge } from "@/components/ui/badge";

type FooterLink = { label: string; href: string; external?: boolean };

const GITHUB_URL = "https://github.com/Depaulion/arc-ajo";

const groups: { title: string; links: FooterLink[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/#features" },
      { label: "How it works", href: "/#how-it-works" },
      { label: "Security", href: "/docs#security" },
      { label: "Pricing", href: "/docs#pricing" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/docs#overview" },
      { label: "Roadmap", href: "/docs#roadmap" },
      { label: "Source code", href: GITHUB_URL, external: true },
      { label: "Contact", href: `${GITHUB_URL}/issues`, external: true },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Docs", href: "/docs" },
      { label: "FAQ", href: "/docs#faq" },
      { label: "Faucet", href: ARC_TESTNET.faucetUrl, external: true },
      { label: "Network status", href: ARC_TESTNET.explorerUrl, external: true },
    ],
  },
];

function FooterAnchor({ link }: { link: FooterLink }) {
  const className =
    "text-sm text-muted-foreground transition-colors hover:text-foreground";
  if (link.external) {
    return (
      <a
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {link.label}
      </a>
    );
  }
  return (
    <Link href={link.href} className={className}>
      {link.label}
    </Link>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-border/60">
      <div className="container py-14">
        <div className="grid gap-10 lg:grid-cols-[1.5fr_repeat(3,1fr)]">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-lg font-bold">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Coins className="h-5 w-5" />
              </span>
              Arc<span className="text-primary">Ajo</span>
            </div>
            <p className="max-w-xs text-sm text-muted-foreground">
              Rotating savings circles, reimagined on-chain with stablecoins.
              Born from the Yoruba <em>Ajo</em> tradition and practised the world
              over — built for everyone, everywhere.
            </p>
            <Badge variant="accent">Running on {ARC_TESTNET.name}</Badge>
          </div>

          {groups.map((group) => (
            <div key={group.title}>
              <h4 className="text-sm font-semibold">{group.title}</h4>
              <ul className="mt-4 space-y-3">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <FooterAnchor link={link} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border/60 pt-6 sm:flex-row">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Arc Ajo · Test network — tokens have no
            real value.
          </p>
          <div className="flex gap-6 text-sm text-muted-foreground">
            <Link href="/docs" className="transition-colors hover:text-foreground">
              Docs
            </Link>
            <a
              href={ARC_TESTNET.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-foreground"
            >
              Explorer
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
