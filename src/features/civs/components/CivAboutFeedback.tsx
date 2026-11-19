import { useId, useState } from 'react';
import FeedbackLink from '../../../shared/ui/FeedbackLink';
import { Icon } from '../../../shared/ui/Icon';
import { FEEDBACK_NOTE, SiteVersionInfo, SourceUsageStatement } from '../../../shared/ui/SiteInfo';
import { CivIllustrationCredit } from './CivBackground';
import './civ-about-feedback.css';

export default function CivAboutFeedback({ civ }: { civ: string }) {
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();
  return (
    <footer className="civ-about-feedback">
      <button type="button" className="civ-about-toggle" aria-expanded={expanded} aria-controls={contentId} onClick={() => setExpanded(!expanded)}>
        关于与反馈 <span>{expanded ? '收起' : '展开'}</span>
        <Icon name={expanded ? 'chevron-up' : 'chevron-down'} />
      </button>
      <div id={contentId} hidden={!expanded} className="civ-about-content">
        <p>{FEEDBACK_NOTE}</p>
        <p className="civ-about-links">
          <FeedbackLink kind="data" /> <FeedbackLink kind="feature" />
        </p>
        <p>
          <SiteVersionInfo />
        </p>
        <CivIllustrationCredit civ={civ} />
        <section className="civ-about-sources" aria-label="资料来源与使用声明">
          <h2>资料来源与使用声明</h2>
          <SourceUsageStatement />
        </section>
      </div>
    </footer>
  );
}
