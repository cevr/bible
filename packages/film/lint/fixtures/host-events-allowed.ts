// Fixture for film/host-events-through-adapter's `allow` (oxlint.json allows
// `popstate` here): the allowed event passes, every other is still refused.

declare const hear: () => void;

window.addEventListener('popstate', hear);
window.addEventListener('keydown', hear); // RED film/host-events-through-adapter
