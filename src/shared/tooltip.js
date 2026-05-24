// Class responsible for managing the hover tooltip that appears when the user moves the mouse over an element in the scene.
// It displays contextual information about the hovered object, such as its type and current state.
export class Tooltip {
  #el = null;

  constructor() {
    this.#el = document.createElement("div");
    this.#el.id = "tooltip";
    Object.assign(this.#el.style, {
      position: "fixed",
      pointerEvents: "none",
      display: "none",
      zIndex: "9998",
    });
    document.body.appendChild(this.#el);
  }

  // Shows the tooltip at the given screen coordinates with the provided text.
  show(x, y, text) {
    this.#el.innerHTML = text;
    this.#el.style.display = "block";
    const offX =
      x + 16 > window.innerWidth - 200 ? -16 - this.#el.offsetWidth : 16;
    this.#el.style.left = `${x + offX}px`;
    this.#el.style.top = `${y - 8}px`;
  }

  hide() {
    this.#el.style.display = "none";
  }

  destroy() {
    this.#el.remove();
  }
}
