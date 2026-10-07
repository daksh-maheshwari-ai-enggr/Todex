import { SITE } from "../site";
import { ArrowRightIcon, StarIcon } from "./Icons";
import { InstallCommand } from "./InstallCommand";

export function Hero() {
  return (
    <section className="hero" id="top">
      <div className="container hero__inner">
        <span className="hero__badge">
          <span className="hero__badge-dot" aria-hidden="true" />
          Open source · MIT licensed
        </span>

        <h1 className="hero__title">
          The AI coding agent that lives in your{" "}
          <span className="accent">
            terminal
            <svg
              className="accent__underline"
              viewBox="0 0 300 12"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path
                d="M2 8C60 3 240 2 298 6"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
          </span>
        </h1>

        <p className="hero__sub">
          Todex reads your project, plans the work, edits real files, runs your
          tests and repairs what breaks — all from a fast, keyboard-driven
          terminal UI. No IDE, no lost context.
        </p>

        <div className="hero__install">
          <InstallCommand />
          <p className="hero__hint">Requires Node.js and Git · works in any project</p>
        </div>

        <div className="hero__actions">
          <a
            className="btn btn--primary"
            href={SITE.repo}
            target="_blank"
            rel="noreferrer"
          >
            <StarIcon width={17} height={17} />
            <span>Star on GitHub</span>
          </a>
          <a className="link-arrow" href="#features">
            <span>Explore features</span>
            <ArrowRightIcon width={17} height={17} />
          </a>
          <a className="link-arrow" href="#docs">
            <span>Read the docs</span>
            <ArrowRightIcon width={17} height={17} />
          </a>
        </div>
      </div>
    </section>
  );
}
