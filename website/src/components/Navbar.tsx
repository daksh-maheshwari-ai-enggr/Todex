import { useEffect, useState } from "react";
import { NAV_LINKS, SITE } from "../site";
import {
  CloseIcon,
  GitHubIcon,
  LinkedInIcon,
  MenuIcon,
  StarIcon,
} from "./Icons";
import { Logo } from "./Logo";

export function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`nav${scrolled ? " is-scrolled" : ""}`}>
      <div className="container nav__inner">
        <Logo />

        <nav className="nav__links" aria-label="Primary">
          {NAV_LINKS.map((link) => (
            <a key={link.href} className="nav__link" href={link.href}>
              {link.label}
            </a>
          ))}
        </nav>

        <div className="nav__actions">
          <a
            className="icon-btn"
            href={SITE.repo}
            target="_blank"
            rel="noreferrer"
            aria-label="Todex on GitHub"
            title="GitHub"
          >
            <GitHubIcon width={19} height={19} />
          </a>
          <a
            className="icon-btn"
            href={SITE.linkedin}
            target="_blank"
            rel="noreferrer"
            aria-label="Todex on LinkedIn"
            title="LinkedIn"
          >
            <LinkedInIcon width={18} height={18} />
          </a>

          <a
            className="btn btn--ghost nav__star"
            href={SITE.repo}
            target="_blank"
            rel="noreferrer"
          >
            <StarIcon width={16} height={16} />
            <span>Star</span>
          </a>

          <button
            type="button"
            className="icon-btn nav__toggle"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>

      <div className={`nav__mobile${open ? " is-open" : ""}`}>
        <div className="container nav__mobile-inner">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              className="nav__mobile-link"
              href={link.href}
              onClick={() => setOpen(false)}
            >
              {link.label}
            </a>
          ))}
          <div className="nav__mobile-actions">
            <a
              className="btn btn--ghost"
              href={SITE.repo}
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
            >
              <GitHubIcon width={17} height={17} />
              <span>GitHub</span>
            </a>
            <a
              className="btn btn--ghost"
              href={SITE.linkedin}
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
            >
              <LinkedInIcon width={16} height={16} />
              <span>LinkedIn</span>
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}
