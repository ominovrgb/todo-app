import axios from 'axios';

const API_BASE_URL = (process.env.REACT_APP_API_BASE_URL?.trim() || 'http://127.0.0.1:8080')
  .replace(/\/+$/, '');

export function listRecords(resource) {
  return axios.get(`${API_BASE_URL}/${resource}`);
}

export function createRecord(resource, payload) {
  return axios.post(`${API_BASE_URL}/${resource}`, payload);
}

export function updateRecord(resource, id, payload) {
  return axios.patch(`${API_BASE_URL}/${resource}/${id}`, payload);
}

export function deleteRecord(resource, id) {
  return axios.delete(`${API_BASE_URL}/${resource}/${id}`);
}
