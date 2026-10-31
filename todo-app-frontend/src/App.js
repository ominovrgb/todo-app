import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import './App.css';

const API_BASE_URL = 'http://localhost:8080';
const getTaskTitle = (task) => task.title ?? task.text ?? '';
const getTaskCompleted = (task) => Boolean(task.completed ?? task.is_done ?? false);
const getCategoryName = (category) => category.name ?? category.title ?? '';

function preserveCollectionOrder(previous, incoming) {
  const remaining = new Map(incoming.map((item) => [item.id, item]));
  const ordered = [];
  for (const item of previous) {
    if (remaining.has(item.id)) {
      ordered.push(remaining.get(item.id));
      remaining.delete(item.id);
    }
  }
  // Keep surviving IDs in client order, using fresh data; append newly seen IDs.
  return [...ordered, ...remaining.values()];
}

function getErrorText(error) {
  const detail = error.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map((item) => item?.msg ?? String(item)).join(', ');
  return error.response ? 'The request could not be completed. Please try again.' : 'Unable to reach the server. Check your connection and try again.';
}

function Icon({ name, className = '' }) {
  const paths = {
    tasks: <><rect x="4" y="3" width="16" height="18" rx="3" /><path d="m8 9 1 1 2-2m3 1h3m-9 6 1 1 2-2m3 1h3" /></>,
    categories: <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    check: <path d="m5 12 4 4L19 6" />,
    edit: <><path d="m14 5 5 5M4 20l5-1L20 8a2.1 2.1 0 0 0-5-5L4 14z" /></>,
    trash: <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" /></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6 6a8 8 0 0 1 13 2l1 4M4 12l1 4a8 8 0 0 0 13 2" /></>,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    alert: <><circle cx="12" cy="12" r="9" /><path d="M12 7v6m0 3h.01" /></>,
    workspace: <><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M3 10h18M9 10v10" /></>,
    inbox: <><path d="m3 13 3-9h12l3 9v7H3z" /><path d="M3 13h5l2 3h4l2-3h5" /></>,
    sparkle: <><path d="m12 2 2.7 7.3L22 12l-7.3 2.7L12 22l-2.7-7.3L2 12l7.3-2.7z" /></>,
    sunshine: <><circle cx="12" cy="12" r="6" /><path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l1.5 1.5m13 13L20 20M4 20l1.5-1.5m13-13L20 4M9 11h.01M15 11h.01m-6 3q3 3 6 0" /></>,
  };
  return <svg className={`icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

// Each collection retains its own loading, mutation and feedback state across navigation.
function useCollection(resource) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null);
  const [pending, setPending] = useState('');
  const requestId = useRef(0);
  const mutationLock = useRef(false);

  const load = useCallback(async ({ silent = false } = {}) => {
    const id = ++requestId.current;
    if (!silent) setLoading(true);
    setError('');
    try {
      const response = await axios.get(`${API_BASE_URL}/${resource}`);
      if (id !== requestId.current) return;
      const incoming = Array.isArray(response.data) ? response.data : [];
      setItems((previous) => preserveCollectionOrder(previous, incoming));
      setHasLoaded(true);
    } catch (requestError) {
      if (id === requestId.current) setError(getErrorText(requestError));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [resource]);

  useEffect(() => {
    load();
    return () => { requestId.current += 1; };
  }, [load]);

  const mutate = async (key, operation, message) => {
    if (mutationLock.current) return false;
    mutationLock.current = true;
    setPending(key);
    setNotice(null);
    // Ignore an older refresh that could replace data during this mutation.
    requestId.current += 1;
    setLoading(false);
    try {
      await operation();
      setNotice({ kind: 'success', text: message });
      await load({ silent: true });
      return true;
    } catch (requestError) {
      setNotice({ kind: 'error', text: getErrorText(requestError) });
      return false;
    } finally {
      mutationLock.current = false;
      setPending('');
    }
  };

  return { items, loading, hasLoaded, error, notice, pending, load, mutate, setNotice };
}

function Feedback({ collection, label, onDismiss }) {
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

function LoadingRows({ label }) {
  return <div role="status" aria-label={`Loading ${label}`}>
    <div className="loading-caption">Loading {label}…</div>
    <div aria-hidden="true">{[0, 1, 2, 3].map((row) => <div className="skeleton-row" key={row}><span className="skeleton skeleton-box" /><span className="skeleton skeleton-line" /><span className="skeleton skeleton-end" /></div>)}</div>
  </div>;
}

function EmptyState({ icon, title, description, action, onAction }) {
  return <div className="empty-state">
    <div className="empty-icon"><Icon name={icon} /></div>
    <h3>{title}</h3><p>{description}</p>
    {action && <button type="button" className="btn" onClick={onAction}>{action}</button>}
  </div>;
}

function RecordRow({ title, completed, editing, pending, operation, onToggle, onEdit, onDelete, kind }) {
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

function App() {
  const tasks = useCollection('tasks');
  const categories = useCollection('categories');
  const [activeView, setActiveView] = useState('tasks');
  const [filter, setFilter] = useState('all');
  const [taskTitle, setTaskTitle] = useState('');
  const [isCompleted, setIsCompleted] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [categoryName, setCategoryName] = useState('');
  const [editingCategory, setEditingCategory] = useState(null);
  const inputRef = useRef(null);
  const focusAfterRender = useRef(null);
  const creationDrafts = useRef({ tasks: '', categories: '' });
  const isTasks = activeView === 'tasks';
  const collection = isTasks ? tasks : categories;
  const editing = isTasks ? editingTask : editingCategory;
  const singular = isTasks ? 'task' : 'category';
  const label = isTasks ? 'Tasks' : 'Categories';
  const busy = Boolean(collection.pending);
  const completedCount = tasks.items.filter(getTaskCompleted).length;
  const activeCount = tasks.items.length - completedCount;
  const visibleTasks = tasks.items.filter((task) => filter === 'all' || (filter === 'completed' ? getTaskCompleted(task) : !getTaskCompleted(task)));
  const visibleItems = isTasks ? visibleTasks : categories.items;
  const draft = isTasks ? taskTitle : categoryName;
  const dirty = editing && (draft.trim() !== (isTasks ? editing.title : editing.name) || (isTasks && isCompleted !== editing.completed));

  useEffect(() => {
    const request = focusAfterRender.current;
    if (!request) return;
    if (request.view !== activeView) {
      focusAfterRender.current = null;
    } else if (!busy) {
      const target = [request.target, ...request.fallbackTargets, inputRef.current].find((element) => element?.isConnected);
      // Restoring keyboard focus must not also reposition the page.
      // A completed request must not steal focus after the user moves elsewhere.
      if (!request.origin || document.activeElement === request.origin || document.activeElement === document.body) {
        target?.focus({ preventScroll: true });
      }
      focusAfterRender.current = null;
    }
  });

  const restoreFocus = (target = null, origin = null, fallbackTargets = []) => {
    focusAfterRender.current = { view: activeView, target, origin, fallbackTargets };
  };

  const focusEditor = () => {
    inputRef.current?.focus({ preventScroll: true });
  };

  const resetTask = () => { setTaskTitle(editingTask ? creationDrafts.current.tasks : ''); setIsCompleted(false); setEditingTask(null); creationDrafts.current.tasks = ''; };
  const resetCategory = () => { setCategoryName(editingCategory ? creationDrafts.current.categories : ''); setEditingCategory(null); creationDrafts.current.categories = ''; };

  const cancelEditing = () => {
    if (busy) return;
    if (isTasks) resetTask(); else resetCategory();
    collection.setNotice(null);
    focusEditor();
  };

  const handleEditorKeyDown = (event) => {
    // Enter/Escape can also confirm or dismiss an IME composition.
    if (event.nativeEvent.isComposing || event.keyCode === 229) {
      if (event.key === 'Enter') event.preventDefault();
      return;
    }
    if (event.key === 'Escape' && editing && !busy) {
      event.preventDefault();
      event.stopPropagation();
      cancelEditing();
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (busy) return;
    const origin = document.activeElement;
    const value = (isTasks ? taskTitle : categoryName).trim();
    if (!value) { focusEditor(); return; }
    const patch = {};
    if (editing) {
      if (isTasks) {
        if (value !== editing.title) patch.title = value;
        if (isCompleted !== editing.completed) patch.completed = isCompleted;
      } else if (value !== editing.name) patch.name = value;
      if (!Object.keys(patch).length) {
        collection.setNotice({ kind: 'success', text: 'No changes to save.' });
        return;
      }
    }
    const success = await collection.mutate('save', () => editing
      ? axios.patch(`${API_BASE_URL}/${activeView}/${editing.id}`, patch)
      : axios.post(`${API_BASE_URL}/${activeView}`, isTasks ? { title: value } : { name: value }),
    `${isTasks ? 'Task' : 'Category'} ${editing ? 'updated' : 'created'}.`);
    if (success) {
      if (isTasks) resetTask(); else resetCategory();
      // A newly created task is active, so make it visible in a completed-only view.
      if (isTasks && !editing && filter === 'completed') setFilter((current) => current === 'completed' ? 'all' : current);
    }
    restoreFocus(null, origin);
  };

  const editRecord = (record) => {
    if (busy) return;
    // Returning to the same editor must not replace an unsaved draft.
    if (editing?.id === record.id) { focusEditor(); return; }
    if (!editing) creationDrafts.current[activeView] = draft;
    if (isTasks) {
      const title = getTaskTitle(record);
      const completed = getTaskCompleted(record);
      setTaskTitle(title); setIsCompleted(completed);
      setEditingTask({ id: record.id, title, completed });
    } else {
      const name = getCategoryName(record);
      setCategoryName(name); setEditingCategory({ id: record.id, name });
    }
    collection.setNotice(null);
    focusEditor();
  };

  const toggleRecord = async (record, control) => {
    const origin = document.activeElement;
    const completed = isTasks ? getTaskCompleted(record) : Boolean(record.complete);
    const success = await collection.mutate(`toggle-${record.id}`, () => axios.patch(`${API_BASE_URL}/${activeView}/${record.id}`, isTasks ? { completed: !completed } : { complete: !completed }), `${isTasks ? 'Task' : 'Category'} marked as ${completed ? 'active' : 'completed'}.`);
    if (success && isTasks && editingTask?.id === record.id) {
      setIsCompleted(!completed);
      setEditingTask((previous) => previous ? { ...previous, completed: !completed } : previous);
    }
    restoreFocus(control, origin);
  };

  const deleteRecord = async (record, control) => {
    const origin = document.activeElement;
    const row = control?.closest('.record-row');
    const nextControl = row?.nextElementSibling?.querySelector('.danger');
    const previousControl = row?.previousElementSibling?.querySelector('.danger');
    const listSection = row?.closest('.list-section');
    const success = await collection.mutate(`delete-${record.id}`, () => axios.delete(`${API_BASE_URL}/${activeView}/${record.id}`), `${isTasks ? 'Task' : 'Category'} deleted.`);
    if (success) {
      if (editing?.id === record.id) { if (isTasks) resetTask(); else resetCategory(); }
    }
    // Keep focus near the deletion without opening the editor's on-screen keyboard.
    // Resolve connected candidates after React commits the refreshed list. A failed
    // refetch can leave the original row present, in which case it keeps focus.
    restoreFocus(control, origin, success ? [nextControl, previousControl, listSection] : []);
  };

  const count = (value, source = tasks) => source.hasLoaded ? value : '—';
  const emptyTitle = isTasks
    ? filter === 'active' ? 'No active tasks' : filter === 'completed' ? 'No completed tasks yet' : 'A little space to get things done'
    : 'Give your categories a home';
  const emptyDescription = isTasks
    ? filter === 'active' ? 'You’re all caught up. Add a task when you’re ready for what’s next.' : filter === 'completed' ? 'Complete a task and it will appear here.' : 'Add your first task. Keep the next step clear and the rest will follow.'
    : 'Create your first category to start building your collection.';

  return <div className="app-shell">
    <a href="#main-content" className="skip-link">Skip to content</a>
    <header className="app-header">
      <div className="brand"><Icon name="sparkle" className="brand-sparkle" /><span>ToDo App</span><Icon name="sunshine" className="brand-sunshine" /></div>
      <p className="tagline">Little tasks. Lovely progress.</p>
      <nav className="navigation" aria-label="Main navigation">
        {['tasks', 'categories'].map((view) => <button key={view} type="button" className={`nav-item${activeView === view ? ' active' : ''}`} aria-current={activeView === view ? 'page' : undefined} onClick={() => setActiveView(view)}>
          <Icon name={view} /><span>{view === 'tasks' ? 'Tasks' : 'Categories'}</span>
          <span className="nav-count">{view === 'tasks' ? count(tasks.items.length) : count(categories.items.length, categories)}</span>
        </button>)}
      </nav>
    </header>
    <div className="main-shell">
      <main id="main-content" className="main-content" tabIndex="-1">
        <div className="page-heading">
          <div><h1>{label}</h1><p className="page-description">{isTasks ? 'A little focus, a little more done.' : 'A happy home for your ideas.'}</p></div>
          <button type="button" className="btn" onClick={collection.load} disabled={collection.loading || busy} data-mutation-locked={busy && !collection.loading} aria-label={`Refresh ${activeView}`}><Icon name="refresh" className={collection.loading ? 'spin' : ''} /><span>{collection.loading ? 'Loading' : 'Refresh'}</span></button>
        </div>
        <Feedback collection={collection} label={activeView} onDismiss={(event) => {
          collection.setNotice(null);
          if (event.detail === 0) inputRef.current?.focus({ preventScroll: true });
        }} />
        <form className={`editor${editing ? ' is-editing' : ''}`} onSubmit={handleSubmit} onKeyDown={handleEditorKeyDown} aria-labelledby="editor-title" aria-busy={busy}>
          <div className="editor-heading"><Icon name={editing ? 'edit' : 'plus'} /><h2 id="editor-title">{editing ? `Edit ${singular}` : `New ${singular}`}</h2><span className="editor-context" title={editing ? (isTasks ? editing.title : editing.name) : undefined}>{editing ? (isTasks ? editing.title : editing.name) : isTasks ? 'A clear next step' : 'Make it easy to find'}</span></div>
          <div className="input-row">
            <label className="sr-only" htmlFor="record-name">{isTasks ? 'Task title' : 'Category name'}</label>
            <input ref={inputRef} id="record-name" className="text-input" value={draft} onChange={(event) => isTasks ? setTaskTitle(event.target.value) : setCategoryName(event.target.value)} placeholder={isTasks ? 'What needs to get done?' : 'Name your category'} aria-describedby="editor-help" autoComplete="off" readOnly={busy} required />
            <button type="submit" className="btn btn-primary" disabled={busy || !draft.trim()} data-mutation-locked={busy && Boolean(draft.trim())}><Icon name={collection.pending === 'save' ? 'refresh' : editing ? 'check' : 'plus'} className={collection.pending === 'save' ? 'spin' : ''} />{collection.pending === 'save' ? 'Saving…' : editing ? 'Save changes' : `Add ${singular}`}</button>
            <button className="btn editor-cancel" type="button" disabled={busy || (!editing && !draft)} data-mutation-locked={busy && Boolean(editing || draft)} onClick={cancelEditing}>{editing ? 'Cancel' : 'Clear'}</button>
          </div>
          <div className="editor-options">
            {isTasks && editingTask ? <label className="checkbox-label"><input type="checkbox" checked={isCompleted} onChange={(event) => setIsCompleted(event.target.checked)} disabled={busy} />Mark as completed</label> : <span className="editor-state">{editing ? dirty ? 'Unsaved changes' : 'No changes yet' : 'Only saved items appear in the list.'}</span>}
            <span className="keyboard-hint" aria-hidden="true"><kbd>↵</kbd> {editing ? 'Save' : 'Add'}{editing && <><span className="hint-divider">·</span><kbd>esc</kbd> Cancel</>}</span>
          </div>
          <span id="editor-help" className="sr-only">{editing ? 'Enter to save changes. Escape to cancel editing.' : 'Enter to add. Your draft is kept when switching views.'}</span>
        </form>
        <section className="list-section" aria-label={`${label} list`} tabIndex="-1">
          <div className="list-toolbar">
            {isTasks ? <div className="filters" role="group" aria-label="Filter tasks">{[['all', 'All', tasks.items.length], ['active', 'Active', activeCount], ['completed', 'Completed', completedCount]].map(([value, text, total]) => <button type="button" key={value} className={`filter${filter === value ? ' active' : ''}`} aria-pressed={filter === value} onClick={() => setFilter(value)}>{text}<span className="filter-count">{count(total)}</span></button>)}</div> : <h2 className="list-label">All categories <span className="filter-count">{count(categories.items.length, categories)}</span></h2>}
            <span className="list-summary" role="status">{collection.loading ? collection.hasLoaded ? 'Refreshing…' : 'Loading…' : collection.hasLoaded ? `${visibleItems.length} ${isTasks ? (visibleItems.length === 1 ? 'task' : 'tasks') : (visibleItems.length === 1 ? 'category' : 'categories')}` : 'Unavailable'}</span>
          </div>
          <div className="list-frame" aria-busy={collection.loading || busy}>
            <div className="list-columns" aria-hidden="true"><span><Icon name="check" />{isTasks ? 'Your little checklist' : 'Everything in its place'}</span><span>One thing at a time <Icon name="sparkle" /></span></div>
            {!collection.hasLoaded && collection.loading ? (
              <LoadingRows label={activeView} />
            ) : !collection.hasLoaded && collection.error ? (
              <EmptyState
                icon="alert"
                title={`${label} are unavailable`}
                description="Your data couldn’t be loaded. Retry the request to see your list."
                action="Try again"
                onAction={collection.load}
              />
            ) : visibleItems.length === 0 ? (
              <EmptyState
                icon={isTasks ? filter === 'completed' ? 'check' : 'inbox' : 'categories'}
                title={emptyTitle}
                description={emptyDescription}
                action={isTasks && filter !== 'all' ? 'View all tasks' : `Add your first ${singular}`}
                onAction={isTasks && filter !== 'all' ? () => setFilter('all') : focusEditor}
              />
            ) : (
              <ul className="record-list">
                {visibleItems.map((record) => (
                  <RecordRow
                    key={`${activeView}-${record.id}`}
                    title={isTasks ? getTaskTitle(record) : getCategoryName(record)}
                    completed={isTasks ? getTaskCompleted(record) : Boolean(record.complete)}
                    kind={singular}
                    editing={editing?.id === record.id}
                    pending={busy}
                    operation={collection.pending === `delete-${record.id}` ? 'delete' : collection.pending === `toggle-${record.id}` || (collection.pending === 'save' && editing?.id === record.id) ? 'update' : ''}
                    onToggle={(event) => toggleRecord(record, event.currentTarget)}
                    onEdit={() => editRecord(record)}
                    onDelete={(event) => deleteRecord(record, event.currentTarget)}
                  />
                ))}
              </ul>
            )}
          </div>
          <div className="list-footer"><span>{collection.hasLoaded ? `Showing ${visibleItems.length} of ${collection.items.length} ${activeView}${collection.error ? ' · Last loaded data' : ''}` : `Your ${activeView} will appear here`}</span>{isTasks && tasks.hasLoaded && <span>{completedCount} of {tasks.items.length} completed</span>}</div>
        </section>
      </main>
    </div>
  </div>;
}

export default App;
