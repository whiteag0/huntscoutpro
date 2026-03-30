import Link from "next/link";
import { Crosshair } from "lucide-react";

const productLinks = [
  { href: "/states", label: "Draw Odds Explorer" },
  { href: "/compare", label: "Unit Comparison" },
  { href: "/trends", label: "Point Creep Trends" },
  { href: "/planner", label: "Hunt Planner" },
  { href: "/turkey", label: "Turkey Intelligence" },
  { href: "/calendar", label: "Season Calendar" },
];

const stateLinks = [
  { href: "/states/colorado", label: "Colorado" },
  { href: "/states/montana", label: "Montana" },
  { href: "/states/wyoming", label: "Wyoming" },
  { href: "/states/arizona", label: "Arizona" },
  { href: "/states/nevada", label: "Nevada" },
  { href: "/states/new-mexico", label: "New Mexico" },
  { href: "/states/idaho", label: "Idaho" },
  { href: "/states/utah", label: "Utah" },
];

const resourceLinks = [
  { href: "/#faq", label: "FAQ" },
  { href: "/about", label: "About" },
];

const legalLinks = [
  { href: "/terms", label: "Terms of Service" },
  { href: "/privacy", label: "Privacy Policy" },
];

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { href: string; label: string }[];
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">
        {title}
      </h3>
      <ul className="space-y-2">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="text-sm text-white/60 hover:text-white transition-colors duration-200"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="text-white" style={{ backgroundColor: "#161311" }}>
      {/* Mountain silhouette decorative element */}
      <div className="w-full overflow-hidden" style={{ backgroundColor: "var(--background)" }}>
        <svg
          viewBox="0 0 1440 60"
          className="w-full block"
          preserveAspectRatio="none"
          style={{ height: "60px" }}
        >
          <path
            d="M0,60 L0,35 L80,28 L160,38 L240,22 L320,32 L400,15 L480,25 L520,10 L560,20 L600,8 L640,18 L680,5 L720,15 L760,8 L800,20 L840,12 L880,22 L920,18 L960,28 L1040,20 L1120,30 L1200,24 L1280,32 L1360,28 L1440,35 L1440,60 Z"
            fill="#161311"
          />
        </svg>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Main footer */}
        <div className="py-12 grid grid-cols-2 md:grid-cols-4 gap-8">
          <FooterColumn title="Product" links={productLinks} />
          <FooterColumn title="Popular States" links={stateLinks} />
          <FooterColumn title="Resources" links={resourceLinks} />
          <FooterColumn title="Legal" links={legalLinks} />
        </div>

        {/* Bottom bar — single line on desktop */}
        <div className="border-t border-white/10 py-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Crosshair className="w-4 h-4 text-gold" />
            <span className="text-sm font-semibold">HuntScout Pro</span>
            <span className="text-sm text-white/40 hidden sm:inline">
              &middot; Made for hunters, by hunters.
            </span>
          </div>
          <p className="text-sm text-white/40 sm:hidden text-center">
            Made for hunters, by hunters.
          </p>
          <p className="text-xs text-white/40">
            &copy; {new Date().getFullYear()} HuntScout Pro. All rights
            reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
