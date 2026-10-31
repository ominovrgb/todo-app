import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import { readFileSync } from 'fs';
import App from './App';

jest.mock('axios', () => ({
  get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn(),
}));

const API = 'http://localhost:8080';
let records;

beforeEach(() => {
  jest.resetAllMocks();
  records = {
    tasks: [
      { id: 0, title: 'Plan release', completed: false },
      { id: 2, text: 'Review notes', is_done: true },
      { id: 3, title: 'Write documentation', completed: false },
    ],
    categories: [{ id: 0, name: 'Product', complete: false }],
  };
  axios.get.mockImplementation(async (url) => ({ data: records[url.split('/').pop()].map((item) => ({ ...item })) }));
  axios.post.mockImplementation(async (url, data) => {
    records[url.split('/').pop()].push({ id: 9, ...data });
    return { data: { id: 9, ...data } };
  });
  axios.patch.mockImplementation(async (url, data) => {
    const [, resource, id] = new URL(url).pathname.split('/');
    const record = records[resource].find((item) => String(item.id) === id);
    Object.assign(record, data);
    return { data: record };
  });
  axios.delete.mockImplementation(async (url) => {
    const [, resource, id] = new URL(url).pathname.split('/');
    records[resource] = records[resource].filter((item) => String(item.id) !== id);
    return { data: null };
  });
});

async function renderLoaded() {
  render(<App />);
  await screen.findByText('Plan release');
}

const click = (name) => fireEvent.click(screen.getByRole('button', { name }));
const type = (name, value) => fireEvent.change(screen.getByRole('textbox', { name }), { target: { value } });

async function waitForSaved(text) {
  await screen.findByText(text);
  await waitFor(() => expect(screen.getByRole('textbox')).not.toHaveAttribute('readonly'));
}

