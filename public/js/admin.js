
document.addEventListener('DOMContentLoaded', function () {

    const deleteForms = document.querySelectorAll('.delete-form');

    deleteForms.forEach(function (form) {

        form.addEventListener('submit', function (event) {

            const message = form.dataset.confirm;

            const confirmed = window.confirm(message);

            if (!confirmed) {
                event.preventDefault();
            }

        });

    });

});
