import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import axios from 'axios';

jest.mock('axios', () => ({ get: jest.fn() }));

const originalApiUrl = process.env.REACT_APP_API_BASE_URL;

afterEach(() => {
  cleanup();
  jest.resetAllMocks();
  if (originalApiUrl === undefined) delete process.env.REACT_APP_API_BASE_URL;
  else process.env.REACT_APP_API_BASE_URL = originalApiUrl;
});

test.each([
  ['unset', undefined, 'http://127.0.0.1:8080'],
  ['empty', '', 'http://127.0.0.1:8080'],
  ['whitespace', '   ', 'http://127.0.0.1:8080'],
  ['local FastAPI', 'http://127.0.0.1:8080', 'http://127.0.0.1:8080'],
  ['Docker Compose', 'http://127.0.0.1:18080', 'http://127.0.0.1:18080'],
  ['same-origin Docker proxy', '/api', '/api'],
  ['trailing slashes', ' http://127.0.0.1:18080/// ', 'http://127.0.0.1:18080'],
])('loads both collections with the %s API configuration', async (_, configured, expected) => {
  // Re-evaluate the module's build-time setting while keeping the renderer's React instance.
  jest.resetModules();
  jest.doMock('react', () => React);
  jest.doMock('axios', () => axios);
  if (configured === undefined) delete process.env.REACT_APP_API_BASE_URL;
  else process.env.REACT_APP_API_BASE_URL = configured;
  const App = require('./App').default;

  axios.get.mockImplementation(async (url) => ({ data: url.endsWith('/tasks')
    ? [{ id: 'task-1', title: 'Configured task', completed: false }]
    : [{ id: 'category-1', name: 'Configured category', complete: false }],
  }));

  render(<App />);
  await screen.findByText('Configured task');
  await screen.findByRole('button', { name: 'Categories 1' });
  expect(axios.get).toHaveBeenCalledWith(`${expected}/tasks`);
  expect(axios.get).toHaveBeenCalledWith(`${expected}/categories`);
  expect(axios.get).toHaveBeenCalledTimes(2);
});