describe('stable client order with unordered UUID task responses', () => {
  const titles = ['Plan release', 'Review notes', 'Write documentation'];
  const rows = () => within(screen.getByRole('list')).getAllByRole('listitem');
  const expectOrder = (expected) => {
    expect(rows().map((row) => row.querySelector('.record-title').textContent)).toEqual(expected);
  };
  const expectSameRows = (expected) => {
    const current = rows();
    expect(current).toHaveLength(expected.length);
    current.forEach((row, index) => expect(row).toBe(expected[index]));
  };
  const reverseRefetches = () => {
    axios.get.mockImplementation(async (url) => ({
      data: [...records[url.split('/').pop()]].reverse().map((item) => ({ ...item })),
    }));
  };

  beforeEach(() => {
    // Deliberately neither lexical UUID order nor completion order.
    const ids = [
      'ffffffff-ffff-4fff-8fff-ffffffffffff',
      '11111111-1111-4111-8111-111111111111',
      '88888888-8888-4888-8888-888888888888',
    ];
    records.tasks = records.tasks.map((record, index) => ({ ...record, id: ids[index] }));
  });

  test('completion and explicit refresh preserve All order and mounted rows', async () => {
    await renderLoaded();
    const originalRows = rows();
    const input = screen.getByRole('textbox');
    const list = screen.getByRole('list');
    expectOrder(titles);
    reverseRefetches();

    fireEvent.click(within(originalRows[0]).getByRole('checkbox'));
    await waitForSaved('Task marked as completed.');
    expectOrder(titles);
    expectSameRows(originalRows);
    expect(within(originalRows[0]).getByRole('checkbox')).toBeChecked();

    fireEvent.click(within(originalRows[0]).getByRole('checkbox'));
    await waitForSaved('Task marked as active.');
    click('Refresh tasks');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh tasks' })).toBeEnabled());
    expectOrder(titles);
    expectSameRows(originalRows);
    expect(screen.getByRole('textbox')).toBe(input);
    expect(screen.getByRole('list')).toBe(list);
  });

  test('editing uses fresh data without moving or remounting rows', async () => {
    await renderLoaded();
    const originalRows = rows();
    reverseRefetches();
    click('Edit task “Plan release”');
    type('Task title', 'Plan next release');
    click('Save changes');
    await waitForSaved('Task updated.');
    expectOrder(['Plan next release', ...titles.slice(1)]);
    expectSameRows(originalRows);
    expect(axios.patch).toHaveBeenCalledWith(`${API}/tasks/${records.tasks[0].id}`, { title: 'Plan next release' });
  });

  test.each([0, 1, 2])('deleting row %s preserves survivor order and restores nearby focus without scrolling', async (index) => {
    await renderLoaded();
    const originalRows = rows();
    const remainingRows = originalRows.filter((_, rowIndex) => rowIndex !== index);
    const targetRow = originalRows[index + 1] || originalRows[index - 1];
    const target = within(targetRow).getByRole('button', { name: /^Delete task/ });
    const targetFocus = jest.spyOn(target, 'focus');
    const editorFocus = jest.spyOn(screen.getByRole('textbox'), 'focus');
    const scroll = jest.spyOn(window, 'scrollTo');
    reverseRefetches();
    try {
      userEvent.click(within(originalRows[index]).getByRole('button', { name: /^Delete task/ }));
      await waitForSaved('Task deleted.');
      expectOrder(titles.filter((_, rowIndex) => rowIndex !== index));
      expectSameRows(remainingRows);
      expect(originalRows[index]).not.toBeInTheDocument();
      expect(target).toHaveFocus();
      expect(targetFocus).toHaveBeenLastCalledWith({ preventScroll: true });
      expect(editorFocus).not.toHaveBeenCalled();
      expect(scroll).not.toHaveBeenCalled();
    } finally {
      targetFocus.mockRestore();
      editorFocus.mockRestore();
      scroll.mockRestore();
    }
  });

  test('new tasks append in discovery order even when the API prepends them and reverses existing tasks', async () => {
    await renderLoaded();
    const originalRows = rows();
    const expected = [...titles];
    for (const [id, title] of [
      ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'New task one'],
      ['00000000-0000-4000-8000-000000000000', 'New task two'],
    ]) {
      axios.post.mockImplementationOnce(async (url, data) => {
        const created = { id, ...data, completed: false };
        records.tasks = [created, ...records.tasks.slice().reverse()];
        return { data: created };
      });
      type('Task title', title);
      click('Add task');
      await waitForSaved('Task created.');
      expected.push(title);
      expectOrder(expected);
      originalRows.forEach((row, index) => expect(rows()[index]).toBe(row));
      originalRows.push(rows()[originalRows.length]);
    }
    click('Refresh tasks');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh tasks' })).toBeEnabled());
    expectOrder(expected);
    expectSameRows(originalRows);
  });

  test('filtered views still remove toggled tasks and returning to All restores client order', async () => {
    await renderLoaded();
    reverseRefetches();
    click('Active 2');
    const survivor = screen.getByText('Write documentation').closest('li');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mark task “Plan release” as completed' }));
    await waitForSaved('Task marked as completed.');
    expectOrder(['Write documentation']);
    expect(rows()[0]).toBe(survivor);
    click('Completed 2');
    expectOrder(['Plan release', 'Review notes']);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mark task “Plan release” as active' }));
    await waitForSaved('Task marked as active.');
    expectOrder(['Review notes']);
    click('All 3');
    expectOrder(titles);
  });

  test('deleting the final task focuses the list region rather than opening the editor', async () => {
    records.tasks = records.tasks.slice(0, 1);
    await renderLoaded();
    const region = screen.getByRole('region', { name: 'Tasks list' });
    const focus = jest.spyOn(region, 'focus');
    try {
      userEvent.click(screen.getByRole('button', { name: 'Delete task “Plan release”' }));
      await waitForSaved('Task deleted.');
      expect(screen.getByText('A little space to get things done')).toBeInTheDocument();
      expect(region).toHaveFocus();
      expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });
      expect(screen.getByRole('textbox')).not.toHaveFocus();
    } finally {
      focus.mockRestore();
    }
  });
});

