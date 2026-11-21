
document.addEventListener('submit', function (event) {
    const form = event.target;

    if (form.matches('form[data-confirm]')) {
        const message = form.getAttribute('data-confirm');

        if (!confirm(message)) {
            event.preventDefault();
        }
    }
});
