import React, { useEffect, useRef, useState } from 'react';
import * as api from './api';
import Feedback from './components/Feedback';
import Icon from './components/Icon';
import RecordRow from './components/RecordRow';
import useCollection from './hooks/useCollection';
import './App.css';

const getTaskTitle = (task) => task.title ?? task.text ?? '';
const getTaskCompleted = (task) => Boolean(task.completed ?? task.is_done ?? false);
const getCategoryName = (category) => category.name ?? category.title ?? '';

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
      ? api.updateRecord(activeView, editing.id, patch)
      : api.createRecord(activeView, isTasks ? { title: value } : { name: value }),
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
    const success = await collection.mutate(`toggle-${record.id}`, () => api.updateRecord(activeView, record.id, isTasks ? { completed: !completed } : { complete: !completed }), `${isTasks ? 'Task' : 'Category'} marked as ${completed ? 'active' : 'completed'}.`);
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
    const success = await collection.mutate(`delete-${record.id}`, () => api.deleteRecord(activeView, record.id), `${isTasks ? 'Task' : 'Category'} deleted.`);
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
