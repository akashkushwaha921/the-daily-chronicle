
document.addEventListener('DOMContentLoaded', () => {
    const header = document.querySelector('.site-header');
    if (!header) return;

    const menuButton = header.querySelector('.menu-toggle');
    const navigationPanel = header.querySelector('.navigation-panel');

    if (!menuButton || !navigationPanel) return;

    function openMenu() {
        navigationPanel.classList.add('is-open');
        menuButton.setAttribute('aria-expanded', 'true');
        menuButton.setAttribute('aria-label', 'Close navigation menu');
    }

    function closeMenu() {
        navigationPanel.classList.remove('is-open');
        menuButton.setAttribute('aria-expanded', 'false');
        menuButton.setAttribute('aria-label', 'Open navigation menu');
    }

    menuButton.addEventListener('click', () => {
        const isOpen = menuButton.getAttribute('aria-expanded') === 'true';

        if (isOpen) {
            closeMenu();
        } else {
            openMenu();
        }
    });

    document.addEventListener('click', (event) => {
        if (
            menuButton.getAttribute('aria-expanded') === 'true' &&
            !header.contains(event.target)
        ) {
            closeMenu();
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeMenu();
        }
    });

    navigationPanel.querySelectorAll('a').forEach((link) => {
        link.addEventListener('click', closeMenu);
    });

    window.addEventListener('resize', () => {
        if (window.innerWidth > 900) {
            closeMenu();
        }
    });
});


// Close the mobile menu when keyboard focus moves outside the navigation.
document.addEventListener('DOMContentLoaded', () => {
    const header = document.querySelector('.site-header');
    const menuButton = header?.querySelector('.menu-toggle');
    const navigationPanel = header?.querySelector('.navigation-panel');
    if (!header || !menuButton || !navigationPanel) return;

    header.addEventListener('focusout', (event) => {
        if (!header.contains(event.relatedTarget) &&
            menuButton.getAttribute('aria-expanded') === 'true') {
            navigationPanel.classList.remove('is-open');
            menuButton.setAttribute('aria-expanded', 'false');
            menuButton.setAttribute('aria-label', 'Open navigation menu');
        }
    });
});
