document.addEventListener('DOMContentLoaded', () => {
    const shareButton = document.getElementById('shareButton');

    if (!shareButton) return;

    shareButton.addEventListener('click', async () => {
        const shareData = {
            title: shareButton.dataset.title,
            text: shareButton.dataset.title,
            url: window.location.href
        };

        try {
            if (navigator.share) {
                await navigator.share(shareData);
            } else if (navigator.clipboard) {
                await navigator.clipboard.writeText(shareData.url);
                alert('Article link copied successfully!');
            } else {
                throw new Error('Sharing is not supported in this browser.');
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('Share error:', error);
                alert('Could not share article. Please try again.');
            }
        }
    });
});