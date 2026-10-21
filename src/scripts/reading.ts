const desktopQuery = window.matchMedia('(min-width: 900px)');
const toc = document.querySelector<HTMLElement>('.toc-dock');
const tocPanel = toc?.querySelector<HTMLDetailsElement>('.toc-panel');
const causes = document.querySelector<HTMLElement>('.causes');

function syncTocMode(): void {
  if (!tocPanel) return;
  if (desktopQuery.matches) {
    tocPanel.open = true;
    document.documentElement.style.setProperty('--toc-bar', '0px');
    return;
  }
  const summary = tocPanel.querySelector('summary');
  const height = summary?.getBoundingClientRect().height ?? 0;
  if (height > 0) document.documentElement.style.setProperty('--toc-bar', `${Math.ceil(height)}px`);
  if (tocPanel.dataset.userOpen !== 'true') tocPanel.open = false;
}

function updateSpy(): void {
  if (!toc) return;
  toc.classList.toggle('is-spying', desktopQuery.matches);
  const pad = Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
  const marker = pad + 12;
  const links = [...toc.querySelectorAll<HTMLAnchorElement>('a[href^="#principle-"]')];
  let currentId = '';
  for (const link of links) {
    const heading = document.getElementById(link.hash.slice(1));
    if (heading && heading.getBoundingClientRect().top <= marker) currentId = link.hash.slice(1);
  }

  const here = toc.querySelector<HTMLElement>('[data-toc-here]');
  for (const part of toc.querySelectorAll<HTMLLIElement>('.toc-part')) {
    const partLink = part.querySelector<HTMLAnchorElement>(':scope > a');
    const partId = partLink?.hash.slice(1) ?? '';
    const subLinks = [...part.querySelectorAll<HTMLAnchorElement>(':scope > ol a')];
    const subCurrent = subLinks.find((link) => link.hash.slice(1) === currentId);
    const partIsCurrent = partId === currentId || Boolean(subCurrent);
    part.classList.toggle('is-current', partIsCurrent);

    if (partLink) {
      partLink.classList.toggle('is-current', partIsCurrent);
      if (partId === currentId) partLink.setAttribute('aria-current', 'location');
      else partLink.removeAttribute('aria-current');
    }
    for (const link of subLinks) {
      const on = link.hash.slice(1) === currentId;
      link.classList.toggle('is-current', on);
      if (on) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
    if (partIsCurrent && here) {
      const labelLink = subCurrent ?? partLink;
      const numeral = labelLink?.querySelector('.toc-num')?.textContent?.trim() ?? '';
      const title = labelLink?.querySelector('.toc-title')?.textContent?.trim() ?? '';
      here.textContent = numeral && title ? `${numeral}  ${title}` : title;
    }
  }

  const active = toc.querySelector<HTMLAnchorElement>('a[aria-current="location"]');
  if (!active || !desktopQuery.matches) return;
  const partLink = active.closest('.toc-part')?.querySelector<HTMLAnchorElement>(':scope > a');
  const topTarget = partLink ?? active;
  const box = toc.getBoundingClientRect();
  const topRect = topTarget.getBoundingClientRect();
  const bottomRect = active.getBoundingClientRect();
  if (topRect.top < box.top + 4) toc.scrollTop += topRect.top - box.top - 8;
  else if (bottomRect.bottom > box.bottom - 4) toc.scrollTop += bottomRect.bottom - box.bottom + 8;
}

function syncCauseMargin(): void {
  if (!toc) return;
  if (!causes || !desktopQuery.matches) {
    toc.classList.remove('is-yielding');
    document.documentElement.style.setProperty('--margin-toc-offset', '0px');
    return;
  }
  const rect = causes.getBoundingClientRect();
  const overlap = rect.top < window.innerHeight * 0.7 && rect.bottom > 96;
  toc.classList.toggle('is-yielding', overlap);
  const offset = overlap ? Math.ceil(toc.getBoundingClientRect().height) : 0;
  document.documentElement.style.setProperty('--margin-toc-offset', `${offset}px`);
}

let frame = 0;
function onScroll(): void {
  if (frame) return;
  frame = window.requestAnimationFrame(() => {
    frame = 0;
    syncCauseMargin();
    updateSpy();
  });
}

syncTocMode();
updateSpy();
syncCauseMargin();

desktopQuery.addEventListener('change', () => {
  syncTocMode();
  onScroll();
});
window.addEventListener('resize', () => {
  syncTocMode();
  onScroll();
});
document.addEventListener('scroll', onScroll, { passive: true });

tocPanel?.addEventListener('toggle', () => {
  if (!tocPanel || desktopQuery.matches) return;
  tocPanel.dataset.userOpen = tocPanel.open ? 'true' : '';
  syncTocMode();
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !tocPanel?.open || desktopQuery.matches) return;
  event.preventDefault();
  tocPanel.open = false;
  tocPanel.dataset.userOpen = '';
  tocPanel.querySelector<HTMLElement>('summary')?.focus({ focusVisible: true } as FocusOptions);
});

toc?.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element) || desktopQuery.matches || !tocPanel) return;
  if (!target.closest('a[href^="#"]')) return;
  tocPanel.open = false;
  tocPanel.dataset.userOpen = '';
});
