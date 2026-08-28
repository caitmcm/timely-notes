import '@testing-library/jest-dom/vitest'

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
