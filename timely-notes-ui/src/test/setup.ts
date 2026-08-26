import '@testing-library/jest-dom/vitest'

// jsdom implements <dialog> markup but not its modal methods, so NoteDialog's showModal()/close()
// would throw. Stub them to toggle the `open` attribute the way a real dialog does.
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
