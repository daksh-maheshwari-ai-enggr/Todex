import { NAV_LINKS, SITE } from "../site";
import { GitHubIcon, LinkedInIcon } from "./Icons";
import { Logo } from "./Logo";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="container footer__inner">
        <div className="footer__brand">
          <Logo />
          <p className="footer__tagline">
            The open-source AI coding agent for your terminal.
          </p>
        </div>

        <nav className="footer__links" aria-label="Footer">
          {NAV_LINKS.map((link) => (
            <a key={link.href} className="footer__link" href={link.href}>
              {link.label}
            </a>
          ))}
          <a
            className="footer__link"
            href={SITE.repo}
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
        </nav>

        <div className="footer__social">
          <a
            className="icon-btn"
            href={SITE.repo}
            target="_blank"
            rel="noreferrer"
            aria-label="Todex on GitHub"
          >
            <GitHubIcon width={18} height={18} />
          </a>
          <a
            className="icon-btn"
            href={SITE.linkedin}
            target="_blank"
            rel="noreferrer"
            aria-label="Todex on LinkedIn"
          >
            <LinkedInIcon width={17} height={17} />
          </a>
        </div>
      </div>

      <div className="container footer__bottom">
        <span>MIT licensed · Built in the open</span>
        <span>© {year} Todex</span>
      </div>
    </footer>
  );
}
