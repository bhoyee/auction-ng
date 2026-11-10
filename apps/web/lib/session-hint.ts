// A device-local hint that a buyer was signed in here last time. The layout
// runs SESSION_HINT_SCRIPT before first paint so guest-only sections (the
// first-visit guide) do not flash for returning buyers; the session provider
// keeps the hint current once it knows the real session state.
export const SESSION_HINT_KEY = 'lotvanta-signed-in';
export const SESSION_HINT_SCRIPT = `try{if(localStorage.getItem('${SESSION_HINT_KEY}'))document.documentElement.dataset.buyerSession='signed-in'}catch(e){}`;
