
document.addEventListener('DOMContentLoaded', () => {

    const likeButton = document.getElementById('likeButton');
    const bookmarkButton = document.getElementById('bookmarkButton');

    // LIKE / UNLIKE
    if (likeButton) {
        const postId = likeButton.dataset.postId;

        likeButton.addEventListener('click', async () => {
            likeButton.disabled = true;

            try {
                const response = await fetch(
                    `/interactions/posts/${postId}/like`,
                    { method: 'POST' }
                );

                const data = await response.json();

                if (!response.ok || !data.success) {
                    alert(data.message || 'Could not update like.');
                    return;
                }

                likeButton.classList.toggle('active', data.liked);

                document.getElementById('likeText').textContent =
                    data.liked ? 'Liked' : 'Like';

                document.getElementById('likesCount').textContent =
                    data.likesCount;

            } catch (error) {
                console.error('Like error:', error);
                alert('Something went wrong. Please try again.');
            } finally {
                likeButton.disabled = false;
            }
        });
    }

    // BOOKMARK / REMOVE BOOKMARK ON ARTICLE PAGE
    if (bookmarkButton) {
        const postId = bookmarkButton.dataset.postId;

        bookmarkButton.addEventListener('click', async () => {
            bookmarkButton.disabled = true;

            try {
                const response = await fetch(
                    `/interactions/posts/${postId}/bookmark`,
                    { method: 'POST' }
                );

                const data = await response.json();

                if (!response.ok || !data.success) {
                    alert(data.message || 'Could not update bookmark.');
                    return;
                }

                bookmarkButton.classList.toggle(
                    'active',
                    data.bookmarked
                );

                document.getElementById('bookmarkText').textContent =
                    data.bookmarked ? 'Bookmarked' : 'Bookmark';

            } catch (error) {
                console.error('Bookmark error:', error);
                alert('Something went wrong. Please try again.');
            } finally {
                bookmarkButton.disabled = false;
            }
        });
    }

    // REMOVE BOOKMARK FROM DASHBOARD
    document.addEventListener('click', async (event) => {
        const button = event.target.closest('.remove-bookmark-button');

        if (!button) return;

        const postId = button.dataset.postId;
        const originalText = button.textContent;

        button.disabled = true;
        button.textContent = 'Removing...';

        try {
            const response = await fetch(
                `/interactions/posts/${postId}/bookmark`,
                { method: 'POST' }
            );

            const data = await response.json();

            if (!response.ok || !data.success || data.bookmarked) {
                alert(data.message || 'Could not remove bookmark.');
                return;
            }

            const article = button.closest('.dashboard-post');
            const list = button.closest('.dashboard-post-list');

            article.remove();

            if (list && !list.querySelector('.dashboard-post')) {
                list.outerHTML = `
                    <div class="empty-state">
                        <h3>No bookmarked articles yet</h3>
                        <p>Articles you bookmark will appear here.</p>
                    </div>
                `;
            }

        } catch (error) {
            console.error('Remove bookmark error:', error);
            alert('Something went wrong. Please try again.');
            button.disabled = false;
            button.textContent = originalText;
        }
    });

});

document.addEventListener('submit', function (event) {
    const form = event.target;

    if (form.matches('[data-confirm-delete]')) {
        const confirmed = confirm(
            'Are you sure you want to delete this post? This action cannot be undone.'
        );

        if (!confirmed) {
            event.preventDefault();
        }
    }
});

// LIVE SEARCH SUGGESTIONS
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('liveSearchInput');
    const suggestionsBox = document.getElementById('searchSuggestions');

    if (!searchInput || !suggestionsBox) return;

    let searchTimer;

    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimer);

        const query = searchInput.value.trim();

        if (query.length < 2) {
            suggestionsBox.innerHTML = '';
            suggestionsBox.hidden = true;
            return;
        }

        searchTimer = setTimeout(async () => {
            try {
                const response = await fetch(
                    `/search-suggestions?q=${encodeURIComponent(query)}`
                );

                if (!response.ok) {
                    throw new Error('Could not fetch suggestions');
                }

                const posts = await response.json();

                suggestionsBox.innerHTML = '';

                if (posts.length === 0) {
                    suggestionsBox.innerHTML =
                        '<div class="suggestion-empty">No stories found</div>';
                } else {
                    posts.forEach(post => {
                        const link = document.createElement('a');

                        link.href = `/posts/${encodeURIComponent(post.slug)}`;
                        link.textContent = post.title;
                        link.className = 'suggestion-item';

                        suggestionsBox.appendChild(link);
                    });
                }

                suggestionsBox.hidden = false;

            } catch (error) {
                console.error('Live search error:', error);
                suggestionsBox.innerHTML = '';
                suggestionsBox.hidden = true;
            }
        }, 300);
    });

    document.addEventListener('click', (event) => {
        if (!event.target.closest('.live-search-wrapper')) {
            suggestionsBox.hidden = true;
        }
    });
});

// EXPLORE PAGE SORT
document.addEventListener('DOMContentLoaded', () => {
    const sortSelect = document.querySelector('[data-auto-submit]');

    if (sortSelect) {
        sortSelect.addEventListener('change', () => {
            sortSelect.form.submit();
        });
    }
});