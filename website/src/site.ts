/**
 * Single source of truth for links and copy shown across the landing page.
 * Update these values here rather than hunting through components.
 */
export const SITE = {
  name: "Todex",
  tagline: "The open-source AI coding agent for your terminal",
  repo: "https://github.com/daksh-maheshwari-ai-enggr/Todex",
  // Update this if the maintainer's LinkedIn slug changes.
  linkedin: "https://www.linkedin.com/in/daksh-maheshwari-ai-enggr/",
  installCommand:
    "curl -fsSL https://raw.githubusercontent.com/daksh-maheshwari-ai-enggr/Todex/master/install.sh | bash",
} as const;

export interface NavLink {
  label: string;
  href: string;
}

export const NAV_LINKS: NavLink[] = [
  { label: "Features", href: "#features" },
  { label: "How it works", href: "#workflow" },
  { label: "Docs", href: "#docs" },
];
