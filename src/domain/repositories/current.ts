import { desktopRepositories } from '../adapters/desktop';
import type { AppRepositories } from './index';

let currentRepositories: AppRepositories = desktopRepositories;

export function getRepositories() {
  return currentRepositories;
}

export function setRepositoriesForTesting(repositories: AppRepositories) {
  currentRepositories = repositories;
}

export function resetRepositories() {
  currentRepositories = desktopRepositories;
}
