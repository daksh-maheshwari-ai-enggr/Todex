import { SITE } from "../site";
import { StarIcon } from "./Icons";
import { InstallCommand } from "./InstallCommand";
import { Reveal } from "./Reveal";

export function CTA() {
  return (
    <section className="section">
      <div className="container">
        <Reveal>
          <div className="cta">
            <div className="cta__glow" aria-hidden="true" />
            <h2 className="cta__title">Put an agent in your terminal today</h2>
            <p className="cta__lead">
              Free, open source, MIT licensed. One command and you're running.
            </p>

            <InstallCommand variant="cta" />

            <a
              className="btn btn--ghost"
              href={SITE.repo}
              target="_blank"
              rel="noreferrer"
            >
              <StarIcon width={16} height={16} />
              <span>Star on GitHub</span>
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
