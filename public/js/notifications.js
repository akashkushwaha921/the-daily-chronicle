
async function updateNotificationCount() {
    try {
        const response = await fetch('/notifications/unread-count');

        if (!response.ok) return;

        const data = await response.json();

        let badge = document.querySelector('.notification-count');

        if (data.count > 0) {
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'notification-count';
                document.querySelector('a[href="/notifications"]').appendChild(badge);
            }

            badge.textContent = data.count;
        } else if (badge) {
            badge.remove();
        }
    } catch (error) {
        console.error('Notification count update failed:', error);
    }
}

updateNotificationCount();
setInterval(updateNotificationCount, 10000);