test('loads both collections and filters real data, including legacy task fields', async () => {
  await renderLoaded();
  expect(axios.get).toHaveBeenCalledWith(`${API}/tasks`);
  expect(axios.get).toHaveBeenCalledWith(`${API}/categories`);
  const filters = within(screen.getByRole('group', { name: 'Filter tasks' }));
  expect(filters.getByRole('button', { name: 'All 3' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(filters.getByRole('button', { name: 'Active 2' }));
  expect(screen.queryByText('Review notes')).not.toBeInTheDocument();
  expect(screen.getByText('Plan release')).toBeInTheDocument();
  fireEvent.click(filters.getByRole('button', { name: 'Completed 1' }));
  expect(screen.getByText('Review notes')).toBeInTheDocument();
  expect(screen.queryByText('Plan release')).not.toBeInTheDocument();
  expect(screen.getByText('Showing 1 of 3 tasks')).toBeInTheDocument();
});

test('preserves task POST, minimal PATCH, status PATCH and DELETE contracts, including ID zero', async () => {
  await renderLoaded();
  type('Task title', '  Ship release  ');
  click('Add task');
  await waitForSaved('Task created.');
  expect(axios.post).toHaveBeenCalledWith(`${API}/tasks`, { title: 'Ship release' });
  expect(screen.getByText('Ship release')).toBeInTheDocument();
  expect(screen.getByRole('textbox')).toHaveValue('');

  click('Edit task “Plan release”');
  expect(screen.getByRole('textbox')).toHaveFocus();
  type('Task title', 'Plan next release');
  click('Save changes');
  await waitForSaved('Task updated.');
  expect(axios.patch).toHaveBeenLastCalledWith(`${API}/tasks/0`, { title: 'Plan next release' });

  click('Edit task “Plan next release”');
  fireEvent.click(screen.getByRole('checkbox', { name: 'Mark as completed' }));
  click('Save changes');
  await waitForSaved('Task updated.');
  expect(axios.patch).toHaveBeenLastCalledWith(`${API}/tasks/0`, { completed: true });

  fireEvent.click(screen.getByRole('checkbox', { name: 'Mark task “Plan next release” as active' }));
  await waitForSaved('Task marked as active.');
  expect(axios.patch).toHaveBeenLastCalledWith(`${API}/tasks/0`, { completed: false });

  click('Delete task “Plan next release”');
  await waitForSaved('Task deleted.');
  expect(axios.delete).toHaveBeenCalledWith(`${API}/tasks/0`);
  expect(screen.queryByText('Plan next release')).not.toBeInTheDocument();
});

test('preserves category GET, POST, PATCH, completion and DELETE contracts', async () => {
  await renderLoaded();
  click('Categories 1');
  expect(screen.getByRole('heading', { level: 1, name: 'Categories' })).toBeInTheDocument();
  type('Category name', '  Research  ');
  click('Add category');
  await waitForSaved('Category created.');
  expect(axios.post).toHaveBeenCalledWith(`${API}/categories`, { name: 'Research' });
  click('Edit category “Product”');
  type('Category name', 'Engineering');
  click('Save changes');
  await waitForSaved('Category updated.');
  expect(axios.patch).toHaveBeenLastCalledWith(`${API}/categories/0`, { name: 'Engineering' });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Mark category “Engineering” as completed' }));
  await waitForSaved('Category marked as completed.');
  expect(axios.patch).toHaveBeenLastCalledWith(`${API}/categories/0`, { complete: true });
  click('Delete category “Engineering”');
  await waitForSaved('Category deleted.');
  expect(axios.delete).toHaveBeenCalledWith(`${API}/categories/0`);
  expect(screen.queryByText('Engineering')).not.toBeInTheDocument();
});

test('keeps unsaved edits after FastAPI validation errors and allows retry', async () => {
  await renderLoaded();
  axios.patch.mockRejectedValueOnce({ response: { data: { detail: [{ msg: 'Title is invalid' }] } } });
  click('Edit task “Plan release”');
  type('Task title', 'Changed title');
  click('Save changes');
  expect(await screen.findByRole('alert')).toHaveTextContent('Title is invalid');
  expect(screen.getByRole('textbox')).toHaveValue('Changed title');
  expect(screen.getByRole('heading', { name: 'Edit task' })).toBeInTheDocument();
  click('Save changes');
  await waitForSaved('Task updated.');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByText('Changed title')).toBeInTheDocument();
});

test('cancels edits, skips unchanged PATCH requests and preserves separate drafts', async () => {
  await renderLoaded();
  click('Edit task “Plan release”');
  click('Save changes');
  expect(screen.getByText('No changes to save.')).toBeInTheDocument();
  expect(axios.patch).not.toHaveBeenCalled();
  type('Task title', 'Unsaved task');
  click('Categories 1');
  type('Category name', 'Category draft');
  click('Tasks 3');
  expect(screen.getByRole('textbox')).toHaveValue('Unsaved task');
  click('Cancel');
  expect(screen.getByRole('textbox')).toHaveValue('');
  expect(screen.getByText('Plan release')).toBeInTheDocument();
  click('Categories 1');
  expect(screen.getByRole('textbox')).toHaveValue('Category draft');
});

test('shows initial loading without fabricated zero counts, then an actionable error and retry', async () => {
  let rejectRequest;
  axios.get.mockImplementationOnce(() => new Promise((resolve, reject) => { rejectRequest = reject; }));
  render(<App />);
  expect(screen.getByRole('status', { name: 'Loading tasks' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'All —' })).toBeInTheDocument();
  await act(async () => { rejectRequest(new Error('Network Error')); });
  expect(screen.getByRole('alert')).toHaveTextContent('Could not load tasks.');
  expect(screen.queryByText('A little space to get things done')).not.toBeInTheDocument();
  click('Retry');
  await screen.findByText('Plan release');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('retains the last loaded list and counts after refresh failure', async () => {
  await renderLoaded();
  axios.get.mockRejectedValueOnce(new Error('Offline'));
  click('Refresh tasks');
  await screen.findByRole('alert');
  expect(screen.getByText('Plan release')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'All 3' })).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('last loaded data');
});

test.each([
  ['task', 'toggle'], ['task', 'delete'], ['category', 'toggle'], ['category', 'delete'],
])('keeps %s controls visually stable and locked through a %s and its silent refetch', async (kind, operation) => {
  records.categories.push({ id: 2, name: 'Personal', complete: false });
  // Jest mocks CSS imports; load the actual styles to check mutation opacity rules.
  const styles = document.createElement('style');
  styles.textContent = ['index.css', 'App.css'].map((file) => readFileSync(`${__dirname}/${file}`, 'utf8')).join('\n');
  document.head.appendChild(styles);
  try {
    await renderLoaded();
    if (kind === 'category') click('Categories 2');
    const resource = kind === 'task' ? 'tasks' : 'categories';
    const title = kind === 'task' ? 'Plan release' : 'Product';
    const otherTitle = kind === 'task' ? 'Write documentation' : 'Personal';
    const row = screen.getByText(title).closest('li');
    const otherRow = screen.getByText(otherTitle).closest('li');
    const input = screen.getByRole('textbox');
    userEvent.type(input, 'Keep this draft');
    const summary = screen.getByText(`${records[resource].length} ${resource}`);
    const originalSummary = summary.textContent;
    const refresh = screen.getByRole('button', { name: `Refresh ${resource}` });
    const method = operation === 'toggle' ? axios.patch : axios.delete;
    let finishMutation;
    let finishRefresh;
    method.mockImplementationOnce(() => new Promise((resolve) => { finishMutation = resolve; }));
    axios.get.mockImplementationOnce(() => new Promise((resolve) => { finishRefresh = resolve; }));
    const control = operation === 'toggle'
      ? within(row).getByRole('checkbox')
      : within(row).getByRole('button', { name: `Delete ${kind} “${title}”` });
    await act(async () => { fireEvent.click(control); });

    const checkPending = async () => {
      expect(screen.getByText(title).closest('li')).toBe(row);
      expect(summary).toHaveTextContent(originalSummary);
      expect(refresh).toHaveTextContent('Refresh');
      expect(refresh.querySelector('.spin')).toBeNull();
      expect(screen.queryByText('Refreshing…')).not.toBeInTheDocument();
      expect(screen.queryByText('Saving changes…')).not.toBeInTheDocument();
      expect(screen.queryByRole('status', { name: `Loading ${resource}` })).not.toBeInTheDocument();
      expect(within(row).getByText(operation === 'toggle' ? 'Updating…' : 'Deleting…')).toBeInTheDocument();
      expect(otherRow).toHaveAttribute('aria-busy', 'false');
      expect(otherRow.querySelector('.spin')).toBeNull();
      expect(input).toHaveAttribute('readonly');
      for (const element of [row, otherRow, input, refresh, ...document.querySelectorAll('.record-row button, .record-checkbox, .editor button')]) {
        expect(Number(getComputedStyle(element).opacity || 1)).toBe(1);
      }
      expect(getComputedStyle(row).animation).not.toContain('row-enter');
      expect(getComputedStyle(row).transform).toMatch(/^(none)?$/);
      for (const button of [refresh, ...document.querySelectorAll('.record-row button, .record-checkbox, .editor button')]) {
        expect(button).toBeDisabled();
      }
      await act(async () => {
        userEvent.click(control);
        userEvent.click(within(otherRow).getByRole('checkbox'));
        userEvent.click(within(otherRow).getByRole('button', { name: `Edit ${kind} “${otherTitle}”` }));
        userEvent.click(within(otherRow).getByRole('button', { name: `Delete ${kind} “${otherTitle}”` }));
        userEvent.click(refresh);
        fireEvent.submit(screen.getByRole('form'));
        userEvent.type(input, ' must not overwrite');
      });
      expect(input).toHaveValue('Keep this draft');
      expect(axios.post).not.toHaveBeenCalled();
      expect(axios.patch).toHaveBeenCalledTimes(operation === 'toggle' ? 1 : 0);
      expect(axios.delete).toHaveBeenCalledTimes(operation === 'delete' ? 1 : 0);
    };

    await checkPending();
    expect(axios.get).toHaveBeenCalledTimes(2);
    await act(async () => { finishMutation({ data: null }); });
    await checkPending();
    expect(axios.get).toHaveBeenCalledTimes(3);
    const updated = operation === 'delete'
      ? records[resource].filter((record) => record.id !== 0)
      : records[resource].map((record) => record.id === 0 ? { ...record, [kind === 'task' ? 'completed' : 'complete']: true } : record);
    await act(async () => { finishRefresh({ data: updated }); });
    expect(input).not.toHaveAttribute('readonly');
    expect(input).toHaveValue('Keep this draft');
    expect(refresh).toBeEnabled();
    expect(within(otherRow).getByRole('checkbox')).toBeEnabled();
    if (operation === 'delete') expect(row).not.toBeInTheDocument();
    else expect(within(row).getByRole('checkbox')).toBeChecked();
  } finally {
    styles.remove();
  }
});

test.each(['task', 'category'])('reports a failed silent %s refetch and keeps explicit retry feedback', async (kind) => {
  await renderLoaded();
  if (kind === 'category') click('Categories 1');
  const resource = kind === 'task' ? 'tasks' : 'categories';
  const title = kind === 'task' ? 'Plan release' : 'Product';
  const row = screen.getByText(title).closest('li');
  axios.get.mockRejectedValueOnce(new Error('Offline'));
  fireEvent.click(within(row).getByRole('checkbox'));
  await waitForSaved(`${kind === 'task' ? 'Task' : 'Category'} marked as completed.`);
  expect(screen.getByRole('alert')).toHaveTextContent(`Could not refresh ${resource}.`);
  expect(screen.getByRole('alert')).toHaveTextContent('last loaded data');
  expect(screen.getByText(title).closest('li')).toBe(row);
  expect(within(row).getByRole('checkbox')).not.toBeChecked();

  let finishRetry;
  axios.get.mockImplementationOnce(() => new Promise((resolve) => { finishRetry = resolve; }));
  click('Retry');
  expect(screen.getByText('Refreshing…')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: `Refresh ${resource}` })).toHaveTextContent('Loading');
  expect(screen.getByText(title).closest('li')).toBe(row);
  await act(async () => { finishRetry({ data: records[resource] }); });
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(within(row).getByRole('checkbox')).toBeChecked();
});

