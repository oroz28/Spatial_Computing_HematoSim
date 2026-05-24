// Simple counter setup function for demonstration purposes. It initializes a counter variable and updates the inner HTML of the provided element to display the current count. Each time the element is clicked, the counter increments by one and updates the display accordingly.
export function setupCounter(element) {
  let counter = 0;
  const setCounter = (count) => {
    counter = count;
    element.innerHTML = `Count is ${counter}`;
  };
  element.addEventListener("click", () => setCounter(counter + 1));
  setCounter(0);
}
