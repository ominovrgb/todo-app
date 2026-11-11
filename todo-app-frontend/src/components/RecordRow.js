import React from 'react';
import Icon from './Icon';

export default function RecordRow({ title, completed, editing, pending, operation, onToggle, onEdit, onDelete, kind }) {
  return <li className={`record-row${completed ? ' is-complete' : ''}${editing ? ' is-editing' : ''}`} aria-busy={Boolean(operation)}>
    <label className="record-check-control">
      <input className="record-checkbox" type="checkbox" checked={completed} onChange={onToggle} disabled={pending} aria-label={`Mark ${kind} “${title}” as ${completed ? 'active' : 'completed'}`} />
    </label>
    <div className="record-content">
      <span className={`record-title${completed ? ' done' : ''}`}>{title}</span>
    </div>
    <span className={`record-status${editing ? ' editing' : completed ? ' complete' : ''}`}>
      {operation ? <Icon name="refresh" className="spin" /> : <span className="status-dot" />}
      {operation ? operation === 'delete' ? 'Deleting…' : 'Updating…' : editing ? 'Editing' : completed ? 'Completed' : 'Active'}
    </span>
    <div className="record-actions">
      <button className="icon-button edit-button" type="button" disabled={pending} onClick={onEdit} aria-label={`Edit ${kind} “${title}”`} aria-pressed={editing} title={editing ? 'Return to editor' : 'Edit'}><Icon name="edit" /><span>{editing ? 'Editing' : 'Edit'}</span></button>
      <button className="icon-button danger" type="button" disabled={pending} onClick={onDelete} aria-label={`Delete ${kind} “${title}”`} title="Delete"><Icon name="trash" /></button>
    </div>
  </li>;
}
