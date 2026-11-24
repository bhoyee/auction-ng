// The app download bar is server-rendered. Phones that dismissed it hide it
// again before first paint, so it neither flashes nor shifts the page.
export const APP_BAR_KEY = 'giddydeal-app-bar-hidden-at';
const HIDE_MS = 14 * 24 * 60 * 60 * 1000;
export const APP_BAR_SCRIPT = `try{if(Date.now()-Number(localStorage.getItem('${APP_BAR_KEY}'))<${HIDE_MS})document.documentElement.dataset.appBar='hidden'}catch(e){}`;

export function dismissAppBar() {
  document.documentElement.dataset.appBar = 'hidden';
  try {
    localStorage.setItem(APP_BAR_KEY, String(Date.now()));
  } catch {
    /* Hidden for this visit when browser storage is unavailable. */
  }
}