test('offers useful empty states and keyboard form submission', async () => {
  records.tasks = [];
  render(<App />);
  await screen.findByText('A little space to get things done');
  click('Add your first task');
  expect(screen.getByRole('textbox')).toHaveFocus();
  expect(screen.getByRole('button', { name: 'Add task' })).toBeDisabled();
  type('Task title', 'First step');
  fireEvent.submit(screen.getByRole('form', { name: 'New task' }));
  await waitForSaved('Task created.');
  click('Completed 0');
  expect(screen.getByText('No completed tasks yet')).toBeInTheDocument();
  click('View all tasks');
  expect(screen.getByText('First step')).toBeInTheDocument();
});

test('blocks duplicate submissions while saving and restores controls after failure', async () => {
  await renderLoaded();
  let rejectSave;
  axios.post.mockImplementationOnce(() => new Promise((resolve, reject) => { rejectSave = reject; }));
  type('Task title', 'Pending task');
  const form = screen.getByRole('form', { name: 'New task' });
  fireEvent.submit(form);
  expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Delete task “Plan release”' })).toBeDisabled();
  fireEvent.submit(form);
  expect(axios.post).toHaveBeenCalledTimes(1);
  await act(async () => { rejectSave(new Error('Offline')); });
  expect(screen.getByRole('textbox')).toHaveValue('Pending task');
  expect(screen.getByRole('button', { name: 'Add task' })).toBeEnabled();
});

