// Class responsible for managing the on-screen narration panel, which displays phase labels, narrative text with a typewriter effect, and kill counts.
// It handles queuing of text to ensure that new messages wait until the current one has finished displaying, and it provides methods to show/hide the panel and reset its state.
export class Narrator {
  #panelEl = null;
  #phaseEl = null;
  #textEl = null;
  #killsEl = null;

  #CHAR_MS = 36;
  #POST_HOLD = 1600;

  #timer = null;
  #queue = [];
  #running = false;
  #holding = false;

  #history = [];
  #historyIndex = -1;
  #browsingHistory = false;
  onResume = null;

  // Constructor initializes the narrator with references to the HTML elements for the panel, phase label, text content, and kills count.
  // It sets up the initial state of the narrator.
  constructor(els) {
    this.#panelEl = els.panel;
    this.#phaseEl = els.phase;
    this.#textEl = els.text;
    this.#killsEl = els.kills;
  }

  // Method to immediately show a piece of text in the narration panel without the typewriter effect.
  // It also saves the displayed text in a history array for potential backtracking.
  goBack() {
    if (this.#history.length === 0) return;

    if (!this.#browsingHistory) {
      this.#historyIndex = this.#history.length - 1;
      this.#browsingHistory = true;
    } else if (this.#historyIndex > 0) {
      this.#historyIndex--;
    }

    const entry = this.#history[this.#historyIndex];
    this.#showImmediate(entry.text, entry.label);
  }

  // Method to go forward in the narration history if the user has previously gone back. It will show the next piece of text in the history if available.
  goForward() {
    if (!this.#browsingHistory) return;

    if (this.#historyIndex < this.#history.length - 1) {
      this.#historyIndex++;
      const entry = this.#history[this.#historyIndex];
      this.#showImmediate(entry.text, entry.label);
    } else {
      this.#browsingHistory = false;
      this.#holding = true;
      this.onResume?.();
      setTimeout(() => {
        this.#holding = false;
        this.#flush();
      }, this.#POST_HOLD);
    }
  }

  // Internal method to immediately show a piece of text in the narration panel. It clears any existing timers and sets the text and label directly.
  #showImmediate(text, label) {
    clearInterval(this.#timer);
    this.#running = false;
    this.#holding = false;

    if (label) this.#phaseEl.textContent = label;
    this.#textEl.textContent = text;
    this.show();
  }

  // Method to show the narration panel by adding a "visible" class, and a method to hide it by removing the class.
  show() {
    this.#panelEl.classList.add("visible");
  }
  hide() {
    this.#panelEl.classList.remove("visible");
  }

  // Method to set the current phase label in the narration panel. This can be used to indicate different stages or events in the scenario.
  setPhase(label) {
    if (label != null) this.#phaseEl.textContent = label;
  }

  // Method to update the kills count displayed in the narration panel. This can be called whenever the number of kills changes to keep the player informed.
  setKills(text) {
    this.#killsEl.textContent = text;
  }

  // Method to queue a new piece of text to be displayed in the narration panel.
  // If the panel is currently running or holding a message, the new text will wait until it can be displayed.
  queueText(text, label = null) {
    this.#browsingHistory = false;
    this.#queue.push({ text, label });
    this.#flush();
  }

  reset() {
    clearInterval(this.#timer);
    this.#running = false;
    this.#holding = false;
    this.#queue = [];
    this.#history = [];
    this.#historyIndex = -1;
    this.#browsingHistory = false;
    this.#textEl.textContent = "";
    this.#killsEl.textContent = "";
    this.hide();
  }

  // Internal method to flush the pending text to the narration panel. It checks if the panel is currently running or holding a message, and if not,
  // it starts displaying the new text with a typewriter effect.
  #flush() {
    if (
      this.#running ||
      this.#holding ||
      this.#queue.length === 0 ||
      this.#browsingHistory
    )
      return;
    const { text, label } = this.#queue.shift();

    this.#history.push({ text, label });
    if (this.#history.length > 20) this.#history.shift();

    if (label) this.#phaseEl.textContent = label;
    this.#textEl.textContent = "";
    this.show();

    this.#running = true;
    let i = 0;
    this.#timer = setInterval(() => {
      this.#textEl.textContent += text[i++];
      if (i >= text.length) {
        clearInterval(this.#timer);
        this.#running = false;
        this.#holding = true;
        setTimeout(() => {
          this.#holding = false;
          this.#flush();
        }, this.#POST_HOLD);
      }
    }, this.#CHAR_MS);
  }
}
