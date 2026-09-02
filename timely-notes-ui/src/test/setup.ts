import '@testing-library/jest-dom/vitest'
import { installIntersectionObserver, resetIntersectionObservers } from './intersection'

// jsdom implements neither IntersectionObserver nor layout; the stub lets tests drive the
// scrolling view's growth directly.
installIntersectionObserver()

afterEach(resetIntersectionObservers)

// jsdom has <dialog> markup but not showModal()/close(); stub them to toggle `open`.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true
  }
}

if (!HTMLDialogElement.prototype.close) {
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false
  }
}