test('restores keyboard focus after a toggle, including when a filtered row disappears', async () => {
  await renderLoaded();
  const checkbox = screen.getByRole('checkbox', { name: 'Mark task “Plan release” as completed' });
  checkbox.focus();
  fireEvent.click(checkbox);
  await waitForSaved('Task marked as completed.');
  expect(checkbox).toHaveFocus();
  click('Completed 2');
  fireEvent.click(screen.getByRole('checkbox', { name: 'Mark task “Plan release” as active' }));
  await waitForSaved('Task marked as active.');
  expect(screen.queryByText('Plan release')).not.toBeInTheDocument();
  expect(screen.getByRole('textbox')).toHaveFocus();
});

test.each([
  ['task', false], ['task', true], ['category', false], ['category', true],
])('keeps the %s input, caret and rows stable during continuous typing (editing: %s)', async (kind, editing) => {
  await renderLoaded();
  if (kind === 'category') click('Categories 1');
  const originalTitle = kind === 'task' ? 'Plan release' : 'Product';
  if (editing) click(`Edit ${kind} “${originalTitle}”`);

  const input = screen.getByRole('textbox');
  const form = screen.getByRole('form');
  const list = within(screen.getByRole('list'));
  const row = list.getByText(originalTitle).closest('li');
  input.focus();
  const initialValue = input.value;
  // Insert in the middle as well as appending, so caret resets are observable.
  const insertionPoint = editing ? 3 : 0;
  input.setSelectionRange(insertionPoint, insertionPoint);
  let inserted = '';
  for (const character of ' Continuous typing with spaces 123') {
    userEvent.type(input, character, { skipClick: true });
    inserted += character;
    expect(screen.getByRole('textbox')).toBe(input);
    expect(screen.getByRole('form')).toBe(form);
    expect(list.getByText(originalTitle).closest('li')).toBe(row);
    expect(input).toHaveFocus();
    expect(input).toHaveValue(initialValue.slice(0, insertionPoint) + inserted + initialValue.slice(insertionPoint));
    expect(input.selectionStart).toBe(insertionPoint + inserted.length);
    expect(input.selectionEnd).toBe(insertionPoint + inserted.length);
  }
  expect(axios.get).toHaveBeenCalledTimes(2);
  expect(axios.post).not.toHaveBeenCalled();
  expect(axios.patch).not.toHaveBeenCalled();
  expect(axios.delete).not.toHaveBeenCalled();
});

