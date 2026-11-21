
document.addEventListener('DOMContentLoaded', () => {
    const followButton = document.getElementById('followButton');

    if (!followButton) return;

    const authorId = followButton.dataset.authorId;
    const followersCount = document.getElementById('followersCount');
    const followMessage = document.getElementById('followMessage');

    followButton.addEventListener('click', async () => {
        followButton.disabled = true;
        followMessage.textContent = '';

        try {
            const response = await fetch(`/follow/${authorId}`, {
                method: 'POST'
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                followMessage.textContent =
                    data.message || 'Could not update follow status.';
                return;
            }

            followButton.textContent =
                data.following ? 'Following' : 'Follow';

            followButton.classList.toggle(
                'following',
                data.following
            );

            followersCount.textContent = data.followersCount;

        } catch (error) {
            console.error('Follow error:', error);
            followMessage.textContent =
                'Something went wrong. Please try again.';
        } finally {
            followButton.disabled = false;
        }
    });
});
