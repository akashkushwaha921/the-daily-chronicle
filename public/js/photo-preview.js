
const imageInput = document.getElementById('images');
const imagePreview = document.getElementById('imagePreview');
const imageCount = document.getElementById('imageCount');

if (imageInput && imagePreview && imageCount) {

    let selectedFiles = [];
    let previewUrls = [];

    const MAX_FILES = 100;
    const MAX_SIZE = 5 * 1024 * 1024;

    const allowedTypes = [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'image/avif'
    ];

    imageInput.addEventListener('change', function () {
        const newFiles = Array.from(this.files);

        for (const file of newFiles) {

            if (!allowedTypes.includes(file.type)) {
                alert(file.name + ' is not a supported image.');
                continue;
            }

            if (file.size > MAX_SIZE) {
                alert(file.name + ' exceeds the 5 MB limit.');
                continue;
            }

            if (selectedFiles.length >= MAX_FILES) {
                alert('You can upload a maximum of 100 photos.');
                break;
            }

            selectedFiles.push(file);
        }

        updatePreview();
    });

    function updatePreview() {

        previewUrls.forEach(url => URL.revokeObjectURL(url));
        previewUrls = [];

        imagePreview.innerHTML = '';

        const dataTransfer = new DataTransfer();

        selectedFiles.forEach((file, index) => {

            dataTransfer.items.add(file);

            const card = document.createElement('div');

            card.style.width = '120px';
            card.style.position = 'relative';

            const image = document.createElement('img');

            const previewUrl = URL.createObjectURL(file);
            previewUrls.push(previewUrl);

            image.src = previewUrl;
            image.alt = 'Selected photo ' + (index + 1);

            image.style.width = '120px';
            image.style.height = '100px';
            image.style.objectFit = 'cover';
            image.style.borderRadius = '8px';

            const removeButton = document.createElement('button');

            removeButton.type = 'button';
            removeButton.textContent = 'Remove';

            removeButton.style.display = 'block';
            removeButton.style.width = '100%';
            removeButton.style.marginTop = '5px';
            removeButton.style.cursor = 'pointer';

            removeButton.addEventListener('click', function () {
                selectedFiles.splice(index, 1);
                updatePreview();
            });

            card.appendChild(image);
            card.appendChild(removeButton);

            imagePreview.appendChild(card);
        });

        imageInput.files = dataTransfer.files;

        imageCount.textContent =
            selectedFiles.length + ' / ' + MAX_FILES + ' photos selected';
    }
}