test('keeps the editor and loaded rows mounted while refreshing, including mid-typing', async () => {
  await renderLoaded();
  const input = screen.getByRole('textbox');
  const row = screen.getByText('Plan release').closest('li');
  let finishRefresh;
  axios.get.mockImplementationOnce(() => new Promise((resolve) => { finishRefresh = resolve; }));
  click('Refresh tasks');
  userEvent.type(input, 'Draft during refresh');
  expect(screen.getByText('Plan release').closest('li')).toBe(row);
  expect(screen.queryByRole('status', { name: 'Loading tasks' })).not.toBeInTheDocument();
  expect(input).toHaveFocus();

  await act(async () => { finishRefresh({ data: records.tasks.map((record) => ({ ...record })) }); });
  expect(screen.getByRole('textbox')).toBe(input);
  expect(screen.getByText('Plan release').closest('li')).toBe(row);
  expect(input).toHaveFocus();
  expect(input).toHaveValue('Draft during refresh');
  expect(axios.get).toHaveBeenCalledTimes(3);
});

test('keeps input focus during a pending keyboard save and restores it without scrolling', async () => {
  await renderLoaded();
  const input = screen.getByRole('textbox');
  let rejectSave;
  axios.post.mockImplementationOnce(() => new Promise((resolve, reject) => { rejectSave = reject; }));
  userEvent.type(input, 'Keep this draft');
  const focus = jest.spyOn(input, 'focus');
  userEvent.type(input, '{enter}');
  expect(input).toHaveFocus();
  expect(input).toHaveAttribute('readonly');
  expect(input).toBeEnabled();

  await act(async () => { rejectSave(new Error('Offline')); });
  expect(screen.getByRole('textbox')).toBe(input);
  expect(input).toHaveFocus();
  expect(input).not.toHaveAttribute('readonly');
  expect(input).toHaveValue('Keep this draft');
  expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });
  userEvent.type(input, ' and continue', { skipClick: true });
  expect(input).toHaveValue('Keep this draft and continue');
  expect(axios.post).toHaveBeenCalledTimes(1);
  expect(axios.get).toHaveBeenCalledTimes(2);
  focus.mockRestore();
});

test.each(['task', 'category'])('focuses the %s editor without scrolling on edit or cancel', async (kind) => {
  await renderLoaded();
  if (kind === 'category') click('Categories 1');
  const input = screen.getByRole('textbox');
  input.scrollIntoView = jest.fn();
  const focus = jest.spyOn(input, 'focus');
  click(`Edit ${kind} “${kind === 'task' ? 'Plan release' : 'Product'}”`);
  expect(screen.getByRole('textbox')).toBe(input);
  expect(input).toHaveFocus();
  expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });
  expect(input.scrollIntoView).not.toHaveBeenCalled();
  click('Cancel');
  expect(screen.getByRole('textbox')).toBe(input);
  expect(input).toHaveFocus();
  expect(input.scrollIntoView).not.toHaveBeenCalled();
  expect(axios.get).toHaveBeenCalledTimes(2);
  focus.mockRestore();
});

