import React, { useEffect, useState } from 'react';
import Icon from './Icon';

export default function Feedback({ collection, label, onDismiss }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const { notice, setNotice } = collection;

  useEffect(() => {
    if (!notice) {
      setHovered(false);
      setFocused(false);
      return;
    }
    if (notice?.kind !== 'success' || hovered || focused) return;
    const timer = setTimeout(() => setNotice((current) => current === notice ? null : current), 5000);
    return () => clearTimeout(timer);
  }, [notice, setNotice, hovered, focused]);

  return <div className="feedback-region" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocusCapture={() => setFocused(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
    {collection.error && <div className="notice notice-error" role="alert">
      <Icon name="alert" />
      <div className="notice-copy">
        <p>Could not {collection.hasLoaded ? 'refresh' : 'load'} {label}.</p>
        <p className="notice-detail">{collection.error}</p>
        {collection.hasLoaded && <p className="notice-detail">The list and counts show the last loaded data.</p>}
      </div>
      <button className="btn btn-quiet" type="button" onClick={collection.load} disabled={collection.loading || Boolean(collection.pending)} data-mutation-locked={Boolean(collection.pending) && !collection.loading}>Retry</button>
    </div>}
    {collection.notice && <div className={`notice ${collection.notice.kind === 'error' ? 'notice-error' : ''}`} role={collection.notice.kind === 'error' ? 'alert' : 'status'}>
      <Icon name={collection.notice.kind === 'error' ? 'alert' : 'check'} />
      <div className="notice-copy">{collection.notice.text}</div>
      <button className="icon-button" type="button" aria-label="Dismiss notification" onClick={onDismiss}><Icon name="close" /></button>
    </div>}
  </div>;
}
