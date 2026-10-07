import { SITE } from "../site";
import { useCopy } from "../hooks/useCopy";
import { CheckIcon, CopyIcon } from "./Icons";

interface InstallCommandProps {
  /** Slightly different sizing/emphasis between the hero and the final CTA. */
  variant?: "hero" | "cta";
}

export function InstallCommand({ variant = "hero" }: InstallCommandProps) {
  const { copied, copy } = useCopy();

  return (
    <div className={`install install--${variant}`}>
      <span className="install__prompt" aria-hidden="true">
        $
      </span>

      <div className="install__scroll">
        <code className="install__code">{SITE.installCommand}</code>
      </div>

      <button
        type="button"
        className={`install__copy${copied ? " is-copied" : ""}`}
        onClick={() => void copy(SITE.installCommand)}
        aria-label={copied ? "Install command copied" : "Copy install command"}
      >
        {copied ? (
          <CheckIcon width={17} height={17} />
        ) : (
          <CopyIcon width={17} height={17} />
        )}
        <span className="install__copy-text">{copied ? "Copied" : "Copy"}</span>
      </button>
    </div>
  );
}