test.each(['task', 'category'])('restores the new %s draft on Escape, and supports Clear without requests', async (kind) => {
  await renderLoaded();
  if (kind === 'category') click('Categories 1');
  const title = kind === 'task' ? 'Plan release' : 'Product';
  const input = screen.getByRole('textbox');
  userEvent.type(input, 'Unfinished new item');
  click(`Edit ${kind} “${title}”`);
  expect(input).toHaveValue(title);
  userEvent.type(input, ' revised', { skipClick: true });
  const editedValue = input.value;
  click(`Edit ${kind} “${title}”`);
  expect(input).toHaveValue(editedValue);
  expect(input).toHaveFocus();
  expect(screen.getByRole('button', { name: `Edit ${kind} “${title}”` })).toHaveAttribute('aria-pressed', 'true');

  userEvent.type(input, '{esc}', { skipClick: true });
  expect(screen.getByRole('textbox')).toBe(input);
  expect(input).toHaveValue('Unfinished new item');
  expect(input).toHaveFocus();
  expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  click('Clear');
  expect(input).toHaveValue('');
  expect(input).toHaveFocus();
  expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();
  expect(axios.get).toHaveBeenCalledTimes(2);
  expect(axios.patch).not.toHaveBeenCalled();
  expect(axios.post).not.toHaveBeenCalled();
});

test.each(['task', 'category'])('saves %s edits with Enter, retains failed drafts and blocks duplicate saves or Escape while pending', async (kind) => {
  await renderLoaded();
  if (kind === 'category') click('Categories 1');
  const resource = kind === 'task' ? 'tasks' : 'categories';
  const title = kind === 'task' ? 'Plan release' : 'Product';
  click(`Edit ${kind} “${title}”`);
  const input = screen.getByRole('textbox');
  userEvent.clear(input);
  userEvent.type(input, 'Revised title');
  let rejectSave;
  axios.patch.mockImplementationOnce(() => new Promise((resolve, reject) => { rejectSave = reject; }));
  userEvent.type(input, '{enter}{enter}{esc}', { skipClick: true });
  expect(axios.patch).toHaveBeenCalledTimes(1);
  expect(input).toHaveFocus();
  expect(input).toHaveValue('Revised title');
  expect(screen.getByRole('heading', { name: `Edit ${kind}` })).toBeInTheDocument();
  await act(async () => { rejectSave({ response: { data: { detail: 'Please retry this edit.' } } }); });
  expect(screen.getByRole('alert')).toHaveTextContent('Please retry this edit.');
  expect(input).toHaveFocus();
  expect(input).toHaveValue('Revised title');
  expect(input).not.toHaveAttribute('readonly');

  userEvent.type(input, '{enter}', { skipClick: true });
  await waitForSaved(`${kind === 'task' ? 'Task' : 'Category'} updated.`);
  expect(axios.patch).toHaveBeenLastCalledWith(`${API}/${resource}/0`, kind === 'task' ? { title: 'Revised title' } : { name: 'Revised title' });
  expect(within(screen.getByRole('list')).getByText('Revised title')).toBeInTheDocument();
  expect(input).toHaveFocus();
  expect(input).toHaveValue('');
});

test('does not submit or cancel while an IME composition is active', async () => {
  await renderLoaded();
  click('Edit task “Plan release”');
  const input = screen.getByRole('textbox');
  type('Task title', '編集中');
  expect(fireEvent.keyDown(input, { key: 'Enter', isComposing: true })).toBe(false);
  fireEvent.keyDown(input, { key: 'Escape', isComposing: true });
  expect(input).toHaveValue('編集中');
  expect(screen.getByRole('heading', { name: 'Edit task' })).toBeInTheDocument();
  expect(axios.patch).not.toHaveBeenCalled();
});

test('does not steal focus if the user moves to a filter while a save is pending', async () => {
  await renderLoaded();
  let rejectSave;
  axios.post.mockImplementationOnce(() => new Promise((resolve, reject) => { rejectSave = reject; }));
  userEvent.type(screen.getByRole('textbox'), 'Keep my draft{enter}');
  const filterButton = screen.getByRole('button', { name: 'Active 2' });
  userEvent.click(filterButton);
  await act(async () => { rejectSave(new Error('Offline')); });
  expect(filterButton).toHaveFocus();
  expect(screen.getByRole('textbox')).toHaveValue('Keep my draft');
});

test('a save completing in another view preserves the current view draft and focus', async () => {
  await renderLoaded();
  let finishSave;
  axios.post.mockImplementationOnce(() => new Promise((resolve) => { finishSave = resolve; }));
  userEvent.type(screen.getByRole('textbox'), 'A task in flight{enter}');
  click('Categories 1');
  const input = screen.getByRole('textbox', { name: 'Category name' });
  userEvent.type(input, 'Category in progress');
  await act(async () => {
    records.tasks.push({ id: 9, title: 'A task in flight', completed: false });
    finishSave({ data: records.tasks[records.tasks.length - 1] });
  });
  expect(input).toHaveFocus();
  expect(input).toHaveValue('Category in progress');
  expect(screen.getByRole('heading', { level: 1, name: 'Categories' })).toBeInTheDocument();
  click('Tasks 4');
  expect(screen.getByRole('textbox')).toHaveValue('');
  expect(screen.getByText('A task in flight')).toBeInTheDocument();
});

