import { SITE } from "../site";
import { ArrowRightIcon, GitHubIcon, TerminalIcon } from "./Icons";
import { Reveal } from "./Reveal";

/** Docs is intentionally a placeholder for now. */
export function DocsPlaceholder() {
  return (
    <section className="section" id="docs">
      <div className="container">
        <Reveal>
          <div className="docs">
            <span className="docs__icon">
              <TerminalIcon width={24} height={24} />
            </span>
            <p className="eyebrow eyebrow--center">Docs</p>
            <h2 className="section__title section__title--center">
              Documentation is on the way
            </h2>
            <p className="docs__body">
              Full guides are in progress. In the meantime, the repo README
              covers setup, flags and the available TUI commands — and the
              source is the source of truth.
            </p>

            <div className="docs__actions">
              <a
                className="btn btn--primary"
                href={SITE.repo}
                target="_blank"
                rel="noreferrer"
              >
                <GitHubIcon width={17} height={17} />
                <span>Browse the repo</span>
              </a>
              <a
                className="link-arrow"
                href={`${SITE.repo}#readme`}
                target="_blank"
                rel="noreferrer"
              >
                <span>Read the README</span>
                <ArrowRightIcon width={17} height={17} />
              </a>
            </div>

            <span className="docs__tag">coming soon</span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
