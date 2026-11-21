
const imageInput = document.getElementById('images');
const imagePreview = document.getElementById('imagePreview');
const imageCount = document.getElementById('imageCount');

let selectedFiles = [];

const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/avif'
];

function updateImageInput() {
    const dataTransfer = new DataTransfer();

    selectedFiles.forEach(file => {
        dataTransfer.items.add(file);
    });

    imageInput.files = dataTransfer.files;

    imageCount.textContent = selectedFiles.length
        ? selectedFiles.length + ' new photo(s) selected.'
        : 'No new photos selected.';
}

function renderPreview() {
    imagePreview.innerHTML = '';

    selectedFiles.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'edit-image-item';

        const img = document.createElement('img');
        const objectUrl = URL.createObjectURL(file);

        img.src = objectUrl;
        img.alt = 'New photo preview';

        img.addEventListener('load', () => {
            URL.revokeObjectURL(objectUrl);
        });

        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'remove-new-image';
        removeButton.textContent = 'Remove';

        removeButton.addEventListener('click', () => {
            selectedFiles.splice(index, 1);
            updateImageInput();
            renderPreview();
        });

        item.appendChild(img);
        item.appendChild(removeButton);

        imagePreview.appendChild(item);
    });
}

imageInput.addEventListener('change', function () {
    const newFiles = Array.from(this.files);
    const remainingSlots = 100 - selectedFiles.length;

    if (newFiles.length > remainingSlots) {
        alert('You can upload a maximum of 100 new photos.');
    }

    newFiles.slice(0, remainingSlots).forEach(file => {
        if (!allowedTypes.includes(file.type)) {
            alert(file.name + ': This image format is not allowed.');
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            alert(file.name + ': Maximum file size is 5 MB.');
            return;
        }

        selectedFiles.push(file);
    });

    updateImageInput();
    renderPreview();
});