test('reveals a newly created task when adding from the completed filter', async () => {
  await renderLoaded();
  click('Completed 1');
  userEvent.type(screen.getByRole('textbox'), 'Visible new task{enter}');
  await waitForSaved('Task created.');
  expect(screen.getByRole('button', { name: 'All 4' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText('Visible new task')).toBeInTheDocument();
});

test('keeps a pending deletion in place and restores its controls after a failure', async () => {
  await renderLoaded();
  const row = screen.getByText('Plan release').closest('li');
  const deleteButton = within(row).getByRole('button', { name: 'Delete task “Plan release”' });
  let rejectDelete;
  axios.delete.mockImplementationOnce(() => new Promise((resolve, reject) => { rejectDelete = reject; }));
  userEvent.click(deleteButton);
  expect(row).toBeInTheDocument();
  expect(row).toHaveAttribute('aria-busy', 'true');
  expect(within(row).getByText('Deleting…')).toBeInTheDocument();
  await act(async () => { rejectDelete(new Error('Offline')); });
  expect(screen.getByText('Plan release').closest('li')).toBe(row);
  expect(row).toHaveAttribute('aria-busy', 'false');
  expect(deleteButton).toBeEnabled();
  expect(deleteButton).toHaveFocus();
});

test.each([false, true])('keeps typing, filters and views free of list fades (reduced motion: %s)', async (reducedMotion) => {
  const originalAnimate = Element.prototype.animate;
  const originalMatchMedia = window.matchMedia;
  const cancel = jest.fn();
  const animate = jest.fn(() => ({ cancel }));
  Element.prototype.animate = animate;
  window.matchMedia = jest.fn(() => ({ matches: reducedMotion }));
  try {
    await renderLoaded();
    const input = screen.getByRole('textbox');
    userEvent.type(input, 'A motion-free draft');
    click('Edit task “Plan release”');
    userEvent.type(input, ' revised', { skipClick: true });
    expect(animate).not.toHaveBeenCalled();
    click('Active 2');
    expect(animate).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox')).toBe(input);
    expect(input).toHaveValue('Plan release revised');
    click('Categories 1');
    expect(animate).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox')).toBe(input);
  } finally {
    if (originalAnimate) Element.prototype.animate = originalAnimate; else delete Element.prototype.animate;
    if (originalMatchMedia) window.matchMedia = originalMatchMedia; else delete window.matchMedia;
  }
});

test('success feedback expires, but pauses while hovered or keyboard-focused', async () => {
  await renderLoaded();
  jest.useFakeTimers();
  try {
    click('Edit task “Plan release”');
    click('Save changes');
    const notice = screen.getByText('No changes to save.').closest('.notice');
    fireEvent.mouseEnter(notice.parentElement);
    act(() => { jest.advanceTimersByTime(6000); });
    expect(notice).toBeInTheDocument();
    fireEvent.mouseLeave(notice.parentElement);
    const dismiss = within(notice).getByRole('button', { name: 'Dismiss notification' });
    act(() => dismiss.focus());
    act(() => { jest.advanceTimersByTime(6000); });
    expect(dismiss).toHaveFocus();
    expect(notice).toBeInTheDocument();
    act(() => screen.getByRole('textbox').focus());
    act(() => { jest.advanceTimersByTime(5000); });
    expect(notice).not.toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveFocus();
  } finally {
    jest.useRealTimers();
  }
});

test('keyboard dismissal restores focus and does not leave later notifications paused', async () => {
  await renderLoaded();
  jest.useFakeTimers();
  try {
    click('Edit task “Plan release”');
    click('Save changes');
    const dismiss = screen.getByRole('button', { name: 'Dismiss notification' });
    act(() => dismiss.focus());
    fireEvent.click(dismiss, { detail: 0 });
    expect(screen.getByRole('textbox')).toHaveFocus();
    click('Save changes');
    expect(screen.getByText('No changes to save.')).toBeInTheDocument();
    act(() => { jest.advanceTimersByTime(5000); });
    expect(screen.queryByText('No changes to save.')).not.toBeInTheDocument();
  } finally {
    jest.useRealTimers();
  }
});

test('error feedback remains available until the user acts on it', async () => {
  await renderLoaded();
  axios.patch.mockRejectedValueOnce(new Error('Offline'));
  click('Edit task “Plan release”');
  type('Task title', 'Keep this edit');
  click('Save changes');
  const alert = await screen.findByRole('alert');
  jest.useFakeTimers();
  try {
    act(() => { jest.advanceTimersByTime(10000); });
    expect(alert).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('Keep this edit');
  } finally {
    jest.useRealTimers();
  }
});
